/**
 * The renderer's half of the diagnostics record: the words, and the one call
 * that turns a click into text on the clipboard.
 *
 * Everything here is deliberately outside a component. The sentences are the
 * design (see the first-contact spec, §5.1) and are pinned by tests, because
 * this surface's failure mode is not a broken layout — it is a paragraph that
 * quietly starts promising something the record cannot deliver.
 *
 * Two rules the tests enforce, both of them about not over-claiming:
 *
 * - **The record is never stringified here.** `result.text` is formatted in
 *   main, so the string the user pastes is the string that was redacted. A
 *   renderer that built its own could add a field, drop the `incomplete` block,
 *   or format a value nobody reviewed.
 * - **"I could not read my own log" is not "there is nothing to report."** An
 *   `ok` record with no errors is a healthy app and copies fine; `ok: false` is
 *   the state where the control has to refuse. Offering to copy nothing and
 *   succeeding is worse than refusing.
 */

import type { DiagnosticsRecord } from "../../shared/diagnostics"

/** Which of the three placements is asking. They differ in copy and feedback. */
export type DiagnosticsSurface = "about" | "root" | "region"

/**
 * What the control says it will copy, per surface.
 *
 * The clause order is load-bearing: **what it costs you comes before the
 * reassurance**, so a reader who stops halfway has read the half that costs
 * them. "with API keys and tokens removed" names a mechanism; the words
 * "sanitised", "safe" and "anonymous" would upgrade it into a guarantee and are
 * banned here by test.
 *
 * The two crash variants say nothing about PATH or agent presence, because a
 * crash record carries no probe run — the claim would have nothing behind it.
 */
export const DIAGNOSTICS_SENTENCE: Record<DiagnosticsSurface, string> = {
    about:
        "Copies your DevDeck and OS version, your agent commands and whether each was found on your PATH, and the recent app log — file paths and command lines included, with API keys and tokens removed. Nothing is sent anywhere; it goes to your clipboard.",
    root: "Copies this error, your DevDeck and OS version, and the recent app log — file paths and command lines included, with API keys and tokens removed. Nothing is sent anywhere.",
    region:
        "Copies this error, your versions and the recent log — paths included, secrets removed. Nothing is sent anywhere."
}

/** Replaces the sentence when main could not read its own log. */
export const DIAGNOSTICS_UNAVAILABLE =
    "Diagnostics aren't available — DevDeck couldn't read its own log."

/** Sits above the fallback `<pre>` when the clipboard write came back `false`. */
export const DIAGNOSTICS_REFUSED =
    "Couldn't reach the clipboard. Select the text below and copy it manually."

/** The toast used where the app is intact — never on the root crash card. */
export const DIAGNOSTICS_COPIED_TOAST = "Diagnostics copied to the clipboard"

/** How long the root crash card's label stays swapped to `Copied`. */
export const COPIED_LABEL_MS = 2000

export const COPY_LABEL = "Copy diagnostics"
export const COPIED_LABEL = "Copied"
export const REFUSED_LABEL = "Couldn't copy"

/**
 * The three answers a click can produce.
 *
 * `refused` carries the text as well, because that state's whole job is to put
 * the record where the user can select it by hand.
 */
export type CopyDiagnosticsOutcome =
    | { kind: "copied"; text: string; record: DiagnosticsRecord }
    | { kind: "refused"; text: string; record: DiagnosticsRecord }
    | { kind: "unavailable" }

/**
 * Build the record and put it on the clipboard, reporting which of the three
 * things happened.
 *
 * The record is re-read on every click rather than cached from mount: an error
 * reported one second ago belongs in the blob the user is about to paste, and
 * a cached `ok` from mount would let the control succeed against a log that has
 * since become unreadable.
 */
export async function copyDiagnostics(): Promise<CopyDiagnosticsOutcome> {
    const result = await window.api.diagnostics.record()
    if (!result.ok) return { kind: "unavailable" }
    const wrote = await window.api.clipboard.writeText(result.text)
    return {
        kind: wrote ? "copied" : "refused",
        text: result.text,
        record: result.record
    }
}
