import { describe, it, expect, beforeEach, vi } from "vitest"
import { writeFileSync, existsSync, rmSync, mkdirSync, readdirSync } from "fs"
import { join } from "path"

const h = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("os")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path")
    return {
        dir: fs.mkdtempSync(path.join(os.tmpdir(), "diag-")),
        probe: {
            results: {} as Record<string, unknown>,
            pathHydrated: true,
            checkedAt: 0
        }
    }
})

vi.mock("electron", () => ({
    app: {
        getPath: () => h.dir,
        getVersion: () => "9.9.9",
        isPackaged: false
    }
}))

// The probe spawns a login shell. Mocked so these tests describe the record,
// not the machine they happen to run on — `tests/probe.test.ts` owns the walk.
vi.mock("../src/main/shellPath", () => ({
    probe: async () => h.probe
}))

import {
    buildRecord,
    notePtyExit,
    noteShellSpawn,
    reportIpc,
    resetObservations
} from "../src/main/diagnostics"
import { MESSAGE_CAP, STACK_CAP, recordError, resetSink, storePath } from "../src/main/crashSink"

const T0 = 1_700_000_000_000
const settingsFile = (): string => join(h.dir, "settings.json")

function wipe(): void {
    if (existsSync(storePath())) rmSync(storePath(), { recursive: true })
    if (existsSync(settingsFile())) rmSync(settingsFile(), { recursive: true })
    resetSink()
    resetObservations()
    h.probe.results = {}
    h.probe.pathHydrated = true
}

/** A fresh `now` per call, so the record's 500ms cache never answers a later assertion. */
let clock = T0
function tick(): number {
    clock += 10_000
    return clock
}

beforeEach(() => {
    wipe()
    clock = T0
})

describe("the last pty exit code is the most recent one", () => {
    it("reports the latest of a sequence, never the first", () => {
        notePtyExit(1, T0)
        notePtyExit(0, T0 + 1)
        notePtyExit(137, T0 + 2)
        return buildRecord(tick()).then((res) => {
            if (!res.ok) throw new Error("unreadable")
            expect(res.record.lastPtyExit).toEqual({ code: 137, at: T0 + 2 })
        })
    })

    it("keeps the last NON-zero exit after later clean exits bury it", async () => {
        // 0xC0000409 is Avast killing PowerShell on this machine. Three healthy
        // panes closed afterwards must not erase the only evidence of it.
        notePtyExit(3221226505, T0)
        notePtyExit(0, T0 + 1)
        notePtyExit(0, T0 + 2)
        notePtyExit(0, T0 + 3)
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.lastPtyExit).toEqual({ code: 0, at: T0 + 3 })
        expect(res.record.lastFailedPtyExit).toEqual({ code: 3221226505, at: T0 })
    })

    it("reports none when nothing has exited", async () => {
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.lastPtyExit).toBeNull()
        expect(res.record.lastFailedPtyExit).toBeNull()
    })

    it("ignores a non-numeric exit code rather than writing NaN into the record", async () => {
        notePtyExit(undefined as unknown as number, T0)
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.lastPtyExit).toBeNull()
    })
})

describe("`unavailable` is a real answer, distinct from an empty record", () => {
    it("answers ok with an empty error list when nothing has gone wrong", async () => {
        const res = await buildRecord(tick())
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.record.errors).toEqual([])
        expect(res.text).toContain("none recorded")
    })

    it("refuses when the crash log exists and cannot be read", async () => {
        mkdirSync(storePath()) // EISDIR on read: an antivirus lock or a denial
        resetSink()
        const res = await buildRecord(tick())
        expect(res.ok).toBe(false)
        if (res.ok) return
        expect(res.reason).toBe("unreadable")
    })
})

