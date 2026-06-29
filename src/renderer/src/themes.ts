// Theme system: each theme is a full palette of the app's CSS custom properties
// plus matching terminal (xterm) and editor (Monaco) colors. All wabi-sabi.

export type ThemeId = "sumi" | "washi" | "zen" | "slate" | "graphite"

export interface XtermTheme {
    background: string
    foreground: string
    cursor: string
    cursorAccent: string
    selectionBackground: string
    black: string
    brightBlack: string
    red: string
    brightRed: string
    green: string
    brightGreen: string
    yellow: string
    brightYellow: string
    blue: string
    brightBlue: string
    magenta: string
    brightMagenta: string
    cyan: string
    brightCyan: string
    white: string
    brightWhite: string
}

export interface Theme {
    id: ThemeId
    label: string
    mode: "dark" | "light"
    accent: string
    vars: Record<string, string>
    xterm: XtermTheme
    monacoId: string
    /** xterm line spacing - higher = airier. */
    termLineHeight: number
}

// Density/typography vars per feel. Sumi/Washi are compact; Zen is airy.
const COMPACT = {
    "--radius": "7px",
    "--row-py": "7px",
    "--brand-weight": "500",
    "--brand-spacing": "1.5px"
}
const AIRY = {
    "--radius": "11px",
    "--row-py": "10px",
    "--brand-weight": "300",
    "--brand-spacing": "3px"
}

const SUMI_VARS = {
    "--bg": "#1b1a18",
    "--bg-2": "#211f1c",
    "--bg-3": "#141312",
    "--panel": "#1f1d1a",
    "--border": "#322e28",
    "--border-soft": "#28241f",
    "--text": "#e4ddcf",
    "--muted": "#9d9486",
    "--faint": "#7c7568",
    "--accent": "#b8895c",
    "--accent-soft": "#caa07a",
    "--moss": "#8c9a68",
    "--clay": "#c4855d",
    "--ok": "#8c9a68",
    "--danger": "#b66b5f"
}

const WASHI_VARS = {
    "--bg": "#f4efe4",
    "--bg-2": "#ece5d6",
    "--bg-3": "#fbf7ee",
    "--panel": "#ece5d6",
    "--border": "#d8cdb8",
    "--border-soft": "#e3dac8",
    "--text": "#3a342b",
    "--muted": "#6f6757",
    "--faint": "#8a7f6b",
    "--accent": "#b07a4a",
    "--accent-soft": "#9c6a3d",
    "--moss": "#7f8c54",
    "--clay": "#b06a44",
    "--ok": "#7f8c54",
    "--danger": "#b0563f"
}

const ZEN_VARS = {
    "--bg": "#17150f",
    "--bg-2": "#1d1b14",
    "--bg-3": "#100e0a",
    "--panel": "#1d1b14",
    "--border": "#2a261c",
    "--border-soft": "#221f17",
    "--text": "#ece5d2",
    "--muted": "#a3987f",
    "--faint": "#7a7058",
    "--accent": "#c2a878",
    "--accent-soft": "#d8c39a",
    "--moss": "#9aa56f",
    "--clay": "#c79a6a",
    "--ok": "#9aa56f",
    "--danger": "#c2766a"
}

// Cool slate - modern neutral ground keeping the warm amber accent.
const SLATE_VARS = {
    "--bg": "#0c0e13",
    "--bg-2": "#13161d",
    "--bg-3": "#0a0c11",
    "--panel": "#13161d",
    "--border": "#252a35",
    "--border-soft": "#1d212a",
    "--text": "#e7eaf1",
    "--muted": "#99a1b2",
    "--faint": "#6f7686",
    "--accent": "#eba65c",
    "--accent-soft": "#f2bd83",
    "--moss": "#5fce8f",
    "--clay": "#eba65c",
    "--ok": "#5fce8f",
    "--danger": "#e9786b"
}

// Graphite - a modern, cool near-black palette with a vivid indigo accent.
// The contemporary counterpoint to the warm wabi-sabi themes (opt-in).
const GRAPHITE_VARS = {
    "--bg": "#0c0e12",
    "--bg-2": "#13161c",
    "--bg-3": "#090a0e",
    "--panel": "#13161c",
    "--border": "#242a33",
    "--border-soft": "#1a1f27",
    "--text": "#e7eaf0",
    "--muted": "#9aa3b2",
    "--faint": "#646e7e",
    "--accent": "#7c83ff",
    "--accent-soft": "#9ba0ff",
    "--moss": "#56c98a",
    "--clay": "#a78bfa",
    "--ok": "#56c98a",
    "--danger": "#f0616d"
}

