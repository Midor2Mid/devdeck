// Reusable Postman-style key/value table (params, headers, form bodies).
// Each row has an enable/disable checkbox; there is always one trailing empty
// row so typing into it adds a new entry without losing focus.

// Collision-safe ids — rows may be persisted (e.g. environment variables) and
// later mixed with freshly minted rows in the same list.
const nextId = (): string => `kv-${crypto.randomUUID()}`

export interface KvRow {
    id: string
    enabled: boolean
    key: string
    value: string
}

export function emptyRow(): KvRow {
    return { id: nextId(), enabled: true, key: "", value: "" }
}

/** Build rows from plain pairs (e.g. parsed from a URL or cURL), plus a trailing blank. */
export function rowsFromPairs(pairs: Array<{ key: string; value: string }>): KvRow[] {
    return [...pairs.map((p) => ({ id: nextId(), enabled: true, key: p.key, value: p.value })), emptyRow()]
}

/** Ensure exactly one trailing empty row; drop other empties. Preserves row ids. */
function normalize(rows: KvRow[]): KvRow[] {
    const nonEmpty = rows.filter((r) => r.key !== "" || r.value !== "")
    return [...nonEmpty, emptyRow()]
}

interface Props {
    rows: KvRow[]
    onChange: (rows: KvRow[]) => void
    keyPlaceholder?: string
    valuePlaceholder?: string
}

export function KeyValueEditor({
    rows,
    onChange,
    keyPlaceholder = "key",
    valuePlaceholder = "value"
}: Props): JSX.Element {
    const display = rows.length ? rows : [emptyRow()]

    const patch = (id: string, p: Partial<KvRow>): void => {
        onChange(normalize(display.map((r) => (r.id === id ? { ...r, ...p } : r))))
    }
    const remove = (id: string): void => {
        onChange(normalize(display.filter((r) => r.id !== id)))
    }

    return (
        <div className="kv-editor">
            {display.map((r, idx) => {
                const isLast = idx === display.length - 1
                const isGhost = isLast && r.key === "" && r.value === ""
                return (
                    <div className={"kv-row" + (isGhost ? " ghost" : "")} key={r.id}>
                        <input
                            type="checkbox"
                            className="kv-check"
                            checked={r.enabled}
                            disabled={isGhost}
                            onChange={(e) => patch(r.id, { enabled: e.target.checked })}
                            title={r.enabled ? "Enabled" : "Disabled"}
                        />
                        <input
                            className="kv-key"
                            placeholder={keyPlaceholder}
                            value={r.key}
                            onChange={(e) => patch(r.id, { key: e.target.value })}
                        />
                        <input
                            className="kv-val"
                            placeholder={valuePlaceholder}
                            value={r.value}
                            onChange={(e) => patch(r.id, { value: e.target.value })}
                        />
                        <button
                            className="kv-del"
                            tabIndex={-1}
                            onClick={() => remove(r.id)}
                            disabled={isGhost}
                            title="Remove"
                        >
                            ×
                        </button>
                    </div>
                )
            })}
        </div>
    )
}
