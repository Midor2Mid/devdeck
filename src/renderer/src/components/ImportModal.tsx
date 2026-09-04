import { useEffect, useState } from "react"
import { useSettings } from "../settings"
import { parseImport, type ImportResult } from "../importers"
import { ModalBoundary } from "./Modal"

export function ImportModal({ onClose }: { onClose: () => void }): JSX.Element {
    return (
        <ModalBoundary
            title="The import window hit an error"
            description="Nothing was imported: your collections are exactly as they were."
            onClose={onClose}
        >
            <ImportBody onClose={onClose} />
        </ModalBoundary>
    )
}

function ImportBody({ onClose }: { onClose: () => void }): JSX.Element {
    useEffect(() => {
        const h = (e: KeyboardEvent): void => {
            if (e.key === "Escape") onClose()
        }
        window.addEventListener("keydown", h)
        return () => window.removeEventListener("keydown", h)
    }, [onClose])

    const collections = useSettings((s) => s.collections)
    const setCollections = useSettings((s) => s.setCollections)

    const [text, setText] = useState("")
    const [name, setName] = useState("")
    const [result, setResult] = useState<ImportResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    const onText = (value: string): void => {
        setText(value)
        if (!value.trim()) {
            setResult(null)
            setError(null)
            return
        }
        try {
            const r = parseImport(value)
            setResult(r)
            setError(null)
            if (!name) setName(r.name)
        } catch (e) {
            setResult(null)
            setError(e instanceof Error ? e.message : String(e))
        }
    }

    const doImport = (): void => {
        if (!result) return
        const col = {
            id: crypto.randomUUID(),
            name: name.trim() || result.name || "Imported",
            requests: result.requests
        }
        setCollections([...collections, col])
        onClose()
    }

    return (
        <div className="env-backdrop" onClick={onClose}>
            <div className="import-modal" onClick={(e) => e.stopPropagation()}>
                <div className="env-head">
                    <h3>Import requests</h3>
                    <button onClick={onClose}>Close</button>
                </div>
                <p className="muted small env-hint">
                    Paste a <strong>Postman collection</strong>, an <strong>OpenAPI/Swagger</strong>{" "}
                    document (JSON), or a <strong>curl</strong> command. They&apos;ll become a new
                    collection.
                </p>

                <textarea
                    className="import-text"
                    placeholder={'Paste JSON or a curl command here…'}
                    value={text}
                    onChange={(e) => onText(e.target.value)}
                />

                {error && <div className="import-error">{error}</div>}
                {result && (
                    <div className="import-ok">
                        Detected <strong>{result.requests.length}</strong>{" "}
                        request{result.requests.length === 1 ? "" : "s"}.
                    </div>
                )}

                <label className="save-field">
                    <span>Collection</span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="New collection name"
                    />
                </label>

                <div className="save-actions">
                    <button onClick={onClose}>Cancel</button>
                    <button className="accent" onClick={doImport} disabled={!result}>
                        Import{result ? ` ${result.requests.length}` : ""}
                    </button>
                </div>
            </div>
        </div>
    )
}