describe("truncation is visible in the record and in the text", () => {
    it("says so when the cap dropped entries", async () => {
        const at = (i: number): number => T0 + i * 60_000
        for (let i = 0; i < 45; i++) {
            recordError("renderer", { source: "s", message: `e${i}` }, at(i))
        }
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.incomplete.some((s) => /older error/.test(s))).toBe(true)
        expect(res.text).toContain("Incomplete")
        expect(res.text).toMatch(/- \d+ older errors were dropped/)
    })

    it("says nothing was left out when nothing was", async () => {
        writeFileSync(settingsFile(), JSON.stringify({ terminal: { shell: "powershell" }, agents: [] }))
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.incomplete).toEqual([])
        expect(res.text).toContain("nothing was left out of this record")
    })

    it("reports rate-limited reports rather than hiding them", async () => {
        for (let i = 0; i < 60; i++) recordError("renderer", { source: "s", message: `u${i}` }, T0)
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.incomplete.some((s) => /refused by the rate limit/.test(s))).toBe(true)
    })

    it("distinguishes an absent settings file from an unreadable one", async () => {
        const missing = await buildRecord(tick())
        if (!missing.ok) throw new Error("unreadable")
        expect(missing.record.incomplete.some((s) => s.includes("has not been written yet"))).toBe(true)

        mkdirSync(settingsFile())
        const unreadable = await buildRecord(tick())
        if (!unreadable.ok) throw new Error("unreadable")
        expect(unreadable.record.incomplete.some((s) => s.includes("could not be read"))).toBe(true)
        expect(unreadable.record.agents).toBeNull()
        rmSync(settingsFile(), { recursive: true })
    })

    it("says the PATH was unread rather than calling every command absent", async () => {
        h.probe.pathHydrated = false
        h.probe.results = {
            a: { id: "a", command: "claude", token: "claude", state: "unknown" }
        }
        writeFileSync(
            settingsFile(),
            JSON.stringify({ agents: [{ id: "a", name: "Claude", command: "claude", runMode: "agent" }] })
        )
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.agents?.pathHydrated).toBe(false)
        expect(res.record.agents?.list[0].state).toBe("unknown")
        expect(res.record.incomplete.some((s) => s.includes("unchecked rather than absent"))).toBe(true)
        expect(res.text).not.toContain("not installed")
    })
})

describe("the record is allow-listed, not filtered", () => {
    it("carries exactly the documented top-level fields", async () => {
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(Object.keys(res.record).sort()).toEqual(
            [
                "agents",
                "app",
                "errors",
                "generatedAt",
                "incomplete",
                "lastFailedPtyExit",
                "lastPtyExit",
                "os",
                "shell",
                "versions"
            ].sort()
        )
    })

    it("names each process.versions key rather than spreading the object", async () => {
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(Object.keys(res.record.versions).sort()).toEqual(
            ["chrome", "electron", "modules", "node", "v8"].sort()
        )
    })

    it("does not carry a field someone added to settings.json", async () => {
        // The failure this defends: a struct grows a field somewhere else and a
        // record built by spreading starts copying it to a stranger's clipboard.
        writeFileSync(
            settingsFile(),
            JSON.stringify({
                terminal: { shell: "powershell", customShellPath: "" },
                agents: [],
                remote: { pairingToken: "TOP-SECRET-PAIRING-TOKEN" },
                gitAccounts: [{ pat: "ghp_shouldNeverAppearAnywhere0000000" }]
            })
        )
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        const blob = JSON.stringify(res.record) + res.text
        expect(blob).not.toContain("TOP-SECRET-PAIRING-TOKEN")
        expect(blob).not.toContain("ghp_shouldNeverAppearAnywhere0000000")
        expect(blob).not.toContain("gitAccounts")
    })

    it("redacts an agent command that carries a key, and keeps one that does not", async () => {
        h.probe.results = {
            a: { id: "a", command: "claude --dangerously-skip-permissions", token: "claude", state: "found", resolved: "C:\\Users\\Admin\\AppData\\Roaming\\npm\\claude.cmd" },
            b: { id: "b", command: "codex", token: "codex", state: "missing" }
        }
        writeFileSync(
            settingsFile(),
            JSON.stringify({
                agents: [
                    { id: "a", name: "Claude YOLO", command: "claude --dangerously-skip-permissions", runMode: "agent" },
                    { id: "b", name: "Codex", command: "codex", runMode: "agent" },
                    { id: "c", name: "dev", command: "npm run dev", runMode: "normal" }
                ]
            })
        )
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        // The command line is byte-identical, and so is the resolved path apart
        // from the segment that names its owner. F-3, 2026-09-10: this record is
        // pasted into a public issue tracker, so `redact` now folds the home
        // directory's owner segment and keeps everything that answers the
        // question ("found, under Roaming\\npm, as a .cmd shim"). See
        // PATH_RULES in src/main/redact.ts.
        expect(res.record.agents?.list[0].command).toBe("claude --dangerously-skip-permissions")
        expect(res.record.agents?.list[0].resolved).toBe(
            "C:\\Users\\[redacted:user]\\AppData\\Roaming\\npm\\claude.cmd"
        )
        // Normal-mode presets are counted, never given a state they cannot have.
        expect(res.record.agents?.list.length).toBe(2)
        expect(res.record.agents?.skippedNormalMode).toBe(1)
        expect(res.text).toContain("1 normal-mode preset is not probed")
    })
})

