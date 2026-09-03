/**
 * Build the diagnostics record: the thing a stranger pastes into a human's
 * inbox when a panel latched broken and there is no console to look at.
 *
 * Three rules shape this file.
 *
 * **Allow-listed, not filtered.** Every field is named here by hand. Nothing is
 * spread in from `process.versions`, from the settings blob or from a pty
 * entry, so a field added to any of those later cannot reach a user's clipboard
 * by being added somewhere else. A filter forgets; a list has to be extended on
 * purpose.
 *
 * **Nothing is transmitted, ever.** There is no endpoint in this file, no
 * telemetry, no upload and no issue link. The clipboard is the entire
 * affordance and it belongs to the renderer. `§7` of the design is explicit and
 * this comment is the place a future change would have to argue with.
 *
 * **What is partial says so.** Every truncation, refusal and unreadable input
 * becomes a sentence in `incomplete`, which the UI is required to render. A
 * record that dropped something and looks whole is the failure this whole
 * feature exists to remove.
 */

import { app } from "electron"
import { arch, platform, release, version as osVersion } from "os"
import { readJson } from "./readJson"
import { settingsPath } from "./settings"
import { probe } from "./shellPath"
import { redact } from "./redact"
import { MAX_ENTRIES, readEntries, recordError, sinkStats } from "./crashSink"
import type {
    DiagnosticsAgent,
    DiagnosticsAgents,
    DiagnosticsExit,
    DiagnosticsRecord,
    DiagnosticsResult
} from "../shared/diagnostics"
import type { ProbeRequest } from "../shared/probe"

/**
 * How many presets are read out of settings.json. The probe's own cap is 64;
 * this one exists so a hand-edited settings file cannot make the record
 * unbounded, and it is reported when it bites.
 */
const MAX_AGENTS = 32

/**
 * The shortest interval between two real builds of the record.
 *
 * Building reads a file and walks the PATH, and `diagnostics:record` is
 * renderer-invocable, so a component that calls it in a render loop would have
 * main doing file I/O as fast as the renderer can ask. Inside the window the
 * previous answer is returned unchanged, which is also the honest thing: two
 * calls a quarter-second apart describe the same machine.
 */
const RECORD_TTL_MS = 500

// ---------------------------------------------------------------------------
// What main observes as it runs. All of it is main's own knowledge — none of it
// is reported by, or steerable from, the renderer.
// ---------------------------------------------------------------------------

let lastPtyExit: DiagnosticsExit | null = null
let lastFailedPtyExit: DiagnosticsExit | null = null
let resolvedShell: { file: string; args: string[] } | null = null

/**
 * Record a pty exit. **The most recent wins, unconditionally** — this is the
 * "what just happened" field and a later exit always replaces an earlier one.
 *
 * `lastFailedPtyExit` is kept separately because the interesting exit is
 * routinely buried: a user closes three healthy panes after the one that died,
 * and by then `lastPtyExit` is three zeroes away from the evidence. On this
 * machine the value worth having is `3221226505` (`0xC0000409`) — Avast killing
 * PowerShell — and it must survive the clean exits that follow it.
 */
export function notePtyExit(exitCode: number, at: number = Date.now()): void {
    if (typeof exitCode !== "number" || !Number.isFinite(exitCode)) return
    lastPtyExit = { code: exitCode, at }
    if (exitCode !== 0) lastFailedPtyExit = { code: exitCode, at }
}

/**
 * Record what main actually handed to node-pty.
 *
 * This is the *resolved* half of the shell pair, and it is deliberately an
 * observation rather than a computation: the resolution table lives in the
 * renderer's settings store, main must not import from `renderer/`, and a
 * second copy of that table in main would be a second thing to keep in step —
 * which is exactly how a record starts reporting a shell the app does not run.
 * What main spawned is not a model of the setting; it is the setting's effect.
 */
export function noteShellSpawn(file: string, args: string[]): void {
    if (typeof file !== "string" || !file) return
    resolvedShell = { file, args: Array.isArray(args) ? args.slice(0, 16).map(String) : [] }
}

/** Test-only: forget what this process observed. */
export function resetObservations(): void {
    lastPtyExit = null
    lastFailedPtyExit = null
    resolvedShell = null
    cache = null
}

