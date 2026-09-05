// The phone approve/deny card: the classifier at phone terminal widths, and the
// client HTML that renders it.
//
// Both halves exist because neither is reachable any other way. `CLIENT_HTML` is
// a template literal inside `src/main/server.ts`, so **tsc does not parse it, the
// build does not parse it, and until this file nothing loaded it** - a typo in the
// phone client shipped green and surfaced only on a phone. And the classifier's
// behaviour at a narrow width is invisible from the desktop, where the terminal is
// never 46 columns wide; the phone client resizes the host pty to roughly that
// (`fit()` in CLIENT_HTML) the moment you open a session on it.
//
// Observed behaviour behind these assertions is recorded in
// `docs/qa/phone-approval-verification.md`.
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { Script } from "vm"
import { detectApproval } from "../src/shared/approval"
import { lastLines } from "../src/shared/tail"

// ---------------------------------------------------------------------------
// 1. The classifier at a phone's column count
// ---------------------------------------------------------------------------

/** Hard-wrap lines at `cols`, the way a narrower terminal reflows them. */
function wrap(lines: string[], cols: number): string[] {
    const out: string[] = []
    for (const l of lines) {
        if (l.length <= cols) {
            out.push(l)
            continue
        }
        for (let i = 0; i < l.length; i += cols) out.push(l.slice(i, i + cols))
    }
    return out
}

const PROMPT = [
    "I will remove the stale build output first.",
    "Bash command",
    "rm -rf D:\\Personal\\Personal Projects\\Products\\devdeck\\build",
    "Delete the build directory",
    "Do you want to proceed?",
    "\u276f 1. Yes",
    "  2. Yes, and don't ask again for rm commands in D:\\Personal\\Personal Projects\\Products\\devdeck",
    "  3. No, and tell Claude what to do differently (esc)"
]
const at = (cols: number): ReturnType<typeof detectApproval> =>
    detectApproval(lastLines(wrap(PROMPT, cols).join("\n"), 16))

describe("detectApproval at a phone's terminal width", () => {
    it("sends Esc for Deny at any desktop width", () => {
        for (const cols of [156, 120, 100, 80, 60]) {
            const r = at(cols)
            expect(r, `${cols} cols`).not.toBeNull()
            expect(r?.approve, `${cols} cols`).toBe("1")
            expect(r?.deny, `${cols} cols`).toBe("\x1b")
        }
    })

    // This is the one that mattered, and it is FIXED (2026-09-05).
    //
    // At 46 columns the trailing "(esc)" wraps off the end of its option line.
    // detectApproval used to read the option as truncated, so `escMarker` went
    // false and it fell back to the numbered No option - Deny stopped sending
    // Esc and started sending a digit. Esc rejects and returns; that digit is
    // "No, and tell Claude what to do differently", a different thing to do to
    // a live agent, under the same button and with no signal that it changed.
    //
    // 46 columns is not hypothetical: it is about what the phone client's own
    // `fit()` resizes the host pty to on a 390px-wide phone. The fix is in the
    // classifier rather than in the resize, because the resize is legitimate -
    // an option is simply not one line, and re-joining an option with the lines
    // it wrapped onto makes the marker visible again at any width.
    it("sends Esc for Deny at a phone's width, not a digit", () => {
        for (const cols of [46, 40, 34]) {
            const r = at(cols)
            expect(r, `${cols} cols`).not.toBeNull()
            expect(r?.approve, `${cols} cols`).toBe("1")
            expect(r?.deny, `${cols} cols`).toBe("")
        }
    })

    it("agrees with the desktop widths it used to disagree with", () => {
        // The defect was a DISAGREEMENT between widths for one prompt. Whatever
        // Deny means, it must not depend on how wide the terminal happens to be.
        const denies = [156, 120, 100, 80, 60, 46, 40, 34].map((c) => at(c)?.deny)
        expect(new Set(denies).size, JSON.stringify(denies)).toBe(1)
    })

    it("still finds the question, so the card does appear at phone width", () => {
        expect(at(46)?.question).toBe("Do you want to proceed?")
        expect(at(46)?.kind).toBe("menu")
    })
})

// ---------------------------------------------------------------------------
// 2. The phone client itself
// ---------------------------------------------------------------------------

const SERVER_TS = join(__dirname, "../src/main/server.ts")
const source = readFileSync(SERVER_TS, "utf8")

/** The CLIENT_HTML template literal, as text. */
function clientHtml(): string {
    const decl = source.indexOf("const CLIENT_HTML = `")
    expect(decl, "CLIENT_HTML declaration").toBeGreaterThan(-1)
    const start = source.indexOf("`", decl) + 1
    const end = source.lastIndexOf("`")
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
}

const HTML = clientHtml()

