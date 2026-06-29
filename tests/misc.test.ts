import { describe, it, expect } from "vitest"
import { shade, THEMES, STYLES } from "../src/renderer/src/themes"
import { sshCommand } from "../src/renderer/src/settings"

describe("design styles", () => {
    it("registers all design styles with labels", () => {
        expect(Object.keys(STYLES).sort()).toEqual(["bauhaus", "crt", "flat", "lacquer", "minimal", "modern", "modernplus", "neon", "wabi"])
        expect(STYLES.minimal.label).toBe("Modern Minimal")
        expect(STYLES.neon.label).toBe("Neon")
        expect(STYLES.flat.label).toBe("Flat Vector")
        expect(STYLES.bauhaus.label).toBe("Bauhaus")
        expect(STYLES.crt.label).toBe("Phosphor CRT")
        expect(STYLES.modern.label).toBe("Modern Pro")
        expect(STYLES.lacquer.label).toBe("Lacquer")
        expect(STYLES.modernplus.label).toBe("Modern+")
    })

    it("includes the Slate modern color theme", () => {
        expect(THEMES.slate).toBeTruthy()
        expect(THEMES.slate.mode).toBe("dark")
        expect(THEMES.slate.vars["--bg"]).toBe("#0c0e13")
    })

    it("includes the Graphite modern theme", () => {
        expect(THEMES.graphite).toBeTruthy()
        expect(THEMES.graphite.mode).toBe("dark")
        expect(THEMES.graphite.accent).toBe("#7c83ff")
        expect(THEMES.graphite.monacoId).toBe("devdeck-graphite")
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
