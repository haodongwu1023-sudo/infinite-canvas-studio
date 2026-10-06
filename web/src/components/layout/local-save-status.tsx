import { Check, HardDrive, LoaderCircle, RefreshCw } from "lucide-react";
import { useLocalSaveStore } from "@/stores/use-local-save-store";
import { syncNow } from "@/services/shared-local-sync";

export function LocalSaveStatus() {
    const { phase, savedAt, error } = useLocalSaveStore();
    const busy = phase === "loading" || phase === "saving";
    const text = phase === "saved" ? "已保存到本机" : phase === "offline" ? "仅存于此浏览器 · 重试同步" : phase === "saving" ? "正在保存资产与配置…" : "正在读取本机资料…";
    const Icon = busy ? LoaderCircle : phase === "saved" ? Check : RefreshCw;
    const title = phase === "offline" ? `${error}。点击重试；浏览器中的原资料仍保留。` : `本机不同浏览器共用资产与配置。${savedAt ? `最近保存：${new Date(savedAt).toLocaleString()}` : ""} 点击立即同步。`;
    return (
        <button type="button" aria-label={text} title={title} disabled={busy} onClick={() => void syncNow().catch(() => undefined)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-inherit opacity-70 hover:bg-black/5 hover:opacity-100 disabled:cursor-wait dark:hover:bg-white/10">
            <HardDrive size={12} />
            <span role="status" aria-live="polite">{text}</span>
            <Icon size={12} className={busy ? "animate-spin" : ""} />
        </button>
    );
}
