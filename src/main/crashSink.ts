/**
 * The crash sink: a capped, deduped JSONL log of caught errors, in the user
 * data directory beside the thirteen other stores DevDeck already writes there.
 *
 * **Why it exists.** Eleven error boundaries call `console.error` and nothing
 * else, and `app.getPath("logs")` is never called anywhere in `src/main`. In a
 * packaged app that console is unreachable: a panel that throws behind a view
 * nobody is looking at latches broken, with the only evidence in a devtools
 * window nobody has open. Five to ten strangers are about to run this.
 *
 * **Cap and dedupe are load-bearing, not hygiene.** A React render loop writes
 * ten thousand identical throws in seconds and this codebase has shipped one.
 * Without the dedupe that is ten thousand lines on the user's disk and the one
 * useful error buried under the one that is merely loudest; without the cap the
 * file grows for as long as the loop spins. So: one entry per distinct error,
 * carrying a count and first/last timestamps, and a hard ceiling on how many
 * distinct entries survive.
 *
 * **Append, not `atomicWrite` — with one exception.** An append cannot destroy
 * what is already in the file, so the common path is `appendFileSync` (the same
 * call and the same reasoning as `ledger.ts`: rewriting the whole file on every
 * error gets more expensive exactly as the history gets more interesting, and a
 * crash mid-rewrite would risk the whole file instead of one line). The one
 * place this module *replaces* a file is compaction, and that goes through
 * `atomicWrite` and refuses to run when the last read failed — never write over
 * a file you could not read.
 */

import { app } from "electron"
import { join } from "path"
import { appendFileSync, readFileSync } from "fs"
import { atomicWrite } from "./atomic"
import { redact, sanitizeLabel, sanitizeText } from "./redact"
import type { DiagnosticsError, DiagnosticsOrigin, DiagnosticsReport } from "../shared/diagnostics"

/**
 * How many **distinct** errors survive. Older ones are dropped, newest kept —
 * an error still happening is the one worth reading, and a record that keeps
 * the first forty errors of a session and discards the crash the user is
 * looking at right now would be actively misleading.
 */
export const MAX_ENTRIES = 40

/** Per-field ceilings. A stack from a deep tree is long; an error message can be a whole file. */
export const MESSAGE_CAP = 2000
export const STACK_CAP = 4000
const SOURCE_CAP = 64

/**
 * The report channel's rate limit: at most `RATE_MAX` accepted reports per
 * `RATE_WINDOW_MS`, counted per process.
 *
 * The dedupe already absorbs a loop throwing the *same* error, but a loop whose
 * message carries a counter, an id or a timestamp produces a distinct key every
 * time — and each distinct key is an append. That is a caller-driven denial of
 * service in the shape the sibling build's security review already found once:
 * a renderer in a loop making main write unboundedly. The window is generous
 * enough that a genuine cascade (a mount storm hitting several boundaries) is
 * recorded in full, and small enough that a spinning renderer stops at a few
 * dozen lines instead of a few hundred thousand.
 *
 * Refusals are **counted, not silent** — the count becomes a sentence in the
 * record's `incomplete` block, because a record that dropped reports and does
 * not say so is the lie this whole feature exists to remove.
 */
export const RATE_MAX = 30
export const RATE_WINDOW_MS = 10_000

/**
 * How long before a repeat of an already-known error is written to disk again.
 *
 * The in-memory count is updated on every report; the file only needs to catch
 * up. Without this, ten thousand identical throws would still be ten thousand
 * appends — deduped in content, undeduped in I/O, which is the same disk
 * pressure wearing a tidier record.
 */
const REPEAT_WRITE_MS = 5_000

/**
 * Lines allowed on disk before the file is compacted to one line per surviving
 * entry. Each accepted write appends the *aggregate* for its key, so a key
 * rewritten many times leaves stale lines the fold discards on read; compaction
 * is what stops those accumulating on disk as well as in memory.
 */
const LINE_CAP = 400

function storeFile(): string {
    return join(app.getPath("userData"), "crashes.jsonl")
}

/** Test-only: names the store file so a test can plant a torn line directly. */
export function storePath(): string {
    return storeFile()
}

