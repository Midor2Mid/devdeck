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

/** Extract token usage from a Claude Code transcript (.jsonl) — one rec per assistant message. */
export function parseUsageLines(content: string): UsageRec[] {
    const out: UsageRec[] = []
    for (const line of content.split("\n")) {
        if (!line.trim()) continue
        let obj: { message?: { model?: string; usage?: Record<string, number> }; timestamp?: string }
        try {
            obj = JSON.parse(line)
        } catch {
            continue
        }
        const u = obj?.message?.usage
        if (!u || typeof u.output_tokens !== "number") continue
        out.push({
            model: obj.message?.model ?? "unknown",
            input: u.input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheCreate: u.cache_creation_input_tokens ?? 0,
            ts: obj.timestamp ?? ""
        })
    }
    return out
}

interface Rate {
    input: number
    output: number
    cacheRead: number
    cacheCreate: number
}
// USD per million tokens (approximate list pricing; cache read ~0.1×, cache write ~1.25×).
const RATES: Record<string, Rate> = {
    opus: { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
    sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
    haiku: { input: 0.8, output: 4, cacheRead: 0.08, cacheCreate: 1 }
}

/** Pick the pricing family from a model id (defaults to sonnet for unknowns). */
export function priceFor(model: string): Rate {
    const m = model.toLowerCase()
    if (m.includes("opus")) return RATES.opus
    if (m.includes("haiku")) return RATES.haiku
    return RATES.sonnet
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
        const project = nameByFolder.get(folder.toLowerCase()) ?? "other"
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
