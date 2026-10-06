import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { localForageStorage } from "@/lib/localforage-storage";
import { getStudioRecord, type StudioKind } from "@/features/studio-library/model";
import { useAssetStore } from "./use-asset-store";
import { useStudioEditorStore } from "./use-studio-editor-store";

export type StudioCategories = Partial<Record<StudioKind, string[]>>;
type CategoryStore = {
    categories: StudioCategories;
    add: (kind: StudioKind, name: string) => void;
    rename: (kind: StudioKind, name: string, nextName: string) => void;
    remove: (kind: StudioKind, name: string) => void;
    merge: (categories: StudioCategories) => void;
};

function updateCardCategories(kind: StudioKind, name: string, nextName: string) {
    const store = useAssetStore.getState();
    store.replaceAssets(
        store.assets.map((asset) => {
            const record = getStudioRecord(asset);
            return record?.kind === kind && record.category === name ? { ...asset, updatedAt: new Date().toISOString(), metadata: { ...asset.metadata, studio: { ...record, category: nextName } } } : asset;
        }),
    );
    const { draft } = useStudioEditorStore.getState();
    if (draft?.record.kind === kind && draft.record.category === name) useStudioEditorStore.setState({ draft: { ...draft, record: { ...draft.record, category: nextName } } });
}

export const useStudioCategoryStore = create<CategoryStore>()(
    persist(
        (set) => ({
            categories: {},
            add: (kind, name) => set((s) => ({ categories: { ...s.categories, [kind]: Array.from(new Set([...(s.categories[kind] || []), name.trim()])).filter(Boolean) } })),
            rename: (kind, name, nextName) => {
                const next = nextName.trim();
                if (!next || next === name) return;
                updateCardCategories(kind, name, next);
                set((s) => ({ categories: { ...s.categories, [kind]: Array.from(new Set([...(s.categories[kind] || []).filter((c) => c !== name), next])) } }));
            },
            remove: (kind, name) => {
                updateCardCategories(kind, name, "");
                set((s) => ({ categories: { ...s.categories, [kind]: (s.categories[kind] || []).filter((c) => c !== name) } }));
            },
            merge: (categories) =>
                set((s) => ({
                    categories: Object.fromEntries(
                        Array.from(new Set([...Object.keys(s.categories), ...Object.keys(categories)])).map((key) => {
                            const kind = key as StudioKind;
                            return [kind, Array.from(new Set([...(s.categories[kind] || []), ...(categories[kind] || [])]))];
                        }),
                    ),
                })),
        }),
        { name: "infinite-canvas:studio-categories", storage: createJSONStorage(() => localForageStorage) },
    ),
);
