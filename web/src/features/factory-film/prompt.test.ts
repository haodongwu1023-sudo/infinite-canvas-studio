import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShotPrompt } from "./prompt";
import type { ShotCard, StyleProfile } from "./types";

const card: ShotCard = {
    id: "shot-1", sourceId: "source-1", startSec: 12, endSec: 16, title: "设备推进", sceneCategory: "车间", subject: "机床",
    shotSize: "中景", cameraAngle: "低机位", cameraMove: "缓慢推进", lighting: "侧逆光", purpose: "展示生产能力",
    inputRequirement: "机床正面清晰照片", method: "image-to-video", promptTemplate: "让镜头缓慢靠近{subject}。", negativePrompt: "设备形状变化",
    risks: "运动部件容易错位", status: "approved",
};
const style: StyleProfile = {
    id: "style-1", name: "冷色精密", palette: "冷灰蓝", lighting: "柔和侧光", camera: "克制的运动", pacing: "缓慢", sound: "机械环境声", status: "approved",
};

test("requires customer photo and reports what must be reshot", () => {
    const result = buildShotPrompt(card, style, { description: "", visibleFacts: [], missingRequirements: ["机床正面清晰照片"] });
    assert.equal(result.prompt, undefined);
    assert.ok(result.reshootAdvice.includes("机床正面清晰照片"));
});

test("grounds the shot in the customer's observed photo and excludes reference footage as factual input", () => {
    const result = buildShotPrompt(card, style, { description: "客户车间内的蓝色机床", visibleFacts: ["蓝色外壳", "右侧黄色警示标"] });
    assert.deepEqual(result.reshootAdvice, []);
    assert.match(result.prompt!, /蓝色外壳/);
    assert.match(result.prompt!, /缓慢推进/);
    assert.match(result.prompt!, /冷灰蓝/);
    assert.match(result.prompt!, /参考片画面不得作为客户工厂事实/);
    assert.match(result.prompt!, /不得新增设备、工序、标识或产品参数/);
});