describe("the shell pair", () => {
    it("reports the configured setting and what main actually spawned", async () => {
        writeFileSync(settingsFile(), JSON.stringify({ terminal: { shell: "gitbash" } }))
        noteShellSpawn("C:\\Program Files\\Git\\bin\\bash.exe", ["-i", "-l"])
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.shell.configured).toBe("gitbash")
        expect(res.record.shell.resolved).toBe("C:\\Program Files\\Git\\bin\\bash.exe")
        expect(res.record.shell.resolvedArgs).toEqual(["-i", "-l"])
    })

    it("says no terminal has run rather than guessing a resolution", async () => {
        writeFileSync(settingsFile(), JSON.stringify({ terminal: { shell: "custom", customShellPath: "C:\\nu\\nu.exe" } }))
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.shell.resolved).toBeNull()
        expect(res.record.shell.customPath).toBe("C:\\nu\\nu.exe")
        expect(res.text).toContain("no terminal has been spawned in this session")
    })
})

describe("nothing is transmitted", () => {
    it("the rendered text carries no endpoint, no upload and says where it went", async () => {
        recordError("renderer", { source: "EditorPanel", message: "boom", componentStack: "at EditorPanel" }, T0)
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.text).toContain("Nothing here was sent anywhere")
        expect(res.text).not.toMatch(/https?:\/\//)
        expect(res.text).not.toMatch(/github\.com|mailto:|issues/i)
    })

    it("renders an error with its count, both timestamps and its stack", async () => {
        recordError("renderer", { source: "EditorPanel", message: "boom", componentStack: "at EditorPanel" }, T0)
        recordError("renderer", { source: "EditorPanel", message: "boom", componentStack: "at EditorPanel" }, T0 + 5)
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.text).toContain("[renderer/EditorPanel] x2")
        expect(res.text).toContain("at EditorPanel")
        expect(res.text).toContain("Errors (1 distinct)")
    })
})

describe("the report channel refuses instead of throwing, and cannot be steered", () => {
    it("answers a non-object payload with a refusal, not a TypeError", () => {
        // A guard that throws has not refused. This repo has shipped that shape
        // before, in a path guard that answered with a TypeError out of
        // `path.resolve` instead of a verdict.
        for (const payload of [undefined, null, "a string", 42, [], true]) {
            expect(() => reportIpc(payload, T0)).not.toThrow()
            expect(reportIpc(payload, T0)).toBe(false)
        }
        expect(existsSync(storePath())).toBe(false)
    })

    it("ignores every field it did not ask for", async () => {
        reportIpc(
            {
                source: "RegionBoundary",
                message: "boom",
                componentStack: "at Region",
                // Everything below is a caller trying to steer the sink.
                origin: "main",
                path: "C:\Windows\System32\drivers\etc\hosts",
                file: "../../evil.txt",
                count: 999,
                firstAt: 1,
                lastAt: 2
            },
            T0
        )
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        const e = res.record.errors[0]
        // The origin is main's, not the caller's: a compromised renderer must
        // not be able to attribute its error to the main process.
        expect(e.origin).toBe("renderer")
        expect(e.count).toBe(1)
        expect(e.firstAt).toBe(T0)
    })

    it("writes to crashes.jsonl and to nothing else in userData", () => {
        // The contract is "this writes one known file". A mock cannot show the
        // absence of a write, so the directory itself is the assertion.
        const before = readdirSync(h.dir).sort()
        reportIpc({ source: "s", message: "one" }, T0)
        const after = readdirSync(h.dir).sort()
        expect(after.filter((f) => !before.includes(f))).toEqual(["crashes.jsonl"])
    })

    it("accepts a well-formed report", () => {
        expect(reportIpc({ source: "ErrorBoundary", message: "real" }, T0)).toBe(true)
    })
})

