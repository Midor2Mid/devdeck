/**
 * Per-step success gates for agent pipelines. After a step's agent settles, its
 * captured output is checked against the step's gate; the pipeline only advances
 * if the gate passes (otherwise it retries or stops). Kept pure so the matching
 * logic is unit-testable without React/IPC.
 */

/**
 * Text modes inspect what the agent *said*; command modes inspect what is
 * actually *true*. "I've fixed it!" passes a `contains` gate whether or not the
 * build compiles — a `command` gate running `npm test` cannot be talked into
 * passing. Prefer a command gate whenever the claim is checkable.
 */
export type GateMode = "none" | "contains" | "absent" | "regex" | "command" | "commandFails"

export interface StepGate {
    /** Pass condition. "none" = no gate (always passes). */
    mode: GateMode
    /**
     * Text/regex to match against the ANSI-stripped output, or — for the command
     * modes — the shell command to run in the project directory.
     */
    pattern: string
    /** Extra attempts if the gate fails before giving up (0 = single attempt). */
    retries: number
    /** What to do when the gate ultimately fails. */
    onFail: "stop" | "continue"
}

export const DEFAULT_GATE: StepGate = { mode: "none", pattern: "", retries: 1, onFail: "stop" }

// Canonical ansi-regex pattern (control chars written as \x escapes): matches
// CSI / OSC / single-char escape sequences. Not a full terminal emulator -
// just enough to clean output for substring/regex matching.
// eslint-disable-next-line no-control-regex
const ANSI =
    /[\x1B\x9B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\x07)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g

/** Strip ANSI escape codes, OSC titles, and carriage returns from output. */
export function stripAnsi(s: string): string {
    return s.replace(ANSI, "").replace(/\r/g, "")
}

/** True if the gate is active (would actually check something). */
export function gateActive(gate?: StepGate | null): boolean {
    return !!gate && gate.mode !== "none" && gate.pattern.trim().length > 0
}

/**
 * True if this gate is decided by running a command rather than by reading the
 * agent's output. The pipeline runner must resolve these through the main
 * process (see `commandGatePasses`) — `evaluateGate` cannot decide them.
 */
export function isCommandGate(gate?: StepGate | null): boolean {
    return !!gate && (gate.mode === "command" || gate.mode === "commandFails")
}

/**
 * Verdict for a command gate, given the process exit code.
 * `command` wants success (exit 0); `commandFails` wants a non-zero exit, which
 * is how you assert a negative — e.g. `git diff --quiet` exits non-zero exactly
 * when the tree is dirty, so it's the "the agent actually changed something" check.
 * A command that couldn't be launched at all is a failure, never a pass.
 */
export function commandGatePasses(mode: GateMode, exitCode: number): boolean {
    if (mode === "command") return exitCode === 0
    if (mode === "commandFails") return exitCode !== 0
    return false
}

/**
 * Evaluate a gate against raw terminal output. ANSI codes are stripped first.
 * An inactive gate always passes. An invalid regex fails closed (returns false)
 * rather than throwing.
 */
export function evaluateGate(gate: StepGate | undefined | null, rawOutput: string): boolean {
    if (!gateActive(gate)) return true
    const g = gate as StepGate
    // Command gates are decided by an exit code, not by this text. Fail closed if
    // one reaches here: a caller that forgot the async path must not get a silent
    // pass on a check it never actually ran.
    if (isCommandGate(g)) return false
    const text = stripAnsi(rawOutput)
    const pattern = g.pattern.trim()
    switch (g.mode) {
        case "contains":
            return text.includes(pattern)
        case "absent":
            // An assertion must not pass on an observation that was never made.
            // `!"".includes(p)` is true, so a shell that failed to spawn - or a
            // prompt that never reached one - printed "✓ gate passed" into the
            // activity feed for a check with nothing to check. This is the same
            // defect the `verify:terminal` harness was fixed for and the shipped
            // engine never was.
            return text.trim().length > 0 && !text.includes(pattern)
        case "regex":
            try {
                return new RegExp(pattern, "i").test(text)
            } catch {
                return false
            }
        default:
            return true
    }
}

/** Total attempts a step gets (initial + retries), clamped to a sane range. */
export function maxAttempts(gate?: StepGate | null): number {
    if (!gateActive(gate)) return 1
    const r = Math.max(0, Math.min(gate!.retries, 10))
    return 1 + r
}