/**
 * The dedupe key: origin, source, message **and component stack**.
 *
 * **The stack is part of the identity, deliberately.** Keying on the message
 * alone is cheaper and merges more, and that is exactly the problem: the same
 * `Cannot read properties of undefined` thrown from the editor and from the
 * terminal is two bugs, and one entry claiming a count of 400 would attribute
 * both to whichever stack happened to be written first. The stack is also the
 * only thing that says *which of eleven boundaries* caught it.
 *
 * The cost is real and is accepted: two throws whose stacks differ by one frame
 * are two entries, so a loop that remounts at varying depth spends several
 * entries instead of one. `MAX_ENTRIES` and the rate limit bound that, and the
 * failure it prevents — a count for a place the error never happened — is not
 * bounded by anything.
 */
export function entryKey(e: {
    origin: DiagnosticsOrigin
    source: string
    message: string
    componentStack?: string
}): string {
    // NUL-joined: a message can contain any printable character, and a
    // separator a message can contain is a separator two different errors can
    // collide on.
    return [e.origin, e.source, e.message, e.componentStack ?? ""].join("\u0000")
}

/** Clip a string to a cap, reporting whether it had to. */
function clip(text: string, cap: number): { text: string; clipped: boolean } {
    if (text.length <= cap) return { text, clipped: false }
    return { text: text.slice(0, cap), clipped: true }
}

/**
 * Put one entry through the caps, the sanitiser and the redactor, whatever it
 * came from. Applied to a fresh report **and to every line read off disk**.
 *
 * The second half is the part that was missing. `readEntries` handed the parsed
 * JSON straight out, so three things were true of any line already in
 * `crashes.jsonl`:
 *
 * - **It was never redacted again.** Redaction happened on the way in, from
 *   whichever version of `redact.ts` was installed when the line was written —
 *   so a rule fixed today does nothing for a secret written yesterday, and a
 *   line written by anything other than this function was never redacted at
 *   all. An agent running in a pane has a shell and can write this file; that
 *   is a semi-trusted party choosing the contents of a blob a user is about to
 *   paste into a stranger's inbox.
 * - **`MESSAGE_CAP` and `STACK_CAP` did not apply.** A 50 KB component stack on
 *   disk became a 50 KB record, and nothing bounded the size of the clipboard
 *   text.
 * - **Fields nobody allow-listed rode along.** `isCrashEntry` is a shape check,
 *   not a whitelist, so an extra key on a planted line reached the record
 *   object the renderer receives. The record's headline claim is that it is
 *   allow-listed rather than filtered; that was true of main's own fields and
 *   false of the entries. Rebuilding the object field by field here is what
 *   makes the claim true of the whole thing.
 *
 * `clipped` is sticky: it comes out true if it was already true or if this pass
 * had to cut something, because the record's `incomplete` block promises to say
 * when anything was cut and it must not un-say it.
 */
export function normalizeEntry(e: DiagnosticsError): DiagnosticsError {
    const source = clip(redact(sanitizeLabel(e.source)) || "unknown", SOURCE_CAP)
    const message = clip(redact(sanitizeText(e.message)), MESSAGE_CAP)
    const rawStack = typeof e.componentStack === "string" ? e.componentStack : ""
    const stack = rawStack ? clip(redact(sanitizeText(rawStack)), STACK_CAP) : null
    const clipped = e.clipped || source.clipped || message.clipped || (stack?.clipped ?? false)
    return {
        // Named one by one. Nothing is spread, so a field on the input cannot
        // become a field on the output by having been there.
        origin: e.origin,
        source: source.text,
        message: message.text,
        componentStack: stack?.text,
        count: Number.isFinite(e.count) ? e.count : 1,
        firstAt: Number.isFinite(e.firstAt) ? e.firstAt : 0,
        lastAt: Number.isFinite(e.lastAt) ? e.lastAt : 0,
        clipped: clipped ? true : undefined
    }
}

/** Is this parsed line a usable entry? Applied on the way in and on the way out. */
export function isCrashEntry(value: unknown): value is DiagnosticsError {
    if (!value || typeof value !== "object") return false
    const e = value as Record<string, unknown>
    return (
        (e.origin === "renderer" || e.origin === "main") &&
        typeof e.source === "string" &&
        typeof e.message === "string" &&
        (e.componentStack === undefined || typeof e.componentStack === "string") &&
        typeof e.count === "number" &&
        typeof e.firstAt === "number" &&
        typeof e.lastAt === "number"
    )
}

/**
 * Fold JSONL lines into one entry per key.
 *
 * Every written line carries the full aggregate for its key, so folding is
 * "keep the line with the greatest `lastAt`" rather than a sum — a sum would
 * double-count every repeat that was flushed twice. `firstAt` is taken as the
 * minimum across lines so the first sighting survives compaction.
 *
 * A line that fails to parse, or parses into something that is not an entry, is
 * **skipped and counted**, never thrown on: a crash mid-append leaves a torn
 * final line, and losing that one record must not lose the file. The count is
 * what turns the loss into a sentence in the record instead of a silence.
 */
