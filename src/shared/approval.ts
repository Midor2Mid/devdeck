// Detect and classify a pending permission prompt in an agent's recent terminal
// output, so the Overview can offer one-click Approve / Deny without opening the
// session. Deliberately CONSERVATIVE: returns null unless the tail clearly ends in
// a known prompt shape, because acting on a wrong guess sends the wrong keystroke
// to a live agent.
//
// This module only CLASSIFIES. The rule about when it is safe to act on a match
// — only for a session already flagged "attention"/"waiting" — belongs to the
// caller's gate.
//
// For approvals there is now exactly ONE caller that classifies: `refreshDecision`
// in main (main/decisions.ts), which holds that gate. Every surface that offers
// Approve / Deny — the Mission tile and the Overview row via `promptFor`
// (missionTail.ts), and the paired phone — reads main's answer instead of running
// this itself, so one prompt cannot be described two ways. `promptFor` keeps the
// same status gate as a display-side check; both gates are tested and neither may
// be removed.
//
// The one other caller is store.ts's board-evidence check, which asks a different
// question — "is this quiet agent blocked rather than finished?" — and is not a
// surface that acts on the answer.

export interface ApprovalPrompt {
    kind: "menu" | "yesno"
    /** Best-effort question text to show on the card. */
    question: string
    /** Keystroke(s) to send to accept. */
    approve: string
    /** Keystroke(s) to send to reject. */
    deny: string
}

// A numbered option line, tolerant of a leading pointer glyph / bullet / spaces:
//   "❯ 1. Yes"   "  2. No, and tell Claude… (esc)"   "3) Allow"
const OPTION = /^[❯›»▶>*\s-]*(\d+)[.)]\s+(\S.*)$/
const YES = /^(yes|allow|proceed|approve|continue|run|grant|ok)\b/i
const NO = /^(no|deny|cancel|reject|don'?t|stop|skip|abort)\b/i
// A y/n prompt token: "(y/n)", "[y/n]", "y / n", "(yes/no)".
const YESNO = /(?:^|[\s([])y\s*\/\s*n(?:[)\]]|\b)|\(yes\/no\)/i

export function detectApproval(tail: string): ApprovalPrompt | null {
    const lines = tail
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    if (lines.length === 0) return null
    const last = lines[lines.length - 1]

    // --- Numbered menu (Claude Code / Codex permission prompt) ---
    const opts: { num: number; text: string; line: number }[] = []
    lines.forEach((l, i) => {
        const m = l.match(OPTION)
        if (m) opts.push({ num: Number(m[1]), text: m[2].trim(), line: i })
    })
    if (opts.length >= 2) {
        const lastOpt = opts[opts.length - 1]
        // The options must sit at the tail — if real output followed them, the
        // agent already moved past the prompt and it's stale.
        const live = lastOpt.line >= lines.length - 3
        const yes = opts.find((o) => YES.test(o.text))
        const no = opts.find((o) => NO.test(o.text) || /\(esc\)/i.test(o.text))
        const escMarker = opts.some((o) => /\(esc\)/i.test(o.text))
        // A preceding question ("Do you want to proceed?") or the "(esc)" marker
        // is what separates a real prompt from a numbered list in prose.
        const questionLine = lines.slice(0, opts[0].line).reverse().find((l) => l.endsWith("?"))
        if (live && yes && no && (escMarker || questionLine)) {
            return {
                kind: "menu",
                question: questionLine ?? "Permission requested",
                approve: String(yes.num), // number key selects+confirms in the TUI
                deny: escMarker ? "\x1b" : String(no.num) // Esc = the "(esc)" reject option
            }
        }
    }

    // --- Simple y/n prompt (raw shell / tools) ---
    if (YESNO.test(last)) {
        return { kind: "yesno", question: last, approve: "y\r", deny: "n\r" }
    }
    return null
}
