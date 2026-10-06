import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { getStudioRecord, type StudioMedia, type StudioRecord } from "./model";
import type { Asset } from "@/stores/use-asset-store";

export async function uploadStudioMedia(file: File): Promise<StudioMedia> {
    if (!file.type.startsWith("image/") && !file.type.startsWith("audio/")) throw new Error("请选择图片或声音文件");
    const kind = file.type.startsWith("image/") ? "image" : "audio";
    const media = kind === "image" ? await uploadImage(file) : await uploadMediaFile(file, "audio");
    return { ...media, id: crypto.randomUUID(), name: file.name, kind, storageKey: media.storageKey! };
}

export async function hydrateStudioRecord(record: StudioRecord): Promise<StudioRecord> {
    const hydrate = async (m: StudioMedia) => ({ ...m, url: await (m.kind === "image" ? resolveImageUrl(m.storageKey, m.url) : resolveMediaUrl(m.storageKey, m.url)) });
    return { ...record, media: await Promise.all(record.media.map(hydrate)), frames: await Promise.all(record.frames.map(async (f) => ({ ...f, image: f.image ? await hydrate(f.image) : undefined }))) };
}

export async function hydrateStudioAsset(asset: Asset): Promise<Asset> {
    const record = getStudioRecord(asset);
    if (!record) return asset;
    const studio = await hydrateStudioRecord(record);
    return { ...asset, coverUrl: studio.media.find((m) => m.kind === "image")?.url || studio.frames.find((f) => f.image)?.image?.url || "", metadata: { ...asset.metadata, studio } };
}