export function foldLines(lines: string[]): { entries: DiagnosticsError[]; skipped: number } {
    const byKey = new Map<string, DiagnosticsError>()
    let skipped = 0
    for (const line of lines) {
        if (!line.trim()) continue
        let parsed: unknown
        try {
            parsed = JSON.parse(line)
        } catch {
            skipped++
            continue
        }
        if (!isCrashEntry(parsed)) {
            skipped++
            continue
        }
        // Normalised *before* it is keyed, so the key is computed on the shape
        // this process would have written and a planted line cannot occupy a
        // key that a real report can never collide with.
        const entry = normalizeEntry(parsed)
        const key = entryKey(entry)
        const prev = byKey.get(key)
        if (!prev) {
            byKey.set(key, entry)
            continue
        }
        const newer = entry.lastAt >= prev.lastAt ? entry : prev
        byKey.set(key, {
            ...newer,
            count: Math.max(prev.count, entry.count),
            firstAt: Math.min(prev.firstAt, entry.firstAt),
            lastAt: Math.max(prev.lastAt, entry.lastAt),
            clipped: prev.clipped || entry.clipped ? true : undefined
        })
    }
    return { entries: [...byKey.values()], skipped }
}

/**
 * Keep the `max` most recently active entries, newest first, and say how many
 * were dropped.
 *
 * Exactly `max` entries drop nothing and produce **no** marker; `max + 1` drops
 * one and produces one. The boundary is the point of the function: a marker
 * that appears before anything was lost trains a reader to ignore it, and one
 * that appears after is the record lying about being complete.
 */
export function capEntries(
    entries: DiagnosticsError[],
    max = MAX_ENTRIES
): { kept: DiagnosticsError[]; dropped: number } {
    const sorted = [...entries].sort((a, b) => b.lastAt - a.lastAt)
    if (sorted.length <= max) return { kept: sorted, dropped: 0 }
    return { kept: sorted.slice(0, max), dropped: sorted.length - max }
}

// ---------------------------------------------------------------------------
// Process state
// ---------------------------------------------------------------------------

/** One entry plus the bookkeeping that is ours and never reaches the record. */
interface Tracked {
    entry: DiagnosticsError
    /** When this key was last appended to disk. 0 = never in this process. */
    writtenAt: number
    /** True when the in-memory count has moved on from what disk holds. */
    dirty: boolean
}

const tracked = new Map<string, Tracked>()

/** Reports refused by the rate limit in this process. Surfaces as a sentence. */
let rateLimited = 0
/** Reports refused for having no usable message at all. */
let malformed = 0
/** Accepted-report timestamps inside the current window. */
let windowStart = 0
let windowCount = 0

/** Lines believed to be on disk. -1 = not yet known in this process. */
let lineCount = -1
/** Does the file end in a newline? A torn tail must not be appended onto. */
let endsWithNewline = true
/**
 * Latched when the file exists and could not be read. While it is set the file
 * is never replaced — an unreadable store is not an empty one, and compacting
 * over it would destroy the only copy of what we failed to parse.
 */
let readFailed = false
/** Seeded once per process, so dedupe spans sessions rather than restarting. */
let seeded = false

/** Test-only: forget everything this process has learned. */
export function resetSink(): void {
    tracked.clear()
    rateLimited = 0
    malformed = 0
    windowStart = 0
    windowCount = 0
    lineCount = -1
    endsWithNewline = true
    readFailed = false
    seeded = false
}

/** Read the file, keeping "absent" distinct from "damaged" the way `readJson` does. */
function readRaw(): { ok: true; text: string } | { ok: false; reason: "missing" | "unreadable" } {
    try {
        return { ok: true, text: readFileSync(storeFile(), "utf8") }
    } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { ok: false, reason: "missing" }
        return { ok: false, reason: "unreadable" }
    }
}

