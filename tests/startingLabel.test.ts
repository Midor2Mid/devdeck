import { describe, it, expect } from "vitest"
import { startingLabel, SHELL_LABELS, RECOMMENDED_COMMANDS } from "../src/renderer/src/settings"

/**
 * What a pane says while it has asked for a process and heard nothing back.
 * The line is the whole signal, so the name in it has to be the thing the user
 * clicked - and it must never be able to print `undefined` at them.
 */
describe("startingLabel", () => {
    it("names the shell for a plain shell pane", () => {
        expect(startingLabel("", undefined, "powershell")).toBe("PowerShell")
        expect(startingLabel("", undefined, "gitbash")).toBe("Git Bash")
    })

    it("names the preset, not the shell under it, for an agent pane", () => {
        // The agent is what the user clicked and what takes the measured ~12s;
        // "Starting PowerShell…" would be true and useless.
        const claude = RECOMMENDED_COMMANDS.find((a) => a.id === "claude")!
        expect(startingLabel("claude", claude, "powershell")).toBe("Claude")
    })

    it("falls back to the agent id when the preset was deleted mid-session", () => {
        expect(startingLabel("codex", undefined, "powershell")).toBe("codex")
    })

    it("falls back to the agent id when the preset name is blank", () => {
        expect(startingLabel("codex", { name: "   " }, "cmd")).toBe("codex")
    })

    it("never renders undefined for a shell kind it does not know", () => {
        // `termShells` comes off persisted state, so an unknown kind is
        // reachable - and "Starting undefined…" is worse than saying less.
        expect(startingLabel("", undefined, "some-future-shell")).toBe("shell")
        expect(startingLabel("", undefined, "")).toBe("shell")
    })

    it("has a label for every shell kind the menu offers", () => {
        for (const kind of ["powershell", "cmd", "gitbash", "wsl", "custom"] as const) {
            expect(SHELL_LABELS[kind]).toBeTruthy()
        }
    })
})
