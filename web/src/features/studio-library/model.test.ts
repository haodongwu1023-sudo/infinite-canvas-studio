import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Native Node test runner requires an explicit TypeScript extension.
import { createStudioRecord, moveFrame, resizeStoryboard, studioContent, isStudioRecord, buildStudioFlow } from "./model.ts";

test("缩小再展开故事板不会丢失镜头内容", () => {
    const board = resizeStoryboard(createStudioRecord("storyboard"), 9);
    board.frames[8].prompt = "车间全景缓慢推进";
    const small = resizeStoryboard(board, 4);
    assert.equal(small.gridSize, 4);
    assert.equal(resizeStoryboard(small, 9).frames[8].prompt, "车间全景缓慢推进");
    assert.equal(board.gridSize, 9);
});

test("拖动分镜使用稳定 ID 且不修改原数组", () => {
    const board = createStudioRecord("storyboard");
    const before = board.frames.map((f) => f.id);
    const moved = moveFrame(board.frames, before[0], before[2]);
    assert.deepEqual(
        moved.map((f) => f.id),
        [before[1], before[2], before[0], before[3]],
    );
    assert.deepEqual(
        board.frames.map((f) => f.id),
        before,
    );
    assert.deepEqual(moveFrame(board.frames, "missing", before[0]), board.frames);
});

test("人物设定作为完整可复用文本保存", () => {
    const record = createStudioRecord("persona");
    record.description = "工厂技术负责人";
    record.appearance = "短发";
    record.clothing = "蓝色工作服";
    assert.match(studioContent(record), /工厂技术负责人/);
    assert.match(studioContent(record), /蓝色工作服/);
});

test("导入时拒绝不完整或异常的创作卡", () => {
    assert.equal(isStudioRecord(null), false);
    assert.equal(isStudioRecord({ kind: "storyboard", frames: "bad" }), false);
    assert.equal(isStudioRecord(createStudioRecord("character")), true);
    const board = createStudioRecord("storyboard");
    assert.equal(isStudioRecord({ ...board, frames: [{ id: "x", seconds: -1 }] }), false);
});

test("故事板按落点建立可生成图片及视频的连线且不改变输入", () => {
    const board = createStudioRecord("storyboard");
    board.frames[0].prompt = "缓慢推进";
    const flow = buildStudioFlow("工厂故事板", board, { x: 730, y: -90 });
    assert.equal(flow.nodes[0].position.x, 730);
    assert.equal(flow.nodes.filter((n) => n.type === "video").length, 4);
    assert.equal(flow.nodes.filter((n) => n.type === "image").length, 4);
    const video = flow.nodes.find((n) => n.type === "video")!;
    assert.equal(video.metadata?.prompt, "缓慢推进");
    assert.equal(video.metadata?.size, "16:9");
    assert.equal(flow.connections.filter((c) => c.toNodeId === video.id).length, 2);
    assert.equal(board.frames.length, 4);
});

test("人物图片与声音都成为可用节点", () => {
    const record = createStudioRecord("character");
    record.media = [
        { id: "p", name: "照片", kind: "image", url: "blob:photo", storageKey: "image:one", mimeType: "image/png" },
        { id: "v", name: "声音", kind: "audio", url: "blob:audio", storageKey: "audio:one", mimeType: "audio/wav" },
    ];
    const flow = buildStudioFlow("工程师", record, { x: 0, y: 0 });
    assert.ok(flow.nodes.some((n) => n.type === "audio" && n.metadata?.storageKey === "audio:one"));
    assert.ok(flow.nodes.some((n) => n.type === "image" && n.metadata?.storageKey === "image:one"));
});

test("分镜参考图先进入空白生图节点，再由生成画面连接到视频", () => {
    const board = createStudioRecord("storyboard");
    board.frames[0].image = { id: "ref", name: "参考", kind: "image", url: "blob:ref", storageKey: "image:ref", mimeType: "image/png" };
    const flow = buildStudioFlow("参考分镜", board, { x: 0, y: 0 });
    const reference = flow.nodes.find((n) => n.metadata?.storageKey === "image:ref")!;
    const output = flow.nodes.find((n) => n.type === "image" && !n.metadata?.content)!;
    const video = flow.nodes.find((n) => n.type === "video")!;
    assert.ok(reference);
    assert.ok(flow.connections.some((c) => c.fromNodeId === reference.id && c.toNodeId === output.id));
    assert.ok(flow.connections.some((c) => c.fromNodeId === output.id && c.toNodeId === video.id));
    assert.equal(
        flow.connections.some((c) => c.fromNodeId === reference.id && c.toNodeId === video.id),
        false,
    );
});
