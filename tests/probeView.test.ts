import { describe, it, expect } from "vitest"
import type { ProbeReport, ProbeResult, ProbeState } from "../src/shared/probe"
import {
    cardMark,
    canLaunch,
    rowMark,
    launcherNotice,
    probeLine,
    pathUnreadable,
    probeRequests,
    switcherEmpty,
    type ProbeSubject
} from "../src/renderer/src/probeView"

// These pin the four states apart. Every one of them was, at some point in this
// app's history, collapsed into a neighbour - and the whole feature exists
// because "we couldn't check" rendered as "it isn't there" is a signal that
// lies, which is worse than no signal at all.

const agent = (id: string, command = id): ProbeSubject => ({ id, command, runMode: "agent" })
const normal = (id: string, command: string): ProbeSubject => ({ id, command, runMode: "normal" })

const res = (
    id: string,
    state: ProbeState,
    command = id,
    resolved?: string
): ProbeResult => ({ id, command, token: command.split(" ")[0], state, resolved })

const report = (results: ProbeResult[], pathHydrated = true): ProbeReport => ({
    results: Object.fromEntries(results.map((r) => [r.id, r])),
    pathHydrated,
    checkedAt: 1_700_000_000_000
})

describe("probeRequests", () => {
    it("submits every preset, normal-mode included - main does the filtering", () => {
        expect(probeRequests([agent("claude"), normal("dev", "npm run dev")])).toEqual([
            { id: "claude", command: "claude", runMode: "agent" },
            { id: "dev", command: "npm run dev", runMode: "normal" }
        ])
    })
})

describe("cardMark", () => {
    it("leaves a card unmarked before the first report exists", () => {
        // THE ~50ms CASE. No report is not a probe state: rendering the
        // `unknown` copy here would claim DevDeck couldn't read the PATH at a
        // moment when it hasn't tried.
        expect(cardMark(agent("claude"), null)).toBe("none")
    })

    it("leaves a normal-mode preset unmarked - it has no entry, which is not a state", () => {
        const r = report([res("claude", "found")])
        expect(cardMark(normal("dev", "npm run dev"), r)).toBe("none")
    })

    it("leaves a found card exactly as it was", () => {
        expect(cardMark(agent("claude"), report([res("claude", "found", "claude", "C:/x/claude.cmd")]))).toBe("none")
    })

    it("marks unknown as unchecked, never as missing", () => {
        expect(cardMark(agent("claude"), report([res("claude", "unknown")], false))).toBe("unchecked")
    })

    it("marks a missing command as not-on-path", () => {
        expect(cardMark(agent("claude"), report([res("claude", "missing")]))).toBe("not-on-path")
    })

    it("calls a blank command blank before any probe is consulted", () => {
        expect(cardMark(agent("blank1", ""), null)).toBe("no-command")
        expect(cardMark(agent("blank1", "   "), report([res("blank1", "blank", "   ")]))).toBe(
            "no-command"
        )
    })

    it("stops marking once the command has been edited since the walk", () => {
        // The report echoes the command back for exactly this: a mark that
        // described `claude` must not stay on a field now reading `claude-next`.
        const r = report([res("claude", "missing", "claude")])
        expect(cardMark(agent("claude", "claude-next"), r)).toBe("none")
    })

    it("drops the mark when a preset has been switched to normal mode", () => {
        const r = report([res("dev", "missing", "npm run dev")])
        expect(cardMark(normal("dev", "npm run dev"), r)).toBe("none")
    })
})

describe("canLaunch", () => {
    it("still launches a command that is not on the PATH", () => {
        // A PATH walk cannot see a shell alias or a shell function, so refusing
        // here would make DevDeck refuse something that works.
        const p = agent("claude")
        expect(canLaunch(p, cardMark(p, report([res("claude", "missing")])))).toBe(true)
    })

    it("still launches an unchecked command", () => {
        const p = agent("claude")
        expect(canLaunch(p, cardMark(p, report([res("claude", "unknown")], false)))).toBe(true)
    })

    it("refuses a blank agent command, the one state where refusing is honest", () => {
        const p = agent("blank1", "")
        expect(canLaunch(p, cardMark(p, null))).toBe(false)
    })

    it("does not refuse a blank normal preset - opening a plain shell is a real action", () => {
        const p = normal("shell", "")
        expect(canLaunch(p, cardMark(p, null))).toBe(true)
    })
})