// ---------------------------------------------------------------------------
// Settings — read here rather than through `loadSettings`, which collapses
// "absent" and "unreadable" into `null`. For a record, those are two answers.
// ---------------------------------------------------------------------------

interface SettingsShape {
    terminal?: { shell?: unknown; customShellPath?: unknown }
    agents?: unknown
}

interface AgentPresetShape {
    id: string
    name: string
    command: string
    runMode: string
}

/** Pull the preset list out of an untrusted blob. Nothing about its shape is assumed. */
function readPresets(raw: unknown): { list: AgentPresetShape[]; overflow: number } {
    if (!Array.isArray(raw)) return { list: [], overflow: 0 }
    const list: AgentPresetShape[] = []
    for (const item of raw.slice(0, MAX_AGENTS)) {
        const o = (item ?? {}) as Record<string, unknown>
        list.push({
            id: typeof o.id === "string" ? o.id.slice(0, 200) : "",
            name: typeof o.name === "string" ? o.name.slice(0, 120) : "",
            command: typeof o.command === "string" ? o.command.slice(0, 2048) : "",
            runMode: typeof o.runMode === "string" ? o.runMode : ""
        })
    }
    return { list, overflow: Math.max(0, raw.length - MAX_AGENTS) }
}

/**
 * The agent-presence half of the record: every `runMode: "agent"` preset and
 * whether its command resolved on the PATH a pane will actually have.
 *
 * Normal-mode presets are **counted, not listed**. `npm run dev` is a shell
 * line, not a binary; probing its first token would score `npm` and mark a
 * working `cd api && go run .` as absent. Reporting how many were skipped says
 * the list is partial without inventing a state for them.
 */
