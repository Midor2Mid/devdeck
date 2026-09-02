import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { firstToken, probeCommand, probeRequests } from "../src/main/which"
import {
    extractDelimited,
    hydrateShellEnv,
    hydrationCommand,
    invalidateShellEnv,
    probe,
    type HydrationCommand,
    type Marks,
    type RunShell
} from "../src/main/shellPath"
import type { ProbeRequest } from "../src/shared/probe"

/** A PATH directory with the given files in it. */
function dirWith(...files: string[]): string {
    const d = mkdtempSync(join(tmpdir(), "probe-"))
    for (const f of files) writeFileSync(join(d, f), "shim")
    return d
}

const WIN = { platform: "win32" as NodeJS.Platform, pathext: ".COM;.EXE;.BAT;.CMD" }
const POSIX = { platform: "linux" as NodeJS.Platform }

describe("firstToken", () => {
    it("takes only the first token of a command line", () => {
        expect(firstToken("claude --dangerously-skip-permissions")).toBe("claude")
        expect(firstToken("  npm   run dev ")).toBe("npm")
    })

    it("unwraps a quoted first token so a path with spaces stays one token", () => {
        expect(firstToken('"C:\\Program Files\\ai\\claude.cmd" --continue')).toBe(
            "C:\\Program Files\\ai\\claude.cmd"
        )
        expect(firstToken("'/opt/my agents/claude' resume")).toBe("/opt/my agents/claude")
    })

    it("answers empty for a blank command", () => {
        expect(firstToken("")).toBe("")
        expect(firstToken("   \t \n ")).toBe("")
    })
})

describe("blank commands are their own answer", () => {
    it("is `blank`, not `missing`, and carries no resolved path", () => {
        for (const cmd of ["", " ", "\t\n  "]) {
            const r = probeCommand(cmd, { path: "/usr/bin", ...POSIX })
            expect(r.state).toBe("blank")
            expect(r.token).toBe("")
            expect(r.resolved).toBeUndefined()
        }
    })

    it("stays `blank` when PATH hydration failed, because it never needed a PATH", () => {
        // The design decides `blank` before the probe is consulted: it is a fact
        // about the preset, and the only state that refuses to launch. A
        // hydration failure must not turn it into `unknown`.
        expect(probeCommand("  ", { path: null, ...POSIX }).state).toBe("blank")
    })
})

describe("the PATHEXT walk (Windows)", () => {
    it("resolves a bare `claude` to a directory holding only claude.cmd", () => {
        // The single most likely real-world false negative: a global npm install
        // on Windows writes `claude.cmd` (and `claude.ps1`) and nothing named
        // exactly `claude`, so a bare-name stat would report `missing` for a
        // correctly installed CLI.
        const dir = dirWith("claude.cmd")
        const r = probeCommand("claude --continue", { path: dir, ...WIN })
        expect(r.state).toBe("found")
        expect(r.token).toBe("claude")
        expect(r.resolved!.toLowerCase().endsWith("claude.cmd")).toBe(true)
    })

    it("resolves a bare name to a .ps1 shim, which PATHEXT does not list", () => {
        // PowerShell adds .ps1 to its own command discovery, and panes run
        // PowerShell — so a .ps1-only shim runs and must not read as missing.
        const dir = dirWith("gemini.ps1")
        expect(probeCommand("gemini", { path: dir, ...WIN }).state).toBe("found")
    })

    it("does not double-extend a token that already carries a launchable extension", () => {
        const dir = dirWith("codex.cmd")
        const r = probeCommand("codex.cmd", { path: dir, ...WIN })
        expect(r.state).toBe("found")
        expect(r.resolved!.toLowerCase().endsWith("codex.cmd")).toBe(true)
    })

    it("does not report an extension-less file as found on Windows", () => {
        // PowerShell will not execute it, so `found` would be a claim about
        // something that cannot run.
        const dir = dirWith("claude")
        expect(probeCommand("claude", { path: dir, ...WIN }).state).toBe("missing")
    })

    it("falls back to the standard PATHEXT set when the shell reported none", () => {
        const dir = dirWith("claude.CMD")
        expect(probeCommand("claude", { path: dir, platform: "win32" }).state).toBe("found")
    })
})

