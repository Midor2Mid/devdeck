import { describe, it, expect, beforeEach, vi } from "vitest"
import { mkdtempSync, writeFileSync, realpathSync } from "fs"
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

/**
 * A temp directory, canonicalised.
 *
 * `mkdtempSync` under `tmpdir()` returns the 8.3 SHORT form on a Windows CI
 * runner - `C:\Users\RUNNER~1\...` - while the PATH walk resolves the long
 * one, `C:\Users\runneradmin\...`. Comparing the two fails on the runner and
 * passes on any machine whose user name is short enough to have no 8.3 alias,
 * which is why this only ever broke in CI.
 */
function tempDir(prefix: string): string {
    return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
}

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
        const dir = tempDir("qa-shellpath-")
        writeFileSync(join(dir, SHELL_ONLY + (WIN ? ".cmd" : "")), "shim")
        if (!WIN) require("fs").chmodSync(join(dir, SHELL_ONLY), 0o755)

        // Precondition: main's own environment cannot see it.
        //
        // Retried, and NOT relaxed to "anything but found". `unknown` is a
        // legitimate answer - the probe asked and could not find out - and under
        // a full 134-file parallel run the PATH walk does occasionally answer it
        // (observed: 8.1s, then `unknown`, while the same spec takes 290ms alone).
        // But `unknown` does not establish this precondition: if we did not
        // manage to look at main's PATH, finding the shim via the hydrated PATH
        // proves nothing about WHICH path answered, which is the whole of
        // criterion 1. So the honest move is to ask again rather than to accept
        // a weaker answer and keep the assertion looking green.
        let offMain = await probeCommand(SHELL_ONLY, { path: process.env.PATH ?? null })
        for (let i = 0; i < 3 && offMain.state === "unknown"; i++) {
            offMain = await probeCommand(SHELL_ONLY, { path: process.env.PATH ?? null })
        }
        expect(offMain.state, "precondition: main's PATH must resolve this as absent").toBe(
            "missing"
        )

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
        // Retried for the same reason, and in the same way, as the precondition
        // in criterion 1's first spec above: under a full parallel run the PATH
        // walk occasionally times out and answers `unknown` rather than `found`.
        // That retry was added for one of this file's two preconditions and not
        // the other, and the suite grew past the threshold on 2026-09-10 (139
        // files -> 141) which is when this one started failing. One instance of
        // a class is not the class.
        //
        // The assertion is unchanged: `unknown` is still not accepted. If we
        // did not manage to resolve this on main's PATH, then "the hydrated
        // PATH does not have it" proves nothing about which PATH answered,
        // which is the whole point of the spec. Ask again; do not weaken.
        let viaMainPath = await probeCommand(onMain, {
            path: process.env.PATH ?? null,
            pathext: process.env.PATHEXT
        })
        for (let i = 0; i < 3 && viaMainPath.state === "unknown"; i++) {
            viaMainPath = await probeCommand(onMain, {
                path: process.env.PATH ?? null,
                pathext: process.env.PATHEXT
            })
        }
        expect(viaMainPath.state, "precondition: main's PATH must resolve this").toBe("found")

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
        const dir = tempDir("qa-resolved-")
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
