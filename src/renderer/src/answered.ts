/**
 * What DevDeck says after it has answered a prompt on your behalf, and for how
 * long it says it.
 *
 * One module because TWO surfaces say it — Mission's tile and Overview's cards
 * and rail — and they both read the same `answered[termId]` record from the
 * store. While the window and the sentence lived inside one component, the
 * other surface kept offering live Approve/Deny after the same click, so one
 * click read as confirmed on one screen and unconfirmed on the other. That is
 * the same class of defect as two disagreeing counts, and this file exists so
 * there is only one place to change the answer.
 *
 * Everything here stops at "sent". Whether the agent ACCEPTED the keystroke is
 * not knowable until its next byte, and nothing in DevDeck may claim it.
 */

/** A keystroke answer we sent, exactly as `store.answered` records it. */
export interface SentAnswer {
    at: number
    keys: string
}

/**
 * How long an answered prompt says so in place of its buttons.
 *
 * NOT "until the agent's next byte": an agent echoes the keystroke back within
 * milliseconds, so that window is one frame — shorter than the gesture it is
 * confirming. Six seconds is the toast's own lifetime, so the two halves of the
 * confirmation appear and expire together. When it expires the buttons come
 * back if the prompt is still there, which is the honest fallback: nothing came
 * back, so pressing again may well be the right move.
 */
export const ANSWERED_MS = 6000

/**
 * The keystrokes we just sent an agent, as a person would name them.
 *
 * A confirmation has to say what was sent, and the raw strings `detectApproval`
 * produces are `"y\r"`, a menu digit, or `"\x1b"` for the "(esc)" reject
 * option — so printing them verbatim would read `Sent "" to claude 1` for the
 * commonest case of all.
 */
export function describeKeys(keys: string): string {
    if (keys === "\x1b") return "Esc"
    const visible = keys.replace(/[\r\n]/g, "")
    return visible ? `"${visible}"` : "Enter"
}

/**
 * The answer that should speak in place of live Approve/Deny, or `undefined`
 * when there is none to report.
 *
 * A pure read of a timestamp against `now`, deliberately not a timer: each
 * surface already repaints on a clock of its own (Mission's second tick,
 * Overview's 1500ms peek refresh), so the row clears on the next repaint after
 * the window closes and no second scheduler exists to disagree with.
 */
export function pendingAnswer(ans: SentAnswer | undefined, now: number): SentAnswer | undefined {
    if (!ans) return undefined
    return now - ans.at < ANSWERED_MS ? ans : undefined
}

/**
 * The one line every surface shows in place of the buttons it just replaced.
 *
 * "Sent", and then what it is waiting for — never "approved", "accepted" or
 * "done". The question stays on screen beside this, because nobody knows yet
 * whether the answer was taken.
 */
export function sentLabel(keys: string): string {
    return `Sent ${describeKeys(keys)} · waiting for its next output`
}

/** The same fact at tooltip length: what DevDeck did, and where the outcome shows up. */
export function sentTip(keys: string): string {
    return (
        `DevDeck sent ${describeKeys(keys)} to this session. ` +
        "Whether it was accepted shows up in the agent's own output."
    )
}
