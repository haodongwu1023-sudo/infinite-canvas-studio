import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's type-stripping test runner requires the explicit .ts suffix.
import { mergeSharedState, reconcileSharedState, sharedStateFingerprint, type SharedState } from "./shared-local-merge.ts";

const persisted = (state: unknown) => JSON.stringify({ state, version: 0 });
const state = (parts: Partial<SharedState> = {}): SharedState => ({ appState: {}, localStorage: {}, factoryFilm: {}, imageLogs: {}, videoLogs: {}, ...parts });

test("first browser migration keeps existing assets and configured model scripts", () => {
    const rich = state({
        appState: { "infinite-canvas:asset_store": persisted({ assets: [{ id: "photo", updatedAt: "2026-09-20", kind: "image" }] }) },
        localStorage: {
            "infinite-canvas:ai_config_store": persisted({ config: { channels: [{ id: "default", apiKey: "saved-key", models: [{ name: "video", capability: "video", script: "saved script" }] }] } }),
        },
    });
    const empty = state({ localStorage: { "infinite-canvas:ai_config_store": persisted({ config: { channels: [{ id: "default", apiKey: "", models: [{ name: "video", capability: "video" }] }] } }) } });
    const merged = mergeSharedState(empty, rich, false);
    assert.equal(JSON.parse(merged.appState["infinite-canvas:asset_store"]).state.assets.length, 1);
    const channel = JSON.parse(merged.localStorage["infinite-canvas:ai_config_store"]).state.config.channels[0];
    assert.equal(channel.apiKey, "saved-key");
    assert.equal(channel.models[0].script, "saved script");
    const reopened = mergeSharedState(rich, empty, false);
    const reopenedChannel = JSON.parse(reopened.localStorage["infinite-canvas:ai_config_store"]).state.config.channels[0];
    assert.equal(reopenedChannel.apiKey, "saved-key");
    assert.equal(reopenedChannel.models[0].script, "saved script");
});

test("stale browsers merge projects by id and keep the latest edit", () => {
    const older = state({ appState: { "infinite-canvas:canvas_store": persisted({ projects: [{ id: "shared", updatedAt: "2026-09-01", title: "old" }, { id: "a", updatedAt: "2026-09-01" }], deletedProjects: [] }) } });
    const newer = state({ appState: { "infinite-canvas:canvas_store": persisted({ projects: [{ id: "shared", updatedAt: "2026-09-02", title: "new" }, { id: "b", updatedAt: "2026-09-02" }], deletedProjects: [] }) } });
    const projects = JSON.parse(mergeSharedState(older, newer, false).appState["infinite-canvas:canvas_store"]).state.projects;
    assert.deepEqual(new Set(projects.map((item: { id: string }) => item.id)), new Set(["shared", "a", "b"]));
    assert.equal(projects.find((item: { id: string }) => item.id === "shared").title, "new");
});

test("an up-to-date browser can remove an asset deliberately", () => {
    const remote = state({ appState: { "infinite-canvas:asset_store": persisted({ assets: [{ id: "photo" }] }) } });
    const local = state({ appState: { "infinite-canvas:asset_store": persisted({ assets: [] }) } });
    const merged = reconcileSharedState(remote, local, remote);
    assert.deepEqual(JSON.parse(merged.appState["infinite-canvas:asset_store"]).state.assets, []);
    const legacy = mergeSharedState(remote, local, false);
    assert.equal(JSON.parse(legacy.appState["infinite-canvas:asset_store"]).state.assets.length, 1, "a legacy snapshot without a base cannot delete saved assets");
});

test("factory shot cards from separate browsers are both retained", () => {
    const remote = state({ factoryFilm: { "factory-film-library:v1": { sources: [], styleProfiles: [], shotCards: [{ id: "a" }] } } });
    const local = state({ factoryFilm: { "factory-film-library:v1": { sources: [], styleProfiles: [], shotCards: [{ id: "b" }] } } });
    const cards = mergeSharedState(remote, local, false).factoryFilm["factory-film-library:v1"] as { shotCards: { id: string }[] };
    assert.deepEqual(new Set(cards.shotCards.map((item) => item.id)), new Set(["a", "b"]));
});

test("concurrent asset edits retain additions and intentional deletions", () => {
    const base = state({ appState: { assets: persisted({ assets: [{ id: "a", title: "old" }, { id: "delete" }] }) } });
    const remote = state({ appState: { assets: persisted({ assets: [{ id: "a", title: "remote" }, { id: "delete" }, { id: "remote-new" }] }) } });
    const local = state({ appState: { assets: persisted({ assets: [{ id: "a", title: "old" }, { id: "local-new" }] }) } });
    const result = JSON.parse(reconcileSharedState(remote, local, base).appState.assets).state.assets;
    assert.deepEqual(new Set(result.map((item: { id: string }) => item.id)), new Set(["a", "remote-new", "local-new"]));
    assert.equal(result.find((item: { id: string }) => item.id === "a").title, "remote");
});

test("a config edit does not overwrite a script changed in another browser", () => {
    const config = (script: string, size: string) => state({ localStorage: { config: persisted({ config: { channels: [{ id: "default", models: [{ name: "video", script }] }], size } }) } });
    const result = reconcileSharedState(config("new script", "1:1"), config("old script", "16:9"), config("old script", "1:1"));
    const merged = JSON.parse(result.localStorage.config).state.config;
    assert.equal(merged.channels[0].models[0].script, "new script");
    assert.equal(merged.size, "16:9");
});

test("runtime blob URLs do not make unchanged assets look edited", () => {
    const snapshot = (url: string) => state({ appState: { assets: persisted({ assets: [{ id: "a", data: { storageKey: "image:a", dataUrl: url } }] }) } });
    assert.equal(sharedStateFingerprint(snapshot("blob:http://localhost/a")), sharedStateFingerprint(snapshot("blob:http://localhost/b")));
});
