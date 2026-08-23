/**
 * What one Mission tile is saying right now, and the single action that answers
 * it. One chip per tile, FIRST MATCH WINS.
 *
 * Every state here is derived from something DevDeck knows exactly — a detected
 * prompt, a recorded exit code, a status, a timestamp, a count of paths — and
 * none of them from prose. This app has repeatedly shipped signals that lied (a
 * terminal title read as a bell, a one-second pause read as "finished", a stall
 * check that never fired) and each cost more trust than the signal was worth.
 * Parsing tool output for test failures would be the next one, and is cut.
 *
 * Pure and store-free: the caller passes the facts in, which is also what makes
 * the precedence testable without a renderer.
 */

import type { AgentStatus } from "./store"
import type { ApprovalPrompt } from "./approval"
import { isStalled, relTime } from "./missionTail"
import { FASTFAIL } from "./termExit"

export type TileActionKind = "approve" | "deny" | "reply" | "review"

/**
 * How loud the chip is. `attention` spends the accent and is reserved for the
 * states where the agent is blocked ON YOU; `warn` is the clay used for stalls;
 * `neutral` and `quiet` spend nothing. --ok and --danger are semantic (success,
 * destructive) and never stand in for the accent, so no state maps to them.
 */
export type TileTone = "attention" | "warn" | "neutral" | "quiet"

export type TileStateKind =
    | "needs-you"
    | "exited"
    | "asking"
    | "stalled"
    | "changed"
    | "waiting"
    | "working"
    | "quiet"

export interface TileStateInput {
    /** The store's agent status for this session. */
    status: AgentStatus
    /** A permission prompt this session is blocked on — missionTail's promptFor. */
    prompt: ApprovalPrompt | null
    /** The code its process exited with, if it has exited. 0 is an exit. */
    exitCode: number | undefined
    /** When it last produced output (ms epoch), stamped at launch if never. */
    lastAt: number | undefined
    /** Paths dirty now that were not dirty when the session started. */
    changedCount: number
    /** Is a board card or pipeline step actually waiting on this session? */
    awaited: boolean
    /** Is the session still on the grid (`!!termAgents[id]`)? */
    alive: boolean
}

export interface TileState {
    kind: TileStateKind
    /** The chip's text. Short enough to sit on one line of a dense tile. */
    chip: string
    /**
     * A glyph that differs per state. DESIGN.md requires state to read in FORM
     * as well as colour: --clay and --danger are a shade apart in Sumi and
     * Washi, and the tile has to stay legible in all 84 skins.
     */
    mark: string
    tone: TileTone
    /** Longer text for the tooltip, and for the question under NEEDS YOU. */
    detail?: string
    /** In render order. Empty for the states that cannot be answered. */
    actions: TileActionKind[]
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`

/** The exit chip: clean, fast-fail, or a code. */
function exited(code: number, changedCount: number): TileState {
    const hex = "0x" + (code >>> 0).toString(16).toUpperCase()
    // Review is the only action a dead process can still be given, and only if
    // it left something behind. Reply is meaningless: nothing is listening.
    const actions: TileActionKind[] = changedCount > 0 ? ["review"] : []
    if (code === 0) {
        return {
            kind: "exited",
            chip: "EXITED",
            mark: "□",
            tone: "quiet",
            detail: "The process exited cleanly.",
            actions
        }
    }
    if (code === FASTFAIL) {
        return {
            kind: "exited",
            chip: "EXITED · KILLED",
            mark: "□",
            tone: "warn",
            // The same cause termExit's notice names, minus the fix — the fix
            // is in the terminal, which is one click away and where you would
            // act on it.
            detail:
                `Killed before it could start (${code} / ${hex}) — on Windows this is ` +
                "usually antivirus terminating the shell. The terminal has the fix.",
            actions
        }
    }
    return {
        kind: "exited",
        chip: `EXITED ${code}`,
        mark: "□",
        tone: "warn",
        detail: `The process exited with code ${code} (${hex}).`,
        actions
    }
}

/**
 * Resolve one tile's state. Order is the contract — see the spec's table.
 */
export function resolveTileState(i: TileStateInput, now: number): TileState {
    // 1. Blocked on you, and we know exactly what it asked.
    if (i.prompt) {
        return {
            kind: "needs-you",
            chip: "NEEDS YOU",
            mark: "●",
            tone: "attention",
            detail: i.prompt.question,
            actions: ["approve", "deny"]
        }
    }
    // 2. Dead outranks silent: `alive` below is true for a pane whose process
    //    died but whose tab is still open, so without this every corpse would
    //    also read as stalled.
    if (i.exitCode !== undefined) return exited(i.exitCode, i.changedCount)
    // 3. It wants something, but nothing in the tail parses as a prompt we can
    //    answer with a keystroke. A sentence can still answer it.
    if (i.status === "attention") {
        return {
            kind: "asking",
            chip: "ASKING",
            mark: "◆",
            tone: "attention",
            detail: "Flagged for your attention, with no prompt we can answer for you.",
            actions: ["reply"]
        }
    }
    // 4. Silent, alive, and something is actually waiting on it.
    if (isStalled(i.lastAt, i.alive, i.awaited, now)) {
        const ago = relTime(now, i.lastAt)
        return {
            kind: "stalled",
            chip: `STALLED · silent ${ago}`,
            mark: "⋯",
            tone: "warn",
            detail: `No output for ${ago}, and something is waiting on this session.`,
            actions: ["reply"]
        }
    }
    // 5. It produced something you have not looked at. Above WORKING on
    //    purpose: work that exists is reviewable whether or not it is finished.
    if (i.changedCount > 0) {
        return {
            kind: "changed",
            chip: `CHANGED · ${plural(i.changedCount, "file")}`,
            mark: "▤",
            tone: "neutral",
            detail: `${plural(i.changedCount, "file")} changed since this session started.`,
            actions: ["review"]
        }
    }
    // 6. Finished a turn while you were looking elsewhere. Not a question and
    //    not a stall — the app's own soft signal that it is your move. Below
    //    CHANGED because reviewable work is the more useful thing to say, and
    //    NOT accent-toned: a live question is what the accent is saved for, and
    //    an accent on every agent that finished its turn is a light that never
    //    goes off.
    if (i.status === "waiting") {
        const ago = relTime(now, i.lastAt)
        return {
            kind: "waiting",
            chip: ago && ago !== "now" ? `WAITING ${ago}` : "WAITING",
            mark: "◇",
            tone: "neutral",
            detail: "Finished a turn while you were away — it is your move.",
            actions: ["reply"]
        }
    }
    // 7. Mid-turn. Nothing to decide.
    if (i.status === "working") {
        return { kind: "working", chip: "WORKING", mark: "▶", tone: "neutral", actions: [] }
    }
    // 8. The resting state of an agent that finished and handed back to you.
    const ago = relTime(now, i.lastAt)
    return {
        kind: "quiet",
        chip: ago && ago !== "now" ? `QUIET ${ago}` : "QUIET",
        mark: "–",
        tone: "quiet",
        actions: []
    }
}

/**
 * Does this state want something from you?
 *
 * Drives the Mission header's count, which used to read raw `attention` status
 * and so undercounted the states the tiles now say out loud. `changed` is
 * deliberately excluded: reviewable work is a queue, not a block, and the
 * Review Queue section below already reports it.
 */
export function asksForYou(kind: TileStateKind): boolean {
    return kind === "needs-you" || kind === "asking" || kind === "waiting" || kind === "stalled"
}
