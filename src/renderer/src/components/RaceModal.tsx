import { useEffect, useMemo, useState } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { Modal } from "./Modal"
import { Icon } from "./Icon"
import { formatCost } from "../board"
import { survivors, raceSpend, raceSettled, RACE_POLL_MS, type Entrant, type EntrantStatus } from "../race"

/** Human word for the dot — never the bare enum, and never "failed" for nocommit
 *  (an agent that ignored the commit instruction did not write bad code), and
 *  never "failed" for startfailed either (that's an infrastructure problem,
 *  not the agent's work). */
const STATUS_LABEL: Record<EntrantStatus, string> = {
    starting: "starting",
    working: "working",
    gating: "gating",
    passed: "passed",
    failed: "failed",
    nocommit: "no commit",
    startfailed: "start failed"
}

/** First non-blank line of a gate/entrant message, trimmed for the row - the
 *  full text (up to the 400 chars the store already caps it at) is available
 *  behind the row's "output" toggle. */
function firstLine(text?: string): string {
    if (!text) return ""
    const line = text.split("\n").find((l) => l.trim()) ?? text
    return line.length > 64 ? line.slice(0, 64) + "…" : line
}

function RaceDetail({ entrant }: { entrant: Entrant }): JSX.Element {
    switch (entrant.status) {
        case "passed":
            return (
                <span className="race-detail race-detail-ok mono">
                    <Icon name="check" size={13} /> {Math.round((entrant.gateMs ?? 0) / 1000)}s
                </span>
            )
        case "failed": {
            const reason = firstLine(entrant.gateOutput)
            return (
                <span className="race-detail race-detail-bad">
                    <Icon name="close" size={13} /> exit {entrant.gateExit ?? "?"}
                    {reason ? ` · ${reason}` : ""}
                </span>
            )
        }
        case "gating":
            return <span className="race-detail muted">gate running…</span>
        case "nocommit":
            return <span className="race-detail muted">{firstLine(entrant.gateOutput) || "timed out, nothing committed"}</span>
        case "startfailed":
            return <span className="race-detail muted">{firstLine(entrant.gateOutput) || "could not start"}</span>
        default:
            return <span className="race-detail muted">…</span>
    }
}

function RaceRow({
    entrant,
    selected,
    expanded,
    onSelect,
    onToggleOutput,
    onDiff,
    onJump
}: {
    entrant: Entrant
    selected: boolean
    expanded: boolean
    onSelect: () => void
    onToggleOutput: () => void
    onDiff: () => void
    onJump: () => void
}): JSX.Element {
    const eliminated =
        entrant.status === "failed" || entrant.status === "nocommit" || entrant.status === "startfailed"
    const selectable = entrant.status === "passed"
    const inProgress = entrant.status === "starting" || entrant.status === "working" || entrant.status === "gating"

    let action: JSX.Element | null = null
    if (entrant.status === "passed") {
        action = (
            <button
                className="btn-min"
                aria-label={`View ${entrant.agentName}'s diff`}
                onClick={(e) => { e.stopPropagation(); onDiff() }}
            >
                diff
            </button>
        )
    } else if (inProgress) {
        action = entrant.termId ? (
            <button
                className="btn-min"
                aria-label={`Jump to ${entrant.agentName}'s session`}
                onClick={(e) => { e.stopPropagation(); onJump() }}
            >
                jump
            </button>
        ) : null
    } else if (entrant.gateOutput) {
        action = (
            <button
                className="btn-min"
                aria-label={`${expanded ? "Hide" : "Show"} ${entrant.agentName}'s output`}
                onClick={(e) => { e.stopPropagation(); onToggleOutput() }}
            >
                {expanded ? "hide" : "output"}
            </button>
        )
    }

    // A keyboard user needs the same "pick a survivor" path a mouse user has -
    // role/tabIndex/aria-pressed only apply when the row is actually
    // selectable (a passed entrant); other rows stay plain, unfocusable divs.
    // aria-selected is not valid on role="button" (it belongs to option/row/
    // tab/gridcell/treeitem), so the selected state would be dropped from the
    // accessibility tree entirely - aria-pressed is the correct attribute for
    // a toggle-ish button.
    const rowProps = selectable
        ? {
              role: "button" as const,
              tabIndex: 0,
              "aria-pressed": selected,
              onClick: onSelect,
              onKeyDown: (e: React.KeyboardEvent) => {
                  // A passed row's own action IS its diff button. Without this
                  // check, a keydown on that focused button bubbles up to the
                  // row and hits preventDefault() below, which in Chromium
                  // suppresses the button's own Enter/Space activation - so
                  // tabbing to "diff" and pressing Enter would re-select the
                  // row instead of opening the diff.
                  if (e.target !== e.currentTarget) return
                  if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelect()
                  }
              }
          }
        : {}

    return (
        <div className="race-row-wrap">
            <div className={"race-row" + (selectable ? " selectable" : "") + (selected ? " sel" : "")} {...rowProps}>
                <span className={"race-dot " + (eliminated ? "out" : "in") + " st-" + entrant.status} />
                <span className="race-agent-name">{entrant.agentName}</span>
                <span className="race-status-word">{STATUS_LABEL[entrant.status]}</span>
                <RaceDetail entrant={entrant} />
                <span className="race-cost mono">{entrant.cost !== undefined ? formatCost(entrant.cost) : ""}</span>
                <span className="race-diffstat mono">
                    {entrant.added !== undefined ? `+${entrant.added} -${entrant.removed ?? 0}` : ""}
                </span>
                <span className="race-action">{action}</span>
            </div>
            {expanded && entrant.gateOutput && <pre className="race-output">{entrant.gateOutput}</pre>}
        </div>
    )
}

