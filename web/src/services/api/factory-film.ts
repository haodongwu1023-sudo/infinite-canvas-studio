import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { CandidateFrame } from "@/features/factory-film/video-frames";

export type FrameDraft = { timeSec: number; title: string; scene: string; camera: string; lighting: string; useCase: string; cautions: string };
export type PhotoMatch = { description: string; visibleFacts: string[]; recommendedIds: string[]; missingRequirements: string[] };

export function parseJsonObject(text: string): Record<string, unknown> {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 未返回可解析的分析结果，可手动建卡或重试。");
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function strings(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function analyzeReferenceFrames(config: AiConfig, frames: CandidateFrame[], onProgress?: (count: number) => void): Promise<FrameDraft[]> {
    const drafts: FrameDraft[] = [];
    for (let offset = 0; offset < frames.length; offset += 5) {
        const batch = frames.slice(offset, offset + 5);
        const content: Extract<AiTextMessage["content"], unknown[]> = [
            { type: "text", text: `你是工厂宣传片拉片员。以下是同一参考片的 ${batch.length} 张候选帧，时间码依次为 ${batch.map((frame) => frame.timeSec.toFixed(1) + "秒").join("、")}。只记录画面可见事实，不推断设备型号、工艺参数、产品性能或整片节奏。每帧给出通用可迁移的拍摄方法。只返回 JSON: {"frames":[{"index":0,"title":"","scene":"","camera":"","lighting":"","useCase":"","cautions":""}]}。index 从0开始。` },
            ...batch.map((frame) => ({ type: "image_url" as const, image_url: { url: frame.dataUrl } })),
        ];
        const raw = await requestImageQuestion(config, [{ role: "user", content }], () => undefined);
        const parsed = parseJsonObject(raw);
        const rows = Array.isArray(parsed.frames) ? parsed.frames : [];
        rows.forEach((row) => {
            if (!row || typeof row !== "object") return;
            const item = row as Record<string, unknown>;
            const index = Number(item.index);
            if (!Number.isInteger(index) || index < 0 || index >= batch.length) return;
            drafts.push({
                timeSec: batch[index].timeSec,
                title: String(item.title || "待审核镜头"),
                scene: String(item.scene || ""),
                camera: String(item.camera || ""),
                lighting: String(item.lighting || ""),
                useCase: String(item.useCase || ""),
                cautions: String(item.cautions || ""),
            });
        });
        onProgress?.(Math.min(offset + batch.length, frames.length));
    }
    return drafts;
}

export async function matchCustomerPhoto(config: AiConfig, image: { url: string; storageKey?: string }, cards: Array<{ id: string; title: string; scene: string; requiredPhotos: string }>): Promise<PhotoMatch> {
    const dataUrl = await imageToDataUrl(image);
    const content: Extract<AiTextMessage["content"], unknown[]> = [
        { type: "text", text: `分析客户工厂实拍照片，只描述确实可见的主体、设备、空间、人物、文字；不可补造工序、设备结构或参数。参考以下已审核镜头卡推荐适合该照片的镜头，最多5张。若卡片所需角度/信息缺失，明确列入 missingRequirements。只返回 JSON: {"description":"","visibleFacts":[""],"recommendedIds":[""],"missingRequirements":[""]}。卡片：${JSON.stringify(cards)}` },
        { type: "image_url", image_url: { url: dataUrl } },
    ];
    const parsed = parseJsonObject(await requestImageQuestion(config, [{ role: "user", content }], () => undefined));
    const validIds = new Set(cards.map((card) => card.id));
    return {
        description: String(parsed.description || ""),
        visibleFacts: strings(parsed.visibleFacts),
        recommendedIds: strings(parsed.recommendedIds).filter((id) => validIds.has(id)),
        missingRequirements: strings(parsed.missingRequirements),
    };
}
