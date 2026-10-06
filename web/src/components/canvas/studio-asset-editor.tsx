import { useEffect, useRef, useState } from "react";
import { App, Button, Input, InputNumber, Select } from "antd";
import { ArrowDown, ArrowUp, Check, GripVertical, ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useStudioEditorStore } from "@/stores/use-studio-editor-store";
import { useStudioCategoryStore } from "@/stores/use-studio-category-store";
import { getStudioRecord, moveFrame, resizeStoryboard, STUDIO_LABELS, studioContent, type StudioFrame, type StudioRecord } from "@/features/studio-library/model";
import { uploadStudioMedia } from "@/features/studio-library/media";

export function StudioAssetEditor({ onInsert }: { onInsert: (assetId: string) => void }) {
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useThemeStore((s) => s.theme)];
    const { draft, dirty, revision, update, close, saved } = useStudioEditorStore();
    const assets = useAssetStore((s) => s.assets);
    const categories = useStudioCategoryStore((s) => s.categories);
    const [busy, setBusy] = useState(false);
    const [selectedFrame, setSelectedFrame] = useState("");
    const [width, setWidth] = useState(360);
    const uploadRef = useRef<HTMLInputElement>(null);
    const frameUploadRef = useRef<HTMLInputElement>(null);
    const dragFrame = useRef("");
    useEffect(() => {
        setSelectedFrame("");
    }, [revision]);
    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => {
            if (dirty || busy) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty, busy]);
    if (!draft) return null;
    const r = draft.record;
    const label = STUDIO_LABELS[r.kind];
    const patch = (record: Partial<StudioRecord>) => update({ ...draft, record: { ...r, ...record } });
    const frame = r.frames.find((f) => f.id === selectedFrame) || r.frames[0];
    const patchFrame = (value: Partial<StudioFrame>) => patch({ frames: r.frames.map((f) => (f.id === frame.id ? { ...f, ...value } : f)) });
    const requestClose = () => {
        if (busy) return;
        if (dirty) modal.confirm({ title: "放弃未保存的修改？", okText: "放弃修改", cancelText: "继续编辑", onOk: close });
        else close();
    };
    const save = (insert = false) => {
        if (!draft.title.trim()) {
            message.warning(`请填写${label}名称`);
            return;
        }
        if (r.kind === "prompt" && !r.description.trim()) {
            message.warning("请填写提示词正文");
            return;
        }
        const cover = r.media.find((m) => m.kind === "image")?.url || r.frames.find((f) => f.image)?.image?.url || "";
        const payload = { kind: "text" as const, title: draft.title.trim(), tags: draft.tags, coverUrl: cover, data: { content: studioContent(r) }, metadata: { studio: r } };
        const id = draft.assetId || useAssetStore.getState().addAsset(payload);
        if (draft.assetId) useAssetStore.getState().updateAsset(id, payload);
        if (r.category.trim()) useStudioCategoryStore.getState().add(r.kind, r.category);
        saved(id);
        message.success(`${label}已保存`);
        if (insert) onInsert(id);
    };
    const upload = async (files: FileList | null, intoFrame = false) => {
        if (!files?.length) return;
        const capturedRevision = revision;
        const capturedFrame = frame?.id;
        setBusy(true);
        try {
            const added = [];
            for (const file of Array.from(files)) added.push(await uploadStudioMedia(file));
            const current = useStudioEditorStore.getState();
            if (!current.draft || current.revision !== capturedRevision) return;
            const record = current.draft.record;
            update({ ...current.draft, record: intoFrame ? { ...record, frames: record.frames.map((f) => (f.id === capturedFrame ? { ...f, image: added[0] } : f)) } : { ...record, media: [...record.media, ...added] } });
        } catch (e) {
            message.error(e instanceof Error ? e.message : "上传失败，请重试");
        } finally {
            setBusy(false);
        }
    };
    const sectionClass = "space-y-3 border-b py-5";
    const fieldClass = "block space-y-1.5 text-xs";
    return (
        <aside aria-label={`${label}编辑器`} className="relative flex h-full shrink-0 flex-col border-l" style={{ width, maxWidth: "45vw", background: theme.node.panel, borderColor: theme.toolbar.border, color: theme.node.text }} data-canvas-no-zoom>
            <button
                aria-label="调整编辑器宽度"
                className="absolute -left-1 inset-y-0 z-20 w-2 cursor-col-resize"
                onPointerDown={(e) => {
                    const x = e.clientX,
                        original = width,
                        target = e.currentTarget;
                    target.setPointerCapture(e.pointerId);
                    target.onpointermove = (ev) => setWidth(Math.max(320, Math.min(600, original + x - ev.clientX)));
                    const end = () => {
                        target.onpointermove = null;
                        target.onpointerup = null;
                        target.onpointercancel = null;
                    };
                    target.onpointerup = end;
                    target.onpointercancel = end;
                }}
            />
            <header className="flex h-16 shrink-0 items-center justify-between border-b px-5" style={{ borderColor: theme.toolbar.border }}>
                <div>
                    <div className="text-sm font-semibold">
                        {draft.assetId ? "编辑" : "新建"}
                        {label}
                    </div>
                    <div className="mt-0.5 text-[11px] opacity-50">{dirty ? "有未保存的修改" : draft.assetId ? "已保存至本地素材库" : "添加你的创作素材"}</div>
                </div>
                <Button type="text" aria-label="关闭素材编辑器" disabled={busy} icon={<X size={16} />} onClick={requestClose} />
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                <section className={sectionClass} style={{ borderColor: theme.toolbar.border }}>
                    <label className={fieldClass}>
                        {label}名称
                        <Input aria-label={`${label}名称`} placeholder={`给这份${label}起个名字`} value={draft.title} onChange={(e) => update({ ...draft, title: e.target.value })} />
                    </label>
                    <label className={fieldClass}>
                        分类
                        <Select
                            aria-label="素材分类"
                            className="w-full"
                            mode="tags"
                            maxCount={1}
                            placeholder="选择或输入分类"
                            value={r.category ? [r.category] : []}
                            options={(categories[r.kind] || []).map((v) => ({ value: v, label: v }))}
                            onChange={(values) => patch({ category: values.at(-1) || "" })}
                        />
                    </label>
                    <label className={fieldClass}>
                        标签
                        <Select aria-label="素材标签" className="w-full" mode="tags" placeholder="输入后按回车" value={draft.tags} onChange={(tags) => update({ ...draft, tags })} />
                    </label>
                    <label className={fieldClass}>
                        {r.kind === "prompt" ? "提示词正文" : "描述与用途"}
                        <Input.TextArea
                            aria-label={r.kind === "prompt" ? "提示词正文" : "素材描述"}
                            autoSize={{ minRows: 4, maxRows: 12 }}
                            placeholder={r.kind === "prompt" ? "输入可复用的提示词，使用【主体】等占位文字方便修改" : "描述画面、人物或场景的特点…"}
                            value={r.description}
                            onChange={(e) => patch({ description: e.target.value })}
                        />
                    </label>
                </section>
                {r.kind === "persona" ? (
                    <section className={sectionClass} style={{ borderColor: theme.toolbar.border }}>
                        <div className="text-xs font-semibold">人物设定</div>
                        <Select
                            className="w-full"
                            aria-label="关联人物"
                            allowClear
                            placeholder="关联人物资产（可选）"
                            value={r.characterId}
                            options={assets.filter((a) => getStudioRecord(a)?.kind === "character").map((a) => ({ value: a.id, label: a.title }))}
                            onChange={(characterId) => patch({ characterId })}
                        />
                        {(["role", "appearance", "clothing", "personality"] as const).map((k) => (
                            <label key={k} className={fieldClass}>
                                {{ role: "身份", appearance: "外貌", clothing: "服装", personality: "性格" }[k]}
                                <Input.TextArea aria-label={{ role: "身份", appearance: "外貌", clothing: "服装", personality: "性格" }[k]} autoSize={{ minRows: 1, maxRows: 4 }} value={r[k] || ""} onChange={(e) => patch({ [k]: e.target.value })} />
                            </label>
                        ))}
                    </section>
                ) : null}
                {r.kind !== "storyboard" ? (
                    <section className={sectionClass} style={{ borderColor: theme.toolbar.border }}>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">{r.kind === "character" ? "人物图片与声音" : r.kind === "prompt" ? "示例封面" : "参考图片"}</span>
                            <Button type="text" size="small" loading={busy} icon={<Plus size={14} />} onClick={() => uploadRef.current?.click()}>
                                添加
                            </Button>
                        </div>
                        <input
                            ref={uploadRef}
                            type="file"
                            aria-label="上传参考素材"
                            className="hidden"
                            multiple
                            accept={r.kind === "character" ? "image/*,audio/*" : "image/*"}
                            onChange={(e) => {
                                void upload(e.target.files);
                                e.target.value = "";
                            }}
                        />
                        {!r.media.length ? (
                            <button className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-xs opacity-60" style={{ borderColor: theme.node.stroke }} onClick={() => uploadRef.current?.click()}>
                                <ImagePlus size={24} />
                                {r.kind === "character" ? "添加人物照片、三视图或声音样本" : "添加参考图"}
                                <span className="text-[10px]">可添加多份素材</span>
                            </button>
                        ) : null}
                        <div className="space-y-3">
                            {r.media.map((m) => (
                                <div key={m.id} className="relative overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke }}>
                                    {m.kind === "image" ? (
                                        <a href={m.url} target="_blank" rel="noreferrer">
                                            <img src={m.url} alt={m.name} className="max-h-52 w-full object-contain" />
                                        </a>
                                    ) : (
                                        <audio src={m.url} controls className="w-full p-2" />
                                    )}
                                    <div className="flex items-center gap-2 px-2 py-1">
                                        <span className="min-w-0 flex-1 truncate text-[11px] opacity-60">{m.name}</span>
                                        <Button type="text" size="small" aria-label={`移除 ${m.name}`} icon={<Trash2 size={13} />} onClick={() => patch({ media: r.media.filter((x) => x.id !== m.id) })} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : (
                    <section className="space-y-3 py-5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">故事板布局</span>
                            <Select
                                aria-label="宫格数量"
                                value={r.gridSize}
                                options={[4, 9, 16].map((v) => ({ value: v, label: `${v} 宫格` }))}
                                onChange={(size) => {
                                    patch(resizeStoryboard(r, size));
                                    setSelectedFrame("");
                                }}
                            />
                        </div>
                        <p className="text-[11px] opacity-55">拖动左上角手柄排序，点击格子编辑镜头。{r.frames.length > r.gridSize ? `另有 ${r.frames.length - r.gridSize} 格保留，扩大布局可恢复。` : ""}</p>
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.sqrt(r.gridSize)}, minmax(0, 1fr))` }}>
                            {r.frames.slice(0, r.gridSize).map((f, index) => (
                                <div
                                    key={f.id}
                                    className="relative overflow-hidden rounded-lg border"
                                    style={{ borderColor: frame?.id === f.id ? theme.node.activeStroke : theme.node.stroke }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "move";
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (dragFrame.current) {
                                            setSelectedFrame(dragFrame.current);
                                            patch({ frames: moveFrame(r.frames, dragFrame.current, f.id) });
                                        }
                                        dragFrame.current = "";
                                    }}
                                >
                                    <button
                                        className="absolute left-1 top-1 z-10 flex cursor-grab items-center rounded px-1 text-[10px]"
                                        aria-label={`拖动分镜 ${index + 1}`}
                                        style={{ background: theme.toolbar.panel }}
                                        draggable
                                        onDragStart={(e) => {
                                            dragFrame.current = f.id;
                                            e.dataTransfer.setData("text/plain", f.id);
                                            e.dataTransfer.effectAllowed = "move";
                                        }}
                                        onDragEnd={() => {
                                            dragFrame.current = "";
                                        }}
                                    >
                                        <GripVertical size={12} />
                                        {String(index + 1).padStart(2, "0")}
                                    </button>
                                    <button aria-label={`编辑分镜 ${index + 1}`} className="block aspect-video w-full" onClick={() => setSelectedFrame(f.id)}>
                                        {f.image ? <img src={f.image.url} alt={f.description || `分镜 ${index + 1}`} className="h-full w-full object-cover" /> : <span className="text-lg opacity-15">{index + 1}</span>}
                                    </button>
                                    <div className="truncate px-1 pb-1 text-[9px] opacity-60">
                                        {f.description || "未填写"} · {f.seconds}s
                                    </div>
                                </div>
                            ))}
                        </div>
                        {frame ? (
                            <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold">镜头 {r.frames.indexOf(frame) + 1}</span>
                                    <span>
                                        <Button
                                            type="text"
                                            size="small"
                                            aria-label="分镜前移"
                                            disabled={r.frames.indexOf(frame) === 0}
                                            icon={<ArrowUp size={13} />}
                                            onClick={() => {
                                                setSelectedFrame(frame.id);
                                                patch({ frames: moveFrame(r.frames, frame.id, r.frames[r.frames.indexOf(frame) - 1].id) });
                                            }}
                                        />
                                        <Button
                                            type="text"
                                            size="small"
                                            aria-label="分镜后移"
                                            disabled={r.frames.indexOf(frame) === r.gridSize - 1}
                                            icon={<ArrowDown size={13} />}
                                            onClick={() => {
                                                setSelectedFrame(frame.id);
                                                patch({ frames: moveFrame(r.frames, frame.id, r.frames[r.frames.indexOf(frame) + 1].id) });
                                            }}
                                        />
                                    </span>
                                </div>
                                <label className={fieldClass}>
                                    画面描述
                                    <Input aria-label="分镜画面描述" value={frame.description} onChange={(e) => patchFrame({ description: e.target.value })} />
                                </label>
                                <label className={fieldClass}>
                                    镜头提示词
                                    <Input.TextArea aria-label="分镜提示词" rows={3} value={frame.prompt} onChange={(e) => patchFrame({ prompt: e.target.value })} />
                                </label>
                                <label className={fieldClass}>
                                    时长（秒）
                                    <InputNumber aria-label="分镜时长" className="w-full" min={1} value={frame.seconds} onChange={(seconds) => patchFrame({ seconds: seconds || 5 })} />
                                </label>
                                <input
                                    ref={frameUploadRef}
                                    className="hidden"
                                    type="file"
                                    accept="image/*"
                                    aria-label="上传分镜参考图"
                                    onChange={(e) => {
                                        void upload(e.target.files, true);
                                        e.target.value = "";
                                    }}
                                />
                                {frame.image ? <img src={frame.image.url} alt="当前分镜参考图" className="max-h-40 w-full rounded object-contain" /> : null}
                                <div className="flex gap-2">
                                    <Button type="text" size="small" loading={busy} icon={<ImagePlus size={14} />} onClick={() => frameUploadRef.current?.click()}>
                                        {frame.image ? "替换参考图" : "添加参考图"}
                                    </Button>
                                    {frame.image ? (
                                        <Button type="text" size="small" onClick={() => patchFrame({ image: undefined })}>
                                            移除图片
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </section>
                )}
            </div>
            <footer className="flex shrink-0 gap-2 border-t p-4" style={{ borderColor: theme.toolbar.border }}>
                <Button type="text" className="flex-1" disabled={busy} icon={dirty ? <Save size={15} /> : <Check size={15} />} onClick={() => save()}>
                    保存{label}
                </Button>
                <Button type="primary" disabled={busy} onClick={() => save(true)}>
                    保存并放入画布
                </Button>
            </footer>
        </aside>
    );
}
