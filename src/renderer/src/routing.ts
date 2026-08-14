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
 * Compile a glob to a regex. Every metacharacter is escaped before `*` and `?`
 * are translated, so the user cannot express a nested quantifier — which is what
 * makes catastrophic backtracking possible. This is a structural fix, not a
 * bound: a glob compiles to alternating literals and `.*`, whose backtracking is
 * polynomial rather than exponential.
 *
 * The previous `titleRegex` kind was removed rather than mitigated. Capping the
 * input length does not help: blowup is ~2x per character, so any cap large
 * enough to be useful is still astronomically slow, and the case that prompted
 * the fix was a 31-character title.
 */
function globToRegExp(glob: string): RegExp {
    // Escape every metacharacter, including the backslash itself.
    const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Then translate only the two glob tokens, matching their ESCAPED forms.
    const body = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".")
    return new RegExp("^" + body + "$", "i")
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
        try {
            const regex = globToRegExp(pattern)
            return regex.test(card.title)
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
