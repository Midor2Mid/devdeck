import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { AgentPreset } from "../settings"
import { isUnsafeAgent } from "../settings"

/**
 * Options for one agent launch, hung off the launch button rather than placed in
 * front of it.
 *
 * The plain click stays instant — "a new agent session should be one keystroke"
 * is the whole point of that button, and it's bound to Ctrl+Shift+Enter. This is
 * the caret path, for the launch where you want to say something extra first.
 *
 * Two callers, two shapes:
 *  - the terminal bar's caret passes one agent and allows a worktree, because it
 *    acts on the active project (git worktrees need one)
 *  - the deck's per-project "+" passes every AI preset and no worktree, because
 *    its ambiguity was *which agent*, and it targets a project that may not be
 *    the active one
 */
export function LaunchOptions({
    agents,
    allowWorktree,
    defaultBranch,
    anchor,
    onLaunch,
    onClose
}: {
    agents: AgentPreset[]
    allowWorktree: boolean
    /** Seed for the branch name when launching into a worktree. */
    defaultBranch?: string
    /** The button this hangs off — used to position it. */
    anchor: HTMLElement | null
    onLaunch: (agentId: string, opts: { worktree: boolean; branch: string }) => void
    onClose: () => void
}): JSX.Element {
    const [agentId, setAgentId] = useState(agents[0]?.id ?? "")
    const [worktree, setWorktree] = useState(false)
    const [branch, setBranch] = useState(defaultBranch ?? "")
    const branchRef = useRef<HTMLInputElement>(null)
    const rootRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

    /**
     * Rendered through a portal to <body> and positioned from the anchor's rect.
     *
     * Two clipping problems forced this, both of which left the popover present
     * in the DOM but invisible — the DOM assertions passed while nothing was on
     * screen. First, the deck strip is an `overflow-x: auto` scroller, which
     * clips an absolutely positioned child. Switching to `position: fixed` isn't
     * enough either: a `transform` on any ancestor turns it into the containing
     * block and re-clips it. A portal leaves the subtree entirely, so neither
     * applies.
     *
     * Flips above the anchor when there's no room below, which is the deck's
     * case, and re-measures when the branch row appears and changes the height.
     */
    useLayoutEffect(() => {
        const box = rootRef.current
        if (!box || !anchor) return
        const a = anchor.getBoundingClientRect()
        const b = box.getBoundingClientRect()
        const gap = 6
        const edge = 8
        let top = a.bottom + gap
        if (top + b.height > window.innerHeight - edge) top = a.top - b.height - gap
        top = Math.max(edge, top)
        let left = a.right - b.width // right-aligned to the button it hangs off
        left = Math.max(edge, Math.min(left, window.innerWidth - b.width - edge))
        setPos({ left, top })
    }, [worktree, agents.length, anchor])

    // Focus the first thing worth typing into, so the popover is keyboard-usable
    // from the moment it opens.
    useEffect(() => {
        if (worktree) branchRef.current?.focus()
    }, [worktree])
    useEffect(() => {
        rootRef.current?.focus()
    }, [])

    const chosen = agents.find((a) => a.id === agentId)
    // A worktree with no branch name has nothing to create.
    const blocked = worktree && !branch.trim()

    const launch = (): void => {
        if (!agentId || blocked) return
        onLaunch(agentId, { worktree, branch: branch.trim() })
        onClose()
    }

    return createPortal(
        <>
            <div className="menu-backdrop" onClick={onClose} />
            <div
                className="launch-opts"
                ref={rootRef}
                tabIndex={-1}
                // Hidden until measured, so it never flashes at the top-left.
                style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation()
                        onClose()
                    }
                    // Enter launches from anywhere in the popover — it's the only
                    // action here, so it shouldn't need a trip to the button.
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        launch()
                    }
                }}
            >
                {agents.length > 1 && (
                    <label className="launch-opts-row">
                        <span className="launch-opts-label">Agent</span>
                        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                            {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}

                {chosen && isUnsafeAgent(chosen.command) && (
                    <p className="launch-opts-warn">
                        Skips permission prompts — it can edit and run anything here without asking.
                    </p>
                )}

                {allowWorktree && (
                    <>
                        <label className="launch-opts-check">
                            <input
                                type="checkbox"
                                checked={worktree}
                                onChange={(e) => setWorktree(e.target.checked)}
                            />
                            <span>in a new git worktree</span>
                        </label>
                        {worktree ? (
                            <label className="launch-opts-row">
                                <span className="launch-opts-label">Branch</span>
                                <input
                                    ref={branchRef}
                                    value={branch}
                                    placeholder="feature/thing"
                                    onChange={(e) => setBranch(e.target.value)}
                                />
                            </label>
                        ) : (
                            <p className="launch-opts-hint">
                                Its own checkout, so it can&apos;t collide with an agent already
                                working in this project.
                            </p>
                        )}
                    </>
                )}

                <div className="launch-opts-foot">
                    <span className="launch-opts-kbd">Enter</span>
                    <button className="accent" disabled={blocked} onClick={launch}>
                        Launch{chosen ? ` ${chosen.name}` : ""}
                    </button>
                </div>
            </div>
        </>,
        document.body
    )
}
