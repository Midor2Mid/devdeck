/**
 * Per-step success gates for agent pipelines. After a step's agent settles, its
 * captured output is checked against the step's gate; the pipeline only advances
 * if the gate passes (otherwise it retries or stops). Kept pure so the matching
 * logic is unit-testable without React/IPC.
 */

export type GateMode = "none" | "contains" | "absent" | "regex"

export interface StepGate {
    /** Pass condition. "none" = no gate (always passes). */
    mode: GateMode
    /** Text or regex source to match against the (ANSI-stripped) output. */
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
 * Evaluate a gate against raw terminal output. ANSI codes are stripped first.
 * An inactive gate always passes. An invalid regex fails closed (returns false)
 * rather than throwing.
 */
export function evaluateGate(gate: StepGate | undefined | null, rawOutput: string): boolean {
    if (!gateActive(gate)) return true
    const g = gate as StepGate
    const text = stripAnsi(rawOutput)
    const pattern = g.pattern.trim()
    switch (g.mode) {
        case "contains":
            return text.includes(pattern)
        case "absent":
            return !text.includes(pattern)
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
