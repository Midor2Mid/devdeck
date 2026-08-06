import { useSettings, isUnsafeAgent, missingRecommended, type AgentPreset } from "../settings"
import { useStore, SHELL } from "../store"
import { toast } from "../toast"

/**
 * The empty-terminal launch screen: every configured startup command surfaced as
 * a click-to-run card, grouped by category. An AI-agent card starts a CLI session;
 * a Normal card opens a plain shell that auto-runs its command.
 *
 * The starter set is offered here, not only in Settings, because this is where the
 * question actually gets asked — a user looking at a thin launcher wanted to know
 * "how do I see the template start commands?" and nothing at this point said they
 * existed. A feature the UI never reveals is a feature nobody has.
 */
export function CommandLauncher({ projectName }: { projectName: string }): JSX.Element {
    const agents = useSettings((s) => s.agents)
    const newTab = useStore((s) => s.newTab)
    const openSettings = useSettings((s) => s.openSettings)
    const addRecommended = useSettings((s) => s.addRecommended)
    const missing = missingRecommended(agents)

    const launch = (a: AgentPreset): void => {
        if (a.runMode === "normal") newTab(SHELL, a.command || undefined, a.name)
        else newTab(a.id)
    }

    // Group by category (blank falls back to a per-mode default), keeping the
    // order commands were defined in so the launcher mirrors the settings list.
    const groups: { name: string; items: AgentPreset[] }[] = []
    for (const a of agents) {
        const cat = a.category.trim() || (a.runMode === "normal" ? "Commands" : "Agents")
        let g = groups.find((x) => x.name === cat)
        if (!g) {
            g = { name: cat, items: [] }
            groups.push(g)
        }
        g.items.push(a)
    }

    return (
        <div className="launcher">
            <div className="launcher-head">
                <h2>❯ Launch a command</h2>
                <p className="muted">
                    No terminals yet in {projectName}. Pick a startup command, or open a plain shell.
                </p>
            </div>
            <div className="launcher-actions">
                <button className="accent" onClick={() => newTab(SHELL)}>
                    + New terminal
                </button>
                {missing.length > 0 && (
                    <button
                        onClick={() => {
                            const n = addRecommended()
                            if (n > 0) toast(`Added ${n} starter command${n === 1 ? "" : "s"}`)
                        }}
                        data-tip="Add the recommended starter commands you don't have yet (Claude, Codex, Gemini, dev server…). Nothing is duplicated or overwritten."
                    >
                        ↺ Add starter commands ({missing.length})
                    </button>
                )}
                <button onClick={() => openSettings()}>Settings</button>
            </div>
            {groups.map((g) => (
                <div key={g.name} className="launcher-group">
                    <div className="launcher-group-title">{g.name}</div>
                    <div className="launcher-grid">
                        {g.items.map((a) => (
                            <button
                                key={a.id}
                                className={
                                    "launch-card" + (isUnsafeAgent(a.command) ? " launch-card-unsafe" : "")
                                }
                                onClick={() => launch(a)}
                                data-tip={
                                    a.runMode === "normal"
                                        ? `Run: ${a.command || "(no command)"}`
                                        : isUnsafeAgent(a.command)
                                          ? `Start a ${a.name} session — skips permission prompts, so it can edit and run anything in this project without asking`
                                          : `Start a ${a.name} session`
                                }
                            >
                                <span className="launch-card-icon">
                                    {a.icon || (a.runMode === "normal" ? "❯" : "✳")}
                                </span>
                                <span className="launch-card-name">{a.name}</span>
                                <span className="launch-card-cmd">{a.command || a.id}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
