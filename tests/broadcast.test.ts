import { describe, it, expect } from "vitest"
import { groupTargets, presetSelection } from "../src/renderer/src/broadcast"
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
    it("all → every agent session (never shells)", () => {
        expect(presetSelection(list, "all", "p1")).toEqual(new Set(["a", "b", "c"]))
    })
    it("project → agent sessions in the active project", () => {
        expect(presetSelection(list, "project", "p1")).toEqual(new Set(["a", "b"]))
    })
    it("idle → agent sessions with idle status", () => {
        expect(presetSelection(list, "idle", "p1")).toEqual(new Set(["a", "c"]))
    })
    it("none → empty", () => {
        expect(presetSelection(list, "none", "p1")).toEqual(new Set())
    })
})
