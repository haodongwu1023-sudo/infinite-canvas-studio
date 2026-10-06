import { useEffect, useRef, useState } from "react";
import { BookOpen, Bot, Download, Home, Images, Menu, PanelLeftClose, PanelLeftOpen, Plus, Redo2, Settings2, Trash2, Undo2, Upload } from "lucide-react";
import { Button, Dropdown, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { canvasThemes } from "@/lib/canvas-theme";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useConfigStore } from "@/stores/use-config-store";
import { DOCS_URL } from "@/constant/env";
import { CanvasShortcutsDialog } from "./canvas-shortcuts-dialog";

export function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onExportProject,
    onImportImage,
    onOpenPlugins,
    onUndo,
    onRedo,
    agentOpen,
    compactAgentStatus,
    onToggleAgent,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onExportProject: () => void;
    onImportImage: () => void;
    onOpenPlugins: () => void;
    onUndo: () => void;
    onRedo: () => void;
    agentOpen: boolean;
    compactAgentStatus: { connected: boolean; enabled: boolean; activity: string };
    onToggleAgent: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const { t } = useTranslation();
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    const [compact, setCompact] = useState(true);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const sidePanelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const toggleSidePanel = useCanvasSidePanelStore((state) => state.togglePanel);

    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 700));
        observer.observe(bar);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <>
            <div ref={barRef} className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex h-16 items-center justify-between gap-3 px-4" style={{ color: theme.node.text, background: theme.chrome.topFade }}>
                <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2">
                    <Tooltip title={sidePanelOpen ? t("canvas.collapsePanel") : t("canvas.expandPanel")}>
                        <button
                            type="button"
                            onClick={toggleSidePanel}
                            aria-label={sidePanelOpen ? t("canvas.collapsePanel") : t("canvas.expandPanel")}
                            className="grid size-8 shrink-0 place-items-center rounded-md transition hover:opacity-65"
                            style={{ color: theme.node.text }}
                        >
                            {sidePanelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                        </button>
                    </Tooltip>
                    <Dropdown
                        trigger={["click"]}
                        popupRender={compact ? (menu) => (
                            <div className="overflow-hidden rounded-lg border" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, boxShadow: theme.toolbar.shadow }}>
                                {menu}
                                <div className="flex justify-center border-t px-3 py-2" style={{ borderColor: theme.toolbar.border }}>
                                    <UserStatusActions variant="canvas" onOpenShortcuts={() => setShortcutsOpen(true)} onOpenPlugins={onOpenPlugins} />
                                </div>
                            </div>
                        ) : undefined}
                        menu={{
                            items: [
                                { key: "home", icon: <Home className="size-4" />, label: t("canvas.home"), onClick: onHome },
                                { key: "docs", icon: <BookOpen className="size-4" />, label: t("canvas.docs"), onClick: () => window.open(DOCS_URL, "_blank", "noopener,noreferrer") },
                                { key: "projects", icon: <Images className="size-4" />, label: t("canvas.projects"), onClick: onProjects },
                                { type: "divider" },
                                { key: "new", icon: <Plus className="size-4" />, label: t("canvas.create"), onClick: onCreateProject },
                                { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("canvas.deleteCurrent"), onClick: onDeleteProject },
                                { type: "divider" },
                                { key: "import", icon: <Upload className="size-4" />, label: t("canvas.importAsset"), onClick: onImportImage },
                                { key: "export", icon: <Download className="size-4" />, label: t("canvas.exportCurrent"), onClick: onExportProject },
                                { type: "divider" },
                                { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text={t("canvas.undo")} shortcut="⌘ Z" />, onClick: onUndo },
                                { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text={t("canvas.redo")} shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                            ],
                        }}
                    >
                        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md transition hover:opacity-65" style={{ color: theme.node.text }} aria-label={t("canvas.openMenu")}>
                            <Menu className="size-4" />
                        </button>
                    </Dropdown>

                    <div ref={titleRef} className="flex min-w-0 max-w-[220px] flex-1 items-center overflow-hidden">
                        {isTitleEditing ? (
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={(event) => onTitleDraftChange(event.target.value)}
                                onBlur={onFinishTitleEditing}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFinishTitleEditing();
                                    if (event.key === "Escape") onCancelTitleEditing();
                                }}
                                className="min-w-0 w-full bg-transparent p-0 text-left text-sm font-semibold tracking-normal outline-none"
                                style={{ color: theme.node.text }}
                            />
                        ) : (
                            <button
                                type="button"
                                className="min-w-0 max-w-full truncate border-b border-dashed border-transparent text-left text-sm font-semibold tracking-normal transition hover:border-current"
                                onDoubleClick={onStartTitleEditing}
                                title={t("canvas.renameHint")}
                            >
                                {title}
                            </button>
                        )}
                    </div>
                    <CompactAgentStatus status={compactAgentStatus} compact={compact} onClick={onToggleAgent} />
                </div>

                <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
                    {compact ? (
                        <>
                            <button type="button" className="grid size-7 place-items-center rounded-md transition hover:opacity-65" onClick={() => openConfigDialog(false)} aria-label={t("navigation.config")} title={t("navigation.config")}>
                                <Settings2 className="size-4" />
                            </button>
                            <AnimatedThemeToggler theme={colorTheme} onThemeChange={setTheme} className="grid size-7 place-items-center rounded-md transition hover:opacity-65 [&_svg]:size-4" aria-label={t(colorTheme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")} title={t(colorTheme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")} />
                        </>
                    ) : <UserStatusActions variant="canvas" onOpenShortcuts={() => setShortcutsOpen(true)} onOpenPlugins={onOpenPlugins} />}
                    <span className="h-6 w-px" style={{ background: theme.toolbar.border }} />
                    <Button
                        type="text"
                        className="!h-8 !rounded-md !px-2.5 !text-xs !font-medium"
                        style={{ background: agentOpen ? theme.toolbar.activeBg : "transparent", color: theme.node.text }}
                        icon={<Bot className="size-4" />}
                        onClick={onToggleAgent}
                        aria-label={t("canvas.openAgent")}
                        title={t("canvas.openAgent")}
                    >
                        {compact ? null : "Agent"}
                    </Button>
                </div>
            </div>
            <CanvasShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function CompactAgentStatus({ status, compact, onClick }: { status: { connected: boolean; enabled: boolean; activity: string }; compact: boolean; onClick: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const { t } = useTranslation();
    const label = status.connected ? t("canvas.agentConnected") : status.enabled ? t("canvas.agentConnecting", { activity: status.activity || t("canvas.connecting") }) : t("canvas.agentDisconnected");
    const dotColor = status.connected ? theme.status.success : status.enabled ? theme.status.warning : theme.node.faint;
    return (
        <button type="button" className="flex h-8 shrink-0 items-center gap-1.5 text-[11px] transition hover:opacity-75" style={{ color: theme.node.muted }} onClick={onClick} title={`${label} · ${t("canvas.openAgent")}`} aria-label={`${label} · ${t("canvas.openAgent")}`}>
            <span className="size-1.5 rounded-full" style={{ background: dotColor }} />
            {!compact ? <span className="max-w-[120px] truncate">{label}</span> : null}
        </button>
    );
}
