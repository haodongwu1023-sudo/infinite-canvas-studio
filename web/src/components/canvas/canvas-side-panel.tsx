import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { App, Empty, Input, Popconfirm, Select, Spin, Tag, type InputRef } from "antd";

import { BookOpen, Boxes, LayoutGrid, PanelLeftClose, Users, MapPin, UserRound, Check, ChevronRight, Download, Eye, FileText, Image as ImageIcon, ListChecks, Music2, Plus, Search, Settings2, Square, Trash2, Type, Video } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { exportCanvasNodes } from "@/lib/canvas/canvas-export";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { cn } from "@/lib/utils";


import { uploadMediaFile } from "@/services/file-storage";
import { previewUrlFor, subscribeImagePreviews, getImagePreviewRevision, uploadImage } from "@/services/image-storage";
import { useAssetStore, type Asset, type AssetKind } from "@/stores/use-asset-store";

import { CANVAS_SIDE_PANEL_MAX_WIDTH, CANVAS_SIDE_PANEL_MIN_WIDTH, CANVAS_SIDE_PANEL_MOTION_MS, useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

import type { InsertAssetPayload } from "./asset-picker-modal";
import { FactoryFilmPanel, type FactoryShotInsert } from "./factory-film-panel";

import { StudioLibraryPanel } from "./studio-library-panel";
import { getStudioRecord, STUDIO_DRAG_TYPE, type StudioKind } from "@/features/studio-library/model";

const PANEL_MOTION_SECONDS = CANVAS_SIDE_PANEL_MOTION_MS / 1000;
const PANEL_EASE = [0.22, 1, 0.36, 1] as const;

type PanelTab = "canvas" | "assets" | "prompts" | "storyboard" | "factory";

type Props = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onFocusNode: (nodeId: string) => void;
    onPreviewNode: (nodeId: string) => void;
    onInsertAsset: (payload: InsertAssetPayload) => void;
    onInsertFactoryShot: (shot: FactoryShotInsert) => void;
    onInsertStudioAsset: (assetId: string) => void;
};

const NODE_TYPE_ICON: Record<string, typeof Square> = {
    [CanvasNodeType.Image]: ImageIcon,
    [CanvasNodeType.Video]: Video,
    [CanvasNodeType.Audio]: Music2,
    [CanvasNodeType.Text]: Type,
    [CanvasNodeType.Config]: Settings2,
    [CanvasNodeType.Group]: Square,
};

const STATUS_COLOR: Record<string, string> = {
    success: "#22c55e",
    loading: "#f59e0b",
    error: "#ef4444",
    idle: "transparent",
};

