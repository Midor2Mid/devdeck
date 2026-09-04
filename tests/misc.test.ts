import { describe, it, expect } from "vitest"
import { shade, THEMES, STYLES } from "../src/renderer/src/themes"
import { sshCommand } from "../src/renderer/src/settings"

describe("design styles", () => {
    // The surviving set is asserted in tests/themeFallback.test.ts, together with
    // the fallback a settings.json naming one of the ten deleted styles needs.
    it("registers all design styles with labels", () => {
        expect(Object.keys(STYLES).sort()).toEqual(["modern", "wabi"])
        expect(STYLES.wabi.label).toBe("Wabi-sabi")
        expect(STYLES.modern.label).toBe("Modern Pro")
    })

    it("includes the Slate modern color theme", () => {
        expect(THEMES.slate).toBeTruthy()
        expect(THEMES.slate.mode).toBe("dark")
        expect(THEMES.slate.vars["--bg"]).toBe("#0c0e13")
    })

    it("includes the Sumi and Washi themes", () => {
        expect(THEMES.sumi.mode).toBe("dark")
        expect(THEMES.sumi.monacoId).toBe("devdeck-sumi")
        expect(THEMES.washi.mode).toBe("light")
        expect(THEMES.washi.monacoId).toBe("devdeck-washi")
    })
})

describe("themes.shade", () => {
    it("lightens toward white with positive amt", () => {
        expect(shade("#000000", 0.5)).toBe("#808080")
    })
    it("darkens toward black with negative amt", () => {
        expect(shade("#ffffff", -0.5)).toBe("#808080")
    })
    it("clamps and handles bad input", () => {
        expect(shade("nope", 0.5)).toBe("nope")
        expect(shade("#ffffff", 1)).toBe("#ffffff")
    })
    it("every theme defines the core palette vars", () => {
        for (const t of Object.values(THEMES)) {
            for (const v of ["--bg", "--text", "--accent", "--border"]) {
                expect(t.vars[v]).toMatch(/^#/)
            }
        }
    })
})

describe("settings.sshCommand", () => {
    const base = { id: "x", label: "l", host: "vps.io", user: "root", port: "22", args: "" }
    it("builds a basic ssh command", () => {
        expect(sshCommand(base)).toBe("ssh root@vps.io")
    })
    it("includes a non-default port and extra args", () => {
        expect(sshCommand({ ...base, port: "2222", args: "-i ~/.ssh/k" })).toBe(
            "ssh -p 2222 -i ~/.ssh/k root@vps.io"
        )
    })
    it("omits user@ when no user", () => {
        expect(sshCommand({ ...base, user: "" })).toBe("ssh vps.io")
    })
})
