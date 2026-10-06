import { test } from "node:test";
import assert from "node:assert/strict";
import { createFactoryFilmStore } from "./store";
import type { ShotCard } from "./types";

const card: ShotCard = {
    id: "shot-1", sourceId: "source-1", startSec: 1, endSec: 4, title: "全景", sceneCategory: "车间", subject: "生产线",
    shotSize: "全景", cameraAngle: "平视", cameraMove: "推进", lighting: "顶光", purpose: "展示规模", inputRequirement: "正面照片",
    method: "image-to-video", promptTemplate: "缓慢推进", negativePrompt: "结构变化", risks: "结构失真", status: "draft",
};

test("persists CRUD and only exposes approved cards for reuse", async () => {
    const map = new Map<string, unknown>();
    const adapter = {
        getItem: async <T>(key: string) => (map.get(key) as T) ?? null,
        setItem: async <T>(key: string, value: T) => { map.set(key, value); return value; },
    };
    const store = createFactoryFilmStore(adapter);
    await store.saveShotCard(card);
    assert.deepEqual(await store.listApprovedShotCards(), []);
    await store.saveShotCard({ ...card, status: "approved" });
    assert.deepEqual((await createFactoryFilmStore(adapter).listApprovedShotCards()).map((item) => item.id), [card.id]);
    await store.deleteShotCard(card.id);
    assert.deepEqual((await store.getLibrary()).shotCards, []);
});
