import { describe, it, expect } from "vitest"
import { paintsNewText, paintedTail } from "../src/renderer/src/paneEcho"

/** What a shell emits when its pty is resized: erase the line, repaint it. */
const REDRAW = "\x1b[2K\r"
const CRLF = "\r\n"

/** A screen record, in the shape `getFullTail` hands over. */
const screen = (...lines: string[]): string => lines.join("\n")

describe("paneEcho (did this chunk change the screen?)", () => {
    it("keeps only the printable lines a chunk paints", () => {
        expect(paintedTail(REDRAW + "Ready for review.")).toBe("Ready for review.")
        expect(paintedTail("\x1b]0;a title\x07")).toBe("")
        expect(paintedTail("\x07")).toBe("")
    })

    /**
     * The two chunks a tab remount produces, and neither is news.
     *
     * 1: main replays the WHOLE kept buffer on re-attach, which is longer than
     * the screen record and ends with it. 2: the remounted pane refits, which
     * resizes the pty, which makes the far end repaint - shorter than the
     * screen record, and equal to its tail.
     */
    it("is not news when a replayed buffer ends with the screen already showing", () => {
        const s = screen("reading store.ts", "Refactored 4 files.", "Ready for review.")
        const buffer =
            "claude 3.7" + CRLF + "reading store.ts" + CRLF + "Refactored 4 files." + CRLF +
            "Ready for review." + CRLF
        expect(paintsNewText(s, buffer)).toBe(false)
    })

    it("is not news when a repaint reproduces the last line", () => {
        const s = screen("Refactored 4 files.", "Ready for review.")
        expect(paintsNewText(s, REDRAW + "Ready for review.")).toBe(false)
    })

    it("is not news when a chunk paints no characters at all", () => {
        const s = screen("Ready for review.")
        expect(paintsNewText(s, "\x1b[6n")).toBe(false)
        expect(paintsNewText(s, "\x1b]0;claude\x07")).toBe(false)
    })

    /** A session with no known screen: its first characters are always news. */
    it("is news when nothing is known to be on screen yet", () => {
        expect(paintsNewText("", "thinking...")).toBe(true)
        expect(paintsNewText("", "\x1b[2K")).toBe(false)
    })

    it("is news when the agent adds a line", () => {
        const s = screen("Refactored 4 files.", "Ready for review.")
        expect(paintsNewText(s, "reading store.ts" + CRLF)).toBe(true)
    })

    it("is news when the repaint changes one character", () => {
        const s = screen("Ready for review.")
        expect(paintsNewText(s, REDRAW + "Ready for review!")).toBe(true)
    })

    /**
     * The misfire this must not have. A resuming agent whose chunk ENDS by
     * redrawing the line that was already there has still said something new
     * above it, and the comparison runs over the overlap, so it sees that.
     * Getting this wrong would trade a 6s false `WORKING` for a false "your
     * move" lasting a whole turn - the worse of the two by far.
     */
    it("is news when a chunk adds a line above one the screen already showed", () => {
        const s = screen("waiting for input", "> ")
        expect(paintsNewText(s, "Thinking..." + CRLF + "> ")).toBe(true)
    })

    it("is news when a resumed agent repaints the screen with the next step on it", () => {
        const s = screen("step 1 done", "step 2 done")
        expect(paintsNewText(s, REDRAW + "step 1 done" + CRLF + "step 2 done" + CRLF + "step 3 done")).toBe(true)
    })
})
