import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { create } from 'zustand';
import * as middleware from 'zustand/middleware';
import * as fflate from 'fflate';

// Run the production modules with in-memory persistence and download adapters.
function load(path, dependencies = {}) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
    const exports = {};
    new Function('require', 'exports', compiled)(name => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
    }, exports);
    return exports;
}

const model = load('./model.ts');
const zip = load('../../lib/zip.ts', {fflate});
const memoryStorage = (data = new Map()) => ({
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
    iterate: async callback => {for (const [key, value] of data) callback(value, key);},
});

function card(id, kind = 'prompt', category = '旧分类') {
    return {id, kind: 'text', title: id, coverUrl: '', tags: ['保留标签'], createdAt: '2026-01-01', updatedAt: '2026-01-01', data: {content: '保留完整正文'}, metadata: {extra: '保留字段', studio: {...model.createStudioRecord(kind), category}}};
}

function media(storageKey, kind) {
    return {id: storageKey, name: storageKey, kind, storageKey, url: `blob:old-${storageKey}`, mimeType: kind === 'image' ? 'image/png' : 'audio/wav'};
}

function transferHarness() {
    const tables = new Map();
    const table = name => {
        if (!tables.has(name)) tables.set(name, new Map());
        return tables.get(name);
    };
    const fileStorage = load('../../services/file-storage.ts', {
        localforage: {createInstance: ({storeName}) => memoryStorage(table(storeName))},
        nanoid: {nanoid: () => 'test'},
        '@/stores/use-config-store': {withLocalProxy: url => url},
    });
    const imageUrls = new Map();
    const imageStorage = {
        getImageBlob: async key => table('images').get(key),
        setImageBlob: async (key, blob) => {
            table('images').set(key, blob);
            imageUrls.set(key, URL.createObjectURL(blob));
        },
        resolveImageUrl: async (key, fallback = '') => imageUrls.get(key) || fallback,
    };
    const hydration = load('./media.ts', {
        '@/services/image-storage': imageStorage,
        '@/services/file-storage': fileStorage,
        './model': model,
    });
    let downloaded;
    const api = load('../../pages/assets/asset-transfer.ts', {
        'file-saver': {saveAs: blob => {downloaded = blob;}},
        '@/lib/zip': zip,
        '@/services/file-storage': fileStorage,
        '@/services/image-storage': imageStorage,
        '@/features/studio-library/media': hydration,
        '@/features/studio-library/model': model,
    });
    return {...api, table, download: () => downloaded};
}

async function packageBlob(overrides, files = []) {
    const manifest = {app: 'infinite-canvas', version: 1, assets: [], files: [], ...overrides};
    return zip.createZip([{name: 'assets.json', data: JSON.stringify(manifest)}, ...files]);
}

test('ZIP restores nested image/audio media and storyboard frames with fresh URLs', async () => {
    const api = transferHarness();
    const character = card('人物', 'character');
    character.metadata.studio.media = [media('image:portrait', 'image'), media('audio:voice', 'audio')];
    const storyboard = card('分镜', 'storyboard');
    storyboard.metadata.studio.frames[0].image = media('image:frame', 'image');
    const blobs = new Map([
        ['image:portrait', new Blob(['portrait bytes'], {type: 'image/png'})],
        ['image:frame', new Blob(['frame bytes'], {type: 'image/png'})],
        ['audio:voice', new Blob(['voice bytes'], {type: 'audio/wav'})],
    ]);
    for (const [key, blob] of blobs) api.table(key.startsWith('image:') ? 'images' : 'media_files').set(key, blob);
    await api.exportAssets([character, storyboard], 'studio.zip', {character: ['空分类']});
    const entries = await zip.readZip(api.download());
    const manifest = JSON.parse(await entries.get('assets.json').text());
    assert.deepEqual(manifest.files.map(item => item.storageKey).sort(), [...blobs.keys()].sort());
    for (const item of manifest.files) assert.equal(await entries.get(item.path).text(), await blobs.get(item.storageKey).text());
    api.table('images').clear();
    api.table('media_files').clear();
    const result = await api.readStudioAssetPackage(api.download());
    assert.deepEqual(result.categories, {character: ['空分类']});
    assert.equal(result.assets.length, 2);
    for (const [key, blob] of blobs) {
        const restored = api.table(key.startsWith('image:') ? 'images' : 'media_files').get(key);
        assert.equal(await restored.text(), await blob.text());
        assert.equal(restored.type, blob.type);
    }
    const record = result.assets[0].metadata.studio;
    for (const item of [...record.media, result.assets[1].metadata.studio.frames[0].image]) {
        assert.ok(item.url.startsWith('blob:'));
        assert.notEqual(item.url, `blob:old-${item.storageKey}`);
        assert.equal(await (await fetch(item.url)).text(), await blobs.get(item.storageKey).text());
    }
    assert.equal(result.assets[0].coverUrl, record.media[0].url);
    assert.equal(result.assets[1].coverUrl, result.assets[1].metadata.studio.frames[0].image.url);
    assert.equal(result.assets[0].data.content, '保留完整正文');
});

