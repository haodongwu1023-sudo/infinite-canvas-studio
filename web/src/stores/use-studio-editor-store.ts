import { create } from "zustand";
import type { StudioRecord, StudioKind } from "@/features/studio-library/model";
import { createStudioRecord, getStudioRecord } from "@/features/studio-library/model";
import type { Asset } from "./use-asset-store";

export type StudioDraft = { assetId?: string; title: string; tags: string[]; record: StudioRecord };
type State = {
    draft: StudioDraft | null;
    revision: number;
    dirty: boolean;
    create: (kind: StudioKind, category?: string) => void;
    edit: (asset: Asset) => void;
    update: (draft: StudioDraft) => void;
    close: () => void;
    saved: (assetId: string) => void;
};
export const useStudioEditorStore = create<State>((set) => ({
    draft: null,
    revision: 0,
    dirty: false,
    create: (kind, category = "") => set((s) => ({ draft: { title: "", tags: [], record: { ...createStudioRecord(kind), category } }, dirty: false, revision: s.revision + 1 })),
    edit: (asset) => {
        const record = getStudioRecord(asset);
        if (record) set((s) => ({ draft: { assetId: asset.id, title: asset.title, tags: [...asset.tags], record: structuredClone(record) }, dirty: false, revision: s.revision + 1 }));
    },
    update: (draft) => set({ draft, dirty: true }),
    close: () => set((s) => ({ draft: null, dirty: false, revision: s.revision + 1 })),
    saved: (assetId) => set((s) => ({ draft: s.draft ? { ...s.draft, assetId } : null, dirty: false })),
}));