export const THEMES: Record<ThemeId, Theme> = {
    sumi: {
        id: "sumi",
        label: "Sumi (dark)",
        mode: "dark",
        accent: "#b8895c",
        vars: { ...SUMI_VARS, ...COMPACT },
        monacoId: "devdeck-sumi",
        termLineHeight: 1.0,
        xterm: {
            background: "#141312",
            foreground: "#e4ddcf",
            cursor: "#b8895c",
            cursorAccent: "#141312",
            selectionBackground: "#3a352e",
            black: "#141312",
            brightBlack: "#5f594f",
            red: "#b66b5f",
            brightRed: "#c98074",
            green: "#8c9a68",
            brightGreen: "#a3b07f",
            yellow: "#c4a35d",
            brightYellow: "#d4b878",
            blue: "#7c8ba1",
            brightBlue: "#94a3b8",
            magenta: "#a98ba5",
            brightMagenta: "#bfa3bb",
            cyan: "#7fa0a0",
            brightCyan: "#97b5b5",
            white: "#e4ddcf",
            brightWhite: "#f2ece0"
        }
    },
    washi: {
        id: "washi",
        label: "Washi (light)",
        mode: "light",
        accent: "#b07a4a",
        vars: { ...WASHI_VARS, ...COMPACT },
        monacoId: "devdeck-washi",
        termLineHeight: 1.0,
        xterm: {
            background: "#fbf7ee",
            foreground: "#3a342b",
            cursor: "#b07a4a",
            cursorAccent: "#fbf7ee",
            selectionBackground: "#e3dac8",
            black: "#3a342b",
            brightBlack: "#857c6c",
            red: "#a0492f",
            brightRed: "#b0563f",
            green: "#5f6e3a",
            brightGreen: "#6f7e44",
            yellow: "#9a7320",
            brightYellow: "#a8842f",
            blue: "#4a5f7a",
            brightBlue: "#5a6f8a",
            magenta: "#7a5070",
            brightMagenta: "#8a6080",
            cyan: "#3f6e6e",
            brightCyan: "#4f7e7e",
            white: "#3a342b",
            brightWhite: "#1f1b15"
        }
    },
    slate: {
        id: "slate",
        label: "Slate (modern)",
        mode: "dark",
        accent: "#eba65c",
        vars: { ...SLATE_VARS, ...COMPACT },
        monacoId: "devdeck-sumi",
        termLineHeight: 1.1,
        xterm: {
            background: "#0a0c11",
            foreground: "#e7eaf1",
            cursor: "#eba65c",
            cursorAccent: "#0a0c11",
            selectionBackground: "#27303f",
            black: "#0a0c11",
            brightBlack: "#565d6c",
            red: "#e9786b",
            brightRed: "#f08a7e",
            green: "#5fce8f",
            brightGreen: "#7ad9a3",
            yellow: "#eba65c",
            brightYellow: "#f2bd83",
            blue: "#6aa6ff",
            brightBlue: "#8bbcff",
            magenta: "#b69bf0",
            brightMagenta: "#c9b4f5",
            cyan: "#5fd0c4",
            brightCyan: "#82ddd3",
            white: "#e7eaf1",
            brightWhite: "#f6f8fc"
        }
    },
    graphite: {
        id: "graphite",
        label: "Graphite (modern)",
        mode: "dark",
        accent: "#7c83ff",
        vars: { ...GRAPHITE_VARS, ...COMPACT },
        monacoId: "devdeck-graphite",
        termLineHeight: 1.15,
        xterm: {
            background: "#090a0e",
            foreground: "#e7eaf0",
            cursor: "#7c83ff",
            cursorAccent: "#090a0e",
            selectionBackground: "#252b3a",
            black: "#090a0e",
            brightBlack: "#646e7e",
            red: "#f0616d",
            brightRed: "#ff7d88",
            green: "#56c98a",
            brightGreen: "#74d9a1",
            yellow: "#e0b85c",
            brightYellow: "#edc878",
            blue: "#6aa6ff",
            brightBlue: "#8bbcff",
            magenta: "#a78bfa",
            brightMagenta: "#c0a9fc",
            cyan: "#56cfd0",
            brightCyan: "#7adedf",
            white: "#e7eaf0",
            brightWhite: "#f6f8fc"
        }
    },
    zen: {
        id: "zen",
        label: "Zen (dark)",
        mode: "dark",
        accent: "#c2a878",
        vars: { ...ZEN_VARS, ...AIRY },
        monacoId: "devdeck-zen",
        termLineHeight: 1.3,
        xterm: {
            background: "#100e0a",
            foreground: "#ece5d2",
            cursor: "#c2a878",
            cursorAccent: "#100e0a",
            selectionBackground: "#332d20",
            black: "#100e0a",
            brightBlack: "#5b5443",
            red: "#c2766a",
            brightRed: "#d18a7e",
            green: "#9aa56f",
            brightGreen: "#aeb985",
            yellow: "#c2a878",
            brightYellow: "#d8c39a",
            blue: "#8593a3",
            brightBlue: "#9aa8b8",
            magenta: "#b09aac",
            brightMagenta: "#c2aebf",
            cyan: "#8aa6a6",
            brightCyan: "#a0bcbc",
            white: "#ece5d2",
            brightWhite: "#f7f1e2"
        }
    }
}

