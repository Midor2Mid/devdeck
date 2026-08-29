/**
 * Runs a pipeline step's *ground-truth* check: a shell command whose exit code
 * decides whether the step passed.
 *
 * Why this exists: a text gate only inspects what the agent said. "All tests
 * pass now" satisfies a `contains` gate whether or not that is true. Running
 * `npm test` and reading the exit code cannot be talked into passing, so a
 * pipeline built on command gates advances on facts rather than on prose.
 *
 * The command comes from the user's own pipeline configuration, not from the
 * agent — an agent cannot inject one by writing text into its terminal. (An
 * agent that can edit `settings.json` could change one, but such an agent can
 * already run commands directly, so this adds no new reach.)
 */
import { spawn } from "child_process"
import { isWithinRoots } from "./files"

export interface CheckResult {
    /** Process exit code. -1 when the command could not be launched or timed out. */
    exitCode: number
    /** Combined stdout+stderr, tail-capped — enough to explain a failure. */
    output: string
    timedOut: boolean
    /** Set when the command could not be started at all (bad shell, ENOENT…). */
    error?: string
    ms: number
}

const MAX_OUTPUT = 8000
const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000

/**
 * Run `command` in `cwd` through the platform shell (cmd.exe on Windows,
 * /bin/sh elsewhere), so pipes and `&&` work the way the user expects when they
 * type the same line into a terminal.
 *
 * `roots` is required rather than optional, and an empty list is a refusal.
 * This function spawns a shell; the one thing a caller must never be able to
 * do is forget to say where that is allowed to happen. The IPC handler guards
 * `cwd` as well - the check here is what makes the *sanctioned* path unable to
 * run outside every open project, so a future caller that skips the handler
 * does not quietly inherit a shell anywhere on the disk.
 */
export function runCheck(
    cwd: string,
    command: string,
    roots: string[],
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<CheckResult> {
    const started = Date.now()
    const limit = Math.max(1000, Math.min(timeoutMs || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS))

    return new Promise((resolve) => {
        if (!command.trim()) {
            return resolve({ exitCode: -1, output: "", timedOut: false, error: "empty command", ms: 0 })
        }
        if (!cwd || roots.length === 0 || !isWithinRoots(cwd, roots)) {
            return resolve({
                exitCode: -1,
                output: "",
                timedOut: false,
                error: "Refused: the check's working directory is outside every open project.",
                ms: Date.now() - started
            })
        }

        let out = ""
        let done = false
        const append = (chunk: Buffer): void => {
            out += chunk.toString("utf8")
            if (out.length > MAX_OUTPUT) out = out.slice(out.length - MAX_OUTPUT)
        }
        const finish = (r: Omit<CheckResult, "ms">): void => {
            if (done) return
            done = true
            clearTimeout(timer)
            resolve({ ...r, ms: Date.now() - started })
        }

        let child: ReturnType<typeof spawn>
        try {
            child = spawn(command, { cwd, shell: true, windowsHide: true })
        } catch (e) {
            return finish({
                exitCode: -1,
                output: "",
                timedOut: false,
                error: e instanceof Error ? e.message : String(e)
            })
        }

        const timer = setTimeout(() => {
            // A hung check must not wedge the pipeline — kill the tree and report
            // it as a failure rather than waiting forever.
            try {
                child.kill("SIGKILL")
            } catch {
                /* already gone */
            }
            finish({
                exitCode: -1,
                output: out,
                timedOut: true,
                error: `timed out after ${Math.round(limit / 1000)}s`
            })
        }, limit)

        child.stdout?.on("data", append)
        child.stderr?.on("data", append)
        child.on("error", (e) =>
            finish({ exitCode: -1, output: out, timedOut: false, error: e.message })
        )
        child.on("close", (code) =>
            finish({ exitCode: code ?? -1, output: out, timedOut: false })
        )
    })
}
