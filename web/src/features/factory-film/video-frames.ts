export type CandidateFrame = { timeSec: number; dataUrl: string; score: number };

export const MAX_ANALYSIS_SECONDS = 600;
export const MAX_CANDIDATES = 30;

export function selectCandidateTimes(samples: Array<{ timeSec: number; score: number }>, maxCount = MAX_CANDIDATES) {
    if (samples.length <= maxCount) return samples.map((sample) => sample.timeSec);
    const selected = new Set<number>([0, samples.length - 1]);
    const byScore = samples.map((sample, index) => ({ index, score: sample.score })).sort((a, b) => b.score - a.score);
    for (const item of byScore) {
        if (selected.size >= maxCount) break;
        if ([...selected].some((index) => Math.abs(samples[index].timeSec - samples[item.index].timeSec) < 3)) continue;
        selected.add(item.index);
    }
    return [...selected].sort((a, b) => a - b).map((index) => samples[index].timeSec);
}

function seek(video: HTMLVideoElement, timeSec: number) {
    return new Promise<void>((resolve, reject) => {
        const target = Math.min(Math.max(0.05, timeSec), Math.max(0, video.duration - 0.01));
        if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.02) { resolve(); return; }
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error("参考片解码失败；请先把视频转换为 MP4，或导入离线抽出的关键帧。")); };
        const cleanup = () => { video.removeEventListener("seeked", onSeeked); video.removeEventListener("error", onError); };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = target;
    });
}

export async function extractCandidateFrames(file: File, startSec = 0): Promise<{ durationSec: number; frames: CandidateFrame[]; hasMore: boolean }> {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.src = url;
    try {
        await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error("浏览器无法读取该视频；MPG 请先离线抽帧后导入图片。"));
        });
        if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("无法读取视频时长。");
        if (startSec >= video.duration) throw new Error("本段起点超出视频时长，请重新填写秒数。");
        const end = Math.min(video.duration, Math.max(0, startSec) + MAX_ANALYSIS_SECONDS);
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * 320));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("浏览器无法抽取视频画面。");
        const samples: Array<{ timeSec: number; score: number }> = [];
        let previous: Uint8ClampedArray | null = null;
        for (let timeSec = Math.max(0, startSec); timeSec < end; timeSec += 2) {
            await seek(video, Math.min(timeSec, video.duration - 0.05));
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let difference = previous ? 0 : Number.POSITIVE_INFINITY;
            if (previous) {
                for (let i = 0; i < pixels.length; i += 16) difference += Math.abs(pixels[i] - previous[i]) + Math.abs(pixels[i + 1] - previous[i + 1]) + Math.abs(pixels[i + 2] - previous[i + 2]);
            }
            samples.push({ timeSec, score: difference });
            previous = pixels;
        }
        const selectedTimes = selectCandidateTimes(samples);
        const frames: CandidateFrame[] = [];
        for (const timeSec of selectedTimes) {
            await seek(video, Math.min(timeSec, video.duration - 0.05));
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push({ timeSec, dataUrl: canvas.toDataURL("image/jpeg", 0.82), score: samples.find((sample) => sample.timeSec === timeSec)?.score || 0 });
        }
        return { durationSec: video.duration, frames, hasMore: end < video.duration };
    } finally {
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(url);
    }
}
