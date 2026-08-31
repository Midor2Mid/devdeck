// The narrow, renderer- and wire-facing shape of a pending permission prompt.
//
// Main is the only classifier (main/decisions.ts). Everything that merely
// *displays* a decision — the Mission Control tile, the Overview row, and later
// the phone card — reads this shape and nothing more. It lives in `shared/` on
// purpose: the preload and the renderer must never import from `src/main/`,
// because main's decision module reaches through to `main/pty.ts` and the native
// pty binding. That import would typecheck perfectly and then fail at runtime in
// the preload bundle, which is the worst way to find out.
//
// `PendingDecision` in main structurally extends this — it adds the fields only
// main needs (`termId`, `tailHash`, `createdAt`) — so main can hand one straight
// across the bridge with no conversion step to drift out of sync.

/** One answer a surface may offer, with the exact keystrokes that send it. */
export interface DecisionOption {
    label: string
    /** Keystroke(s) to write to the pty. Supplied by main, never by the client. */
    send: string
}

/** What a surface other than the terminal itself needs to render a pending prompt. */
export interface DecisionView {
    /** Bound to the exact screen main classified — see `PendingDecision.id`. */
    id: string
    kind: "menu" | "yesno"
    question: string
    tail: string
    options: DecisionOption[]
}

/** Main's whole current answer, keyed by terminal id. Absent id = no decision. */
export type DecisionSnapshot = Record<string, DecisionView>
