import { describe, it, expect, beforeEach, vi } from "vitest"
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "fs"

// Mock Electron with a temp userData dir so crashes.jsonl lands somewhere real.
// Same pattern as tests/projects.test.ts.
const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path")
    return { dir: fs.mkdtempSync(path.join(os.tmpdir(), "crash-")) }
})
vi.mock("electron", () => ({
    app: { getPath: () => h.dir }
}))

import {
    MAX_ENTRIES,
    MESSAGE_CAP,
    STACK_CAP,
    RATE_MAX,
    RATE_WINDOW_MS,
    capEntries,
    entryKey,
    flushSink,
    foldLines,
    readEntries,
    recordError,
    recordMainError,
    resetSink,
    sinkStats,
    storePath
} from "../src/main/crashSink"

const T0 = 1_700_000_000_000

function wipe(): void {
    if (existsSync(storePath())) rmSync(storePath())
    resetSink()
}

function entry(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        origin: "renderer",
        source: "ErrorBoundary",
        message: "boom",
        count: 1,
        firstAt: T0,
        lastAt: T0,
        ...over
    }
}

beforeEach(() => wipe())

describe("dedupe — one entry, a count, not N copies", () => {
    it("collapses 10,000 identical throws into one entry carrying the count", () => {
        // The rate limit would refuse most of these if it were counting real
        // wall-clock; the injected clock walks a millisecond at a time inside
        // one window, so this test is about the DEDUPE, not the limiter. Both
        // bound the same failure from different sides and each has its own test.
        for (let i = 0; i < 10_000; i++) {
            recordError(
                "renderer",
                { source: "EditorPanel", message: "Cannot read properties of undefined", componentStack: "at Editor" },
                T0
            )
        }
        const res = readEntries()
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.entries.length).toBe(1)
        // Everything the rate limit accepted is counted; the limiter's own
        // refusals are reported separately, never folded into this number.
        expect(res.entries[0].count).toBe(RATE_MAX)
        expect(sinkStats().rateLimited).toBe(10_000 - RATE_MAX)
    })

    it("keeps first and last timestamps rather than N copies", () => {
        recordError("renderer", { source: "b", message: "same" }, T0)
        recordError("renderer", { source: "b", message: "same" }, T0 + 60_000)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(1)
        expect(res.entries[0].firstAt).toBe(T0)
        expect(res.entries[0].lastAt).toBe(T0 + 60_000)
        expect(res.entries[0].count).toBe(2)
    })

    it("does NOT merge two distinct component stacks that share a message", () => {
        // The design decision this asserts: the stack is part of the identity.
        // Keying on the message alone would report one entry with a count of 2
        // for a place one of the two errors never happened.
        recordError("renderer", { source: "boundary", message: "same", componentStack: "at EditorPanel" }, T0)
        recordError("renderer", { source: "boundary", message: "same", componentStack: "at TerminalPane" }, T0 + 1)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(2)
        expect(res.entries.every((e) => e.count === 1)).toBe(true)
    })

    it("does not merge across origins — a renderer report cannot join a main one", () => {
        recordError("renderer", { source: "s", message: "same" }, T0)
        recordError("main", { source: "s", message: "same" }, T0 + 1)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(2)
    })

    it("keys on the whole message — a separator inside one cannot collide with another", () => {
        const a = entryKey({ origin: "renderer", source: "x", message: "a", componentStack: "b" })
        const b = entryKey({ origin: "renderer", source: "x", message: "a\u0000b", componentStack: "" })
        expect(a).not.toBe(b)
    })
})

describe("cap — the marker appears the instant it is exceeded, and not before", () => {
    const at = (i: number): number => T0 + i * 1000

    function distinct(n: number): void {
        for (let i = 0; i < n; i++) {
            // A fresh window per report, so the rate limit is not what is being
            // measured here.
            recordError("renderer", { source: "s", message: `distinct #${i}` }, at(i) + i * RATE_WINDOW_MS)
        }
    }

    it("keeps exactly MAX_ENTRIES with nothing dropped", () => {
        distinct(MAX_ENTRIES)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(MAX_ENTRIES)
        expect(res.dropped).toBe(0)
    })

    it("drops exactly one at MAX_ENTRIES + 1, and it is the OLDEST", () => {
        distinct(MAX_ENTRIES + 1)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(MAX_ENTRIES)
        expect(res.dropped).toBe(1)
        // Drop-oldest, not drop-newest: the error still happening is the one
        // worth reading, and the newest report is the one the user is looking at.
        expect(res.entries.some((e) => e.message === "distinct #0")).toBe(false)
        expect(res.entries.some((e) => e.message === `distinct #${MAX_ENTRIES}`)).toBe(true)
    })

    it("capEntries is the boundary, in isolation", () => {
        const mk = (i: number): ReturnType<typeof entryAs> => entryAs(i)
        const list = Array.from({ length: 5 }, (_, i) => mk(i))
        expect(capEntries(list, 5).dropped).toBe(0)
        expect(capEntries(list, 5).kept.length).toBe(5)
        expect(capEntries(list, 4).dropped).toBe(1)
        expect(capEntries(list, 4).kept.map((e) => e.message)).not.toContain("m0")
    })
})

