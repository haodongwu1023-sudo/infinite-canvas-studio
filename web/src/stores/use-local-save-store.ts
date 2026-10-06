import { create } from "zustand";

export const useLocalSaveStore = create<{
    phase: "loading" | "saving" | "saved" | "offline";
    savedAt: string;
    error: string;
}>(() => ({ phase: "loading", savedAt: "", error: "" }));
