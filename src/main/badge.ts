import { nativeImage, type BrowserWindow } from "electron"
import { deflateSync } from "node:zlib"

/**
 * The Windows taskbar overlay badge — the wants-you count, for the moment the
 * developer is not looking at DevDeck at all.
 *
 * WHY THIS MODULE EXISTS IN MAIN. `win.setOverlayIcon` is a BrowserWindow
 * method, so only this process can call it, and it takes a `NativeImage` —
 * there is no canvas here to draw one with. The three ways to get a picture of
 * a digit into main were:
 *
 *   1. Ask the renderer to draw it on a `<canvas>` and ship a data URL over
 *      IPC. Rejected: it makes the badge's existence depend on a renderer that
 *      may be mid-reload, and it puts a second drawing surface (with its own
 *      DPR, font and theme) behind a fact that already has one builder.
 *   2. Ship pre-rendered PNG files for 1…9 and 9+ as build resources.
 *      Rejected: ten binaries to keep in step with nothing that can test them,
 *      and `nativeImage.createFromPath` then depends on the packaged layout.
 *   3. Encode the PNG here, in code. Chosen. `zlib` is node's own, the glyphs
 *      are a 5×7 bitmap font in this file, and the whole thing is a pure
 *      `number -> Buffer` function that `tests/badge.test.ts` can assert on
 *      byte for byte. No asset, no second renderer, no dependency.
 *
 * SVG was never an option: `nativeImage` decodes PNG and JPEG, not SVG.
 *
 * WHAT THIS MODULE KNOWS, AND WHAT IT DOES NOT. It knows whether the API is
 * here at all — `setOverlayIcon` is a Windows-only method, absent from the
 * BrowserWindow prototype elsewhere — and it knows whether the call threw. It
 * does NOT know whether Windows actually drew anything: Electron hands the
 * icon to `ITaskbarList3::SetOverlayIcon` and the taskbar's answer never comes
 * back, so a tablet-mode or hidden taskbar is invisible from here. Both halves
 * are reported, and nothing here claims the third. That is the same line
 * `notify.ts` draws, for the same reason: the F9 bug was an API that failed
 * SILENTLY while a toggle claimed it worked, so what cannot be known must not
 * be asserted, and what can be known must not be swallowed.
 *
 * `app.setBadgeCount` is the neighbouring API and is NOT what this uses: it is
 * macOS/Linux only (dock and Unity launcher), and on Windows it is a no-op that
 * returns `false` — an API that fails quietly, which is the shape being avoided.
 */

/** Icon edge, in pixels. Windows draws taskbar overlays at 16×16. */
const SIZE = 16

/**
 * The disc, and the ink on it.
 *
 * Deliberately NOT a theme token, and this is the one place in the app where
 * that is correct: the overlay is painted on the Windows taskbar, which is OS
 * chrome outside DevDeck's cascade. There are 7 accents and one badge, so no
 * token could be read here without picking a favourite and shipping it to a
 * surface none of the 84 skins reach. What the colour has to survive instead is
 * BOTH taskbar themes, which a mid-tone disc does and a light or dark one does
 * not: the amber is the value Sumi's accent already ships, so the badge is at
 * least in the product's family, and the near-black rim keeps the disc's edge
 * visible on a light taskbar where the amber alone would sit at about 2.7:1.
 *
 * The count also reads in FORM, not only in colour: it is a numeral. A
 * colour-vision difference costs nothing here.
 */
const DISC: readonly [number, number, number] = [0xb8, 0x89, 0x5c]
const INK: readonly [number, number, number] = [0x14, 0x12, 0x10]

/**
 * A 7px-tall bitmap font, the glyphs a count can need and nothing else.
 *
 * Digits are 5×7 rather than a scaled 3×5: a 3×5 blown up to fit would round
 * its stems to different widths, and 5 wide is about the size of Windows' own
 * badge digits. The rows ARE the width — see `glyphW` and the `+` below.
 */
