/**
 * The diagnostics record's contract, shared by main, preload and renderer.
 *
 * The record exists because **eleven error boundaries call `console.error` and
 * nothing else**, and in a packaged app that console is unreachable: a panel
 * that throws behind a view nobody is looking at latches broken with the only
 * evidence in a devtools window nobody has open. This is the thing a stranger
 * can paste into a human's inbox.
 *
 * Two rules govern the shape, and both are load-bearing:
 *
 * - **It is allow-listed, not filtered.** Every field below is enumerated by
 *   hand in `main/diagnostics.ts`. Nothing is spread in from a struct, so a
 *   field added to `AppSettings`, to a pty entry or to `process.versions` later
 *   cannot arrive here by being added somewhere else. A filter forgets; a list
 *   has to be extended on purpose.
 * - **Nothing is transmitted.** There is no endpoint, no telemetry, no upload
 *   and no issue link anywhere in the diagnostics path. The clipboard is the
 *   entire affordance and it belongs to the renderer.
 */

import type { ProbeState } from "./probe"

/**
 * Who caught the error. Set by **main**, never by the reporter — a renderer
 * that reports an error cannot claim the error happened in main.
 */
export type DiagnosticsOrigin = "renderer" | "main"

/**
 * One distinct error, with a count rather than N copies.
 *
 * A React render loop writes ten thousand identical throws in seconds and this
 * codebase has shipped one, so the sink dedupes on `message + componentStack`
 * and keeps `count` / `firstAt` / `lastAt`. That is not hygiene: without it the
 * one useful error in the record is buried under ten thousand lines of the
 * error that is merely loudest, and the log file grows without bound while it
 * happens.
 */
export interface DiagnosticsError {
    origin: DiagnosticsOrigin
    /** The reporter's own label for where it caught this — a boundary name. */
    source: string
    message: string
    componentStack?: string
    /** How many times this exact message+stack was reported. */
    count: number
    firstAt: number
    lastAt: number
    /** True when `message` or `componentStack` was cut to its cap. */
    clipped?: boolean
}

/** One agent preset and whether its command was found on the pane's PATH. */
export interface DiagnosticsAgent {
    name: string
    command: string
    state: ProbeState
    /** Absolute path, only when `state === "found"`. */
    resolved?: string
}

/**
 * The agent-presence report, or `null` when it could not be produced.
 *
 * `null` is not "no agents configured" — that is an `ok` report with an empty
 * `list`. It means `settings.json` could not be read, so DevDeck does not know
 * what the user configured. Absent, zero and unknown are three states.
 */
export interface DiagnosticsAgents {
    /** False when the login-shell PATH could not be read; every state is then `unknown`. */
    pathHydrated: boolean
    /**
     * `runMode: "agent"` presets only. A normal-mode preset is a shell line, not
     * a binary — probing its first token would score `npm` and mark a working
     * `cd api && go run .` as absent — so it is counted below rather than being
     * given a state it cannot honestly have.
     */
    list: DiagnosticsAgent[]
    /** How many presets were skipped for being normal-mode. Absence, stated. */
    skippedNormalMode: number
}

/** A pty exit main actually observed. */
export interface DiagnosticsExit {
    code: number
    at: number
}

export interface DiagnosticsRecord {
    generatedAt: number
    app: {
        version: string
        packaged: boolean
    }
    /**
     * Enumerated, not `process.versions` spread. Node adds keys to that object
     * between releases and a spread would ship whatever the next one adds.
     */
    versions: {
        electron: string
        chrome: string
        node: string
        v8: string
        modules: string
    }
    os: {
        platform: string
        arch: string
        /** `os.release()` — the kernel build, e.g. `10.0.22621`. */
        release: string
        /** `os.version()` — the human build string, e.g. `Windows 11 Pro`. */
        version: string
    }
    shell: {
        /** `terminal.shell` from settings.json. `null` when settings could not be read. */
        configured: string | null
        /** `terminal.customShellPath`, only when `configured === "custom"`. */
        customPath?: string
        /**
         * The executable main most recently handed to node-pty — i.e. what
         * actually ran, not what a setting says should. `null` when no pane has
         * been spawned in this session, which is a fact, not a failure.
         */
        resolved: string | null
        resolvedArgs?: string[]
    }
    /** `null` when settings.json could not be read. See `DiagnosticsAgents`. */
    agents: DiagnosticsAgents | null
    /** Distinct errors, newest activity first. */
    errors: DiagnosticsError[]
    /** The last pty exit main saw, whatever its code. */
    lastPtyExit: DiagnosticsExit | null
    /**
     * The last **non-zero** pty exit. Kept separately because the interesting
     * one is routinely buried: a user closes three healthy panes after the one
     * that died, and `lastPtyExit` is then three zeroes away from the evidence.
     * On this machine the value that matters is `0xC0000409` — Avast killing
     * PowerShell — and it must survive a later clean exit.
     */
    lastFailedPtyExit: DiagnosticsExit | null
    /**
     * Everything about this record that is partial, as sentences the UI renders
     * verbatim. **The UI is required to show these** — a record that is missing
     * something and does not say so is the class of lie this whole feature
     * exists to remove. Empty array means the record is complete.
     */
    incomplete: string[]
}

/**
 * What the `diagnostics:record` channel answers.
 *
 * `ok: false` is a real answer and is **not** the same as an `ok` record with
 * an empty `errors` array. "There is nothing to report" is a healthy app;
 * "I could not read my own log" is the fourth state of the copy control, and
 * offering to copy nothing and succeeding is worse than refusing.
 */
export type DiagnosticsResult =
    | {
          ok: true
          record: DiagnosticsRecord
          /**
           * The record rendered as the plain text the clipboard receives.
           *
           * Formatted in **main**, so the string the user pastes is the string
           * that was redacted. A renderer that stringified the record itself
           * could add a field, drop the `incomplete` block, or format a value
           * that was never reviewed.
           */
          text: string
      }
    | { ok: false; reason: "unreadable" }

/**
 * What a caught error looks like on the way in. The reporter supplies these
 * three bounded strings and **nothing else** — no path, no filename, no
 * pre-formatted line, no timestamp. Everything else about the written record
 * is main's: see `main/crashSink.ts`.
 */
export interface DiagnosticsReport {
    source: string
    message: string
    componentStack?: string
}
