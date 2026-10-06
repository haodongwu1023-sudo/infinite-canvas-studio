import type { CanvasNodeData, CanvasConnection, CanvasNodeMetadata, Position } from "../../types/canvas";

export const STUDIO_KINDS = ["character", "scene", "persona", "prompt", "storyboard"] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];
export const STUDIO_LABELS: Record<StudioKind, string> = { character: "人物", scene: "场景", persona: "人设", prompt: "提示词", storyboard: "故事板" };
export const STUDIO_DRAG_TYPE = "application/x-infinite-canvas-asset";

export type StudioMedia = { id: string; name: string; kind: "image" | "audio"; url: string; storageKey: string; mimeType: string; width?: number; height?: number; durationMs?: number };
export type StudioFrame = { id: string; description: string; prompt: string; seconds: number; image?: StudioMedia };
export type StudioRecord = {
    kind: StudioKind;
    category: string;
    description: string;
    media: StudioMedia[];
    frames: StudioFrame[];
    gridSize: 4 | 9 | 16;
    characterId?: string;
    appearance?: string;
    clothing?: string;
    personality?: string;
    role?: string;
};

export function createStudioRecord(kind: StudioKind): StudioRecord {
    const record: StudioRecord = { kind, category: "", description: "", media: [], frames: [], gridSize: 4 };
    return kind === "storyboard" ? resizeStoryboard(record, 4) : record;
}

export function resizeStoryboard(record: StudioRecord, size: 4 | 9 | 16): StudioRecord {
    const frames = [...record.frames];
    while (frames.length < size) frames.push({ id: crypto.randomUUID(), description: "", prompt: "", seconds: 5 });
    return { ...record, gridSize: size, frames };
}

export function moveFrame(frames: StudioFrame[], fromId: string, toId: string) {
    const from = frames.findIndex((f) => f.id === fromId);
    const to = frames.findIndex((f) => f.id === toId);
    if (from < 0 || to < 0 || from === to) return frames;
    const next = [...frames];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
}

export function studioContent(record: StudioRecord) {
    return [record.description, ...(["role", "appearance", "clothing", "personality"] as const).map((key) => (record[key] ? `${{ role: "身份", appearance: "外貌", clothing: "服装", personality: "性格" }[key]}：${record[key]}` : ""))]
        .filter(Boolean)
        .join("\n");
}

export function isStudioRecord(value: unknown): value is StudioRecord {
    if (!value || typeof value !== "object") return false;
    const r = value as StudioRecord;
    const mediaValid = (m: StudioMedia) => !!m && typeof m.id === "string" && typeof m.name === "string" && ["image", "audio"].includes(m.kind) && typeof m.url === "string" && typeof m.storageKey === "string" && typeof m.mimeType === "string";
    return (
        STUDIO_KINDS.includes(r.kind) &&
        typeof r.category === "string" &&
        typeof r.description === "string" &&
        [4, 9, 16].includes(r.gridSize) &&
        Array.isArray(r.media) &&
        r.media.every(mediaValid) &&
        Array.isArray(r.frames) &&
        r.frames.every((f) => !!f && typeof f.id === "string" && typeof f.prompt === "string" && typeof f.description === "string" && Number.isFinite(f.seconds) && f.seconds > 0 && (!f.image || mediaValid(f.image))) &&
        (r.kind !== "storyboard" || r.frames.length >= r.gridSize)
    );
}

export function getStudioRecord(asset: { metadata?: Record<string, unknown> }) {
    return isStudioRecord(asset.metadata?.studio) ? asset.metadata.studio : undefined;
}

export function buildStudioFlow(title: string, record: StudioRecord, origin: Position): { nodes: CanvasNodeData[]; connections: CanvasConnection[] } {
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const add = (type: string, name: string, x: number, y: number, metadata: CanvasNodeMetadata, width = 280, height = 180) => {
        const node: CanvasNodeData = { id: crypto.randomUUID(), type, title: name, position: { x: origin.x + x, y: origin.y + y }, width, height, metadata };
        nodes.push(node);
        return node;
    };
    const connect = (a: CanvasNodeData, b: CanvasNodeData) => connections.push({ id: crypto.randomUUID(), fromNodeId: a.id, toNodeId: b.id });
    if (record.kind === "prompt") {
        add("text", title, 0, 0, { content: record.description, status: "success" }, 320, 220);
        return { nodes, connections };
    }
    const group = add("group", title, 0, 0, { status: "idle" });
    const common = { groupId: group.id };
    if (record.kind === "storyboard") {
        const columns = Math.sqrt(record.gridSize);
        record.frames.slice(0, record.gridSize).forEach((frame, i) => {
            const x = 24 + (i % columns) * 970,
                y = 64 + Math.floor(i / columns) * 420;
            const label = `镜头 ${String(i + 1).padStart(2, "0")}`;
            const prompt = [frame.description, frame.prompt].filter(Boolean).join("\n");
            const text = add("text", `${label} · 提示词`, x, y, { ...common, content: prompt, status: "success" }, 260, 160);
            const img = add("image", `${label} · 生成画面`, x + 310, y, { ...common, prompt, generationMode: "image", size: "16:9", status: "idle" }, 280, 158);
            if (frame.image) {
                const reference = add(
                    "image",
                    `${label} · 参考图`,
                    x,
                    y + 200,
                    { ...common, content: frame.image.url, storageKey: frame.image.storageKey, mimeType: frame.image.mimeType, naturalWidth: frame.image.width, naturalHeight: frame.image.height, status: "success" },
                    260,
                    146,
                );
                connect(reference, img);
            }
            const video = add("video", `${label} · 视频`, x + 640, y, { ...common, prompt, generationMode: "video", seconds: String(frame.seconds), size: "16:9", status: "idle" }, 280, 158);
            connect(text, img);
            connect(text, video);
            connect(img, video);
        });
        group.width = columns * 970 + 24;
        group.height = columns * 420 + 40;
    } else {
        record.media.forEach((media, i) => {
            const width = 280;
            const height = media.kind === "audio" ? 120 : Math.min(300, Math.max(100, (width * (media.height || 9)) / (media.width || 16)));
            add(
                media.kind,
                `${title} · ${media.name}`,
                24 + (i % 2) * 330,
                64 + Math.floor(i / 2) * 350,
                { ...common, content: media.url, storageKey: media.storageKey, mimeType: media.mimeType, naturalWidth: media.width, naturalHeight: media.height, durationMs: media.durationMs, status: "success" },
                width,
                height,
            );
        });
        const rows = Math.ceil(record.media.length / 2);
        add("text", `${title} · 说明`, 24, 64 + rows * 350, { ...common, content: studioContent(record) || title, status: "success" }, record.media.length > 1 ? 610 : 280, 180);
        group.width = record.media.length > 1 ? 660 : 330;
        group.height = rows * 350 + 280;
    }
    return { nodes, connections };
}