async function agentReport(
    presets: AgentPresetShape[]
): Promise<{ agents: DiagnosticsAgents; note?: string }> {
    const requests: ProbeRequest[] = presets.map((p) => ({
        id: p.id || p.name,
        command: p.command,
        runMode: p.runMode
    }))
    const skippedNormalMode = presets.filter((p) => p.runMode !== "agent").length
    const report = await probe(requests)
    const list: DiagnosticsAgent[] = []
    for (const p of presets) {
        const res = report.results[p.id || p.name]
        if (!res) continue // normal-mode: no entry, by design. See ProbeReport.
        list.push({
            name: redact(p.name),
            command: redact(p.command),
            state: res.state,
            resolved: res.resolved ? redact(res.resolved) : undefined
        })
    }
    return {
        agents: { pathHydrated: report.pathHydrated, list, skippedNormalMode },
        note: report.pathHydrated
            ? undefined
            : "DevDeck could not read the login shell's PATH, so every agent command is unchecked rather than absent."
    }
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

let cache: { at: number; result: DiagnosticsResult } | null = null

/**
 * Build the record, or refuse.
 *
 * Refusal has exactly one cause: the crash log exists and could not be read.
 * That is §5.3's fourth state and it is **not** the same as an empty `errors`
 * array — "nothing has gone wrong" is a healthy app, "I could not read my own
 * log" is a control that must not offer to copy. Everything else that goes
 * wrong degrades into a sentence in `incomplete` and a still-usable record.
 */
export async function buildRecord(now: number = Date.now()): Promise<DiagnosticsResult> {
    if (cache && now - cache.at < RECORD_TTL_MS) return cache.result
    const result = await build(now)
    cache = { at: now, result }
    return result
}

async function build(now: number): Promise<DiagnosticsResult> {
    const incomplete: string[] = []

    const errors = readEntries()
    if (!errors.ok) {
        // Deliberately not a partial record. The log is the reason this control
        // exists; a record that silently omits it while claiming to be the app's
        // diagnostics is the false-claim UI this codebase has been burned by.
        return { ok: false, reason: "unreadable" }
    }
    if (errors.dropped > 0) {
        incomplete.push(
            `${errors.dropped} older error${errors.dropped === 1 ? "" : "s"} were dropped: the log keeps the ${MAX_ENTRIES} most recent distinct errors.`
        )
    }
    if (errors.skipped > 0) {
        incomplete.push(
            `${errors.skipped} log line${errors.skipped === 1 ? "" : "s"} could not be parsed and were skipped.`
        )
    }
    if (errors.entries.some((e) => e.clipped)) {
        incomplete.push("At least one error message or component stack was longer than the cap and was cut.")
    }
    const stats = sinkStats()
    if (stats.rateLimited > 0) {
        incomplete.push(
            `${stats.rateLimited} error report${stats.rateLimited === 1 ? " was" : "s were"} refused by the rate limit in this session and are not in this record.`
        )
    }
    if (stats.malformed > 0) {
        incomplete.push(`${stats.malformed} error report${stats.malformed === 1 ? "" : "s"} arrived with no message and were discarded.`)
    }

    // Settings: three answers, not two.
    const loaded = readJson<SettingsShape>(settingsPath())
    let configured: string | null = null
    let customPath: string | undefined
    let agents: DiagnosticsAgents | null = null
    if (loaded.ok) {
        const terminal = loaded.data?.terminal
        configured = typeof terminal?.shell === "string" ? redact(terminal.shell.slice(0, 64)) : null
        if (configured === "custom" && typeof terminal?.customShellPath === "string") {
            customPath = redact(terminal.customShellPath.slice(0, 512))
        }
        if (configured === null) {
            incomplete.push("settings.json holds no terminal shell setting, so the configured shell is unknown.")
        }
        const { list, overflow } = readPresets(loaded.data?.agents)
        if (overflow > 0) incomplete.push(`${overflow} agent presets beyond the first ${MAX_AGENTS} were not checked.`)
        const report = await agentReport(list)
        agents = report.agents
        if (report.note) incomplete.push(report.note)
    } else if (loaded.reason === "missing") {
        incomplete.push(
            "settings.json has not been written yet, so the configured shell and the agent commands are unknown."
        )
    } else {
        // The workspace-destroying distinction, one level down: an unreadable
        // settings file is not an empty one, and the record must not report
        // "no agents configured" about a file it failed to open.
        incomplete.push(
            "settings.json exists but could not be read, so the configured shell and the agent commands are unknown."
        )
    }

    const record: DiagnosticsRecord = {
        generatedAt: now,
        app: {
            version: app.getVersion(),
            packaged: app.isPackaged
        },
        // Named one by one. `process.versions` gains keys between Node releases
        // and a spread would ship whichever the next one adds.
        versions: {
            electron: process.versions.electron ?? "",
            chrome: process.versions.chrome ?? "",
            node: process.versions.node ?? "",
            v8: process.versions.v8 ?? "",
            modules: process.versions.modules ?? ""
        },
        os: {
            platform: platform(),
            arch: arch(),
            release: release(),
            version: osVersion()
        },
        shell: {
            configured,
            customPath,
            resolved: resolvedShell ? redact(resolvedShell.file) : null,
            resolvedArgs: resolvedShell ? resolvedShell.args.map(redact) : undefined
        },
        agents,
        errors: errors.entries,
        lastPtyExit,
        lastFailedPtyExit,
        incomplete
    }

    return { ok: true, record, text: renderRecord(record) }
}

/**
 * The `diagnostics:report` IPC entry point, payload and all.
 *
 * The unwrapping lives here rather than in the handler's parameter list because
 * `(_e, { source, message }) => ...` answers a payload that is not an object
 * with a **TypeError**, and a guard that throws has not refused — it has failed
 * to decide, upstream of the coercion written to decide. This repo has shipped
 * that exact shape twice: a path guard answering with a `TypeError` out of
 * `path.resolve`, and the reason `probeIpc` is written the same way.
 *
 * **Note what is NOT a parameter.** No path, no filename, no timestamp, no
 * origin, no format. The renderer contributes three bounded strings; everything
 * that decides where the bytes go and what they look like belongs to main. That
 * is what keeps the crash lane from being a general-purpose file-write
 * primitive on the bridge.
 */
export function reportIpc(payload: unknown, now?: number): boolean {
    const o = (payload ?? {}) as Record<string, unknown>
    return recordError(
        // Not taken from the payload. A compromised renderer can invoke this
        // channel directly and must not be able to claim its error happened in
        // main — an origin a caller can set is an origin that tells you nothing.
        "renderer",
        {
            source: typeof o.source === "string" ? o.source : "",
            message: typeof o.message === "string" ? o.message : "",
            componentStack: typeof o.componentStack === "string" ? o.componentStack : undefined
        },
        now
    )
}

// ---------------------------------------------------------------------------
// The clipboard text
// ---------------------------------------------------------------------------

const PAD = 16

function row(label: string, value: string): string {
    return `  ${label.padEnd(PAD)}${value}`
}

function stamp(ms: number): string {
    return new Date(ms).toISOString()
}

/**
 * Render the record as the plain text the clipboard receives.
 *
 * Formatted **in main**, so the string the user pastes is the string that was
 * redacted and allow-listed. A renderer that stringified the record itself
 * could add a field, drop the `Incomplete` block, or format a value nobody
 * reviewed — and the whole point of this control is that its contents are
 * knowable in advance.
 */
export function renderRecord(r: DiagnosticsRecord): string {
    const out: string[] = []
    out.push("DevDeck diagnostics")
    out.push(`Generated ${stamp(r.generatedAt)}`)
    out.push("")

    out.push("App")
    out.push(row("version", r.app.version))
    out.push(row("packaged", r.app.packaged ? "yes" : "no (dev build)"))
    out.push(row("electron", r.versions.electron))
    out.push(row("chrome", r.versions.chrome))
    out.push(row("node", r.versions.node))
    out.push(row("v8", r.versions.v8))
    out.push(row("modules", r.versions.modules))
    out.push("")

    out.push("OS")
    out.push(row("platform", `${r.os.platform} ${r.os.arch}`))
    out.push(row("release", r.os.release))
    out.push(row("version", r.os.version))
    out.push("")

    out.push("Shell")
    out.push(row("configured", r.shell.configured ?? "unknown"))
    if (r.shell.customPath) out.push(row("custom path", r.shell.customPath))
    out.push(
        row(
            "resolved",
            r.shell.resolved
                ? [r.shell.resolved, ...(r.shell.resolvedArgs ?? [])].join(" ")
                : "no terminal has been spawned in this session"
        )
    )
    out.push("")

    out.push("Agent commands")
    if (!r.agents) {
        out.push("  unknown — settings could not be read")
    } else {
        out.push(row("PATH read", r.agents.pathHydrated ? "yes" : "no — every state below is unchecked"))
        if (r.agents.list.length === 0) out.push("  none configured")
        for (const a of r.agents.list) {
            const state =
                a.state === "found"
                    ? `found  ${a.resolved ?? ""}`.trimEnd()
                    : a.state === "missing"
                      ? "not on PATH"
                      : a.state === "blank"
                        ? "no command set"
                        : "unchecked"
            out.push(`  ${a.name} — ${a.command || "(blank)"} — ${state}`)
        }
        if (r.agents.skippedNormalMode > 0) {
            out.push(
                `  (${r.agents.skippedNormalMode} normal-mode preset${r.agents.skippedNormalMode === 1 ? " is" : "s are"} not probed: a shell line has no binary to look up)`
            )
        }
    }
    out.push("")

    out.push("Terminal exits")
    out.push(row("last", r.lastPtyExit ? `${r.lastPtyExit.code} at ${stamp(r.lastPtyExit.at)}` : "none"))
    out.push(
        row(
            "last non-zero",
            r.lastFailedPtyExit ? `${r.lastFailedPtyExit.code} at ${stamp(r.lastFailedPtyExit.at)}` : "none"
        )
    )
    out.push("")

    out.push(`Errors (${r.errors.length} distinct)`)
    if (r.errors.length === 0) out.push("  none recorded")
    for (const e of r.errors) {
        out.push(
            `  [${e.origin}/${e.source}] x${e.count}  first ${stamp(e.firstAt)}  last ${stamp(e.lastAt)}`
        )
        out.push(`    ${e.message}`)
        if (e.componentStack) {
            for (const line of e.componentStack.split("\n")) out.push(`      ${line.trim()}`)
        }
    }
    out.push("")

    // Always emitted, including when it is empty. "Nothing was left out" is a
    // claim worth making explicitly, and a reader who never sees this heading
    // cannot know whether its absence means complete or means unimplemented.
    out.push("Incomplete")
    if (r.incomplete.length === 0) out.push("  nothing was left out of this record")
    for (const line of r.incomplete) out.push(`  - ${line}`)
    out.push("")
    out.push("Nothing here was sent anywhere. This text went to your clipboard and nowhere else.")

    return out.join("\n")
}
