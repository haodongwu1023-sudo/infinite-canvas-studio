export type ReviewStatus = "draft" | "approved";

export type SourceRecord = {
    id: string;
    title: string;
    fileName: string;
    sourceUrl: string;
    sourceType: "finished" | "broll";
    durationSec: number;
    rightsNote: string;
};

export type StyleProfile = {
    id: string;
    sourceId?: string;
    name: string;
    palette: string;
    lighting: string;
    camera: string;
    pacing: string;
    sound: string;
    status: ReviewStatus;
};

export type ShotCard = {
    id: string;
    sourceId: string;
    startSec: number;
    endSec: number;
    keyframeStorageKey?: string;
    title: string;
    sceneCategory: string;
    subject: string;
    shotSize: string;
    cameraAngle: string;
    cameraMove: string;
    lighting: string;
    purpose: string;
    inputRequirement: string;
    method: "real" | "image-to-video" | "image-edit-to-video";
    promptTemplate: string;
    negativePrompt: string;
    risks: string;
    status: ReviewStatus;
};

export type FactoryFilmLibrary = {
    sources: SourceRecord[];
    styleProfiles: StyleProfile[];
    shotCards: ShotCard[];
};
