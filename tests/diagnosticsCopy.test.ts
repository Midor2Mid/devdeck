import { describe, it, expect, beforeEach, vi } from "vitest"
import {
    copyDiagnostics,
    DIAGNOSTICS_SENTENCE,
    DIAGNOSTICS_UNAVAILABLE,
    type DiagnosticsSurface
} from "../src/renderer/src/diagnostics"
import type { DiagnosticsRecord, DiagnosticsResult } from "../src/shared/diagnostics"

// These pin the words, not the layout. The sentence under the copy control is
// the entire design of this surface: it is the only place a stranger is told
// what leaves their machine, and every clause in it was argued for. A test that
// only checked "some paragraph renders" would let the argued version rot into a
// friendlier one that promises more than the record delivers.

const SURFACES: DiagnosticsSurface[] = ["about", "root", "region"]

function record(over: Partial<DiagnosticsRecord> = {}): DiagnosticsRecord {
    return {
        generatedAt: 0,
        app: { version: "0.11.0", packaged: false },
        versions: { electron: "1", chrome: "2", node: "3", v8: "4", modules: "5" },
        os: { platform: "win32", arch: "x64", release: "10.0.22621", version: "Windows 11 Pro" },
        shell: { configured: null, resolved: null },
        agents: null,
        errors: [],
        lastPtyExit: null,
        lastFailedPtyExit: null,
        incomplete: [],
        ...over
    }
}

function stubApi(diag: DiagnosticsResult, wrote: boolean): { writes: string[] } {
    const writes: string[] = []
    // The renderer's only two doors to main, stubbed at the window boundary the
    // real component uses - nothing here reaches Electron.
    ;(globalThis as unknown as { window: unknown }).window = {
        api: {
            diagnostics: { record: async (): Promise<DiagnosticsResult> => diag },
            clipboard: {
                writeText: async (t: string): Promise<boolean> => {
                    writes.push(t)
                    return wrote
                }
            }
        }
    }
    return { writes }
}

describe("the diagnostics sentence", () => {
    it("never upgrades redaction into a guarantee", () => {
        // Redaction is a mechanism. "Sanitised", "safe" and "anonymous" are
        // promises about an outcome that no allow-list can make.
        for (const s of SURFACES) {
            const text = DIAGNOSTICS_SENTENCE[s].toLowerCase()
            expect(text).not.toContain("sanitis")
            expect(text).not.toContain("sanitiz")
            expect(text).not.toContain("safe")
            expect(text).not.toContain("anonymous")
        }
    })

    it("says nothing is transmitted, on every surface", () => {
        for (const s of SURFACES) {
            expect(DIAGNOSTICS_SENTENCE[s]).toContain("Nothing is sent anywhere")
        }
    })

    it("puts the cost before the reassurance", () => {
        // A reader who stops halfway must have read the half that costs them.
        for (const s of SURFACES) {
            const text = DIAGNOSTICS_SENTENCE[s]
            const cost = /paths? (?:and command lines )?included/.exec(text)
            expect(cost, `${s} names what is included`).not.toBeNull()
            expect(cost!.index).toBeLessThan(text.indexOf("Nothing is sent anywhere"))
            expect(cost!.index).toBeLessThan(text.indexOf("removed"))
        }
    })

    it("names every section the record actually builds, on all three surfaces", () => {
        // This test used to assert the opposite - that a crash card must NOT
        // mention PATH or agents, "because a crash record carries no probe run".
        // That premise was false. `buildRecord()` takes no surface argument and
        // there is one record-building path, so every record carries a Shell and
        // an Agent commands section; a reviewer copied from a real root crash
        // card and read both back off the clipboard. Silence about a section that
        // IS in the blob fails the rationale the whole sentence exists to serve.
        // The sections are worth keeping - a shell and an agent roster are what
        // someone diagnosing a crash needs - so the sentences name them instead.
        for (const s of ["about", "root", "region"] as const) {
            const text = DIAGNOSTICS_SENTENCE[s]
            expect(text.toLowerCase()).toContain("shell")
            expect(text.toLowerCase()).toContain("agent")
            expect(text).toContain("PATH")
        }
    })

    it("never says a command was not installed", () => {
        for (const s of SURFACES) {
            expect(DIAGNOSTICS_SENTENCE[s].toLowerCase()).not.toContain("install")
        }
        expect(DIAGNOSTICS_UNAVAILABLE.toLowerCase()).not.toContain("install")
    })
})

describe("copyDiagnostics", () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it("copies the text main formatted, not a stringified record", () => {
        const r = record()
        const { writes } = stubApi({ ok: true, record: r, text: "FORMATTED BY MAIN" }, true)
        return copyDiagnostics().then((out) => {
            expect(out.kind).toBe("copied")
            expect(writes).toEqual(["FORMATTED BY MAIN"])
        })
    })

    it("treats a healthy app with no errors as copyable", async () => {
        // `errors: []` is "there is nothing to report", which is a fine thing to
        // paste. Only `ok: false` is the unavailable state.
        stubApi({ ok: true, record: record({ errors: [] }), text: "clean" }, true)
        expect((await copyDiagnostics()).kind).toBe("copied")
    })

    it("reports a refused clipboard instead of claiming success", async () => {
        stubApi({ ok: true, record: record(), text: "the record" }, false)
        const out = await copyDiagnostics()
        expect(out.kind).toBe("refused")
        // The refusal has to carry the text, because the fallback is the user
        // selecting it by hand.
        expect(out.kind === "refused" && out.text).toBe("the record")
    })

    it("refuses rather than copying nothing when the log is unreadable", async () => {
        const { writes } = stubApi({ ok: false, reason: "unreadable" }, true)
        expect((await copyDiagnostics()).kind).toBe("unavailable")
        expect(writes).toEqual([])
    })

    it("hands back the record so the surface can render what was left out", async () => {
        const partial = record({ incomplete: ["The log was cut."] })
        stubApi({ ok: true, record: partial, text: "t" }, true)
        const out = await copyDiagnostics()
        expect(out.kind === "copied" && out.record.incomplete).toEqual(["The log was cut."])
    })
})
