import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Electron: `nativeImage.createFromBuffer` is the only thing badge.ts asks
// of it, and the honest stand-in is one that reports emptiness the way Chromium
// does — an undecodable buffer produces an empty image rather than a throw.
// That is the branch this module has to notice, so the fake has to have it.
vi.mock("electron", () => ({
    nativeImage: {
        createFromBuffer: (b: Buffer) => ({
            // PNG signature or nothing. Close enough to Chromium's answer for
            // the one decision the module makes on it.
            isEmpty: (): boolean => !b || b.length < 8 || b[0] !== 0x89 || b[1] !== 0x50
        })
    }
}))

import { badgeImage, badgeText, setBadge, badgeState, resetBadge } from "../src/main/badge"

/** A window that has the Windows overlay API. */
function fakeWin(setOverlayIcon = vi.fn()): {
    isDestroyed: () => boolean
    setOverlayIcon: ReturnType<typeof vi.fn>
} {
    return { isDestroyed: () => false, setOverlayIcon }
}

/** Re-check a PNG's chunk structure and CRCs, independently of the encoder. */
function crc32(buf: Buffer): number {
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i]
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    return (c ^ 0xffffffff) >>> 0
}

interface Chunk {
    type: string
    data: Buffer
    crcOk: boolean
}

function readChunks(png: Buffer): Chunk[] {
    const out: Chunk[] = []
    let o = 8 // past the signature
    while (o < png.length) {
        const len = png.readUInt32BE(o)
        const type = png.subarray(o + 4, o + 8).toString("ascii")
        const data = png.subarray(o + 8, o + 8 + len)
        const crc = png.readUInt32BE(o + 8 + len)
        out.push({ type, data, crcOk: crc === crc32(png.subarray(o + 4, o + 8 + len)) })
        o += 12 + len
    }
    return out
}

describe("the badge image is generated, not shipped", () => {
    it("is a structurally valid 16x16 RGBA PNG", () => {
        // The encoder is hand-written (there is no canvas in main), so the
        // structure is checked rather than assumed: a wrong length or a wrong
        // CRC produces a picture Chromium silently refuses to decode, which is
        // exactly the "fails quietly" shape this feature must not have.
        const png = badgeImage(3)
        expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        const chunks = readChunks(png)
        expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"])
        expect(chunks.every((c) => c.crcOk)).toBe(true)
        const ihdr = chunks[0].data
        expect(ihdr.readUInt32BE(0)).toBe(16)
        expect(ihdr.readUInt32BE(4)).toBe(16)
        expect(ihdr[8]).toBe(8) // 8 bits per channel
        expect(ihdr[9]).toBe(6) // truecolour with alpha
        expect([ihdr[10], ihdr[11], ihdr[12]]).toEqual([0, 0, 0])
    })

    it("is deterministic, and a different count is a different picture", () => {
        // Determinism is the argument for generating it at all: the same count
        // is the same bytes, so nothing has to be cached, versioned or shipped.
        expect(badgeImage(4).equals(badgeImage(4))).toBe(true)
        expect(badgeImage(4).equals(badgeImage(5))).toBe(false)
    })

    it("reads 9+ above nine, and never draws a zero", () => {
        expect(badgeText(1)).toBe("1")
        expect(badgeText(9)).toBe("9")
        expect(badgeText(10)).toBe("9+")
        expect(badgeText(137)).toBe("9+")
        // Zero is not a picture at all - `setBadge` clears instead. Asserted
        // where the clearing happens, below.
    })
})

describe("setting the badge says whether it worked", () => {
    beforeEach(() => resetBadge())

    it("hands the taskbar an image and the description it was given", () => {
        const set = vi.fn()
        const win = fakeWin(set)
        const st = setBadge(win as never, { count: 3, description: "DevDeck — 3 want you" })
        expect(set).toHaveBeenCalledTimes(1)
        expect(set.mock.calls[0][1]).toBe("DevDeck — 3 want you")
        expect(set.mock.calls[0][0]).not.toBeNull()
        expect(st).toEqual({ supported: true, error: null })
    })

    it("clears at zero rather than drawing a zero", () => {
        // The ⚑ control renders nothing at zero and the badge matches it: a
        // marker that only ever adds needs no learning, and a badge reading 0
        // is a light that never goes off.
        const set = vi.fn()
        setBadge(fakeWin(set) as never, { count: 0, description: "" })
        expect(set).toHaveBeenCalledWith(null, "")
    })

    it("refuses a count with no description, and says so", () => {
        // `setOverlayIcon`'s second argument is all a screen reader gets. A
        // badge without one is a signal that speaks to some users and is silent
        // for others, and DevDeck builds the description from the same builder
        // as the label - so an empty one is only reachable through a bug, which
        // is when it has to be loud.
        const set = vi.fn()
        const st = setBadge(fakeWin(set) as never, { count: 3, description: "   " })
        expect(set).not.toHaveBeenCalled()
        expect(st.error).toMatch(/description/i)
    })

    it("reports an absent API instead of pretending it cleared", () => {
        // `setOverlayIcon` is Windows-only: off Windows the method is not on
        // the prototype at all. `supported: false` is the whole answer, and no
        // error is latched - there is no taskbar here to have refused anything.
        const noApi = { isDestroyed: () => false }
        const st = setBadge(noApi as never, { count: 2, description: "two" })
        expect(st).toEqual({ supported: false, error: null })
        expect(setBadge(null, { count: 2, description: "two" }).supported).toBe(false)
        const gone = { isDestroyed: () => true, setOverlayIcon: vi.fn() }
        expect(setBadge(gone as never, { count: 2, description: "two" }).supported).toBe(false)
    })

    it("latches a throw from the OS call rather than swallowing it", () => {
        // The F9 shape, refused: an API that fails and reports nothing while a
        // surface claims it worked.
        const win = fakeWin(
            vi.fn(() => {
                throw new Error("taskbar unavailable")
            })
        )
        const st = setBadge(win as never, { count: 1, description: "one" })
        expect(st).toEqual({ supported: true, error: "taskbar unavailable" })
    })

    it("retires a stale failure once a set gets through", () => {
        setBadge(
            fakeWin(
                vi.fn(() => {
                    throw new Error("nope")
                })
            ) as never,
            { count: 1, description: "one" }
        )
        expect(badgeState(fakeWin() as never).error).toBe("nope")
        setBadge(fakeWin() as never, { count: 1, description: "one" })
        expect(badgeState(fakeWin() as never).error).toBeNull()
    })

    it("names a payload that is not a count", () => {
        // Ours, not the machine's - so it must not read as an OS refusal.
        const set = vi.fn()
        const st = setBadge(fakeWin(set) as never, { count: "3", description: "three" })
        expect(set).not.toHaveBeenCalled()
        expect(st.error).toMatch(/not a number/i)
        expect(setBadge(fakeWin() as never, {}).error).toMatch(/not a number/i)
        expect(setBadge(fakeWin() as never, { count: -1, description: "x" }).error).toMatch(
            /not a number/i
        )
    })

    it("collapses and bounds the description it hands the OS", () => {
        // It crosses IPC, and an unbounded multi-line string handed to a
        // fixed-size OS surface is the one way this call is not a short phrase.
        const set = vi.fn()
        setBadge(fakeWin(set) as never, { count: 1, description: "  a\n\n b  " })
        expect(set.mock.calls[0][1]).toBe("a b")
        setBadge(fakeWin(set) as never, { count: 1, description: "x".repeat(500) })
        expect((set.mock.calls[1][1] as string).length).toBeLessThanOrEqual(120)
    })
})
