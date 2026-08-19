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
 * The capture each session is currently waiting on.
 *
 * A capture is asynchronous, so by the time it resolves it may have been
 * superseded by a newer capture (a rebase) or orphaned entirely (the pane
 * closed). Stamping each capture with a ticket and checking it on arrival is
 * what stops a late reply writing a baseline for a session nobody is watching -
 * without it `baselines` only ever grows over a long uptime.
 */
const captures = new Map<string, number>()
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
    const mine = ++ticket
    captures.set(id, mine)
    if (!cwd) return
    void window.api.git
        .changes(cwd)
        .then((files) => {
            // Superseded by a later capture, or the session is gone: either way
            // this answer describes a moment nobody is comparing against.
            if (captures.get(id) !== mine) return
            baselines.set(id, new Set(files.map((f) => f.path)))
        })
        .catch(() => {
            // Unknown baseline. Deliberately not an empty set, which would read
            // as "the repo was clean" and make pre-existing dirt look new.
        })
}

export function baselineOf(id: string): ReadonlySet<string> | undefined {
    return baselines.get(id)
}

export function forgetSignals(id: string): void {
    baselines.delete(id)
    captures.delete(id)
}
