# Structured Approve/Deny on the Remote Client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the phone answer an agent's permission prompt with a real Approve/Deny button
bound to the exact prompt it was shown, instead of typing a guessed keystroke into a live pty.

**Architecture:** The classifier (`detectApproval`) moves from the renderer to `src/shared/`,
and **main becomes the only thing that classifies**. `pty.ts` already sees every chunk and
holds a 256 KB buffer, so it maintains a cleaned tail per session and mints a single-use
`PendingDecision` — question, the two answer tokens, and a `tailHash` of the exact text the
classifier read. That decision rides the existing `broadcastSessions` payload to every paired
device; a new `{t:"choice"}` message answers it. The server never writes a client-supplied
string: it looks the decision up, checks the token is one it minted, re-derives the tail and
compares the hash, then writes. The desktop tile stops running its own detector and reads
main's decision, so the phone and the desktop cannot disagree about what the agent asked.

**Tech Stack:** Electron (main + preload + renderer), TypeScript, React, vitest (`environment:
"node"`), `@lydell/node-pty`, node `crypto` for the hash. No new dependencies.

**Spec:** `.superpowers/orca-2026-08-30/R4-approve-deny-and-push.md` §3.1–§3.3 (pieces A, B, C)
and its risk register §R1–R12. Triage and scope: `.superpowers/orca-2026-08-30/T1-build-list.md`
(BUILD 1) and `T2-identity-ruling.md` (Q4 — this is the only item with budget).

---

## Global Constraints

- 4-space indentation, double quotes for strings.
- `npm run typecheck` must end at **zero errors**, and `tests/` is inside the typecheck.
- `npm test` must stay green. Baseline at the time of writing: **1165 tests, 102 files.**
- vitest runs `environment: "node"`. There are no component tests and no `.test.tsx`. Main-process
  modules are tested by mocking `electron` and `@lydell/node-pty` — see `tests/ptyCorpse.test.ts`
  for the node-pty mock and `tests/server-remote.test.ts` for the server seam.
- `CLIENT_HTML` in `src/main/server.ts` is hand-written ES5: `var` and `function`, no arrow
  functions, no template literals. Match it.
- **Never write a client-supplied string to a pty.** The `{t:"input"}` path already carries
  arbitrary bytes and is a separately-consented capability; `{t:"choice"}` must only ever write
  a token main itself minted.
- No hard-coded colors or sizes in CSS. Change the token. There are 7 themes × 12 `[data-style]`
  styles; a visual that only works in one is a defect.
- Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`), one logical change each.

---

## What is deliberately NOT in this plan

- **Web Push, a service worker, a PWA manifest, and the trusted-certificate work** (R4 pieces
  D–G). Refused by `T2-identity-ruling.md` §Q4: unobservable by construction, and it sits on the
  `window.api` boundary remedy 16 left untyped. Pieces A–C need none of it.
- **Approve/Deny buttons inside a notification banner.** Forbidden outright — a `notificationclick`
  fetch carries the HttpOnly device cookie, so anyone holding the unlocked phone runs code on the
  machine from a banner.
- **The `unseen` bit** (T1 BUILD 2, 1–2 days) and **region error boundaries** (T1 BUILD 3, 1 day).
  Both survive triage; both are separate plans, written after this one lands.

---

## Correction to the spec, carried into the tasks

R4 §2.3(c) and T1 CORRECTION 3 both state that `approval.ts`'s "only act on attention/waiting"
rule is prose that nobody enforces. **That is wrong.** `missionTail.ts:446-448` is exactly that
gate, under a doc comment that says so. The renderer's guarantee already exists.

What is missing is the same gate in **main**, which has never classified anything. So Task 3
is not "fix a latent defect" — it is "do not lose an existing guarantee when the classifier
moves." Task 4's test exists to prove the renderer's behaviour is unchanged.

---

## File Structure

**Created**
- `src/shared/approval.ts` — the classifier, moved verbatim from `src/renderer/src/approval.ts`.
  Pure, imports nothing, usable from main, preload and renderer.
- `src/shared/tail.ts` — `cleanTail`, `lastLines`, `peekLine`, `CARRY_MAX`, moved from
  `missionTail.ts:7-45`. Pure string handling, no renderer state.
- `src/main/decisions.ts` — the `PendingDecision` registry: mint, look up, consume, expire.
  Owns the status gate and the `tailHash`. One responsibility, no I/O.
- `tests/sharedApproval.test.ts` — proves the move changed nothing.
- `tests/ptyTail.test.ts` — main's cleaned tail and `getTail`.
- `tests/decisions.test.ts` — minting, the gate, single-use, hash mismatch.
- `tests/remoteChoice.test.ts` — the `{t:"choice"}` handler's seven rules.

**Modified**
- `src/renderer/src/approval.ts` — becomes a re-export shim (`export * from "../../shared/approval"`),
  so `store.ts`, `missionTail.ts`, `OverviewView.tsx` and `tileState.ts` keep their imports.
- `src/renderer/src/missionTail.ts` — `cleanTail`/`lastLines`/`peekLine` re-exported from
  `src/shared/tail.ts`; `promptFor` consumes main's decision instead of calling `detectApproval`.
- `src/main/pty.ts` — maintains a cleaned tail per session alongside the raw buffer; exports
  `getTail(id, n)` and `tailDigest(id, n)`.
- `src/main/server.ts` — `RemoteSession.pending`, the `{t:"choice"}` handler, the per-pty write
  lock, and the `CLIENT_HTML` card and badge.
- `src/main/index.ts` — feed session status into the decision registry; expose the pending
  decision to the renderer over IPC.
- `src/preload/index.ts` — one typed accessor for the renderer.
- `ROADMAP.md`, `CHANGELOG.md` — the backlog delta and the release note.

---

### Task 1: Move the classifier and tail helpers into `src/shared/`

Pure relocation. No behaviour change anywhere. This exists as its own task so that the
diff a reviewer reads for Task 2 contains only new logic.

**Files:**
- Create: `src/shared/approval.ts`, `src/shared/tail.ts`, `tests/sharedApproval.test.ts`
- Modify: `src/renderer/src/approval.ts`, `src/renderer/src/missionTail.ts:7-45`
- Test: `tests/approval.test.ts` (existing — must keep passing untouched)

**Interfaces:**
- Consumes: nothing.
- Produces: `detectApproval(tail: string): ApprovalPrompt | null` and the
  `ApprovalPrompt { kind: "menu" | "yesno"; question: string; approve: string; deny: string }`
  interface from `src/shared/approval`; `cleanTail(prev: string, chunk: string, max?: number): string`,
  `lastLines(tail: string, n: number): string`, `peekLine(tail: string): string`, and
  `CARRY_MAX: number` from `src/shared/tail`.

- [ ] **Step 1: Write the failing test**

Create `tests/sharedApproval.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { detectApproval as fromShared } from "../src/shared/approval"
import { detectApproval as fromRenderer } from "../src/renderer/src/approval"
import { cleanTail, lastLines } from "../src/shared/tail"

