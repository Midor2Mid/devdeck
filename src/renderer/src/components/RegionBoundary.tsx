import { Component, type ErrorInfo, type ReactNode } from "react"
import { CopyDiagnostics } from "./CopyDiagnostics"

interface Props {
    /** What broke, named the way the user names it ("The Database view"). */
    title: string
    /** What is still working. Must be true — this copy is read while trusting it. */
    description: string
    /**
     * Changing this clears the error and re-renders the region.
     *
     * The point of a region boundary is that the rest of the cockpit keeps
     * working, so the natural retry is the navigation the user was going to do
     * anyway: switch views and come back. Deliberately NOT the active project or
     * session — those change on hot paths, and remounting a region under an
     * agent every time you switch projects is worse than the crash.
     */
    resetKey?: string | null
    /**
     * Renders the card as a fixed overlay instead of filling its slot.
     *
     * A modal's boundary sits at the end of the app tree, not inside a panel:
     * without this the card would take `flex: 1` in the app column and shove the
     * deck off screen while claiming only one region had failed.
     */
    overlay?: boolean
    /**
     * An extra action beside `Try again`.
     *
     * A crashed modal has taken its own close button down with it, so the
     * boundary around one has to supply the way out. Without it the card is a
     * dead end and the only escape is a reload — which is the whole-app failure
     * this boundary exists to avoid.
     */
    actions?: ReactNode
    children: ReactNode
}

interface State {
    error: Error | null
    /** The resetKey the current error was recorded under. */
    key: string | null | undefined
}

/**
 * A boundary around ONE region of the cockpit.
 *
 * The root boundary (main.tsx) stays: it is what catches a throw outside any
 * region. What this adds is that a throw inside one panel no longer takes the
 * whole window with it. That matters here more than it would in an ordinary app,
 * because the thing being protected is not the UI — it is the ability to SEE the
 * agents. Several ptys keep running in main when the renderer dies, and a blank
 * cockpit means they run on, invisibly, with nothing able to answer them.
 *
 * No visual surface of its own beyond the crash card, so it costs nothing across
 * the theme × style matrix.
 */
export class RegionBoundary extends Component<Props, State> {
    state: State = { error: null, key: undefined }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error }
    }

    /**
     * A boundary WITHOUT a `resetKey` never clears itself. Only `Try again`
     * does.
     *
     * The previous version stored `props.resetKey ?? null` when it latched, so
     * a boundary with no such prop recorded `null` — and on the very next
     * render compared `undefined !== null`, which is true, and cleared the
     * error. Deleting `resetKey={view}` therefore did not delete the reset: it
     * widened the trigger from "the view changed" to "App re-rendered for any
     * reason", and `App` re-renders on agent status, sessions, tabs and
     * projects. A latched region then re-threw once per re-render, and 60 deck
     * clicks turned one crash into 60 reports - 30 accepted, 30 refused by the
     * sink's rate limit, which discards any OTHER error in that window and
     * fills the record's own Incomplete block with an apology. That defeats the
     * feature this boundary was wired into.
     */
    static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
        if (!state.error) return null
        if (props.resetKey === undefined) return null
        if (state.key === undefined) return { key: props.resetKey }
        if (props.resetKey !== state.key) return { error: null, key: undefined }
        return null
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error(`[devdeck] ${this.props.title} failed:`, error, info.componentStack)
        // A region can latch broken behind a view nobody is looking at, which is
        // the case the record was built for: without this report the only
        // evidence of it lives in a devtools window nobody has open.
        window.api.diagnostics.report({
            source: `RegionBoundary: ${this.props.title}`,
            message: error.message || String(error),
            componentStack: info.componentStack ?? undefined
        })
    }

    render(): ReactNode {
        if (!this.state.error) return this.props.children
        return (
            <div className={this.props.overlay ? "region-crash overlay" : "region-crash"}>
                <div className="region-crash-card">
                    <h3>{this.props.title}</h3>
                    <p className="muted">{this.props.description}</p>
                    <pre className="crash-msg">{this.state.error.message}</pre>
                    <CopyDiagnostics
                        surface="region"
                        actions={
                            <>
                                <button onClick={() => this.setState({ error: null, key: undefined })}>
                                    Try again
                                </button>
                                {this.props.actions}
                            </>
                        }
                    />
                </div>
            </div>
        )
    }
}
