import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
    declaredFor,
    saidLine,
    saidTip,
    blockedWord,
    hookHealth
} from "../src/renderer/src/declaredSignal"
import type { DeclaredSignal } from "../src/shared/attention"

/**
 * PROVENANCE, AS THE INTERFACE STATES IT.
 *
 * `b7e2d69` gave DevDeck a fact it did not show: a declaration writes
 * `agentStatus` like any inference, and the `declared` axis beside it says the
 * agent stated it rather than DevDeck guessing from pty bytes. The design
 * ruling is that the distinction is carried in WORDS - a verb on words the app
 * already has - and not in a mark: the status dot has five forms and DESIGN.md
 * forbids a sixth, `attention` is the only status that may spend the accent,
 * and a frame's mark budget was just cut from ~14 to 6.
 *
 * What is pinned here is every sentence, plus the two gates that stop a
 * provenance marker becoming a lie.
 */

const sig = (over: Partial<DeclaredSignal> = {}): DeclaredSignal => ({
    termId: "t1",
    state: "attention",
    matchedBy: "session-env",
    at: 1_700_000_000_000,
    event: "Notification",
    ...over
})

describe("declaredFor", () => {
    it("finds the record that is the provenance of the status being painted", () => {
        const d = { t1: sig() }
        expect(declaredFor(d, "t1", "attention")).toBe(d.t1)
    })

    it("reports nothing when there is no record - DevDeck guessed", () => {
        expect(declaredFor({}, "t1", "attention")).toBeNull()
    })

    it("refuses a record whose state is not the status on screen", () => {
        // setStatus keeps the two together for what it writes, so this is the
        // defensive half - but a surface that labelled one state with another
        // state's provenance would be claiming the agent said something it
        // did not.
        const d = { t1: sig({ state: "waiting" }) }
        expect(declaredFor(d, "t1", "attention")).toBeNull()
    })

    it("refuses a dead session, because the DERIVED status has a value the store never writes", () => {
        // A pty that exits stamps `paneHold` and every surface flips to
        // `not-running` while the declaration is still sitting in the record.
        // "The agent said so" over a process that is gone is exactly the class
        // of claim this app keeps having to remove.
        const d = { t1: sig() }
        expect(declaredFor(d, "t1", "not-running")).toBeNull()
    })

    it("shows nothing for a declared `working`, matching the store's own gate", () => {
        // `declaredHold` lets a declaration outrank the inference for the two
        // hand-over states only: a declared `working` says a turn STARTED, not
        // how it ends, and holds nothing. The visible axis has the same scope,
        // so a WORKING tile - which has nothing to decide - gains no line.
        const d = { t1: sig({ state: "working" }) }
        expect(declaredFor(d, "t1", "working")).toBeNull()
        expect(declaredFor(d, "t1", "idle")).toBeNull()
    })

    it("refuses a record that was never attributed to a session", () => {
        const d = { t1: sig({ matchedBy: "none" }) }
        expect(declaredFor(d, "t1", "attention")).toBeNull()
    })
})

describe("saidLine", () => {
    it("quotes the agent's own words, because DevDeck could not have invented them", () => {
        // The quotation marks are the form channel: quoted text reads as
        // someone else's words with no key to learn, and it survives a
        // colour-vision difference, reduced motion and all six skins.
        expect(saidLine(sig({ message: "Allow Bash(npm test)?" }))).toBe(
            "the agent said “Allow Bash(npm test)?”"
        )
    })

    it("states the provenance plainly when the hook carried no words", () => {
        // A bare `{ state }` post from a hand-written wrapper, or a Stop with
        // no last message. There is nothing to quote and "so" refers to the
        // chip immediately above the line.
        expect(saidLine(sig())).toBe("the agent said so")
    })

    it("hedges the SUBJECT when only the folder matched", () => {
        // main accepts a cwd match only when exactly one running agent is in
        // that directory - a sound guess, and still a guess about WHICH pane.
        // The hedge names the weaker route and explains why DevDeck believed
        // it, in the same breath, rather than adding a second marker.
        expect(saidLine(sig({ matchedBy: "cwd", message: "Run tests?" }))).toBe(
            "the agent in this folder said “Run tests?”"
        )
        expect(saidLine(sig({ matchedBy: "cwd" }))).toBe("the agent in this folder said so")
    })

    it("keeps an exact match unhedged on both of its routes", () => {
        expect(saidLine(sig({ matchedBy: "cli-session" }))).toBe("the agent said so")
    })
})

describe("saidTip", () => {
    it("says the point first, then how sure DevDeck is that it was this pane", () => {
        const tip = saidTip(sig({ event: "Notification", matchedBy: "session-env" }))
        expect(tip).toContain("stated this itself")
        expect(tip).toContain("did not read it off the terminal")
        expect(tip).toContain("Notification")
        expect(tip).toContain("matched by the session id DevDeck gave it")
    })

    it("names the weaker route as the guess it is", () => {
        expect(saidTip(sig({ matchedBy: "cwd" }))).toContain("only agent running there")
        expect(saidTip(sig({ matchedBy: "cli-session" }))).toContain("sent earlier in this run")
    })
})