function entryAs(i: number) {
    return {
        origin: "renderer" as const,
        source: "s",
        message: `m${i}`,
        count: 1,
        firstAt: T0 + i,
        lastAt: T0 + i
    }
}

describe("rate limit — a renderer in a loop cannot make main write unboundedly", () => {
    it("accepts RATE_MAX distinct reports in a window and refuses the rest", () => {
        for (let i = 0; i < RATE_MAX + 25; i++) {
            recordError("renderer", { source: "s", message: `unique ${i}` }, T0)
        }
        expect(sinkStats().rateLimited).toBe(25)
        const lines = readFileSync(storePath(), "utf8").split("\n").filter(Boolean)
        // The bound is on WRITES, which is the resource being defended.
        expect(lines.length).toBe(RATE_MAX)
    })

    it("lets the next window through", () => {
        for (let i = 0; i < RATE_MAX + 5; i++) {
            recordError("renderer", { source: "s", message: `a${i}` }, T0)
        }
        expect(recordError("renderer", { source: "s", message: "next window" }, T0 + RATE_WINDOW_MS)).toBe(true)
    })

    it("refuses a report with no message at all, and counts it", () => {
        expect(recordError("renderer", { source: "s", message: "   " }, T0)).toBe(false)
        expect(sinkStats().malformed).toBe(1)
        expect(existsSync(storePath())).toBe(false)
    })
})

describe("redaction happens on the way in — the file on disk is clean too", () => {
    it("never writes a credential to the log", () => {
        recordError(
            "renderer",
            {
                source: "ApiPanel",
                message: "request failed with ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345",
                componentStack: "at ApiPanel (C:\\Users\\Admin\\AppData\\Roaming\\devdeck\\out\\renderer\\index.js:1:2)"
            },
            T0
        )
        const raw = readFileSync(storePath(), "utf8")
        expect(raw).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345")
        // And the path — the thing the record exists to carry — survived, minus
        // the one segment that names its owner. F-3, 2026-09-10: this log is
        // pasted into a public issue tracker, and a home directory is an
        // identifier as well as evidence. `src/main/redact.ts` folds the owner
        // and keeps every other segment; see PATH_RULES there and the
        // `HOME_FOLDED` corpus in tests/redact.test.ts.
        expect(raw).not.toContain("Admin")
        expect(raw).toContain(
            "C:\\\\Users\\\\[redacted:user]\\\\AppData\\\\Roaming\\\\devdeck"
        )
    })
})

describe("clipping is reported, never silent", () => {
    it("marks an over-long message as clipped and cuts it to the cap", () => {
        recordError("renderer", { source: "s", message: "x".repeat(MESSAGE_CAP + 500) }, T0)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries[0].message.length).toBe(MESSAGE_CAP)
        expect(res.entries[0].clipped).toBe(true)
    })
})

describe("the log file — torn lines, absence, and unreadability are three answers", () => {
    it("reads an absent file as an empty, healthy record", () => {
        const res = readEntries()
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.entries).toEqual([])
        expect(res.dropped).toBe(0)
    })

    it("skips a torn final line without losing the file, and counts the loss", () => {
        writeFileSync(storePath(), JSON.stringify(entry({ message: "good" })) + '\n{"origin":"rende')
        resetSink()
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(1)
        expect(res.entries[0].message).toBe("good")
        expect(res.skipped).toBe(1)
    })

    it("skips a line that parses but is not an entry", () => {
        writeFileSync(storePath(), '{"hello":"world"}\n' + JSON.stringify(entry()) + "\n")
        resetSink()
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(1)
        expect(res.skipped).toBe(1)
    })

    it("answers `unreadable` — not empty — when the file exists and cannot be read", () => {
        // A directory where the file should be: `readFileSync` fails with EISDIR,
        // which is not ENOENT. That is the shape of an antivirus lock or a
        // permission denial, and the two must not collapse into "you have
        // nothing to report".
        mkdirSync(storePath())
        resetSink()
        const res = readEntries()
        expect(res.ok).toBe(false)
        if (res.ok) return
        expect(res.reason).toBe("unreadable")
        rmSync(storePath(), { recursive: true })
    })

    it("carries a repeat's count across a restart", () => {
        recordError("renderer", { source: "s", message: "persisted" }, T0)
        flushSink(T0)
        resetSink() // a new process, same file
        recordError("renderer", { source: "s", message: "persisted" }, T0 + 10 * RATE_WINDOW_MS)
        flushSink(T0 + 10 * RATE_WINDOW_MS)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(1)
        expect(res.entries[0].count).toBe(2)
        expect(res.entries[0].firstAt).toBe(T0)
    })

    it("folds duplicate aggregate lines for one key without double-counting", () => {
        const a = entry({ message: "same", count: 3, lastAt: T0 + 5 })
        const b = entry({ message: "same", count: 7, lastAt: T0 + 9 })
        const { entries } = foldLines([JSON.stringify(a), JSON.stringify(b)])
        expect(entries.length).toBe(1)
        expect(entries[0].count).toBe(7)
    })
})

