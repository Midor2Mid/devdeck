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
 */
export function captureBaseline(id: string, cwd: string): void {
    if (!cwd) return
    void window.api.git
        .changes(cwd)
        .then((files) => {
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
}
