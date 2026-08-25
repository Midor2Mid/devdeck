import { readdirSync, readFileSync, statSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { listProjects } from "./projects"
import type { UsageSummary, UsageBucket } from "../preload/index"

export interface UsageRec {
    model: string
    input: number
    output: number
    cacheRead: number
    cacheCreate: number
    ts: string
}

/** One transcript row, as far as this parser cares about it. */
interface TranscriptRow {
    timestamp?: string
    requestId?: string
    /** Stable row id; survives the history copy a fork makes. */
    uuid?: string
    message?: { id?: string; model?: string; usage?: Record<string, number> }
}

/**
 * The strongest stable identity a row carries, or null if it carries none.
 *
 * A fork rewrites `sessionId` but keeps the message and request ids, so those
 * are preferred over anything session-scoped. `uuid` is the last resort for
 * older rows written before `requestId` was present.
 */
function dedupeKey(row: TranscriptRow): string | null {
    const messageId = row.message?.id?.trim()
    const requestId = row.requestId?.trim()
    if (messageId && requestId) return `${messageId}:${requestId}`
    if (messageId) return `msg:${messageId}`
    const uuid = row.uuid?.trim()
    if (uuid) return `uuid:${uuid}`
    return null
}

/**
 * Extract token usage from a Claude Code transcript (.jsonl) — one rec per
 * assistant **message**, which is not the same as one per line.
 *
 * Claude Code writes a line per content block of a streamed assistant message,
 * and every one of those lines repeats the *same cumulative* `usage` object.
 * Counting lines therefore counted most messages twice: measured over a real
 * 7-day window on this machine, 18,248 usage-bearing lines carried only 9,215
 * distinct messages, inflating both the token total and the cost by 1.9x. That
 * figure reached `runs.jsonl` and the cost chips on task cards, so this was
 * never only a dashboard problem.
 *
 * Rows are folded on `dedupeKey`, and a fold takes the **max** of each token
 * class rather than the first value seen — a later row of the same message can
 * carry a more complete count than an earlier one, and the earlier one is not
 * wrong so much as unfinished.
 *
 * Folding is per file, because that is where the duplication happens. A global
 * fold would additionally risk merging two genuine sessions that share a
 * message id through a fork; measured here, per-file and global folds agree to
 * the token, so the wider one buys nothing and only costs safety.
 */
export function parseUsageLines(content: string): UsageRec[] {
    const out: UsageRec[] = []
    const indexByKey = new Map<string, number>()
    for (const line of content.split("\n")) {
        if (!line.trim()) continue
        let obj: TranscriptRow
        try {
            obj = JSON.parse(line)
        } catch {
            continue
        }
        const u = obj?.message?.usage
        if (!u || typeof u.output_tokens !== "number") continue
        const rec: UsageRec = {
            model: obj.message?.model ?? "unknown",
            input: u.input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheCreate: u.cache_creation_input_tokens ?? 0,
            ts: obj.timestamp ?? ""
        }
        const key = dedupeKey(obj)
        const seen = key === null ? undefined : indexByKey.get(key)
        if (seen === undefined) {
            out.push(rec)
            if (key !== null) indexByKey.set(key, out.length - 1)
            continue
        }
        const prev = out[seen]
        prev.input = Math.max(prev.input, rec.input)
        prev.output = Math.max(prev.output, rec.output)
        prev.cacheRead = Math.max(prev.cacheRead, rec.cacheRead)
        prev.cacheCreate = Math.max(prev.cacheCreate, rec.cacheCreate)
    }
    return out
}

interface Rate {
    input: number
    output: number
    cacheRead: number
    cacheCreate: number
}

/** USD per million tokens: list pricing, cache read at 0.1x input, cache write at 1.25x. */
function rate(input: number, output: number): Rate {
    return { input, output, cacheRead: input * 0.1, cacheCreate: input * 1.25 }
}

/**
 * List pricing per model id, not per family.
 *
 * Pricing is not a property of the word "opus" — Opus 4 and 4.1 billed at
 * $15/$75, and every Opus from 4.5 on bills at $5/$25. A family-wide table
 * priced this machine's week at $14,672 when the correct list figure was
 * $2,484: three times over on rates, on top of the 1.9x from counting stream
 * rows twice (see `parseUsageLines`). Keyed by id, an old model keeps its old
 * price and a new one cannot silently inherit it.
 */
const MODEL_RATES: Record<string, Rate> = {
    "fable-5": rate(10, 50),
    "opus-5": rate(5, 25),
    "opus-4-8": rate(5, 25),
    "opus-4-7": rate(5, 25),
    "opus-4-6": rate(5, 25),
    "opus-4-5": rate(5, 25),
    // Opus 4 and 4.1 are the expensive generation, and stay that way.
    "opus-4-1": rate(15, 75),
    "opus-4": rate(15, 75),
    // Sonnet 5's $2/$10 is an introductory rate that ends 2026-08-31. This table
    // has no date dimension, so it carries the standard rate: wrong for a few
    // more days, then right indefinitely, which is the better way round.
    "sonnet-5": rate(3, 15),
    "sonnet-4-6": rate(3, 15),
    "sonnet-4-5": rate(3, 15),
    "sonnet-4": rate(3, 15),
    "sonnet-3-7": rate(3, 15),
    "sonnet-3-5": rate(3, 15),
    "haiku-4-5": rate(1, 5),
    "haiku-3-5": rate(0.8, 4),
    "haiku-3": rate(0.25, 1.25)
}

/** Does `model` name this family at this version — and not a longer version? */
function isVersion(model: string, family: string, version: string): boolean {
    return new RegExp(`${family}-${version}(?:$|[^0-9])`).test(model)
}

/**
 * Resolve a model id to a pricing key.
 *
 * Order matters: the longest version is tested first, so `opus-4-8` is never
 * matched by the bare `opus-4` rule. An unrecognised member of a known family
 * resolves to that family's **current** generation rather than its oldest —
 * guessing cheap for an unknown future model understates a little, where
 * guessing expensive overstated by 3x and did so silently for weeks.
 */
function pricingKey(model: string): string {
    const m = model.toLowerCase().trim().replace(/^anthropic[/:]/, "").replace(/\./g, "-")
    if (isVersion(m, "fable", "5")) return "fable-5"
    for (const v of ["5", "4-8", "4-7", "4-6", "4-5", "4-1"]) {
        if (isVersion(m, "opus", v)) return `opus-${v}`
    }
    // Bare `opus-4`, or `opus-4-20250514`: the legacy generation.
    if (/opus-4(?:$|-thinking$|-20\d{6}|@20\d{6})/.test(m)) return "opus-4"
    if (m.includes("opus")) return "opus-5"
    for (const v of ["5", "4-6", "4-5", "3-7", "3-5"]) {
        if (isVersion(m, "sonnet", v)) return `sonnet-${v}`
    }
    if (m.includes("sonnet")) return "sonnet-5"
    if (isVersion(m, "haiku", "4-5")) return "haiku-4-5"
    if (isVersion(m, "haiku", "3-5")) return "haiku-3-5"
    if (isVersion(m, "haiku", "3")) return "haiku-3"
    if (m.includes("haiku")) return "haiku-4-5"
    // Nothing recognisable. Sonnet is the middle of the range, so a wrong guess
    // here is wrong by the least in either direction.
    return "sonnet-5"
}

/** Pick the rate for a model id. */
export function priceFor(model: string): Rate {
    return MODEL_RATES[pricingKey(model)]
}

/** Estimated USD cost of one usage record. */
export function costOf(r: UsageRec): number {
    const p = priceFor(r.model)
    return (
        (r.input * p.input +
            r.output * p.output +
            r.cacheRead * p.cacheRead +
            r.cacheCreate * p.cacheCreate) /
        1_000_000
    )
}

// Claude Code encodes a project path into a folder name by replacing \ / : and spaces with "-".
function encodePath(p: string): string {
    return p.replace(/[\\/: ]/g, "-").toLowerCase()
}

function mkBucket(label: string): UsageBucket {
    return { label, input: 0, output: 0, cacheRead: 0, cacheCreate: 0, tokens: 0, cost: 0 }
}
function addTo(b: UsageBucket, r: UsageRec): void {
    b.input += r.input
    b.output += r.output
    b.cacheRead += r.cacheRead
    b.cacheCreate += r.cacheCreate
    b.tokens += r.input + r.output + r.cacheRead + r.cacheCreate
    b.cost += costOf(r)
}
function getOr(map: Map<string, UsageBucket>, key: string): UsageBucket {
    let b = map.get(key)
    if (!b) {
        b = mkBucket(key)
        map.set(key, b)
    }
    return b
}

/** Aggregate tagged records into a summary (total + by model / project / day). */
export function summarize(tagged: { rec: UsageRec; project: string }[], sinceDays: number): UsageSummary {
    const total = mkBucket("total")
    const byModel = new Map<string, UsageBucket>()
    const byProject = new Map<string, UsageBucket>()
    const byDay = new Map<string, UsageBucket>()
    for (const { rec, project } of tagged) {
        addTo(total, rec)
        addTo(getOr(byModel, rec.model), rec)
        addTo(getOr(byProject, project), rec)
        addTo(getOr(byDay, rec.ts.slice(0, 10) || "?"), rec)
    }
    const byCost = (a: UsageBucket, b: UsageBucket): number => b.cost - a.cost
    return {
        sinceDays,
        total,
        byModel: [...byModel.values()].sort(byCost),
        byProject: [...byProject.values()].sort(byCost),
        byDay: [...byDay.values()].sort((a, b) => a.label.localeCompare(b.label))
    }
}

/**
 * What one project's agent work cost inside a time window.
 *
 * The dashboard slices spend by model / project / day, which answers "how much am
 * I spending" but never "what did *this* cost". Given a project path and the
 * window a unit of work occupied — a dispatched card, a pipeline run — this reads
 * that project's transcripts and totals only the records inside it.
 *
 * Necessarily an attribution, not a receipt: everything the agent did in this
 * project during the window counts, so a second session running alongside is
 * included. That's the honest reading of "what did this piece of work cost" on a
 * shared working tree, and the alternative (per-session transcript mapping) isn't
 * available — Claude Code names transcripts by project, not by pty.
 */
export function costInWindow(projectPath: string, fromMs: number, toMs: number): UsageBucket {
    const bucket = mkBucket("window")
    if (!projectPath || !Number.isFinite(fromMs)) return bucket
    const until = Number.isFinite(toMs) ? toMs : Date.now()
    if (until < fromMs) return bucket

    const dir = join(homedir(), ".claude", "projects", encodePath(projectPath))
    let files: string[]
    try {
        files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
    } catch {
        return bucket // no transcripts for this project yet
    }
    for (const file of files) {
        const fp = join(dir, file)
        try {
            // A transcript last written before the window opened cannot hold a
            // record inside it — skip the read entirely.
            if (statSync(fp).mtimeMs < fromMs) continue
            for (const rec of parseUsageLines(readFileSync(fp, "utf8"))) {
                if (!rec.ts) continue
                const t = Date.parse(rec.ts)
                if (Number.isNaN(t) || t < fromMs || t > until) continue
                addTo(bucket, rec)
            }
        } catch {
            continue
        }
    }
    return bucket
}

/** Read Claude Code's local transcripts and roll up token usage + estimated cost. */
export function tokenUsage(sinceDays = 7): UsageSummary {
    const root = join(homedir(), ".claude", "projects")
    const cutoff = Date.now() - sinceDays * 86_400_000
    const nameByFolder = new Map<string, string>()
    for (const pr of listProjects().projects) nameByFolder.set(encodePath(pr.path), pr.name)

    const tagged: { rec: UsageRec; project: string }[] = []
    let folders: string[]
    try {
        folders = readdirSync(root)
    } catch {
        return summarize([], sinceDays)
    }
    for (const folder of folders) {
        const dir = join(root, folder)
        let files: string[]
        try {
            if (!statSync(dir).isDirectory()) continue
            files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"))
        } catch {
            continue
        }
        // Claude Code transcripts cover the whole machine, so plenty of usage
        // belongs to folders that aren't DevDeck projects. "other" left users
        // staring at an unexplained bucket holding the entire headline figure.
        const project = nameByFolder.get(folder.toLowerCase()) ?? "outside DevDeck projects"
        for (const file of files) {
            const fp = join(dir, file)
            try {
                if (statSync(fp).mtimeMs < cutoff) continue
                for (const rec of parseUsageLines(readFileSync(fp, "utf8"))) {
                    if (rec.ts && Date.parse(rec.ts) < cutoff) continue
                    tagged.push({ rec, project })
                }
            } catch {
                continue
            }
        }
    }
    return summarize(tagged, sinceDays)
}
