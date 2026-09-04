/**
 * Swallow the second half of a double-click on a launch control.
 *
 * A launch card and the tab bar's `+ <agent>` are single-click controls, and
 * Windows delivers a double-click to one as two clicks — so a stray
 * double-click started TWO sessions. For an agent that is two paid CLI
 * processes, which is what makes this money rather than a cosmetic defect.
 *
 * The record is module-level, not per-component, deliberately: the launcher and
 * the tab bar are different components that offer the same act, and a
 * double-click that lands one click on each is the same mistake.
 *
 * **Not a general debounce, and not in `newTab`.** The window is the OS
 * double-click threshold, so someone who genuinely wants a second session a
 * moment later still gets one. It lives at the click sites rather than in the
 * store because `newTab` is also driven programmatically — restoring a saved
 * layout creates several shells in a burst, all with the id `shell`, and a
 * guard in the store would silently drop all but the first.
 */

/** The OS double-click threshold. */
export const DOUBLE_CLICK_MS = 500

let last: { id: string; at: number } = { id: "", at: 0 }

/**
 * May a launch of `id` proceed? Records the launch when it may.
 *
 * `now` is injectable so this is testable without a clock.
 */
export function shouldLaunch(id: string, now: number = Date.now()): boolean {
    if (last.id === id && now - last.at < DOUBLE_CLICK_MS) return false
    last = { id, at: now }
    return true
}

/** Test seam only: forget the last launch. */
export function resetLaunchGuard(): void {
    last = { id: "", at: 0 }
}
