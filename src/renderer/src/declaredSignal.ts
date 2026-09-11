/**
 * PROVENANCE, IN WORDS. The only place that decides how DevDeck says "the agent
 * told me this" rather than "I worked this out from the terminal".
 *
 * `store.ts` records the fact: a declaration writes `agentStatus` — the one
 * field every surface already reads — and leaves a `DeclaredSignal` on the
 * parallel `declared` axis, shaped exactly like `seen`. Absence means DevDeck
 * guessed from pty bytes. Nothing consumed either until this module.
 *
 * WHY WORDS AND NOT A MARK. Three reasons, in the order they decided it:
 *
 *  1. **Provenance is not actionable.** The status is the same, the count is
 *     the same, the buttons are the same. You consult provenance when you
 *     DOUBT a signal — which is on demand, not at a glance. A mark is for a
 *     fact you must see without asking, and the status dot already has its
 *     five forms (DESIGN.md forbids a sixth), the accent already has its one
 *     job, and a frame's mark budget was just cut from ~14 to 6.
 *  2. **The thing worth seeing is not the flag "declared" — it is what the
 *     agent SAID.** A declaration carries the agent's own sentence. That
 *     sentence proves its own provenance (DevDeck cannot invent words) and is
 *     strictly more useful than any badge saying a word arrived.
 *  3. **A verb needs no legend.** DESIGN.md prefers a word to an encoding, and
 *     the verb does the whole job: `needs you` is DevDeck's reading, `says it
 *     needs you` is the agent's statement. Same slot, same token, same weight,
 *     no new mark, no accent, no per-theme contrast to buy. Text ink survives a
 *     colour-vision difference, `prefers-reduced-motion` and all six skins by
 *     construction.
 *
 * SCOPE, MATCHED TO THE STORE'S OWN GATE. `declaredHold` in `store.ts` lets a
 * declaration outrank the inference for `attention` and `waiting` only — a
 * declared `working` says a turn started, not how it ends, and holds nothing.
 * The visible axis has exactly that scope: provenance is shown on the two
 * hand-over states and nowhere else. Those are also the two the inference got
 * wrong four times in a week. A `working` tile has nothing to decide, so
 * provenance there would be decoration.
 *
 * Pure and store-free — the caller passes the record in. That is what lets the
 * sentences be pinned by `tests/declaredSignal.test.ts` under vitest's `node`
 * environment, which is the only environment this project tests in.
 */

import type { DeclaredSignal } from "../../shared/attention"
import type { DeckKeyStatus } from "./deck"

/**
 * The record that is the provenance of the status a surface is ABOUT TO PAINT,
 * or null.
 *
 * Two gates, and both are the difference between a provenance marker and a lie:
 *
 *  - **The record's state must equal the derived status.** `setStatus`'s
 *    invariant keeps them together for the statuses it writes, but the DERIVED
 *    status has a value the store never writes: `not-running`. A pty that dies
 *    stamps `paneHold` and the tile flips to NOT RUNNING while the declaration
 *    is still sitting there. "The agent said so" over a dead process is exactly
 *    the class of claim this app keeps having to remove.
 *  - **Only the two hand-over states**, per the scope note above.
 */
export function declaredFor(
    declared: Record<string, DeclaredSignal>,
    termId: string,
    status: DeckKeyStatus
): DeclaredSignal | null {
    if (status !== "attention" && status !== "waiting") return null
    const d = declared[termId]
    if (!d || d.state !== status) return null
    // `termId: null` never reaches `declared` (store.ts routes it to the
    // unmatched counter), and `matchedBy: "none"` cannot be attributed to a
    // session by definition. Refused here too rather than trusted upstream.
    if (d.matchedBy === "none") return null
    return d
}

/**
 * Who DevDeck believes said it, as the subject of the sentence.
 *
 * `cwd` is the one route where the ADDRESSING was inferred even though the
 * state was stated: main accepts it only when exactly one running agent is in
 * that directory, which is a sound guess and still a guess. The hedge is in the
 * subject rather than in a second marker — "the agent in this folder" both
 * names the weaker route and explains why DevDeck believed it.
 */
const subject = (d: DeclaredSignal): string =>
    d.matchedBy === "cwd" ? "the agent in this folder" : "the agent"

/**
 * The visible provenance line for a Mission tile.
 *
 * The quotation marks are the form channel: everyone reads quoted text as
 * someone else's words, with no key to learn. Where the hook carried no message
 * there is nothing to quote, so the line states the provenance plainly instead
 * and "so" refers to the chip directly above it.
 */
export function saidLine(d: DeclaredSignal): string {
    return d.message ? `${subject(d)} said “${d.message}”` : `${subject(d)} said so`
}

