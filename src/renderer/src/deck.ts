import type { AgentStatus, AnySession } from "./store"
import { hasProcess } from "./tileState"

export interface DeckStrip {
    projectId: string
    projectName: string
    /** Agent sessions in this project (plain shells are excluded upstream). */
    keys: AnySession[]
    /** True when keys should render compressed (dot + badge, name hidden). */
    compressed: boolean
}

/**
 * What a deck key's status dot is allowed to say.
 *
 * `not-running` is deliberately NOT an `AgentStatus` and nothing sets it: it is
 * DERIVED, from the same two facts `hasProcess` reads. A fifth status in the
 * store would be a second answer to "is there a process behind this tab", and
 * two answers to one question, on two surfaces, is the defect being closed
 * here.
 */
export type DeckKeyStatus = AgentStatus | "not-running"

/**
 * The status one deck key renders — the session's own status, unless there is
 * no process behind it.
 *
 * The deck was the half of this that never got fixed. Mission's classifier
 * gained the rule (`tileState.ts`, rule 3: no exit code but a `paneHold` means
 * NOT RUNNING), and its header already counted "N running" off `hasProcess` —
 * but a restored key kept painting `status-idle`, the RESTING FORM OF A LIVE
 * AGENT, while the pane behind it said "Restored from your last run." qa saw
 * the same session read as quiet-and-fine on both surfaces after a restart.
 *
 * So this calls `hasProcess` rather than re-deriving: one predicate, and the
 * count, the chip and the dot cannot drift apart again.
 *
 * Exited and held collapse into ONE deck form on purpose. Mission has room for
 * words and says which (`EXITED 1` vs `NOT RUNNING`); a 6px dot does not, and
 * the fact a glance needs is the one they share — nothing is running in there.
 */
export function deckKeyStatus(
    status: AgentStatus,
    exitCode: number | undefined,
    held: "resume" | "restart" | undefined
): DeckKeyStatus {
    return hasProcess({ exitCode }, held) ? status : "not-running"
}

/**
 * Is there a process behind this key?
 *
 * The derived-status form of `hasProcess`, for the surfaces that hold a
 * `DeckKeyStatus` rather than the three raw facts - and deliberately the ONLY
 * such form, because "can I still act on this session" was being answered
 * ad hoc: the composer offered a dead session as a send target and pre-selected
 * it with its `Idle` preset, and the usage panel counted it under "running now".
 *
 * A predicate rather than a `!== "not-running"` at six call sites: the question
 * has one answer and the answer has one name, which is the whole reason
 * `not-running` is derived instead of stored.
 */
export function keyIsRunning(status: DeckKeyStatus): boolean {
    return status !== "not-running"
}

/**
 * How a tooltip names a deck key's status.
 *
 * The tip printed the raw status word, so a dead key hovered as "- idle" — the
 * lie in words as well as in form.
 */
export function deckKeyStatusLabel(status: DeckKeyStatus): string {
    return status === "not-running" ? "not running" : status
}

/**
 * The ONE status a terminal tab's dot shows for the several panes inside it.
 *
 * Takes statuses ALREADY through `deckKeyStatus` — one pane, one call — so the
 * "is there a process behind this" question is still answered in exactly one
 * place. Handing this raw statuses plus exit codes would make it the fifth
 * derivation, which is the defect being closed.
 *
 * Returns `null` for a tab with no agent panes at all: that is a shell tab, and
 * its dot has its own form (`.tab-dot.shell`, --moss). `null` rather than a
 * status because "no agent here" is not a state an agent can be in.
 *
 * Precedence: a live pane outranks a dead one. A tab is only `not-running` when
 * EVERY agent pane in it is — split a dead pane beside a working one and the tab
 * still has something running in it, which is what the tab-level dot claims.
 * A dead pane cannot hold `attention`, `waiting` or `working` anyway
 * (`deckKeyStatus` overrides all three), so testing them first costs nothing
 * and reads in ladder order.
 *
 * The ladder below is `missionTail`'s RANK order — attention, waiting, working,
 * idle, then nothing-running — and `tests/deck.test.ts` asserts it stays that
 * order, because a private priority inside one surface is how two surfaces come
 * to describe the same sessions differently.
 *
 * **`waiting` used to be absent from this ladder and fell through to `idle`.**
 * That was left as a known gap for a designer to rule on. This is the ruling,
 * and it is to GRANT it. Three reasons:
 *
 *   1. The stated reason for the gap no longer exists. It was that giving the
 *      tab the hollow ring would put a *breathing* dot on the tab of every
 *      session that finished a turn — and the waiting dot does not breathe any
 *      more. It is static, and a hollow diamond carries less ink than the
 *      filled disc this tab was painting in its place, so granting it makes the
 *      strip quieter rather than busier.
 *   2. `idle` is not a weaker `waiting`, it is a different claim. The strip was
 *      painting "resting" on a session blocked on your answer — the same class
 *      of lie as the `status-idle`-on-a-dead-session bug this module exists to
 *      close, on the surface you use to move between panes.
 *   3. This dot already renders four of the five forms, `not-running`
 *      included. A vocabulary that drops exactly one of its five values on one
 *      surface is not a smaller vocabulary, it is an exception nobody can
 *      predict. Every surface that reads the derived status now shows all of it.
 */
export function tabDotStatus(paneStatuses: DeckKeyStatus[]): DeckKeyStatus | null {
    if (paneStatuses.length === 0) return null
    if (paneStatuses.includes("attention")) return "attention"
    if (paneStatuses.includes("waiting")) return "waiting"
    if (paneStatuses.includes("working")) return "working"
    if (paneStatuses.every((s) => s === "not-running")) return "not-running"
    return "idle"
}