export function CanvasSidePanel({ nodes, selectedNodeIds, onFocusNode, onPreviewNode, onInsertAsset, onInsertFactoryShot, onInsertStudioAsset }: Props) {
    const theme = canvasThemes[useThemeStore(s => s.theme)];
    const [tab, setTab] = useState<PanelTab>("assets");
    const [assetKind, setAssetKind] = useState<"media" | "character" | "scene" | "persona">("character");
    const [searchRequest, setSearchRequest] = useState(0);
    const {width, panelOpen, panelMounted, panelClosing, setWidth, openPanel, closePanel} = useCanvasSidePanelStore();
    useEffect(() => {
        const focusSearch = () => {
            setTab("canvas");
            openPanel();
            setSearchRequest((value) => value + 1);
        };
        window.addEventListener("canvas:focus-node-search", focusSearch);
        return () => window.removeEventListener("canvas:focus-node-search", focusSearch);
    }, [openPanel]);
    const [resizing, setResizing] = useState(false);
    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX=event.clientX, startWidth=width;
        setResizing(true);
        const target=event.currentTarget; target.setPointerCapture(event.pointerId);
        target.onpointermove = e => setWidth(Math.min(CANVAS_SIDE_PANEL_MAX_WIDTH,Math.max(CANVAS_SIDE_PANEL_MIN_WIDTH,startWidth+e.clientX-startX)));
        const end=()=>{target.onpointermove=null;target.onpointerup=null;target.onpointercancel=null;localStorage.setItem("canvas-side-panel-width",String(useCanvasSidePanelStore.getState().width));setResizing(false);};
        target.onpointerup=end;target.onpointercancel=end;
    };
    const navigation = [
        {id:"canvas" as const,label:"画布",icon:LayoutGrid},
        {id:"assets" as const,label:"资产",icon:Users},
        {id:"prompts" as const,label:"提示词",icon:BookOpen},
        {id:"storyboard" as const,label:"故事板",icon:ImageIcon},
        {id:"factory" as const,label:"镜头库",icon:Video},
    ];
    return <div className="canvas-glass relative z-[60] flex h-full shrink-0" style={{background:theme.chrome.panel,color:theme.node.text}} data-canvas-no-zoom>
        <nav aria-label="创作工作台导航" className="flex w-16 shrink-0 flex-col items-center gap-2 border-r py-4" style={{borderColor:theme.toolbar.border}}>
            <div className="mb-4 flex h-8 w-8 items-center justify-center" title="Infinite Canvas"><Boxes size={23} strokeWidth={1.4}/></div>
            {navigation.map(({id,label,icon:Icon})=><button key={id} type="button" aria-label={label} aria-pressed={tab===id&&panelOpen} className="flex w-12 flex-col items-center gap-1.5 whitespace-nowrap rounded-xl px-1 py-2.5 text-[10px] transition hover:opacity-100" style={{background:tab===id&&panelOpen?theme.toolbar.activeBg:undefined,opacity:tab===id&&panelOpen?1:0.5}} onClick={()=>{if(tab===id&&panelOpen)closePanel();else{setTab(id);openPanel();}}}><Icon size={19} strokeWidth={1.6}/>{label}</button>)}
            <span className="mt-auto text-[9px] tracking-widest opacity-25 [writing-mode:vertical-rl]">INFINITE CANVAS</span>
        </nav>
        <motion.div animate={{width:panelOpen?width:0,opacity:panelOpen?1:0}} initial={false} transition={{duration:resizing?0:PANEL_MOTION_SECONDS,ease:PANEL_EASE}} className="relative overflow-hidden" style={{pointerEvents:panelClosing?'none':undefined}}>
            {panelMounted?<aside className="flex h-full flex-col border-r" style={{width,borderColor:theme.toolbar.border}}>
                <div className="flex h-16 shrink-0 items-center justify-between px-4"><span className="text-[10px] font-medium tracking-[0.16em] opacity-40">创作工作台</span><button type="button" aria-label="收起资源面板" className="p-1 opacity-50 hover:opacity-100" onClick={closePanel}><PanelLeftClose size={15}/></button></div>
                {tab==='assets'?<div className="mx-3 mb-4 flex border-b" style={{borderColor:theme.toolbar.border}}>{([{id:'character',label:'人物'},{id:'scene',label:'场景'},{id:'persona',label:'人设'},{id:'media',label:'素材'}] as const).map(k=><button key={k.id} className="flex-1 border-b-2 pb-2 text-xs" style={{borderColor:assetKind===k.id?theme.node.activeStroke:'transparent',opacity:assetKind===k.id?1:0.45}} onClick={()=>setAssetKind(k.id)}>{k.label}</button>)}</div>:null}
                <div className="min-h-0 flex-1 overflow-hidden">
                    {tab==='canvas'?<CanvasNodesTab nodes={nodes} selectedNodeIds={selectedNodeIds} onFocusNode={onFocusNode} onPreviewNode={onPreviewNode} theme={theme} searchRequest={searchRequest}/>
                    :tab==='factory'?<FactoryFilmPanel onInsert={onInsertFactoryShot}/>
                    :tab==='assets'&&assetKind==='media'?<CanvasAssetsTab onInsert={onInsertAsset} theme={theme}/>
                    :<StudioLibraryPanel key={tab==='assets'?assetKind:tab} kind={tab==='prompts'?'prompt':tab==='storyboard'?'storyboard':assetKind as StudioKind} onInsert={onInsertStudioAsset}/>}
                </div>
                <button type="button" className="absolute inset-y-0 right-0 z-40 w-2 cursor-col-resize" onPointerDown={startResize} aria-label="调整资源面板宽度"/>
            </aside>:null}
        </motion.div>
    </div>;
}

