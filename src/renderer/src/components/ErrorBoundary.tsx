import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
    children: ReactNode
}
interface State {
    error: Error | null
}

/** Stops a renderer exception from white-screening the whole app. */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null }

    static getDerivedStateFromError(error: Error): State {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error("[devdeck] render error:", error, info.componentStack)
    }

    render(): ReactNode {
        if (this.state.error) {
            return (
                <div className="crash">
                    <div className="crash-card">
                        <h2>Something broke in the UI</h2>
                        <p className="muted">
                            The interface hit an error. Your terminals and sessions are still
                            running in the background.
                        </p>
                        <pre className="crash-msg">{this.state.error.message}</pre>
                        <div className="crash-actions">
                            <button onClick={() => this.setState({ error: null })}>Try again</button>
                            <button className="accent" onClick={() => location.reload()}>
                                Reload
                            </button>
                        </div>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}
