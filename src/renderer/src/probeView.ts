import type { ProbeReport, ProbeRequest, ProbeResult } from "../../shared/probe"

/**
 * How a probe report turns into what the UI shows — kept out of the components
 * so every branch can be pinned by a test without a renderer.
 *
 * The rules that are easy to get wrong, and the reason this file exists:
 *
 * - **Before the first report there is no report, and that is not a state.** A
 *   `null` report renders exactly like `found`: unmarked. Markers only ever
 *   *add* information, so their absence is the honest default — and rendering
 *   the `unknown` copy while the walk is still in flight would claim DevDeck
 *   couldn't read the PATH at a moment when it hasn't tried.
 * - **No entry is not a state either.** Normal-mode presets are never probed
 *   (`npm run dev` has no binary to look up), so `results[id] === undefined`
 *   means "not a question we asked", not `unknown`.
 * - **Section-level copy keys off `pathHydrated`,** never off "every result is
 *   `unknown`": `unknown` has a second, unrelated cause (a relative path), and
 *   an absolute-path token can answer `found` while hydration failed.
 * - **A result describes the command it was asked about.** The report echoes
 *   `command` back, so a preset edited since the walk has no fresh answer and
 *   is rendered unmarked rather than against its old command line.
 */

/** Only the preset fields any of this reads, so this module never imports the settings store. */
export interface ProbeSubject {
    id: string
    command: string
    runMode: string
}

/**
 * What a launcher card carries. `"none"` is the unmarked card — `found`, an
 * unprobed normal-mode preset, and "no report yet" all resolve to it, because
 * they are the three cases where DevDeck has nothing to add.
 */
export type CardMark = "none" | "unchecked" | "not-on-path" | "no-command"

/** Names listed in a sentence before it turns into `+n more`. */
const MAX_NAMES = 3

/** Every preset goes to the probe; main filters by `runMode` itself. */
export function probeRequests(presets: ProbeSubject[]): ProbeRequest[] {
    return presets.map((p) => ({ id: p.id, command: p.command, runMode: p.runMode }))
}

export function isBlankCommand(command: string): boolean {
    return command.trim() === ""
}

/**
 * The result that actually describes this preset right now, or `undefined`.
 * Undefined covers all four "we have nothing to say" cases: no report yet, a
 * normal-mode preset, an id the walk never saw, and a command edited since.
 */
function freshResult(preset: ProbeSubject, report: ProbeReport | null): ProbeResult | undefined {
    if (!report || preset.runMode !== "agent") return undefined
    const r = report.results[preset.id]
    if (!r || r.command !== preset.command) return undefined
    return r
}

/** First match wins, and blank is decided before the probe is consulted. */
export function cardMark(preset: ProbeSubject, report: ProbeReport | null): CardMark {
    // A fact about the preset, not an inference about the machine — so it holds
    // before the first report and survives a hydration failure.
    if (isBlankCommand(preset.command)) return "no-command"
    const r = freshResult(preset, report)
    if (!r) return "none"
    if (r.state === "unknown") return "unchecked"
    if (r.state === "missing") return "not-on-path"
    return "none"
}

/**
 * Whether the card runs anything when clicked.
 *
 * `not on PATH` still launches: a PATH walk cannot see a shell alias or a shell
 * function, so gating on it would make DevDeck refuse something that works. The
 * one refusal is a blank **agent** command, where there is genuinely nothing to
 * run. A blank *normal* preset is not a refusal — "open a plain shell" is what
 * it does — it just has no command line to print.
 */
export function canLaunch(preset: ProbeSubject, mark: CardMark): boolean {
    return mark !== "no-command" || preset.runMode !== "agent"
}

/** The right-aligned mark on a Settings → Agents row. `null` = no mark at all. */
export interface RowMark {
    text: "on PATH" | "not on PATH" | "unchecked"
    /** Dashed underline: this reading is qualified. */
    qualified: boolean
    tip: string
}

