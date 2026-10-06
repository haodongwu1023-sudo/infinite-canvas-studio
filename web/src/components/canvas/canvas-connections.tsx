import type { MouseEvent as ReactMouseEvent } from "react";
import { useId } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

export function ConnectionPath({
    connection,
    from,
    to,
    active,
    onSelect,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    active: boolean;
    onSelect: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const markerId = `connection-arrow-${useId()}`;
    const stroke = active ? theme.connection.active : theme.connection.line;
    const startX = from.position.x + from.width;
    const startY = from.position.y + from.height / 2;
    const endX = to.position.x;
    const endY = to.position.y + to.height / 2;
    const dx = Math.abs(endX - startX);
    const curvature = Math.max(dx * 0.5, 50);
    const pathD = `M ${startX} ${startY} C ${startX + curvature} ${startY}, ${endX - curvature} ${endY}, ${endX} ${endY}`;

    return (
        <g>
            <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="19" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
            </defs>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            />
            {active ? <path d={pathD} stroke={theme.connection.halo} strokeWidth="10" fill="none" style={{ pointerEvents: "none" }} /> : null}
            <path
                d={pathD}
                stroke={stroke}
                strokeWidth={active ? 2.5 : 1.75}
                strokeLinecap="round"
                markerEnd={`url(#${markerId})`}
                fill="none"
                style={{ pointerEvents: "none" }}
            />
        </g>
    );
}

export function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const markerId = `draft-arrow-${useId()}`;
    if (!node) return null;

    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
    const snappedEndY = handle.handleType === "source" && target ? target.position.y + target.height / 2 : endY;
    const curvature = Math.max(Math.abs(snappedEndX - snappedStartX) * 0.5, 50);
    const pathD = `M ${snappedStartX} ${snappedStartY} C ${snappedStartX + curvature} ${snappedStartY}, ${snappedEndX - curvature} ${snappedEndY}, ${snappedEndX} ${snappedEndY}`;

    return (
        <g style={{ pointerEvents: "none" }}>
            <defs>
                <marker id={markerId} viewBox="0 0 10 10" refX="19" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={theme.connection.active} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
            </defs>
            <path d={pathD} stroke={theme.connection.active} strokeWidth="2" fill="none" strokeDasharray={target ? undefined : "6 5"} markerEnd={`url(#${markerId})`} />
            {target ? <circle cx={handle.handleType === "source" ? snappedEndX : snappedStartX} cy={handle.handleType === "source" ? snappedEndY : snappedStartY} r="9" fill={theme.node.panel} stroke={theme.connection.active} strokeWidth="2" /> : null}
        </g>
    );
}
