import { saveAs } from "file-saver";

import { createZip, readZip } from "@/lib/zip";
import { collectMediaStorageKeys, getMediaBlob, setMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import { getImageBlob, setImageBlob, resolveImageUrl } from "@/services/image-storage";
import { hydrateStudioAsset } from "@/features/studio-library/media";
import { isStudioRecord, STUDIO_KINDS } from "@/features/studio-library/model";
import type { Asset } from "@/stores/use-asset-store";
import type { StudioCategories } from "@/stores/use-studio-category-store";

type AssetExportFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    assets: Asset[];
    files: AssetExportItem[];
    studioCategories?: StudioCategories;
};

type AssetExportItem = {
    storageKey: string;
    path: string;
    mimeType: string;
    bytes: number;
};

export async function exportAssets(assets: Asset[], filename: string, studioCategories?: StudioCategories) {
    const files: AssetExportItem[] = [];
    const zipFiles: { name: string; data: BlobPart }[] = [];

    await Promise.all(
        [...collectMediaStorageKeys(assets)].map(async (storageKey) => {
            const kind = storageKey.startsWith("image:") ? "image" : "video";
            const blob = kind === "image" ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (!blob) throw new Error("素材文件缺失，请重新上传后再导出");
            const path = `files/${safeFileName(storageKey)}.${fileExtension(blob.type, kind)}`;
            files.push({ storageKey, path, mimeType: blob.type, bytes: blob.size });
            zipFiles.push({ name: path, data: blob });
        }),
    );

    const data: AssetExportFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), assets, files, ...(studioCategories ? { studioCategories } : {}) };
    const zip = await createZip([{ name: "assets.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, filename);
}

export async function readAssetPackage(file: File) {
    return (await readStudioAssetPackage(file)).assets;
}

export async function readStudioAssetPackage(file: File) {
    const zip = await readZip(file);
    const assetFile = zip.get("assets.json");
    if (!assetFile) throw new Error("missing assets.json");
    const data = JSON.parse(await assetFile.text()) as AssetExportFile;
    if (!data || data.app !== "infinite-canvas" || data.version !== 1 || !Array.isArray(data.assets) || !Array.isArray(data.files)) throw new Error("不是受支持的素材包");
    const categories = data.studioCategories ?? {};
    if (
        data.studioCategories !== undefined &&
        (!data.studioCategories ||
            typeof categories !== "object" ||
            Array.isArray(categories) ||
            Object.entries(categories).some(([kind, names]) => !STUDIO_KINDS.includes(kind as (typeof STUDIO_KINDS)[number]) || !Array.isArray(names) || names.some((name) => typeof name !== "string" || !name.trim())))
    )
        throw new Error("素材包分类格式不正确");
    for (const asset of data.assets) {
        if (!asset || typeof asset.id !== "string" || typeof asset.title !== "string" || !["text", "image", "video"].includes(asset.kind) || !asset.data || !Array.isArray(asset.tags)) throw new Error("素材包内容不完整");
        if (asset.metadata?.studio && !isStudioRecord(asset.metadata.studio)) throw new Error("创作卡格式不正确");
    }
    for (const item of data.files) if (!item || typeof item.storageKey !== "string" || typeof item.mimeType !== "string" || !zip.has(item.path)) throw new Error("素材包缺少媒体文件");
    const included = new Set(data.files.map((item) => item.storageKey));
    for (const key of collectMediaStorageKeys(data.assets)) if (!included.has(key)) throw new Error("素材包缺少被引用的图片或声音");
    await Promise.all(
        data.files.map(async (item) => {
            const blob = zip.get(item.path);
            if (!blob) return;
            const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
            await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
        }),
    );
    const assets = await Promise.all(
        data.assets.map(async (asset) => {
            if (asset.metadata?.studio) return hydrateStudioAsset(asset);
            if (asset.kind === "image" && asset.data.storageKey) {
                const dataUrl = await resolveImageUrl(asset.data.storageKey);
                return { ...asset, coverUrl: dataUrl, data: { ...asset.data, dataUrl } };
            }
            if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey) } };
            return asset;
        }),
    );
    return { assets, categories: Object.fromEntries(Object.entries(categories).map(([kind, names]) => [kind, Array.from(new Set(names.map((name) => name.trim())))])) as StudioCategories };
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, kind: Asset["kind"]) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    return kind === "image" ? "png" : "bin";
}
