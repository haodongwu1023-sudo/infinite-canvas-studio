import { createZip, readZip } from "../../lib/zip";
import { factoryFilmStore } from "./store";
import type { FactoryFilmLibrary } from "./types";

type FrameFile = { storageKey: string; path: string; mimeType: string };
type PackageManifest = { app: "infinite-canvas-factory-film"; version: 1; library: FactoryFilmLibrary; frames: FrameFile[] };

type TransferDependencies = {
    getLibrary: () => Promise<FactoryFilmLibrary>;
    replaceLibrary: (library: FactoryFilmLibrary) => Promise<unknown>;
    getImageBlob: (storageKey: string) => Promise<Blob | null | undefined>;
    setImageBlob: (storageKey: string, blob: Blob) => Promise<unknown>;
};

export function createFactoryFilmTransfer(dependencies: TransferDependencies) {
    return {
        async exportFactoryFilmPackage(library?: FactoryFilmLibrary) {
            const data = library ?? await dependencies.getLibrary();
            const frames: FrameFile[] = [];
            const files: { name: string; data: BlobPart }[] = [];
            const keys = [...new Set(data.shotCards.map((card) => card.keyframeStorageKey).filter((key): key is string => !!key))];
            for (const [index, storageKey] of keys.entries()) {
                const blob = await dependencies.getImageBlob(storageKey);
                if (!blob) throw new Error(`关键帧缺失：${storageKey}`);
                const path = `frames/${index}`;
                frames.push({ storageKey, path, mimeType: blob.type || "image/png" });
                files.push({ name: path, data: blob });
            }
            const manifest: PackageManifest = { app: "infinite-canvas-factory-film", version: 1, library: data, frames };
            return createZip([{ name: "factory-film.json", data: JSON.stringify(manifest, null, 2) }, ...files]);
        },
        async importFactoryFilmPackage(blob: Blob) {
            const zip = await readZip(blob);
            const manifestFile = zip.get("factory-film.json");
            if (!manifestFile) throw new Error("资产包缺少 factory-film.json");
            const manifest = JSON.parse(await manifestFile.text()) as PackageManifest;
            if (manifest.app !== "infinite-canvas-factory-film" || manifest.version !== 1 || !isLibrary(manifest.library) || !Array.isArray(manifest.frames)) {
                throw new Error("工厂镜头资产包格式错误");
            }
            const frameBlobs = manifest.frames.map((frame) => {
                if (!frame || typeof frame.storageKey !== "string" || !frame.storageKey.startsWith("image:") || typeof frame.path !== "string") throw new Error("关键帧记录错误");
                const frameBlob = zip.get(frame.path);
                if (!frameBlob) throw new Error(`关键帧缺失：${frame.storageKey}`);
                return { storageKey: frame.storageKey, blob: frameBlob.slice(0, frameBlob.size, frame.mimeType || "image/png") };
            });
            const frameKeys = new Set(frameBlobs.map((frame) => frame.storageKey));
            for (const card of manifest.library.shotCards) {
                if (card.keyframeStorageKey && !frameKeys.has(card.keyframeStorageKey)) throw new Error(`关键帧缺失：${card.keyframeStorageKey}`);
            }
            for (const frame of frameBlobs) await dependencies.setImageBlob(frame.storageKey, frame.blob);
            await dependencies.replaceLibrary(manifest.library);
            return manifest.library;
        },
    };
}

function isLibrary(value: unknown): value is FactoryFilmLibrary {
    if (!value || typeof value !== "object") return false;
    const data = value as FactoryFilmLibrary;
    return Array.isArray(data.sources) && Array.isArray(data.styleProfiles) && Array.isArray(data.shotCards);
}

const defaultTransfer = createFactoryFilmTransfer({
    getLibrary: factoryFilmStore.getLibrary,
    replaceLibrary: factoryFilmStore.replaceLibrary,
    getImageBlob: async (key) => (await import("../../services/image-storage")).getImageBlob(key),
    setImageBlob: async (key, blob) => (await import("../../services/image-storage")).setImageBlob(key, blob),
});

export const exportFactoryFilmPackage = defaultTransfer.exportFactoryFilmPackage;
export const importFactoryFilmPackage = defaultTransfer.importFactoryFilmPackage;
