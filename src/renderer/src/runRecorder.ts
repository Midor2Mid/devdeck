/**
 * The run ledger's four write sites, lifted out of the store.
 *
 * A record is written once, when a run ends, and never updated. Every builder
 * here is wrapped: recording that a race landed must never be what stops it
 * landing. Nothing below throws, blocks, or is awaited by its caller.
 *
 * It lives in its own module for one concrete reason — the interesting question
 * this code asks ("may this cost be summed?") is about a *window in the past*,
 * so answering it correctly means reasoning over recorded history rather than
 * over live store state. That is unit-testable against the narrow `RecorderState`
 * below without driving the whole store, and it is what the exclusivity rule
 * needs.
 */

import type { Project } from "../../preload/index"
import type { AnySession } from "./store"
import type { BoardTask } from "./board"
import type { PipelineRun } from "./pipeline"
import { raceSpend, samePath, type Race } from "./race"
import { useSettings, type UsageEvent } from "./settings"
import type { RunExclusionReason, RunRecord } from "../../main/ledger"

/**
 * Exactly the slice of the store the recorder reads. Narrow on purpose: it is
 * the whole contract, so a test can supply an object literal for it.
 */
export interface RecorderState {
    projects: Project[]
    boardTasks: BoardTask[]
    races: Record<string, Race>
    pipelineRun: PipelineRun | null
    termAgents: Record<string, string>
    termCwd: Record<string, string>
    agentSessions: () => AnySession[]
}

/**
 * The two store-module helpers the recorder needs. Injected rather than
 * imported, so this module never imports the store at runtime (which would be a
 * cycle) and so tests can hand in a deterministic id generator.
 */
export interface RecorderDeps {
    newId: () => string
    isAgentId: (agentId: string) => boolean
    /**
     * Stamp `recordedFor` on a card that has just been recorded. The recorder
     * only reads state, so writing the guard back — the one thing it must make
     * durable — is handed to the store, which owns the card and its persistence.
     */
    markCardRecorded: (taskId: string, dispatchedAt: number) => void
}

export interface RunRecorder {
    /** A dispatched card reached done. */
    recordCardRun: (task: BoardTask, endedAt: number) => void
    /** A race landed or was abandoned. Called before the race object is deleted. */
    recordRaceRun: (
        cardId: string,
        fallback: Race,
        outcome: "landed" | "abandoned",
        winnerId?: string
    ) => void
    /** A pipeline run reached a terminal status. */
    recordPipelineRun: (run: PipelineRun | null, outcome: "done" | "failed" | "stopped") => void
    /** An agent pane closed. Writes a record only for a genuinely ad-hoc pane. */
    recordSessionRun: (termId: string, agentId: string) => void
    /**
     * Suppress the session record for a pane whose spend a parent record already
     * claims, when the parent's own link to that pane is about to disappear.
     */
    claimTerm: (termId: string) => void
}

/**
 * What a record calls a project it can no longer name. A blank renders as an
 * empty cell and, worse, as a blank `<option>` in the run filter that every
 * removed project collapses onto — so the ledger loses the very history it
 * exists to keep. Said out loud instead.
 */
export const REMOVED_PROJECT = "(removed project)"

