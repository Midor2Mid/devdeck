import { describe, it, expect } from "vitest"
import { ruleMatches, routeAgent, type RoutingRule } from "../src/renderer/src/routing"

const agents = [{ id: "claude" }, { id: "claude-opus" }, { id: "codex" }]
const card = { title: "Fix the login redirect", projectId: "p1" }

function rule(over: Partial<RoutingRule>): RoutingRule {
    return { id: "r", enabled: true, kind: "title", pattern: "", agentId: "codex", ...over }
}

describe("ruleMatches", () => {
    it("matches a title substring case-insensitively", () => {
        expect(ruleMatches(rule({ kind: "title", pattern: "LOGIN" }), card)).toBe(true)
        expect(ruleMatches(rule({ kind: "title", pattern: "logout" }), card)).toBe(false)
    })

    it("matches a title regex", () => {
        expect(ruleMatches(rule({ kind: "titleRegex", pattern: "^Fix .*redirect$" }), card)).toBe(true)
    })

    it("treats an invalid regex as never matching", () => {
        // An inert rule is the safe failure. Matching everything would silently
        // reroute every dispatch, and throwing would do it on the path that
        // spends money.
        expect(ruleMatches(rule({ kind: "titleRegex", pattern: "([" }), card)).toBe(false)
    })

    it("matches a project by id, not by name", () => {
        expect(ruleMatches(rule({ kind: "project", pattern: "p1" }), card)).toBe(true)
        expect(ruleMatches(rule({ kind: "project", pattern: "P1" }), card)).toBe(false)
    })

    it("always matches for the always kind, whatever the pattern", () => {
        expect(ruleMatches(rule({ kind: "always", pattern: "" }), card)).toBe(true)
    })

    it("does not match an empty pattern for the text kinds", () => {
        // An empty substring matches everything in JS; that would turn a
        // half-typed rule into a catch-all.
        expect(ruleMatches(rule({ kind: "title", pattern: "" }), card)).toBe(false)
        expect(ruleMatches(rule({ kind: "titleRegex", pattern: "" }), card)).toBe(false)
    })
})

describe("routeAgent", () => {
    it("returns the first enabled matching rule and says which one", () => {
        const r = routeAgent(
            [
                rule({ id: "a", enabled: false, pattern: "login", agentId: "codex" }),
                rule({ id: "b", pattern: "login", agentId: "claude-opus" }),
                rule({ id: "c", pattern: "login", agentId: "codex" })
            ],
            card,
            agents,
            "claude"
        )
        expect(r).toEqual({ agentId: "claude-opus", ruleId: "b" })
    })

    it("skips a rule naming an agent that no longer exists", () => {
        // A dangling reference must not dispatch to nothing.
        const r = routeAgent(
            [
                rule({ id: "a", pattern: "login", agentId: "deleted-agent" }),
                rule({ id: "b", pattern: "login", agentId: "codex" })
            ],
            card,
            agents,
            "claude"
        )
        expect(r).toEqual({ agentId: "codex", ruleId: "b" })
    })

    it("falls back to the configured default with no ruleId", () => {
        expect(routeAgent([], card, agents, "claude-opus")).toEqual({ agentId: "claude-opus" })
    })

    it("falls back to the first agent only when no default is configured", () => {
        // Preserves today's behaviour for anyone who configures nothing.
        expect(routeAgent([], card, agents, "")).toEqual({ agentId: "claude" })
    })

    it("ignores a default naming an agent that no longer exists", () => {
        expect(routeAgent([], card, agents, "deleted-agent")).toEqual({ agentId: "claude" })
    })

    it("returns an empty agentId when there are no agents at all", () => {
        expect(routeAgent([], card, [], "")).toEqual({ agentId: "" })
    })
})
