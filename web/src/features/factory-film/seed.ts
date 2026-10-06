import { uploadImage } from "@/services/image-storage";
import { factoryFilmStore } from "./store";
import type { FactoryFilmLibrary } from "./types";
import seedCandidates from "./seed-candidates.json";

let seeding: Promise<void> | undefined;

export function ensureFactoryFilmSeed() {
    if (!seeding) seeding = seedOnce().catch((error) => { seeding = undefined; throw error; });
    return seeding;
}

async function seedOnce() {
    const existing = await factoryFilmStore.getLibrary();
    if (existing.sources.length || existing.shotCards.length || existing.styleProfiles.length) return;
    const seed = seedCandidates as FactoryFilmLibrary;
    const shotCards = [];
    for (const card of seed.shotCards) {
        if (!card.keyframeStorageKey) { shotCards.push(card); continue; }
        const path = `${import.meta.env.BASE_URL}${card.keyframeStorageKey.replace(/^\//, "")}`;
        const response = await fetch(path);
        if (!response.ok) throw new Error(`初始关键帧读取失败：${path}`);
        const image = await uploadImage(await response.blob());
        shotCards.push({ ...card, keyframeStorageKey: image.storageKey });
    }
    await factoryFilmStore.replaceLibrary({ ...seed, shotCards });
}
