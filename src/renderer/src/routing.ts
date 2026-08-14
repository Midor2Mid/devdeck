/**
 * Agent routing: match a card to an agent based on rules.
 *
 * Pure state and matching only — no React, no IPC — so the whole matcher is
 * testable without Electron. The dispatcher owns the lifecycle; this module owns
 * what a rule *is* and when it matches.
 */

export type RuleKind = "title" | "titleGlob" | "project" | "always"

export interface RoutingRule {
    id: string
    enabled: boolean
    kind: RuleKind
    pattern: string
    agentId: string
}

export interface RouteResult {
    agentId: string
    ruleId?: string
}

/**
 * Case-insensitive character comparison. Folds both characters to lowercase
 * independently rather than pre-lowercasing the strings, which avoids issues
 * with Unicode expansions (e.g., Turkish dotted capital I expands when lowercased).
 */
function sameChar(a: string, b: string): boolean {
    return a === b || a.toLowerCase() === b.toLowerCase()
}

/**
 * Match a glob against a title. `*` matches any run, `?` matches one character.
 *
 * Deliberately NOT compiled to a RegExp. A glob built from user text and handed to
 * the regex engine inherits its backtracking: escaping metacharacters stops a
 * nested quantifier being written, but several plain `*` tokens still produce the
 * `^(a.*){k}Z$` blowup — measured at 2.1s for five stars against a 100-character
 * title, and over two minutes for twenty. This runs synchronously to render the
 * dispatch preview, so a hang here freezes the screen the user is looking at.
 *
 * The two-pointer form has one backtrack point (the most recent `*`) and never
 * explores a tree, so its worst case is O(pattern x text) and it cannot degrade.
 *
 * Anchored, like globs everywhere else: `login` matches only the exact title
 * "login". Use `*login*` to match anywhere — the `title` kind is the substring
 * one. There is no escape for a literal `*` or `?` in a pattern; the rule editor
 * should teach the idiom with a `*login*` placeholder rather than documenting an
 * escape nobody would find.
 *
 * The walk is over code units, so `?` matches one code unit (one half of a
 * surrogate pair rather than a whole astral character). This is how most glob
 * implementations behave and allows efficient operation on the native JS string
 * representation.
 */
function globMatch(glob: string, text: string): boolean {
    let pi = 0
    let si = 0
    let star = -1
    let mark = 0
    while (si < text.length) {
        if (pi < glob.length && (glob[pi] === "?" || sameChar(glob[pi], text[si]))) {
            pi++
            si++
        } else if (pi < glob.length && glob[pi] === "*") {
            star = pi++
            mark = si
        } else if (star >= 0) {
            pi = star + 1
            si = ++mark
        } else {
            return false
        }
    }
    while (pi < glob.length && glob[pi] === "*") pi++
    return pi === glob.length
}

/**
 * Does this rule match the card? Returns false when patterns are empty or
 * whitespace-only: in JavaScript, `"".includes("")` is true, which would turn a
 * half-typed rule into a catch-all. The same applies to a space: `"title
 * ".includes(" ")` is almost always true.
 */
export function ruleMatches(rule: RoutingRule, card: { title: string; projectId: string }): boolean {
    if (rule.kind === "always") {
        return true
    }

    if (rule.kind === "title") {
        const pattern = rule.pattern.trim()
        if (!pattern) return false
        return card.title.toLowerCase().includes(pattern.toLowerCase())
    }

    if (rule.kind === "titleGlob") {
        const pattern = rule.pattern.trim()
        if (!pattern) return false
        return globMatch(pattern, card.title)
    }

    if (rule.kind === "project") {
        return card.projectId === rule.pattern
    }

    return false
}

/**
 * Route a card to an agent. Walks enabled rules in order; returns the first
 * match whose agent still exists. If no rule matches, falls back to the
 * configured default (if it names a real agent), then to agents[0], then to
 * an empty string. Skips rules naming an agent that has been deleted: a
 * dangling reference must not dispatch to nothing.
 */
export function routeAgent(
    rules: RoutingRule[],
    card: { title: string; projectId: string },
    agents: { id: string }[],
    defaultAgentId: string
): RouteResult {
    // Check each enabled rule in order.
    for (const rule of rules) {
        if (!rule.enabled) continue

        // Only use this rule if its agent exists.
        const agentExists = agents.some((a) => a.id === rule.agentId)
        if (!agentExists) continue

        if (ruleMatches(rule, card)) {
            return { agentId: rule.agentId, ruleId: rule.id }
        }
    }

    // No matching rule. Fall back: configured default → agents[0] → empty.
    if (defaultAgentId) {
        const defaultExists = agents.some((a) => a.id === defaultAgentId)
        if (defaultExists) {
            return { agentId: defaultAgentId }
        }
    }

    // Preserve today's behaviour: agents[0] when nothing is configured.
    if (agents.length > 0) {
        return { agentId: agents[0].id }
    }

    return { agentId: "" }
}
