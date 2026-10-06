import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, InputNumber, Modal, Select, Tag } from "antd";
import { nanoid } from "nanoid";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { uploadImage, resolveImageUrl } from "@/services/image-storage";
import { analyzeReferenceFrames, matchCustomerPhoto, type PhotoMatch } from "@/services/api/factory-film";
import { buildShotPrompt } from "@/features/factory-film/prompt";
import { factoryFilmStore } from "@/features/factory-film/store";
import { ensureFactoryFilmSeed } from "@/features/factory-film/seed";
import { exportFactoryFilmPackage, importFactoryFilmPackage } from "@/features/factory-film/transfer";
import { extractCandidateFrames, type CandidateFrame } from "@/features/factory-film/video-frames";
import type { FactoryFilmLibrary, ShotCard, SourceRecord, StyleProfile } from "@/features/factory-film/types";

export type FactoryShotInsert = { photo: ImageAsset; card: ShotCard; sourceTitle: string; style?: StyleProfile; prompt: string };
type ComposerDraft = { photoId: string; cardId: string; styleId: string; prompt: string; observation?: PhotoMatch };
const DRAFT_KEY = "factory-film-composer:v1";
const EMPTY_LIBRARY: FactoryFilmLibrary = { sources: [], styleProfiles: [], shotCards: [] };
const EMPTY_COMPOSER: ComposerDraft = { photoId: "", cardId: "", styleId: "", prompt: "" };

function blankCard(sourceId: string, timeSec: number): ShotCard {
    return { id: nanoid(), sourceId, startSec: timeSec, endSec: timeSec, title: `候选镜头 ${Math.round(timeSec)}s`, sceneCategory: "车间", subject: "", shotSize: "中景", cameraAngle: "平视", cameraMove: "缓慢推近", lighting: "", purpose: "", inputRequirement: "对应场景的客户实拍照片", method: "image-to-video", promptTemplate: "只让画面中真实可见的主体产生微小、合理的动态。", negativePrompt: "虚构设备、工序、文字和产品参数", risks: "", status: "draft" };
}