/**
 * The blob itself. Every test below is about the exact string `res.text` — what
 * the clipboard receives and a stranger pastes into someone else's inbox.
 */

const NUL = String.fromCharCode(0)
const ESC = String.fromCharCode(27)
const LONE = String.fromCharCode(0xd800)

describe("the pasted text is a string a clipboard can hold", () => {
    it("carries no NUL, whatever a renderer reports", async () => {
        // The exploit: `clipboard:write` proves its write by reading the
        // clipboard back, and Electron's `writeText("a\0b")` reads back as
        // `"a"` — measured against a real Electron 38 clipboard on Windows. So
        // one NUL from `diagnostics:report` (fire-and-forget, renderer-callable,
        // no reply) makes the comparison fail for the life of the install: the
        // copy control says "Couldn't copy" forever. And it survives a restart,
        // because the entry is on disk. If the comparison had passed instead,
        // the user would have pasted a record silently cut off at that byte.
        reportIpc({ source: "ErrorBoundary", message: `boom${NUL}the rest of the record` }, T0)
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.text).not.toContain(NUL)
        expect(JSON.stringify(res.record)).not.toContain("u0000")
    })

    it("carries no ANSI escape and no lone surrogate", async () => {
        reportIpc({ source: "s", message: `red ${ESC}[31mDANGER${ESC}[0m` }, T0)
        reportIpc({ source: "s2", message: `half a char ${LONE} here` }, T0 + 1)
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.text).not.toContain(ESC)
        expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(res.text)).toBe(false)
    })

    it("carries no NUL that came from settings.json rather than from a report", async () => {
        // The same byte from the other direction. An agent running in a pane can
        // write settings.json, and the record reads it — so the guarantee has to
        // hold for every field, which is why it is applied once over the whole
        // rendered string rather than per call site.
        h.probe.results = { a: { id: "a", command: "claude", token: "claude", state: "found", resolved: "C:\\bin\\claude.cmd" } }
        writeFileSync(
            settingsFile(),
            JSON.stringify({
                terminal: { shell: "custom", customShellPath: `C:\\bin${NUL}\\pwsh.exe` },
                agents: [{ id: "a", name: `Claude${NUL}X`, command: "claude", runMode: "agent" }]
            })
        )
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.text).not.toContain(NUL)
    })
})

/**
 * The record's own layout is main's, not a caller's.
 *
 * `renderRecord` emitted `e.message` as a single interpolated line while
 * splitting and re-indenting `e.componentStack`. A message carrying newlines
 * therefore wrote unindented lines straight into the blob — enough to forge a
 * whole heading. The record's entire purpose is being an honest description of
 * the app; a caller that can write its headings can make it describe a
 * different app.
 */
describe("a reporter cannot forge the record's own sections", () => {
    it("indents every line of a multi-line message, so a second `Incomplete` cannot appear", async () => {
        reportIpc(
            {
                source: "RegionBoundary",
                message:
                    "innocuous\n\nIncomplete\n  nothing was left out of this record\n\nErrors (0 distinct)\n  none recorded"
            },
            T0
        )
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        const lines = res.text.split("\n")
        // Exactly one heading, and it is the one main wrote.
        expect(lines.filter((l) => l === "Incomplete").length).toBe(1)
        expect(lines.filter((l) => l === "  none recorded").length).toBe(0)
        // The forged text is still *there* — it is evidence — just demoted to
        // the indentation of a message body, where a reader can see whose it is.
        expect(res.text).toContain("    Incomplete")
    })

    it("cannot forge a second error header out of the source label", async () => {
        // `renderRecord` writes `[${origin}/${source}]`.
        reportIpc({ source: "x] x9999  first 1970 [main/kernel", message: "forged" }, T0)
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.text).not.toContain("[main/kernel]")
        expect(res.text).toContain("[renderer/x x9999 first 1970 main/kernel]")
    })

    it("cannot inject a line into the agent block from an agent name", async () => {
        h.probe.results = {
            a: { id: "a", command: "claude", token: "claude", state: "found", resolved: "C:\\bin\\claude.cmd" }
        }
        writeFileSync(
            settingsFile(),
            JSON.stringify({
                agents: [
                    {
                        id: "a",
                        name: "Claude\n  Fake Agent — evil --flag — found  C:\\evil.exe",
                        command: "claude",
                        runMode: "agent"
                    }
                ]
            })
        )
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.text).not.toContain("\n  Fake Agent")
        expect(res.record.agents?.list[0].name).not.toContain("\n")
    })
})

