import { describe, it, expect, vi, beforeEach } from "vitest"

// A fake ~/.claude/projects tree, so the window filtering can be tested without
// touching the real machine's transcripts.
const files = new Map<string, { content: string; mtimeMs: number }>()
const dirs = new Map<string, string[]>()

vi.mock("os", () => ({ homedir: () => "/home/dev" }))
vi.mock("fs", () => ({
    readdirSync: (p: string) => {
        const d = dirs.get(p)
        if (!d) throw new Error("ENOENT " + p)
        return d
    },
    readFileSync: (p: string) => {
        const f = files.get(p)
        if (!f) throw new Error("ENOENT " + p)
        return f.content
    },
    statSync: (p: string) => {
        const f = files.get(p)
        if (f) return { mtimeMs: f.mtimeMs, isDirectory: () => false }
        if (dirs.has(p)) return { mtimeMs: 0, isDirectory: () => true }
        throw new Error("ENOENT " + p)
    }
}))

const { costInWindow } = await import("../src/main/usage")

// usage.ts joins with path.join, which uses "\" on win32 — build keys the same way.
const { join } = await import("path")
const PROJECT = "C:/repos/web-api"
const FOLDER = "c--repos-web-api" // encodePath: [\/: ] -> "-", lowercased
const DIR = join("/home/dev", ".claude", "projects", FOLDER)

const rec = (ts: string, output: number): string =>
    JSON.stringify({
        timestamp: ts,
        message: {
            model: "claude-opus-4-8",
            usage: { input_tokens: 100, output_tokens: output }
        }
    })

beforeEach(() => {
    files.clear()
    dirs.clear()
})

const addTranscript = (name: string, lines: string[], mtimeMs = 9_000_000_000_000): void => {
    dirs.set(DIR, [...(dirs.get(DIR) ?? []), name])
    files.set(join(DIR, name), { content: lines.join("\n"), mtimeMs })
}

const T = (iso: string): number => Date.parse(iso)

describe("costInWindow", () => {
    it("returns an empty bucket when the project has no transcript folder", () => {
        const b = costInWindow(PROJECT, 0, Date.now())
        expect(b.tokens).toBe(0)
        expect(b.cost).toBe(0)
    })

    it("counts only records inside the window", () => {
        addTranscript("a.jsonl", [
            rec("2026-08-01T10:00:00.000Z", 100), // before
            rec("2026-08-01T12:00:00.000Z", 200), // inside
            rec("2026-08-01T12:30:00.000Z", 300), // inside
            rec("2026-08-01T14:00:00.000Z", 400) // after
        ])
        const b = costInWindow(PROJECT, T("2026-08-01T11:00:00Z"), T("2026-08-01T13:00:00Z"))
        expect(b.output).toBe(500)
    })

    it("includes records exactly on each boundary", () => {
        addTranscript("a.jsonl", [rec("2026-08-01T12:00:00.000Z", 10)])
        const at = T("2026-08-01T12:00:00Z")
        expect(costInWindow(PROJECT, at, at).output).toBe(10)
    })

    it("produces a non-zero cost for real tokens", () => {
        addTranscript("a.jsonl", [rec("2026-08-01T12:00:00.000Z", 5000)])
        const b = costInWindow(PROJECT, T("2026-08-01T00:00:00Z"), T("2026-08-02T00:00:00Z"))
        expect(b.cost).toBeGreaterThan(0)
    })

    it("skips a transcript last written before the window opened", () => {
        // Its records would otherwise fall inside, so only the mtime guard excludes it.
        addTranscript("old.jsonl", [rec("2026-08-01T12:00:00.000Z", 999)], T("2026-07-01T00:00:00Z"))
        const b = costInWindow(PROJECT, T("2026-08-01T11:00:00Z"), T("2026-08-01T13:00:00Z"))
        expect(b.output).toBe(0)
    })

    it("sums across several transcripts in the project", () => {
        addTranscript("a.jsonl", [rec("2026-08-01T12:00:00.000Z", 100)])
        addTranscript("b.jsonl", [rec("2026-08-01T12:10:00.000Z", 250)])
        const b = costInWindow(PROJECT, T("2026-08-01T11:00:00Z"), T("2026-08-01T13:00:00Z"))
        expect(b.output).toBe(350)
    })

    it("ignores records with no or unparseable timestamp", () => {
        addTranscript("a.jsonl", [
            JSON.stringify({ message: { model: "m", usage: { output_tokens: 50 } } }),
            JSON.stringify({ timestamp: "not-a-date", message: { model: "m", usage: { output_tokens: 60 } } })
        ])
        expect(costInWindow(PROJECT, 0, Date.now()).output).toBe(0)
    })

    it("refuses a backwards window rather than counting everything", () => {
        addTranscript("a.jsonl", [rec("2026-08-01T12:00:00.000Z", 100)])
        const b = costInWindow(PROJECT, T("2026-08-01T13:00:00Z"), T("2026-08-01T11:00:00Z"))
        expect(b.output).toBe(0)
    })

    it("returns empty for a missing project path", () => {
        expect(costInWindow("", 0, Date.now()).tokens).toBe(0)
    })
})
