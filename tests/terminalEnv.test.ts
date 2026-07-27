import { describe, it, expect, afterEach } from "vitest"
import { terminalEnv } from "../src/main/pty"

const saved = { ...process.env }
afterEach(() => {
    process.env = { ...saved }
})

describe("terminalEnv", () => {
    // The bug this exists for: one inherited NO_COLOR=1 makes every ink/chalk
    // TUI (Claude Code, Codex, Gemini) render flat monochrome, whatever TERM and
    // COLORTERM say — chalk checks NO_COLOR first and stops.
    it("strips an inherited NO_COLOR", () => {
        process.env.NO_COLOR = "1"
        expect(terminalEnv().NO_COLOR).toBeUndefined()
    })

    it("strips NO_COLOR whatever its value", () => {
        for (const v of ["1", "true", "yes", "0"]) {
            process.env.NO_COLOR = v
            expect(terminalEnv().NO_COLOR).toBeUndefined()
        }
    })

    it("advertises truecolor", () => {
        expect(terminalEnv().COLORTERM).toBe("truecolor")
    })

    it("passes the rest of the environment through", () => {
        process.env.SOME_UNRELATED_VAR = "keep-me"
        expect(terminalEnv().SOME_UNRELATED_VAR).toBe("keep-me")
    })

    it("lets per-session vars win (model, API key, MCP token)", () => {
        const env = terminalEnv({ ANTHROPIC_MODEL: "claude-opus-5", COLORTERM: "256color" })
        expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5")
        // An explicit override still wins — the default is a floor, not a cage.
        expect(env.COLORTERM).toBe("256color")
    })

    it("does not mutate the real process environment", () => {
        process.env.NO_COLOR = "1"
        terminalEnv()
        expect(process.env.NO_COLOR).toBe("1")
    })
})

describe("terminalEnv — deterministic TERM", () => {
    // On Windows conpty ignores node-pty's `name`, so the child used to inherit
    // whatever the launcher exported: xterm-256color from Git Bash, nothing from
    // the Start Menu. Colour that depends on how the app was started is a bug you
    // can't reproduce on demand.
    it("declares a 256-colour TERM even when the parent has none", () => {
        delete process.env.TERM
        expect(terminalEnv().TERM).toBe("xterm-256color")
    })

    it("overrides a downgraded inherited TERM", () => {
        process.env.TERM = "dumb"
        expect(terminalEnv().TERM).toBe("xterm-256color")
    })

    it("is identical regardless of how DevDeck was launched", () => {
        process.env.TERM = "xterm-256color"
        process.env.NO_COLOR = "1"
        const fromBash = terminalEnv()
        delete process.env.TERM
        delete process.env.NO_COLOR
        const fromStartMenu = terminalEnv()
        expect(fromBash.TERM).toBe(fromStartMenu.TERM)
        expect(fromBash.COLORTERM).toBe(fromStartMenu.COLORTERM)
        expect(fromBash.NO_COLOR).toBe(fromStartMenu.NO_COLOR) // both undefined
    })
})