/** Load what previous sessions wrote, once, so a repeat keeps its history. */
function seedIfNeeded(): void {
    if (seeded) return
    seeded = true
    const raw = readRaw()
    if (!raw.ok) {
        if (raw.reason === "missing") {
            lineCount = 0
            endsWithNewline = true
            readFailed = false
            return
        }
        readFailed = true
        // The tail is unknown, so assume the worst: a leading newline costs one
        // blank line, which the fold skips, while assuming wrongly costs a record.
        endsWithNewline = false
        return
    }
    readFailed = false
    const lines = raw.text.split("\n")
    lineCount = lines.filter((l) => l.trim().length > 0).length
    endsWithNewline = raw.text.length === 0 || raw.text.endsWith("\n")
    const { entries } = foldLines(lines)
    const { kept } = capEntries(entries)
    for (const entry of kept) {
        tracked.set(entryKey(entry), { entry, writtenAt: entry.lastAt, dirty: false })
    }
}

/** Compact to one line per surviving entry. The only place this module replaces the file. */
function compact(): void {
    if (readFailed) {
        console.error(
            "[crashSink] refusing to compact: crashes.jsonl exists but could not be read;" +
                " replacing it now would destroy records we never parsed"
        )
        return
    }
    const { kept } = capEntries([...tracked.values()].map((t) => t.entry))
    try {
        atomicWrite(storeFile(), kept.map((e) => JSON.stringify(e)).join("\n") + "\n")
        lineCount = kept.length
        endsWithNewline = true
        // Everything on disk now matches memory.
        tracked.clear()
        for (const entry of kept) {
            tracked.set(entryKey(entry), { entry, writtenAt: entry.lastAt, dirty: false })
        }
    } catch (err) {
        console.error("[crashSink] failed to compact:", err)
    }
}

/** Append one aggregate line. Never reads the file to do it. */
function appendEntry(t: Tracked, now: number): void {
    try {
        appendFileSync(
            storeFile(),
            (endsWithNewline ? "" : "\n") + JSON.stringify(t.entry) + "\n"
        )
        endsWithNewline = true
        t.writtenAt = now
        t.dirty = false
    } catch (err) {
        console.error("[crashSink] failed to append:", err)
        // A throw does not mean nothing was written: a partial write leaves the
        // file mid-line, so the next append must terminate it first.
        endsWithNewline = false
        return
    }
    if (lineCount < 0) return
    lineCount++
    if (lineCount > LINE_CAP) compact()
}

/** Token bucket over a fixed window. Returns false when the report is refused. */
function allow(now: number): boolean {
    if (now - windowStart >= RATE_WINDOW_MS) {
        windowStart = now
        windowCount = 0
    }
    if (windowCount >= RATE_MAX) {
        rateLimited++
        return false
    }
    windowCount++
    return true
}

/**
 * Record one caught error.
 *
 * **Everything except the three strings is main's.** The caller supplies a
 * source label, a message and an optional component stack; the origin, the
 * timestamps, the counting, the caps, the redaction, the file path and the
 * format of the line are all decided here. That is what keeps the crash lane
 * from being a general-purpose file write: there is no path parameter, no
 * content parameter and no way to steer where the bytes land or what shape they
 * take. See `main/index.ts` for the channel.
 *
 * Redaction happens **on the way in**, so the file on disk never holds a
 * credential — not just the copy that reaches the clipboard.
 *
 * Returns whether the report was accepted, for the tests and for nothing else:
 * the channel is fire-and-forget and no caller waits on this.
 */
