import { useCallback, useEffect, useRef, useState } from "react"
import type { ProbeReport } from "../../shared/probe"
import { probeRequests, type ProbeSubject } from "./probeView"

/**
 * The PATH probe, for one mounted surface.
 *
 * Deliberately **not** cached in a store. The walk is microseconds and the
 * login-shell PATH is hydrated once per app process, so a fresh call on mount
 * costs ~40ms of IPC and can never show a mark that describes a command the
 * user has since edited. `Re-check` is the only thing that re-spawns a shell.
 *
 * The effect re-runs when the preset list's commands change, keyed on a
 * **string** signature rather than the array — a fresh array in a dependency
 * list (or a zustand selector) is the render loop nothing in this repo's build
 * or typecheck catches. Debounced, because in Settings that list changes on
 * every keystroke in a command field.
 */
export function useProbe(presets: ProbeSubject[]): {
    /** `null` until the first report lands: no report is not a probe state. */
    report: ProbeReport | null
    /** A `Re-check` is in flight — it re-spawns a shell and can take seconds. */
    rechecking: boolean
    recheck: () => void
} {
    const [report, setReport] = useState<ProbeReport | null>(null)
    const [rechecking, setRechecking] = useState(false)
    // Read inside callbacks so `recheck` never changes identity with the list.
    const latest = useRef(presets)
    latest.current = presets

    const sig = presets.map((p) => `${p.id}\x00${p.command}\x00${p.runMode}`).join("\x01")

    useEffect(() => {
        let cancelled = false
        const timer = setTimeout(() => {
            window.api.probe
                .commands(probeRequests(latest.current))
                .then((r) => {
                    if (!cancelled) setReport(r)
                })
                .catch((err) => {
                    // Leaving `report` as it was is the honest failure: an
                    // unmarked card claims nothing, where a marked one would.
                    console.error("[probe] could not check the PATH:", err)
                })
        }, 120)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [sig])

    const recheck = useCallback(() => {
        setRechecking(true)
        window.api.probe
            .commands(probeRequests(latest.current), true)
            .then((r) => setReport(r))
            .catch((err) => console.error("[probe] re-check failed:", err))
            .finally(() => setRechecking(false))
    }, [])

    return { report, rechecking, recheck }
}