describe("missing", () => {
    it("is only reachable with a hydrated PATH in hand, and carries no path", () => {
        const dir = dirWith("something-else.cmd")
        const r = probeCommand("claude", { path: dir, ...WIN })
        expect(r.state).toBe("missing")
        expect(r.resolved).toBeUndefined()
    })

    it("survives unreadable and junk PATH entries instead of aborting the walk", () => {
        const good = dirWith("claude.cmd")
        const path = [
            "",
            "   ",
            join(good, "does-not-exist"),
            '"' + good + '"', // installers quote entries
            ""
        ].join(";")
        expect(probeCommand("claude", { path, ...WIN }).state).toBe("found")
    })
})

describe("unknown", () => {
    it("is the answer when hydration failed — never missing, never found", () => {
        // `process.env.PATH` in this test process certainly resolves *something*
        // (node, npm). If the walk ever consulted main's own environment this
        // would come back `found`, which is the exact defect the module exists
        // to prevent.
        for (const cmd of ["node", "npm", "claude"]) {
            const r = probeCommand(cmd, { path: null })
            expect(r.state).toBe("unknown")
            expect(r.resolved).toBeUndefined()
        }
    })

    it("is the answer for a relative path, whose base directory is per-project", () => {
        for (const cmd of ["./bin/claude", "bin/claude", "../tools/claude.exe"]) {
            expect(probeCommand(cmd, { path: "/usr/bin", ...POSIX }).state).toBe("unknown")
        }
        expect(probeCommand(".\\bin\\claude", { path: "C:\\Windows", ...WIN }).state).toBe(
            "unknown"
        )
        // Drive-relative: same problem, same answer.
        expect(probeCommand("C:claude", { path: "C:\\Windows", ...WIN }).state).toBe("unknown")
    })
})

describe("absolute and ~ tokens", () => {
    it("stats an absolute token directly, with no PATH at all", () => {
        const dir = dirWith("claude.cmd")
        const hit = probeCommand(`"${join(dir, "claude.cmd")}" --continue`, { path: null, ...WIN })
        expect(hit.state).toBe("found")
        const miss = probeCommand(join(dir, "nope.cmd"), { path: null, ...WIN })
        expect(miss.state).toBe("missing")
        expect(miss.resolved).toBeUndefined()
    })

    it("expands a leading ~", () => {
        const home = mkdtempSync(join(tmpdir(), "home-"))
        mkdirSync(join(home, "bin"))
        writeFileSync(join(home, "bin", "claude.cmd"), "shim")
        const r = probeCommand("~/bin/claude.cmd", { path: null, home, ...WIN })
        expect(r.state).toBe("found")
        expect(r.token.startsWith("~")).toBe(false)
    })
})

describe("POSIX execute bit", () => {
    it.skipIf(process.platform === "win32")(
        "does not call a non-executable file on the PATH found",
        () => {
            const dir = dirWith("claude")
            chmodSync(join(dir, "claude"), 0o644)
            expect(probeCommand("claude", { path: dir, ...POSIX }).state).toBe("missing")
            chmodSync(join(dir, "claude"), 0o755)
            expect(probeCommand("claude", { path: dir, ...POSIX }).state).toBe("found")
        }
    )
})

describe("probeRequests", () => {
    const requests = (dir: string): ProbeRequest[] => [
        { id: "claude", command: "claude", runMode: "agent" },
        { id: "claude-yolo", command: "claude --dangerously-skip-permissions", runMode: "agent" },
        { id: "blank1", command: "", runMode: "agent" },
        { id: "gone", command: "nosuchagent", runMode: "agent" },
        { id: "dev", command: "npm run dev", runMode: "normal" },
        { id: "build", command: join(dir, "claude.cmd"), runMode: "normal" }
    ]

    it("gives a normal-mode preset no entry at all — not `unknown`", () => {
        // A shell line has no binary to look up: probing `npm run dev` would
        // score `npm`, and `cd api && go run .` would read as absent. Absent
        // from the map is the only answer that does not lie about a shell line.
        const dir = dirWith("claude.cmd")
        const res = probeRequests(requests(dir), { path: dir, ...WIN })
        expect(res.dev).toBeUndefined()
        expect(res.build).toBeUndefined()
        expect(Object.keys(res).sort()).toEqual(["blank1", "claude", "claude-yolo", "gone"])
    })

    it("keys by preset id and echoes the submitted command", () => {
        const dir = dirWith("claude.cmd")
        const res = probeRequests(requests(dir), { path: dir, ...WIN })
        expect(res.claude.state).toBe("found")
        expect(res.claude.id).toBe("claude")
        expect(res.claude.command).toBe("claude")
        // Same first token, different command line: one lookup, two results,
        // each echoing its own preset.
        expect(res["claude-yolo"].state).toBe("found")
        expect(res["claude-yolo"].command).toBe("claude --dangerously-skip-permissions")
        expect(res["claude-yolo"].resolved).toBe(res.claude.resolved)
        expect(res.blank1.state).toBe("blank")
        expect(res.gone.state).toBe("missing")
    })

    it("attaches a resolved path only to found results", () => {
        const dir = dirWith("claude.cmd")
        const res = probeRequests(requests(dir), { path: dir, ...WIN })
        for (const r of Object.values(res)) {
            if (r.state === "found") expect(typeof r.resolved).toBe("string")
            else expect(r.resolved).toBeUndefined()
        }
    })
})

