import { describe, it, expect, beforeEach, vi } from "vitest"
import { mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"

import { probeCommand } from "../src/main/which"
import {
    invalidateShellEnv,
    probe,
    type HydrationCommand,
    type RunShell
} from "../src/main/shellPath"
import type { ProbeRequest } from "../src/shared/probe"

// These specs create real temp directories and walk a real PATH with real
// `fs.stat` calls, which is the point — the hydration is stubbed but the
// resolution is not. Under a full 133-file run vitest schedules many files at
// once, and that filesystem work has repeatedly overrun the 5s default: the
// suite went red three separate times today on "finds a binary that exists only
// on the hydrated PATH", which passed alone every time.
//
// A flaky test in a release gate is worse than no test, because it teaches
// whoever sees it to re-run and stop reading. The budget is what was wrong, not
// the assertions, so the budget is what changes. Kept file-scoped rather than
// raised globally: a genuinely hung test elsewhere should still fail fast.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * The two acceptance criteria the suite proves only indirectly, written as the
 * criteria state them (po, 2026-09-03, criteria 1 and 5).
 *
 * Criterion 1 is the load-bearing one: a `found`/`missing` answer must come from
 * the PATH a *pane* will have, never from main's own `process.env.PATH`. Both
 * directions are asserted here against the same machine, so neither can pass by
 * accident of what happens to be installed.
 */

/** A hydration stub that answers with exactly `path`, parsing the real markers. */
function shellWith(path: string): RunShell {
    return async (cmd: HydrationCommand) => {
        const script = cmd.file.toLowerCase().endsWith("powershell.exe")
            ? Buffer.from(cmd.args[cmd.args.length - 1], "base64").toString("utf16le")
            : cmd.args[2]
        const [begin] = /DDPATHBEGIN-[0-9A-F]+/.exec(script) ?? []
        const [mid] = /DDPATHMID-[0-9A-F]+/.exec(script) ?? []
        const [end] = /DDPATHEND-[0-9A-F]+/.exec(script) ?? []
        return `${begin}\n${path}\n${mid}\n.COM;.EXE;.BAT;.CMD\n${end}\n`
    }
}

const WIN = process.platform === "win32"
/** A name main's own PATH cannot possibly hold. */
const SHELL_ONLY = "qa-shell-only-tool"

describe("criterion 1 - the answer comes from the shell's PATH, not main's", () => {
    beforeEach(() => invalidateShellEnv())

    it("finds a binary that exists only on the hydrated PATH", async () => {
        const dir = mkdtempSync(join(tmpdir(), "qa-shellpath-"))
        writeFileSync(join(dir, SHELL_ONLY + (WIN ? ".cmd" : "")), "shim")
        if (!WIN) require("fs").chmodSync(join(dir, SHELL_ONLY), 0o755)

        // Precondition: main's own environment cannot see it.
        const offMain = await probeCommand(SHELL_ONLY, { path: process.env.PATH ?? null })
        expect(offMain.state).toBe("missing")

        const rep = await probe(
            [{ id: "t", command: SHELL_ONLY, runMode: "agent" }] as ProbeRequest[],
            false,
            shellWith(dir)
        )
        expect(rep.pathHydrated).toBe(true)
        expect(rep.results.t.state).toBe("found")
        expect(dirname(rep.results.t.resolved ?? "")).toBe(dir)
    })

    it("reports missing for a binary main's PATH has and the hydrated PATH does not", async () => {
        // Something certainly on the PATH of the process running these tests.
        const onMain = WIN ? "node" : "sh"
        const viaMainPath = await probeCommand(onMain, {
            path: process.env.PATH ?? null,
            pathext: process.env.PATHEXT
        })
        expect(viaMainPath.state).toBe("found")

        const empty = mkdtempSync(join(tmpdir(), "qa-emptypath-"))
        const rep = await probe(
            [{ id: "t", command: onMain, runMode: "agent" }] as ProbeRequest[],
            false,
            shellWith(empty)
        )
        expect(rep.pathHydrated).toBe(true)
        // If the walk ever consulted process.env.PATH this would be `found`.
        expect(rep.results.t.state).toBe("missing")
        expect(rep.results.t.resolved).toBeUndefined()
    })
})

describe("criterion 5 - hydration spawns once, never once per preset", () => {
    beforeEach(() => invalidateShellEnv())

    it("spawns the same number of times for 1 preset and for 40", async () => {
        const dir = mkdtempSync(join(tmpdir(), "qa-spawn-"))
        const one = vi.fn(shellWith(dir))
        await probe([{ id: "a", command: "claude", runMode: "agent" }], false, one)
        expect(one).toHaveBeenCalledTimes(1)

        invalidateShellEnv()
        const many = vi.fn(shellWith(dir))
        const requests: ProbeRequest[] = Array.from({ length: 40 }, (_v, i) => ({
            id: `p${i}`,
            command: `tool-${i}`,
            runMode: "agent"
        }))
        const rep = await probe(requests, false, many)
        expect(Object.keys(rep.results).length).toBe(40)
        expect(many).toHaveBeenCalledTimes(1)
    })

    it("spawns nothing at all on a second call in the same process", async () => {
        const dir = mkdtempSync(join(tmpdir(), "qa-spawn2-"))
        const run = vi.fn(shellWith(dir))
        await probe([{ id: "a", command: "claude", runMode: "agent" }], false, run)
        await probe([{ id: "a", command: "claude", runMode: "agent" }], false, run)
        await probe([{ id: "a", command: "claude", runMode: "agent" }], false, run)
        expect(run).toHaveBeenCalledTimes(1)
    })
})

describe("criterion 6 - only a found result carries a path", () => {
    it("attaches an absolute path to found and nothing to missing or unknown", async () => {
        const dir = mkdtempSync(join(tmpdir(), "qa-resolved-"))
        writeFileSync(join(dir, "claude" + (WIN ? ".cmd" : "")), "shim")
        if (!WIN) require("fs").chmodSync(join(dir, "claude"), 0o755)

        const found = await probeCommand("claude", { path: dir })
        expect(found.state).toBe("found")
        expect(found.resolved && found.resolved.startsWith(dir)).toBe(true)

        const missing = await probeCommand("nosuch-qa-tool", { path: dir })
        expect(missing.state).toBe("missing")
        expect(missing.resolved).toBeUndefined()

        const unknown = await probeCommand("claude", { path: null })
        expect(unknown.state).toBe("unknown")
        expect(unknown.resolved).toBeUndefined()
    })
})