describe("the phone client is parseable", () => {
    // If this ever fails, the extraction above is reading the wrong span - and
    // every assertion below it is reading the wrong text.
    it("extracts as a plain template literal with no interpolation", () => {
        expect(HTML.startsWith("<!doctype html>")).toBe(true)
        expect(HTML.trimEnd().endsWith("</html>")).toBe(true)
        expect(HTML).not.toContain("${")
    })

    // The reason this file exists. `new Script(...)` compiles without executing,
    // so a syntax error in the client's inline script fails here instead of
    // blanking the page on somebody's phone.
    it("has an inline script that compiles", () => {
        const m = HTML.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)
        expect(m, "inline <script> block").not.toBeNull()
        expect(() => new Script(m![1], { filename: "devdeck-mobile-client.js" })).not.toThrow()
    })
})

describe("the decision card's layout guarantees", () => {
    // Measured under device emulation at 844x390: #term was 12px tall against a
    // 120px xterm canvas, the canvas overflowed, and `elementFromPoint` at the
    // card's question returned `div.xterm-screen` - terminal output painted over
    // the question and the raw excerpt while Approve/Deny stayed tappable. You
    // could answer a prompt you could not read.
    it("clips the terminal rather than letting it paint over the card", () => {
        expect(HTML).toMatch(/#term\{[^}]*overflow:hidden/)
    })

    // The answer must never be what the flex column squeezes. Before this the
    // quick-keys row was compressed from 45px to 8px on a 320px-wide phone.
    it("keeps the card and the quick keys out of the flex squeeze", () => {
        expect(HTML).toMatch(/#decision\{[^}]*flex:none/)
        expect(HTML).toMatch(/\.keys\{[^}]*flex:none/)
    })

    // Measured 431px of header content against a 320-390px viewport: the five
    // tabs pushed #status off the right edge on every portrait phone, and the
    // whole page scrolled sideways. "disconnected - retrying" is the only thing
    // that explains a tap that did nothing, and it was never on screen.
    it("lets the tabs scroll inside the header instead of the page", () => {
        expect(HTML).toMatch(/nav#nav\{[^}]*flex:1/)
        expect(HTML).toMatch(/nav#nav\{[^}]*min-width:0/)
        expect(HTML).toMatch(/nav#nav\{[^}]*overflow-x:auto/)
        expect(HTML).toMatch(/nav#nav button\{[^}]*flex:none/)
        expect(HTML).toMatch(/#status\{[^}]*flex:none/)
    })

    // Same fallback pattern the #app rule already carries and documents: a
    // browser that does not know `dvh` drops the declaration outright, and the
    // excerpt then grows to its full 16 lines.
    it("gives the excerpt's dvh cap a vh fallback", () => {
        expect(HTML).toMatch(/max-height:30vh;max-height:30dvh/)
        expect(HTML).toMatch(/height:100vh;height:100dvh/)
    })

    // Thumb-sized, and the only two controls in the client that are.
    it("keeps the answer buttons at 44px", () => {
        expect(HTML).toMatch(/#decision \.acts button\{[^}]*min-height:44px/)
    })

    it("does not advertise a browser theme colour from a palette it dropped", () => {
        expect(HTML).not.toContain("#181725")
        expect(HTML).toMatch(/name="theme-color" content="#211f1c"/)
    })
})

describe("the decision card's tap lifecycle", () => {
    // Observed: with the server silent, both buttons were disabled with no note
    // at all and stayed disabled indefinitely; with the socket dropped mid-tap
    // they stayed disabled after the client reconnected and the card was still
    // on screen - the prompt was unanswerable from the phone, silently.
    it("releases an in-flight tap on a timeout and on a dropped socket", () => {
        expect(HTML).toContain("function clearSubmit()")
        expect(HTML).toContain("function armSubmitTimeout()")
        // the timeout path
        expect(HTML).toMatch(/armSubmitTimeout[\s\S]{0,400}Response unconfirmed/)
        // the close path
        expect(HTML).toMatch(/ws\.onclose[\s\S]{0,400}clearSubmit\(\);[\s\S]{0,120}Connection dropped/)
        // the ack path
        expect(HTML).toMatch(/choice:res[\s\S]{0,300}clearSubmit\(\)/)
    })

    it("refuses a tap on a closed socket instead of greying the buttons out", () => {
        expect(HTML).toMatch(/ws\.readyState!==1[\s\S]{0,120}nothing was sent/)
    })

    it("says something while the tap is in flight", () => {
        expect(HTML).toMatch(/setNote\('Sending…', false, true\)/)
    })

    // Observed: the excerpt is 16 lines in a box that fits about 12 and opened at
    // the TOP, so the option lines - including the "(esc)" one Deny sends - sat
    // below the fold of an inner scroll box that looks like static text.
    it("shows the newest end of the raw excerpt, on render and after a rotation", () => {
        expect(HTML).toContain("function pinTail()")
        expect(HTML).toMatch(/pinTail\(\);\s*\n\s*if\(!p\) return;/)
        expect(HTML).toMatch(/addEventListener\('resize'[\s\S]{0,120}pinTail\(\)/)
    })
})

// Not restated here: that the page only ever echoes back one of main's own
// answer tokens. `tests/server-remote.test.ts` ("answers with a token the server
// minted, never a composed string") pins that against the page the running
// server actually serves, which is stronger evidence than this file's read of
// the source text.
