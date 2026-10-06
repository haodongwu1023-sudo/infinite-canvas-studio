import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the storage service with an in-memory IndexedDB adapter.
function loadStorage() {
    const tables = new Map();
    const table = name => {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name);
    };
    const localforage = {createInstance: ({storeName}) => ({
        iterate: async callback => {for (const [key, value] of table(storeName)) callback(value, key);},
        removeItem: async key => {table(storeName).delete(key);},
    })};
    const source = readFileSync(new URL('./file-storage.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
    const exports = {};
    const dependencies = {localforage, nanoid: {nanoid: () => 'test'}, '@/stores/use-config-store': {withLocalProxy: url => url}};
    new Function('require', 'exports', compiled)(name => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
    }, exports);
    return {...exports, table};
}

test('cleanup preserves historical video and live nested assets, projects and draft media', async () => {
    const storage = loadStorage();
    const files = storage.table('media_files');
    for (const key of ['video:history', 'video:project', 'audio:asset', 'audio:draft', 'video:unused']) files.set(key, new Blob([key]));
    storage.table('video_generation_logs').set('generation', {video: {storageKey: 'video:history'}});
    await storage.cleanupUnusedMedia({assets: [{metadata: {studio: {media: [{storageKey: 'audio:asset'}]}}}], projects: [{nodes: [{metadata: {storageKey: 'video:project'}}]}], draft: {record: {media: [{storageKey: 'audio:draft'}]}}});
    assert.deepEqual([...files.keys()].sort(), ['audio:asset', 'audio:draft', 'video:history', 'video:project']);
});

test('cleanup preserves media referenced only by generation retry keys', async () => {
    const storage = loadStorage();
    const files = storage.table('media_files');
    for (const key of ['video:reference', 'audio:reference', 'video:unused']) files.set(key, new Blob([key]));
    await storage.cleanupUnusedMedia({projects: [{nodes: [{metadata: {references: ['video:reference', 'audio:reference']}}]}]});
    assert.deepEqual([...files.keys()].sort(), ['audio:reference', 'video:reference']);
});

test('cleanup aborts before deletion if generation history cannot be read', async () => {
    const storage = loadStorage();
    const files = storage.table('media_files');
    files.set('video:history', new Blob(['history']));
    storage.table('video_generation_logs')[Symbol.iterator] = () => {throw new Error('history unavailable');};
    await assert.rejects(storage.cleanupUnusedMedia({}), /history unavailable/);
    assert.ok(files.has('video:history'));
});
