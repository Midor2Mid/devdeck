/**
 * The agent-CLI presence probe's contract, shared by main, preload and renderer.
 *
 * The probe answers one question — "if I launch this preset, is there anything
 * on the PATH a pane will actually have to launch?" — and it is allowed to say
 * "I don't know". That is the whole point of the module: a configured-but-absent
 * agent CLI currently fails as nine lines of PowerShell error inside a pane,
 * attributable to nobody, and the naive fix (read `process.env.PATH` in main)
 * would have reported `missing` for agents the terminal runs perfectly. See
 * `main/shellPath.ts` for why.
 */

/**
 * Four answers, and they are four different facts. Collapsing any pair of them
 * is the "a signal that can lie is worse than no signal" failure this feature
 * exists to remove.
 *
 * - `found`   — a file was resolved on the hydrated PATH. `resolved` is set.
 * - `missing` — a **hydrated** PATH was walked and nothing matched. It does NOT
 *               mean "not installed": a PATH walk cannot see a shell alias or a
 *               shell function, so this is a reading, not a verdict, and the UI
 *               must not gate a launch on it.
 * - `unknown` — nothing was checked. The shell PATH could not be read (an
 *               antivirus killing the hydration shell is a real, expected path
 *               on the author's machine), or the command is a relative path
 *               whose base directory the probe cannot know.
 * - `blank`   — the command is empty or whitespace. This is a fact about the
 *               *preset*, not an inference about the machine, and it is the one
 *               state where refusing to launch is honest: there is nothing to
 *               run. It is decided before the PATH is consulted, so it survives
 *               a hydration failure that turns everything else into `unknown`.
 */
export type ProbeState = "found" | "missing" | "unknown" | "blank"

/**
 * One preset submitted for probing.
 *
 * `runMode` is typed as a plain string rather than the renderer's `RunMode`
 * union on purpose: main must not import from `renderer/`, and the only thing
 * the probe does with it is compare it to `"agent"`.
 */
export interface ProbeRequest {
    /** The preset's id. The report is keyed by it; it is never looked up on disk. */
    id: string
    command: string
    /**
     * `"agent"` presets are probed. Everything else is skipped and gets **no
     * entry in the report** — see `ProbeReport.results`.
     */
    runMode: string
}

export interface ProbeResult {
    /** The `id` of the request this answers. */
    id: string
    /**
     * The command exactly as it was submitted, echoed back — so a caller can
     * tell whether a cached report still describes the preset it is rendering.
     */
    command: string
    /**
     * The first token of the command — i.e. what was actually looked up. `""`
     * when `state === "blank"`. Quotes around a quoted first token are stripped,
     * and a leading `~` is expanded, so this is the string that was statted, not
     * the string that was typed.
     */
    token: string
    state: ProbeState
    /** Absolute path of the file that resolved. Set only when `state === "found"`. */
    resolved?: string
}

export interface ProbeReport {
    /**
     * Results by preset id — and **only** for `runMode: "agent"` presets.
     *
     * A normal-mode preset is absent from this map, which is a different thing
     * from `unknown`: `npm run dev` is a shell line, not a binary, and a walk
     * that reported on its first token would be scoring `npm` and marking a
     * working `cd api && go run .` as absent. "No entry" is the only answer that
     * does not lie about a shell line, so the UI must render an unmarked card
     * for a missing key rather than reaching for a default state.
     */
    results: Record<string, ProbeResult>
    /**
     * Whether a login-shell PATH was actually obtained.
     *
     * `false` means the hydration shell failed, timed out, or was killed — so
     * every bare-command result in `results` is `unknown` and the UI should say
     * "DevDeck couldn't read your shell's PATH" rather than anything about the
     * commands themselves. This is exposed separately because `unknown` has a
     * second cause (a relative path) that no section-level sentence should be
     * derived from.
     */
    pathHydrated: boolean
    /**
     * When the walk ran (epoch ms). The login-shell PATH is hydrated once per
     * process, but the walk itself re-runs on every call, so this is the time
     * the files were statted — not the time the PATH was read.
     */
    checkedAt: number
}
