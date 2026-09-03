import type { JSX } from "react"
import { useStore } from "../store"
import { useSettings } from "../settings"
import { useProbe } from "../useProbe"
import { probeLine, type ProbeLine } from "../probeView"

/**
 * What a stranger sees on launch, before there is a project.
 *
 * Every one of the eight views' own empty states is either a lie or a
 * distraction with no project open — Mission's loudest object is a list of
 * every listening port on the machine — so `App` routes all of them here and
 * this panel is the whole screen. One object on a void, with the ensō behind
 * it, and `Open a project folder` as the only accent on it.
 *
 * The probe line is why a stranger will not click into silence later: it says
 * whether the agent CLIs DevDeck runs are actually on the PATH a pane will get.
 * It renders **nothing** until the first report lands — a sentence about the
 * PATH before the walk has finished would be a claim nobody made.
 */
export function NoProjects(): JSX.Element {
    const addProject = useStore((s) => s.addProject)
    // The stable slice; the request list is derived inside the hook.
    const agents = useSettings((s) => s.agents)
    const { report } = useProbe(agents)

    return (
        <div className="empty-state">
            <div className="first-run">
                <h1>DevDeck</h1>
                <p className="first-run-lede">
                    A cockpit for the projects you already have: terminals, agent sessions, an
                    editor and git status, one folder at a time.
                </p>
                <button className="accent" onClick={() => void addProject()}>
                    Open a project folder
                </button>
                <p className="first-run-pre">
                    DevDeck runs agent CLIs you install yourself — <code>claude</code>,{" "}
                    <code>codex</code>, <code>gemini</code>.
                </p>
                <p className="first-run-probe">{probeSentence(probeLine(agents, report))}</p>
                <p className="first-run-chord">Ctrl+K reopens this list later.</p>
            </div>
        </div>
    )
}

/** The probe's one line. `null` renders an empty paragraph, which says nothing. */
function probeSentence(line: ProbeLine): JSX.Element | null {
    if (!line) return null
    if (line.kind === "no-presets") return <>You have no agent commands configured yet.</>
    if (line.kind === "none-found")
        return (
            <>
                None were found on your PATH. A shell alias or function still works — but if a
                launch does nothing, this is why.
            </>
        )
    if (line.kind === "unhydrated")
        return <>DevDeck couldn&rsquo;t read your shell&rsquo;s PATH, so it hasn&rsquo;t checked them.</>
    return (
        <>
            Found on your PATH:{" "}
            {line.names.map((n, i) => (
                <span key={n}>
                    {i > 0 ? ", " : ""}
                    <code>{n}</code>
                </span>
            ))}
            {line.more > 0 ? ` +${line.more} more` : ""}.
        </>
    )
}
