import { test } from "node:test";
import assert from "node:assert/strict";
import { createFactoryFilmTransfer } from "./transfer";
import type { FactoryFilmLibrary } from "./types";

const library: FactoryFilmLibrary = {
    sources: [{ id: "source", title: "工厂", fileName: "factory.mp4", sourceUrl: "https://example.com", sourceType: "finished", durationSec: 30, rightsNote: "内部研究" }],
    styleProfiles: [],
    shotCards: [{ id: "shot", sourceId: "source", startSec: 1, endSec: 3, keyframeStorageKey: "image:frame", title: "推进", sceneCategory: "车间", subject: "设备", shotSize: "中景", cameraAngle: "平视", cameraMove: "推进", lighting: "顶光", purpose: "展示", inputRequirement: "设备照片", method: "image-to-video", promptTemplate: "推进", negativePrompt: "变形", risks: "失真", status: "approved" }],
};

test("backs up the JSON library and keyframe, then restores both", async () => {
    let current = library;
    const images = new Map([["image:frame", new Blob(["frame-content"], { type: "image/png" })]]);
    const transfer = createFactoryFilmTransfer({
        getLibrary: async () => current,
        replaceLibrary: async (value) => { current = value; },
        getImageBlob: async (key) => images.get(key) ?? null,
        setImageBlob: async (key, blob) => { images.set(key, blob); },
    });
    const backup = await transfer.exportFactoryFilmPackage();
    current = { sources: [], styleProfiles: [], shotCards: [] };
    images.clear();
    const restored = await transfer.importFactoryFilmPackage(backup);
    assert.equal(restored.shotCards[0].keyframeStorageKey, "image:frame");
    assert.equal(await images.get("image:frame")?.text(), "frame-content");
    assert.deepEqual(current, library);
});

test("refuses a backup when its referenced keyframe is missing", async () => {
    const transfer = createFactoryFilmTransfer({
        getLibrary: async () => library,
        replaceLibrary: async () => {},
        getImageBlob: async () => null,
        setImageBlob: async () => {},
    });
    await assert.rejects(transfer.exportFactoryFilmPackage(), /关键帧/);
});
