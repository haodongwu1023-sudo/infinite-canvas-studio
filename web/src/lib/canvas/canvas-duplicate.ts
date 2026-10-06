import { nanoid } from "nanoid";
import type { CanvasConnection, CanvasNodeData, Position } from "@/types/canvas";

export function duplicateCanvasSelection(
    nodes: CanvasNodeData[],
    connections: CanvasConnection[],
    selectedIds: Set<string>,
    offset: Position,
    createId: () => string = nanoid,
) {
    const groupIds = new Set(nodes.filter((node) => node.type === "group" && selectedIds.has(node.id)).map((node) => node.id));
    const copied = nodes.filter((node) => selectedIds.has(node.id) || (node.metadata?.groupId && groupIds.has(node.metadata.groupId)));
    const idMap = new Map(copied.map((node) => [node.id, createId()]));
    const nextNodes = copied.map((node) => ({
        ...node,
        id: idMap.get(node.id)!,
        title: node.title.endsWith(" Copy") ? node.title : `${node.title} Copy`,
        position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
        metadata: node.metadata ? { ...node.metadata, groupId: node.metadata.groupId ? idMap.get(node.metadata.groupId) || node.metadata.groupId : undefined } : undefined,
    }));
    const nextConnections = connections.flatMap((connection) => {
        const fromNodeId = idMap.get(connection.fromNodeId);
        const toNodeId = idMap.get(connection.toNodeId);
        return fromNodeId && toNodeId ? [{ ...connection, id: createId(), fromNodeId, toNodeId }] : [];
    });
    return { nodes: nextNodes, connections: nextConnections, selectedIds: [...selectedIds].flatMap((id) => idMap.has(id) ? [idMap.get(id)!] : []) };
}