// ---------------------------------------------------------------------------
// Canvas tab: list nodes and center, zoom, and select the clicked node.
// ---------------------------------------------------------------------------

const NODE_FILTER_VALUES = ["all", CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Text, CanvasNodeType.Audio, CanvasNodeType.Config, CanvasNodeType.Group];

function nodePreviewText(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return getNodeDefinition(node.type)?.title || node.type;
}

function CanvasNodesTab({ nodes, selectedNodeIds, onFocusNode, onPreviewNode, theme, searchRequest }: { nodes: CanvasNodeData[]; selectedNodeIds: Set<string>; onFocusNode: (nodeId: string) => void; onPreviewNode: (nodeId: string) => void; theme: CanvasTheme; searchRequest: number }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const [keyword, setKeyword] = useState("");
    const searchInputRef = useRef<InputRef>(null);
    useEffect(() => {
        if (searchRequest) searchInputRef.current?.focus();
    }, [searchRequest]);
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [selectMode, setSelectMode] = useState(false);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return nodes.filter((node) => (typeFilter === "all" || node.type === typeFilter) && (!query || [node.title, node.metadata?.content, node.metadata?.prompt].filter(Boolean).join(" ").toLowerCase().includes(query)));
    }, [nodes, keyword, typeFilter]);
    const treeRows = useMemo(() => {
        const filteredIds = new Set(filtered.map((node) => node.id));
        const groups = new Set(nodes.filter((node) => node.type === CanvasNodeType.Group).map((node) => node.id));
        const children = new Map<string, CanvasNodeData[]>();
        filtered.forEach((node) => {
            const groupId = node.metadata?.groupId;
            if (groupId && groups.has(groupId)) children.set(groupId, [...(children.get(groupId) || []), node]);
        });
        return nodes.flatMap((node) => {
            if (node.metadata?.groupId && groups.has(node.metadata.groupId)) return [];
            if (node.type !== CanvasNodeType.Group) return filteredIds.has(node.id) ? [{ node, depth: 0, hasChildren: false }] : [];
            const groupChildren = children.get(node.id) || [];
            if (!filteredIds.has(node.id) && !groupChildren.length) return [];
            return [{ node, depth: 0, hasChildren: groupChildren.length > 0 }, ...(collapsedGroups.has(node.id) ? [] : groupChildren.map((child) => ({ node: child, depth: 1, hasChildren: false })))];
        });
    }, [collapsedGroups, filtered, nodes]);

    const exitSelect = () => {
        setSelectMode(false);
        setChecked(new Set());
    };
    const toggleChecked = (id: string) =>
        setChecked((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    const allChecked = filtered.length > 0 && filtered.every((node) => checked.has(node.id));
    const toggleAll = () => setChecked(allChecked ? new Set() : new Set(filtered.map((node) => node.id)));

    const handleExport = async () => {
        const targets = nodes.filter((node) => checked.has(node.id));
        if (!targets.length) return;
        setExporting(true);
        const hide = message.loading(t("canvas.sidePanel.exporting"), 0);
        try {
            await exportCanvasNodes(targets, t("canvas.sidePanel.exportName", { count: targets.length }));
            message.success(t("canvas.sidePanel.exported", { count: targets.length }));
            exitSelect();
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.exportFailed"));
        } finally {
            hide();
            setExporting(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
                <span className="text-xs font-medium opacity-60">{t("canvas.sidePanel.elements")}</span>
                {filtered.length ? <span className="text-xs opacity-35">{filtered.length}</span> : null}
                <button
                    type="button"
                    onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                    className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                    style={selectMode ? { color: theme.toolbar.activeText, opacity: 1 } : undefined}
                >
                    <ListChecks className="size-3.5" />
                    {selectMode ? t("common.cancel") : t("canvas.sidePanel.select")}
                </button>
                {selectMode ? null : <Select size="small" variant="borderless" className="w-20" value={typeFilter} onChange={setTypeFilter} options={NODE_FILTER_VALUES.map((value) => ({ value, label: value === "all" ? t("common.all") : t(`canvas.sidePanel.filter.${value}`) }))} />}
            </div>
            <div className="px-3 pb-2.5">
                <Input ref={searchInputRef} size="small" allowClear prefix={<Search className="size-3.5" style={{ color: theme.node.muted }} />} placeholder={t("canvas.sidePanel.searchNodes")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {treeRows.length ? (
                    <div className="space-y-1.5">
                        {treeRows.map(({ node, depth, hasChildren }) => {
                            const Icon = NODE_TYPE_ICON[node.type] || FileText;
                            const isImage = node.type === CanvasNodeType.Image && node.metadata?.content;
                            const isChecked = checked.has(node.id);
                            const active = selectMode ? isChecked : selectedNodeIds.has(node.id);
                            return (
                                <div key={node.id} className={cn("group relative flex items-center rounded-lg transition", depth && "ml-5", active ? "" : "hover:bg-black/5 dark:hover:bg-white/5")} style={active ? { background: theme.toolbar.activeBg } : undefined}>
                                    {depth ? <span className="pointer-events-none absolute -left-3 top-[calc(-50%-0.4rem)] h-[calc(100%+0.4rem)] w-3 rounded-bl-md border-b border-l opacity-45" style={{ borderColor: theme.node.stroke }} /> : null}
                                    {node.type === CanvasNodeType.Group && hasChildren ? (
                                        <button type="button" onClick={() => setCollapsedGroups((prev) => (prev.has(node.id) ? new Set([...prev].filter((id) => id !== node.id)) : new Set(prev).add(node.id)))} className="ml-1 grid size-6 shrink-0 place-items-center opacity-55 transition hover:opacity-100" aria-label={node.title}>
                                            <ChevronRight className={cn("size-3.5 transition-transform", !collapsedGroups.has(node.id) && "rotate-90")} />
                                        </button>
                                    ) : null}
                                    <button type="button" onClick={() => (selectMode ? toggleChecked(node.id) : onFocusNode(node.id))} className={cn("flex min-w-0 flex-1 items-center gap-3 py-2 pr-2 text-left", node.type === CanvasNodeType.Group && hasChildren ? "pl-0" : "pl-2")} title={selectMode ? undefined : t("canvas.sidePanel.focusNode")}>
                                        {selectMode ? <CheckMark checked={isChecked} theme={theme} /> : null}
                                        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md">
                                            {isImage ? <img src={previewUrlFor(node.metadata?.storageKey) || node.metadata?.content} alt={node.title} className="size-full object-cover" /> : <Icon className="size-5 opacity-60" />}
                                        </span>
                                        <span className="min-w-0 flex-1 space-y-0.5">
                                            <span className="block truncate text-sm font-medium leading-snug">{node.title || getNodeDefinition(node.type)?.title || t("canvas.node.untitled")}</span>
                                            <span className="block truncate text-xs leading-snug opacity-50">{nodePreviewText(node)}</span>
                                        </span>
                                        {node.metadata?.status && node.metadata.status !== "idle" ? <span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[node.metadata.status] || "transparent" }} /> : null}
                                    </button>
                                    {selectMode || !isImage ? null : (
                                        <div className="flex shrink-0 flex-col items-center gap-0.5 pr-1.5">
                                            <button type="button" onClick={() => onPreviewNode(node.id)} className="grid size-7 place-items-center rounded-md opacity-55 transition hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10" aria-label={t("canvas.sidePanel.preview")} title={t("canvas.sidePanel.preview")}>
                                                <Eye className="size-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="pt-16 text-center text-sm opacity-40">{t("canvas.sidePanel.noNodes")}</div>
                )}
            </div>
            {selectMode ? (
                <div className="flex items-center gap-2 border-t px-3 py-2.5" style={{ borderColor: theme.toolbar.border }}>
                    <button type="button" onClick={toggleAll} className="rounded-md px-2 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
                        {allChecked ? t("canvas.sidePanel.clearAll") : t("workbench.selectAll")}
                    </button>
                    <span className="text-xs opacity-45">{t("canvas.sidePanel.selected", { count: checked.size })}</span>
                    <button
                        type="button"
                        onClick={() => void handleExport()}
                        disabled={!checked.size || exporting}
                        className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                        style={{ color: theme.node.text }}
                    >
                        <Download className="size-3.5" />
                        {t("canvas.exportSelected")}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function CheckMark({ checked, theme }: { checked: boolean; theme: CanvasTheme }) {
    return (
        <span className="grid size-4 shrink-0 place-items-center rounded border transition" style={{ borderColor: checked ? theme.toolbar.activeText : theme.node.stroke, background: checked ? theme.toolbar.activeText : "transparent" }}>
            {checked ? <Check className="size-3 text-white" /> : null}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Assets tab: collapsible type groups, tag filtering, and click-to-insert.
// ---------------------------------------------------------------------------

const ASSET_GROUPS: { kind: AssetKind; icon: typeof Square }[] = [
    { kind: "image", icon: ImageIcon },
    { kind: "video", icon: Video },
    { kind: "text", icon: FileText },
];

function buildInsertPayload(asset: Asset): InsertAssetPayload {
    if (asset.kind === "text") return { kind: "text", content: asset.data.content, title: asset.title };
    if (asset.kind === "video") return { kind: "video", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, width: asset.data.width, height: asset.data.height };
    return { kind: "image", dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, title: asset.title };
}

const CanvasAssetsTab = memo(function CanvasAssetsTab({ onInsert, theme }: { onInsert: (payload: InsertAssetPayload) => void; theme: CanvasTheme }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const [keyword, setKeyword] = useState("");
    const [tagFilter, setTagFilter] = useState<string>("all");
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const allTags = useMemo(() => Array.from(new Set(assets.flatMap((asset) => asset.tags || []))).slice(0, 20), [assets]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets.filter((asset) => !getStudioRecord(asset) && (tagFilter === "all" || (asset.tags || []).includes(tagFilter)) && (!query || [asset.title, ...(asset.tags || [])].join(" ").toLowerCase().includes(query)));
    }, [assets, keyword, tagFilter]);

    const groups = useMemo(() => ASSET_GROUPS.map((group) => ({ ...group, items: filtered.filter((asset) => asset.kind === group.kind) })).filter((group) => group.items.length > 0), [filtered]);

    const handleFiles = async (fileList: FileList | null) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setUploading(true);
        const hide = message.loading(t("canvas.sidePanel.addingAssets"), 0);
        let added = 0;
        try {
            for (const file of files) {
                if (file.type.startsWith("image/")) {
                    const image = await uploadImage(file);
                    addAsset({ kind: "image", title: file.name || t("assets.kinds.image"), coverUrl: image.url, tags: [], data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType } });
                    added += 1;
                } else if (file.type.startsWith("video/")) {
                    const media = await uploadMediaFile(file, "video");
                    addAsset({ kind: "video", title: file.name || t("assets.kinds.video"), coverUrl: "", tags: [], data: { url: media.url, storageKey: media.storageKey, width: media.width || 0, height: media.height || 0, bytes: media.bytes, mimeType: media.mimeType } });
                    added += 1;
                }
            }
            if (added) message.success(t("canvas.sidePanel.addedAssets", { count: added }));
            else message.warning(t("canvas.sidePanel.mediaOnly"));
        } catch (error) {
            console.error(error);
            message.error(t("canvas.sidePanel.addFailed"));
        } finally {
            hide();
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-3 pb-2 pt-1">
                <Input size="small" allowClear prefix={<Search className="size-3.5 text-stone-400" />} placeholder={t("canvas.sidePanel.searchAssets")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
                <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                    style={{ color: theme.node.text }}
                >
                    <Plus className="size-3.5" />
                    {t("canvas.sidePanel.add")}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
            </div>
            {allTags.length ? (
                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    <Tag.CheckableTag checked={tagFilter === "all"} className={cn("prompt-filter-tag", tagFilter === "all" && "is-active")} onChange={() => setTagFilter("all")}>
                        {t("common.all")}
                    </Tag.CheckableTag>
                    {allTags.map((tag) => (
                        <Tag.CheckableTag key={tag} checked={tagFilter === tag} className={cn("prompt-filter-tag", tagFilter === tag && "is-active")} onChange={() => setTagFilter((prev) => (prev === tag ? "all" : tag))}>
                            {tag}
                        </Tag.CheckableTag>
                    ))}
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {groups.length ? (
                    <div className="space-y-1">
                        {groups.map((group) => {
                            const isCollapsed = collapsed[group.kind];
                            return (
                                <div key={group.kind}>
                                    <button
                                        type="button"
                                        onClick={() => setCollapsed((prev) => ({ ...prev, [group.kind]: !prev[group.kind] }))}
                                        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold opacity-75 transition hover:opacity-100"
                                    >
                                        <ChevronRight className={cn("size-3.5 transition-transform", !isCollapsed && "rotate-90")} />
                                        <group.icon className="size-3.5" />
                                        <span>{t(`assets.kinds.${group.kind}`)}</span>
                                        <span className="opacity-50">{group.items.length}</span>
                                    </button>
                                    {isCollapsed ? null : (
                                        <div className="grid grid-cols-2 gap-2 px-1 pb-2 pt-1">
                                            {group.items.map((asset) => (
                                                <AssetCard key={asset.id} asset={asset} theme={theme} onInsert={() => onInsert(buildInsertPayload(asset))} onRemove={() => (removeAsset(asset.id), message.success(t("canvas.sidePanel.assetRemoved")))} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.sidePanel.noAssets")} className="pt-16" />
                )}
            </div>
        </div>
    );
});

function AssetCard({ asset, theme, onInsert, onRemove }: { asset: Asset; theme: CanvasTheme; onInsert: () => void; onRemove: () => void }) {
    const { t } = useTranslation();
    return (
        <div draggable onDragStart={event => {event.dataTransfer.setData(STUDIO_DRAG_TYPE, asset.id);event.dataTransfer.effectAllowed="copy";}} className="group relative aspect-square overflow-hidden rounded-xl border transition duration-200 hover:-translate-y-0.5 hover:shadow-lg" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <AssetCover asset={asset} />
            <div className="absolute inset-0 flex items-center justify-center gap-2.5 opacity-0 transition duration-200 group-hover:opacity-100">
                <button
                    type="button"
                    onClick={onInsert}
                    className="grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-stone-900 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80"
                    aria-label={t("canvas.sidePanel.inserted")}
                >
                    <Plus className="size-4" />
                </button>
                <Popconfirm title={t("canvas.sidePanel.removeAssetTitle")} okText={t("canvas.sidePanel.remove")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={onRemove}>
                    <button
                        type="button"
                        className="grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-red-500 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80 dark:hover:text-red-400"
                        aria-label={t("canvas.sidePanel.removeAsset")}
                    >
                        <Trash2 className="size-4" />
                    </button>
                </Popconfirm>
            </div>
        </div>
    );
}

function AssetCover({ asset }: { asset: Asset }) {
    if (asset.kind === "text") return <div className="size-full overflow-hidden whitespace-pre-wrap break-words p-2.5 text-[11px] leading-snug opacity-80">{asset.data.content}</div>;
    if (asset.kind === "video") {
        if (asset.coverUrl) return <img src={asset.coverUrl} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />;
        return <video src={`${asset.data.url}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />;
    }
    return <img src={asset.coverUrl || asset.data.dataUrl} alt="" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />;
}
