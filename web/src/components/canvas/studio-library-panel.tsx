import { useMemo, useState } from "react";
import { App, Button, Input, Modal, Popconfirm } from "antd";
import { Download, Edit3, GripVertical, Image as ImageIcon, Mic, Plus, Search, Trash2, Upload, Users, MapPin, UserRound, BookOpen, LayoutGrid, Copy } from "lucide-react";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useStudioEditorStore } from "@/stores/use-studio-editor-store";
import { useStudioCategoryStore } from "@/stores/use-studio-category-store";
import { getStudioRecord, STUDIO_DRAG_TYPE, STUDIO_LABELS, type StudioKind } from "@/features/studio-library/model";
import { exportAssets, readStudioAssetPackage } from "@/pages/assets/asset-transfer";
import { LocalSaveStatus } from "@/components/layout/local-save-status";

const ICONS = { character: Users, scene: MapPin, persona: UserRound, prompt: BookOpen, storyboard: LayoutGrid };
const HELP = {
    character: "把人物图片和声音样本放在同一张卡里。",
    scene: "保存工厂、室内外环境和布光参考。",
    persona: "记录外貌、服装和身份，复用人物设定。",
    prompt: "建立自己的提示词分类，随时修改和套用。",
    storyboard: "安排镜头顺序，把每格分镜带到画布继续创作。",
};