describe("hydrationCommand", () => {
    const marks: Marks = { begin: "B-1", mid: "M-1", end: "E-1" }

    it("asks PowerShell for the profile's PATH and never passes -NoProfile", () => {
        const cmd = hydrationCommand("win32", marks)
        expect(cmd.file).toBe("powershell.exe")
        expect(cmd.args).toContain("-NoLogo")
        expect(cmd.args).toContain("-NonInteractive")
        expect(cmd.args).toContain("-EncodedCommand")
        // Capturing the profile's effect on PATH is the entire point of the
        // probe. `-NoProfile` would make this a slow way to read process.env.
        expect(cmd.args).not.toContain("-NoProfile")
        expect(cmd.args).not.toContain("-Command")
    })

    it("encodes the script, so no quoting survives to be eaten on the way in", () => {
        const cmd = hydrationCommand("win32", marks)
        const script = Buffer.from(cmd.args[cmd.args.length - 1], "base64").toString("utf16le")
        expect(script).toContain("$env:PATH")
        expect(script).toContain("$env:PATHEXT")
        expect(script).toContain("B-1")
        expect(script).toContain("M-1")
        expect(script).toContain("E-1")
        // Not Write-Output: PowerShell's formatter wraps a ~2000-char PATH at
        // 120 columns when stdout is redirected.
        expect(script).toContain("[Console]::Out.WriteLine")
        expect(script).not.toContain("Write-Output")
    })

    it("uses a login shell on POSIX, and not an interactive one", () => {
        const cmd = hydrationCommand("linux", marks)
        expect(cmd.args[0]).toBe("-l")
        expect(cmd.args[1]).toBe("-c")
        expect(cmd.args).not.toContain("-i")
        expect(cmd.args[2]).toContain('"$PATH"')
    })

    it("refuses a delimiter it did not generate", () => {
        // The delimiters are the only strings in the module interpolated into a
        // shell script. This is the guard that keeps them generated.
        expect(() => hydrationCommand("win32", { ...marks, begin: '"; rm -rf /; #' })).toThrow()
        expect(() => hydrationCommand("linux", { ...marks, end: "'; whoami; '" })).toThrow()
    })
})

describe("extractDelimited", () => {
    // Realistic markers: the production ones carry a random hex tag precisely so
    // that nothing a profile prints can collide with them. A single letter would
    // match the "M" in "Microsoft" and this test would be testing the banner.
    const B = "DDPATHBEGIN-A1"
    const M = "DDPATHMID-A1"
    const E = "DDPATHEND-A1"
    const out = (path: string, ext = ".COM;.EXE"): string =>
        [
            "Windows PowerShell",
            "Copyright (C) Microsoft Corporation.",
            "WARNING: a profile printed this",
            B,
            path,
            M,
            ext,
            E,
            "trailing noise"
        ].join("\r\n")

    it("ignores a profile's banner, MOTD and warnings on both sides", () => {
        expect(extractDelimited(out("C:\\a;C:\\b"), B, M)).toBe("C:\\a;C:\\b")
        expect(extractDelimited(out("C:\\a"), M, E)).toBe(".COM;.EXE")
    })

    it("refuses a truncated stream instead of returning half a PATH", () => {
        // The antivirus-kill shape: the shell died after printing the opening
        // marker and part of the value. A truncated PATH would produce
        // confident, wrong `missing` answers, so no closing marker means no
        // answer at all.
        expect(extractDelimited(`noise\r\n${B}\r\nC:\\a;C:\\part`, B, M)).toBeNull()
        expect(extractDelimited("", B, M)).toBeNull()
        expect(extractDelimited(`${B}\r\n${M}\r\n`, B, M)).toBeNull() // empty payload
    })

    it("refuses output that never reached our marker", () => {
        expect(extractDelimited("some unrelated program output", B, M)).toBeNull()
    })

    it("rejoins a wrapped value rather than dropping part of it", () => {
        // `[Console]::Out.WriteLine` emits one line, so more than one means
        // something downstream wrapped it. Joining cannot lose a PATH entry;
        // picking one line could.
        expect(extractDelimited(`${B}\nC:\\one;\nC:\\two\n${M}`, B, M)).toBe("C:\\one;C:\\two")
    })
})

