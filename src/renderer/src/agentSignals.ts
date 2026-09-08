/**
 * Per-session evidence that an agent actually produced something.
 *
 * `git status` on its own is not that evidence: it has no baseline, so in a
 * project that was already dirty every agent reads as productive forever. We
 * therefore snapshot the changed-path set when a session starts and compare
 * against it later.
 *
 * Baselines live in a module Map rather than the store, like missionTail's
 * tails: the pty stream must never churn React state.
 */

const baselines = new Map<string, ReadonlySet<string>>()

/**
 * The capture each session is waiting on RIGHT NOW, if any.
 *
 * Two jobs. A capture is asynchronous, so by the time it resolves it may have
 * been superseded by a newer capture (a rebase) or orphaned entirely (the pane
 * closed): the ticket is checked on arrival, which is what stops a late reply
 * writing a baseline for a session nobody is watching - without it `baselines`
 * only ever grows over a long uptime.
 *
 * And because an entry is REMOVED on arrival, presence answers "is a capture
 * outstanding?" - which `adoptBaseline` needs, since an outstanding capture was
 * issued later than the read a self-heal is holding and is therefore the truer
 * answer. Every path that issues nothing (no cwd, a synchronous throw) has to
 * clear its ticket too, or the self-heal defers forever to a read nobody made.
 */
const captures = new Map<string, number>()

/**
 * Sessions whose most recent check for file changes FAILED (git unreachable, an
 * index.lock held by another agent, the 8s timeout). Kept so the board can say
 * "couldn't check" instead of leaving a card in Doing with no explanation - the
 * failure used to be swallowed entirely, which made a stuck card and a quiet
 * agent look identical.
 *
 * Set on a failed read, cleared on the next successful one, so it always
 * describes the latest attempt rather than accumulating history.
 */
const checkFailed = new Set<string>()

/** Record that a check for this session's file changes failed. */
export function markCheckFailed(id: string): void {
    checkFailed.add(id)
}

/** Record that a check succeeded, clearing any earlier failure. */
export function clearCheckFailed(id: string): void {
    checkFailed.delete(id)
}

/** Did this session's most recent change-check fail? */
export function checkFailedFor(id: string): boolean {
    return checkFailed.has(id)
}
let ticket = 0

/**
 * Paths dirty now that were not dirty when the session started.
 *
 * An UNKNOWN baseline returns [] — no evidence — never the whole list. Failing
 * closed matters here: the alternative marks every agent in a dirty repo as
 * having done work, which is the exact noise this module exists to prevent.
 */
export function newPathsSince(
    baseline: ReadonlySet<string> | undefined,
    current: readonly string[]
): string[] {
    if (!baseline) return []
    return current.filter((p) => !baseline.has(p))
}

/**
 * Snapshot the dirty set for a session's directory. Fire-and-forget: a failure
 * leaves the baseline unknown, which newPathsSince reads as "no evidence".
 * Never throws and never blocks the launch path it is called from.
 *
 * The previous baseline is dropped FIRST, before anything can fail. A capture
 * is also a rebase — the card was dragged back to `doing` and the work that
 * earned it review must stop counting — and on that path there IS an older
 * baseline to leave behind. Leaving it fails OPEN: the same files stay "fresh",
 * so the next quiet spell files the card as finished again having produced
 * nothing. Unknown covers the failure, the missing-cwd case, and the in-flight
 * window in between, and unknown means "no evidence" everywhere it is read.
 */
export function captureBaseline(id: string, cwd: string): void {
    baselines.delete(id)
    if (!cwd) {
        // Nothing is in flight: there is no directory to read. Clearing rather
        // than claiming a ticket matters - a ticket left here would hold off
        // every later self-heal on a capture that was never issued.
        captures.delete(id)
        return
    }
    const mine = ++ticket
    captures.set(id, mine)
    /** Arrived: no longer outstanding, unless a newer capture has taken over. */
    const settle = (): boolean => {
        if (captures.get(id) !== mine) return false
        captures.delete(id)
        return true
    }
    try {
        void window.api.git
            .changes(cwd)
            .then((files) => {
                // Superseded by a later capture, or the session is gone: either
                // way this answer describes a moment nobody is comparing against.
                if (!settle()) return
                baselines.set(id, new Set(files.map((f) => f.path)))
            })
            .catch(() => {
                // Unknown baseline. Deliberately not an empty set, which would
                // read as "the repo was clean" and make pre-existing dirt look
                // new. Settled all the same: a rejection IS an arrival, and a
                // failed capture must not hold off the self-heal that recovers
                // from it.
                settle()
            })
    } catch {
        // A synchronous throw (a torn-down preload bridge) means there is no
        // promise, so nothing will ever arrive. Clear the ticket, and never let
        // this reach the launch or rebase path that called us.
        settle()
    }
}

