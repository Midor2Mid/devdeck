import { describe, it, expect } from "vitest"
import { shade, THEMES } from "../src/renderer/src/themes"
import { sshCommand } from "../src/renderer/src/settings"

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
