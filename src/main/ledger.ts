import { app } from "electron"
import { join } from "path"
import { appendFileSync, readFileSync } from "fs"
import { atomicWrite } from "./atomic"

// Durable record of what agent work cost. Unlike every other store here
// (workspace.json, settings.json, aikeys.json, remote-devices.json - all
// read-whole/mutate/write-whole via atomicWrite), this is append-only JSONL:
// the history only grows, so rewriting the whole file on every write gets
// more expensive exactly as the history becomes more valuable, and a crash
// mid-rewrite would risk the entire file instead of one line.

export type RunKind = "card" | "race" | "pipeline" | "session"

/**
 * Why a record's cost may not be summed. `exclusive: false` alone used to mean
 * four different things at once - a genuinely shared directory, a card that was
 * never priced, a price read that failed, and a run with no directory left to
 * price over - and the UI told the user the first of them in every case, which
 * is a fabricated fact in a panel whose whole purpose is honesty about
 * attribution.
 *
 * - "shared": another agent session occupied the same directory during the run's
 *   window, so this figure covers both. Real money, wrong owner.
 * - "unpriced": there is no figure DevDeck can vouch for - never priced, the
 *   price could not be read, or no directory left to price it over.
 */
export type RunExclusionReason = "shared" | "unpriced"

export interface RunRecord {
    id: string
    kind: RunKind
    projectId: string
    projectName: string
    label: string
    startedAt: number
    endedAt: number
    agentIds: string[]
    cost: number
    tokens: number
    exclusive: boolean
    /** Why `exclusive` is false. Absent on an exclusive run, and on records written before this existed. */
    reason?: RunExclusionReason
    outcome?: "landed" | "abandoned" | "done" | "failed" | "stopped"
    added?: number
    removed?: number
    winner?: string
    eliminated?: number
}

// Above this many lines, appendRun rewrites the file once, keeping the most
// recent RUN_KEEP lines. The gap between the two absorbs bursts of appends
// without paying for a rewrite on every single one.
export const RUN_CAP = 5000
export const RUN_KEEP = 4000

function storeFile(): string {
    return join(app.getPath("userData"), "runs.jsonl")
}

/** Test-only: names the store file so tests can write a torn line directly. */
export function storePath(): string {
    return storeFile()
}

/**
 * Exported so the IPC boundary can apply the same shape check on the way IN that
 * readRuns applies on the way out. Without it the handler's cast is the only
 * check, and `undefined` from a renderer bug appends the literal line "undefined".
 */
export function isValidRunRecord(value: unknown): value is RunRecord {
    if (!value || typeof value !== "object") return false
    const r = value as Record<string, unknown>
    return (
        typeof r.id === "string" &&
        typeof r.kind === "string" &&
        typeof r.projectId === "string" &&
        typeof r.projectName === "string" &&
        typeof r.label === "string" &&
        typeof r.startedAt === "number" &&
        typeof r.endedAt === "number" &&
        Array.isArray(r.agentIds) &&
        typeof r.cost === "number" &&
        typeof r.tokens === "number" &&
        typeof r.exclusive === "boolean"
    )
}

// In-memory line count so appendRun can decide whether to rotate without
// reading the file on every call - only the cap-crossing rotation itself
// reads the file (to get real line content to keep). -1 means "not yet
// known for this process"; it is reseeded with a single read the next time
// it's needed. This count is per-process only (it does not persist across
// launches), which is fine because RUN_CAP is a soft bound, not an
// invariant - a reseed after restart just re-establishes the true count.
let lineCount = -1

/** Seed lineCount from disk if it isn't already known. At most one read. */
function seedLineCountIfUnknown(): void {
    if (lineCount >= 0) return
    try {
        const raw = readFileSync(storeFile(), "utf8")
        lineCount = raw.split("\n").filter((line) => line.length > 0).length
    } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
            lineCount = 0
        } else {
            console.error("[ledger] failed to seed run count:", err)
            // Leave lineCount at -1: the rotation check is skipped for this
            // append (below), never the append itself.
        }
    }
}

/** Rewrite the store once, keeping only the last RUN_KEEP lines. */
function rotate(): void {
    try {
        const raw = readFileSync(storeFile(), "utf8")
        const lines = raw.split("\n").filter((line) => line.length > 0)
        const kept = lines.slice(lines.length - RUN_KEEP)
        atomicWrite(storeFile(), kept.join("\n") + "\n")
        lineCount = kept.length
    } catch (err) {
        console.error("[ledger] failed to rotate runs:", err)
    }
}

/** Append one run record. Never reads the file to do so - only the rare cap-crossing rotation does. */
export function appendRun(rec: RunRecord): void {
    seedLineCountIfUnknown()
    try {
        appendFileSync(storeFile(), JSON.stringify(rec) + "\n")
    } catch (err) {
        console.error("[ledger] failed to append run:", err)
        return
    }
    if (lineCount < 0) return
    lineCount++
    if (lineCount > RUN_CAP) rotate()
}

/**
 * Read stored runs, newest first. Append order is the order of record - oldest
 * first on disk, reversed on read - so records are never sorted by endedAt;
 * that would reorder anything written out of clock order.
 *
 * A line that fails to parse, or parses but is missing a required field, is
 * skipped rather than throwing: a crash mid-append leaves a torn final line,
 * and losing that one record must not lose the file.
 */
export function readRuns(limit?: number): RunRecord[] {
    let raw: string
    try {
        raw = readFileSync(storeFile(), "utf8")
    } catch {
        return []
    }
    const records: RunRecord[] = []
    for (const line of raw.split("\n")) {
        if (!line.trim()) continue
        try {
            const parsed = JSON.parse(line)
            if (isValidRunRecord(parsed)) records.push(parsed)
        } catch {
            /* torn line - skip it, not the file */
        }
    }
    records.reverse()
    return limit !== undefined ? records.slice(0, limit) : records
}

/** Wipe the run history. */
export function clearRuns(): void {
    try {
        atomicWrite(storeFile(), "")
        lineCount = 0
    } catch (err) {
        console.error("[ledger] failed to clear runs:", err)
    }
}