export function StudioLibraryPanel({ kind, onInsert }: { kind: StudioKind; onInsert: (assetId: string) => void }) {
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useThemeStore((s) => s.theme)];
    const assets = useAssetStore((s) => s.assets);
    const savedCategories = useStudioCategoryStore((s) => s.categories);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("");
    const [categoryName, setCategoryName] = useState<string | null>(null);
    const [editingCategory, setEditingCategory] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const items = useMemo(() => assets.filter((a) => getStudioRecord(a)?.kind === kind), [assets, kind]);
    const categories = useMemo(() => Array.from(new Set([...(savedCategories[kind] || []), ...items.map((a) => getStudioRecord(a)!.category)])).filter(Boolean), [savedCategories, items, kind]);
    const filtered = items.filter((a) => (!category || getStudioRecord(a)?.category === category) && (!query.trim() || [a.title, ...a.tags, a.kind === "text" ? a.data.content : ""].join(" ").toLowerCase().includes(query.trim().toLowerCase())));
    const Icon = ICONS[kind];
    const openEditor = (asset?: Asset) => {
        const go = () => (asset ? useStudioEditorStore.getState().edit(asset) : useStudioEditorStore.getState().create(kind, category));
        if (useStudioEditorStore.getState().dirty) modal.confirm({ title: "当前素材有未保存修改", content: "切换前请保存，或放弃当前修改。", okText: "放弃并切换", cancelText: "返回编辑", onOk: go });
        else go();
    };
    const backup = async () => {
        setBusy(true);
        try {
            await exportAssets(
                assets.filter((a) => !!getStudioRecord(a)),
                `创作资产库-${new Date().toISOString().slice(0, 10)}.zip`,
                savedCategories,
            );
        } catch (e) {
            message.error(String(e));
        } finally {
            setBusy(false);
        }
    };
    const restore = (file: File) =>
        modal.confirm({
            title: "导入创作资产包？",
            content: "素材和分类会合并到本地库，相同 ID 的素材会被更新。建议先导出备份。",
            okText: "导入素材",
            cancelText: "取消",
            onOk: async () => {
                try {
                    const data = await readStudioAssetPackage(file);
                    const imported = data.assets.filter((a) => !!getStudioRecord(a));
                    const categoryCount = Object.values(data.categories).reduce((total, names) => total + names.length, 0);
                    if (!imported.length && !categoryCount) throw new Error("素材包中没有创作卡片或分类");
                    const ids = new Set(imported.map((a) => a.id));
                    if (imported.length) useAssetStore.getState().replaceAssets([...imported, ...useAssetStore.getState().assets.filter((a) => !ids.has(a.id))]);
                    useStudioCategoryStore.getState().merge(data.categories);
                    imported.forEach((a) => {
                        const r = getStudioRecord(a)!;
                        if (r.category) useStudioCategoryStore.getState().add(r.kind, r.category);
                    });
                    message.success(`已导入 ${imported.length} 份素材${categoryCount ? `、${categoryCount} 个分类` : ""}`);
                } catch (e) {
                    message.error(e instanceof Error ? e.message : "导入失败");
                    throw e;
                }
            },
        });
    return (
        <div className="flex h-full flex-col">
            <div className="space-y-4 px-4 pb-4 pt-2">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h2 className="text-base font-semibold tracking-tight">
                            {STUDIO_LABELS[kind]}
                            {kind === "prompt" ? "库" : kind === "storyboard" ? "" : "资产"}
                        </h2>
                        <p className="mt-1 text-[11px] leading-5 opacity-50">{HELP[kind]}</p>
                    </div>
                    <Button type="text" aria-label={`新建${STUDIO_LABELS[kind]}`} icon={<Plus size={17} />} onClick={() => openEditor()} />
                </div>
                <Input aria-label={`搜索${STUDIO_LABELS[kind]}`} prefix={<Search size={14} className="opacity-40" />} placeholder={`搜索${STUDIO_LABELS[kind]}、标签…`} allowClear value={query} onChange={(e) => setQuery(e.target.value)} />
                <div className="flex flex-wrap items-center gap-1">
                    <button className="rounded-md px-2 py-1 text-[11px]" style={{ background: !category ? theme.toolbar.activeBg : undefined }} onClick={() => setCategory("")}>
                        全部 {items.length}
                    </button>
                    {categories.map((c) => (
                        <button key={c} className="max-w-full truncate rounded-md px-2 py-1 text-[11px]" style={{ background: category === c ? theme.toolbar.activeBg : undefined }} onClick={() => setCategory(c)}>
                            {c}
                        </button>
                    ))}
                    <button
                        aria-label="新建分类"
                        title="新建分类"
                        className="rounded-md p-1.5 opacity-50 hover:opacity-100"
                        onClick={() => {
                            setEditingCategory(null);
                            setCategoryName("");
                        }}
                    >
                        <Plus size={12} />
                    </button>
                </div>
                {category ? (
                    <div className="flex items-center justify-end gap-3 text-[11px] opacity-60">
                        <button
                            className="flex items-center gap-1 hover:underline"
                            onClick={() => {
                                setEditingCategory(category);
                                setCategoryName(category);
                            }}
                        >
                            <Edit3 size={12} />
                            重命名分类
                        </button>
                        <Popconfirm
                            title={`删除分类「${category}」？`}
                            description="该分类的卡片将归入未分类，卡片内容会保留。"
                            okText="删除分类"
                            cancelText="取消"
                            onConfirm={() => {
                                useStudioCategoryStore.getState().remove(kind, category);
                                setCategory("");
                            }}
                        >
                            <button className="flex items-center gap-1 hover:underline">
                                <Trash2 size={12} />
                                删除分类
                            </button>
                        </Popconfirm>
                    </div>
                ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                {filtered.length ? (
                    <div className="grid grid-cols-2 gap-2.5">
                        {filtered.map((asset) => {
                            const r = getStudioRecord(asset)!;
                            const audioCount = r.media.filter((m) => m.kind === "audio").length;
                            return (
                                <article
                                    key={asset.id}
                                    data-studio-asset-id={asset.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData(STUDIO_DRAG_TYPE, asset.id);
                                        e.dataTransfer.effectAllowed = "copy";
                                    }}
                                    className="group relative overflow-hidden rounded-xl border transition hover:-translate-y-0.5"
                                    style={{ borderColor: theme.node.stroke, background: theme.node.panel }}
                                >
                                    <button className="relative block aspect-[4/3] w-full overflow-hidden" aria-label={`编辑 ${asset.title}`} onClick={() => openEditor(asset)}>
                                        {r.kind === "storyboard" ? (
                                            <div className="grid h-full gap-0.5 p-1" style={{ gridTemplateColumns: `repeat(${Math.sqrt(r.gridSize)},minmax(0,1fr))` }}>
                                                {r.frames.slice(0, r.gridSize).map((f, i) => (
                                                    <div key={f.id} className="flex min-h-0 items-center justify-center overflow-hidden" style={{ background: theme.canvas.background }}>
                                                        {f.image ? <img className="size-full object-cover" src={f.image.url} alt="" /> : <span className="text-[10px] opacity-30">{i + 1}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : asset.coverUrl ? (
                                            <img src={asset.coverUrl} alt={asset.title} className="size-full object-cover" draggable={false} />
                                        ) : (
                                            <div className="flex h-full flex-col items-center justify-center gap-2 px-3" style={{ background: theme.canvas.background }}>
                                                {r.kind === "prompt" ? <p className="line-clamp-4 text-left text-[10px] leading-4 opacity-70">{r.description}</p> : <Icon size={28} strokeWidth={1} className="opacity-25" />}
                                            </div>
                                        )}
                                        <span className="absolute left-1.5 top-1.5 rounded p-1 opacity-0 transition group-hover:opacity-100" style={{ background: theme.toolbar.panel }}>
                                            <GripVertical size={12} />
                                        </span>
                                        {audioCount > 0 ? (
                                            <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]" style={{ background: theme.toolbar.panel }}>
                                                <Mic size={10} />
                                                {audioCount}
                                            </span>
                                        ) : null}
                                    </button>
                                    <div className="px-2.5 pb-2 pt-2">
                                        <div className="truncate text-xs font-medium" title={asset.title}>
                                            {asset.title}
                                        </div>
                                        <div className="mt-1 truncate text-[10px] opacity-45">
                                            {r.category || "未分类"}
                                            {r.kind === "storyboard" ? ` · ${r.gridSize} 格` : r.media.length ? ` · ${r.media.length} 份素材` : ""}
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-1">
                                            <button aria-label={`放入画布 ${asset.title}`} title={`放入画布 ${asset.title}`} className="whitespace-nowrap text-[10px] font-medium hover:underline" onClick={() => onInsert(asset.id)}>
                                                使用 ↗
                                            </button>
                                            <div className="flex shrink-0">
                                                <button
                                                    className="p-1 opacity-50 hover:opacity-100"
                                                    aria-label={`复制 ${asset.title}`}
                                                    onClick={() => {
                                                        const { id, createdAt, updatedAt, ...copy } = asset;
                                                        useAssetStore.getState().addAsset({ ...copy, title: `${asset.title} 副本` });
                                                        message.success("已复制");
                                                    }}
                                                >
                                                    <Copy size={12} />
                                                </button>
                                                <Popconfirm
                                                    title="从素材库删除这张卡？"
                                                    description="已放入画布的内容仍会保留。"
                                                    okText="删除"
                                                    cancelText="取消"
                                                    onConfirm={() => {
                                                        if (useStudioEditorStore.getState().draft?.assetId === asset.id) useStudioEditorStore.getState().close();
                                                        useAssetStore.getState().removeAsset(asset.id);
                                                    }}
                                                >
                                                    <button className="p-1 opacity-50 hover:opacity-100" aria-label={`删除 ${asset.title}`}>
                                                        <Trash2 size={12} />
                                                    </button>
                                                </Popconfirm>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
                        <Icon size={38} strokeWidth={1} className="mb-4 opacity-20" />
                        <p className="text-sm">{query || category ? "没有匹配的素材" : `创建第一份${STUDIO_LABELS[kind]}`}</p>
                        <p className="mb-5 mt-2 text-xs leading-5 opacity-45">{query || category ? "试试其他关键词或分类" : "保存后可以直接拖到画布中使用"}</p>
                        <Button type="text" icon={<Plus size={14} />} onClick={() => openEditor()}>
                            新建{STUDIO_LABELS[kind]}
                        </Button>
                    </div>
                )}
            </div>
            <footer className="space-y-2 border-t px-3 py-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex justify-center"><LocalSaveStatus /></div>
                <div className="flex justify-center gap-2">
                    <Button type="text" size="small" loading={busy} icon={<Download size={13} />} onClick={() => void backup()}>
                        备份资产库
                    </Button>
                    <label className="inline-flex cursor-pointer items-center gap-1 px-2 text-xs">
                        <Upload size={13} />
                        导入资产包
                        <input
                            aria-label="导入创作资产包"
                            className="hidden"
                            type="file"
                            accept=".zip"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) restore(f);
                                e.target.value = "";
                            }}
                        />
                    </label>
                </div>
            </footer>
            <Modal
                title={editingCategory ? "重命名分类" : "新建分类"}
                open={categoryName !== null}
                okText={editingCategory ? "保存" : "创建"}
                cancelText="取消"
                onCancel={() => setCategoryName(null)}
                onOk={() => {
                    const name = categoryName?.trim();
                    if (!name) return;
                    if (name !== editingCategory && categories.includes(name)) {
                        message.warning("该分类已存在");
                        return;
                    }
                    const store = useStudioCategoryStore.getState();
                    if (editingCategory) store.rename(kind, editingCategory, name);
                    else store.add(kind, name);
                    setCategory(name);
                    setCategoryName(null);
                }}
            >
                <Input aria-label="分类名称" placeholder="例如：电影运镜、工厂全景" value={categoryName || ""} onChange={(e) => setCategoryName(e.target.value)} />
            </Modal>
        </div>
    );
}