/** How the hook was attributed to this pane, in a clause a stranger can read. */
const ROUTE: Record<DeclaredSignal["matchedBy"], string> = {
    "session-env": "matched by the session id DevDeck gave it",
    "cli-session": "matched by the session id it sent earlier in this run",
    cwd: "matched by its folder — it was the only agent running there",
    none: "not matched to a session"
}

/**
 * The full provenance, for the tooltip on every surface that shows the line.
 *
 * Says the thing the whole feature is for in its first clause, then the two
 * facts a doubter needs: which event the CLI called it, and how sure DevDeck is
 * that it was THIS pane. The CLI's own event name is jargon, which is why it
 * lives here and not on the visible line.
 */
export function saidTip(d: DeclaredSignal): string {
    return (
        "The agent stated this itself, over the hook — " +
        "DevDeck did not read it off the terminal.\n" +
        `${d.event} · ${ROUTE[d.matchedBy]}`
    )
}

/**
 * The line AND its provenance — for a surface that renders the line clipped.
 *
 * Mission's tile sets `.mtile-said` to one nowrap line with an ellipsis, which
 * cut the agent's own sentence at ~44 characters with no way to read the rest:
 * the tooltip there carried `saidTip` alone, so the explainer was recoverable
 * and the thing being explained was not (2026-09-12 verification, §4). The
 * sentence is the whole argument for the declared axis — it is the one piece of
 * evidence DevDeck could not have invented — so it goes first, above the
 * provenance, in the same order the tile itself reads.
 *
 * Repeating a line that is often fully visible is deliberate and already the
 * house pattern: `.mtile-q` has carried its own text as its tip since it
 * existed, because a reader cannot tell a clipped line from a short one without
 * hovering, and a tooltip that sometimes withholds the text is worse than one
 * that sometimes repeats it.
 */
export function saidFullTip(d: DeclaredSignal): string {
    return `${saidLine(d)}\n${saidTip(d)}`
}

/**
 * The blocked-on-you word, with the provenance verb when there is one.
 *
 * DESIGN.md fixes `needs you` / `waiting for you` as the words, on one
 * component across three Overview heads, so the heads cannot come to describe
 * one state differently. Provenance adds a verb to the same words rather than a
 * fourth marker: `says it …` is the agent's statement, the bare form is
 * DevDeck's reading. `null` for every other status — the marker only ever ADDS.
 */
export function blockedWord(status: DeckKeyStatus, said: DeclaredSignal | null): string | null {
    if (status === "attention") return said ? "says it needs you" : "needs you"
    if (status === "waiting") return said ? "says it is waiting for you" : "waiting for you"
    return null
}

/**
 * What the Settings → MCP hook block says. Three states, never silence.
 *
 * The failure this exists to kill: a hook wired wrong and a hook never wired
 * produce the SAME nothing. So the block is always rendered while the section
 * is open, and it always says which of three things is true.
 *
 * `reporting` is how many sessions currently hold a declaration, and the copy
 * is deliberately PRESENT TENSE. A declaration is spent when you answer it, so
 * a count that claimed history ("no hook has arrived yet") would go back to
 * being false the moment one did and was answered. "Right now" is true in every
 * case, which is the only claim this state can honestly make: DevDeck cannot
 * tell a hook that is wired and idle from one that was never wired, and it says
 * "right now" rather than picking one.
 *
 * `unmatched` is separate and additive, because both can be true at once — one
 * agent wired correctly and another started outside DevDeck. Two independent
 * sentences cannot contradict each other; one sentence choosing between them
 * could.
 */
export interface HookHealth {
    /** The standing sentence. Always present. */
    line: string
    /** Guidance, only where the standing sentence cannot be acted on as-is. */
    hint?: string
    /** The misconfiguration, in a notice bar. Absent when the count is 0. */
    unmatched?: string
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`

export function hookHealth(i: {
    running: boolean
    reporting: number
    unmatched: number
}): HookHealth {
    let out: HookHealth
    if (!i.running) {
        out = { line: "Hooks arrive on this server, so they need it switched on." }
    } else if (i.reporting > 0) {
        out = {
            line:
                i.reporting === 1
                    ? "1 session is reporting its own state."
                    : `${i.reporting} sessions are reporting their own state.`
        }
    } else {
        out = {
            line: "No session is reporting its own state right now.",
            hint:
                "A wired hook shows up here, and on the session's tile, the moment it fires. " +
                "If you have wired one and it never does, it is not reaching DevDeck."
        }
    }
    if (i.unmatched > 0) {
        out.unmatched =
            `${plural(i.unmatched, "hook")} arrived since DevDeck started that it could not ` +
            "match to a session. The usual cause is a missing X-DevDeck-Session header in the " +
            "hook config, or an agent started outside DevDeck."
    }
    return out
}
