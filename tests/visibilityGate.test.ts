import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
// `clearActed`: the act axis is a module Set inside the store, reset per
// session the same way the tail is - a case that leaked it into the next one
// would pass for the wrong reason.
import { useStore, clearActed } from "../src/renderer/src/store"
import { useSettings } from "../src/renderer/src/settings"
import { leaf } from "../src/renderer/src/layout"
import { forgetTail } from "../src/renderer/src/missionTail"

const TERM = "t-vis"
const BEL = "\x07"
/** What a shell emits when its pty is resized: erase the line, repaint it. */
const REDRAW = "\x1b[2K\r"
/** A CRLF pair and a bare CR, so a chunk can carry a real line ending. */
const CR = "\r"
const CRLF = "\r\n"

let ptyData: (e: { id: string; data: string }) => void = () => undefined
let beeps = 0

/** Only the namespaces this path touches, as in tests/paneHold.test.ts. */
function stubApi(): void {
    ;(globalThis as unknown as { window: Record<string, unknown> }).window = {
        // `beep()` builds an AudioContext off `window`; a recording constructor
        // is the only observable this soft signal has.
        AudioContext: class {
            createOscillator(): unknown {
                return { connect: () => undefined, frequency: {}, start: () => undefined, stop: () => undefined }
            }
            createGain(): unknown {
                return { connect: () => undefined, gain: {} }
            }
            get destination(): unknown {
                return {}
            }
            get currentTime(): number {
                return 0
            }
            close(): void {
                return undefined
            }
            constructor() {
                beeps++
            }
        },
        api: {
            pty: {
                onData: (fn: (e: { id: string; data: string }) => void): (() => void) => {
                    ptyData = fn
                    return (): void => undefined
                },
                onExit: (): (() => void) => (): void => undefined,
                kill: (): void => undefined,
                input: (): void => undefined,
                buffer: async (): Promise<{ buffer: string; exitCode: number | undefined }> => ({
                    buffer: "",
                    exitCode: undefined
                })
            },
            // Desktop notifications are main's now (src/main/notify.ts); the
            // renderer only subscribes to a click on one. `init()` throws without
            // it, and these stubs are untyped casts, so nothing else would notice.
            notify: {
                state: async (): Promise<{ supported: boolean; error: string | null }> => ({
                    supported: true,
                    error: null
                }),
                attention: async (): Promise<{ supported: boolean; error: string | null }> => ({
                    supported: true,
                    error: null
                }),
                onActivate: (): (() => void) => (): void => undefined
            },
            triggers: { onFired: (): (() => void) => (): void => undefined },
            projects: {
                list: async (): Promise<{ projects: unknown[]; activeId: string | null }> => ({
                    projects: [],
                    activeId: null
                }),
                // jumpToTerm - the glance - switches the active project too.
                setActive: async (): Promise<void> => undefined
            },
            workspace: {
                load: async () => ({ ok: false as const, reason: "missing" as const }),
                save: (): void => undefined
            },
            settings: { save: (): void => undefined },
            ledger: { append: (): void => undefined, read: async (): Promise<unknown[]> => [] },
            git: { changes: async (): Promise<{ path: string }[]> => [] }
        }
    }
}

/** One agent session. `watching` decides whether `isVisible(TERM)` is true. */
function seed(watching: boolean): void {
    forgetTail(TERM)
    useStore.setState({
        view: watching ? "terminal" : "mission",
        activeId: "p1",
        projects: [{ id: "p1", name: "P1", path: "/repo", addedAt: Date.now() }],
        termAgents: { [TERM]: "claude" },
        termCwd: {},
        agentStatus: {},
        paneHold: {},
        tabsByProject: { p1: [{ id: "tab1", name: "claude 1", root: leaf(TERM) }] },
        activeTabByProject: { p1: "tab1" },
        activePaneByProject: watching ? { p1: TERM } : {},
        notifications: [],
        activity: [],
        boardTasks: [],
        seen: {},
        answered: {}
    })
    clearActed(TERM)
    beeps = 0
}

