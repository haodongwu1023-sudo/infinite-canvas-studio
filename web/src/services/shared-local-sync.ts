import localforage from "localforage";

import { emptySharedState, reconcileSharedState, sharedStateFingerprint, type SharedState } from "@/lib/shared-local-merge";
import { subscribeLocalDataSaved } from "@/lib/local-data-events";
import { useAssetStore } from "@/stores/use-asset-store";
import { flushCanvasPersistence, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useConfigStore } from "@/stores/use-config-store";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";
import { useStudioCategoryStore } from "@/stores/use-studio-category-store";
import { usePluginStore } from "@/stores/canvas/use-plugin-store";
import { useLocalSaveStore } from "@/stores/use-local-save-store";

const endpoint = "/__canvas_local_sync";
const database = "infinite-canvas";
const stores = {
    appState: localforage.createInstance({ name: database, storeName: "app_state" }),
    factoryFilm: localforage.createInstance({ name: database, storeName: "factory_film" }),
    imageLogs: localforage.createInstance({ name: database, storeName: "image_generation_logs" }),
    videoLogs: localforage.createInstance({ name: database, storeName: "video_generation_logs" }),
    imageFiles: localforage.createInstance({ name: database, storeName: "image_files" }),
    mediaFiles: localforage.createInstance({ name: database, storeName: "media_files" }),
};
const sharedLocalStorageKeys = ["infinite-canvas:ai_config_store", "infinite-canvas:prompt_source_store_v2"];
type BlobIndex = Record<"image_files" | "media_files", Record<string, { type: string; size: number }>>;
type ServerSnapshot = { revision: number; state: SharedState; blobs: BlobIndex; savedAt?: string };
const checkpointStore = localforage.createInstance({ name: database, storeName: "shared_sync" });
let acknowledged: SharedState | undefined;
let lastRevision = 0;
let initialized = false;
let running: Promise<void> | null = null;
let pending = false;
let applying = false;

/** Run before the first render, then refresh on focus and while the app remains open. */
export async function startSharedLocalSync() {
    await Promise.all([useCanvasStore.persist.rehydrate(), useAssetStore.persist.rehydrate(), useConfigStore.persist.rehydrate(), useStudioCategoryStore.persist.rehydrate(), usePluginStore.persist.rehydrate(), usePromptSourceStore.persist.rehydrate()]);
    const checkpoint = await checkpointStore.getItem<{ revision: number; state: SharedState }>("acknowledged");
    if (checkpoint) { acknowledged = checkpoint.state; lastRevision = checkpoint.revision; initialized = true; }
    subscribeLocalDataSaved(scheduleSave);
    useAssetStore.subscribe((next, prev) => { if (next.assets !== prev.assets) scheduleSave(); });
    useCanvasStore.subscribe((next, prev) => { if (next.projects !== prev.projects || next.deletedProjects !== prev.deletedProjects) scheduleSave(); });
    useConfigStore.subscribe((next, prev) => { if (next.config !== prev.config || next.webdav !== prev.webdav) scheduleSave(); });
    usePromptSourceStore.subscribe((next, prev) => { if (next.sources !== prev.sources || next.schedule !== prev.schedule) scheduleSave(); });
    await syncNow().catch(() => undefined);
    window.setInterval(() => void syncNow().catch(() => undefined), 10_000);
    window.addEventListener("focus", () => void syncNow().catch(() => undefined));
    document.addEventListener("visibilitychange", () => {
        void flushCanvasPersistence();
        void syncNow().catch(() => undefined);
    });
    window.addEventListener("beforeunload", (event) => {
        void flushCanvasPersistence();
        if (useLocalSaveStore.getState().phase === "saving") {
            event.preventDefault();
            event.returnValue = "";
        }
    });
}

function scheduleSave() {
    if (applying) return;
    pending = true;
    useLocalSaveStore.setState({ phase: "saving", error: "" });
    queueMicrotask(() => void syncNow().catch(() => undefined));
}

export function syncNow(): Promise<void> {
    if (running) return running;
    running = (async () => {
        do { pending = false; await performSync(); } while (pending);
    })().catch((error) => {
        useLocalSaveStore.setState({ phase: "offline", error: error instanceof Error ? error.message : "本机共享保存暂不可用" });
        throw error;
    }).finally(() => { running = null; });
    return running;
}

async function performSync() {
    await flushCanvasPersistence();
    const remote = await fetchSnapshot();
    const local = await readLocalState();
    const changed = !acknowledged || sharedStateFingerprint(local) !== sharedStateFingerprint(acknowledged);
    let result = remote;
    if (!initialized || changed) {
        useLocalSaveStore.setState({ phase: "saving", error: "" });
        result = await postSnapshot(local);
    }
    const latest = await readLocalState();
    const combined = reconcileSharedState(result.state, latest, local);
    applying = true;
    try { await applyLocalState(combined); } finally { applying = false; }
    lastRevision = result.revision;
    acknowledged = result.state;
    await checkpointStore.setItem("acknowledged", { revision: lastRevision, state: acknowledged });
    initialized = true;
    await syncBlobs(result.blobs);
    if (sharedStateFingerprint(await readLocalState()) !== sharedStateFingerprint(acknowledged)) pending = true;
    if (!pending) useLocalSaveStore.setState({ phase: "saved", savedAt: result.savedAt || new Date().toISOString(), error: "" });
}

