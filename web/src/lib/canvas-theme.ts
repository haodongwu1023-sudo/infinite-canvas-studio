export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#edf2f8",
            dot: "rgba(81,100,128,.20)",
            line: "rgba(81,100,128,.08)",
            selectionStroke: "#356ceb",
            selectionFill: "rgba(53,108,235,.06)",
        },
        node: {
            label: "#596170",
            fill: "#e8ebef",
            panel: "#fbfdff",
            stroke: "rgba(95,115,145,.20)",
            activeStroke: "#356ceb",
            placeholder: "#8a919e",
            text: "#242933",
            muted: "#707887",
            faint: "#a0a7b2",
        },
        toolbar: {
            panel: "rgba(255,255,255,.76)",
            border: "rgba(255,255,255,.82)",
            item: "#596170",
            itemHover: "rgba(96,126,171,.12)",
            activeBg: "rgba(72,116,200,.17)",
            activeText: "#242933",
            shadow: "0 18px 48px rgba(36,58,94,.16), 0 2px 8px rgba(36,58,94,.08), inset 0 1px 0 rgba(255,255,255,.68)",
        },
        chrome: {
            panel: "rgba(246,249,253,.82)",
            border: "rgba(255,255,255,.7)",
            topFade: "linear-gradient(to bottom, rgba(237,242,248,.86), rgba(237,242,248,0))",
        },
        connection: {
            line: "#909bac",
            active: "#356ceb",
            halo: "rgba(53,108,235,.12)",
        },
        status: {
            success: "#24865b",
            warning: "#ab761c",
            danger: "#cb4b58",
        },
    },
    dark: {
        canvas: {
            background: "#101620",
            dot: "rgba(172,181,201,.19)",
            line: "rgba(172,181,201,.07)",
            selectionStroke: "#82aaff",
            selectionFill: "rgba(130,170,255,.08)",
        },
        node: {
            label: "#b8bfcd",
            fill: "#272a32",
            panel: "#1b2431",
            stroke: "rgba(171,194,229,.16)",
            activeStroke: "#82aaff",
            placeholder: "#89919f",
            text: "#edf0f7",
            muted: "#949dae",
            faint: "#646e80",
        },
        toolbar: {
            panel: "rgba(29,36,49,.76)",
            border: "rgba(188,211,246,.17)",
            item: "#b8bfcd",
            itemHover: "rgba(178,203,241,.10)",
            activeBg: "rgba(130,170,255,.20)",
            activeText: "#edf0f7",
            shadow: "0 20px 54px rgba(0,5,14,.42), 0 3px 12px rgba(0,5,14,.22), inset 0 1px 0 rgba(224,238,255,.10)",
        },
        chrome: {
            panel: "rgba(23,30,42,.82)",
            border: "rgba(188,211,246,.15)",
            topFade: "linear-gradient(to bottom, rgba(16,22,32,.82), rgba(16,22,32,0))",
        },
        connection: {
            line: "#78879e",
            active: "#82aaff",
            halo: "rgba(130,170,255,.14)",
        },
        status: {
            success: "#65bc94",
            warning: "#d4ab63",
            danger: "#ef8691",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
