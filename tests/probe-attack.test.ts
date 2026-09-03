/**
 * The command-presence probe, attacked.
 *
 * `probe:commands` is the only IPC channel that takes a renderer-supplied string
 * and walks the filesystem with it, and the string is a *command line*, so it is
 * expected to look like a path. Every test here is a thing that got through
 * before the guard that now stops it, or a thing that must keep being refused.
 *
 * The header case, and the reason this suite exists: on Windows a `stat` of
 * `\\host\share\x` is not a filesystem call. It opens an SMB session to a host
 * the caller chose, authenticates as the logged-in user, and blocks — measured
 * with `fs.statSync` on the author's machine at **26,664 ms for one unreachable
 * address**, uncancellable. The walk used to be `statSync` in the Electron main
 * process, so one preset command was a ~27 s freeze of every window, every pty
 * and the remote HTTP server, and `sanitize` allows 64 command strings per call.
 *
 * Who can reach it: the renderer is the only caller (contextIsolation, sandbox,
 * `nodeIntegration: false`), and it submits preset *commands*, which come from
 * `settings.json` in userData. So the reachable chain is anything that can write
 * that file — the user, or any process running as the user, which under the
 * current threat model includes an agent in a pane. The remote server exposes no
 * settings surface, so a paired phone cannot seed a preset. The no-attacker
 * version is the one that matters most: a corporate PATH with a UNC entry, off
 * VPN, froze main on every launcher mount.
 */

