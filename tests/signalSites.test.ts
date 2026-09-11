import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

// The wiring, pinned in source. The whole-branch reviewer commented out ALL
// EIGHT markLaunched/captureBaseline calls in store.ts and ran the five suites
// that plausibly covered them: 126/126 passed. The unit tests seed their own
// signals by calling markLaunched and captureBaseline directly, so the only
// thing standing between the shipped behaviour and Task 3's original
// newTab-only bug was a JSDoc sentence.
//
// Two invariants, two shapes. Both belong on every launch path now, and they
// arrive together as `beginAgentSession`, which is pinned here structurally
// against the one marker every launch path already has.
//
// The baseline used to be argued NOT to be a launch concern - "a property of
// the CARD", with two card-lifecycle sites and nothing needed from a new launch
// path. `buildOwnership` consults every agent session's baseline now, so the
// consequence of that narrowing was that a session started any other way had no
// baseline, `newPathsSince` honestly reported no evidence, and the whole
// in-flight-changes map went dark on the launch path everyone uses: qa watched
// six deck-launched agents create a file in one working tree and Mission report
// nothing through three polls over 40 seconds. What survives of the old
// argument is the SHAPE of each capture: a dispatch overwrites (it is a
// statement about what stops counting), a launch only fills a gap. That is two
// functions, and this file pins both counts; tests/launchBaseline.test.ts,
// tests/cardReview.test.ts and tests/dispatchBoardTask.ts pin the behaviour.

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))
const STORE = src("../src/renderer/src/store.ts")

/**
 * A file's EXECUTABLE lines: comments and quoted literals blanked, line numbers
 * preserved.
 *
 * Not cosmetic - every removal here was added because a mutation got past the
 * version without it. Stripping `//` came first (commenting a call OUT still
 * satisfied the scan, the exact mutation this file exists to catch). A
 * re-review then got two more through: a block comment wrapped around a call,
 * and a decoy string literal spelling the call. A scan a one-line edit can fool
 * is worse than no scan, because it reports a confidence it does not have.
 *
 * Deliberately crude for all that: line-oriented, and the only things looked
 * for are call sites. It is not a parser and must not grow into one.
 */