async function fetchSnapshot(): Promise<ServerSnapshot> {
    const response = await fetch(`${endpoint}/state`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Local canvas sharing: HTTP ${response.status}`);
    return response.json() as Promise<ServerSnapshot>;
}

async function postSnapshot(state: SharedState): Promise<ServerSnapshot> {
    const response = await fetch(`${endpoint}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision: lastRevision, baseState: acknowledged, state }),
    });
    if (!response.ok) throw new Error(`Saving shared canvas data: HTTP ${response.status}`);
    return response.json() as Promise<ServerSnapshot>;
}

async function readLocalState(): Promise<SharedState> {
    const [appState, factoryFilm, imageLogs, videoLogs] = await Promise.all([
        readStore(stores.appState), readStore(stores.factoryFilm), readStore(stores.imageLogs), readStore(stores.videoLogs),
    ]);
    const localStorage: Record<string, string> = {};
    for (const key of sharedLocalStorageKeys) {
        const value = window.localStorage.getItem(key);
        if (value !== null) localStorage[key] = value;
    }
    // Read live edits as well as IndexedDB, including the canvas's pending debounced save.
    const { projects, deletedProjects } = useCanvasStore.getState();
    const { assets } = useAssetStore.getState();
    const { config, webdav } = useConfigStore.getState();
    appState["infinite-canvas:canvas_store"] = JSON.stringify({ state: { projects, deletedProjects }, version: 0 });
    appState["infinite-canvas:asset_store"] = JSON.stringify({ state: { assets }, version: 0 });
    localStorage["infinite-canvas:ai_config_store"] = JSON.stringify({ state: { config, webdav }, version: 0 });
    return { ...emptySharedState(), appState: appState as Record<string, string>, factoryFilm, imageLogs, videoLogs, localStorage };
}

async function readStore(store: LocalForage): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    await store.iterate((value, key) => { result[key] = value; });
    return result;
}

async function applyLocalState(state: SharedState) {
    const changedAppState = await writeStore(stores.appState, state.appState);
    await Promise.all([
        writeStore(stores.factoryFilm, state.factoryFilm),
        writeStore(stores.imageLogs, state.imageLogs),
        writeStore(stores.videoLogs, state.videoLogs),
    ]);
    const changedLocalStorage = new Set<string>();
    for (const key of sharedLocalStorageKeys) {
        const value = state.localStorage[key];
        if (value !== undefined && sharedStateFingerprint(window.localStorage.getItem(key)) !== sharedStateFingerprint(value)) {
            window.localStorage.setItem(key, value);
            changedLocalStorage.add(key);
        }
    }
    const rehydrate: Promise<unknown>[] = [];
    if (changedAppState.has("infinite-canvas:asset_store")) rehydrate.push(Promise.resolve(useAssetStore.persist.rehydrate()));
    if (changedAppState.has("infinite-canvas:canvas_store")) rehydrate.push(Promise.resolve(useCanvasStore.persist.rehydrate()));
    if (changedAppState.has("infinite-canvas:studio-categories")) rehydrate.push(Promise.resolve(useStudioCategoryStore.persist.rehydrate()));
    if (changedAppState.has("infinite-canvas:plugin_store")) rehydrate.push(Promise.resolve(usePluginStore.persist.rehydrate()));
    if (changedLocalStorage.has("infinite-canvas:ai_config_store")) rehydrate.push(Promise.resolve(useConfigStore.persist.rehydrate()));
    if (changedLocalStorage.has("infinite-canvas:prompt_source_store_v2")) rehydrate.push(Promise.resolve(usePromptSourceStore.persist.rehydrate()));
    await Promise.all(rehydrate);
}

async function writeStore(store: LocalForage, entries: Record<string, unknown>) {
    const changed = new Set<string>();
    for (const key of await store.keys()) {
        if (!(key in entries)) {
            await store.removeItem(key);
            changed.add(key);
        }
    }
    for (const [key, value] of Object.entries(entries || {})) {
        const previous = await store.getItem(key);
        if (sharedStateFingerprint(previous) !== sharedStateFingerprint(value)) {
            await store.setItem(key, value);
            changed.add(key);
        }
    }
    return changed;
}

async function syncBlobs(index: BlobIndex) {
    let downloaded = false;
    for (const [name, store] of [["image_files", stores.imageFiles], ["media_files", stores.mediaFiles]] as const) {
        const keys = await store.keys();
        const localKeys = new Set(keys);
        const remoteKeys = index[name] || {};
        for (const key of keys) {
            if (key in remoteKeys) continue;
            const blob = await store.getItem<Blob>(key);
            if (!(blob instanceof Blob)) continue;
            useLocalSaveStore.setState({ phase: "saving" });
            const response = await fetch(blobUrl(name, key), { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
            if (!response.ok) throw new Error(`Saving shared media: HTTP ${response.status}`);
        }
        for (const [key, meta] of Object.entries(remoteKeys)) {
            if (localKeys.has(key)) continue;
            useLocalSaveStore.setState({ phase: "saving" });
            const response = await fetch(blobUrl(name, key));
            if (!response.ok) throw new Error(`媒体文件恢复失败：${response.status}`);
            const blob = await response.blob();
            await store.setItem(key, blob.type ? blob : blob.slice(0, blob.size, meta.type));
            downloaded = true;
        }
    }
    if (downloaded) {
        applying = true;
        try { await useAssetStore.persist.rehydrate(); } finally { applying = false; }
        window.dispatchEvent(new Event("canvas-shared-media-restored"));
    }
}

function blobUrl(store: string, key: string) {
    return `${endpoint}/blob?store=${encodeURIComponent(store)}&key=${encodeURIComponent(key)}`;
}
