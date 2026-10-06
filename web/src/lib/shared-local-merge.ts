/** Data copied between browser profiles through the loopback development server. */
export type SharedState = {
    appState: Record<string, string>;
    localStorage: Record<string, string>;
    factoryFilm: Record<string, unknown>;
    imageLogs: Record<string, unknown>;
    videoLogs: Record<string, unknown>;
};

export const emptySharedState = (): SharedState => ({ appState: {}, localStorage: {}, factoryFilm: {}, imageLogs: {}, videoLogs: {} });

/** Compare durable content rather than browser-specific object URLs or object-key order. */
export function sharedStateFingerprint(value: unknown): string {
    const normalize = (item: unknown): unknown => {
        if (typeof item === "string" && item.startsWith("blob:")) return "blob:<local-preview>";
        if (typeof item === "string" && item.startsWith('{"state"')) {
            try { return normalize(JSON.parse(item)); } catch { return item; }
        }
        if (Array.isArray(item)) return item.map(normalize);
        if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
        return item;
    };
    return JSON.stringify(normalize(value)) ?? "undefined";
}

/** Apply only edits made since the last acknowledged snapshot, preserving edits from other windows. */
export function reconcileSharedState(remote: SharedState, local: SharedState, base: SharedState): SharedState {
    const result = emptySharedState();
    for (const domain of Object.keys(result) as (keyof SharedState)[]) {
        const decode = (entries: Record<string, unknown>) => Object.fromEntries(Object.entries(entries).map(([key, value]) => {
            if (domain !== "appState" && domain !== "localStorage") return [key, value];
            try { return [key, JSON.parse(String(value))]; } catch { return [key, value]; }
        }));
        const merged = mergeChangedValue(decode(remote[domain]), decode(local[domain]), decode(base[domain])) as Record<string, unknown>;
        for (const [key, value] of Object.entries(merged)) {
            if (domain === "appState" || domain === "localStorage") result[domain][key] = typeof value === "string" ? value : JSON.stringify(value);
            else result[domain][key] = value;
        }
    }
    return result;
}

function mergeChangedValue(remote: unknown, local: unknown, base: unknown): unknown {
    if (sharedStateFingerprint(local) === sharedStateFingerprint(base)) return remote;
    if (sharedStateFingerprint(remote) === sharedStateFingerprint(base)) return local;
    if (local === undefined || remote === undefined) return local;
    if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(base)) {
        const identity = (item: unknown) => {
            if (item && typeof item === "object") {
                const record = item as Record<string, unknown>;
                return typeof record.id === "string" ? `id:${record.id}` : typeof record.name === "string" ? `name:${record.name}` : undefined;
            }
            return typeof item === "string" ? `value:${item}` : undefined;
        };
        if ([...local, ...remote, ...base].every((item) => identity(item) !== undefined)) {
            const keyed = (items: unknown[]) => Object.fromEntries(items.map((item) => [identity(item)!, item]));
            return Object.values(mergeChangedValue(keyed(remote), keyed(local), keyed(base)) as Record<string, unknown>);
        }
        return local;
    }
    if (isRecord(local) && isRecord(remote) && isRecord(base)) {
        const result: Record<string, unknown> = {};
        for (const key of new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(base)])) {
            const merged = mergeChangedValue(remote[key], local[key], base[key]);
            if (merged !== undefined) result[key] = merged;
        }
        return result;
    }
    return local;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type RecordWithId = { id: string; updatedAt?: string; deletedAt?: string };
type Persisted = { state: Record<string, unknown>; version?: number };

export function mergeSharedState(remote: SharedState, local: SharedState, currentRevision: boolean): SharedState {
    if (currentRevision) return structuredClone(local);
    return {
        appState: mergeStringStores(remote.appState, local.appState, mergeAppStateEntry),
        localStorage: mergeStringStores(remote.localStorage, local.localStorage, mergeLocalStorageEntry),
        factoryFilm: mergeValueStores(remote.factoryFilm, local.factoryFilm, mergeFactoryFilmEntry),
        imageLogs: { ...remote.imageLogs, ...local.imageLogs },
        videoLogs: { ...remote.videoLogs, ...local.videoLogs },
    };
}

function mergeStringStores(remote: Record<string, string>, local: Record<string, string>, merge: (key: string, a: string, b: string) => string) {
    const result = { ...remote };
    for (const [key, value] of Object.entries(local)) result[key] = key in result ? merge(key, result[key], value) : value;
    return result;
}

function mergeValueStores(remote: Record<string, unknown>, local: Record<string, unknown>, merge: (key: string, a: unknown, b: unknown) => unknown) {
    const result = { ...remote };
    for (const [key, value] of Object.entries(local)) result[key] = key in result ? merge(key, result[key], value) : value;
    return result;
}