/**
 * Redaction on the way **out**, which `redact.ts` documented and the builder
 * did not do.
 *
 * `readEntries` handed the parsed JSON straight through, so a line already in
 * `crashes.jsonl` was never redacted again by the version of the redactor
 * running today, and a line written by anything other than the sink had never
 * been redacted at all. An agent in a pane can write that file: it already has
 * a shell, so this is no escalation — but it is a semi-trusted party choosing
 * the contents of a blob the user is about to paste to a stranger, which is an
 * exfiltration channel needing no network of its own.
 */
describe("nothing reaches the clipboard without a second pass", () => {
    it("redacts a credential planted in the log file by something that is not the sink", async () => {
        writeFileSync(
            storePath(),
            JSON.stringify({
                origin: "main",
                source: "kernel",
                message:
                    "PASSWORD=hunter2 and X-Api-Key: 8f3a9b2c1d4e5f60718293a4b5c6d7e8 and sk-ant-api03-PLANTEDPLANTEDPLANTED",
                count: 1,
                firstAt: T0,
                lastAt: T0
            }) + "\n"
        )
        resetSink()
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        for (const secret of ["hunter2", "8f3a9b2c1d4e5f60718293a4b5c6d7e8", "PLANTEDPLANTEDPLANTED"]) {
            expect(res.text, secret).not.toContain(secret)
        }
        // The names survive: "there was a PASSWORD here" is a fact a reader needs.
        expect(res.text).toContain("PASSWORD=")
    })

    it("bounds the record when the log holds an entry far over the caps", async () => {
        writeFileSync(
            storePath(),
            JSON.stringify({
                origin: "main",
                source: "kernel",
                message: "m".repeat(200_000),
                componentStack: "s".repeat(200_000),
                count: 1,
                firstAt: T0,
                lastAt: T0
            }) + "\n"
        )
        resetSink()
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(res.record.errors[0].message.length).toBe(MESSAGE_CAP)
        expect(res.record.errors[0].componentStack?.length).toBe(STACK_CAP)
        // And the record says it cut something, because a record that cut
        // something and looks whole is the lie this feature exists to remove.
        expect(res.record.incomplete.join(" ")).toContain("longer than the cap")
    })

    it("does not carry a field planted on a log line into the record object", async () => {
        writeFileSync(
            storePath(),
            JSON.stringify({
                origin: "main",
                source: "kernel",
                message: "real",
                count: 1,
                firstAt: T0,
                lastAt: T0,
                smuggled: "SMUGGLED-VALUE"
            }) + "\n"
        )
        resetSink()
        const res = await buildRecord(tick())
        if (!res.ok) throw new Error("unreadable")
        expect(JSON.stringify(res.record)).not.toContain("SMUGGLED-VALUE")
    })
})

/**
 * Fail-closed, and recover. `crashes.jsonl` being a directory is how a hostile
 * or clumsy party makes the store unreadable without deleting anything — the
 * answer has to be a refusal rather than an exception, and it has to stop being
 * a refusal the moment the file is readable again.
 */
describe("an unreadable store refuses, and the refusal is not permanent", () => {
    it("refuses rather than throwing when a directory sits at the store path", async () => {
        mkdirSync(storePath(), { recursive: true })
        resetSink()
        // No try/catch: a throw out of here fails this test, which is the
        // assertion. An exception is not a refusal.
        const res = await buildRecord(tick())
        expect(res.ok).toBe(false)
        if (res.ok) throw new Error("expected a refusal")
        expect(res.reason).toBe("unreadable")
    })

    it("answers with a record again once the store can be read", async () => {
        mkdirSync(storePath(), { recursive: true })
        resetSink()
        expect((await buildRecord(tick())).ok).toBe(false)
        rmSync(storePath(), { recursive: true })
        const res = await buildRecord(tick())
        expect(res.ok).toBe(true)
    })
})