/** Shift a hex color toward white (amt>0) or black (amt<0) - derives accent-soft. */
export function shade(hex: string, amt: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return hex
    const n = parseInt(m[1], 16)
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
        amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)
    )
    return (
        "#" +
        ch.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")
    )
}

/** Apply a theme's CSS variables, then override the accent (user choice). */
export function applyTheme(id: ThemeId, accent?: string): void {
    const theme = THEMES[id] ?? THEMES.sumi
    const root = document.documentElement
    for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v)
    const ac = accent || theme.accent
    root.style.setProperty("--accent", ac)
    // Light themes read better with a darker accent-soft; dark themes a lighter one.
    root.style.setProperty("--accent-soft", shade(ac, theme.mode === "light" ? -0.18 : 0.18))
    root.dataset.theme = id
}

// ---------- Design styles (shape / depth / type - independent of color) ----------
// A *style* sets how surfaces feel: corner radius, border weight, depth, and
// typography. It layers on top of the color themes above (style × theme are
// orthogonal). The CSS lives under `[data-style="..."]` in styles.css.
export type StyleId =
    | "wabi"
    | "minimal"
    | "neon"
    | "flat"
    | "bauhaus"
    | "crt"
    | "modern"
    | "lacquer"
    | "modernplus"

export interface DesignStyle {
    id: StyleId
    label: string
    description: string
}

export const STYLES: Record<StyleId, DesignStyle> = {
    wabi: {
        id: "wabi",
        label: "Wabi-sabi",
        description: "Warm, soft, generous - the original feel."
    },
    minimal: {
        id: "minimal",
        label: "Modern Minimal",
        description: "Crisp small radii, flat surfaces, tight spacing - Linear/Vercel-style."
    },
    neon: {
        id: "neon",
        label: "Neon",
        description: "Glassy panels, glowing accents & scanlines. Best on a dark theme - set a cyan accent for classic neon."
    },
    flat: {
        id: "flat",
        label: "Flat Vector",
        description: "Friendly & product-y: big rounded corners, soft elevation, filled accent buttons."
    },
    bauhaus: {
        id: "bauhaus",
        label: "Bauhaus",
        description: "Bold & structural: hard square corners, heavy frames, hard offset shadows, uppercase type."
    },
    crt: {
        id: "crt",
        label: "Phosphor CRT",
        description: "Retro terminal: monospace everything, scanlines, phosphor glow. Set a green accent on a dark theme."
    },
    modern: {
        id: "modern",
        label: "Modern Pro",
        description: "Contemporary product UI: clean 8px radii, subtle elevation, tight grotesk type, line icons. Pairs with Slate."
    },
    lacquer: {
        id: "lacquer",
        label: "Lacquer",
        description: "Opulent urushi gloss: frosted-glass surfaces, gilded gradient buttons, a soft accent glow and deep layered shadows. Elegant, not flashy."
    },
    modernplus: {
        id: "modernplus",
        label: "Modern+",
        description: "Contemporary & alive: crisp radii, hairline borders with soft elevation, vivid filled accent buttons, focus rings and snappy hover/press micro-interactions. Pairs with Graphite."
    }
}

/** Apply a design style (sets the `data-style` attribute the CSS keys off). */
export function applyStyle(id: StyleId): void {
    document.documentElement.dataset.style = STYLES[id] ? id : "wabi"
}