describe("hydrateShellEnv", () => {
    const good: RunShell = async (cmd) => {
        const script =
            cmd.file === "powershell.exe"
                ? Buffer.from(cmd.args[cmd.args.length - 1], "base64").toString("utf16le")
                : cmd.args[2]
        const [begin] = /DDPATHBEGIN-[0-9A-F]+/.exec(script) ?? []
        const [mid] = /DDPATHMID-[0-9A-F]+/.exec(script) ?? []
        const [end] = /DDPATHEND-[0-9A-F]+/.exec(script) ?? []
        return `banner\n${begin}\nC:\\bin;C:\\tools\n${mid}\n.EXE;.CMD\n${end}\n`
    }

    it("returns the shell's PATH and PATHEXT", async () => {
        expect(await hydrateShellEnv(good, "win32")).toEqual({
            path: "C:\\bin;C:\\tools",
            pathext: ".EXE;.CMD"
        })
    })

    it("returns null when the shell is killed outright", async () => {
        // Avast kills spawned PowerShell on the author's machine (exit
        // 0xC0000409). This is a real, expected path, not an error case.
        const killed: RunShell = async () => {
            throw Object.assign(new Error("Command failed"), { code: 3221225477 })
        }
        expect(await hydrateShellEnv(killed, "win32")).toBeNull()
    })

    it("returns null for a shell that produced nothing, or nothing usable", async () => {
        expect(await hydrateShellEnv(async () => "", "win32")).toBeNull()
        expect(await hydrateShellEnv(async () => "the term is not recognized", "win32")).toBeNull()
    })

    it("does not treat a missing PATHEXT as a failed hydration", async () => {
        const noExt: RunShell = async (cmd) => {
            const script = cmd.args[2]
            const [begin] = /DDPATHBEGIN-[0-9A-F]+/.exec(script) ?? []
            const [mid] = /DDPATHMID-[0-9A-F]+/.exec(script) ?? []
            const [end] = /DDPATHEND-[0-9A-F]+/.exec(script) ?? []
            return `${begin}\n/usr/bin:/bin\n${mid}\n\n${end}\n`
        }
        expect(await hydrateShellEnv(noExt, "linux")).toEqual({
            path: "/usr/bin:/bin",
            pathext: undefined
        })
    })

    it("fails without spawning when DEVDECK_FORCE_PATH_UNKNOWN is set", async () => {
        // The dev-only seam that makes the `unknown` state observable in the
        // real UI, since the genuine trigger (an antivirus kill) cannot be
        // provoked on demand.
        const run = vi.fn(good)
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        process.env.DEVDECK_FORCE_PATH_UNKNOWN = "1"
        try {
            expect(await hydrateShellEnv(run, "win32")).toBeNull()
            expect(run).not.toHaveBeenCalled()
            // Never silent: the switch announces itself in the log.
            expect(warn).toHaveBeenCalled()
        } finally {
            delete process.env.DEVDECK_FORCE_PATH_UNKNOWN
            warn.mockRestore()
        }
    })
})