test('empty categories round-trip and the legacy asset-array API stays compatible', async () => {
    const api = transferHarness();
    const categories = {prompt: ['空分类'], storyboard: ['待创作']};
    await api.exportAssets([], 'categories.zip', categories);
    assert.deepEqual(await api.readStudioAssetPackage(api.download()), {assets: [], categories});
    assert.deepEqual(await api.readAssetPackage(api.download()), []);
    const original = card('原有提示词');
    await api.exportAssets([original], 'legacy.zip');
    assert.deepEqual(await api.readAssetPackage(api.download()), [original]);
    assert.deepEqual((await api.readStudioAssetPackage(api.download())).categories, {});
});

test('invalid category fields, asset records and missing nested media are rejected', async () => {
    const api = transferHarness();
    for (const studioCategories of [null, [], {unknown: ['分类']}, {prompt: [1]}, {prompt: [' ']}, {prompt: '分类'}]) {
        await assert.rejects(api.readStudioAssetPackage(await packageBlob({studioCategories})), /分类格式不正确/);
    }
    await assert.rejects(api.readStudioAssetPackage(await packageBlob({version: 2})), /不是受支持/);
    await assert.rejects(api.readStudioAssetPackage(await packageBlob({assets: [null]})), /内容不完整/);
    const invalid = card('错误卡片');
    invalid.metadata.studio.media = 'bad';
    await assert.rejects(api.readStudioAssetPackage(await packageBlob({assets: [invalid]})), /创作卡格式不正确/);
    const nested = card('缺少媒体', 'character');
    nested.metadata.studio.media = [media('audio:missing', 'audio')];
    await assert.rejects(api.readStudioAssetPackage(await packageBlob({assets: [nested]})), /缺少被引用/);
    await assert.rejects(api.readStudioAssetPackage(await packageBlob({assets: [nested], files: [{storageKey: 'audio:missing', path: 'files/missing.wav', mimeType: 'audio/wav', bytes: 1}]})), /缺少媒体文件/);
    assert.equal(api.table('media_files').size, 0);
    const normalized = await api.readStudioAssetPackage(await packageBlob({studioCategories: {prompt: [' x ', 'x']}}));
    assert.deepEqual(normalized.categories, {prompt: ['x']});
});

test('export fails when a nested media file is missing', async () => {
    const api = transferHarness();
    const asset = card('缺图', 'storyboard');
    asset.metadata.studio.frames[0].image = media('image:missing', 'image');
    await assert.rejects(api.exportAssets([asset], 'missing.zip'), /素材文件缺失/);
    assert.equal(api.download(), undefined);
});

test('category rename/delete preserves assets and unsaved draft content, scoped by kind', () => {
    const assets = create(set => ({assets: [card('提示词'), card('场景', 'scene')], replaceAssets: value => set({assets: value})}));
    const editor = load('../../stores/use-studio-editor-store.ts', {zustand: {create}, '@/features/studio-library/model': model}).useStudioEditorStore;
    const categories = load('../../stores/use-studio-category-store.ts', {
        zustand: {create}, 'zustand/middleware': middleware,
        '@/lib/localforage-storage': {localForageStorage: memoryStorage()},
        '@/features/studio-library/model': model,
        './use-asset-store': {useAssetStore: assets},
        './use-studio-editor-store': {useStudioEditorStore: editor},
    }).useStudioCategoryStore;
    categories.getState().add('prompt', '旧分类');
    categories.getState().add('prompt', '空分类');
    editor.getState().edit(assets.getState().assets[0]);
    editor.getState().update({...editor.getState().draft, title: '未保存标题'});
    categories.getState().rename('prompt', '旧分类', '新分类');
    assert.deepEqual(categories.getState().categories.prompt, ['空分类', '新分类']);
    assert.equal(assets.getState().assets[0].metadata.studio.category, '新分类');
    assert.equal(assets.getState().assets[1].metadata.studio.category, '旧分类');
    assert.equal(editor.getState().draft.record.category, '新分类');
    assert.equal(editor.getState().draft.title, '未保存标题');
    assert.equal(editor.getState().dirty, true);
    categories.getState().remove('prompt', '新分类');
    assert.equal(assets.getState().assets.length, 2);
    assert.equal(assets.getState().assets[0].metadata.studio.category, '');
    assert.equal(assets.getState().assets[0].data.content, '保留完整正文');
    assert.equal(assets.getState().assets[0].metadata.extra, '保留字段');
    assert.deepEqual(assets.getState().assets[0].tags, ['保留标签']);
    assert.equal(editor.getState().draft.record.category, '');
    assert.equal(editor.getState().draft.title, '未保存标题');
    assert.equal(editor.getState().dirty, true);
    categories.getState().rename('prompt', '空分类', '新空分类');
    categories.getState().merge({prompt: ['新空分类', '导入分类'], storyboard: ['分镜空分类']});
    assert.deepEqual(categories.getState().categories, {prompt: ['新空分类', '导入分类'], storyboard: ['分镜空分类']});
});