function readDraft(): ComposerDraft {
    try { return { ...EMPTY_COMPOSER, ...JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") }; }
    catch { return EMPTY_COMPOSER; }
}

export function FactoryFilmPanel({ onInsert }: { onInsert: (shot: FactoryShotInsert) => void }) {
    const { message, modal } = App.useApp();
    const config = useEffectiveConfig();
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const photos = assets.filter((asset): asset is ImageAsset => asset.kind === "image");
    const [library, setLibrary] = useState<FactoryFilmLibrary>(EMPTY_LIBRARY);
    const [mode, setMode] = useState<"make" | "library">("make");
    const [draft, setDraft] = useState<ComposerDraft>(readDraft);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");
    const [sourceTitle, setSourceTitle] = useState("");
    const [sourceUrl, setSourceUrl] = useState("");
    const [sourceType, setSourceType] = useState<SourceRecord["sourceType"]>("finished");
    const [sourceId, setSourceId] = useState("");
    const [startSec, setStartSec] = useState(0);
    const [editingCard, setEditingCard] = useState<ShotCard | null>(null);
    const [editingStyle, setEditingStyle] = useState<StyleProfile | null>(null);
    const [previews, setPreviews] = useState<Record<string, string>>({});

    const refresh = async () => setLibrary(await factoryFilmStore.getLibrary());
    useEffect(() => { void ensureFactoryFilmSeed().then(refresh).catch((error) => message.error(`初始镜头库载入失败：${String(error)}`)); }, []);
    useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft]);
    useEffect(() => {
        let alive = true;
        Promise.all(library.shotCards.filter((card) => card.keyframeStorageKey).map(async (card) => [card.id, await resolveImageUrl(card.keyframeStorageKey)] as const)).then((rows) => {
            if (alive) setPreviews(Object.fromEntries(rows));
        });
        return () => { alive = false; };
    }, [library.shotCards]);

    const approved = useMemo(() => library.shotCards.filter((card) => card.status === "approved"), [library.shotCards]);
    const photo = photos.find((item) => item.id === draft.photoId);
    const card = approved.find((item) => item.id === draft.cardId);
    const style = library.styleProfiles.find((item) => item.id === draft.styleId && item.status === "approved");

    const saveCard = async (next: ShotCard) => { await factoryFilmStore.saveShotCard(next); await refresh(); setEditingCard(null); };
    const saveStyle = async (next: StyleProfile) => { await factoryFilmStore.saveStyleProfile(next); await refresh(); setEditingStyle(null); };

    const importVideo = async (file: File) => {
        setBusy(true); setProgress("正在抽取候选画面…");
        let frames: CandidateFrame[] = [];
        try {
            const result = await extractCandidateFrames(file, startSec);
            frames = result.frames;
            const id = nanoid();
            const source: SourceRecord = { id, title: sourceTitle.trim() || file.name, fileName: file.name, sourceUrl: sourceUrl.trim(), sourceType, durationSec: result.durationSec, rightsNote: "仅研究拍法；关键帧不能作为客户工厂画面输入视频模型。原片保留在电脑文件夹。" };
            await factoryFilmStore.saveSource(source);
            setSourceId(id);
            const created: ShotCard[] = [];
            for (let index = 0; index < frames.length; index++) {
                const uploaded = await uploadImage(frames[index].dataUrl);
                const next = { ...blankCard(id, frames[index].timeSec), keyframeStorageKey: uploaded.storageKey };
                created.push(next);
                await factoryFilmStore.saveShotCard(next);
                setProgress(`已保存 ${index + 1}/${frames.length} 张候选画面`);
            }
            await refresh();
            if (result.hasMore) message.info("本次只分析连续 10 分钟；请调整起点导入下一段。");
            try {
                setProgress("AI 正在写镜头草稿…");
                const analyses = await analyzeReferenceFrames(config, frames, (count) => setProgress(`AI 已分析 ${count}/${frames.length} 帧`));
                for (const item of analyses) {
                    const original = created.find((candidate) => candidate.startSec === item.timeSec);
                    if (!original) continue;
                    await factoryFilmStore.saveShotCard({ ...original, title: item.title, sceneCategory: item.useCase || original.sceneCategory, subject: item.scene, cameraMove: item.camera, lighting: item.lighting, purpose: item.useCase, risks: item.cautions });
                }
                await refresh();
                message.success(`已生成 ${analyses.length} 张待审核镜头卡`);
            } catch (error) {
                message.warning(`AI 分析失败，候选帧和手工编辑入口已保留：${error instanceof Error ? error.message : String(error)}`);
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally { setBusy(false); setProgress(""); }
    };

    const importFrame = async (file: File) => {
        if (!sourceId) { message.warning("请先选择来源；MPG 可先离线抽帧，再导入图片。"); return; }
        try {
            const uploaded = await uploadImage(file);
            await saveCard({ ...blankCard(sourceId, startSec), keyframeStorageKey: uploaded.storageKey });
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    };

    const addOfflineSource = async () => {
        if (!sourceTitle.trim()) { message.warning("请填写来源片名。"); return; }
        const id = nanoid();
        await factoryFilmStore.saveSource({ id, title: sourceTitle.trim(), fileName: sourceTitle.trim(), sourceUrl: sourceUrl.trim(), sourceType, durationSec: 0, rightsNote: "离线抽帧来源；原视频留在电脑文件夹，仅用于研究拍法。" });
        setSourceId(id);
        await refresh();
    };

    const uploadPhoto = async (file: File) => {
        setBusy(true);
        try {
            const uploaded = await uploadImage(file);
            const id = addAsset({ kind: "image", title: file.name, coverUrl: uploaded.url, tags: ["工厂实拍"], source: "客户实拍", data: { dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType } });
            setDraft({ photoId: id, cardId: "", styleId: "", prompt: "" });
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    };

    const analyzePhoto = async () => {
        if (!photo || !approved.length) return;
        setBusy(true);
        try {
            const result = await matchCustomerPhoto(config, { url: photo.data.dataUrl, storageKey: photo.data.storageKey }, approved.map((item) => ({ id: item.id, title: item.title, scene: item.sceneCategory, requiredPhotos: item.inputRequirement })));
            const suggestedCard = approved.find((item) => item.id === result.recommendedIds[0]);
            const recommendedStyle = library.styleProfiles.find((item) => item.id === draft.styleId && item.status === "approved");
            const built = suggestedCard ? buildShotPrompt(suggestedCard, recommendedStyle, result) : undefined;
            setDraft((old) => ({ ...old, observation: result, cardId: suggestedCard?.id || old.cardId, prompt: built?.prompt || "" }));
            message.success("已按照片内容推荐镜头；请检查并编辑提示词。");
        } catch (error) { message.warning(`照片分析失败，照片已保留，可手动选卡和编写提示词：${error instanceof Error ? error.message : String(error)}`); }
        finally { setBusy(false); }
    };

    const chooseCard = (id: string) => {
        const next = approved.find((item) => item.id === id);
        const built = next && draft.observation ? buildShotPrompt(next, style, draft.observation) : undefined;
        setDraft((old) => ({ ...old, cardId: id, prompt: built?.prompt || old.prompt }));
    };
    const chooseStyle = (id: string) => {
        const nextStyle = library.styleProfiles.find((item) => item.id === id);
        const built = card && draft.observation ? buildShotPrompt(card, nextStyle, draft.observation) : undefined;
        setDraft((old) => ({ ...old, styleId: id, prompt: built?.prompt || old.prompt }));
    };

    const downloadPackage = async () => {
        const blob = await exportFactoryFilmPackage(library);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = `工厂镜头库-${new Date().toISOString().slice(0, 10)}.zip`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const restorePackage = async (file: File) => { await importFactoryFilmPackage(file); await refresh(); message.success("镜头库已恢复"); };

    return <div className="h-full overflow-y-auto px-3 pb-8 text-sm">
        <div className="mb-3 flex gap-2"><Button size="small" type={mode === "make" ? "primary" : "default"} onClick={() => setMode("make")}>照片套镜头</Button><Button size="small" type={mode === "library" ? "primary" : "default"} onClick={() => setMode("library")}>拉片建库</Button></div>
        {mode === "make" ? <div className="space-y-3">
            <div className="font-semibold">1. 客户工厂实拍照片</div>
            <Select className="w-full" value={draft.photoId || undefined} placeholder="选择已上传照片" onChange={(photoId) => setDraft({ photoId, cardId: "", styleId: "", prompt: "" })} options={photos.map((item) => ({ value: item.id, label: item.title }))} />
            <input type="file" accept="image/*" aria-label="上传客户工厂照片" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); event.currentTarget.value = ""; }} />
            {photo ? <img src={photo.data.dataUrl} alt={photo.title} className="max-h-44 w-full rounded object-contain" /> : null}
            <Button loading={busy} disabled={!photo || !approved.length} onClick={() => void analyzePhoto()}>AI 看图推荐镜头</Button>
            {!approved.length ? <p>镜头库暂无已审核卡片。请先在「拉片建库」审核至少一张。</p> : null}
            {draft.observation ? <div className="rounded border p-2"><div>照片观察：{draft.observation.description}</div>{draft.observation.missingRequirements.length ? <div className="mt-1 text-amber-500">建议补拍：{draft.observation.missingRequirements.join("；")}</div> : null}</div> : null}
            <div className="font-semibold">2. 选镜头与风格</div>
            <Select className="w-full" value={draft.cardId || undefined} placeholder="选择已审核镜头" onChange={chooseCard} options={approved.map((item) => ({ value: item.id, label: item.title }))} />
            <Select className="w-full" allowClear value={draft.styleId || undefined} placeholder="风格档案（可选）" onChange={(id) => chooseStyle(id || "")} options={library.styleProfiles.filter((item) => item.status === "approved").map((item) => ({ value: item.id, label: item.name }))} />
            {card ? <div className="rounded border p-2">{previews[card.id] ? <img src={previews[card.id]} alt="参考片关键帧" className="mb-1 max-h-32 w-full object-contain" /> : null}<div>{card.purpose}</div><div>所需实拍：{card.inputRequirement}</div><div>风险：{card.risks}</div>{card.method === "real" ? <div className="text-amber-500">此镜头优先实拍视频，建议补拍真实动作。</div> : null}</div> : null}
            <div className="font-semibold">3. 检查并编辑提示词</div>
            <Input.TextArea rows={9} value={draft.prompt} onChange={(event) => setDraft((old) => ({ ...old, prompt: event.target.value }))} placeholder="可先用 AI 看图生成，也可依据照片手工编写。请勿编造设备、工序、产品参数。" />
            <Button type="primary" disabled={!photo || !card || card.method === "real" || !draft.prompt.trim()} onClick={() => { if (photo && card) onInsert({ photo, card, sourceTitle: library.sources.find((item) => item.id === card.sourceId)?.title || card.sourceId, style, prompt: draft.prompt.trim() }); }}>放入画布分镜</Button>
            <p className="text-xs opacity-70">进入画布后可再次编辑视频节点提示词，确认后逐镜生成并导出。参考片关键帧不会输入视频模型。</p>
        </div> : <div className="space-y-3">
            <div className="font-semibold">导入参考片</div>
            <Input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="来源片名" />
            <Input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="原片出处网址（可后补）" />
            <Select className="w-full" value={sourceType} onChange={setSourceType} options={[{ value: "finished", label: "成片" }, { value: "broll", label: "生产过程素材" }]} />
            <label>本段起点（秒） <InputNumber min={0} value={startSec} onChange={(value) => setStartSec(value || 0)} /></label>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} aria-label="导入参考视频" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importVideo(file); event.currentTarget.value = ""; }} />
            <Button size="small" onClick={() => void addOfflineSource()}>新增离线来源（MPG 抽帧）</Button>
            <p className="text-xs opacity-70">单次最多 10 分钟、30 张候选帧。MPG 请离线抽帧；原视频不存入浏览器。</p>
            {progress ? <div>{progress}</div> : null}
            <Select className="w-full" value={sourceId || undefined} placeholder="选择已有来源" onChange={setSourceId} options={library.sources.map((item) => ({ value: item.id, label: item.title }))} />
            {library.sources.find((item) => item.id === sourceId) ? <div className="rounded border p-2 text-xs"><div>{library.sources.find((item) => item.id === sourceId)?.sourceType === "finished" ? "成片" : "生产过程素材"} · {library.sources.find((item) => item.id === sourceId)?.fileName}</div><div>{library.sources.find((item) => item.id === sourceId)?.rightsNote}</div></div> : null}
            <input type="file" accept="image/*" aria-label="导入离线关键帧" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFrame(file); event.currentTarget.value = ""; }} />
            <Button onClick={() => setEditingCard(blankCard(sourceId, startSec))} disabled={!sourceId}>手动建卡</Button>
            <div className="font-semibold">风格档案</div>
            <Button onClick={() => setEditingStyle({ id: nanoid(), sourceId: sourceId || undefined, name: "新风格", palette: "", lighting: "", camera: "", pacing: "", sound: "", status: "draft" })}>新建风格档案</Button>
            {library.styleProfiles.map((item) => <div key={item.id} className="flex items-center justify-between rounded border p-2"><span>{item.name} <Tag>{item.status === "approved" ? "已审核" : "草稿"}</Tag></span><Button size="small" onClick={() => setEditingStyle({ ...item })}>编辑</Button></div>)}
            <div className="font-semibold">镜头卡：{library.shotCards.length} 张 · 已审核 {approved.length} 张</div>
            {library.shotCards.filter((item) => !sourceId || item.sourceId === sourceId).map((item) => <div key={item.id} className="rounded border p-2"><div className="flex gap-2">{previews[item.id] ? <img src={previews[item.id]} alt={item.title} className="h-16 w-24 object-cover" /> : null}<div className="min-w-0 flex-1"><div>{item.title}</div><div className="text-xs opacity-70">{item.startSec.toFixed(1)}s · {item.status === "approved" ? "已审核" : "草稿"}</div></div><Button size="small" onClick={() => setEditingCard({ ...item })}>审核</Button></div></div>)}
            <div className="font-semibold">备份与恢复</div>
            <Button onClick={() => void downloadPackage()}>导出资产包</Button>
            <input type="file" accept=".zip,application/zip" aria-label="导入资产包" onChange={(event) => { const file = event.target.files?.[0]; if (file) modal.confirm({ title: "恢复镜头库？", content: "导入会替换当前的风格档案和镜头卡。建议先导出当前资产包。", okText: "确认恢复", cancelText: "取消", onOk: () => restorePackage(file).catch((error) => { message.error(String(error)); throw error; }) }); event.currentTarget.value = ""; }} />
        </div>}
        {editingCard ? <Modal open title="镜头卡审核" footer={null} onCancel={() => setEditingCard(null)} width={640}><div className="max-h-[70vh] space-y-2 overflow-y-auto"><h3 className="font-semibold">镜头卡审核</h3>{(["title", "sceneCategory", "subject", "shotSize", "cameraAngle", "cameraMove", "lighting", "purpose", "inputRequirement", "promptTemplate", "negativePrompt", "risks"] as const).map((key) => <label key={key} className="block text-xs">{({ title: "标题", sceneCategory: "适用场景", subject: "参考片可见主体", shotSize: "景别", cameraAngle: "机位", cameraMove: "运镜", lighting: "光线", purpose: "用途", inputRequirement: "所需客户实拍", promptTemplate: "提示词结构", negativePrompt: "避免内容", risks: "易错之处" } as Record<string, string>)[key]}<Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} value={editingCard[key]} onChange={(event) => setEditingCard({ ...editingCard, [key]: event.target.value })} /></label>)}<Select className="w-full" value={editingCard.method} onChange={(method) => setEditingCard({ ...editingCard, method })} options={[{ value: "real", label: "优先实拍视频" }, { value: "image-to-video", label: "照片生成视频" }, { value: "image-edit-to-video", label: "修图后生成视频" }]} /><div className="flex gap-2"><Button onClick={() => setEditingCard(null)}>取消</Button><Button onClick={() => void saveCard({ ...editingCard, status: "draft" })}>保存草稿</Button><Button type="primary" onClick={() => void saveCard({ ...editingCard, status: "approved" })}>审核通过</Button></div></div></Modal> : null}
        {editingStyle ? <Modal open title="风格档案" footer={null} onCancel={() => setEditingStyle(null)} width={640}><div className="max-h-[70vh] space-y-2 overflow-y-auto"><h3 className="font-semibold">风格档案</h3>{(["name", "palette", "lighting", "camera", "pacing", "sound"] as const).map((key) => <label key={key} className="block text-xs">{({ name: "名称", palette: "色彩", lighting: "光线", camera: "运镜", pacing: "节奏（仅成片可判断）", sound: "声音" } as Record<string, string>)[key]}<Input.TextArea autoSize={{ minRows: 1, maxRows: 3 }} value={editingStyle[key]} onChange={(event) => setEditingStyle({ ...editingStyle, [key]: event.target.value })} /></label>)}<div className="flex gap-2"><Button onClick={() => setEditingStyle(null)}>取消</Button><Button onClick={() => void saveStyle({ ...editingStyle, status: "draft" })}>保存草稿</Button><Button type="primary" onClick={() => void saveStyle({ ...editingStyle, status: "approved" })}>审核通过</Button></div></div></Modal> : null}
    </div>;
}
