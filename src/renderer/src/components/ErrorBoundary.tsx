import { Component, type ErrorInfo, type ReactNode } from "react"
import { CopyDiagnostics } from "./CopyDiagnostics"

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
        // The console this used to write to alone is unreachable in a packaged
        // app. Reporting is what puts this error in the record the card below
        // then offers to copy - without it the card copies everything except
        // the thing the user is looking at.
        window.api.diagnostics.report({
            source: "ErrorBoundary",
            message: error.message || String(error),
            componentStack: info.componentStack ?? undefined
        })
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
                        {/* The copy control is a function component so it can hold
                            the record's state; the boundary itself must stay a
                            class. `surface="root"` is what selects the label swap
                            over a toast - see CopyDiagnostics. */}
                        <CopyDiagnostics
                            surface="root"
                            actions={
                                <>
                                    <button onClick={() => this.setState({ error: null })}>
                                        Try again
                                    </button>
                                    <button className="accent" onClick={() => location.reload()}>
                                        Reload
                                    </button>
                                </>
                            }
                        />
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}
