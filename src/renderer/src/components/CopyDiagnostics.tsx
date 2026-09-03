import { useCallback, useEffect, useRef, useState } from "react"
import {
    COPIED_LABEL,
    COPIED_LABEL_MS,
    COPY_LABEL,
    copyDiagnostics,
    DIAGNOSTICS_COPIED_TOAST,
    DIAGNOSTICS_REFUSED,
    DIAGNOSTICS_SENTENCE,
    DIAGNOSTICS_UNAVAILABLE,
    REFUSED_LABEL,
    type DiagnosticsSurface
} from "../diagnostics"
import { toast } from "../toast"

/** What one mounted copy control knows. Rendered by the three surfaces. */
export interface CopyDiagnosticsState {
    /**
     * `asking` is not `unavailable`. Nobody has answered yet, so the control is
     * live and the click will find out - the same distinction the record itself
     * draws between `null` and an empty list.
     */
    status: "asking" | "ready" | "unavailable"
    label: string
    /**
     * A real `disabled`, unlike the launcher card's `aria-disabled`: there is no
     * fix-it click to preserve here. A record DevDeck could not read is not
     * something the user can repair by clicking the copy button again.
     */
    disabled: boolean
    onClick: () => void
    /** The §5.1 sentence, replaced wholesale when the record is unavailable. */
    sentence: string
    /** Prose from the record about what is partial. `[]` means nothing was. */
    incomplete: string[]
    /** The exact text the clipboard gets, once a record has been read. */
    text: string | null
    /** Set only when the clipboard refused - the text the user selects by hand. */
    fallback: string | null
}

/**
 * The copy control's four states, for one surface.
 *
 * The record is read on mount as well as on click. On mount because the fourth
 * state - "DevDeck could not read its own log" - has to be visible *before* the
 * click: a button that offers to copy nothing and then succeeds is the exact
 * class of lie this feature exists to remove. On click because an error
 * reported since mount belongs in the blob the user is about to paste.
 *
 * Feedback splits by surface and that split is a fact about the component tree,
 * not a preference: `<Toasts/>` renders inside `<App/>` inside `<ErrorBoundary/>`
 * (main.tsx), so on a **root** crash the toast layer is not mounted and a toast
 * would confirm nothing. There, the label swaps. Everywhere else the app is
 * intact and the existing toast is used, with the label left alone.
 */
export function useCopyDiagnostics(surface: DiagnosticsSurface): CopyDiagnosticsState {
    const [status, setStatus] = useState<"asking" | "ready" | "unavailable">("asking")
    const [feedback, setFeedback] = useState<"idle" | "copied" | "refused">("idle")
    const [text, setText] = useState<string | null>(null)
    const [incomplete, setIncomplete] = useState<string[]>([])
    const [fallback, setFallback] = useState<string | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        let cancelled = false
        window.api.diagnostics
            .record()
            .then((r) => {
                if (cancelled) return
                if (!r.ok) {
                    setStatus("unavailable")
                    return
                }
                setStatus("ready")
                setText(r.text)
                setIncomplete(r.record.incomplete)
            })
            .catch((err) => {
                // The bridge itself failed, which is the same fact as an
                // unreadable log from where the user sits: we cannot produce
                // the blob. Saying so beats a button that will fail on click.
                console.error("[diagnostics] could not read the record:", err)
                if (!cancelled) setStatus("unavailable")
            })
        return () => {
            cancelled = true
            if (timer.current) clearTimeout(timer.current)
        }
    }, [])

    const onClick = useCallback(() => {
        if (timer.current) clearTimeout(timer.current)
        copyDiagnostics()
            .then((out) => {
                if (out.kind === "unavailable") {
                    setStatus("unavailable")
                    setFeedback("idle")
                    setFallback(null)
                    return
                }
                setStatus("ready")
                setText(out.text)
                setIncomplete(out.record.incomplete)
                if (out.kind === "refused") {
                    // No timer: the fallback text has to stay until the user has
                    // had a chance to select it.
                    setFeedback("refused")
                    setFallback(out.text)
                    return
                }
                setFallback(null)
                if (surface === "root") {
                    setFeedback("copied")
                    timer.current = setTimeout(() => setFeedback("idle"), COPIED_LABEL_MS)
                } else {
                    toast(DIAGNOSTICS_COPIED_TOAST)
                }
            })
            .catch((err) => {
                console.error("[diagnostics] copy failed:", err)
                setStatus("unavailable")
            })
    }, [surface])

    return {
        status,
        label:
            feedback === "copied" ? COPIED_LABEL : feedback === "refused" ? REFUSED_LABEL : COPY_LABEL,
        disabled: status === "unavailable",
        onClick,
        sentence: status === "unavailable" ? DIAGNOSTICS_UNAVAILABLE : DIAGNOSTICS_SENTENCE[surface],
        incomplete: status === "unavailable" ? [] : incomplete,
        text,
        fallback
    }
}

/**
 * The line under the control, plus anything the record admits it is missing.
 *
 * `incomplete` is rendered verbatim and never summarised. A record that dropped
 * something and looks whole is the failure the whole record exists to remove,
 * and the sentences come from main precisely so this component cannot soften
 * them. It is marked with a dashed rule, the same "this value is qualified"
 * grammar the presence markers use, so it reads as qualified with hue off.
 */
export function DiagnosticsNote({
    state,
    className
}: {
    state: CopyDiagnosticsState
    className?: string
}): JSX.Element {
    return (
        <>
            <p className={className ?? "diag-note"}>{state.sentence}</p>
            {state.incomplete.length > 0 && (
                <ul className="diag-incomplete">
                    {state.incomplete.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            )}
            {state.fallback !== null && (
                <>
                    <p className="diag-note">{DIAGNOSTICS_REFUSED}</p>
                    <pre className="crash-msg" style={{ userSelect: "text" }}>
                        {state.fallback}
                    </pre>
                </>
            )}
        </>
    )
}

/**
 * The whole affordance for a crash card: the actions row with `Copy
 * diagnostics` first, then whatever that card's own actions are, then the note.
 *
 * The two cards differ only in their row class and their surface, so they share
 * this rather than each growing a copy of the four states. Settings → About
 * composes the hook directly instead, because its block also carries the
 * `Show what's copied` toggle and does not use a crash card's shape.
 */
export function CopyDiagnostics({
    surface,
    actions
}: {
    surface: "root" | "region"
    actions?: JSX.Element
}): JSX.Element {
    const state = useCopyDiagnostics(surface)
    return (
        <>
            <div className={surface === "root" ? "crash-actions" : "region-crash-actions"}>
                <button disabled={state.disabled} onClick={state.onClick}>
                    {state.label}
                </button>
                {actions}
            </div>
            <DiagnosticsNote state={state} />
        </>
    )
}