export interface ProjectSessionCounts {
    /** Sessions in this project, agent or plain shell. */
    terms: number
    /** Agent sessions - tabs that ARE agents, whether or not one is running. */
    agents: number
    /** Agent sessions asking for you right now. See the note below. */
    attention: number
}

/**
 * The switcher card's per-project counts.
 *
 * `terms` and `agents` count what EXISTS, so a restored session belongs in both
 * - the tab is real and reachable, and neither number claims anything is
 * running.
 *
 * `attention` is a nag, and it excludes two different things for two different
 * reasons:
 *
 *   - **Dead sessions**, via the derived status. The card counted
 *     `s.status === "attention"`, which is what the agent last DID and outlives
 *     the process that did it, so a project whose agents had all exited still
 *     wore the asking marker - the card is often the only thing on screen for a
 *     project you are not looking at, so it was the last surface still saying a
 *     corpse wanted you.
 *   - **Acknowledged sessions**, via `seen`. Looking at a session is the act
 *     that stops it nagging, and the acknowledgement axis dims the NAG only:
 *     nothing here rewrites the status, and `deckKeyStatus` still reports
 *     `attention` for a seen session, so its dot is unchanged. That separation
 *     is the whole rule - a glance that rewrote the state is the original bug,
 *     and it is why `ack` no longer touches status.
 *
 * A pure function rather than a loop in the component because it is the only
 * way to test the pair: absent from the count, and still `attention` in form.
 */
export function projectSessionCounts(
    sessions: AnySession[],
    keyStatus: (s: AnySession) => DeckKeyStatus,
    seen: Readonly<Record<string, true>>
): Record<string, ProjectSessionCounts> {
    const counts: Record<string, ProjectSessionCounts> = {}
    for (const s of sessions) {
        const c = (counts[s.projectId] = counts[s.projectId] ?? {
            terms: 0,
            agents: 0,
            attention: 0
        })
        c.terms++
        if (!s.isAgent) continue
        c.agents++
        if (keyStatus(s) === "attention" && !seen[s.termId]) c.attention++
    }
    return counts
}

/** Max agent keys shown expanded per project before compression kicks in. */
export const COMPRESS_THRESHOLD = 4

/**
 * Group agent sessions into per-project deck strips, in first-seen project
 * order. A project with no agent sessions produces no strip — it is "cold" and
 * reachable from the switcher, not the deck. When `active` is supplied and has
 * no strip, an empty strip is prepended so the user can start its first session.
 */
export function deriveDeckStrips(
    sessions: AnySession[],
    active?: { id: string; name: string }
): DeckStrip[] {
    const order: string[] = []
    const byId = new Map<string, DeckStrip>()
    for (const s of sessions) {
        let strip = byId.get(s.projectId)
        if (!strip) {
            strip = { projectId: s.projectId, projectName: s.projectName, keys: [], compressed: false }
            byId.set(s.projectId, strip)
            order.push(s.projectId)
        }
        strip.keys.push(s)
    }
    const strips = order.map((id) => {
        const strip = byId.get(id)!
        return { ...strip, compressed: strip.keys.length > COMPRESS_THRESHOLD }
    })
    if (active && !byId.has(active.id)) {
        strips.unshift({ projectId: active.id, projectName: active.name, keys: [], compressed: false })
    }
    return strips
}

/**
 * The termId to jump to when cycling agent sessions (Ctrl+Tab). Cycles across
 * all sessions in order; wraps; returns the first when `current` is unknown and
 * null when there are fewer than two sessions.
 */
export function nextSession(
    sessions: AnySession[],
    currentTermId: string | null,
    dir: 1 | -1
): string | null {
    if (sessions.length < 2) return null
    const idx = sessions.findIndex((s) => s.termId === currentTermId)
    if (idx < 0) return sessions[0].termId
    return sessions[(idx + dir + sessions.length) % sessions.length].termId
}

/**
 * The short identity a COMPRESSED deck key shows beside its agent badge.
 *
 * Compression hides the session name, and the badge is per-preset rather than
 * per-session — so DevDeck's own intended scenario, five Claude sessions in one
 * project, compressed to five identical `CLAUDE` pills: the deck could say how
 * many needed you, not which. This derives a short tail from the session's OWN
 * name, so what a compressed key shows is always a truncation of what the
 * expanded key shows.
 *
 * Deliberately NOT a launch-order numeral: a position in the strip changes when
 * a sibling closes, so it would look like an identity while naming something
 * else, and no other surface would agree with it.
 *
 * Returns "" when there is nothing to add — a name that is only the agent's own
 * word ("claude" under a `CLAUDE` badge) carries no session identity. Two
 * sessions genuinely sharing a name (split panes of one tab) get the same tail,
 * because they do share it; the tail reports the name, it cannot invent
 * distinctness the names do not have.
 */
export function shortSessionLabel(sessionName: string, badge = ""): string {
    const name = sessionName.trim()
    if (!name) return ""
    // Generated names are `<preset> <n>` ("claude 2"), so the digits are where
    // the identity actually lives — take them ahead of anything else, and take
    // ALL of them: a capped `\d{1,3}` would render "claude 1234" as "234",
    // which is a different session's tail rather than a shorter form of this
    // one's.
    const trailingNumber = /(\d+)\s*$/.exec(name)
    let short: string
    if (trailingNumber) {
        short = trailingNumber[1]
    } else {
        const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
        if (words.length === 0) return ""
        short = (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase()
    }
    // Nothing gained if the pill would only repeat its own badge's opening.
    return badge.toUpperCase().startsWith(short) ? "" : short
}