/**
 * Capture a baseline for a session that has none — the LAUNCH path's capture.
 *
 * `captureBaseline` overwrites on purpose: a dispatch, or a card dragged back
 * into `doing`, is a deliberate statement that the work that came before stops
 * counting. A launch is not that statement. Resume and restart reuse the same
 * termId, so a launch that overwrote would re-inherit the files this very
 * session created and turn a real conflict silent — the false-negative
 * direction, on a path that only runs after a crash.
 *
 * An outstanding capture counts as "has one": it was issued for this session
 * and is about to arrive, so a second read would only race it. Failure is still
 * failure — an unknown baseline stays unknown, which every reader takes as "no
 * evidence" rather than "nothing changed".
 */
export function ensureBaseline(id: string, cwd: string): void {
    if (baselines.has(id) || captures.has(id)) return
    captureBaseline(id, cwd)
}

/**
 * Adopt a dirty set the caller already has as this session's baseline.
 *
 * The self-heal for an unknown baseline: rather than leaving a card stranded in
 * `doing` for the rest of the session because one `git status` failed at the one
 * moment it mattered, the next evidence read re-establishes the baseline from
 * the paths it just fetched and lets the pause after that decide. Callers must
 * only adopt for a session they have just confirmed is still live.
 *
 * Stands down while a capture is outstanding. That capture was issued LATER
 * than the read these paths came from - a rebase, most likely, which is a
 * deliberate statement about what should stop counting - so overriding it with
 * an older snapshot reinstates exactly the snap-back C1 fixed. Deferring costs
 * one pause and fails closed: the baseline stays unknown, so nothing moves.
 */
export function adoptBaseline(id: string, paths: readonly string[]): void {
    if (captures.has(id)) return
    baselines.set(id, new Set(paths))
}

export function baselineOf(id: string): ReadonlySet<string> | undefined {
    return baselines.get(id)
}

export function forgetSignals(id: string): void {
    baselines.delete(id)
    captures.delete(id)
    checkFailed.delete(id)
}

/**
 * How many paths each session has made dirty since it started, from a batch of
 * change reads the caller already has.
 *
 * Exists so Mission's tiles can show a changed count WITHOUT a second git poll:
 * the ownership map already reads every agent session's directory every 8s, and
 * this turns that same answer into per-session evidence. A session with an
 * unknown baseline counts 0 — newPathsSince fails closed, and so does this.
 */
export function newCounts(
    entries: readonly { termId: string; files: readonly string[] }[]
): Record<string, number> {
    const out: Record<string, number> = {}
    for (const e of entries) out[e.termId] = newPathsSince(baselineOf(e.termId), e.files).length
    return out
}

/**
 * The next `changedBySession` map after one poll.
 *
 * `entries` carry `files: string[] | null` — null means this session's
 * `git.changes` read rejected this tick (a repo mid-rebase, an `index.lock`
 * another agent holds, the timeout). That failure is now carried **in the
 * value**, as a null count, rather than by leaving the session out of the merge
 * so its previous number survived. The carry-forward was a side channel built
 * because `changedCount: number` could not say "unknown"; it kept a count that
 * was true eight seconds ago and presented it as current, and every consumer
 * below still read a plain number and believed it. One nullable value replaces
 * both halves.
 */
export function nextChangedCounts(
    prev: Readonly<Record<string, number | null>>,
    entries: readonly { termId: string; files: readonly string[] | null }[]
): Record<string, number | null> {
    const out: Record<string, number | null> = { ...prev }
    for (const e of entries) {
        out[e.termId] =
            e.files === null ? null : newPathsSince(baselineOf(e.termId), e.files).length
    }
    return out
}
