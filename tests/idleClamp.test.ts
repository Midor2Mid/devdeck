import { describe, expect, it, afterEach } from "vitest"
import {
    clampIdleMs,
    commitIdleMs,
    idleFieldValue,
    IDLE_MIN,
    IDLE_MAX,
    DEFAULT_IDLE_MS,
    useSettings
} from "../src/renderer/src/settings"

describe("clampIdleMs", () => {
    it("keeps a sane value", () => {
        expect(clampIdleMs(2500)).toBe(2500)
    })
    it("floors below the minimum", () => {
        expect(clampIdleMs(0)).toBe(IDLE_MIN)
        expect(clampIdleMs(-1)).toBe(IDLE_MIN)
    })
    it("caps absurd values", () => {
        expect(clampIdleMs(9_999_999)).toBe(IDLE_MAX)
    })
    it("falls back to the default for junk", () => {
        expect(clampIdleMs(Number.NaN)).toBe(DEFAULT_IDLE_MS)
        expect(clampIdleMs(undefined)).toBe(DEFAULT_IDLE_MS)
        expect(clampIdleMs("1200")).toBe(DEFAULT_IDLE_MS)
    })
    it("rounds to a whole millisecond", () => {
        expect(clampIdleMs(1500.7)).toBe(1501)
    })
})

/**
 * The "Quiet after (ms)" field, driven the way the component drives it.
 *
 * There is no DOM in this suite, so this stands in for the input: `type` is the
 * onChange handler, `value` is what React renders back, `blur` is the commit.
 * The wiring is deliberately the same two functions the component calls - the
 * bug was never in the clamp, it was in WHEN the clamp ran, so a test that only
 * called clampIdleMs could not have caught it.
 */
function idleField(stored: number): {
    value: () => string
    type: (text: string) => void
    blur: () => void
    stored: () => number
} {
    let draft: string | null = null
    let value = stored
    return {
        value: () => idleFieldValue(draft, value),
        type: (text: string) => {
            draft = text
        },
        blur: () => {
            value = commitIdleMs(draft, value)
            draft = null
        },
        stored: () => value
    }
}

describe("typing in the Quiet after (ms) field", () => {
    it("shows the digits typed, not a clamp of the first one", () => {
        // THE REGRESSION. Clamping on every keystroke turned the "2" of 2500
        // into 300 and appended the rest to that, so no value whose first digit
        // is below the floor could be typed at all.
        const f = idleField(1000)
        f.type("2")
        expect(f.value()).toBe("2")
        f.type("25")
        expect(f.value()).toBe("25")
        f.type("250")
        expect(f.value()).toBe("250")
        f.type("2500")
        expect(f.value()).toBe("2500")
        f.blur()
        expect(f.stored()).toBe(2500)
        expect(f.value()).toBe("2500")
    })

    it("lets the field be cleared and keeps the stored value until committed", () => {
        const f = idleField(1000)
        f.type("")
        expect(f.value()).toBe("")
        expect(f.stored()).toBe(1000)
    })

    it("keeps the last good value when an empty field is committed", () => {
        const f = idleField(1000)
        f.type("")
        f.blur()
        expect(f.stored()).toBe(1000)
        expect(f.value()).toBe("1000")
    })

    it("still clamps what gets stored", () => {
        const f = idleField(1000)
        f.type("50")
        f.blur()
        expect(f.stored()).toBe(IDLE_MIN)
        // And the field repaints to the value that was actually stored, so the
        // clamp is visible rather than silent.
        expect(f.value()).toBe(String(IDLE_MIN))
    })

    it("caps an absurd value on commit", () => {
        const f = idleField(1000)
        f.type("99999999")
        f.blur()
        expect(f.stored()).toBe(IDLE_MAX)
    })

    it("keeps the last good value for junk", () => {
        const f = idleField(1000)
        f.type("abc")
        f.blur()
        expect(f.stored()).toBe(1000)
    })

    it("shows the stored value whenever the field is not being edited", () => {
        expect(idleFieldValue(null, 1500)).toBe("1500")
    })
})

/**
 * The loader clamp. Half of the original bug lived on disk: a settings.json
 * carrying `agentIdleMs: 5` (or a hand-edit, or a value written by an older
 * build) armed a 5ms idle timer for the whole session, and nothing in the UI
 * had to be touched for it to bite. Nothing pinned it - reverting the loader to
 * a bare `raw.agentIdleMs ?? DEFAULT` left the whole suite green.
 */
describe("loading settings.json", () => {
    /** Only the namespaces `load()` and its apply* helpers touch. */
    function stubEnv(raw: unknown): void {
        const g = globalThis as unknown as { window: unknown; document: unknown }
        g.document = {
            documentElement: { style: { setProperty: (): void => undefined }, dataset: {} }
        }
        g.window = {
            api: {
                settings: { load: async (): Promise<unknown> => raw, save: (): void => undefined },
                server: {
                    stop: async (): Promise<void> => undefined,
                    start: async (): Promise<{ ok: boolean }> => ({ ok: true })
                },
                mcpsrv: {
                    start: async (): Promise<void> => undefined,
                    stop: async (): Promise<void> => undefined
                },
                triggers: { apply: (): void => undefined },
                netproxy: { apply: (): void => undefined }
            }
        }
    }

    afterEach(() => {
        const g = globalThis as unknown as { window?: unknown; document?: unknown }
        delete g.window
        delete g.document
    })

    it("floors a stored value below the minimum", async () => {
        stubEnv({ agentIdleMs: 5 })
        await useSettings.getState().load()
        expect(useSettings.getState().agentIdleMs).toBe(IDLE_MIN)
    })

    it("falls back to the default for a missing or junk stored value", async () => {
        stubEnv({ agentIdleMs: "soon" })
        await useSettings.getState().load()
        expect(useSettings.getState().agentIdleMs).toBe(DEFAULT_IDLE_MS)
    })

    it("keeps a sane stored value untouched", async () => {
        stubEnv({ agentIdleMs: 2500 })
        await useSettings.getState().load()
        expect(useSettings.getState().agentIdleMs).toBe(2500)
    })
})