describe("blockedWord", () => {
    it("keeps DevDeck's own two words for an inference", () => {
        // The words DESIGN.md fixes for the blocked-on-you line. Unchanged by
        // this feature, which is the point: provenance adds a verb, it does not
        // rename a state.
        expect(blockedWord("attention", null)).toBe("needs you")
        expect(blockedWord("waiting", null)).toBe("waiting for you")
    })

    it("adds the verb, and nothing else, when the agent stated it", () => {
        expect(blockedWord("attention", sig())).toBe("says it needs you")
        expect(blockedWord("waiting", sig({ state: "waiting" }))).toBe(
            "says it is waiting for you"
        )
    })

    it("stays absent for every other status - the marker only ever adds", () => {
        expect(blockedWord("working", null)).toBeNull()
        expect(blockedWord("idle", null)).toBeNull()
        expect(blockedWord("not-running", null)).toBeNull()
        // Even with a record: nothing is listening behind a dead tab, so
        // "says it needs you" would be the same lie in words the flag was
        // already corrected for once.
        expect(blockedWord("not-running", sig())).toBeNull()
    })
})

describe("hookHealth", () => {
    it("says a hook cannot arrive at all while the server is off", () => {
        const h = hookHealth({ running: false, reporting: 0, unmatched: 0 })
        expect(h.line).toBe("Hooks arrive on this server, so they need it switched on.")
        expect(h.hint).toBeUndefined()
    })

    it("never lets zero read as health, and never claims history", () => {
        // THE FAILURE THIS BLOCK EXISTS TO KILL: a hook wired wrong and a hook
        // never wired produce the same nothing. So zero is a sentence, not an
        // absence - and it is PRESENT TENSE, because a declaration is spent
        // when you answer it and "no hook has arrived yet" would go false the
        // moment one did and was answered.
        const h = hookHealth({ running: true, reporting: 0, unmatched: 0 })
        expect(h.line).toBe("No session is reporting its own state right now.")
        expect(h.line).not.toMatch(/\byet\b/)
        expect(h.hint).toContain("it is not reaching DevDeck")
    })

    it("counts the sessions that are reporting, with agreeing grammar", () => {
        expect(hookHealth({ running: true, reporting: 1, unmatched: 0 }).line).toBe(
            "1 session is reporting its own state."
        )
        expect(hookHealth({ running: true, reporting: 3, unmatched: 0 }).line).toBe(
            "3 sessions are reporting their own state."
        )
    })

    it("drops the guidance once something is reporting", () => {
        expect(hookHealth({ running: true, reporting: 2, unmatched: 0 }).hint).toBeUndefined()
    })

    it("names an unmatched hook, its window, and the two causes", () => {
        const h = hookHealth({ running: true, reporting: 0, unmatched: 2 })
        expect(h.unmatched).toContain("2 hooks arrived since DevDeck started")
        expect(h.unmatched).toContain("X-DevDeck-Session")
        expect(h.unmatched).toContain("started outside DevDeck")
    })

    it("pluralises one unmatched hook", () => {
        expect(hookHealth({ running: true, reporting: 0, unmatched: 1 }).unmatched).toContain(
            "1 hook arrived"
        )
    })

    it("is additive, not a fourth state", () => {
        // One agent wired correctly while another was started outside DevDeck
        // is a real pair of facts. Two independent sentences cannot contradict
        // each other; one sentence choosing between them could.
        const h = hookHealth({ running: true, reporting: 1, unmatched: 4 })
        expect(h.line).toBe("1 session is reporting its own state.")
        expect(h.unmatched).toContain("4 hooks arrived")
    })

    it("says nothing about unmatched hooks when there are none", () => {
        expect(hookHealth({ running: true, reporting: 1, unmatched: 0 }).unmatched).toBeUndefined()
    })
})

/**
 * The grammar, held to the stylesheet.
 *
 * Provenance may not spend the accent (that is `attention`'s alone) and may not
 * become a sixth dot form. Both are one grep away from being re-added by
 * someone who thinks the line looks weak.
 */
describe("the provenance line's tokens", () => {
    const css = readFileSync(
        join(__dirname, "..", "src", "renderer", "src", "styles.css"),
        "utf8"
    )
    const rule = (sel: string): string => {
        const i = css.indexOf("\n" + sel + " {")
        expect(i).toBeGreaterThan(-1)
        return css.slice(i, css.indexOf("}", i))
    }

    it("sets the agent's words in --text on the tile's own ground", () => {
        // --muted was the first choice, as metadata. It measures 4.46:1 on
        // Washi's --bg-2 - the Mission tile's own background - which is under
        // the 4.5 text floor for an 11px line whose words are the whole point.
        const r = rule(".mtile-said")
        expect(r).toContain("color: var(--text)")
        expect(r).not.toContain("--muted")
        expect(r).not.toContain("--faint")
    })

    it("spends no accent and adds no mark", () => {
        const r = rule(".mtile-said")
        expect(r).not.toContain("--accent")
        expect(r).not.toContain("border")
        expect(r).not.toContain("background")
        expect(r).not.toContain("animation")
    })

    it("adds no sixth status-dot form", () => {
        // The five are idle / working / waiting / attention / not-running.
        const forms = new Set(
            [...css.matchAll(/\.tab-dot\.status-([a-z-]+)/g)].map((m) => m[1])
        )
        expect([...forms].sort()).toEqual([
            "attention",
            "idle",
            "not-running",
            "waiting",
            "working"
        ])
    })
})
