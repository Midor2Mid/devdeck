import { describe, it, expect, beforeEach, vi } from "vitest"
import { writeFileSync, existsSync, rmSync, mkdirSync } from "fs"
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

import { buildRecord, notePtyExit, noteShellSpawn, resetObservations } from "../src/main/diagnostics"
import { recordError, resetSink, storePath } from "../src/main/crashSink"

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
        // Byte-identical: the command line and the resolved path are the answer.
        expect(res.record.agents?.list[0].command).toBe("claude --dangerously-skip-permissions")
        expect(res.record.agents?.list[0].resolved).toBe("C:\\Users\\Admin\\AppData\\Roaming\\npm\\claude.cmd")
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