function stripCode(text: string): string[] {
    let inBlock = false
    return text
        .split("\n")
        .map((raw) => {
            let l = raw
            if (inBlock) {
                const end = l.indexOf("*/")
                if (end === -1) return ""
                l = " ".repeat(end + 2) + l.slice(end + 2)
                inBlock = false
            }
            // Block comments opened and closed within this line.
            l = l.replace(/\/\*[\s\S]*?\*\//g, " ")
            const opens = l.indexOf("/*")
            if (opens !== -1) {
                l = l.slice(0, opens)
                inBlock = true
            }
            const slashes = l.indexOf("//")
            if (slashes !== -1) l = l.slice(0, slashes)
            // A quoted literal can spell a call without being one.
            return l
                .replace(/"[^"]*"/g, '""')
                .replace(/'[^']*'/g, "''")
                .replace(/`[^`]*`/g, "``")
        })
}

/** The executable lines of a file on disk. */
function codeLines(path: string): string[] {
    return stripCode(readFileSync(path, "utf8"))
}

const lines = codeLines(STORE)

/** 1-based line numbers of real code containing `needle`. */
function linesWith(needle: string, from: string[] = lines): number[] {
    const hits: number[] = []
    from.forEach((l, i) => {
        if (l.includes(needle)) hits.push(i + 1)
    })
    return hits
}

describe("every agent-launch path stamps a launch instant", () => {
    // logUsageStart is the marker: it is called on every path that spawns an
    // agent pty (it has to be - an unlogged session breaks cost exclusivity),
    // and it is money-critical, so it is the one call nobody quietly drops.
    const launchSites = linesWith("logUsageStart(")

    it("finds the launch sites at all", () => {
        // Guards the test itself: a rename that made the scan match nothing
        // would otherwise leave this file passing vacuously forever.
        expect(launchSites.length).toBeGreaterThanOrEqual(4)
    })

    it.each(launchSites)("beginAgentSession precedes the logUsageStart at line %i", (line) => {
        // A few lines of slack: the two calls sit together, but the usage call
        // is a multi-line `useSettings.getState().logUsageStart(` on most paths.
        const window = lines.slice(Math.max(0, line - 9), line).join("\n")
        expect(window).toContain("beginAgentSession(")
    })

    it("stamps the launch instant AND the inherited dirty set in that one call", () => {
        // The whole point of routing five sites through one helper: dropping
        // either line here silently undoes one of the two fixes on all five
        // paths at once, and no unit test would notice - they seed their own
        // signals by calling markLaunched and ensureBaseline directly.
        const at = linesWith("const beginAgentSession = ")
        expect(at, "expected one beginAgentSession definition").toHaveLength(1)
        const body = lines.slice(at[0] - 1, at[0] + 3).join("\n")
        expect(body).toContain("markLaunched(")
        expect(body).toContain("ensureBaseline(")
        // A launch must not be the OVERWRITING capture: resume and restart
        // reuse the termId, and overwriting there re-inherits the files the
        // session itself created, which makes a real conflict silent.
        expect(body).not.toContain("captureBaseline(")
    })
})

describe("the two capture shapes stay apart", () => {
    it("keeps the OVERWRITING capture to the card's two lifecycle sites", () => {
        // Dispatch (the only writer of task.termId) and entering `doing` (the
        // rebase). Those two are deliberate statements that earlier work stops
        // counting, so they replace the baseline. A third one here means a
        // launch has started overwriting again, which is how a session that
        // crashed and restarted re-inherits the files it created itself.
        expect(linesWith("captureBaseline(")).toHaveLength(2)
    })

    it("captures a baseline on every launch path too, via the fill-a-gap one", () => {
        // Not vacuous and not a duplicate of the pin above: this is the half
        // that was missing entirely. One site, inside beginAgentSession.
        expect(linesWith("ensureBaseline(")).toHaveLength(1)
    })
})

describe("the scanner itself", () => {
    // The scan is only worth anything if it cannot be talked out of a finding,
    // so the stripping is tested directly against the three mutations that have
    // actually got past it.
    // Exercising the same function the real scan runs on store.ts, not a
    // re-implementation of it - the point of the whole file is that a pin which
    // paraphrases the thing it pins proves nothing.
    const strip = stripCode

    it("ignores a line-commented call", () => {
        expect(strip("    // markLaunched(termId)")[0]).not.toContain("markLaunched(")
    })

    it("ignores a call wrapped in a block comment on one line", () => {
        expect(strip("    /* markLaunched(termId) */")[0]).not.toContain("markLaunched(")
    })

    it("ignores a call inside a block comment spanning lines", () => {
        const out = strip("    /*\n    markLaunched(termId)\n    */\n    real()")
        expect(out.slice(0, 3).join("\n")).not.toContain("markLaunched(")
        // …and comes back out the other side, so a block comment cannot blind
        // the scan to everything below it.
        expect(out[3]).toContain("real()")
    })

    it("ignores a call spelled inside a string literal", () => {
        expect(strip('    const decoy = "markLaunched(termId)"')[0]).not.toContain(
            "markLaunched("
        )
        expect(strip("    const decoy = `markLaunched(termId)`")[0]).not.toContain(
            "markLaunched("
        )
    })

    it("still sees a real call on a line that also carries a comment", () => {
        expect(strip("    markLaunched(termId) // stamp it")[0]).toContain("markLaunched(")
    })
})

// N3. The two fixes that live in a component were pinned by nothing: this repo
// has no component tests, so replacing MissionControl's `awaited.has(s.termId)`
// argument with a constant `true` restored the I1 regression - every quiet
// session marked stalled - with the entire suite green. Same class for the
// Settings field: idleClamp.test.ts drives the two pure functions through a
// local harness, which says nothing about whether the component still calls
// them. These are argument-level pins, in the same style as the launch scan
// above, and they are the cheapest thing that fails when the wiring is undone.
//
// Mission's tile-decision task moved the direct `isStalled(` call out of this
// component and into `resolveTileState` (tileState.ts), which is now the one
// place isStalled is called from — tileState.test.ts pins that call at the
// pure-function level. What remained a component-only risk, and still needs
// this file's kind of scan, is the WIRING one level up: does the component
// still pass the real awaited set into the resolver, or a constant.

const MISSION = src("../src/renderer/src/components/MissionControl.tsx")
const SETTINGS = src("../src/renderer/src/components/SettingsModal.tsx")

/** The `n` code lines starting at the sole line containing `needle`. */
function callSite(needle: string, from: string[], n = 12): string {
    const at = linesWith(needle, from)
    expect(at, "expected exactly one " + needle + " call site").toHaveLength(1)
    return from.slice(at[0] - 1, at[0] - 1 + n).join("\n")
}

/**
 * Like `callSite`, but the window can start BEFORE the line containing
 * `needle` too - some evidence (e.g. the `<button` opening a JSX element)
 * sits above the attribute line a test wants to anchor on, and that
 * attribute is the only substring specific enough to be a safe, single-match
 * needle.
 */
function around(needle: string, from: string[], before: number, after: number): string {
    const at = linesWith(needle, from)
    expect(at, "expected exactly one " + needle + " call site").toHaveLength(1)
    const start = Math.max(0, at[0] - 1 - before)
    const end = at[0] - 1 + after
    return from.slice(start, end).join("\n")
}

/**
 * The file's lines with NOTHING blanked - codeLines() replaces every
 * quoted string with "" (so a decoy string literal cannot spell a call),
 * which also erases the exact thing a couple of these pins need to see:
 * the LITERAL comparison values inside a real conditional. Only safe to
 * use where the surrounding window is narrow and specific enough that a
 * decoy comment landing inside it is not a realistic way to fool the scan.
 */
function rawLines(path: string): string[] {
    return readFileSync(path, "utf8").split("\n")
}

describe("the stall marker is still gated on expectation", () => {
    const mission = codeLines(MISSION)

    // The fields resolveTileState is given now live one level up, in the
    // `input` object each resolved entry keeps (so the header's wantsYou count
    // and the tile's own resolveTileState call agree on the same facts) - so
    // the wiring pin has to anchor on that object, not on the resolveTileState
    // call site itself, which now just reads `resolveTileState(input, now)`.
    it("builds the tile-state input from the awaited set, the exit code and the changed count - not constants", () => {
        const input = callSite("const input = {", mission, 10)
        expect(input).toContain("awaited: awaited.has(s.termId)")
        // A constant in any of these positions type-checks and leaves the
        // suite green - the exact failure mode this file exists to catch.
        // `awaited: true` restores I1's stalled-everything regression;
        // `exitCode: undefined` makes every corpse read as its live state;
        // `changedCount: 0` is I4's swallowed-git-error bug moved into the
        // wiring itself, and `?? 0` is the same bug in the fallback: an absent
        // entry is a session nobody has polled, which is unknown, not clean.
        expect(input).not.toContain("awaited: true")
        expect(input).toContain("exitCode: exitCodeOf(s.termId)")
        expect(input).not.toContain("exitCode: undefined")
        expect(input).toContain("changedCount: changedBySession[s.termId],")
        expect(input).not.toContain("changedCount: 0")
        // Either fallback erases a distinction the tile depends on: `?? 0`
        // claims a clean tree, `?? null` claims a failed check for a session
        // nobody has polled yet.
        expect(input).not.toContain("?? 0")
        expect(input).not.toContain("?? null")
    })

    it("passes that same input into resolveTileState, rather than rebuilding it", () => {
        expect(callSite("resolveTileState(", mission, 1)).toContain("resolveTileState(input, now)")
    })

    it("derives the awaited set from the board and the pipeline run", () => {
        const derive = callSite("awaitedTermIds(", mission, 1)
        expect(derive).toContain("boardTasks")
        expect(derive).toContain("pipelineRun")
    })
})

// I3, re-review round 2: nothing stops a future edit reintroducing
// role="button" on the tile wrapper, which is the exact defect this feature
// shipped to fix - every decision control (Approve/Deny/Review/Reply) becomes
// a presentational child of a button, per ARIA, and a screen-reader user is
// back to hearing one label for the whole tile and reaching none of them.
describe("the tile wrapper stays out of the way of its own decision controls (I3)", () => {
    const mission = codeLines(MISSION)

    it('does not carry role="button" or tabIndex on the wrapper', () => {
        // ARIA: `button` has presentational children, so role="button" here
        // would silently swallow every Approve/Deny/Review button and the
        // Reply input inside it again. tabIndex=0 on a non-interactive
        // wrapper is the other half of the same regression - it makes the
        // whole tile a stop with nothing individually announced at it.
        const wrapper = callSite("key={s.termId}", mission, 6)
        expect(wrapper).not.toContain('role="button"')
        expect(wrapper).not.toContain("tabIndex")
    })

    it("gives the jump its own labelled, focusable <button> instead", () => {
        // The control the wrapper's role="button" used to stand in for has to
        // still exist SOMEWHERE reachable - this is it. Losing the <button>
        // (back to a <span>) or the aria-label makes the jump mouse-only
        // again, silently, while every other test in this file stays green.
        // Anchored on the aria-label line itself (className="mission-tile-name"
        // is a quoted value and codeLines blanks it) - the two lines above it
        // are the <button> opening tag and that same className attribute.
        //
        // The anchor was `aria-label={[s.sessionName` until 2026-09-11, when the
        // label grew a provenance entry and was wrapped across lines. The button
        // and the label both survived; only the two tokens stopped sharing a
        // line, and this pin went red for a reformat. Anchoring on the opening
        // `aria-label={[` alone keeps what the pin is actually for - a <button>
        // carrying a label - without asserting how the array is laid out. A
        // source scan can only pin text, so the narrowest text that still means
        // the thing is the right amount to pin.
        const nameButton = around("aria-label={[", mission, 2, 1)
        expect(nameButton).toContain("<button")
        expect(nameButton).toContain("aria-label=")
    })
})

// I4, re-review round 2: the first fix for "a poll can strand a half-typed
// draft" widened the reply input's gate to ANY state once a draft exists,
// which let the input survive onto EXITED (nothing is listening - exited()'s
// own comment says so) and onto NEEDS-YOU (answered by the prompt's own two
// buttons, not free text beside them). That is the same class of lie the
// whole wave exists to close, just moved into the escape hatch meant to fix
// a different one - so the narrowing gets its own pin.
describe("a stranded draft cannot reopen the reply box on EXITED or NEEDS-YOU (I4)", () => {
    const mission = codeLines(MISSION)

    it("canReply's draft escape hatch excludes exited and needs-you", () => {
        // Raw, not codeLines: the values being pinned ARE quoted string
        // literals, which codeLines blanks to "" specifically so a decoy
        // string cannot spell a stripped-out call - here that blanking
        // would erase the very thing under test, so this one reads the
        // file unstripped.
        const canReply = callSite("const canReply =", rawLines(MISSION), 3)
        expect(canReply).toContain('st.kind !== "exited"')
        expect(canReply).toContain('st.kind !== "needs-you"')
    })

    it("canReply, not some looser condition, is what gates the reply input", () => {
        const gate = callSite("{canReply && (", mission, 2)
        expect(gate).toContain("<input")
    })
})

describe("the quiet-after field still commits rather than clamps as you type", () => {
    const settings = codeLines(SETTINGS)
    // Anchored on the label rather than on any one call, so the window covers
    // the whole input including the attributes above the value binding - and so
    // ripping the wiring out cannot move the window away from the evidence.
    const field = (): string => callSite("Quiet after (ms)", settings, 36)

    it("renders the draft and commits on blur", () => {
        expect(field()).toContain("value={idleFieldValue(")
        expect(field()).toContain("setIdleDraft(e.target.value)")
        expect(field()).toContain("commitIdleMs(")
        // THE REGRESSION: clamping inside onChange. `setAgentIdleMs` belongs in
        // the blur/commit handler, never against a keystroke.
        expect(field()).not.toContain("onChange={(e) => setAgentIdleMs(")
    })

    it("takes its floor from the exported constant", () => {
        // M2: a hardcoded 300 beside an exported IDLE_MIN.
        expect(field()).toContain("min={IDLE_MIN}")
        expect(field()).not.toContain("min={300}")
    })

    it("cancels the draft on Escape instead of losing it", () => {
        // N5. Commit-on-blur made this the one Settings field whose typing could
        // vanish: the modal's Escape unmounts the input and React fires no blur
        // on unmount. Capture phase, because Modal's own Escape listener is a
        // native bubble-phase one on a DOM ancestor. (The key name itself is a
        // string literal, which the scanner blanks - these three tokens are what
        // survives, and they are only ever written together.)
        const f = field()
        expect(f).toContain("onKeyDownCapture")
        expect(f).toContain("e.stopPropagation()")
        expect(f).toContain("setIdleDraft(null)")
    })
})

// --- One classifier, and the push that feeds it ---------------------------
//
// Main is the only thing that classifies a permission prompt now
// (main/decisions.ts); the Mission tile and the Overview row read its answer
// through missionTail's `promptFor`. Two wires make that work, and neither can
// be reached by a unit test:
//
//   1. App.tsx must push the session snapshot to main WHETHER OR NOT the remote
//      server is on. Status is the half of the classification main cannot see
//      for itself, and the push used to be gated on `remote.enabled` to save an
//      IPC. Restore that gate and main mints nothing with remote off — which is
//      the default — so the desktop's own Approve / Deny buttons silently never
//      appear. Every promptFor test still passes, because they seed the cache
//      directly.
//   2. Something has to subscribe to `decisions:changed`. Without it the cache
//      is never filled and, again, every unit test still passes.
const APP = src("../src/renderer/src/App.tsx")
const TAIL_MOD = src("../src/renderer/src/missionTail.ts")
const MAIN = src("../src/main/index.ts")

describe("main is the only classifier, and it is actually fed (task 4)", () => {
    const app = codeLines(APP)
    const tail = codeLines(TAIL_MOD)

    it("pushes the session snapshot to main", () => {
        expect(linesWith("window.api.mobile.syncSessions(", app)).toHaveLength(1)
    })

    it("does not gate that push on the remote server being enabled", () => {
        // The gate's only possible source in this file: nothing here may read
        // `remote.enabled` again without someone re-reading the note above.
        expect(linesWith("remote.enabled", app)).toHaveLength(0)
        expect(linesWith("remoteEnabled", app)).toHaveLength(0)
    })

    it("subscribes to main's decisions", () => {
        expect(linesWith("window.api.decisions.onChanged(", app)).toHaveLength(1)
        expect(linesWith("setDecisions", app).length).toBeGreaterThan(0)
    })

    it("re-derives on main's own clock, not only on a renderer push", () => {
        // Delete this one call and every unit test still passes, while a
        // background tile in `attention` serves the previous screen's answer
        // forever — store.ts takes no status transition on that path, so
        // nothing pushes. See REFRESH_MS in main/decisions.ts.
        expect(linesWith("startDecisionRefresh(", codeLines(MAIN))).toHaveLength(1)
    })

    it("leaves no approval classifier in the renderer's tile path", () => {
        // A fallback `detectApproval` here would restore the two-answers defect
        // while every promptFor test kept passing.
        expect(linesWith("detectApproval", tail)).toHaveLength(0)
    })
})

// --- One derivation, and nobody painting around it ------------------------
//
// "A dead session reads as alive" was fixed eleven times over, and the reason
// it took eleven is that the fix is invisible to every other kind of test: a
// component that concatenates `s.status` into a class name type-checks, builds,
// and passes every unit test in this repo, because the wrong answer is a valid
// AgentStatus. The dot is just wrong on screen.
//
// So the two invariants that keep it fixed are structural, and they live here
// with the rest of the wiring pins.
//
//   1. No surface paints a RAW status. `s.status` / `agentStatus[id]` is what
//      the agent last DID and it outlives the process that did it, so a class
//      built from one describes a live agent whatever is actually behind the
//      tab.
//   2. `deckKeyStatus` has exactly one caller, and it is the shared hook. Five
//      surfaces each wrote the three-fact call themselves; a sixth copy is how
//      "is there a process behind this tab" gets two answers again.
const RENDERER = fileURLToPath(new URL("../src/renderer/src/", import.meta.url))

/** A file's name, on either platform's separator. */
function base(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** Every .ts/.tsx file under the renderer, as paths. */
function rendererFiles(): string[] {
    return readdirSync(RENDERER, { recursive: true, encoding: "utf8" })
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => RENDERER + f)
}

describe("no renderer surface paints a raw agent status", () => {
    const files = rendererFiles()

    it("finds the renderer files at all", () => {
        // Guards the scan itself: a moved directory would otherwise leave every
        // assertion below passing over an empty list.
        expect(files.length).toBeGreaterThan(30)
    })

    it("builds every status- class from a derived value", () => {
        // Raw lines, not codeLines: the evidence IS a quoted literal, and
        // blanking it would erase the thing under test. A comment spelling the
        // pattern would be a false FAILURE, which is the safe direction for a
        // scan to be wrong in.
        const offenders: string[] = []
        for (const path of files) {
            rawLines(path).forEach((line, i) => {
                // The class concatenation, and whatever it is fed.
                const m = /status-"\s*\+\s*([A-Za-z_$][\w$.[\]]*)/.exec(line)
                if (!m) return
                const expr = m[1]
                if (/\.status$/.test(expr) || /^agentStatus\[/.test(expr)) {
                    offenders.push(`${base(path)}:${i + 1} paints ${expr}`)
                }
            })
        }
        expect(offenders, offenders.join("\n")).toEqual([])
    })

    it("ranks the follow order on a derived status, never a raw one", () => {
        // TypeScript CANNOT catch this one, and that is why it is here:
        // `DeckKeyStatus` is `AgentStatus | "not-running"`, so `s.status` is
        // assignable to it and `followRank(s.status)` compiles, builds and
        // passes every unit test while sorting a corpse's last words to the
        // top of Mission and Overview - the exact defect this pass fixed.
        const offenders: string[] = []
        for (const path of files) {
            rawLines(path).forEach((line, i) => {
                const m = /(?:followRank|sortForFollow)\([^)]*?(\w+\.status|agentStatus\[)/.exec(
                    line
                )
                if (m) offenders.push(`${base(path)}:${i + 1} ranks ${m[1]}`)
            })
        }
        expect(offenders, offenders.join("\n")).toEqual([])
    })

    it("gives the wants-you input both halves of hasProcess, and every other fact", () => {
        // The wants-you count is the most visible number in the product, and
        // every field below type-checks as a constant: `held: undefined` puts
        // it back to counting restored panes, `awaited: true` makes every quiet
        // session a stall, `alive` is NOT the same fact as a process (it means
        // "this tab is an agent", and a pane whose process died keeps it), and
        // a literal `false` for `seen` is the nag that never stops. Each one
        // leaves the whole suite green and the number wrong on screen.
        //
        // The assembly moved OUT of the component and into the store on
        // 2026-09-11, which is why this pin moved with it. That was the fix for
        // a real divergence rather than tidying: the chord filtered its own set
        // and could not find the stall this count had already promised. One
        // assembly now feeds the count, the taskbar badge and the jump, and -
        // unlike a component - it is reachable by a unit test
        // (tests/wantsAgree.test.ts).
        const call = around("wantKind(", lines, 6, 22)
        expect(call).toContain("exitCodeOf(id)")
        expect(call).not.toContain("exitCode: undefined")
        expect(call).toContain("held")
        expect(call).not.toContain("held: undefined")
        expect(call).toContain("lastAt: getLastAt(id)")
        expect(call).toContain("awaited: awaited.has(id)")
        expect(call).not.toContain("awaited: true")
        expect(call).toContain("alive: !!st.termAgents[id]")
        expect(call).toContain("!!st.seen[id]")
        // The awaited set is what keeps a stall from marking everything, and it
        // has to come from the two things that can actually be waiting on a
        // session rather than from an empty Set.
        // TWO call sites since 2026-09-12, and the pin checks both rather
        // than being loosened to the first: the assembly reads the awaited set
        // to ANSWER, and the stall clock beside it reads the same set to know
        // when that answer could next change by the wall clock alone. An empty
        // Set at either is the same bug wearing two faces - the first marks
        // nothing stalled, the second never wakes up to notice that something
        // is, which is the defect this pass fixed.
        const derives = linesWith("awaitedTermIds(", lines)
        expect(derives).toHaveLength(2)
        for (const at of derives) {
            const derive = lines[at - 1]
            expect(derive).toContain("boardTasks")
            expect(derive).toContain("pipelineRun")
        }
    })

    it("leaves no surface deriving the count for itself", () => {
        // What "one assembly" means, asserted as a count. Two numbers for one
        // question on one bar is the defect this app has already paid to fix
        // once, and a move that left a copy behind would recreate it.
        // MissionControl is the one legitimate second caller of the PREDICATE:
        // it builds a full tile input anyway (`changedCount` and the rest) and
        // reads `wantsYou` over it for its header - same function, same facts,
        // and tests/signalSites' tile-input pin above covers that wiring.
        const callers = files.filter(
            (path) =>
                (linesWith("wantsYou(", codeLines(path)).length > 0 ||
                    linesWith("wantKind(", codeLines(path)).length > 0) &&
                !path.endsWith("tileState.ts")
        )
        expect(callers.map(base).sort()).toEqual(["MissionControl.tsx", "store.ts"])
    })

    it("hands the taskbar badge the same number, from the same builder", () => {
        // Q2's rule. The badge is a second CHANNEL for one fact, like the
        // desktop toast - the moment it counts for itself it is the twelfth
        // surface with its own opinion about who needs you. So: exactly one
        // IPC call site, it lives in `syncBadge`, and `syncBadge` reads
        // `wantsCount()` rather than taking a number from a caller.
        const sites = linesWith("window.api.badge", lines)
        expect(sites).toHaveLength(1)
        const sync = around("window.api.badge", lines, 36, 2)
        expect(sync).toContain("get().wantsCount()")
        // The words a screen reader is read come from the control's own
        // builder, not a second phrasing of the same sentence.
        expect(sync).toContain("wantsYouBadgeDescription(")
        // And no other surface pushes one.
        const pushers = files.filter((path) => linesWith("window.api.badge", codeLines(path)).length > 0)
        expect(pushers.map(base)).toEqual(["store.ts"])
    })

    it("pushes the badge from the control's own render, with no clock of its own", () => {
        // A timer here is the thing Q2 forbids: the badge and the deck would
        // then be two state machines sampling one fact, and a stall arriving
        // between their ticks would make them disagree. The effect rides the
        // component's renders instead, and the count it depends on is the one
        // it renders.
        const deck = codeLines(src("../src/renderer/src/components/DeckWants.tsx"))
        expect(linesWith("setInterval", deck)).toEqual([])
        expect(linesWith("setTimeout", deck)).toEqual([])
        const effect = around("syncBadge()", deck, 1, 3)
        expect(effect).toContain("useEffect")
        expect(effect).toContain("[count, syncBadge]")
        // The component reads the number; it must not rebuild it.
        expect(callSite("const count =", deck, 1)).toContain("wantsCount()")
        // And the subscription that lets the store's stall alarm reach this
        // component at all. A stall writes none of the other four slices, so
        // without this line the alarm fires into an empty room and the flag -
        // and the badge riding its render effect - stays absent for exactly the
        // state the badge exists for (2026-09-12 verification, §3). Deleting it
        // leaves tests/stallClock.test.ts green, because that file can only
        // reach the store.
        expect(linesWith("s.stallEpoch", deck)).toHaveLength(1)
    })

    it("keeps deckKeyStatus to one caller - the shared hook", () => {
        const callers = files.filter(
            (path) =>
                linesWith("deckKeyStatus(", codeLines(path)).length > 0 &&
                !path.endsWith("deck.ts")
        )
        expect(callers.map(base)).toEqual(["keyStatus.ts"])
        // Not vacuous: the hook really does call it, and deck.ts really does
        // define it. A rename that made the needle match nothing would
        // otherwise pass the assertion above forever.
        expect(linesWith("deckKeyStatus(", codeLines(RENDERER + "keyStatus.ts"))).toHaveLength(1)
        expect(
            linesWith("export function deckKeyStatus(", codeLines(RENDERER + "deck.ts"))
        ).toHaveLength(1)
    })
})

// --- One answer, and two surfaces that must not disagree about it ---------
//
// Finding 2 of the 2026-09-09 verification: Overview's GRID card unmounted the
// whole approval block after a click, so the surface the user actually pressed
// said nothing, while Mission and Overview's own Focus rail both showed
// `Sent "y" - waiting for its next output`. The cause was the mount decision
// living at the two call sites as `{approval && …}`: a Grid card embeds a live
// terminal, the answer produces a byte, the byte reclassifies the session, and
// `promptFor` stops returning a prompt - while the rail's pane is not rendered,
// so no byte arrives and its block survives. Identical code, opposite result,
// decided by whether the pane happened to be on screen.
//
// The decision lives inside the component now, and this repo has no component
// tests: re-adding either guard restores the defect with the whole suite green.
const OVERVIEW = src("../src/renderer/src/components/OverviewView.tsx")

describe("both Overview surfaces mount the approval block on the same terms", () => {
    const overview = codeLines(OVERVIEW)

    it("renders ApprovalActions at both call sites, neither of them guarded", () => {
        const sites = linesWith("<ApprovalActions", overview)
        // The rail row and the grid card. A third surface offering these
        // buttons would need the same treatment, so the count is pinned too.
        expect(sites).toHaveLength(2)
        for (const line of sites) {
            const window = overview.slice(Math.max(0, line - 3), line).join("\n")
            expect(window, "guarded call site at line " + line).not.toContain("approval &&")
        }
    })

    it("decides inside the component, on the prompt AND the answer record", () => {
        // Both halves: `!prompt` alone renders an empty box for every session,
        // and `!sent` alone is the unmount that lost the confirmation.
        expect(linesWith("if (!prompt && !sent) return null", overview)).toHaveLength(1)
    })
})