describe("main's own errors use the same lane", () => {
    it("records an Error with an origin the caller cannot forge", () => {
        recordMainError("pty", new Error("spawn failed"), T0)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries[0].origin).toBe("main")
        expect(res.entries[0].message).toContain("spawn failed")
    })
})

describe("what a kill costs is bounded, and it is bounded by the rate limit", () => {
    it("cannot lose more than one window's worth of repeats", () => {
        // `flushSink` runs at teardown, so a process that is KILLED — an
        // antivirus stop, a task-manager end — never reaches it, and everything
        // counted since the last append for that key is lost. The bound is the
        // rate limit, not the loop: at most RATE_MAX reports are accepted per
        // window, so a spinning renderer cannot make the on-disk count arbitrarily
        // stale. The entry, its message and its stack are on disk from the first
        // sighting regardless — only the count understates.
        for (let i = 0; i < 10_000; i++) {
            recordError("renderer", { source: "s", message: "loop" }, T0)
        }
        // No flushSink() call: this is what a kill would leave behind.
        const written = readFileSync(storePath(), "utf8")
            .split("\n")
            .filter(Boolean)
            .map((l) => JSON.parse(l).count as number)
        expect(written.length).toBe(1)
        expect(Math.max(...written)).toBe(1)
        // In memory the truth is intact, and a clean quit writes it.
        flushSink(T0)
        const after = readEntries()
        if (!after.ok) throw new Error("unreadable")
        expect(after.entries[0].count).toBe(RATE_MAX)
    })
})

/**
 * Control characters, built rather than typed. A literal NUL in a test file is
 * invisible in every diff and survives no round trip through tooling.
 */
const NUL = String.fromCharCode(0)
const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
/** An unpaired high surrogate — half a character. */
const LONE = String.fromCharCode(0xd800)
const FFFD = String.fromCharCode(0xfffd)

/**
 * Sanitisation on the way in, and again on the way out.
 *
 * Both directions matter and only the first existed. The sink redacted a fresh
 * report and then handed every line it read back off disk straight out of
 * `JSON.parse` — no second redaction, no caps, and no field list.
 */
describe("what a report may put in the store, character by character", () => {
    it("keeps a NUL out of the store — one byte otherwise breaks the clipboard forever", () => {
        // Measured, not assumed: Electron's `clipboard.writeText("a\0b")` reads
        // back as `"a"`. `clipboard:write` proves its write by comparing the
        // read-back, so a NUL anywhere in the record makes every copy report
        // failure for the life of the install — from `diagnostics:report`, a
        // fire-and-forget channel a renderer can call directly.
        expect(recordError("renderer", { source: "B", message: `boom${NUL}tail` }, T0)).toBe(true)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries[0].message).toBe("boomtail")
        // And not as a JSON escape either: the file is what the next session reads.
        expect(readFileSync(storePath(), "utf8")).not.toContain("u0000")
    })

    it("keeps an ANSI escape and a lone surrogate out of the store", () => {
        recordError("renderer", { source: "B", message: `red ${ESC}[31mX${ESC}[0m` }, T0)
        recordError("renderer", { source: "B", message: `lone ${LONE} half` }, T0 + 1)
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        const messages = res.entries.map((e) => e.message)
        expect(messages).toContain("red [31mX[0m")
        expect(messages).toContain(`lone ${FFFD} half`)
    })

    it("refuses a message that is empty only AFTER sanitising, and counts it", () => {
        // The pre-existing emptiness check runs before the transform that can
        // invalidate it, so it has to be re-asked afterwards. A guard placed
        // upstream of the step which can falsify it has not run.
        const before = sinkStats().malformed
        expect(recordError("renderer", { source: "B", message: `${NUL}${BEL}` }, T0)).toBe(false)
        expect(sinkStats().malformed).toBe(before + 1)
        expect(existsSync(storePath())).toBe(false)
    })

    it("flattens a source that tries to forge a second error line", () => {
        // `renderRecord` writes `[${origin}/${source}]` — so a source carrying
        // a `]` and a `[` writes a whole fictitious error line into the blob.
        recordError(
            "renderer",
            { source: "x] x9999  first 1970 [main/kernel", message: "forged" },
            T0
        )
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries[0].source).not.toContain("[")
        expect(res.entries[0].source).not.toContain("]")
    })
})