describe("rowMark", () => {
    it("shows the resolved path as the tooltip of an on-PATH row", () => {
        const m = rowMark(agent("claude"), report([res("claude", "found", "claude", "C:/n/claude.cmd")]))
        expect(m).toMatchObject({ text: "on PATH", qualified: false, tip: "C:/n/claude.cmd" })
    })

    it("qualifies a not-on-PATH row and names what was looked up", () => {
        const m = rowMark(agent("claude"), report([res("claude", "missing")]))
        expect(m?.text).toBe("not on PATH")
        expect(m?.qualified).toBe(true)
        expect(m?.tip).toContain("claude")
    })

    it("says nothing is wrong with an unchecked row", () => {
        const m = rowMark(agent("claude"), report([res("claude", "unknown")], false))
        expect(m).toMatchObject({ text: "unchecked", qualified: false })
        expect(m?.tip).toContain("Nothing is wrong with this command")
    })

    it("marks neither a normal-mode preset, a blank one, nor a row with no report", () => {
        const r = report([res("claude", "missing")])
        expect(rowMark(normal("dev", "npm run dev"), r)).toBeNull()
        expect(rowMark(agent("blank1", ""), r)).toBeNull()
        expect(rowMark(agent("claude"), null)).toBeNull()
    })
})

describe("launcherNotice", () => {
    const three = [agent("claude"), agent("codex"), agent("gemini")]

    it("says nothing before the first report", () => {
        expect(launcherNotice(three, null)).toBeNull()
    })

    it("says nothing on a healthy machine", () => {
        expect(
            launcherNotice(three, report(three.map((p) => res(p.id, "found"))))
        ).toBeNull()
    })

    it("says nothing for a partial result - the per-card marks carry that", () => {
        // A bar for a partial condition is a wolf cry, and furniture by the
        // third launch.
        const r = report([res("claude", "found"), res("codex", "missing"), res("gemini", "missing")])
        expect(launcherNotice(three, r)).toBeNull()
    })

    it("names the absent commands when every one of them is absent", () => {
        const r = report(three.map((p) => res(p.id, "missing")))
        expect(launcherNotice(three, r)).toEqual({
            kind: "missing",
            tokens: ["claude", "codex", "gemini"],
            more: 0
        })
    })

    it("dedupes tokens and counts the overflow rather than listing everything", () => {
        const presets = [
            agent("a", "claude"),
            agent("b", "claude"),
            agent("c", "codex"),
            agent("d", "gemini"),
            agent("e", "cursor"),
            agent("f", "aider")
        ]
        const r = report(presets.map((p) => res(p.id, "missing", p.command)))
        expect(launcherNotice(presets, r)).toEqual({
            kind: "missing",
            tokens: ["claude", "codex", "gemini"],
            more: 2
        })
    })

    it("reports the hydration failure, not the commands, when the PATH could not be read", () => {
        const r = report(three.map((p) => res(p.id, "unknown")), false)
        expect(launcherNotice(three, r)).toEqual({ kind: "unhydrated" })
    })

    it("keys the unhydrated bar off pathHydrated even when one command resolved", () => {
        // An absolute-path token can answer `found` while hydration failed, so
        // "every result is unknown" is the wrong test for this sentence.
        const r = report(
            [res("claude", "found", "C:/tools/claude.exe"), res("codex", "unknown")],
            false
        )
        expect(launcherNotice([agent("claude", "C:/tools/claude.exe"), agent("codex")], r)).toEqual({
            kind: "unhydrated"
        })
    })

    it("prefers the all-missing sentence over the hydration one when nothing came back unknown", () => {
        // If every answer is `missing` then those commands WERE checked, and
        // "so these commands are unchecked" would be the untrue half.
        const r = report([res("a", "missing", "C:/x/one.exe"), res("b", "missing", "C:/x/two.exe")], false)
        const got = launcherNotice([agent("a", "C:/x/one.exe"), agent("b", "C:/x/two.exe")], r)
        expect(got).toMatchObject({ kind: "missing" })
    })

    it("says nothing when there is nothing to report on", () => {
        expect(launcherNotice([normal("dev", "npm run dev")], report([]))).toBeNull()
        expect(launcherNotice([agent("blank1", "")], report([res("blank1", "blank", "")]))).toBeNull()
        expect(launcherNotice([], report([], false))).toBeNull()
    })
})