export function createRunRecorder(
    get: () => RecorderState,
    deps: RecorderDeps
): RunRecorder {
    const { newId, isAgentId, markCardRecorded } = deps

    /** Append one record. Swallows everything — main's appendRun logs its own failures. */
    const writeRun = (rec: RunRecord): void => {
        try {
            window.api.ledger.append(rec)
        } catch (err) {
            console.error("[ledger] failed to record a run:", err)
        }
    }

    /** The project a record should name, by id — projects can be removed later. */
    const projectById = (projectId: string): Project | undefined =>
        get().projects.find((p) => p.id === projectId)

    /**
     * Do two half-open intervals share any instant? An event still open has no
     * end, so it runs to now — and every window this is asked about ends at now
     * or earlier, so `Infinity` is the same answer with no clock read.
     *
     * Half-open on purpose: a session that ended at exactly the instant the next
     * one began did not share a moment with it, and costInWindow would not put
     * its spend in the second window either.
     */
    const overlaps = (event: UsageEvent, from: number, to: number): boolean =>
        event.startedAt < to && (event.endedAt ?? Infinity) > from

    /**
     * Was this run's cost a receipt or an attribution?
     *
     * costInWindow sums every agent transcript in a project's transcript folder
     * inside a window, because Claude Code names transcripts by directory rather
     * than by pty. So two agents that shared a directory during a run each report
     * the combined spend, and adding those two figures adds the same money twice.
     * That is the whole reason this predicate exists.
     *
     * The question is therefore about the run's WINDOW, not about now:
     *
     *     non-exclusive iff some other agent session, in the same directory,
     *     overlapped [startedAt, endedAt].
     *
     * This used to be a snapshot of currently-open panes, justified by an
     * argument that is exactly inverted: it claimed the error could "only call
     * something exclusive that was briefly shared, never the reverse", as though
     * that were the safe direction. It is the dangerous one — calling a shared
     * run exclusive is what puts a doubled attribution into a total. And for a
     * card the snapshot was taken whenever it was dragged to *done*, which can be
     * hours after the money was spent and after every pane involved has closed:
     * two cards dispatched into one project would then each claim the other's
     * spend, both marked as receipts.
     *
     * The durable answer is `useSettings.usageLog`, which is persisted and has
     * its stale open events closed on load, so it is a complete list of every
     * agent session's [startedAt, endedAt]. Two additive tests, because neither
     * alone sees everything and both fail closed:
     *
     *  1. The log — every session started in this or any previous launch.
     *  2. Live panes — a pane restored from a previous launch never called
     *     logUsageStart, so it appears in no event at all, and only the live
     *     store knows it is sitting in this directory spending money.
     *
     * `ownTermIds` are the run's own sessions — a pipeline has one per step, so
     * this takes a list rather than the single id a card or a session has.
     *
     * An event written before `cwd` existed names no directory, so it cannot be
     * ruled out of this one: it counts as sharing. That is the fail-closed
     * choice, and it costs almost nothing in practice — adding the field needs a
     * restart, and a restart closes every open event, so a legacy event's window
     * lies entirely before any window recorded afterwards.
     *
     * With no directory to reason about there is nothing to be exclusive of, so
     * the answer is no: an unattributable cost must never enter a total.
     *
     * Paths are compared with `samePath` rather than `!==` for its case-folding,
     * which is live on Windows: two spellings of one directory that differ only in
     * case are the same directory, and costInWindow cannot tell them apart either.
     * Folding can only find MORE matches, i.e. mark more runs non-exclusive, which
     * is the fail-closed direction. Its slash-normalising now earns its keep too:
     * a worktree path reaches `UsageEvent.cwd` by way of `git worktree add`, which
     * answers in forward slashes, while a project path is whatever the user added
     * — so the two sides of this comparison genuinely can be spelled differently.
     *
     * Returns *why* the cost may not be summed, or undefined when it is a
     * receipt: "shared" and "unpriced" are two different things to tell a user,
     * and collapsing them meant saying "shared a project with another session"
     * about a run whose price simply could not be read.
     */
    const attributionReason = (
        cwd: string,
        ownTermIds: string[],
        startedAt: number,
        endedAt: number
    ): RunExclusionReason | undefined => {
        // No directory to reason about: nothing to be exclusive of, and no way to
        // price it either. Not "shared" - we do not know that, and saying so
        // would be inventing a fact.
        if (!cwd) return "unpriced"
        const own = new Set(ownTermIds.filter(Boolean))
        const shared = useSettings
            .getState()
            .usageLog.some(
                (e) =>
                    !own.has(e.id) &&
                    // No recorded directory: cannot be ruled out, so it counts.
                    (!e.cwd || samePath(e.cwd, cwd)) &&
                    overlaps(e, startedAt, endedAt)
            )
        if (shared) return "shared"
        const st = get()
        const live = st
            .agentSessions()
            .some((s) => !own.has(s.termId) && samePath(st.termCwd[s.termId] ?? s.projectPath, cwd))
        return live ? "shared" : undefined
    }

    /**
     * A card reached done. Its cost is the figure already cached on the card (the
     * board prices it as the agent works) — deliberately not re-read here, so the
     * record says what the card said. A card that was never priced records zero,
     * and marks it as not-a-receipt rather than as a summable $0.
     *
     * Known and accepted: `recordCardRun` runs synchronously inside
     * `moveBoardTask` while the re-price that move triggers resolves later, so a
     * card record can be written from a slightly stale cost. Fixing it would mean
     * awaiting inside a write site, and no write site may block or throw on the
     * path it sits in — a card must reach done whether or not it is recorded.
     *
     * The once-only guard is `task.recordedFor` (see BoardTask): a card carries
     * the dispatch it was recorded for, so the guard is exactly as durable as the
     * card, and survives the quit that a renderer-module set would not.
     */
    const recordCardRun = (task: BoardTask, endedAt: number): void => {
        try {
            const dispatchedAt = task.dispatchedAt ?? 0
            if (task.recordedFor === dispatchedAt) return
            markCardRecorded(task.id, dispatchedAt)
            const project = projectById(task.projectId)
            // Dispatched isolated? Then it was priced from its worktree, and
            // that is the directory whose exclusivity matters.
            const cwd = task.worktree || project?.path || ""
            // The stamp from dispatch first: by the time a card is dragged to
            // done its pane has usually closed, and termAgents no longer knows.
            const agentId = task.agentId ?? (task.termId ? get().termAgents[task.termId] : undefined)
            const startedAt = task.dispatchedAt ?? endedAt
            // A card the board never managed to price has no figure to vouch for;
            // that is a different thing to say than "it shared a directory".
            const reason: RunExclusionReason | undefined =
                task.cost === undefined
                    ? "unpriced"
                    : attributionReason(cwd, [task.termId ?? ""], startedAt, endedAt)
            writeRun({
                id: newId(),
                kind: "card",
                projectId: task.projectId,
                // The name as it was at dispatch, which is the one the design
                // promises and the only one a removed project still has.
                projectName: task.projectName || project?.name || REMOVED_PROJECT,
                label: task.title,
                startedAt,
                endedAt,
                agentIds: agentId && isAgentId(agentId) ? [agentId] : [],
                cost: task.cost ?? 0,
                tokens: task.costTokens ?? 0,
                exclusive: reason === undefined,
                reason,
                outcome: "done"
            })
        } catch (err) {
            console.error("[ledger] failed to build a card record:", err)
        }
    }

    /**
     * A race ended. One record for the whole race, written before the race object
     * is deleted — it is the only place the entrant costs still exist.
     *
     * `exclusive: true` is asserted, not computed: every entrant works in its own
     * git worktree, which is its own directory, so each entrant's figure is a real
     * receipt and their sum is too. No entrant is ever dispatched into the shared
     * project tree — a worktree that fails to be created means that entrant is
     * never dispatched at all (status "startfailed"), so it spends nothing.
     */
    const recordRaceRun = (
        cardId: string,
        fallback: Race,
        outcome: "landed" | "abandoned",
        winnerId?: string
    ): void => {
        try {
            // Read the race back out of state rather than trusting the snapshot
            // the caller took: teardown parks on a confirm, on settlePoll and on
            // landFrom, and the poll writes entrant costs and diffstats into the
            // store throughout. The snapshot is minutes stale by the time this runs.
            const r = get().races[cardId] ?? fallback
            const winner = winnerId ? r.entrants.find((e) => e.agentId === winnerId) : undefined
            const project = projectById(r.projectId)
            writeRun({
                id: newId(),
                kind: "race",
                projectId: r.projectId,
                projectName: project?.name || REMOVED_PROJECT,
                label: r.title,
                startedAt: r.startedAt,
                endedAt: Date.now(),
                agentIds: r.entrants.map((e) => e.agentId),
                cost: raceSpend(r),
                tokens: r.entrants.reduce((sum, e) => sum + (e.costTokens ?? 0), 0),
                exclusive: true,
                outcome,
                // Abandoning eliminates every entrant; landing eliminates the rest.
                // Counted over entrants that actually got a worktree: one whose
                // worktree failed to be created was never dispatched at all
                // (status "startfailed") and spent nothing, so calling it
                // "eliminated" overstates what the race threw away — the number
                // this field exists to report.
                eliminated: (() => {
                    const started = r.entrants.filter((e) => e.worktree).length
                    return outcome === "landed" ? Math.max(0, started - 1) : started
                })(),
                // The agent id, not the name: names are user-editable and two
                // presets called "Claude" are entirely plausible.
                winner: winner?.agentId,
                added: winner?.added,
                removed: winner?.removed
            })
        } catch (err) {
            console.error("[ledger] failed to build a race record:", err)
        }
    }

    // A pipeline run can reach a terminal status more than once (an errored run
    // is left on screen and can still be Stopped), and it must be recorded once.
    // Keyed by pipeline + start instant rather than by the run token, which
    // stopPipeline bumps as it goes.
    let lastPipelineRunKey = ""

    /**
     * A pipeline run reached a terminal status. The bar's live spend figure is
     * discarded when the run ends, so it is read once more here and recorded.
     * Fire-and-forget: the run is already over, and nothing waits on this.
     */
    const recordPipelineRun = (
        run: PipelineRun | null,
        outcome: "done" | "failed" | "stopped"
    ): void => {
        try {
            if (!run) return
            const startedAt = run.startedAt
            if (!startedAt) return
            const key = `${run.pipelineId}:${startedAt}`
            if (key === lastPipelineRunKey) return
            lastPipelineRunKey = key

            const endedAt = Date.now()
            const cwd = run.projectPath ?? ""
            const project = get().projects.find((p) => samePath(p.path, cwd))
            const termIds = run.steps.map((s) => s.termId ?? "")
            const shared = attributionReason(cwd, termIds, startedAt, endedAt)
            // This record claims those sessions' spend. Claimed synchronously,
            // before the pricing await: a step's pane can be closed at any point
            // after the run ends, including while this is still in flight.
            //
            // Only panes that still exist. A step's pane closed BEFORE the run
            // ended was already recognised as owned by the live run and needs no
            // claim; adding its id here would put an entry in the set that
            // nothing can ever remove, since the close that removes it has been
            // and gone.
            const live = get().termAgents
            for (const id of termIds) if (id && live[id]) claimedTerms.add(id)
            const agentIds = Array.from(new Set(run.steps.map((s) => s.agentId).filter(Boolean)))
            void (async () => {
                try {
                    const bucket = cwd
                        ? await window.api.usage.window(cwd, startedAt, endedAt).catch(() => null)
                        : null
                    writeRun({
                        id: newId(),
                        kind: "pipeline",
                        projectId: project?.id ?? "",
                        projectName: project?.name || REMOVED_PROJECT,
                        label: run.name,
                        startedAt,
                        endedAt,
                        agentIds,
                        cost: bucket?.cost ?? 0,
                        tokens: bucket?.tokens ?? 0,
                        // A price that couldn't be read is not a $0 receipt. Keep
                        // the row - it still says what ran, and for how long - but
                        // never let that zero into a total, and say which of the
                        // two things went wrong rather than blaming a sharer that
                        // may not exist.
                        exclusive: !!bucket && shared === undefined,
                        reason: !bucket ? "unpriced" : shared,
                        outcome
                    })
                } catch (err) {
                    console.error("[ledger] failed to price a pipeline run:", err)
                }
            })()
        } catch (err) {
            console.error("[ledger] failed to build a pipeline record:", err)
        }
    }

    // Term ids whose spend a parent record already claims, kept because the
    // parent's own link to them does not survive it. A pipeline's step sessions
    // outlive the run: the runner never closes them, and `pipelineRun` (the only
    // place `step.termId` exists) is nulled seconds after the run ends. By the
    // time such a pane is closed there is nothing live left to recognise it, and
    // it would write a session record for money the pipeline record already
    // counted. Entries are removed as those panes close.
    //
    // Deliberately NOT needed for the other two owners: a card keeps `termId` on
    // the card itself, which is persisted to workspace.json, and a race closes
    // every entrant's pane BEFORE deleting the race object (both in
    // landRaceWinner and in abandonRace — a live process cwd'd into a worktree
    // blocks its removal on Windows), so the race is always still in state when
    // its panes close. If that ordering is ever inverted, the suppression below
    // stops working for races and entrant sessions start double-counting a race.
    //
    // Deliberately NOT persisted, unlike BoardTask.recordedFor: a renderer reload
    // landing between a pipeline run ending and its step pane closing would drop
    // these claims, and that pane would then write a session record over money
    // the pipeline record already counted. Bounded (a handful of step panes) and
    // rare (a reload inside that window), where the card guard it is contrasted
    // with is neither — a quit between a card being recorded and being dragged
    // around the board is ordinary use.
    const claimedTerms = new Set<string>()

    /**
     * Is this pane's spend already recorded by the run that owns it?
     *
     * A race entrant, a pipeline step and a dispatched card each close their own
     * run with a record carrying better facts than a session ever could — an
     * outcome, a diffstat, a winner — over the same money. Only a genuinely
     * ad-hoc pane is a run in its own right. Ownership is read from the term-id
     * links the store already keeps, not from a second notion of who owns what.
     */
    const isOwnedPane = (termId: string): boolean => {
        if (claimedTerms.has(termId)) return true
        const st = get()
        if (Object.values(st.races).some((r) => r.entrants.some((e) => e.termId === termId)))
            return true
        if (st.pipelineRun?.steps.some((s) => s.termId === termId)) return true
        return st.boardTasks.some((t) => t.termId === termId && !!t.dispatchedAt)
    }

    /**
     * An agent pane closed. Pairs with the usageLog event `logUsageEnd` closes,
     * carrying the cost that log deliberately omits. Priced over the session's own
     * window in its own directory — which is an attribution, not a receipt,
     * whenever another session shared that directory.
     *
     * Only an ad-hoc pane gets one. A pane owned by a race entrant, a pipeline
     * step or a dispatched card describes the same money as its parent's record,
     * and both would be honestly exclusive — so summing them double counts. That
     * is a subsumption problem, not an exclusivity one, and it is fixed here at
     * the source rather than by a filter downstream that could not tell an
     * owned session from an ad-hoc one.
     *
     * A session with no open usage event (a pane restored from a previous launch,
     * which never called logUsageStart) has no start instant, so there is no
     * window to price and no record: a run with invented bounds is worse than a
     * missing one.
     */
    const recordSessionRun = (termId: string, agentId: string): void => {
        try {
            if (isOwnedPane(termId)) {
                claimedTerms.delete(termId)
                return
            }
            const st = get()
            const session = st.agentSessions().find((s) => s.termId === termId)
            const event: UsageEvent | undefined = useSettings
                .getState()
                .usageLog.filter((e) => e.id === termId && !e.endedAt)
                .pop()
            if (!event) return
            const startedAt = event.startedAt
            const endedAt = Date.now()
            const cwd = st.termCwd[termId] ?? session?.projectPath ?? ""
            const shared = attributionReason(cwd, [termId], startedAt, endedAt)
            const projectId = session?.projectId ?? event.projectId
            const project = projectById(projectId)
            const label =
                session?.sessionName || useSettings.getState().agentById(agentId)?.name || agentId
            void (async () => {
                try {
                    const bucket = cwd
                        ? await window.api.usage.window(cwd, startedAt, endedAt).catch(() => null)
                        : null
                    writeRun({
                        id: newId(),
                        kind: "session",
                        projectId,
                        projectName: session?.projectName || project?.name || REMOVED_PROJECT,
                        label,
                        startedAt,
                        endedAt,
                        agentIds: [agentId],
                        cost: bucket?.cost ?? 0,
                        tokens: bucket?.tokens ?? 0,
                        // Same rule as a pipeline: an unread price is not a receipt.
                        exclusive: !!bucket && shared === undefined,
                        reason: !bucket ? "unpriced" : shared
                    })
                } catch (err) {
                    console.error("[ledger] failed to price a session:", err)
                }
            })()
        } catch (err) {
            console.error("[ledger] failed to build a session record:", err)
        }
    }

    return {
        recordCardRun,
        recordRaceRun,
        recordPipelineRun,
        recordSessionRun,
        claimTerm: (termId: string): void => {
            claimedTerms.add(termId)
        }
    }
}
