import { useSettings, isUnsafeAgent, missingRecommended, type AgentPreset } from "../settings"
import { useStore, SHELL } from "../store"
import { shouldLaunch } from "../launchGuard"
import { toast } from "../toast"
import { useProbe } from "../useProbe"
import { cardMark, canLaunch, launcherNotice, type CardMark } from "../probeView"
import { Icon } from "./Icon"

/**
 * The empty-terminal launch screen: every configured startup command surfaced as
 * a click-to-run card, grouped by category. An AI-agent card starts a CLI session;
 * a Normal card opens a plain shell that auto-runs its command.
 *
 * The starter set is offered here, not only in Settings, because this is where the
 * question actually gets asked — a user looking at a thin launcher wanted to know
 * "how do I see the template start commands?" and nothing at this point said they
 * existed. A feature the UI never reveals is a feature nobody has.
 *
 * The body carries **no accent**: a grid of cards cannot all be the one thing to
 * act on, so the screen's single filled action stays the tab bar's `+ <agent>`.
 */
export function CommandLauncher({ projectName }: { projectName: string }): JSX.Element {
    const agents = useSettings((s) => s.agents)
    const newTab = useStore((s) => s.newTab)
    const openSettings = useSettings((s) => s.openSettings)
    const addRecommended = useSettings((s) => s.addRecommended)
    const missing = missingRecommended(agents)
    const { report, rechecking, recheck } = useProbe(agents)
    const notice = launcherNotice(agents, report)

    const launchShell = (): void => {
        if (shouldLaunch(SHELL)) newTab(SHELL)
    }

    const launch = (a: AgentPreset): void => {
        // Swallows the second half of a double-click; see launchGuard.
        if (!shouldLaunch(a.id)) return
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
            {/* A PATH result that makes every card likely to fail outlives a
                toast, and its two causes need different sentences and different
                actions. Silence is the correct report for a healthy machine and
                for a partial result — the cards carry those. */}
            {notice && (
                <div className="notice-bar launcher-notice" role="status">
                    <Icon name="help" size={14} />
                    {notice.kind === "missing" ? (
                        <>
                            <span className="notice-bar-text">
                                Not on your PATH:{" "}
                                {notice.tokens.map((t, i) => (
                                    <span key={t}>
                                        {i > 0 ? ", " : ""}
                                        <code>{t}</code>
                                    </span>
                                ))}
                                {notice.more > 0 ? ` +${notice.more} more` : ""}. A shell alias or
                                function still works — but if a card does nothing, this is why.
                            </span>
                            <button
                                type="button"
                                className="notice-bar-action"
                                onClick={() => openSettings("agents")}
                            >
                                Agent settings
                            </button>
                        </>
                    ) : (
                        <>
                            <span className="notice-bar-text">
                                DevDeck couldn&rsquo;t read your shell&rsquo;s PATH, so these
                                commands are unchecked. Cards still run; they just weren&rsquo;t
                                verified.
                            </span>
                            {/* Pending lives on the button, not on the cards: a
                                re-check re-spawns a login shell, which is ~200ms
                                here and seconds with a heavy profile. */}
                            <button
                                type="button"
                                className="notice-bar-action"
                                disabled={rechecking}
                                onClick={recheck}
                            >
                                {rechecking ? "Re-checking…" : "Re-check"}
                            </button>
                        </>
                    )}
                </div>
            )}
            <div className="launcher-head">
                <h2>Launch a command</h2>
                <p className="muted">
                    {agents.length === 0
                        ? "No startup commands configured. Add one in Settings, or open a plain shell."
                        : `No terminals yet in ${projectName}. Pick a startup command, or open a plain shell.`}
                </p>
            </div>
            <div className="launcher-actions">
                {/* One label for one act: the terminal tab bar's button says
                    "New terminal" too. */}
                <button onClick={() => launchShell()}>New terminal</button>
                {missing.length > 0 && (
                    <button
                        onClick={() => {
                            const n = addRecommended()
                            if (n > 0) toast(`Added ${n} starter command${n === 1 ? "" : "s"}`)
                        }}
                        data-tip="Add the recommended starter commands you don't have yet (Claude, Codex, Gemini, dev server…). Nothing is duplicated or overwritten."
                    >
                        <Icon name="restart" size={12} /> Add starter commands ({missing.length})
                    </button>
                )}
                <button onClick={() => openSettings()}>Settings</button>
            </div>
            {groups.map((g) => (
                <div key={g.name} className="launcher-group">
                    <div className="launcher-group-title">{g.name}</div>
                    <div className="launcher-grid">
                        {g.items.map((a) => {
                            const mark = cardMark(a, report)
                            return (
                                <button
                                    key={a.id}
                                    className={
                                        "launch-card" +
                                        // Orthogonal to every probe mark, and composes with
                                        // them: the stripe answers "what will this do to my
                                        // repo", the mark answers "will this run at all".
                                        (isUnsafeAgent(a.command) ? " launch-card-unsafe" : "") +
                                        (mark === "not-on-path" ? " launch-card-offpath" : "") +
                                        (mark === "no-command" ? " launch-card-nocmd" : "")
                                    }
                                    // Not `disabled`: a disabled button has no click target, so
                                    // it could not route to the fix. The card that cannot run
                                    // anything opens the place where you give it something.
                                    aria-disabled={canLaunch(a, mark) ? undefined : true}
                                    onClick={() =>
                                        canLaunch(a, mark) ? launch(a) : openSettings("agents")
                                    }
                                    data-tip={cardTip(a, mark)}
                                >
                                    <span className="launch-card-icon">
                                        {a.icon || (a.runMode === "normal" ? "❯" : "✳")}
                                    </span>
                                    <span className="launch-card-name">{a.name}</span>
                                    {mark === "no-command" ? (
                                        // Sans italic, never mono: mono means "this is the
                                        // literal string that will run", and there is no
                                        // string. The absence of a value must not be dressed
                                        // as one — this slot used to print the preset id.
                                        <span className="launch-card-none">no command set</span>
                                    ) : (
                                        <span className="launch-card-cmd">{a.command}</span>
                                    )}
                                    {/* The word, next to the stripe that has
                                        been carrying this alone. A 2px border
                                        and a hover tooltip is not enough
                                        marking for the one card that lets an
                                        agent edit and run anything here without
                                        asking - and a tooltip does not exist at
                                        all for someone driving by keyboard.
                                        Derived from the command, so a preset a
                                        user rolled themselves (or one still
                                        carrying its old name from an install
                                        that predates the rename) is labelled
                                        too. */}
                                    {isUnsafeAgent(a.command) && (
                                        <span className="launch-card-risk">SKIPS PROMPTS</span>
                                    )}
                                    {mark === "unchecked" && <span className="probe-tag">UNCHECKED</span>}
                                    {mark === "not-on-path" && (
                                        <span className="probe-tag qualified">NOT ON PATH</span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}

function cardTip(a: AgentPreset, mark: CardMark): string {
    if (mark === "no-command")
        return a.runMode === "normal"
            ? `Open a plain shell — ${a.name} has no command set`
            : `${a.name} has no command set. Opens Settings → Agents.`
    const base =
        a.runMode === "normal"
            ? `Run: ${a.command}`
            : isUnsafeAgent(a.command)
              ? `Start a ${a.name} session — skips permission prompts, so it can edit and run anything in this project without asking`
              : `Start a ${a.name} session`
    if (mark === "not-on-path")
        return `${base}\nNot found in PowerShell's PATH, which is the one DevDeck reads. It still runs from a shell that has it - Git Bash or WSL - or through an alias.`
    if (mark === "unchecked")
        return `${base}\nDevDeck couldn't read your shell's PATH, so this wasn't checked.`
    return base
}
