/**
 * Hover-select for a keyboard-navigable list, without letting a mouse that is
 * lying still fight the arrow keys.
 *
 * A list that scrolls the selected row into view has a loop in it: ArrowDown
 * moves the cursor, the cursor scrolls the list, and the scroll slides a
 * DIFFERENT row under a pointer that never moved. The browser then refreshes
 * `:hover` at the pointer's resting place - `mouseenter` on the new row, and in
 * Chromium a synthetic `mousemove` carrying the pointer's UNCHANGED
 * coordinates. Selecting on either of those hands the cursor straight back, and
 * the palette did exactly that: ArrowDown advanced about seven rows, snapped
 * back to the row under the mouse, and repeated, so the bottom of the list could
 * not be reached at all. The same mechanism changed what `Ctrl+K, Enter`
 * preselected - the previous project, or whichever project the mouse happened to
 * be resting on.
 *
 * So movement is decided by COORDINATES rather than by an event's name, and the
 * first position we ever see is a sighting rather than a move: the palette opens
 * centred under wherever the mouse already is, and that pointer has not moved
 * just because a surface appeared beneath it. A mouse user loses nothing - the
 * second real `mousemove` is a pixel and a frame away - and a stationary pointer
 * can never win, because it has nothing to have moved from.
 */

/** Where the pointer was, in client coordinates. */
export interface PointerAt {
    x: number
    y: number
}

/**
 * Fold one pointer position into the gate.
 *
 * @param last The last position this list saw, or `null` before it has seen one.
 * @param at Where the pointer is now.
 * @returns The position to remember, and whether the pointer really moved - the
 *   only condition under which hover may take the selection. `at` is always the
 *   newest position, including when it did not select: a sighting that was not
 *   remembered would be compared against a stale point forever, and every scroll
 *   would look like a move.
 */
export function pointerStep(
    last: PointerAt | null,
    at: PointerAt
): { at: PointerAt; moved: boolean } {
    return { at, moved: last !== null && (last.x !== at.x || last.y !== at.y) }
}
