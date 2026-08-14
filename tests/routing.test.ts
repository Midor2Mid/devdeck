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

    it("matches a title glob with * and ?", () => {
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "*login*" }), card)).toBe(true)
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "login*" }), card)).toBe(false)
    })

    it("supports ? for single-character matches in globs", () => {
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "?ix*" }), card)).toBe(true)
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "??ix*" }), card)).toBe(false)
    })

    it("treats regex metacharacters as literals in globs", () => {
        // a.c is literal, not "a<any>c"
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "a.c" }), card)).toBe(false)
        // (a+)+$ would be exponentially slow as a regex, but is literal here
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "(a+)+$" }), card)).toBe(false)
    })

    it("matches anything with * glob", () => {
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "*" }), card)).toBe(true)
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
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "" }), card)).toBe(false)
    })

    it("does not match whitespace-only patterns for the text kinds", () => {
        // A space or tab after trim becomes empty: same catch-all risk.
        expect(ruleMatches(rule({ kind: "title", pattern: " " }), card)).toBe(false)
        expect(ruleMatches(rule({ kind: "title", pattern: "\t" }), card)).toBe(false)
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: " " }), card)).toBe(false)
        expect(ruleMatches(rule({ kind: "titleGlob", pattern: "\t" }), card)).toBe(false)
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
