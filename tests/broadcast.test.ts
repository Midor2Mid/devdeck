import { describe, it, expect } from "vitest"
import { groupTargets, presetSelection } from "../src/renderer/src/broadcast"
import { deckKeyStatus, type DeckKeyStatus } from "../src/renderer/src/deck"
import type { AnySession } from "../src/renderer/src/store"

function sess(over: Partial<AnySession>): AnySession {
    return {
        termId: "t",
        projectId: "p",
        projectName: "P",
        projectPath: "",
        tabName: "tab",
        sessionName: "s",
        agentId: "claude",
        badge: "CL",
        isAgent: true,
        status: "idle",
        ...over
    }
}

describe("groupTargets", () => {
    it("groups agent sessions by project in first-seen order", () => {
        const groups = groupTargets([
            sess({ termId: "a", projectId: "p1", projectName: "One" }),
            sess({ termId: "b", projectId: "p2", projectName: "Two" }),
            sess({ termId: "c", projectId: "p1", projectName: "One" })
        ])
        expect(groups.map((g) => g.projectId)).toEqual(["p1", "p2"])
        expect(groups[0].sessions.map((s) => s.termId)).toEqual(["a", "c"])
    })

    it("excludes non-agent sessions", () => {
        const groups = groupTargets([
            sess({ termId: "a", projectId: "p1" }),
            sess({ termId: "sh", projectId: "p1", isAgent: false })
        ])
        expect(groups[0].sessions.map((s) => s.termId)).toEqual(["a"])
    })
})

describe("presetSelection", () => {
    const list = [
        sess({ termId: "a", projectId: "p1", status: "idle" }),
        sess({ termId: "b", projectId: "p1", status: "working" }),
        sess({ termId: "c", projectId: "p2", status: "idle" }),
        sess({ termId: "sh", projectId: "p1", isAgent: false, status: "idle" })
    ]
    // Every session has a process behind it, and the derived status of such a
    // session IS its own status (deckKeyStatus) - so this resolver is exactly
    // what the presets used to read directly off `s.status`.
    const live = (s: AnySession): DeckKeyStatus => deckKeyStatus(s.status, undefined, undefined)

    it("all → every agent session (never shells)", () => {
        expect(presetSelection(list, "all", "p1", live)).toEqual(new Set(["a", "b", "c"]))
    })
    it("project → agent sessions in the active project", () => {
        expect(presetSelection(list, "project", "p1", live)).toEqual(new Set(["a", "b"]))
    })
    it("idle → agent sessions with idle status", () => {
        expect(presetSelection(list, "idle", "p1", live)).toEqual(new Set(["a", "c"]))
    })
    it("none → empty", () => {
        expect(presetSelection(list, "none", "p1", live)).toEqual(new Set())
    })

    /**
     * A preset resolves to SEND TARGETS, and nothing is listening behind a
     * session with no process.
     *
     * `Idle` was the worst of the three: a session usually reads `idle` after
     * its process dies, so the button offered to select precisely the sessions
     * that could not receive anything - and `All` / `This project` swept them
     * up too. Derived through `deckKeyStatus` from the two facts that make a
     * session dead, so this pins the presets to the same predicate the dot,
     * the chip and the "N running" count read.
     */
    describe("a session with no process is never a target", () => {
        // `c` is idle AND restored from the last run: the raw status the old
        // `Idle` preset read, and the derived one it now reads, disagree.
        const statusOf = (s: AnySession): DeckKeyStatus =>
            deckKeyStatus(s.status, undefined, s.termId === "c" ? "resume" : undefined)

        it("drops it from all", () => {
            expect(presetSelection(list, "all", "p1", statusOf)).toEqual(new Set(["a", "b"]))
        })

        it("drops it from idle, where its raw status said to select it", () => {
            expect(statusOf(list[2])).toBe("not-running")
            expect(list[2].status).toBe("idle")
            expect(presetSelection(list, "idle", "p1", statusOf)).toEqual(new Set(["a"]))
        })

        it("drops an exited one too, including a clean exit", () => {
            const exited = (s: AnySession): DeckKeyStatus =>
                deckKeyStatus(s.status, s.termId === "a" ? 0 : undefined, undefined)
            expect(presetSelection(list, "project", "p1", exited)).toEqual(new Set(["b"]))
        })
    })
})
