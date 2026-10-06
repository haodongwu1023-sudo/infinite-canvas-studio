export type CanvasShortcut = "undo" | "redo" | "selectAll" | "group" | "ungroup" | "copy" | "paste" | "duplicate" | "connect" | "generate" | "create" | "select" | "pan" | "search" | "zoomIn" | "zoomOut" | "zoomReset" | "delete" | "escape";

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

export function resolveCanvasShortcut(event: KeyLike): CanvasShortcut | null {
    const key = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (event.altKey) return !command && key === "g" ? (event.shiftKey ? "ungroup" : "group") : null;
    if (command) {
        if (key === "+" || key === "=") return "zoomIn";
        if (key === "-" || key === "_") return "zoomOut";
        if (key === "z") return event.shiftKey ? "redo" : "undo";
        if (event.shiftKey) return key === "g" ? "ungroup" : null;
        if (key === "y") return "redo";
        if (key === "a") return "selectAll";
        if (key === "g") return "group";
        if (key === "c") return "copy";
        if (key === "v") return "paste";
        if (key === "d") return "duplicate";
        if (key === "l") return "connect";
        if (key === "f") return "search";
        if (key === "enter") return "generate";
        if (key === "0") return "zoomReset";
        return null;
    }
    if (event.shiftKey) return null;
    if (key === "tab") return "create";
    if (key === "v") return "select";
    if (key === "h") return "pan";
    if (key === "delete" || key === "backspace") return "delete";
    if (key === "escape") return "escape";
    return null;
}