const MENU = [
    "Do you want to proceed?",
    "❯ 1. Yes",
    "  2. Yes, and don't ask again for rm commands in this project",
    "  3. No, and tell Claude what to do differently (esc)"
].join("\n")

describe("the classifier moved without changing", () => {
    it("is the same function reached through the old renderer path", () => {
        expect(fromRenderer).toBe(fromShared)
    })

    it("still classifies a Claude Code menu the same way", () => {
        expect(fromShared(MENU)).toEqual({
            kind: "menu",
            question: "Do you want to proceed?",
            approve: "1",
            deny: "\x1b"
        })
    })

    it("still refuses a numbered list that is not a prompt", () => {
        expect(fromShared("Steps:\n1. Install\n2. Build\nDone.")).toBeNull()
    })
})

describe("the tail helpers moved without changing", () => {
    it("strips CSI noise and folds \\r into \\n", () => {
        expect(cleanTail("", "\x1b[32mok\x1b[0m\r\ndone\n")).toBe("ok\n\ndone\n")
    })

    it("keeps the last N non-empty lines", () => {
        expect(lastLines("a\n\nb\nc\n", 2)).toBe("b\nc")
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/sharedApproval.test.ts`
Expected: FAIL — `Failed to resolve import "../src/shared/approval"`.

- [ ] **Step 3: Move the files**

```bash
git mv src/renderer/src/approval.ts src/shared/approval.ts
```

Delete from `src/shared/approval.ts` the paragraph of the header comment that begins
"Callers reading this to decide whether to ACT on a prompt" — that rule is about *callers*, and
it now has two of them in different processes. Replace it with:

```ts
// This module only CLASSIFIES. The rule about when it is safe to act on a match
// — only for a session already flagged "attention"/"waiting" — belongs to each
// caller's gate: `promptFor` in the renderer (missionTail.ts) and `refreshDecision`
// in main (main/decisions.ts). Both are tested; neither may be removed.
```

Create `src/renderer/src/approval.ts` as a shim:

```ts
// Moved to src/shared so the main process can classify too. Re-exported here
// because four renderer modules import it by this path.
export * from "../../shared/approval"
```

Cut `cleanTail`, `peekLine`, `lastLines`, `CARRY_MAX` and the four regex constants
(`OSC`, `CSI`, `OTHER`, `CTRL`) out of `src/renderer/src/missionTail.ts:7-45` into a new
`src/shared/tail.ts`, keeping the comments verbatim. In `missionTail.ts`, replace them with:

```ts
import { cleanTail, lastLines, peekLine, CARRY_MAX } from "../../shared/tail"
export { cleanTail, lastLines, peekLine, CARRY_MAX }
```

- [ ] **Step 4: Run the new test, the old test, and the typecheck**

Run: `npx vitest run tests/sharedApproval.test.ts tests/approval.test.ts tests/missionTail.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: zero errors. This is the real proof the move broke no importer.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 1165 passing plus the 5 new ones. No failures.

- [ ] **Step 6: Commit**

```bash
git add src/shared/approval.ts src/shared/tail.ts src/renderer/src/approval.ts src/renderer/src/missionTail.ts tests/sharedApproval.test.ts
git commit -m "refactor(approval): move the classifier where both processes can reach it"
```

---

### Task 2: `pty.ts` keeps a cleaned tail, so main can read what the agent said

**Files:**
- Modify: `src/main/pty.ts` (near `BUFFER_CAP`/`getBuffer` at :65-130, and the `onData` handler at :200-207)
- Create: `tests/ptyTail.test.ts`

**Interfaces:**
- Consumes: `cleanTail`, `lastLines` from `src/shared/tail` (Task 1).
- Produces: `getTail(id: string, n: number): string` — the last `n` non-empty cleaned lines
  for a session, `""` when unknown. `tailDigest(id: string, n: number): string` — sha256 hex
  of exactly that string.

- [ ] **Step 1: Write the failing test**

Create `tests/ptyTail.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest"

interface Fake {
    onDataCb?: (d: string) => void
    onExitCb?: (e: { exitCode: number }) => void
}
let fakes: Fake[] = []

vi.mock("@lydell/node-pty", () => ({
    spawn: (): unknown => {
        const f: Fake = {}
        fakes.push(f)
        return {
            onData: (cb: (d: string) => void): void => {
                f.onDataCb = cb
            },
            onExit: (cb: (e: { exitCode: number }) => void): void => {
                f.onExitCb = cb
            },
            write: (): void => undefined,
            resize: (): void => undefined,
            kill: (): void => undefined
        }
    }
}))

const pty = await import("../src/main/pty")

const ID = "t-tail"
const feed = (s: string): void => fakes[fakes.length - 1].onDataCb?.(s)

describe("main keeps a readable tail per session", () => {
    beforeEach(() => {
        fakes = []
        pty.killAll()
        pty.createPty({ id: ID })
    })

    it("strips control noise across chunk boundaries", () => {
        feed("\x1b[32mDo you want to proceed?\x1b[0m\r\n")
        feed("❯ 1. Yes\r\n  2. No (esc)\r\n")
        expect(pty.getTail(ID, 3)).toBe("Do you want to proceed?\n❯ 1. Yes\n2. No (esc)")
    })

    it("returns an empty string for a session it has never seen", () => {
        expect(pty.getTail("nope", 16)).toBe("")
    })

    it("digests exactly the string getTail returns", () => {
        feed("hello\r\n")
        const a = pty.tailDigest(ID, 16)
        expect(a).toMatch(/^[0-9a-f]{64}$/)
        feed("world\r\n")
        expect(pty.tailDigest(ID, 16)).not.toBe(a)
    })

    it("does not grow without bound", () => {
        for (let i = 0; i < 500; i++) feed("line " + i + "\r\n")
        expect(pty.getTail(ID, 16).split("\n").length).toBe(16)
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ptyTail.test.ts`
Expected: FAIL — `pty.getTail is not a function`.

- [ ] **Step 3: Implement**

In `src/main/pty.ts`, add near the top:

```ts
import { createHash } from "crypto"
import { cleanTail, lastLines } from "../shared/tail"

// The cleaned tail main classifies from. Kept beside the raw buffer rather than
// derived from it on demand: the raw buffer is bytes mid-escape-sequence, and a
// one-pass clean over a slice of it can cut an escape in half. Fed the same
// chunks the renderer's tail is fed, so the two agree by construction.
const TAIL_CAP = 4000
const tails = new Map<string, string>()
```

In the `onData` handler (`pty.ts:200-207`), beside the existing buffer append:

```ts
tails.set(id, cleanTail(tails.get(id) ?? "", data, TAIL_CAP))
```

Wherever a session's buffer is dropped (exit cleanup and `killAll`), add `tails.delete(id)`.

Then:

```ts
/** The last `n` non-empty cleaned lines of a session's output. "" if unknown. */
export function getTail(id: string, n: number): string {
    const t = tails.get(id)
    return t ? lastLines(t, n) : ""
}

/** sha256 of exactly what getTail(id, n) returns — binds a decision to a screen. */
export function tailDigest(id: string, n: number): string {
    return createHash("sha256").update(getTail(id, n)).digest("hex")
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/ptyTail.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/pty.ts tests/ptyTail.test.ts
git commit -m "feat(pty): keep a cleaned tail in main, and a digest of it"
```

---

### Task 3: `PendingDecision` — minted under a gate, bound to a screen, usable once

**Files:**
- Create: `src/main/decisions.ts`, `tests/decisions.test.ts`

**Interfaces:**
- Consumes: `detectApproval`/`ApprovalPrompt` from `src/shared/approval`; `getTail`, `tailDigest`
  from `src/main/pty`.
- Produces:
  ```ts
  export type RemoteOption = { label: string; send: string }
  export type PendingDecision = {
      id: string
      termId: string
      kind: "menu" | "yesno"
      question: string
      tail: string
      tailHash: string
      options: RemoteOption[]
      createdAt: number
  }
  export function refreshDecision(termId: string, status: string, isAgent: boolean): PendingDecision | null
  export function decisionFor(termId: string): PendingDecision | null
  export type ConsumeResult =
      | { ok: true; send: string; termId: string }
      | { ok: false; reason: "unknown" | "consumed" | "not-an-option" | "moved-on" }
  export function consumeDecision(decisionId: string, send: string): ConsumeResult
  export function clearDecision(termId: string): void
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/decisions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest"

let tail = ""
vi.mock("../src/main/pty", () => ({
    getTail: (): string => tail,
    tailDigest: (): string => "hash:" + tail
}))

const { refreshDecision, consumeDecision, decisionFor, clearDecision } = await import(
    "../src/main/decisions"
)

const MENU = [
    "Do you want to proceed?",
    "❯ 1. Yes",
    "  2. No, and tell Claude what to do differently (esc)"
].join("\n")

describe("minting a decision", () => {
    beforeEach(() => {
        tail = MENU
        clearDecision("t1")
    })

    it("mints for an agent that is waiting", () => {
        const d = refreshDecision("t1", "waiting", true)
        expect(d?.question).toBe("Do you want to proceed?")
        expect(d?.options).toEqual([
            { label: "Approve", send: "1" },
            { label: "Deny", send: "\x1b" }
        ])
    })

    it("refuses a session that is merely idle — main's copy of promptFor's gate", () => {
        expect(refreshDecision("t1", "idle", true)).toBeNull()
    })

    it("refuses a non-agent pane even when the text looks like a prompt", () => {
        expect(refreshDecision("t1", "waiting", false)).toBeNull()
    })

    it("keeps the same id while the screen has not changed", () => {
        const a = refreshDecision("t1", "waiting", true)
        const b = refreshDecision("t1", "waiting", true)
        expect(b?.id).toBe(a?.id)
    })

    it("mints a new id when the screen changed", () => {
        const a = refreshDecision("t1", "waiting", true)
        tail = MENU + "\nAllow running this command? (y/n)"
        const b = refreshDecision("t1", "waiting", true)
        expect(b?.id).not.toBe(a?.id)
    })
})

describe("consuming a decision", () => {
    beforeEach(() => {
        tail = MENU
        clearDecision("t1")
    })

    it("accepts a token it minted, once", () => {
        const d = refreshDecision("t1", "waiting", true)!
        expect(consumeDecision(d.id, "1")).toEqual({ ok: true, send: "1", termId: "t1" })
        expect(consumeDecision(d.id, "1")).toEqual({ ok: false, reason: "consumed" })
    })

    it("refuses a string the phone made up", () => {
        const d = refreshDecision("t1", "waiting", true)!
        expect(consumeDecision(d.id, "rm -rf /\r")).toEqual({ ok: false, reason: "not-an-option" })
    })

    it("refuses when the terminal moved on between showing and tapping", () => {
        const d = refreshDecision("t1", "waiting", true)!
        tail = "some completely different screen"
        expect(consumeDecision(d.id, "1")).toEqual({ ok: false, reason: "moved-on" })
    })

    it("refuses an id it never minted", () => {
        expect(consumeDecision("dec:nope:1", "1")).toEqual({ ok: false, reason: "unknown" })
    })

    it("drops the decision when the prompt goes away", () => {
        refreshDecision("t1", "waiting", true)
        tail = "the agent carried on"
        expect(refreshDecision("t1", "waiting", true)).toBeNull()
        expect(decisionFor("t1")).toBeNull()
    })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/decisions.test.ts`
Expected: FAIL — cannot resolve `../src/main/decisions`.

- [ ] **Step 3: Implement**

Create `src/main/decisions.ts`:

```ts
// A permission prompt main is prepared to have answered from somewhere that is
// not this screen — today, a paired phone. Three properties do the work:
//
//   1. It is only minted for a session already flagged "attention"/"waiting".
//      This is main's copy of `promptFor`'s gate (missionTail.ts). The renderer
//      has always had it; main must not ship the capability without it.
//   2. It carries the answer tokens, so a remote client never supplies one.
//   3. It is bound to `tailHash` — the exact text the classifier read. Over a
//      phone link, minutes pass between the card being shown and the tap. If the
//      TUI redrew or somebody answered at the desk, the digit no longer means
//      what the card said, and we refuse rather than fire it blind.
import { detectApproval } from "../shared/approval"
import { getTail, tailDigest } from "./pty"

/** The window the classifier reads. Same 16 lines the Overview has always read. */
const WINDOW = 16

export type RemoteOption = { label: string; send: string }

export type PendingDecision = {
    id: string
    termId: string
    kind: "menu" | "yesno"
    question: string
    tail: string
    tailHash: string
    options: RemoteOption[]
    createdAt: number
}

const pending = new Map<string, PendingDecision>()
const consumed = new Set<string>()

export function decisionFor(termId: string): PendingDecision | null {
    return pending.get(termId) ?? null
}

export function clearDecision(termId: string): void {
    const d = pending.get(termId)
    if (d) consumed.delete(d.id)
    pending.delete(termId)
}

/**
 * Re-derive the pending decision for one session. Returns null — and forgets any
 * previous decision — when the session is not eligible or the prompt is gone.
 */
export function refreshDecision(
    termId: string,
    status: string,
    isAgent: boolean
): PendingDecision | null {
    if (!isAgent || (status !== "attention" && status !== "waiting")) {
        clearDecision(termId)
        return null
    }
    const tail = getTail(termId, WINDOW)
    const prompt = detectApproval(tail)
    if (!prompt) {
        clearDecision(termId)
        return null
    }
    const tailHash = tailDigest(termId, WINDOW)
    const prev = pending.get(termId)
    if (prev && prev.tailHash === tailHash) return prev

    const decision: PendingDecision = {
        id: "dec:" + termId + ":" + tailHash.slice(0, 12),
        termId,
        kind: prompt.kind,
        question: prompt.question,
        tail,
        tailHash,
        options: [
            { label: "Approve", send: prompt.approve },
            { label: "Deny", send: prompt.deny }
        ],
        createdAt: Date.now()
    }
    if (prev) consumed.delete(prev.id)
    pending.set(termId, decision)
    return decision
}

export type ConsumeResult =
    | { ok: true; send: string; termId: string }
    | { ok: false; reason: "unknown" | "consumed" | "not-an-option" | "moved-on" }

export function consumeDecision(decisionId: string, send: string): ConsumeResult {
    if (consumed.has(decisionId)) return { ok: false, reason: "consumed" }
    const d = [...pending.values()].find((p) => p.id === decisionId)
    if (!d) return { ok: false, reason: "unknown" }
    if (!d.options.some((o) => o.send === send)) return { ok: false, reason: "not-an-option" }
    if (tailDigest(d.termId, WINDOW) !== d.tailHash) return { ok: false, reason: "moved-on" }
    consumed.add(d.id)
    pending.delete(d.termId)
    return { ok: true, send, termId: d.termId }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/decisions.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/decisions.ts tests/decisions.test.ts
git commit -m "feat(decisions): a permission prompt main will let a phone answer, once"
```

---

### Task 4: One classifier — the renderer reads main's decision

Without this task there are two things that decide what the agent asked, and remedy 13 is the
standing evidence that two sources for one signal is a defect class, not a convenience.

**Files:**
- Modify: `src/main/index.ts` (the `mobile:sessions` handler around :287-297), `src/preload/index.ts`,
  `src/renderer/src/missionTail.ts` (`promptFor`, :446-448)
- Test: `tests/missionTail.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `refreshDecision`, `decisionFor` from `src/main/decisions` (Task 3).
- Produces: `window.api.decisions.forTerm(termId: string): Promise<PendingDecision | null>` and
  a `decisions:changed` subscription; `promptFor(s: AnySession): ApprovalPrompt | null` keeps its
  signature and its call sites.

- [ ] **Step 1: Write the failing test**

Add to `tests/missionTail.test.ts`:

```ts
describe("promptFor consumes main's decision", () => {
    it("returns null for a session main minted no decision for", () => {
        setDecisions({})
        expect(promptFor({ termId: "t1", isAgent: true, status: "waiting" } as AnySession)).toBeNull()
    })

    it("returns main's prompt verbatim — it does not re-classify", () => {
        setDecisions({
            t1: {
                kind: "menu",
                question: "Do you want to proceed?",
                options: [
                    { label: "Approve", send: "1" },
                    { label: "Deny", send: "\x1b" }
                ]
            }
        })
        expect(promptFor({ termId: "t1", isAgent: true, status: "waiting" } as AnySession)).toEqual({
            kind: "menu",
            question: "Do you want to proceed?",
            approve: "1",
            deny: "\x1b"
        })
    })

    it("still refuses an idle session even when main offers one", () => {
        setDecisions({
            t1: {
                kind: "yesno",
                question: "ok? (y/n)",
                options: [
                    { label: "Approve", send: "y\r" },
                    { label: "Deny", send: "n\r" }
                ]
            }
        })
        expect(promptFor({ termId: "t1", isAgent: true, status: "idle" } as AnySession)).toBeNull()
    })
})
```

`setDecisions` is a helper in the same file that writes the module's decision cache directly —
follow the `window.api` stubbing pattern already used in `tests/paneHold.test.ts`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/missionTail.test.ts`
Expected: FAIL — `promptFor` still calls `detectApproval` on its own tail and ignores the stub.

- [ ] **Step 3: Implement**

In `src/main/index.ts`, where the renderer already reports session status over `mobile:sessions`,
refresh every session's decision from the same list, then notify:

```ts
for (const s of sessions) refreshDecision(s.termId, s.status, s.isAgent)
win?.webContents.send("decisions:changed")
```

Add the matching handler in main:

```ts
ipcMain.handle("decisions:for", (_e, id: string) => decisionFor(String(id)))
```

In `src/preload/index.ts`, beside the existing `pty` block:

```ts
decisions: {
    forTerm: (termId: string): Promise<PendingDecision | null> =>
        ipcRenderer.invoke("decisions:for", termId),
    onChanged: (fn: () => void): (() => void) => {
        const handler = (): void => fn()
        ipcRenderer.on("decisions:changed", handler)
        return () => ipcRenderer.removeListener("decisions:changed", handler)
    }
}
```

In `missionTail.ts`, `promptFor` keeps its gate and stops classifying:

```ts
/**
 * The gate, not the detector — and no longer the classifier either. Main owns
 * detection now (main/decisions.ts) so the phone card and this tile cannot
 * describe the same prompt differently. The status gate stays here because it is
 * this surface's rule about when it may ACT.
 */
export function promptFor(s: AnySession): ApprovalPrompt | null {
    if (!s.isAgent || (s.status !== "attention" && s.status !== "waiting")) return null
    const d = decisionCache.get(s.termId)
    if (!d) return null
    return {
        kind: d.kind,
        question: d.question,
        approve: d.options[0].send,
        deny: d.options[1].send
    }
}
```

`decisionCache` is a module Map refreshed on `decisions:changed`, in the same style as the
existing tail Map — the fast path must not go through React state.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run tests/missionTail.test.ts tests/approval.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: green. Any failure here is a real behaviour change in the desktop path — investigate
before continuing; the desktop's behaviour is supposed to be identical.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/missionTail.ts tests/missionTail.test.ts
git commit -m "refactor(approval): one classifier, in main, for the tile and the phone"
```

---

### Task 5: Carry the decision to the phone on the existing broadcast

No new channel. `RemoteSession` is rebroadcast on every `broadcastSessions`, so the card appears
and clears with the session list — which means a prompt answered at the desk clears every phone's
card for free.

**Files:**
- Modify: `src/main/server.ts:31-40` (`RemoteSession`), and the `getSessions` composition
- Test: `tests/server-remote.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `decisionFor` from `src/main/decisions`.
- Produces: `RemoteSession.pending?: { id: string; kind: "menu" | "yesno"; question: string; tail: string; options: RemoteOption[] }`.

- [ ] **Step 1: Write the failing test**

Add to `tests/server-remote.test.ts`:

```ts
it("carries a pending decision on the session broadcast", () => {
    const s = remoteSessionFor("t1")
    expect(s.pending).toEqual({
        id: expect.stringMatching(/^dec:t1:/),
        kind: "menu",
        question: "Do you want to proceed?",
        tail: expect.stringContaining("❯ 1. Yes"),
        options: [
            { label: "Approve", send: "1" },
            { label: "Deny", send: "\x1b" }
        ]
    })
})

it("omits pending entirely when there is nothing to answer", () => {
    expect(remoteSessionFor("t2").pending).toBeUndefined()
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/server-remote.test.ts`
Expected: FAIL — `pending` is undefined on a session that has a decision.

- [ ] **Step 3: Implement**

Widen the interface in `src/main/server.ts`:

```ts
export interface RemoteSession {
    termId: string
    projectId: string
    projectName: string
    projectPath: string
    tabName: string
    badge: string
    isAgent: boolean
    status: "working" | "idle" | "attention" | "waiting"
    /**
     * A permission prompt this device may answer. `options` rather than a pair of
     * fields so the wire format can grow to N choices without another protocol
     * change; `tail` so the phone can show the raw screen beside the parsed
     * question — the parsed label is the part an agent controls.
     */
    pending?: {
        id: string
        kind: "menu" | "yesno"
        question: string
        tail: string
        options: { label: string; send: string }[]
    }
}
```

Where the session list is composed, attach `decisionFor(s.termId)`, omitting the key when null.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/server-remote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/server.ts tests/server-remote.test.ts
git commit -m "feat(remote): put the pending decision on the session broadcast"
```

---

### Task 6: The `{t:"choice"}` handler — seven rules, all load-bearing

This is the security boundary. A remote approve is remote code execution by design; every rule
below is the reason it is a narrow one.

**Files:**
- Modify: `src/main/server.ts` (the `switch (msg.t)` block around :386-400)
- Create: `tests/remoteChoice.test.ts`

**Interfaces:**
- Consumes: `consumeDecision` from `src/main/decisions`; `writePty` from `src/main/pty`.
- Produces: the wire messages
  `{ t: "choice", id: string, decisionId: string, send: string }` (phone → server) and
  `{ t: "choice:res", decisionId: string, outcome: "accepted" | "rejected" | "unknown", reason?: string }`
  (server → phone).

- [ ] **Step 1: Write the failing test**

Create `tests/remoteChoice.test.ts`, one test per rule. Follow the socket/deps fake in
`tests/server-remote.test.ts`; assert on the fake pty's `written` array and on the `choice:res`
frames the fake socket received.

```ts
it("writes the minted token and answers accepted", () => { /* written === ["1"] */ })
it("appends no Return for a menu — a trailing \\r breaks the TUI choice", () => {
    // written must be exactly ["1"], never "1\r"
})
it("honours the token as recorded for yesno — approval.ts already carries \\r", () => {
    // written must be exactly ["y\r"]
})
it("refuses a client-supplied string and writes nothing", () => { /* not-an-option */ })
it("refuses a second tap on the same decision", () => { /* consumed */ })
it("refuses once the screen has moved on, and says so", () => { /* moved-on */ })
it("refuses a decisionId for a session this device is not attached to", () => { /* … */ })
it("serialises against a concurrent write to the same pty", () => { /* the lock */ })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/remoteChoice.test.ts`
Expected: FAIL — the server ignores an unknown message type.

- [ ] **Step 3: Implement**

In the message switch in `src/main/server.ts`:

```ts
case "choice": {
    // A phone may only replay a token main minted, for a prompt main can still
    // see on screen, once. Everything else is a refusal with a reason, because
    // a silent no-op over a slow link is how you get a double answer.
    const decisionId = typeof msg.decisionId === "string" ? msg.decisionId : ""
    const wanted = typeof msg.send === "string" ? msg.send : ""
    if (!ws.attached?.has(id)) {
        send(ws, { t: "choice:res", decisionId, outcome: "rejected", reason: "Not attached." })
        break
    }
    const r = consumeDecision(decisionId, wanted)
    if (!r.ok) {
        send(ws, {
            t: "choice:res",
            decisionId,
            outcome: r.reason === "unknown" ? "unknown" : "rejected",
            reason: REASONS[r.reason]
        })
        break
    }
    withPtyWrite(r.termId, () => writePty(r.termId, r.send))
    send(ws, { t: "choice:res", decisionId, outcome: "accepted" })
    broadcastSessions(deps)
    break
}
```

`REASONS` maps each reason to copy the phone shows verbatim:

```ts
const REASONS: Record<string, string> = {
    unknown: "That prompt is no longer on screen.",
    consumed: "Already answered.",
    "not-an-option": "That is not one of the offered answers.",
    "moved-on": "The terminal moved on — check it before answering again."
}
```

`withPtyWrite(termId, fn)` is a small per-id mutex in `server.ts`, so a choice cannot interleave
with the `upload` handler's trailing `writePty(id, dest + " ")` or a concurrent `{t:"input"}`.

Note the absence of any `+ "\r"`. For `kind: "menu"` a trailing Return breaks both the numbered
selection and ESC denial; for `kind: "yesno"` the token from `approval.ts` already ends in `\r`.
Honour the token as recorded — do not add logic.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/remoteChoice.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the security suites too**

Run: `npx vitest run tests/server-guards.test.ts tests/server-remote.test.ts tests/devices.test.ts`
Expected: PASS. This path is reachable by any paired device; a regression in the guards matters
more than the feature.

- [ ] **Step 6: Commit**

```bash
git add src/main/server.ts tests/remoteChoice.test.ts
git commit -m "feat(remote): answer a permission prompt with a token the server minted"
```

---

### Task 7: The card on the phone

**Files:**
- Modify: `src/main/server.ts` (`CLIENT_HTML` — the term view, the list view, and the CSS block)

**Interfaces:**
- Consumes: `RemoteSession.pending` (Task 5) and the `choice` / `choice:res` messages (Task 6).
- Produces: no exported surface — this is the client page.

- [ ] **Step 1: Add the card markup and CSS**

In the term view, above the quick-key bar, a card that renders only when the attached session
has `pending`:

- The parsed `question` as the heading.
- **The raw `tail` excerpt below it, through the existing `esc()` helper** (`server.ts:990`) — the
  parsed label is the string an agent controls, so the raw screen is what lets a human notice a
  lie. Show both, never the parsed one alone.
- Two buttons, `Approve` first and accent-filled, matching `MissionControl.tsx:342-356` so the
  phone and desktop are recognisably one product. Minimum 44 px touch targets.
- A `submitting` flag that disables both on tap and re-enables only on a `choice:res` — the
  double-tap guard.

Keep it ES5: `var`, `function`, string concatenation. Colors come from the existing CSS custom
properties already defined in `CLIENT_HTML` (`--ac`, and the `.dot.attention` family) — add no
literals.

- [ ] **Step 2: Add the list-view badge**

On a session row whose `pending` is set, a `NEEDS YOU` badge using the same vocabulary as
`tileState.ts:167-176`.

- [ ] **Step 3: Handle the three-valued reply**

```js
case 'choice:res':
    submitting = false;
    if (m.outcome === 'accepted') { toast('Answered ✓'); }
    else { toast(m.reason || 'Response unconfirmed — check the terminal before retrying', true); }
    break;
```

Three-valued on purpose: a binary success/failure invites a retry, and a retry is how the wrong
digit reaches a live agent.

- [ ] **Step 4: Verify in the real app**

Use the **`run-app` skill**. Run `npx electron-vite build` first — the harness loads `out/`.

1. Start an agent session and drive it to a permission prompt.
2. Open the remote client (the desktop's own browser is enough — same page, same socket).
3. Confirm the card appears with both the question and the raw tail.
4. Tap Approve; confirm the agent proceeds and the card clears on every client.
5. Answer a second prompt **at the desk** and confirm the phone's card clears without being tapped.
6. Force the staleness path: show a card, type something into the pane to move the screen on,
   then tap. Expect the refusal copy, and confirm nothing was written to the pty.

Step 6 is the one that matters. If it fires the keystroke anyway, stop and fix Task 3 or 6 —
that is the failure this whole design exists to prevent.

- [ ] **Step 5: Commit**

```bash
git add src/main/server.ts
git commit -m "feat(remote): a phone card that shows the question and the screen behind it"
```

---

### Task 8: Say what shipped, and correct what was already false

**Files:**
- Modify: `CHANGELOG.md`, `ROADMAP.md`, `src/main/tlscert.ts:7-11`, `src/renderer/src/components/SettingsModal.tsx:2046-2052`

- [ ] **Step 1: Fix the two false claims (CORRECTION 1 — independent of this feature)**

`tlscert.ts:7-11` and `SettingsModal.tsx:2046-2052` both say the self-signed certificate provides
"a secure context (which unlocks reliable mobile push)". It does not: service worker registration
and `PushManager` are refused behind a clicked-through certificate error, and iOS Safari offers no
path to trust one at all. Rewrite both to state what the certificate **does** buy, which is real:
link encryption on a plain LAN, plus the `__Host-` cookie prefix and `Secure` attribute
(`guards.ts:222-224`). Correct `ROADMAP.md:67`'s "best-effort OS notification" to say what
best-effort means — the tab must be open and foregrounded, which is precisely the case where you
did not need the notification.

This is the same defect class as the sparkline: a claim the app cannot keep. It ships regardless
of whether push is ever built.

- [ ] **Step 2: Write the changelog entry**

Under a new version heading, in the house voice — what changed, and what it costs:

- The phone can answer a permission prompt with a button instead of a guessed keystroke.
- **A prompt whose screen has changed is refused, not answered.** Name this as the point of the
  feature, not a limitation.
- The desktop tile and the phone card now read one classifier, so they cannot disagree.
- The certificate copy was wrong and is now right.

- [ ] **Step 3: Update `ROADMAP.md`**

Under "Milestone 7 — Remote / mobile access", mark structured approve/deny done, and — per
`T2-identity-ruling.md` — **write down the refusal** that this work makes tempting:

```
- Never: accepting a second *desktop* as a paired client. `server.ts` is one diff from
  it (token pairing, device records, revocation, a socket relaying pty bytes). The only
  thing keeping DevDeck a personal cockpit rather than a host platform is that the client
  is a web page. Not a capability gap — a decision.
```

- [ ] **Step 4: Full verification**

Run: `npm run typecheck` — expected zero.
Run: `npm test` — expected green, ~1192 tests.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md ROADMAP.md src/main/tlscert.ts src/renderer/src/components/SettingsModal.tsx
git commit -m "docs(remote,tls): say what the phone can answer, and stop claiming push"
```

---

## Follow-on plans — not this plan

Written after this lands, in this order:

1. **The `unseen` bit** (1–2 days). One boolean — has the user focused this pane or acted on this
   tile since its state last changed — consumed in `tileState.ts` as a *modifier* on `waiting` and
   `exited`, never a tenth `TileStateKind`. It makes an existing count **smaller**: `wantsYou()`
   currently counts agents you already looked at and deliberately left alone, which is the
   light-that-never-goes-off the mission-decide spec named and solved only for tone.
   **Hazard to write into that spec:** remedy 13 removed visibility from *classification*, and this
   puts a visibility-derived bit back into the model. It is only safe as an acknowledgement axis
   that never changes the state — `waiting` stays `waiting` whether seen or not — read by the count
   and one CSS class and nothing else. If that line blurs during implementation, stop.
2. **Three region error boundaries** (1 day) — deck, topbar, main view, each with copy naming what
   survived. Today a throw in `DbPanel` blanks the cockpit while eight ptys keep running in main,
   invisible and unanswerable. Three regions, not five; keep the root boundary.
3. **CORRECTION 2** (half a day) — `OverviewView.tsx:20-21` orders sessions by a private `rank()`
   that reads `status` alone, while `MissionControl` and `DeckStatus` read `wantsYou()`. Two live
   surfaces order the same sessions differently and both offer Approve/Deny. The fix is
   subtraction: `OverviewView` consumes the shared predicate and `rank()` is deleted.