/**
 * Lines that were already on disk.
 *
 * Three things were true of any line in `crashes.jsonl` that this process did
 * not write itself, and all three are now false:
 *
 * - it was never redacted again, so a redactor rule fixed today did nothing for
 *   a secret written yesterday — and a line written by anything other than
 *   `recordError` had never been redacted at all;
 * - `MESSAGE_CAP` and `STACK_CAP` did not apply to it, so nothing bounded the
 *   size of the record or of the clipboard text;
 * - `isCrashEntry` is a shape check rather than a whitelist, so an extra field
 *   on the line rode into the record object the renderer receives — while the
 *   record's headline claim is that it is allow-listed rather than filtered.
 *
 * Who can write that file: an agent running in a pane. It has a shell, so this
 * is not a privilege escalation — but it is a semi-trusted party choosing the
 * contents of a blob the user is about to paste into a stranger's inbox, which
 * is an exfiltration channel that needs no network of its own.
 */
describe("a line on disk is not trusted just because it parsed", () => {
    const planted = {
        origin: "main",
        source: "kernel",
        message: "ANTHROPIC_API_KEY=sk-ant-api03-PLANTEDPLANTEDPLANTED0123456789",
        componentStack: "y".repeat(50_000),
        count: 1,
        firstAt: T0,
        lastAt: T0 + 5,
        extraFieldNobodyAllowListed: "SMUGGLED"
    }

    beforeEach(() => {
        writeFileSync(storePath(), JSON.stringify(planted) + "\n")
        resetSink()
    })

    it("redacts a credential that reached the file without going through the sink", () => {
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries[0].message).not.toContain("PLANTEDPLANTEDPLANTED")
        expect(res.entries[0].message).toContain("ANTHROPIC_API_KEY=")
    })

    it("applies the caps to a line that arrived over-length, and says it clipped", () => {
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries[0].componentStack?.length).toBe(STACK_CAP)
        expect(res.entries[0].clipped).toBe(true)
    })

    it("drops a field nobody allow-listed rather than carrying it into the record", () => {
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(JSON.stringify(res.entries)).not.toContain("SMUGGLED")
        expect(JSON.stringify(res.entries)).not.toContain("extraFieldNobodyAllowListed")
    })

    it("skips a line whose timestamps are not numbers rather than putting NaN in the record", () => {
        // JSON has no NaN, so this arrives as `null` and fails `isCrashEntry`.
        // Asserted so a later widening of that predicate cannot quietly let a
        // non-number into a field the record sorts and formats as a date.
        writeFileSync(
            storePath(),
            JSON.stringify({ ...planted, count: NaN, firstAt: NaN, lastAt: NaN }) + "\n"
        )
        resetSink()
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.length).toBe(0)
        expect(res.skipped).toBe(1)
    })

    it("keeps a NUL planted on disk out of what it reads back", () => {
        writeFileSync(
            storePath(),
            JSON.stringify({ ...planted, message: `disk${NUL}planted` }) + "\n"
        )
        resetSink()
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries[0].message).toBe("diskplanted")
    })
})

/**
 * The cap as an eviction primitive.
 *
 * A renderer can spend `MAX_ENTRIES` distinct reports and push a real error out
 * of the record — 30 accepted per 10s window, so about fourteen seconds of
 * work. That is not a hole to be closed: the log has to be bounded, and newest
 * has to win, or a spinning loop buries the crash the user is looking at. The
 * requirement is that the record **says** it happened, because a record that
 * dropped the interesting error and looks whole is the lie this feature exists
 * to remove.
 */
describe("evicting a real error is allowed, and is not allowed to be silent", () => {
    it("reports the drop when a flood pushes the first error out", () => {
        recordError("renderer", { source: "B", message: "THE REAL ERROR" }, T0)
        for (let i = 0; i < MAX_ENTRIES + 5; i++) {
            // A fresh window each time, so the rate limit is not what is under test.
            recordError("renderer", { source: "B", message: `flood ${i}` }, T0 + (i + 1) * 20_000)
        }
        const res = readEntries()
        if (!res.ok) throw new Error("unreadable")
        expect(res.entries.map((e) => e.message)).not.toContain("THE REAL ERROR")
        expect(res.dropped).toBeGreaterThan(0)
    })
})