export function recordError(
    origin: DiagnosticsOrigin,
    report: DiagnosticsReport,
    now: number = Date.now()
): boolean {
    const rawMessage = typeof report?.message === "string" ? report.message.trim() : ""
    if (!rawMessage) {
        // Nothing to dedupe on and nothing to read. Counted so a renderer that
        // reports empties is visible in the record rather than silently ignored.
        malformed++
        return false
    }
    if (!allow(now)) return false

    seedIfNeeded()

    // One decision point for the caps, the sanitiser and the redactor, shared
    // with every line read back off disk. See `normalizeEntry`.
    const normalized = normalizeEntry({
        origin,
        source: typeof report.source === "string" ? report.source.trim() : "",
        message: rawMessage,
        componentStack:
            typeof report.componentStack === "string" && report.componentStack.trim()
                ? report.componentStack.trim()
                : undefined,
        count: 1,
        firstAt: now,
        lastAt: now
    })
    // Checked **again**, after the sanitiser. A message of nothing but control
    // characters is non-empty going in and empty coming out, and an entry with
    // no message is exactly what the check above exists to refuse. A guard that
    // runs before the transform that can invalidate it has not run.
    if (!normalized.message) {
        malformed++
        return false
    }
    const shape = {
        origin,
        source: normalized.source,
        message: normalized.message,
        componentStack: normalized.componentStack
    }
    const key = entryKey(shape)
    const existing = tracked.get(key)
    if (existing) {
        existing.entry = {
            ...existing.entry,
            count: existing.entry.count + 1,
            lastAt: now
        }
        existing.dirty = true
        // The count is already right in memory; disk only has to catch up, and
        // ten thousand throws must not be ten thousand appends.
        //
        // What a **kill** costs, stated because `flushSink` only runs at
        // teardown and an antivirus stop never reaches it: everything counted
        // since this key's last append is lost. That is bounded by the rate
        // limit, not by the loop — at most `RATE_MAX` reports per
        // `RATE_WINDOW_MS` are accepted at all, so at most ~15 repeats of one
        // key can accumulate inside a 5s throttle window. The entry itself, its
        // message and its stack are already on disk from the first sighting; a
        // count that reads 1 instead of 16 understates a storm but never hides
        // one, and that is the trade being made.
        if (now - existing.writtenAt >= REPEAT_WRITE_MS) appendEntry(existing, now)
        return true
    }

    const t: Tracked = { entry: normalized, writtenAt: 0, dirty: true }
    tracked.set(key, t)
    appendEntry(t, now)
    // Evicting in memory as well as on read keeps the map from being a second,
    // uncapped copy of the log for the life of the process.
    if (tracked.size > MAX_ENTRIES) {
        const { kept } = capEntries([...tracked.values()].map((x) => x.entry))
        const keepKeys = new Set(kept.map(entryKey))
        for (const k of [...tracked.keys()]) if (!keepKeys.has(k)) tracked.delete(k)
    }
    return true
}

/** Record something main itself caught. Same lane, same caps, origin it cannot lie about. */
export function recordMainError(source: string, err: unknown, now: number = Date.now()): boolean {
    const e = err as Error | undefined
    const message = e?.message ? `${e.name ?? "Error"}: ${e.message}` : String(err)
    return recordError("main", { source, message, componentStack: e?.stack }, now)
}

/**
 * Flush counts that moved in memory but were held back by the repeat throttle.
 * Called at teardown, so the last state of a loop that was still spinning when
 * the user quit is the state the next session reads.
 */
export function flushSink(now: number = Date.now()): void {
    for (const t of tracked.values()) {
        if (t.dirty) appendEntry(t, now)
    }
}

/** What the sink knows it lost, so the record can say so out loud. */
export interface SinkStats {
    rateLimited: number
    malformed: number
}

export function sinkStats(): SinkStats {
    return { rateLimited, malformed }
}

/**
 * Everything the sink holds, newest activity first — or a refusal.
 *
 * `unreadable` is a real answer and is **not** an empty list. "Nothing has gone
 * wrong" and "I could not read my own log" are two different facts, and §5.3's
 * fourth state exists because offering to copy nothing and succeeding is worse
 * than refusing.
 *
 * The file is the authority rather than the in-memory map, because the file is
 * what survives a restart — and because a read that fails is the only way this
 * module can discover that its own store has been locked or corrupted.
 */
export function readEntries():
    | { ok: true; entries: DiagnosticsError[]; dropped: number; skipped: number }
    | { ok: false; reason: "unreadable" } {
    const raw = readRaw()
    if (!raw.ok) {
        if (raw.reason === "missing") {
            readFailed = false
            // No file yet is a healthy first run, not a failure. Anything this
            // process has in memory but has not managed to write is still real.
            const live = [...tracked.values()].map((t) => t.entry)
            const { kept, dropped } = capEntries(live)
            return { ok: true, entries: kept, dropped, skipped: 0 }
        }
        readFailed = true
        return { ok: false, reason: "unreadable" }
    }
    readFailed = false
    const { entries, skipped } = foldLines(raw.text.split("\n"))
    // In-memory entries win where they overlap: a repeat held back by the write
    // throttle has a truer count in memory than the last line on disk.
    const merged = new Map<string, DiagnosticsError>()
    for (const e of entries) merged.set(entryKey(e), e)
    for (const t of tracked.values()) {
        const key = entryKey(t.entry)
        const disk = merged.get(key)
        merged.set(
            key,
            disk
                ? {
                      ...t.entry,
                      count: Math.max(disk.count, t.entry.count),
                      firstAt: Math.min(disk.firstAt, t.entry.firstAt),
                      lastAt: Math.max(disk.lastAt, t.entry.lastAt)
                  }
                : t.entry
        )
    }
    const { kept, dropped } = capEntries([...merged.values()])
    return { ok: true, entries: kept, dropped, skipped }
}
