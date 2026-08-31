import { Component, type ErrorInfo, type ReactNode } from "react"

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

    static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
        if (state.error && state.key !== undefined && props.resetKey !== state.key) {
            return { error: null, key: undefined }
        }
        if (state.error && state.key === undefined) return { key: props.resetKey ?? null }
        return null
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error(`[devdeck] ${this.props.title} failed:`, error, info.componentStack)
    }

    render(): ReactNode {
        if (!this.state.error) return this.props.children
        return (
            <div className="region-crash">
                <div className="region-crash-card">
                    <h3>{this.props.title}</h3>
                    <p className="muted">{this.props.description}</p>
                    <pre className="crash-msg">{this.state.error.message}</pre>
                    <button onClick={() => this.setState({ error: null, key: undefined })}>
                        Try again
                    </button>
                </div>
            </div>
        )
    }
}
