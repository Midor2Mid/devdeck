// Theme system: each theme is a full palette of the app's CSS custom properties
// plus matching terminal (xterm) and editor (Monaco) colors. All wabi-sabi.

export type ThemeId = "sumi" | "washi" | "slate"

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
    "--faint": "#888173",
    "--accent": "#b8895c",
    "--accent-soft": "#caa07a",
    "--on-accent": "#14110d",
    "--moss": "#8c9a68",
    "--clay": "#c4855d",
    "--ok": "#8c9a68",
    "--danger": "#b66b5f",
    "--on-danger": "#14110d",
    "--elev-1": "0 1px 2px rgba(0,0,0,.24), 0 1px 1px rgba(0,0,0,.16)",
    "--elev-2": "0 4px 12px -2px rgba(0,0,0,.30), 0 2px 4px rgba(0,0,0,.20)",
    "--elev-3": "0 18px 48px -12px rgba(0,0,0,.55), 0 6px 16px rgba(0,0,0,.30)"
}

const WASHI_VARS = {
    "--bg": "#f4efe4",
    "--bg-2": "#ece5d6",
    "--bg-3": "#fbf7ee",
    "--panel": "#ece5d6",
    "--border": "#d8cdb8",
    "--border-soft": "#e3dac8",
    // The :root derivation (border 65% + text 35%) is asymmetric across modes:
    // mixing toward a dark text on a light ground gains far less contrast than
    // mixing toward light text on a dark one, so Washi's derived border-strong
    // lands at 2.51:1 where the dark themes get ~3.7:1. Washi is the only light
    // theme, so it states its own value — 3.05:1, clear of the 3:1 floor.
    "--border-strong": "#918879",
    "--text": "#3a342b",
    "--muted": "#6f6757",
    "--faint": "#756c5c",
    "--accent": "#b07a4a",
    "--accent-soft": "#9c6a3d",
    "--on-accent": "#14110d",
    "--moss": "#7f8c54",
    "--clay": "#b06a44",
    "--ok": "#7f8c54",
    "--danger": "#b0563f",
    "--on-danger": "#f6f6f4",
    "--elev-1": "0 1px 2px rgba(60,50,35,.10), 0 1px 1px rgba(60,50,35,.06)",
    "--elev-2": "0 4px 12px -2px rgba(60,50,35,.14), 0 2px 4px rgba(60,50,35,.10)",
    "--elev-3": "0 18px 48px -12px rgba(60,50,35,.20), 0 6px 16px rgba(60,50,35,.12)"
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
    "--faint": "#737b8b",
    "--accent": "#eba65c",
    "--accent-soft": "#f2bd83",
    "--on-accent": "#14110d",
    "--moss": "#5fce8f",
    // A desaturated clay for agent badges, distinct from the amber accent so
    // "agent" doesn't read as a second accent instance (matches Sumi/Zen).
    "--clay": "#c9906a",
    "--ok": "#5fce8f",
    "--danger": "#e9786b",
    "--on-danger": "#14110d",
    "--elev-1": "0 1px 2px rgba(0,0,0,.24), 0 1px 1px rgba(0,0,0,.16)",
    "--elev-2": "0 4px 12px -2px rgba(0,0,0,.30), 0 2px 4px rgba(0,0,0,.20)",
    "--elev-3": "0 18px 48px -12px rgba(0,0,0,.55), 0 6px 16px rgba(0,0,0,.30)"
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

/** The skin a fresh install gets. Must match `DEFAULTS.appearance` in settings.ts. */
export const DEFAULT_THEME_ID: ThemeId = "slate"

/**
 * Resolve a persisted theme id to a theme, defaulting when it names none.
 *
 * 0.12.0 shipped seven themes; three survive. `settings.json` is untyped JSON on
 * disk, so it can still name a deleted theme - or, hand-edited, no string at
 * all - and indexing `THEMES` directly would hand `undefined` to applyTheme and
 * paint an unstyled window. Ownership rather than truthiness, so "constructor"
 * misses instead of resolving to an inherited function.
 */
export function resolveTheme(id: unknown): Theme {
    return typeof id === "string" && Object.prototype.hasOwnProperty.call(THEMES, id)
        ? THEMES[id as ThemeId]
        : THEMES[DEFAULT_THEME_ID]
}

/** Apply a theme's CSS variables, then override the accent (user choice). */
export function applyTheme(id: ThemeId, accent?: string): void {
    const theme = resolveTheme(id)
    const root = document.documentElement
    for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v)
    const ac = accent || theme.accent
    root.style.setProperty("--accent", ac)
    // Light themes read better with a darker accent-soft; dark themes a lighter one.
    root.style.setProperty("--accent-soft", shade(ac, theme.mode === "light" ? -0.18 : 0.18))
    // The resolved id, not the requested one - the attribute must never name a
    // theme the palette above did not actually apply.
    root.dataset.theme = theme.id
}

// ---------- Design styles (shape / depth / type - independent of color) ----------
// A *style* sets how surfaces feel: corner radius, border weight, depth, and
// typography. It layers on top of the color themes above (style × theme are
// orthogonal). The CSS lives under `[data-style="..."]` in styles.css.
export type StyleId = "wabi" | "modern"

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
    modern: {
        id: "modern",
        label: "Modern Pro",
        description: "Contemporary product UI: clean 8px radii, subtle elevation, tight grotesk type, line icons. Pairs with Slate."
    }
}

/** The style a fresh install gets. Must match `DEFAULTS.appearance` in settings.ts. */
export const DEFAULT_STYLE_ID: StyleId = "modern"

/** Resolve a persisted style id to a style, defaulting when it names none. See resolveTheme. */
export function resolveStyle(id: unknown): DesignStyle {
    return typeof id === "string" && Object.prototype.hasOwnProperty.call(STYLES, id)
        ? STYLES[id as StyleId]
        : STYLES[DEFAULT_STYLE_ID]
}

/** Apply a design style (sets the `data-style` attribute the CSS keys off). */
export function applyStyle(id: StyleId): void {
    document.documentElement.dataset.style = resolveStyle(id).id
}

/**
 * Coerce a persisted appearance block onto skins that still exist.
 *
 * Resolving inside applyTheme/applyStyle is not enough on its own: the store
 * keeps whatever settings.json said, and every other reader indexes THAT -
 * the Monaco panels' `THEMES[theme].monacoId`, the xterm palette, the accent
 * Reset button. Left alone, a 0.12.0 profile naming a deleted skin paints a
 * correct window that the Appearance picker then shows as nothing-selected,
 * and throws the first time a terminal asks for its palette.
 *
 * The accent is deliberately not touched. It is a user choice that outlives
 * the theme it was first defaulted from, and we cannot tell a picked colour
 * from an inherited one - so we keep it rather than silently discard it.
 */
export function migrateAppearance<T extends { theme: ThemeId; style: StyleId }>(appearance: T): T {
    return { ...appearance, theme: resolveTheme(appearance.theme).id, style: resolveStyle(appearance.style).id }
}
