import assert from "node:assert/strict";
import test from "node:test";

import { duplicateCanvasSelection } from "./canvas-duplicate.ts";

const node = (id, x, groupId) => ({ id, type: id === "group" ? "group" : "image", title: id, position: { x, y: 20 }, width: 100, height: 80, metadata: groupId ? { groupId } : {} });

test("duplicates a selected group with its members and internal connections", () => {
    let next = 0;
    const result = duplicateCanvasSelection(
        [node("group", 0), node("one", 10, "group"), node("two", 120, "group")],
        [{ id: "line", fromNodeId: "one", toNodeId: "two" }],
        new Set(["group"]),
        { x: 36, y: 36 },
        () => `copy-${++next}`,
    );
    assert.equal(result.nodes.length, 3);
    assert.equal(result.nodes[1].metadata.groupId, result.nodes[0].id);
    assert.equal(result.nodes[0].position.x, 36);
    assert.deepEqual(result.connections.map(({ fromNodeId, toNodeId }) => [fromNodeId, toNodeId]), [[result.nodes[1].id, result.nodes[2].id]]);
    assert.deepEqual(result.selectedIds, [result.nodes[0].id]);
});

test("keeps a copied child in its original group when the group is not copied", () => {
    let next = 0;
    const result = duplicateCanvasSelection([node("group", 0), node("one", 10, "group")], [], new Set(["one"]), { x: 0, y: 0 }, () => `copy-${++next}`);
    assert.equal(result.nodes[0].metadata.groupId, "group");
});