describe("probeLine", () => {
    const three = [agent("claude"), agent("codex"), agent("gemini")]

    it("says nothing until the first report lands", () => {
        expect(probeLine(three, null)).toBeNull()
    })

    it("lists what was found, capped at three with a plain overflow count", () => {
        const presets = [...three, agent("cursor"), agent("aider")]
        const r = report(presets.map((p) => res(p.id, "found")))
        expect(probeLine(presets, r)).toEqual({
            kind: "found",
            names: ["claude", "codex", "gemini"],
            more: 2
        })
    })

    it("uses the found row for a found + missing mix", () => {
        const r = report([res("claude", "found"), res("codex", "missing"), res("gemini", "missing")])
        expect(probeLine(three, r)).toMatchObject({ kind: "found", names: ["claude"] })
    })

    it("reports none found when nothing resolved", () => {
        expect(probeLine(three, report(three.map((p) => res(p.id, "missing"))))).toEqual({
            kind: "none-found"
        })
    })

    it("blames the unreadable PATH rather than the commands", () => {
        expect(probeLine(three, report(three.map((p) => res(p.id, "unknown")), false))).toEqual({
            kind: "unhydrated"
        })
    })

    it("says so when there are no agent commands at all", () => {
        expect(probeLine([normal("dev", "npm run dev")], report([]))).toEqual({ kind: "no-presets" })
        expect(probeLine([], null)).toEqual({ kind: "no-presets" })
    })

    it("makes no claim about a mix no single sentence describes", () => {
        // One relative-path command (unknown, hydration fine) and one absent:
        // "none were found" is false and "not checked" is false, so the honest
        // answer on a screen with no cards to qualify it is silence.
        const presets = [agent("rel", "./bin/agent"), agent("codex")]
        const r = report([res("rel", "unknown", "./bin/agent"), res("codex", "missing")])
        expect(probeLine(presets, r)).toBeNull()
    })
})

describe("pathUnreadable", () => {
    it("is false before there is a report, and true only on a real hydration failure", () => {
        expect(pathUnreadable(null)).toBe(false)
        expect(pathUnreadable(report([], true))).toBe(false)
        expect(pathUnreadable(report([], false))).toBe(true)
    })
})

describe("switcherEmpty", () => {
    it("distinguishes an empty list from zero matches", () => {
        // "No matching projects." for an empty workspace was absent rendered as
        // zero - the house rule broken in a stranger's first thirty seconds.
        expect(switcherEmpty(0, "")).toEqual({ kind: "no-projects" })
        expect(switcherEmpty(0, "api")).toEqual({ kind: "no-projects" })
        expect(switcherEmpty(4, "api")).toEqual({ kind: "no-match", query: "api" })
        expect(switcherEmpty(4, "")).toEqual({ kind: "none-to-show" })
    })
})

describe("the copy rule", () => {
    it("never says a command is not installed", () => {
        // A PATH walk cannot see an alias or a shell function; telling someone
        // their tool is not installed when it is would be the most expensive
        // sentence in the app.
        const tips = [
            rowMark(agent("claude"), report([res("claude", "missing")]))?.tip,
            rowMark(agent("claude"), report([res("claude", "unknown")], false))?.tip
        ].join(" ")
        expect(tips).not.toMatch(/install/i)
    })

    it("says not on PATH, never missing", () => {
        const m = rowMark(agent("claude"), report([res("claude", "missing")]))
        expect(m?.text).toBe("not on PATH")
    })
})
