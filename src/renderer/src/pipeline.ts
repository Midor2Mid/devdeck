/**
 * Agent pipelines - ordered, repeatable multi-agent workflows. Each step sends
 * a prompt to an agent session, waits for that agent to settle (go idle), then
 * advances. Same-agent steps reuse one session so context carries across them;
 * a step can force a fresh session. This module holds the pure data shape +
 * helpers so the sequencing logic is unit-testable without React/IPC.
 */

import type { StepGate } from "./gate"

export interface PipelineStep {
    id: string
    /** Display title for the step (shown in the runner). */
    title: string
    /** Agent preset id this step talks to (e.g. "claude"). */
    agentId: string
    /** Prompt sent to the agent for this step. */
    prompt: string
    /** Force a brand-new agent session instead of reusing the agent's session. */
    fresh: boolean
    /** Optional success gate - only advance if the agent's output passes. */
    gate?: StepGate
}

export interface Pipeline {
    id: string
    name: string
    steps: PipelineStep[]
}

/** A file-watch trigger that auto-runs a pipeline when matching files change. */
export interface PipelineTrigger {
    id: string
    enabled: boolean
    pipelineId: string
    /** Project directory to watch recursively. */
    projectPath: string
    /** Glob to match changed files (relative). "" = any file. */
    glob: string
    /** Quiet period after the last change before firing, ms. */
    debounceMs: number
}

export type PipelineRunStatus = "running" | "waiting" | "done" | "stopped" | "error"

export interface PipelineRun {
    pipelineId: string
    name: string
    /** Index of the step currently executing (0-based). */
    stepIndex: number
    total: number
    stepTitle: string
    status: PipelineRunStatus
    /** Transient note about the current step's gate (e.g. "✓ gate passed"). */
    gateMsg?: string
}

/** A pipeline is runnable if it has a name and at least one step with a prompt. */
export function isRunnable(p: Pipeline): boolean {
    return !!p.name.trim() && p.steps.some((s) => s.prompt.trim().length > 0)
}

/** Drop empty steps (no prompt) - they would stall the runner waiting on nothing. */
export function runnableSteps(p: Pipeline): PipelineStep[] {
    return p.steps.filter((s) => s.prompt.trim().length > 0)
}

/**
 * Decide which session a step uses. Reuse the live session already opened for
 * this agent in the current run, unless the step forces a fresh one or no
 * session exists yet. `liveByAgent` maps agentId -> termId opened so far.
 */
export function sessionPlan(
    step: PipelineStep,
    liveByAgent: Record<string, string | undefined>
): { reuse: boolean; termId?: string } {
    const existing = liveByAgent[step.agentId]
    if (!step.fresh && existing) return { reuse: true, termId: existing }
    return { reuse: false }
}

/** Move an item within a list (for step reordering). Returns a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
    if (to < 0 || to >= list.length || from < 0 || from >= list.length) return list
    const next = list.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
}
