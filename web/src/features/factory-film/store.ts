import localforage from "localforage";
import { notifyLocalDataSaved } from "@/lib/local-data-events";
import type { FactoryFilmLibrary, ShotCard, SourceRecord, StyleProfile } from "./types";

const STORAGE_KEY = "factory-film-library:v1";
const storage = localforage.createInstance({ name: "infinite-canvas", storeName: "factory_film" });
type StorageAdapter = Pick<typeof storage, "getItem" | "setItem">;

const emptyLibrary = (): FactoryFilmLibrary => ({ sources: [], styleProfiles: [], shotCards: [] });

export function createFactoryFilmStore(adapter: StorageAdapter = storage) {
    let pending: Promise<unknown> = Promise.resolve();
    const getLibrary = async (): Promise<FactoryFilmLibrary> => (await adapter.getItem<FactoryFilmLibrary>(STORAGE_KEY)) ?? emptyLibrary();
    const write = <T>(edit: (library: FactoryFilmLibrary) => T) => {
        const operation = pending.then(async () => {
            const library = await getLibrary();
            const result = edit(library);
            await adapter.setItem(STORAGE_KEY, library);
            notifyLocalDataSaved();
            return result;
        });
        pending = operation.catch(() => undefined);
        return operation;
    };
    return {
        getLibrary,
        saveSource: (source: SourceRecord) => write((library) => upsert(library.sources, source)),
        deleteSource: (id: string) => write((library) => {
            library.sources = library.sources.filter((item) => item.id !== id);
            library.styleProfiles = library.styleProfiles.filter((item) => item.sourceId !== id);
            library.shotCards = library.shotCards.filter((item) => item.sourceId !== id);
        }),
        saveStyleProfile: (profile: StyleProfile) => write((library) => upsert(library.styleProfiles, profile)),
        deleteStyleProfile: (id: string) => write((library) => { library.styleProfiles = library.styleProfiles.filter((item) => item.id !== id); }),
        saveShotCard: (card: ShotCard) => write((library) => upsert(library.shotCards, card)),
        deleteShotCard: (id: string) => write((library) => { library.shotCards = library.shotCards.filter((item) => item.id !== id); }),
        listApprovedShotCards: async () => (await getLibrary()).shotCards.filter((card) => card.status === "approved"),
        replaceLibrary: (replacement: FactoryFilmLibrary) => write((library) => {
            library.sources = [...replacement.sources];
            library.styleProfiles = [...replacement.styleProfiles];
            library.shotCards = [...replacement.shotCards];
        }),
    };
}

function upsert<T extends { id: string }>(items: T[], item: T) {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index < 0) items.push(item);
    else items[index] = item;
}

export const factoryFilmStore = createFactoryFilmStore();
