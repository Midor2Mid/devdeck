import { describe, it, expect, vi } from "vitest"

// browserNet imports electron for webContents; these tests only exercise the
// pure console-formatting helper.
vi.mock("electron", () => ({ webContents: { fromId: () => null } }))

const { argText } = await import("../src/main/browserNet")

const str = (value: string): object => ({ type: "string", value })
const num = (value: number): object => ({ type: "number", value })
const obj = (className: string, props: Record<string, string>): object => ({
    type: "object",
    className,
    preview: { properties: Object.entries(props).map(([name, value]) => ({ name, value })) }
})

describe("argText", () => {
    it("joins plain arguments", () => {
        expect(argText([str("hello"), str("world")])).toBe("hello world")
    })

    it("returns empty for no arguments", () => {
        expect(argText([])).toBe("")
        expect(argText(undefined as unknown as unknown[])).toBe("")
    })

    // The case that motivated this: Electron's own security warning uses %c with
    // a CSS argument, which a naive join renders as message text.
    it("consumes a %c style argument without showing it", () => {
        const out = argText([
            str("%cElectron Security Warning%c This renderer has no CSP"),
            str("font-weight: bold;"),
            str("")
        ])
        expect(out).toBe("Electron Security Warning This renderer has no CSP")
        expect(out).not.toContain("font-weight")
        expect(out).not.toContain("%c")
    })

    it("substitutes %s and %d", () => {
        expect(argText([str("user %s scored %d"), str("ada"), num(42)])).toBe("user ada scored 42")
    })

    it("truncates %d and keeps %f precise", () => {
        expect(argText([str("%d"), num(3.7)])).toBe("3")
        expect(argText([str("%f"), num(3.75)])).toBe("3.75")
    })

    it("treats %% as a literal percent", () => {
        expect(argText([str("100%% done")])).toBe("100% done")
    })

    it("renders an object for %o using its preview", () => {
        expect(argText([str("state: %o"), obj("Object", { a: "1" })])).toBe("state: Object{a: 1}")
    })

    it("appends arguments the format string did not consume", () => {
        expect(argText([str("first %s"), str("one"), str("extra")])).toBe("first one extra")
    })

    it("leaves a directive alone when there is no argument for it", () => {
        expect(argText([str("missing %s")])).toBe("missing %s")
    })

    it("does not treat a lone percent as a directive", () => {
        expect(argText([str("50% off"), str("today")])).toBe("50% off today")
    })

    it("still joins when the first argument is not a string", () => {
        expect(argText([num(1), str("%s")])).toBe("1 %s")
    })
})
