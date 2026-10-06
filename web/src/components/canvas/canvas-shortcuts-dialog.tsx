import { Modal } from "antd";
import { X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

const groups = [
    { title: "创作", items: [
        ["编组", "Ctrl/Alt", "G"],
        ["解组", "Ctrl/Alt", "Shift", "G"],
        ["连接选中两节点", "Ctrl", "L"],
        ["复制选中节点", "Ctrl", "D"],
        ["生成选中节点", "Ctrl", "Enter"],
        ["新建节点", "Tab"],
        ["拖动复制节点", "Alt", "拖动"],
        ["复制 / 粘贴", "Ctrl", "C / V"],
    ] },
    { title: "缩放", items: [
        ["放大", "Ctrl", "+"],
        ["缩小", "Ctrl", "−"],
        ["恢复 100%", "Ctrl", "0"],
        ["指针位置缩放", "滚轮"],
    ] },
    { title: "移动画布", items: [
        ["临时抓手", "Space", "拖动"],
        ["选择工具", "V"],
        ["抓手工具", "H"],
        ["框选节点", "选择工具", "拖动"],
    ] },
    { title: "其他", items: [
        ["撤销", "Ctrl", "Z"],
        ["重做", "Ctrl", "Shift", "Z"],
        ["搜索画布节点", "Ctrl", "F"],
        ["全选节点", "Ctrl", "A"],
        ["删除", "Delete"],
        ["取消选择", "Esc"],
    ] },
];

export function CanvasShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            title={null}
            closeIcon={null}
            width={1080}
            centered
            styles={{
                mask: { background: "rgba(8,13,25,.43)", backdropFilter: "blur(10px)" },
                content: { padding: 0, overflow: "hidden", borderRadius: 26, border: `1px solid ${theme.toolbar.border}`, background: theme.toolbar.panel, color: theme.node.text, boxShadow: theme.toolbar.shadow, backdropFilter: "blur(38px) saturate(170%)" },
            }}
        >
            <div data-canvas-shortcuts-ignore className="relative max-h-[min(78vh,680px)] overflow-y-auto p-6 sm:p-8">
                <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-semibold tracking-[0.22em]" style={{ color: theme.node.activeStroke }}>INFINITE CANVAS</div>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight">快捷键</h2>
                        <p className="mt-1.5 text-xs" style={{ color: theme.node.muted }}>在画布上使用；输入文字时不会触发。Mac 可用 ⌘ 代替 Ctrl。</p>
                    </div>
                    <button type="button" aria-label="关闭快捷键" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full transition hover:opacity-60" style={{ color: theme.node.muted, background: theme.toolbar.itemHover }}><X size={18} /></button>
                </div>
                <div className="grid gap-7 sm:grid-cols-2 md:grid-cols-4 md:gap-0">
                    {groups.map((group, index) => (
                        <section key={group.title} className={`min-w-0 ${index ? "md:border-l md:pl-5" : ""} ${index < groups.length - 1 ? "md:pr-5" : ""}`} style={{ borderColor: theme.toolbar.border }}>
                            <h3 className="mb-4 text-sm font-semibold" style={{ color: theme.node.activeStroke }}>{group.title}</h3>
                            <div className="space-y-1.5">
                                {group.items.map(([label, ...keys]) => (
                                    <div key={label} className="flex min-h-9 items-center justify-between gap-1 text-[11px]">
                                        <span className="min-w-0 whitespace-nowrap leading-4" style={{ color: theme.node.muted }}>{label}</span>
                                        <span className="flex shrink-0 items-center gap-[3px]">
                                            {keys.map((key, keyIndex) => (
                                                <span key={`${key}-${keyIndex}`} className="flex items-center gap-[3px]">
                                                    {keyIndex ? <span className="opacity-40">+</span> : null}
                                                    <kbd className="rounded-md border px-1 py-1 text-[11px] font-medium leading-none" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover, color: theme.node.text }}>{key}</kbd>
                                                </span>
                                            ))}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </Modal>
    );
}