const GLYPHS: Record<string, readonly string[]> = {
    "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    // Three wide, not five, and for a layout reason rather than a typographic
    // one: "9+" at 5+1+5 put the glyph's leftmost stem against the disc's rim
    // on two of its seven rows, so the digit read as leaning on the edge. At
    // 5+1+3 there is a clear pixel of fill on both sides at every row.
    "+": ["...", "...", ".#.", "###", ".#.", "...", "..."]
}

const GLYPH_H = 7

/** A glyph's width in pixels, from its own rows. Not every glyph is 5 wide. */
const glyphW = (rows: readonly string[]): number => rows[0].length

/**
 * The text on the badge for a count.
 *
 * Two glyphs is the ceiling a 16px disc can carry legibly, so 10 and up read
 * "9+". That is a truncation of the count and never a different claim: the exact
 * number is one glance at the deck bar away, and the badge's job is "more than
 * you can ignore", not bookkeeping. Zero never reaches here — see `setBadge`.
 */
export function badgeText(count: number): string {
    return count > 9 ? "9+" : String(count)
}

/** CRC-32 table (PNG's polynomial). Built once. */
const CRC_TABLE = ((): Uint32Array => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        t[n] = c >>> 0
    }
    return t
})()

function crc32(buf: Buffer): number {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

/** One PNG chunk: length, type, payload, CRC over type+payload. */
function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([len, body, crc])
}

/** Encode an RGBA pixel buffer as an 8-bit/channel PNG. */
function encodePng(rgba: Buffer, size: number): Buffer {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(size, 0)
    ihdr.writeUInt32BE(size, 4)
    ihdr[8] = 8 // bit depth
    ihdr[9] = 6 // colour type: truecolour with alpha
    // Compression 0, filter 0, interlace 0 — the only values PNG defines for
    // the first two, and the one this encoder implements for the third.
    const raw = Buffer.alloc(size * (size * 4 + 1))
    for (let y = 0; y < size; y++) {
        // Filter byte 0 (None) per scanline: the image is 16px of flat colour,
        // so a predictor would buy nothing and cost a decoder assumption.
        raw[y * (size * 4 + 1)] = 0
        rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0))
    ])
}

/**
 * The badge as PNG bytes: an amber disc with the count on it.
 *
 * Pure, deterministic and side-effect free, which is the whole reason the image
 * is generated rather than shipped — the same count always produces the same
 * bytes, and a test can say so without a window, a screen or Electron.
 */
export function badgeImage(count: number): Buffer {
    const px = Buffer.alloc(SIZE * SIZE * 4) // zeroed = fully transparent
    const c = SIZE / 2
    const r = SIZE / 2
    const put = (x: number, y: number, rgb: readonly number[], alpha: number): void => {
        const o = (y * SIZE + x) * 4
        px[o] = rgb[0]
        px[o + 1] = rgb[1]
        px[o + 2] = rgb[2]
        px[o + 3] = alpha
    }
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const d = Math.hypot(x + 0.5 - c, y + 0.5 - c)
            // Coverage rather than a hard cut, so the disc's edge is not a
            // staircase at 16px. One pixel of feather, clamped.
            const cov = Math.min(1, Math.max(0, r - d + 0.5))
            if (cov <= 0) continue
            put(x, y, d > r - 1.25 ? INK : DISC, Math.round(cov * 255))
        }
    }
    const glyphs = badgeText(count)
        .split("")
        .map((ch) => GLYPHS[ch])
        .filter((rows): rows is readonly string[] => !!rows)
    // One pixel of air between glyphs, and the whole run centred on the disc.
    const w = glyphs.reduce((n, rows) => n + glyphW(rows), glyphs.length - 1)
    let x = Math.floor((SIZE - w) / 2)
    const y0 = Math.floor((SIZE - GLYPH_H) / 2)
    for (const rows of glyphs) {
        for (let gy = 0; gy < GLYPH_H; gy++) {
            for (let gx = 0; gx < glyphW(rows); gx++) {
                if (rows[gy][gx] === "#") put(x + gx, y0 + gy, INK, 255)
            }
        }
        x += glyphW(rows) + 1
    }
    return encodePng(px, SIZE)
}