export function rowMark(preset: ProbeSubject, report: ProbeReport | null): RowMark | null {
    if (isBlankCommand(preset.command)) return null
    const r = freshResult(preset, report)
    if (!r) return null
    if (r.state === "found")
        return { text: "on PATH", qualified: false, tip: r.resolved ?? "Found on your PATH." }
    if (r.state === "missing")
        return {
            text: "not on PATH",
            qualified: true,
            tip:
                `DevDeck looked for ${r.token} on your PATH and didn't find it. A shell alias or` +
                ` function is invisible to that check — if it runs in your terminal, it will run here.`
        }
    if (r.state === "unknown")
        return {
            text: "unchecked",
            qualified: false,
            tip:
                "DevDeck couldn't read your shell's PATH. Nothing is wrong with this command —" +
                " it just wasn't verified."
        }
    return null
}

/**
 * The launcher's notice bar. Two conditions, two sentences, two actions — and
 * silence for a healthy machine, a partial result, and a machine with no agent
 * presets at all.
 */
export type LauncherNotice =
    | { kind: "missing"; tokens: string[]; more: number }
    | { kind: "unhydrated" }
    | null

export function launcherNotice(presets: ProbeSubject[], report: ProbeReport | null): LauncherNotice {
    if (!report) return null
    const answered = presets
        .map((p) => freshResult(p, report))
        .filter((r): r is ProbeResult => !!r && r.state !== "blank")
    // Nothing was asked about — a machine with no agent presets, or only blank
    // ones. The launcher head says that; a bar would be a second voice.
    if (answered.length === 0) return null
    // All-missing outranks a hydration failure on purpose: if every answer is
    // `missing` then nothing came back `unknown`, so those commands WERE
    // checked (absolute-path tokens), and "DevDeck couldn't read your shell's
    // PATH, so these are unchecked" would be the untrue half of the pair.
    if (answered.every((r) => r.state === "missing")) {
        const tokens = [...new Set(answered.map((r) => r.token))]
        return {
            kind: "missing",
            tokens: tokens.slice(0, MAX_NAMES),
            more: Math.max(0, tokens.length - MAX_NAMES)
        }
    }
    if (!report.pathHydrated) return { kind: "unhydrated" }
    return null
}

/**
 * The one-line probe report on the no-projects panel.
 *
 * `null` means "say nothing", and it is a real answer twice over: before the
 * first report arrives, and for a mix the sentence cannot describe truthfully
 * (some unchecked, some missing, none found) — where the honest move on a
 * screen with no cards to qualify is to make no claim at all.
 */
export type ProbeLine =
    | { kind: "found"; names: string[]; more: number }
    | { kind: "none-found" }
    | { kind: "unhydrated" }
    | { kind: "no-presets" }
    | null

export function probeLine(presets: ProbeSubject[], report: ProbeReport | null): ProbeLine {
    if (presets.every((p) => p.runMode !== "agent")) return { kind: "no-presets" }
    if (!report) return null
    const answered = presets
        .map((p) => freshResult(p, report))
        .filter((r): r is ProbeResult => !!r && r.state !== "blank")
    if (answered.length === 0) return { kind: "no-presets" }
    const found = [...new Set(answered.filter((r) => r.state === "found").map((r) => r.token))]
    // Mixed found + missing takes this row: with no project open there is no
    // per-agent action to take, so naming the absent ones belongs on the cards.
    if (found.length > 0)
        return {
            kind: "found",
            names: found.slice(0, MAX_NAMES),
            more: Math.max(0, found.length - MAX_NAMES)
        }
    if (answered.every((r) => r.state === "missing")) return { kind: "none-found" }
    if (!report.pathHydrated) return { kind: "unhydrated" }
    return null
}

/** Whether Settings → Agents shows its one section-level hint. */
export function pathUnreadable(report: ProbeReport | null): boolean {
    return !!report && !report.pathHydrated
}

/**
 * The project switcher's empty grid — three different facts that were all one
 * sentence ("No matching projects.") until this shipped. An empty list is not
 * zero results.
 */
export type SwitcherEmpty =
    | { kind: "no-projects" }
    | { kind: "none-to-show" }
    | { kind: "no-match"; query: string }

export function switcherEmpty(projectCount: number, query: string): SwitcherEmpty {
    if (projectCount === 0) return { kind: "no-projects" }
    // Unreachable today: with projects and no query the grid is never empty.
    // Present so the branch is not a lie if grouping ever filters the list.
    if (query === "") return { kind: "none-to-show" }
    return { kind: "no-match", query }
}
