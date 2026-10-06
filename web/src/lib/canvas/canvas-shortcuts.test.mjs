import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanvasShortcut } from "./canvas-shortcuts.ts";

const key = (value, extra = {}) => ({ key: value, code: value === " " ? "Space" : undefined, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...extra });

test("matches the canvas creation and navigation shortcuts", () => {
    assert.equal(resolveCanvasShortcut(key("Tab")), "create");
    assert.equal(resolveCanvasShortcut(key("v")), "select");
    assert.equal(resolveCanvasShortcut(key("h")), "pan");
    assert.equal(resolveCanvasShortcut(key("f", { ctrlKey: true })), "search");
    assert.equal(resolveCanvasShortcut(key("Enter", { ctrlKey: true })), "generate");
});

test("matches zoom, copy, and connection shortcuts with their modifiers", () => {
    assert.equal(resolveCanvasShortcut(key("+", { ctrlKey: true })), "zoomIn");
    assert.equal(resolveCanvasShortcut(key("=", { metaKey: true })), "zoomIn");
    assert.equal(resolveCanvasShortcut(key("+", { ctrlKey: true, shiftKey: true })), "zoomIn");
    assert.equal(resolveCanvasShortcut(key("-", { ctrlKey: true })), "zoomOut");
    assert.equal(resolveCanvasShortcut(key("0", { ctrlKey: true })), "zoomReset");
    assert.equal(resolveCanvasShortcut(key("d", { ctrlKey: true })), "duplicate");
    assert.equal(resolveCanvasShortcut(key("l", { ctrlKey: true })), "connect");
    assert.equal(resolveCanvasShortcut(key("g", { ctrlKey: true, shiftKey: true })), "ungroup");
    assert.equal(resolveCanvasShortcut(key("g", { altKey: true })), "group");
    assert.equal(resolveCanvasShortcut(key("g", { altKey: true, shiftKey: true })), "ungroup");
});

test("does not claim modified letter keys or plain typing as shortcuts", () => {
    assert.equal(resolveCanvasShortcut(key("h", { ctrlKey: true })), null);
    assert.equal(resolveCanvasShortcut(key("f", { ctrlKey: true, altKey: true })), null);
    assert.equal(resolveCanvasShortcut(key("Enter")), null);
});
