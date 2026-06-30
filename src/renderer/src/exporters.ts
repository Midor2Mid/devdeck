// Pure serializers for exporting tabular results (DB grids) to CSV / JSON.
// Kept dependency-free and separate from the panels so they're unit-testable.

function csvCell(v: unknown): string {
    if (v == null) return ""
    const s = typeof v === "object" ? JSON.stringify(v) : String(v)
    // Quote when the value contains a comma, quote, CR or LF; double embedded quotes.
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** RFC-4180-ish CSV (CRLF line endings, quoted as needed). */
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
    const header = columns.map(csvCell).join(",")
    const lines = rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))
    return [header, ...lines].join("\r\n")
}

/** Pretty JSON array of row objects. */
export function toJson(rows: Record<string, unknown>[]): string {
    return JSON.stringify(rows, null, 2)
}