function parsePersisted(value: string): Persisted | null {
    try {
        const parsed = JSON.parse(value) as Persisted;
        return parsed && typeof parsed === "object" && parsed.state && typeof parsed.state === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function mergeAppStateEntry(key: string, remote: string, local: string): string {
    const a = parsePersisted(remote);
    const b = parsePersisted(local);
    if (!a || !b) return remote || local;
    if (key === "infinite-canvas:asset_store") {
        return JSON.stringify({ ...a, state: { ...a.state, assets: mergeById(asArray(a.state.assets), asArray(b.state.assets)) } });
    }
    if (key === "infinite-canvas:canvas_store") {
        const deletedProjects = mergeById(asArray(a.state.deletedProjects), asArray(b.state.deletedProjects), "deletedAt");
        const deleted = new Map(deletedProjects.map((item) => [item.id, item.deletedAt || ""]));
        const projects = mergeById(asArray(a.state.projects), asArray(b.state.projects)).filter((item) => !deleted.has(item.id) || (item.updatedAt || "") > deleted.get(item.id)!);
        return JSON.stringify({ ...a, state: { ...a.state, projects, deletedProjects } });
    }
    if (key === "infinite-canvas:studio-categories") {
        const aCategories = asObject(a.state.categories);
        const bCategories = asObject(b.state.categories);
        const categories: Record<string, string[]> = {};
        for (const category of new Set([...Object.keys(aCategories), ...Object.keys(bCategories)])) {
            categories[category] = [...new Set([...asStrings(aCategories[category]), ...asStrings(bCategories[category])])];
        }
        return JSON.stringify({ ...a, state: { ...a.state, categories } });
    }
    return JSON.stringify(richness(b.state) > richness(a.state) ? b : a);
}

function mergeLocalStorageEntry(key: string, remote: string, local: string): string {
    const a = parsePersisted(remote);
    const b = parsePersisted(local);
    if (!a || !b) return remote || local;
    if (key === "infinite-canvas:ai_config_store") {
        const aConfig = asObject(a.state.config);
        const bConfig = asObject(b.state.config);
        const richer = richness(bConfig) > richness(aConfig) ? b : a;
        const baseConfig = asObject(richer.state.config);
        const channels = mergeChannels(asArray(aConfig.channels), asArray(bConfig.channels));
        return JSON.stringify({ ...richer, state: { ...richer.state, config: { ...baseConfig, channels } } });
    }
    if (key === "infinite-canvas:prompt_source_store_v2") {
        return JSON.stringify({ ...a, state: { ...a.state, sources: mergeById(asArray(a.state.sources), asArray(b.state.sources)) } });
    }
    return JSON.stringify(richness(b.state) > richness(a.state) ? b : a);
}

function mergeFactoryFilmEntry(_key: string, remote: unknown, local: unknown): unknown {
    const a = asObject(remote);
    const b = asObject(local);
    return {
        ...a,
        sources: mergeById(asArray(a.sources), asArray(b.sources)),
        styleProfiles: mergeById(asArray(a.styleProfiles), asArray(b.styleProfiles)),
        shotCards: mergeById(asArray(a.shotCards), asArray(b.shotCards)),
    };
}

function mergeChannels(remote: RecordWithId[], local: RecordWithId[]) {
    const byId = new Map<string, Record<string, unknown>>();
    for (const channel of [...remote, ...local]) {
        const value = asObject(channel);
        const previous = byId.get(channel.id);
        if (!previous) {
            byId.set(channel.id, value);
            continue;
        }
        const primary = richness(value) > richness(previous) ? value : previous;
        const secondary = primary === value ? previous : value;
        byId.set(channel.id, {
            ...secondary,
            ...primary,
            apiKey: String(primary.apiKey || secondary.apiKey || ""),
            models: mergeModels(asArray(secondary.models), asArray(primary.models)),
        });
    }
    return [...byId.values()];
}

function mergeModels(remote: RecordWithId[], local: RecordWithId[]) {
    const byName = new Map<string, Record<string, unknown>>();
    for (const model of [...remote, ...local]) {
        const value = asObject(model);
        const name = String(value.name || "");
        const previous = byName.get(name);
        if (!previous) byName.set(name, value);
        else {
            const merged = { ...previous, ...value };
            const script = value.script || previous.script;
            if (script) merged.script = String(script);
            else delete merged.script;
            byName.set(name, merged);
        }
    }
    return [...byName.values()];
}

function mergeById<T extends RecordWithId>(remote: T[], local: T[], timestamp: "updatedAt" | "deletedAt" = "updatedAt"): T[] {
    const byId = new Map(remote.filter((item) => item?.id).map((item) => [item.id, item]));
    for (const item of local) {
        if (!item?.id) continue;
        const previous = byId.get(item.id);
        if (!previous || (item[timestamp] || "") > (previous[timestamp] || "")) byId.set(item.id, item);
    }
    return [...byId.values()];
}

function richness(value: unknown): number {
    if (typeof value === "string") return value.trim() ? 1 : 0;
    if (Array.isArray(value)) return value.reduce((total: number, item) => total + richness(item), 0);
    if (!value || typeof value !== "object") return 0;
    return Object.values(value).reduce((total: number, item) => total + richness(item), 0);
}

function asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray<T extends RecordWithId>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
}

function asStrings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
