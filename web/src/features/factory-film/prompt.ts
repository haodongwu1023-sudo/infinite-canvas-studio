import type { ShotCard, StyleProfile } from "./types";

export type CustomerPhotoObservation = {
    description: string;
    visibleFacts: string[];
    missingRequirements?: string[];
};

export type ShotPromptResult = { prompt?: string; reshootAdvice: string[] };

export function buildShotPrompt(card: ShotCard, style: StyleProfile | undefined, observation: CustomerPhotoObservation): ShotPromptResult {
    const reshootAdvice = observation.missingRequirements?.map((item) => item.trim()).filter(Boolean) ?? [];
    if (!observation.description.trim()) reshootAdvice.unshift(card.inputRequirement || "请提供真实工厂照片");
    if (reshootAdvice.length) return { reshootAdvice: [...new Set(reshootAdvice)] };

    const template = card.promptTemplate.trim().replaceAll("{subject}", observation.description.trim()).replaceAll("{scene}", card.sceneCategory);
    const prompt = [
        `以客户提供的真实照片为唯一场景和物体依据：${observation.description.trim()}。`,
        observation.visibleFacts.length ? `照片中确实可见：${observation.visibleFacts.filter(Boolean).join("、")}。` : "",
        `镜头：${card.shotSize}，${card.cameraAngle}，${card.cameraMove}。用途：${card.purpose}。`,
        style ? `风格仅借鉴参考片的摄影表达：色彩${style.palette}；光线${style.lighting}；运镜${style.camera}；节奏${style.pacing}。` : "",
        card.lighting ? `本镜头光线：${card.lighting}。` : "",
        template,
        `保持原照片中的布局、设备形状、产品外观、标识和工序关系。参考片画面不得作为客户工厂事实；不得新增设备、工序、标识或产品参数。`,
        card.negativePrompt ? `避免：${card.negativePrompt}。` : "",
    ].filter(Boolean).join("\n");
    return { prompt, reshootAdvice: [] };
}