describe("probe (the IPC entry point)", () => {
    beforeEach(() => invalidateShellEnv())
    afterEach(() => {
        delete process.env.DEVDECK_FORCE_PATH_UNKNOWN
        invalidateShellEnv()
    })

    const dir = dirWith("claude.cmd")
    const hydrated: RunShell = async (cmd: HydrationCommand) => {
        const script =
            cmd.file === "powershell.exe"
                ? Buffer.from(cmd.args[cmd.args.length - 1], "base64").toString("utf16le")
                : cmd.args[2]
        const [begin] = /DDPATHBEGIN-[0-9A-F]+/.exec(script) ?? []
        const [mid] = /DDPATHMID-[0-9A-F]+/.exec(script) ?? []
        const [end] = /DDPATHEND-[0-9A-F]+/.exec(script) ?? []
        return `${begin}\n${dir}\n${mid}\n.COM;.EXE;.BAT;.CMD\n${end}\n`
    }
    const presets: ProbeRequest[] = [
        { id: "claude", command: "claude", runMode: "agent" },
        { id: "gone", command: "nosuchagent-xyz", runMode: "agent" },
        { id: "blank1", command: "", runMode: "agent" },
        { id: "dev", command: "npm run dev", runMode: "normal" }
    ]

    it("reports a hydrated PATH and one result per agent preset", async () => {
        const rep = await probe(presets, false, hydrated)
        expect(rep.pathHydrated).toBe(true)
        expect(rep.results.claude.state).toBe("found")
        expect(rep.results.gone.state).toBe("missing")
        expect(rep.results.blank1.state).toBe("blank")
        expect(rep.results.dev).toBeUndefined()
        expect(rep.checkedAt).toBeGreaterThan(0)
    })

    it("answers unknown for everything when hydration fails, and says so", async () => {
        process.env.DEVDECK_FORCE_PATH_UNKNOWN = "1"
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const rep = await probe(presets, false, hydrated)
        expect(rep.pathHydrated).toBe(false)
        expect(rep.results.claude.state).toBe("unknown")
        expect(rep.results.gone.state).toBe("unknown")
        // A blank command is still blank: it never needed a PATH.
        expect(rep.results.blank1.state).toBe("blank")
        for (const r of Object.values(rep.results)) {
            expect(r.state).not.toBe("found")
            expect(r.state).not.toBe("missing")
        }
        vi.restoreAllMocks()
    })

    it("holds the invariant: an unhydrated report never claims found or missing", async () => {
        // Stated as an invariant because this is the claim the whole feature
        // rests on, and it must hold no matter why hydration failed.
        const rep = await probe(presets, false, async () => "garbage output")
        expect(rep.pathHydrated).toBe(false)
        for (const r of Object.values(rep.results)) {
            expect(["unknown", "blank"]).toContain(r.state)
        }
    })

    it("spawns the shell once per process, and again only on an explicit refresh", async () => {
        const run = vi.fn(hydrated)
        await probe(presets, false, run)
        await probe(presets, false, run)
        expect(run).toHaveBeenCalledTimes(1)
        await probe(presets, true, run)
        expect(run).toHaveBeenCalledTimes(2)
    })

    it("keeps failing the same way on a refresh that fails again", async () => {
        // The design requires the `unknown` bar to stay standing rather than
        // fade or turn into a `missing` bar: the app still does not know.
        const run = vi.fn(async () => "")
        expect((await probe(presets, false, run)).pathHydrated).toBe(false)
        expect((await probe(presets, true, run)).pathHydrated).toBe(false)
        expect(run).toHaveBeenCalledTimes(2)
    })

    it("trusts nothing about the shape that arrives over IPC", async () => {
        expect((await probe(undefined, false, hydrated)).results).toEqual({})
        expect((await probe("not an array", false, hydrated)).results).toEqual({})
        const junk = await probe(
            [null, { id: 7, command: 42, runMode: "agent" }, { id: "ok", runMode: "agent" }],
            false,
            hydrated
        )
        // A malformed entry is answered `blank`, never dropped silently and
        // never handed to the walk as a command.
        expect(junk.results.ok.state).toBe("blank")
        expect(Object.values(junk.results).every((r) => r.state === "blank")).toBe(true)
    })

    it("caps how many presets one call can ask about", async () => {
        const many: ProbeRequest[] = Array.from({ length: 200 }, (_v, i) => ({
            id: `p${i}`,
            command: "claude",
            runMode: "agent"
        }))
        const rep = await probe(many, false, hydrated)
        expect(Object.keys(rep.results).length).toBe(64)
    })
})