/**
 * Race two or three agent presets on one task-board card, each in its own git
 * worktree, gated by a shared command. Setup form when no race exists yet for
 * this card; a live board of entrants while one runs; a footer to land a
 * survivor or abandon the whole thing once it does.
 */
export function RaceModal(): JSX.Element | null {
    const raceCardId = useStore((s) => s.raceCardId)
    const races = useStore((s) => s.races)
    const boardTasks = useStore((s) => s.boardTasks)
    const projects = useStore((s) => s.projects)
    const closeRace = useStore((s) => s.closeRace)
    const startRace = useStore((s) => s.startRace)
    const landRaceWinner = useStore((s) => s.landRaceWinner)
    const abandonRace = useStore((s) => s.abandonRace)
    const openChanges = useStore((s) => s.openChanges)
    const jumpToTerm = useStore((s) => s.jumpToTerm)

    // Select the stable array and filter in a memo - filtering *inside* the
    // selector returns a fresh array every render, which zustand reads as a new
    // value and spins into an infinite update loop (see ChangesModal.tsx).
    const agents = useSettings((s) => s.agents)
    const projectCommands = useSettings((s) => s.projectCommands)
    const aiAgents = useMemo(() => agents.filter((a) => a.runMode !== "normal"), [agents])

    // Plain property lookups on the selected slices, not inside a selector -
    // safe because these only change identity when the underlying store data
    // itself changes, never on every render.
    const race = raceCardId ? races[raceCardId] : undefined
    const task = raceCardId ? boardTasks.find((t) => t.id === raceCardId) : undefined
    const project = task ? projects.find((p) => p.id === task.projectId) : undefined

    const [selectedAgents, setSelectedAgents] = useState<string[]>([])
    const [gateCommand, setGateCommand] = useState("")
    const [selectedWinner, setSelectedWinner] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [dirty, setDirty] = useState(false)
    // startRace resolves only after a sequential ~2.8s-per-entrant dispatch
    // loop (plus a confirm dialog before that) - without this, Start race
    // stays enabled for that whole window and a second click hits the
    // store's silent double-start guard instead of doing anything visible.
    const [starting, setStarting] = useState(false)

    // Fresh setup form each time a different card's race modal opens.
    useEffect(() => {
        if (!raceCardId) return
        setSelectedAgents([])
        setExpanded(new Set())
        setStarting(false)
    }, [raceCardId])

    // Prefill the gate command from the project's first saved command. Only
    // while there's no race yet - once one exists this field is history, not
    // something to keep rewriting under the user.
    useEffect(() => {
        if (!raceCardId || race) return
        setGateCommand(project ? (projectCommands[project.id]?.[0]?.command ?? "") : "")
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [raceCardId, project?.id])

    // Keep the focused survivor valid as the race plays out: default to the
    // first one to pass, and drop the selection if it stops being one.
    useEffect(() => {
        if (!race) return
        const ids = survivors(race).map((e) => e.agentId)
        setSelectedWinner((prev) => (prev && ids.includes(prev) ? prev : (ids[0] ?? null)))
    }, [race])

    // Poll the project's clean/dirty state while a race is open, so Land can be
    // disabled with a reason instead of firing and finding out.
    useEffect(() => {
        if (!race) return
        let cancelled = false
        const check = (): void => {
            window.api.git
                .status(race.projectPath)
                .then((s) => {
                    if (!cancelled) setDirty(s.changes > 0)
                })
                .catch(() => {})
        }
        check()
        const id = setInterval(check, RACE_POLL_MS)
        return () => {
            cancelled = true
            clearInterval(id)
        }
    }, [race?.projectPath])

    if (!raceCardId || (!race && !task)) return null

    const toggleAgent = (id: string): void => {
        setSelectedAgents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    }
    const toggleOutput = (agentId: string): void => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(agentId)) next.delete(agentId)
            else next.add(agentId)
            return next
        })
    }
    const handleStart = async (): Promise<void> => {
        if (!task || starting) return
        setStarting(true)
        try {
            await startRace(task.id, selectedAgents, gateCommand.trim())
        } finally {
            // If the race landed, this component has already switched to the
            // running branch by the time this runs - harmless either way.
            setStarting(false)
        }
    }

    const title = task?.title ?? race?.title ?? "Race"
    const validCount = selectedAgents.length === 2 || selectedAgents.length === 3
    const spend = race ? raceSpend(race) : 0
    const survs = race ? survivors(race) : []
    const settled = race ? raceSettled(race) : false
    const winner = survs.find((e) => e.agentId === selectedWinner)

    return (
        <Modal onClose={closeRace} className="race-modal" labelledBy="race-modal-title">
            <div className="modal-head">
                <span id="race-modal-title">Race &middot; {title}</span>
                <button className="btn-min" onClick={closeRace} data-tip="Close" aria-label="Close">
                    <Icon name="close" size={14} />
                </button>
            </div>

            {race && (
                <div className="race-meta">
                    <span className="race-gate mono" data-tip="Gate command">
                        {race.gateCommand}
                    </span>
                    <span className="spacer" style={{ flex: 1 }} />
                    <span className="race-spend-total mono" data-tip="Total spent across every entrant">
                        {formatCost(spend)}
                    </span>
                </div>
            )}

            {!race ? (
                <>
                    <div className="modal-body race-setup">
                        <div className="section-label">Entrants</div>
                        <div className="race-agent-list">
                            {aiAgents.map((a) => (
                                <label key={a.id} className="race-agent-row">
                                    <input
                                        type="checkbox"
                                        checked={selectedAgents.includes(a.id)}
                                        onChange={() => toggleAgent(a.id)}
                                    />
                                    {a.name}
                                </label>
                            ))}
                            {aiAgents.length === 0 && (
                                <div className="muted small">No AI-mode agent presets configured.</div>
                            )}
                        </div>
                        <label className="race-gate-field">
                            <span className="section-label">Gate command</span>
                            <input
                                className="race-gate-input"
                                value={gateCommand}
                                placeholder="npm test"
                                onChange={(e) => setGateCommand(e.target.value)}
                            />
                            <span className="muted small">
                                Runs in a fresh worktree checkout with no installed dependencies — a
                                command that needs them has to install them first, e.g.{" "}
                                <span className="mono">npm ci &amp;&amp; npm test</span>.
                            </span>
                        </label>
                        {selectedAgents.length > 0 && !validCount && (
                            <div className="muted small">Pick two or three entrants.</div>
                        )}
                    </div>
                    <div className="modal-actions race-foot">
                        <span className="spacer" style={{ flex: 1 }} />
                        {starting && <span className="race-note muted small">Starting - dispatching each entrant…</span>}
                        <button
                            className="accent"
                            disabled={!validCount || !gateCommand.trim() || starting}
                            onClick={handleStart}
                        >
                            {starting ? "Starting…" : "Start race"}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="modal-body race-body">
                        {race.entrants.map((e) => (
                            <RaceRow
                                key={e.agentId}
                                entrant={e}
                                selected={selectedWinner === e.agentId}
                                expanded={expanded.has(e.agentId)}
                                onSelect={() => setSelectedWinner(e.agentId)}
                                onToggleOutput={() => toggleOutput(e.agentId)}
                                onDiff={() => openChanges(e.worktree, e.agentName)}
                                onJump={() => e.termId && jumpToTerm(e.termId)}
                            />
                        ))}
                    </div>
                    <div className="modal-actions race-foot">
                        <button onClick={() => void abandonRace(race.cardId)}>Abandon</button>
                        <span className="spacer" style={{ flex: 1 }} />
                        {settled && survs.length === 0 ? (
                            <span className="race-allfailed">
                                Every entrant was eliminated. Either the work failed the gate, or the
                                gate command isn&apos;t runnable in a fresh worktree checkout (see the
                                output on each row below) — not necessarily that the card was
                                underspecified.
                            </span>
                        ) : (
                            winner && (
                                <>
                                    {/* A disabled button never fires the tooltip layer's mouseover/focusin
                                        (Chromium sends neither for a disabled form control), so the reason
                                        has to be plain visible text, not a data-tip - the same way the
                                        all-eliminated sentence above is already plain text. */}
                                    {dirty && (
                                        <span className="race-note muted small">
                                            Can&apos;t land: the project has uncommitted changes
                                        </span>
                                    )}
                                    <button
                                        className="accent"
                                        disabled={dirty}
                                        onClick={() => void landRaceWinner(race.cardId, winner.agentId)}
                                    >
                                        Land {winner.agentName}
                                    </button>
                                </>
                            )
                        )}
                    </div>
                </>
            )}
        </Modal>
    )
}
