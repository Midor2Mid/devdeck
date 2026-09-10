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
    /**
     * The theme's literal palette. It deliberately does **not** declare
     * `--accent-soft`, `--accent-lift` or `--on-accent`: those three are
     * functions of whichever accent is actually resolved (a user can pick
     * their own), so `deriveAccentVars` below owns them and nothing here may
     * state a second value for them. A literal that `applyTheme` overwrites is
     * a number future work will measure against and the app will never paint.
     */
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

/** Every colour in this file is a 6-digit hex, with or without the leading `#`. */
const HEX6 = /^#?([0-9a-f]{6})$/i

/** Shift a hex color toward white (amt>0) or black (amt<0) - the hover step's primitive. */
export function shade(hex: string, amt: number): string {
    const m = HEX6.exec(hex.trim())
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

/** WCAG 2.x relative luminance, 0 (black) to 1 (white). 0 for an unparseable hex. */
export function relLuminance(hex: string): number {
    const m = HEX6.exec(hex.trim())
    if (!m) return 0
    const n = parseInt(m[1], 16)
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** WCAG contrast ratio between two hex colors, 1 (identical) to 21 (black on white). */
export function contrast(a: string, b: string): number {
    const la = relLuminance(a)
    const lb = relLuminance(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * The two inks a filled accent block can carry. Both are values the palette
 * already ships - `--on-accent`'s old literal, and Washi's `--on-danger` - so
 * deriving the ink introduces no new colour, only a choice between two.
 */
const INK_DARK = "#14110d"
const INK_LIGHT = "#f6f6f4"

/**
 * The luminance at which INK_DARK and INK_LIGHT contrast *equally* against the
 * same colour, for THIS ink pair: sqrt((Ld + 0.05) * (Ll + 0.05)) - 0.05,
 * where Ld = 0.00579 and Ll = 0.92036. At or above it a colour takes dark ink;
 * below it, light ink. Picking the pair's own crossover rather than pure
 * black/white's 0.1791 is what maximises the worst case below.
 *
 * One constant with one meaning - "which pole is this colour nearer, for
 * contrast purposes" - and that single question answers both questions below:
 * which ink does this fill take, and which way is *away* from this ground.
 *
 * The worst case is a real limit, not an oversight: an accent sitting exactly
 * on the crossover gives **4.17:1** whichever ink it takes, under the 4.5 text
 * floor. No two-ink scheme can do better - clearing 4.5 for every possible
 * accent needs an ink pair at 20.25:1 or more, which only pure black on pure
 * white reaches (4.58:1), and spending the palette's warm near-black to buy
 * 0.4 of a point in a band no shipped accent occupies is not a trade this
 * system makes. The band is roughly L 0.16-0.21 - a mid-dark accent - and all
 * three shipped accents are outside it (0.2364 Washi, 0.2885 Sumi, 0.4571
 * Slate, measuring 5.13 / 6.07 / 9.09).
 */
const INK_CROSSOVER = 0.18267

/** One hover step: 18% of the remaining headroom, as it has always been. */
const HOVER_STEP = 0.18

/**
 * The smallest contrast ratio that still reads as a change. Calibrated on the
 * smallest step this system already relies on to be seen - `--bg` to `--bg-2`,
 * the lifted-surface step, which measures 1.058 Sumi / 1.094 Washi / 1.067
 * Slate - and rounded down to the nearest hundredth rather than picked. Below
 * it the hover does not read, and `stepAway` inverts the step instead. In
 * practice only an accent within a few percent of a pole falls under it: white
 * cannot get whiter (1.00), `#fafafa` reaches 1.01, `#0a0a0a` 1.008.
 */
const MIN_STEP = 1.05

/** WCAG AA for body text - the floor an inverted step may not push a pair below. */
const TEXT_FLOOR = 4.5

/**
 * Step `color` one hover-step AWAY from `pole` - the colour it has to stay
 * legible against.
 *
 * This is the whole fix. The old derivation asked the theme's *mode* which way
 * to go, which is a question about the ground and not about the colour sitting
 * on it: on Washi it darkened `--accent-soft` unconditionally, which is right
 * for accent ink on pale paper and wrong for an accent *fill* under near-black
 * ink - one token was doing both jobs, and only the light theme exposed it.
 * Asking instead "which way is away from the thing this has to stay legible
 * against" makes the direction a property of the resolved pair, so it holds for
 * an arbitrary accent: away is the only direction that cannot cost contrast,
 * which turns "hover is never harder to read than rest" into a property of the
 * derivation rather than a fact about the three shipped accents.
 *
 * `shade` is multiplicative, so the away direction runs out of headroom once
 * the colour is already at that pole - a white accent cannot get whiter. When
 * the away step would be imperceptible the step is inverted, because a hover
 * that changes nothing is a broken hover. The inversion is refused if it would
 * put the pair under the text floor: an invisible hover is a smaller failure
 * than an illegible label.
 */
function stepAway(color: string, pole: string): string {
    const dir = relLuminance(pole) < INK_CROSSOVER ? HOVER_STEP : -HOVER_STEP
    const away = shade(color, dir)
    if (contrast(away, color) >= MIN_STEP) return away
    const inverted = shade(color, -dir)
    return contrast(inverted, pole) >= TEXT_FLOOR ? inverted : away
}

/** The three accent values no theme declares, because all three are functions of the accent. */
export interface AccentVars {
    /** Accent INK under the cursor - one step away from the page ground. */
    "--accent-soft": string
    /** The accent FILL under the cursor - one step away from its own label. */
    "--accent-lift": string
    /** The ink a filled accent block carries, at rest and on hover alike. */
    "--on-accent": string
}

/**
 * Derive the accent's dependent values from the accent that will actually
 * paint, plus the ground it paints on.
 *
 * `--accent-soft` and `--accent-lift` are two tokens because they have
 * opposite requirements. Soft is *ink on the page*, so it must move away from
 * the ground. Lift is a *fill under a label*, so it must move away from the
 * label. On a dark theme both point the same way, which is why one token
 * survived this long; on Washi they point in opposite directions, and one
 * token cannot be both without lying about one of them.
 *
 * `--on-accent` is chosen for the accent's own luminance, and because
 * `--accent-lift` steps away from that ink, the lift moves *further* from the
 * crossover - so the one ink chosen here is the right ink at rest and on
 * hover, for any accent. That is the hole this closes.
 *
 * What it cannot do: rescue an accent that is already illegible at rest. A
 * near-white pick on Washi reads 1.10:1 against the paper and the soft step
 * only reaches 1.39:1; a near-black pick on Slate reads 1.03:1 and reaches
 * 1.60:1. The derivation makes the hover honest for any accent; it does not
 * make any accent usable, and the picker has no floor of its own.
 */
export function deriveAccentVars(accent: string, bg: string): AccentVars {
    const onAccent = relLuminance(accent) >= INK_CROSSOVER ? INK_DARK : INK_LIGHT
    return {
        "--accent-soft": stepAway(accent, bg),
        "--accent-lift": stepAway(accent, onAccent),
        "--on-accent": onAccent
    }
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

/**
 * Resolve a persisted accent to a colour the derivations can reason about.
 *
 * `appearance.accent` is untyped JSON on disk exactly as the theme id is, and
 * the colour input is not the only thing that can write it. An unparseable
 * value used to reach the DOM as a dropped declaration - `--accent` silently
 * left on the stylesheet's fallback while everything derived beside it was
 * derived from a luminance of zero. Resolve it once, here, so every value
 * below is derived from the colour that actually paints.
 */
export function resolveAccent(accent: unknown, theme: Theme): string {
    const m = typeof accent === "string" ? HEX6.exec(accent.trim()) : null
    // Normalised, not echoed: `aabbcc` parses here but is not a valid CSS
    // colour, and the whole point of resolving is that what is derived and what
    // is painted are the same string.
    return m ? "#" + m[1].toLowerCase() : theme.accent
}

/** Apply a theme's CSS variables, then the accent (user choice) and all it implies. */
export function applyTheme(id: ThemeId, accent?: string): void {
    const theme = resolveTheme(id)
    const root = document.documentElement
    for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v)
    const ac = resolveAccent(accent, theme)
    root.style.setProperty("--accent", ac)
    // Derived from the resolved accent and the theme's real ground - never from
    // `mode`, and never from a literal in the palette above, which is what let
    // a documented contrast figure be measured against a colour nothing painted.
    for (const [k, v] of Object.entries(deriveAccentVars(ac, theme.vars["--bg"])))
        root.style.setProperty(k, v)
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
