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
    /** The file check failed: not CHANGED, and explicitly not clean either. */
    | "unchecked"
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
    /**
     * Paths dirty now that were not dirty when the session started.
     *
     * Three values, because there are three facts. A `number` is a claim about
     * the tree. `null` is "we asked and could not find out" — the read failed —
     * and the tile must then neither say CHANGED nor let any chip read as
     * "nothing happened here". `undefined` is "nobody has asked yet", the gap of
     * one poll interval after mount, which is not a failure and must stay quiet.
     *
     * `0` used to absorb all three, which is why the board needed a module-level
     * `checkFailed` Set to say the second one out of band.
     */
    changedCount: number | null | undefined
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
     * Washi, and the tile has to stay legible in all 6 skins.
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
function exited(code: number, changedCount: number | null | undefined): TileState {
    const hex = "0x" + (code >>> 0).toString(16).toUpperCase()
    // Review is the only action a dead process can still be given, and only if
    // it left something behind. Reply is meaningless: nothing is listening.
    //
    // `null` — we could not find out — offers it too. Withholding the only
    // remaining action because a `git status` failed is the app deciding there
    // is nothing to see on evidence it does not have.
    const actions: TileActionKind[] = changedCount == null || changedCount > 0 ? ["review"] : []
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
 *
 * Wraps `baseTileState` with one rule that cuts across all of it: when the file
 * check FAILED (`changedCount === null`, as opposed to `undefined` for "not
 * asked yet"), no chip may read as "nothing happened here" and Review must stay
 * reachable. QUIET is the chip that reads that way, so it is replaced outright;
 * every other state keeps its more useful headline and gains the sentence and
 * the action. NEEDS YOU and ASKING are left alone: the tile is relaying a
 * question, and files are not what is being asked about.
 */
export function resolveTileState(i: TileStateInput, now: number): TileState {
    const st = baseTileState(i, now)
    if (i.changedCount !== null || st.kind === "needs-you" || st.kind === "asking") return st
    if (st.kind === "quiet") {
        return {
            kind: "unchecked",
            chip: "COULDN'T CHECK",
            mark: "?",
            tone: "quiet",
            detail: "Couldn't check for file changes since this session started.",
            actions: ["review"]
        }
    }
    return {
        ...st,
        detail: `${st.detail ? st.detail + " " : ""}Couldn't check for file changes.`,
        actions: st.actions.includes("review") ? st.actions : [...st.actions, "review"]
    }
}

function baseTileState(i: TileStateInput, now: number): TileState {
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
    //    A null count skips this rule rather than being read as 0: the tile
    //    makes no file claim at all when the read failed, instead of quietly
    //    asserting the tree is clean.
    if (typeof i.changedCount === "number" && i.changedCount > 0) {
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
            // Not "finished a turn" — the app cannot know that. All it observed
            // is silence past the idle threshold, and the chip above already
            // says how long. State the observation, not the inference.
            detail: "Quiet since its last output — it is not doing anything right now.",
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
 * Does this session want something from you?
 *
 * The ONE predicate behind every "who wants you" count in the frame — the deck
 * bar's flag and Mission's header both read it, because two numbers for one
 * question, 200px apart, disagreeing by construction is a defect this app has
 * already fixed once.
 *
 * `seen` is a third ARGUMENT rather than a field on the input, and that is the
 * point: `resolveTileState` takes the input, so a field there could be read by
 * the classifier and would put a visibility-derived fact back into what a
 * session IS. As an argument to this predicate alone, it structurally cannot.
 *
 * Deliberately over the raw facts rather than the resolved chip kind. A
 * `waiting` session that has also changed files resolves to CHANGED — the more
 * useful single label for a tile — but it still wants you, and the deck bar has
 * no changed count with which to agree. Counting off the kind could therefore
 * never match; counting off the facts can.
 */
/**
 * Does this session have a process behind it?
 *
 * The header used to answer this with `sessions.length`, which counts TABS.
 * Restoring a workspace stamps `paneHold = "resume"` on every agent pane and
 * starts nothing, so five restored sessions read "5 running" while each pane
 * said, honestly, "Restored from your last run."
 *
 * `alive` is deliberately not the input: it is true for "a pane whose process
 * died but whose tab is still open" (see the note in `baseTileState`), so it
 * means "this tab is an agent", not "this agent is running". Two facts do
 * establish a process — it has not exited, and it is not being held for a
 * resume or a restart — and those are what this reads.
 *
 * `held` is the pane's `paneHold` entry: "resume" after a workspace restore,
 * "restart" after an exit, `undefined` when neither.
 */
export function hasProcess(
    i: Pick<TileStateInput, "exitCode">,
    held: "resume" | "restart" | undefined
): boolean {
    if (i.exitCode !== undefined) return false
    return held === undefined
}

export function wantsYou(
    i: Pick<TileStateInput, "status" | "prompt" | "exitCode" | "lastAt" | "awaited" | "alive">,
    now: number,
    seen = false
): boolean {
    // A dead process wants nothing.
    if (i.exitCode !== undefined) return false
    // Blocked on a question. Looking at it does not answer it, so `seen` buys
    // nothing here - only the two states you can genuinely leave alone are
    // acknowledgeable.
    if (i.status === "attention") return true
    // An unanswered permission prompt, by the SAME rule - and `prompt` was not
    // in this input at all until 2026-09-07, which is how the two disagreed.
    //
    // `seen` is granted when a session goes `waiting` while you are looking at
    // it (store.ts:674), and that rule is right: watching an agent hand back is
    // knowing about it. But the detector can then find a QUESTION in that same
    // silence. The tile promoted and drew live Approve/Deny; this predicate
    // could not see the prompt, so the deck flag and Mission's header both read
    // zero while a tile on screen asked to be answered. One count per question
    // means this one, and it was answering a different question from the tile.
    if (i.prompt) return true
    // Finished its turn and handed back. Once you have looked at it (or acted on
    // it) it is a thing you know about and deliberately left, so it stops
    // counting. It is still `waiting` - this changes the COUNT, never the state.
    if (i.status === "waiting") return !seen
    return isStalled(i.lastAt, i.alive, i.awaited, now)
}
