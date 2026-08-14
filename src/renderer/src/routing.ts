/**
 * Agent routing: match a card to an agent based on rules.
 *
 * Pure state and matching only — no React, no IPC — so the whole matcher is
 * testable without Electron. The dispatcher owns the lifecycle; this module owns
 * what a rule *is* and when it matches.
 */

export type RuleKind = "title" | "titleRegex" | "project" | "always"

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
 * Does this rule match the card? Returns false on invalid regex rather than
 * throwing: a rule malfunction must be inert, not crash the dispatch path that
 * spends money. Empty or whitespace-only patterns on text kinds also return
 * false: in JavaScript, `"".includes("")` is true, which would turn a
 * half-typed rule into a catch-all. The same applies to a space: "title
 * ".includes(" ") is almost always true.
 *
 * For titleRegex, we cap both the pattern length (200 chars) and the title
 * slice tested against it (200 chars). A catastrophic regex like `(a+)+$`
 * is syntactically valid and won't throw, but runs exponentially in input
 * length and can freeze the UI during dispatch preview. These caps are
 * damage limitation, not a security boundary — the rule author is the user
 * editing their own settings. An oversized pattern becomes inert; the title
 * slice is transparent to realistic matches (a 300-char title with a pattern
 * matching its first 50 words still matches).
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

    if (rule.kind === "titleRegex") {
        const pattern = rule.pattern.trim()
        if (!pattern) return false
        if (pattern.length > 200) return false
        try {
            const regex = new RegExp(pattern)
            return regex.test(card.title.slice(0, 200))
        } catch {
            return false
        }
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