import { describe, it, expect, afterEach, vi } from "vitest"
import { mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import { probeCommand, probeRequests } from "../src/main/which"
import {
    hydrationCommand,
    invalidateShellEnv,
    isHydrating,
    probe,
    probeIpc,
    windowsPowerShell,
    type HydrationCommand,
    type Marks,
    type RunShell
} from "../src/main/shellPath"
import type { ProbeRequest } from "../src/shared/probe"

const WIN = { platform: "win32" as NodeJS.Platform, pathext: ".COM;.EXE;.BAT;.CMD" }
const POSIX = { platform: "linux" as NodeJS.Platform }

function dirWith(...files: string[]): string {
    const d = mkdtempSync(join(tmpdir(), "probe-atk-"))
    for (const f of files) writeFileSync(join(d, f), "shim")
    return d
}

describe("the UNC and device namespace is never statted", () => {
    // Every spelling of the same reach. A guard that catches one of these has
    // not caught the class: `//` is a legal UNC prefix to Win32, `\\?\UNC\` is
    // the long-path spelling of it, and `\\.\` is the device namespace.
    const reaches = [
        String.raw`\\10.255.255.1\share\claude.exe`,
        String.raw`\\attacker.example.com\s\claude.cmd`,
        String.raw`//10.255.255.1/share/claude.exe`,
        String.raw`\\?\UNC\10.255.255.1\share\claude.exe`,
        String.raw`\\?\C:\Windows\System32\cmd.exe`,
        String.raw`\\.\NUL`,
        // No extension, which is the expensive shape: `windowsCandidates`
        // multiplies it by every PATHEXT entry before the guard existed.
        String.raw`\\10.255.255.1\share\claude`,
        // Quoted, which is how a path with a space arrives, and which
        // `firstToken` unwraps before anything looks at the prefix.
        String.raw`"\\10.255.255.1\my share\claude.exe" --continue`,
        // Reached through `~` expansion rather than typed as a prefix.
        "~/../../../../nope"
    ]

    it("answers `unknown` for a UNC or device token, not `found` and not `missing`", async () => {
        for (const command of reaches.slice(0, 8)) {
            const r = await probeCommand(command, { path: null, ...WIN })
            expect(r.state, command).toBe("unknown")
            expect(r.resolved, command).toBeUndefined()
        }
    })

    it("refuses it on POSIX policy too, since the host doing the stat may be Windows", async () => {
        for (const command of reaches.slice(0, 8)) {
            const r = await probeCommand(command, { path: "/usr/bin", ...POSIX })
            expect(r.state, command).toBe("unknown")
        }
    })

    it("refuses `\\\\?\\C:\\…`, which is a real file and used to resolve `found`", async () => {
        // The device-namespace prefix is not a lookalike: `\\?\C:\Windows\
        // System32\cmd.exe` statted fine before the guard and came back `found`
        // with a `\\?\`-prefixed resolved path. It is refused because the same
        // prefix spells `\\?\UNC\host\…`, and a prefix guard that has to decide
        // which `\\?\` is safe is a parser, which is the thing that keeps losing.
        const r = await probeCommand(String.raw`\\?\C:\Windows\System32\cmd.exe`, {
            path: null,
            ...WIN
        })
        expect(r.state).toBe("unknown")
    })

    it("never hands a `\\\\`-prefixed path to fs, on any code path", async () => {
        // The state assertions above are the contract; this one is the mechanism.
        // A stat of a UNC path is a network egress from the main process that no
        // `guardRemote` sees, so the requirement is that fs never receives one —
        // not that the answer happens to be `unknown`.
        const fs = await import("fs")
        const statted: string[] = []
        const spy = vi.spyOn(fs.promises, "stat").mockImplementation(async (p) => {
            statted.push(String(p))
            throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
        })
        try {
            for (const command of reaches) {
                await probeCommand(command, {
                    // A UNC entry in the *PATH* is the same egress by another
                    // door, and it is what a corporate machine off VPN has.
                    path: [String.raw`\\10.255.255.1\tools`, "C:\\bin"].join(";"),
                    ...WIN
                })
            }
        } finally {
            spy.mockRestore()
        }
        // Asserted first, and it is not a formality: this spy watches
        // `fs.promises.stat`, so against the original synchronous walk it
        // recorded nothing and the UNC assertion below passed vacuously. A test
        // that cannot see the thing it polices is not a guard. This also pins
        // the walk to the async API — the property that keeps a slow stat off
        // the main process's event loop.
        expect(statted.length).toBeGreaterThan(0)
        expect(statted.filter((p) => /^[\\/]{2}/.test(p))).toEqual([])
    })
})

describe("a UNC PATH entry degrades the answer, it does not decide it", () => {
    it("answers `unknown` rather than `missing` when an entry was skipped", async () => {
        // `missing` is the claim that every place the command could have been
        // was looked at. A skipped entry retires that claim: the launcher must
        // not print NOT ON PATH about a directory nobody opened.
        const r = await probeCommand("claude", {
            path: [String.raw`\\10.255.255.1\tools`, dirWith("other.cmd")].join(";"),
            ...WIN
        })
        expect(r.state).toBe("unknown")
    })

    it("still answers `found` when a local entry actually has the file", async () => {
        // Failing closed must not mean failing useless: a real hit in a real
        // directory outranks the fact that some other entry was unreachable.
        const r = await probeCommand("claude", {
            path: [String.raw`\\10.255.255.1\tools`, dirWith("claude.cmd")].join(";"),
            ...WIN
        })
        expect(r.state).toBe("found")
        expect(r.resolved).toBeTruthy()
    })
})

describe("the walk runs under a deadline", () => {
    it("answers `unknown`, never `missing`, once the budget is spent", async () => {
        // A stat is uncancellable, so the deadline cannot bound one slow call —
        // it bounds how many a single IPC call may accumulate. What it must
        // never do is convert "we stopped looking" into "it is not installed".
        const dir = dirWith("claude.cmd")
        const r = await probeCommand("claude", { path: dir, budgetMs: 0, ...WIN })
        expect(r.state).toBe("unknown")
        expect(r.resolved).toBeUndefined()
    })

    it("shares one budget across the whole batch, not one per request", async () => {
        // 64 requests each granted the full budget is 64 budgets, which is not a
        // bound at all — it is the cap multiplied by it.
        const dir = dirWith("claude.cmd")
        const many: ProbeRequest[] = Array.from({ length: 8 }, (_v, i) => ({
            id: `p${i}`,
            command: `agent-${i}`,
            runMode: "agent"
        }))
        // A clock that advances 1ms per reading: the first lookup is inside a
        // 2ms budget, everything after it is not.
        let t = 0
        const res = await probeRequests(many, {
            path: dir,
            budgetMs: 2,
            now: () => t++,
            ...WIN
        })
        const states = Object.values(res).map((r) => r.state)
        expect(states).toContain("unknown")
        expect(states.filter((s) => s === "unknown").length).toBeGreaterThan(1)
        // And the degradation is one-directional: nothing became `missing`
        // because we ran out of time.
        expect(states.includes("found")).toBe(false)
    })

    it("keeps `blank` decided ahead of the clock", async () => {
        // `blank` is the one state the launcher refuses to launch on, and it is
        // a fact about the preset. A spent budget must not manufacture it, and
        // must not take it away either.
        const r = await probeCommand("   ", { path: null, budgetMs: 0, ...WIN })
        expect(r.state).toBe("blank")
    })
})

describe("the walk does not block the main process", () => {
    it("yields to the event loop while it stats", async () => {
        // The plain, no-attacker version of the denial: 64 distinct *missing*
        // commands is the expensive shape, because a miss cannot be answered
        // until every PATH entry × every PATHEXT candidate has been statted.
        // Measured against the author's real 62-entry PATH: 132 ms per miss,
        // so ~8.4 s at the 64-request cap — and `statSync` spends that in the
        // Electron main process, where it is every window, every pty and the
        // remote HTTP server, not just the probe.
        //
        // A duration assertion would be a flaky machine benchmark. What is
        // actually required is that the event loop keeps turning, so that is
        // what is asserted: with a synchronous walk no timer can fire until the
        // whole batch is done, and this counter reads exactly 0.
        // Kept small on purpose. The property is "a timer fires before the batch
        // finishes", and one `await` of a threadpool stat is enough to show it.
        // Reproducing the full 46,000-stat batch here only turned the test into a
        // five-second benchmark that flaked under a loaded suite.
        const path = Array.from({ length: 10 }, (_v, i) => `C:\\nope-${i}`).join(";")
        const many: ProbeRequest[] = Array.from({ length: 8 }, (_v, i) => ({
            id: `p${i}`,
            command: `nosuchagent-${i}`,
            runMode: "agent"
        }))
        let ticks = 0
        const timer = setInterval(() => {
            ticks += 1
        }, 1)
        try {
            await probeRequests(many, { path, ...WIN })
        } finally {
            clearInterval(timer)
        }
        expect(ticks).toBeGreaterThan(0)
    }, 20000)
})

describe("the hydration spawn", () => {
    afterEach(() => invalidateShellEnv())

    const dir = dirWith("claude.cmd")
    const slow = (): { run: RunShell; release: () => void; calls: () => number } => {
        let n = 0
        let release = (): void => {}
        const gate = new Promise<void>((r) => {
            release = r
        })
        const run: RunShell = async (cmd: HydrationCommand) => {
            n += 1
            await gate
            const script =
                cmd.file.toLowerCase().endsWith("powershell.exe")
                    ? Buffer.from(cmd.args[cmd.args.length - 1], "base64").toString("utf16le")
                    : cmd.args[2]
            const [begin] = /DDPATHBEGIN-[0-9A-F]+/.exec(script) ?? []
            const [mid] = /DDPATHMID-[0-9A-F]+/.exec(script) ?? []
            const [end] = /DDPATHEND-[0-9A-F]+/.exec(script) ?? []
            return `${begin}\n${dir}\n${mid}\n.COM;.EXE;.BAT;.CMD\n${end}\n`
        }
        return { run, release, calls: () => n }
    }

    it("names powershell.exe absolutely instead of searching PATH for it", () => {
        // libuv resolves a bare `powershell.exe` through `process.env.PATH` in
        // order. On the machine this was written on, PATH entry 3 is a
        // user-writable application directory sitting ahead of
        // C:\Windows\system32 — so a bare name is a hijack anything running as
        // the user can arm once and have DevDeck fire at every app-ready.
        const file = hydrationCommand("win32", {
            begin: "B-1",
            mid: "M-1",
            end: "E-1"
        } as Marks).file
        expect(file).toBe(windowsPowerShell())
        expect(/[\\/]/.test(file)).toBe(true)
        expect(file.toLowerCase()).toContain("system32")
    })

    it("collapses concurrent refreshes into one spawn", async () => {
        // `refresh` invalidates the cache, so 20 refreshes that arrive before
        // the first shell answered used to start 20 shells — each one running
        // the user's whole PowerShell profile. That is a fork bomb behind a
        // button, and `Re-check` is a button.
        const { run, release, calls } = slow()
        const presets: ProbeRequest[] = [{ id: "claude", command: "claude", runMode: "agent" }]
        const all = Promise.all(
            Array.from({ length: 20 }, () => probe(presets, true, run))
        )
        expect(isHydrating()).toBe(true)
        release()
        const reports = await all
        expect(calls()).toBe(1)
        // And every one of them still got a real answer, not a degraded one.
        for (const rep of reports) expect(rep.pathHydrated).toBe(true)
    })

    it("still re-spawns for a refresh that arrives after the last one settled", async () => {
        // The cap must not turn `Re-check` into a no-op: the whole point of the
        // control is that the user can make the app look again.
        const first = slow()
        first.release()
        const presets: ProbeRequest[] = [{ id: "claude", command: "claude", runMode: "agent" }]
        await probe(presets, false, first.run)
        await probe(presets, true, first.run)
        expect(first.calls()).toBe(2)
    })
})

describe("the IPC payload itself", () => {
    afterEach(() => invalidateShellEnv())

    const stub: RunShell = async () => ""

    it("refuses a payload that is not an object instead of throwing at it", async () => {
        // The handler used to destructure `{ requests, refresh }` in its
        // parameter list, so a payload of `null`, `undefined` or a string
        // answered with a TypeError — upstream of the `sanitize` written to
        // decide, and an exception is not a refusal. This repo has shipped that
        // exact shape before: a path guard that answered with a TypeError out of
        // `path.resolve` rather than a verdict.
        for (const payload of [null, undefined, "requests", 42, [], true]) {
            const rep = await probeIpc(payload, stub)
            expect(rep.results, JSON.stringify(payload ?? null)).toEqual({})
            expect(rep.pathHydrated).toBe(false)
        }
    })

    it("only treats a literal `true` as a refresh", async () => {
        // `refresh` is the one flag that spawns a shell, and `"false"`, `1`,
        // `{}` and `[]` are all truthy.
        let spawns = 0
        const counting: RunShell = async () => {
            spawns += 1
            return ""
        }
        await probeIpc({ requests: [] }, counting)
        expect(spawns).toBe(1)
        for (const refresh of ["false", 1, {}, [], "true"]) {
            await probeIpc({ requests: [], refresh }, counting)
        }
        expect(spawns).toBe(1)
        await probeIpc({ requests: [], refresh: true }, counting)
        expect(spawns).toBe(2)
    })
})

describe("what the probe is willing to tell a caller", () => {
    afterEach(() => invalidateShellEnv())

    it("is an existence oracle for launchable extensions, and returns real paths", async () => {
        // Stated as a test rather than left implicit, because it is the answer
        // to "what can an attacker learn". An absolute token is statted with no
        // PATH and no root confinement, and a hit comes back canonicalised by
        // `realpath.native` — real casing, real absolute path. So `found` plus
        // `resolved` discloses the existence and true spelling of any file that
        // carries a PATHEXT extension, anywhere on the machine, and it does so
        // even when hydration failed.
        //
        // That is accepted, not fixed: the only caller is a sandboxed,
        // context-isolated `file://` renderer, and anything executing there
        // already holds `fs:readDir`, `fs:allFiles`, `db:query` and `search:code`
        // on the same bridge. Narrowing the probe to project roots would be
        // false confinement while those exist, and would also break the feature
        // — an agent CLI lives in `%APPDATA%\npm`, not in a project.
        const dir = dirWith("claude.cmd")
        const r = await probeCommand(join(dir, "claude.cmd"), { path: null, ...WIN })
        expect(r.state).toBe("found")
        expect(r.resolved).toBeTruthy()
    })

    it("does not disclose the hydrated PATH itself", async () => {
        const dir = dirWith("claude.cmd")
        const run: RunShell = async (cmd) => {
            const script =
                cmd.file.toLowerCase().endsWith("powershell.exe")
                    ? Buffer.from(cmd.args[cmd.args.length - 1], "base64").toString("utf16le")
                    : cmd.args[2]
            const [begin] = /DDPATHBEGIN-[0-9A-F]+/.exec(script) ?? []
            const [mid] = /DDPATHMID-[0-9A-F]+/.exec(script) ?? []
            const [end] = /DDPATHEND-[0-9A-F]+/.exec(script) ?? []
            return `${begin}\n${dir};C:\\secret-tooling\n${mid}\n.CMD\n${end}\n`
        }
        const rep = await probe([{ id: "x", command: "nosuch-xyz", runMode: "agent" }], false, run)
        expect(JSON.stringify(rep)).not.toContain("secret-tooling")
    })
})
