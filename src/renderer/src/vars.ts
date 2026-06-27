// {{variable}} substitution for the API client, fed by the active environment.

import type { KvRow } from "./components/KeyValueEditor"

export type VarMap = Record<string, string>

const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g

/** Build a name→value map from an environment's enabled variable rows. */
export function buildVarMap(rows: KvRow[] | undefined): VarMap {
    const map: VarMap = {}
    for (const r of rows ?? []) {
        if (r.enabled && r.key.trim() !== "") map[r.key.trim()] = r.value
    }
    return map
}

/** Replace {{name}} with its value; unknown names are left untouched. */
export function substitute(text: string, map: VarMap): string {
    if (!text) return text
    return text.replace(TOKEN, (whole, name) => (name in map ? map[name] : whole))
}

/** Distinct {{names}} in the text that are NOT in the map (for warnings). */
export function findUnresolved(text: string, map: VarMap): string[] {
    const out = new Set<string>()
    if (text) {
        let m: RegExpExecArray | null
        TOKEN.lastIndex = 0
        while ((m = TOKEN.exec(text)) !== null) {
            if (!(m[1] in map)) out.add(m[1])
        }
    }
    return [...out]
}
