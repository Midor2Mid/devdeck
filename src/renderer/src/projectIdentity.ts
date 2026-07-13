// Per-project visual identity. Pure: no React, no electron — unit-tested in isolation.
// The palette is intentionally theme-independent — the chip is a self-contained
// filled tile carrying its own contrast, so a project keeps the same identity color
// across every theme (recognition consistency), which is why colors are NOT theme tokens.

export type PaletteKey =
    | "clay" | "ochre" | "sage" | "teal" | "steel"
    | "indigo" | "plum" | "rose" | "moss" | "stone"

export interface PaletteEntry {
    bg: string
    fg: string
}

export const PALETTE: Record<PaletteKey, PaletteEntry> = {
    clay: { bg: "#b0614a", fg: "#ffffff" },
    ochre: { bg: "#a8853e", fg: "#ffffff" },
    sage: { bg: "#6d8a68", fg: "#ffffff" },
    teal: { bg: "#478a8a", fg: "#ffffff" },
    steel: { bg: "#5a7196", fg: "#ffffff" },
    indigo: { bg: "#6a6aa0", fg: "#ffffff" },
    plum: { bg: "#8a5a82", fg: "#ffffff" },
    rose: { bg: "#a85a6e", fg: "#ffffff" },
    moss: { bg: "#79894a", fg: "#ffffff" },
    stone: { bg: "#7a756e", fg: "#ffffff" }
}

export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[]

// Neutral tile for emoji chips with no explicit color override.
const NEUTRAL_TILE: PaletteEntry = { bg: "#3a3a3a", fg: "#ffffff" }

export interface Identity {
    label: string
    isEmoji: boolean
    bg: string
    fg: string
}

// Stable djb2 hash → non-negative int. Same string → same value forever.
function hash(s: string): number {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
    return h
}

function firstAlnum(t: string): string {
    const m = t.match(/[A-Za-z0-9]/)
    return m ? m[0] : ""
}

export function monogram(name: string): string {
    const cleaned = name.trim().replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "")
    if (!cleaned) return "?"
    // Insert a boundary between camelCase humps, then split on separators.
    const spaced = cleaned.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    const tokens = spaced.split(/[\s\-_/.]+/).filter(Boolean)
    if (tokens.length >= 2) {
        return (firstAlnum(tokens[0]) + firstAlnum(tokens[1])).toUpperCase() || "?"
    }
    const two = (tokens[0].match(/[A-Za-z0-9]/g) || []).slice(0, 2).join("")
    return two.toUpperCase() || "?"
}

export function autoColorKey(name: string): PaletteKey {
    return PALETTE_KEYS[hash(name) % PALETTE_KEYS.length]
}

export function identity(p: { name: string; emoji?: string; color?: string }): Identity {
    const overridden = p.color && PALETTE_KEYS.includes(p.color as PaletteKey) ? (p.color as PaletteKey) : null
    if (p.emoji) {
        const tile = overridden ? PALETTE[overridden] : NEUTRAL_TILE
        return { label: p.emoji, isEmoji: true, bg: tile.bg, fg: tile.fg }
    }
    const entry = PALETTE[overridden ?? autoColorKey(p.name)]
    return { label: monogram(p.name), isEmoji: false, bg: entry.bg, fg: entry.fg }
}