// M4: the state that caused the signal was destroyed by looking at it. The
// identical byte sequence from the identical agent produced a notification when
// you were in your browser and NO STATE CHANGE AT ALL when you were on the pane
// — so no user could reproduce, confirm, or falsify a DevDeck attention claim.
// Visibility now gates the notification only. These tests are the falsifiability
// the mechanism was missing.
describe("visibility gates the notification, not the classification", () => {
    beforeAll(async () => {
        stubApi()
        await useStore.getState().init()
        useSettings.setState({ agentIdleMs: 50, notifications: { desktop: false, sound: false, waitingSound: true } })
    })

    beforeEach(() => {
        vi.useFakeTimers()
    })

    it("marks a session you are WATCHING as waiting when it goes quiet", async () => {
        seed(true)
        ptyData({ id: TERM, data: "thinking..." })
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        await vi.advanceTimersByTimeAsync(200)
        // Was "idle" — the pane you were looking at recorded nothing at all.
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        vi.useRealTimers()
    })

    it("still withholds the sound for a pane you are already looking at", async () => {
        seed(true)
        ptyData({ id: TERM, data: "thinking..." })
        await vi.advanceTimersByTimeAsync(200)
        expect(beeps).toBe(0)
        vi.useRealTimers()
    })

    it("marks a background session as waiting AND makes the sound", async () => {
        seed(false)
        ptyData({ id: TERM, data: "thinking..." })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        expect(beeps).toBe(1)
        vi.useRealTimers()
    })

    it("records a bell from a session you are watching", () => {
        seed(true)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        // Was: no status change at all, so the tile said nothing had happened.
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        vi.useRealTimers()
    })

    it("does not raise an in-app notification for a bell you are looking at", () => {
        seed(true)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().notifications).toEqual([])
        vi.useRealTimers()
    })

    it("raises the notification for a bell you are not looking at", () => {
        seed(false)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        expect(useStore.getState().notifications).toHaveLength(1)
        vi.useRealTimers()
    })

    /**
     * The walkthrough's finding 4, at the byte level.
     *
     * `if (status !== "attention" || visible) setStatus(id, "working")` let the
     * pane you were LOOKING at decide the classification: a bell rang, the agent
     * printed one more line - which most of them do straight away - and the `!`
     * was gone for good, because nothing re-raises a bell that already fired.
     * Off the pane, the identical bytes kept the flag.
     */
    it("keeps an unanswered bell through the agent's own next line, while you watch", () => {
        seed(true)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")

        ptyData({ id: TERM, data: "(waiting for your answer)" })

        // Was "working": one line of the agent's own output erased the flag.
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        vi.useRealTimers()
    })

    it("keeps it through the next line for a pane you are not watching too", () => {
        seed(false)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        ptyData({ id: TERM, data: "(waiting for your answer)" })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        vi.useRealTimers()
    })

    /**
     * What DOES end an attention event: an act, plus evidence the agent moved
     * on. `respondApproval` acknowledges the session, and the next output is
     * then a real reason to call it working again - so the flag is not
     * unclearable, it just cannot be cleared by having been looked at.
     */
    it("lets output clear a bell the user has already answered", () => {
        seed(true)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        useStore.getState().respondApproval(TERM, "y\r")

        ptyData({ id: TERM, data: "ok, editing store.ts" })

        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        // A fresh state is news again: the acknowledgement does not carry over.
        expect(useStore.getState().seen[TERM]).toBeUndefined()
        vi.useRealTimers()
    })

    /**
     * Finding 4 of the 2026-09-09 verification, and the route by which the
     * original defect survived its own fix.
     *
     * `ack` had stopped rewriting the status and output had stopped clearing an
     * unseen bell - but the gate deciding whether output MAY clear one read
     * `seen`, and a GLANCE sets `seen`. So clicking the key acknowledged the
     * session, the pane became visible, xterm refitted, the pty resized, the
     * shell repainted - and that byte, which the user caused nothing of, was
     * read as the agent moving on. `setStatus` then dropped `seen` too, which
     * is why qa saw a key wearing neither the `!` nor the dimmed form the fix
     * had added: `status-working`, no glyph, and Mission reading WORKING over a
     * question the agent was plainly still blocked on.
     */
    it("keeps the question when you only GLANCE at the pane, redraw byte and all", () => {
        seed(false)
        ptyData({ id: TERM, data: "Do you want to proceed? [y/n]" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")

        // The ordinary "let me look at that one" gesture: a deck key click.
        useStore.getState().jumpToTerm(TERM)
        // Becoming visible refits xterm, which resizes the pty, which makes the
        // shell repaint its prompt. Nobody answered anything.
        // ESC[2K + CR: erase the line and repaint it, which is what a shell
        // does when its pty is resized.
        ptyData({ id: TERM, data: REDRAW + "Do you want to proceed? [y/n]" })

        // The pair the ruling asks for: acknowledged, and still asking.
        expect(useStore.getState().seen[TERM]).toBe(true)
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        vi.useRealTimers()
    })

    /**
     * The act DevDeck cannot see from the store, and the reason the gate needs
     * its own axis rather than `answered`: most people answer a prompt by
     * typing into the terminal. Without this the session would sit on
     * `attention` until it rang again - a nag over an agent that has moved on,
     * which is the same lie pointing the other way.
     */
    it("lets output clear a question you typed the answer to yourself", () => {
        seed(true)
        ptyData({ id: TERM, data: "may I edit store.ts?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe("attention")

        useStore.getState().notePaneInput(TERM)
        ptyData({ id: TERM, data: "ok, editing store.ts" })

        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        vi.useRealTimers()
    })

    /**
     * The asymmetry that keeps the act axis out of the visibility trap: an
     * answer authorises output to end the question it answered, and nothing
     * later. The bell itself resets it - not the status transition, because a
     * second bell on an already-`attention` session takes no transition at all.
     */
    it("does not let an answered question authorise erasing the next one", () => {
        seed(false)
        ptyData({ id: TERM, data: "first question?" + BEL })
        useStore.getState().respondApproval(TERM, "y\r")
        ptyData({ id: TERM, data: "ok" })
        expect(useStore.getState().agentStatus[TERM]).toBe("working")

        ptyData({ id: TERM, data: "second question?" + BEL })
        ptyData({ id: TERM, data: "(waiting for your answer)" })

        expect(useStore.getState().agentStatus[TERM]).toBe("attention")
        vi.useRealTimers()
    })

    it("produces the same classification from the same bytes either way", () => {
        // The whole point, stated once: watched and unwatched must agree about
        // what the agent did, and differ only about whether you are told.
        seed(true)
        ptyData({ id: TERM, data: "question?" + BEL })
        const watched = useStore.getState().agentStatus[TERM]
        seed(false)
        ptyData({ id: TERM, data: "question?" + BEL })
        expect(useStore.getState().agentStatus[TERM]).toBe(watched)
        vi.useRealTimers()
    })

    /**
     * The residual half of finding 4, S1 of the 2026-09-09 spot-check.
     *
     * The gate the attention fix installed named ONE state, so a `waiting`
     * session - the other hand-over, the one the tile writes "Ready for review"
     * under - was still reclassified by its own repaint byte: `WORKING` with a
     * pulsing dot on the key and on the tile for the two to four seconds until
     * the idle timer put it back. It self-healed, which made it a smaller lie
     * than the attention case and the same lie: the word WORKING printed over a
     * finished turn, and `setStatus` dropping `seen` on the way through, so the
     * acknowledgement the glance had just earned was spent as well.
     */
    it("keeps WAITING when you only GLANCE at a session that handed back", async () => {
        seed(false)
        ptyData({ id: TERM, data: "Refactored 4 files. Ready for review." })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        // The ordinary "let me look at that one" gesture, then the byte it
        // causes: becoming visible refits xterm, which resizes the pty, which
        // makes the far end repaint. Nobody asked for any work.
        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: REDRAW + "Refactored 4 files. Ready for review." })

        // Was "working" at the first 150ms sample, over the agent's own
        // "Ready for review".
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        // And the pair the ruling asks for: acknowledged, and still handed back.
        expect(useStore.getState().seen[TERM]).toBe(true)
        vi.useRealTimers()
    })

    /**
     * The other half of the same rule, and the reason the gate cannot simply
     * copy attention's: `waiting` is PROVISIONAL. It is a 6s silence threshold,
     * and an agent that pauses that long mid-turn - waiting on an API, running
     * a test suite - is normal. Its own continued output is what refutes the
     * threshold, so blocking that would trade a 2-4s false WORKING for a false
     * "your move" that lasts as long as the turn does and never self-heals.
     */
    it("lets the agent's own continued output end a hand-back", async () => {
        seed(false)
        ptyData({ id: TERM, data: "thinking..." })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        // Two chunks, because one is what a repaint is. An agent that has
        // actually resumed keeps talking, and the second chunk lands in the
        // same burst as the first.
        ptyData({ id: TERM, data: "reading store.ts" + CRLF })
        ptyData({ id: TERM, data: "editing store.ts" + CRLF })

        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        vi.useRealTimers()
    })

    it("gives every fresh silence its own grace, so a second glance is safe too", async () => {
        seed(false)
        ptyData({ id: TERM, data: "Ready for review." })
        await vi.advanceTimersByTimeAsync(200)

        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: REDRAW + "Ready for review." })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        // Look away, look back. The idle timer that fires in between confirms
        // the session is still quiet, which is what re-arms the grace - without
        // that, the second glance walks through and blips exactly as before.
        await vi.advanceTimersByTimeAsync(200)
        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: REDRAW + "Ready for review." })

        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        vi.useRealTimers()
    })

    /**
     * An act still authorises output to reclassify at once. Sending a session
     * something is a statement that you expect it to work, so the first byte
     * back is evidence and needs no second one.
     */
    it("reclassifies a hand-back you answered on the first byte", async () => {
        seed(false)
        ptyData({ id: TERM, data: "Ready for review." })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        useStore.getState().respondApproval(TERM, "y" + CR)
        ptyData({ id: TERM, data: "ok, continuing" })

        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        vi.useRealTimers()
    })
    /**
     * The tab-remount blip - the last remaining disclosure of the 2026-09-09
     * verification, and the reason `paneEcho.ts` exists.
     *
     * Re-entering an agent's tab flipped a hand-back to WORKING for the whole
     * idle window, and a layout switch did the same, while a window resize was
     * clean. A remount UNMOUNTS the pane, so main replays the entire kept
     * buffer when it re-attaches (`pty:create` -> `getBuffer`), and the
     * remounted xterm then refits, which resizes the pty, which makes the far
     * end redraw: TWO chunks from one gesture, which is exactly the bar the
     * hand-back gate sets for "the output continued". A resize produces the
     * second of those and not the first, which is why it never blipped.
     *
     * Neither chunk changes a character on screen - qa's own observation, and
     * the discriminator here.
     */
    it("keeps WAITING when re-entering the tab replays the buffer AND repaints", async () => {
        seed(false)
        const turn = "Refactored 4 files." + CRLF + "Ready for review." + CRLF
        ptyData({ id: TERM, data: turn })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        useStore.getState().jumpToTerm(TERM)
        // 1: main's replay of the whole session. 2: the refit-repaint.
        ptyData({ id: TERM, data: turn })
        ptyData({ id: TERM, data: REDRAW + "Ready for review." })

        // Was "working" for the whole ~6s idle window, over a finished turn.
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        expect(useStore.getState().seen[TERM]).toBe(true)
        vi.useRealTimers()
    })

    /**
     * The direction that must NOT be traded away for the one above. An agent
     * that pauses past the idle timer mid-turn and then resumes has to promote
     * promptly - `waiting` is DevDeck's own inference from silence, so its own
     * continued output is what refutes it. Two chunks, the same bar as before
     * the remount fix, and the remount's own chunks did not spend it.
     */
    it("still promotes a genuinely resuming agent after a remount", async () => {
        seed(false)
        const turn = "Refactored 4 files." + CRLF + "Ready for review." + CRLF
        ptyData({ id: TERM, data: turn })
        await vi.advanceTimersByTimeAsync(200)

        useStore.getState().jumpToTerm(TERM)
        ptyData({ id: TERM, data: turn })
        ptyData({ id: TERM, data: REDRAW + "Ready for review." })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        // Now it really does resume, and says something new.
        ptyData({ id: TERM, data: "reading store.ts" + CRLF })
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")
        ptyData({ id: TERM, data: "editing store.ts" + CRLF })
        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        vi.useRealTimers()
    })

    /**
     * And the act axis is untouched by the character test. Answering a session
     * is a statement that you expect it to work, so the first byte back is
     * evidence whatever it paints - a repaint included. Pinned because the
     * remount fix must not leak into this lane: if it did, an answered
     * hand-back whose agent redraws before it speaks would sit on "your move"
     * after the user had already moved.
     */
    it("reclassifies an answered hand-back on a first byte that only repaints", async () => {
        seed(false)
        ptyData({ id: TERM, data: "Ready for review." })
        await vi.advanceTimersByTimeAsync(200)
        expect(useStore.getState().agentStatus[TERM]).toBe("waiting")

        useStore.getState().respondApproval(TERM, "y" + CR)
        ptyData({ id: TERM, data: REDRAW + "Ready for review." })

        expect(useStore.getState().agentStatus[TERM]).toBe("working")
        vi.useRealTimers()
    })
})
