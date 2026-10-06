import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

import { emptySharedState, mergeSharedState, reconcileSharedState, sharedStateFingerprint, type SharedState } from "./src/lib/shared-local-merge";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../data/local-browser-sync");
const stateFile = join(root, "state.json");
const blobStores = ["image_files", "media_files"] as const;
type BlobStore = typeof blobStores[number];
type StoredState = { revision: number; state: SharedState; savedAt?: string };
let writeQueue: Promise<unknown> = Promise.resolve();

export function localSharedStorage(): Plugin {
    const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        void handleRequest(request, response).then((handled) => { if (!handled) next(); }).catch((error) => {
            response.statusCode = 500;
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Local storage failed" }));
        });
    };
    return {
        name: "local-shared-storage",
        configureServer(server) { server.middlewares.use("/__canvas_local_sync", middleware); },
        configurePreviewServer(server) { server.middlewares.use("/__canvas_local_sync", middleware); },
    };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/state" && url.pathname !== "/blob") return false;
    const address = request.socket.remoteAddress || "";
    const host = String(request.headers.host || "");
    const origin = String(request.headers.origin || "");
    if (!(["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address) && /^(127\.0\.0\.1|localhost):\d+$/.test(host) && (!origin || new URL(origin).host === host))) {
        respond(response, 403, { error: "Only this computer can access shared canvas data" });
        return true;
    }
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/state") {
        if (request.method === "GET") {
            respond(response, 200, { ...(await loadState()), blobs: await listBlobs() });
            return true;
        }
        if (request.method === "POST") {
            const body = JSON.parse((await readBody(request)).toString("utf8")) as { baseRevision?: number; baseState?: SharedState; state?: SharedState };
            if (!validState(body.state) || (body.baseState && !validState(body.baseState))) throw new Error("Invalid canvas state");
            const operation = writeQueue.then(async () => {
                const current = await loadState();
                // Legacy tabs do not send an acknowledged base. Never treat their stale
                // whole-library snapshot as an intentional deletion, even at the latest revision.
                const merged = body.baseState ? reconcileSharedState(current.state, body.state!, body.baseState) : mergeSharedState(current.state, body.state!, false);
                if (sharedStateFingerprint(merged) === sharedStateFingerprint(current.state)) return current;
                // Keep recoverable originals before accepting migrations or a new revision.
                if (!body.baseState) await writeJsonAtomic(join(root, "imports", `${Date.now()}-${randomUUID()}.json`), body.state);
                if (current.revision) await writeJsonAtomic(join(root, "revisions", `${current.revision}.json`), current);
                const result = { revision: current.revision + 1, state: merged, savedAt: new Date().toISOString() };
                await writeJsonAtomic(stateFile, result);
                return result;
            });
            writeQueue = operation.catch(() => undefined);
            respond(response, 200, { ...(await operation), blobs: await listBlobs() });
            return true;
        }
    }
    if (url.pathname === "/blob") {
        const store = url.searchParams.get("store") as BlobStore;
        const key = url.searchParams.get("key") || "";
        if (!blobStores.includes(store) || !/^[\w:.-]{1,200}$/.test(key)) {
            respond(response, 400, { error: "Invalid media key" });
            return true;
        }
        const base = join(root, store, Buffer.from(key).toString("base64url"));
        const metaPath = `${base}.json`;
        const filePath = `${base}.bin`;
        if (request.method === "PUT") {
            await mkdir(dirname(base), { recursive: true, mode: 0o700 });
            const temporary = `${base}.${process.pid}.${Date.now()}.tmp`;
            try {
                await pipeline(request, createWriteStream(temporary, { mode: 0o600 }));
                const info = await stat(temporary);
                await rename(temporary, filePath);
                await writeJsonAtomic(metaPath, { key, type: String(request.headers["content-type"] || "application/octet-stream"), size: info.size });
                respond(response, 200, { key, size: info.size });
            } catch (error) {
                await rm(temporary, { force: true }).catch(() => undefined);
                throw error;
            }
            return true;
        }
        if (request.method === "GET") {
            try {
                const meta = JSON.parse(await readFile(metaPath, "utf8")) as { type: string; size: number };
                response.statusCode = 200;
                response.setHeader("Content-Type", meta.type);
                response.setHeader("Content-Length", meta.size);
                await pipeline(createReadStream(filePath), response);
            } catch {
                if (!response.headersSent) respond(response, 404, { error: "Media not found" });
            }
            return true;
        }
    }
    respond(response, 405, { error: "Method not allowed" });
    return true;
}

async function loadState(): Promise<StoredState> {
    try {
        const parsed = JSON.parse(await readFile(stateFile, "utf8")) as StoredState;
        if (!validState(parsed.state)) throw new Error("Saved canvas data is invalid; original file was preserved");
        return { revision: Number(parsed.revision) || 0, state: parsed.state, savedAt: parsed.savedAt };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return { revision: 0, state: emptySharedState() };
    }
}

function validState(value: unknown): value is SharedState {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return Object.keys(emptySharedState()).every((key) => record[key] && typeof record[key] === "object" && !Array.isArray(record[key])) &&
        ["appState", "localStorage"].every((key) => Object.values(record[key] as Record<string, unknown>).every((entry) => typeof entry === "string"));
}

async function listBlobs() {
    const blobs: Record<BlobStore, Record<string, { type: string; size: number }>> = { image_files: {}, media_files: {} };
    for (const store of blobStores) {
        const directory = join(root, store);
        const files = await readdir(directory).catch(() => []);
        for (const name of files.filter((item) => item.endsWith(".json"))) {
            try {
                const meta = JSON.parse(await readFile(join(directory, name), "utf8")) as { key: string; type: string; size: number };
                if (await stat(join(directory, `${name.slice(0, -5)}.bin`))) blobs[store][meta.key] = { type: meta.type, size: meta.size };
            } catch { /* An interrupted upload has no complete file to share. */ }
        }
    }
    return blobs;
}

async function writeJsonAtomic(path: string, value: unknown) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, path);
}

async function readBody(request: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

function respond(response: ServerResponse, code: number, value: unknown) {
    response.statusCode = code;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(value));
}