export interface BadgeState {
    /**
     * Is the overlay API here at all? `setOverlayIcon` is Windows-only, so this
     * is `false` on every other platform and the renderer must not read a
     * missing badge as a badge that was cleared.
     */
    supported: boolean
    /**
     * Why the last attempt failed, or `null`. Cleared by an attempt that got
     * all the way to the OS without throwing — otherwise one failure would keep
     * warning about a channel that works again.
     */
    error: string | null
}

/** Longest description handed to the OS. It is one phrase, not a sentence. */
const DESC_MAX = 120

let lastError: string | null = null

/** Does this window have the Windows overlay API on it? */
function overlayAvailable(win: BrowserWindow | null): win is BrowserWindow {
    return !!win && !win.isDestroyed() && typeof win.setOverlayIcon === "function"
}

export function badgeState(win: BrowserWindow | null): BadgeState {
    return { supported: overlayAvailable(win), error: lastError }
}

/**
 * Set (or clear) the taskbar badge, and report the state afterwards.
 *
 * `input` crosses IPC, so both fields are checked here rather than trusted.
 *
 * ZERO CLEARS IT rather than drawing a "0" — the same rule the ⚑ control obeys
 * (`wantsYouLabel` returns `null` at zero). A marker that only ever adds needs
 * no learning; a badge reading 0 is a light that never goes off.
 *
 * A COUNT WITH NO DESCRIPTION IS REFUSED. `setOverlayIcon`'s second argument is
 * what a screen reader announces, and Windows has nothing else to say about the
 * image. Drawing the badge anyway would be a signal that speaks to one user and
 * is silent for another, which is this codebase's own defect class; and DevDeck
 * builds the description from the same builder as the label, so an empty one is
 * only reachable through a bug — which is precisely when it must be loud.
 * `notify.ts` latches nothing for an unusable payload because there the payload
 * IS the message; here the count is still deliverable, so refusing it has to be
 * explained rather than dropped.
 */
export function setBadge(win: BrowserWindow | null, input: unknown): BadgeState {
    const p = (input ?? {}) as { count?: unknown; description?: unknown }
    const count =
        typeof p.count === "number" && Number.isFinite(p.count) ? Math.floor(p.count) : -1
    const description =
        typeof p.description === "string"
            ? p.description.replace(/\s+/g, " ").trim().slice(0, DESC_MAX)
            : ""
    if (count < 0) {
        lastError = "DevDeck sent a taskbar badge count that is not a number"
        return badgeState(win)
    }
    // Not an error: `supported: false` is the whole answer, and latching a
    // message as well would report a failure on a platform that simply has no
    // taskbar to put this on.
    if (!overlayAvailable(win)) return badgeState(win)
    try {
        if (count === 0) {
            win.setOverlayIcon(null, "")
            lastError = null
            return badgeState(win)
        }
        if (!description) {
            lastError = "DevDeck sent a taskbar badge with no description, so it was not shown"
            return badgeState(win)
        }
        const img = nativeImage.createFromBuffer(badgeImage(count))
        if (img.isEmpty()) {
            // The encoder produced something Chromium would not decode. Ours,
            // not the user's, and it must not read as an OS refusal.
            lastError = "DevDeck could not build the taskbar badge image"
            return badgeState(win)
        }
        win.setOverlayIcon(img, description)
        lastError = null
    } catch (e) {
        const msg = e instanceof Error ? e.message.trim() : ""
        lastError = msg || "Windows refused the taskbar badge"
    }
    return badgeState(win)
}

/**
 * Drop the latched failure.
 *
 * For tests: this module's state outlives a test, so a case that left an error
 * behind would make the next one pass for the wrong reason.
 */
export function resetBadge(): void {
    lastError = null
}
