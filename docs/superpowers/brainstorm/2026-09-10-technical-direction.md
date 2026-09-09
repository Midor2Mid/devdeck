# Technical direction — the seams, 2026-09-10

`technical-director`, written against `HEAD` = `9a9a283`, tree clean, `v0.13.0`
tagged. One of five parallel seats; this one owns structure only. Nobody asked
me anything today, which is itself the finding: the boundary work designed on
2026-08-25 was never landed, and **the violation it was designed to stop is
still in the tree on a public repository.**

I did not run `npm test` or launch the app: a `performance-analyst` is measuring
this machine, and a vitest run would contaminate its numbers. Every claim below
is from source, and the command that produced it is named. Where I could not
verify something without running it, I say so.

**The one-line ruling: the four boundary rules cost about two hours and one new
file, they currently pass with an eleven-entry allowlist and one fix, and they
should land before the first stranger is invited — not because the beta needs
them, but because they are the cheapest item on this list and they will never be
cheaper than while the tree is clean and the deletions have not started.**

---

## 0. The one violation, precisely

I enumerated every cross-layer import edge in `src/` mechanically (63 of them).
Exactly one is a **value** import that crosses `main/` to `renderer/`:

```
src/main/server.ts:29    import { exitNotice } from "../renderer/src/termExit"
```

Used once, at `src/main/server.ts:710`:

```ts
const notice = exitNotice(exitCode, process.platform === "win32")
```

This is the same file and the same import that motivated the 2026-08-25 design.
It has survived a four-phase audit, sixteen remedy items, three releases and the
flip to public.

`src/renderer/src/termExit.ts` is 69 lines and **two responsibilities**:

| Lines | What | Owner |
|---|---|---|
| 11-32 | `FASTFAIL`, `exitNotice(exitCode, isWindows)` — pure, no DOM, no imports | belongs in `src/shared/` |
| 46-69 | `const exitCodes = new Map<string, number>()` plus `recordExit` / `exitCodeOf` / `clearExit` | renderer-only mutable state |

Main imports the whole module to reach the pure half, so **main's rollup bundle
contains a second, dead copy of the renderer's exit-code Map.** Dead today. The
reason that is not merely untidy: main is the natural producer of pty exits — it
already owns `src/main/pty.ts` and already computes `exitCode` at
`server.ts:710`. The obvious next change is main calling `recordExit`. At that
moment there are two Maps, main's and the renderer's, and `exitCodeOf` returns a
different answer depending on which process asks. Every consumer of derived
status (`keyStatus.ts:47` reads `exitCodeOf`) then disagrees about which
sessions are dead — and `deckKeyStatus` is precisely the seam this codebase
spent 2026-09-08 consolidating. That is a bug class, not a style point.

**The split, named:** `src/shared/termExit.ts` takes `FASTFAIL` and `exitNotice`
(pure exit-code to text). `src/renderer/src/exitRecord.ts` — the name
`tests/exitRecord.test.ts` already implies — takes the Map. Importers to touch:
`src/main/server.ts:29`, `src/renderer/src/store.ts:51`,
`src/renderer/src/keyStatus.ts:4`, `tests/exitRecord.test.ts`. No behaviour
changes; `exitNotice` is a pure function that already has a unit test.

## 1. What the current seams forbid

### Cheap-looking and not cheap

- **Adding anything to `src/main/` that a renderer surface also wants to say.**
  There is no place to put it. `src/shared/` exists (9 modules) and is the
  declared home, but `src/preload/index.ts:851` exports `DevDeckApi` and is
  imported for types by 23 renderer files *and by three main modules*
  (`search.ts:4`, `system.ts:2`, `usage.ts:5`). So the project has **two**
  shared layers with no rule saying which. A stranger adding a payload type
  guesses. Both guesses typecheck.
- **Renaming anything in `src/main/ledger.ts`.** Two renderer files import its
  types directly, bypassing the declared door: `ledgerView.ts:16`,
  `runRecorder.ts:22`. Type-only, so no runtime edge — but the renderer's type
  surface is pinned to a main-process module's internals.
- **Any component change to a session's form.** `vitest.config.ts` is
  `environment: "node"` and component tests are forbidden, so a chip, a dot or a
  disabled state is verifiable only by driving the built app, only on the
  author's machine, and only while no other process holds the single-instance
  lock. Today that is a blocking resource: this seat could not launch the app
  because another seat has it.
- **Dropping a production dependency.** Looks like a `package.json` edit. It is
  a packaging decision: `package.json`'s `asarUnpack` names
  `node-sqlite3-wasm`, and `scripts/verify-packaged.mjs:129` only checks that
  `@lydell` was unpacked — nothing compares the `asarUnpack` globs to the
  dependency list, so a stale glob is a silent lie in the packaging config.

### Expensive-looking and actually cheap

- **The four boundary rules.** No ESLint exists in this repo (`devDependencies`
  has none, no config file), so my first instinct — an import lint — would mean
  a new toolchain. It does not have to be. This project already runs two
  source-scanning vitest suites in CI: `tests/signalSites.test.ts` (with a
  comment-and-string-stripping `stripCode` scanner hardened against three real
  mutations) and `tests/publishedIdentifiers.test.ts` (hashed denylist over
  tracked files). The boundary rules are the same shape, reuse the same
  machinery, add **zero dependencies**, and pass today with one fix and an
  eleven-entry allowlist. This is the cheapest item on the whole list.
- **Binding the `window.api` stubs.** Received as "~99 stub objects". It is not
  99. `src/preload/index.ts:851` already exports `export type DevDeckApi =
  typeof api`, and `src/renderer/src/global.d.ts` already consumes it. There are
  **17** stub construction sites — `grep -rn "window: unknown" tests/` finds 17
  assignment sites in 17 files, plus 5 near-variants using
  `Record<string, unknown>` or a local `g`. One typed factory in
  `tests/support/api.ts` taking a deep-partial override and returning
  `DevDeckApi`, and 22 call sites, closes it. Excess-property checking is what
  does the work: a stub overriding `db.query` after `query` is renamed becomes a
  type error at the stub, which is the exact rename this hole exists to miss.
- **Killing `runPipeline`'s 373 lines out of the store.** See section 5.

## 2. The debt, ordered, with both prices

Ordered by what it costs after it bites divided by what it costs now, not by
size.

### D-1. The boundary is crossed and there is no rule. Do this before the beta.

- **Now:** split `termExit.ts` (section 0), create
  `tests/architectureBoundaries.test.ts` (section 6). About two hours. Four
  files touched, one new test file, one new shared module. No behaviour change,
  no packaging change, no dependency change. Verified by `npm run typecheck`
  plus `npm test`; no app launch needed, because nothing user-visible moves.
- **After it bites:** two exit-code Maps disagreeing across processes, found by
  a user reporting that a dead pane says `idle` — exactly the class of bug
  2026-09-08 spent a day removing from eleven surfaces. Plus: the rule then gets
  written *after* D1 has deleted 13 channels and three main modules, so its
  allowlist is derived from a tree nobody has audited.
- **Buys:** the four rules become executable. Also: the next agent that reaches
  for `../renderer/` from main gets a red test instead of a green build.

### D-2. `main/db.ts` and `main/http.ts` have callers D1 never named.

- `src/main/db.ts` has **three** importers: `index.ts:11` (the panel handlers
  D1 deletes), `src/main/mcptools.ts:35` (used at `:334`, `:349`, `:366` — the
  `devdeck_db_*` MCP tools), and `src/main/server.ts:11` (`allConnections`,
  `runQuery`, `listTables` — the phone's routes).
- `src/main/http.ts` has **two**: `index.ts:6` and `server.ts:10`. `mcptools.ts`
  takes `httpSend` by injection (`:132`, used at `:410`, `:422`).
- **Now:** one decision, made in section 4. Free.
- **After it bites:** `npm uninstall pg mysql2 mssql node-sqlite3-wasm` lands,
  the panels are gone and nothing looks broken — the *agent-facing* half of the
  product (five MCP tools) and the *phone* half both lose a capability with no
  panel to reveal the loss. Six test files `vi.mock("../src/main/db")`
  (`db-readonly`, `dbFileApproval`, `mcpHttpBrowser`, `mcpserver`,
  `remoteChoice`, `server-remote`), so a *deleted module* fails loudly — but a
  *dependency-stripped, still-present* `db.ts` mocked in all six keeps the suite
  green while the real driver import throws at runtime on a stranger's machine.
- **Buys:** D1 splits into a reversible half and an irreversible half.

### D-3. The `window.api` stubs are not bound to the contract — but the hole is narrower than recorded.

The received fact is "renaming an IPC channel leaves every suite green." True,
and worth fixing. But the *scope* has been overstated in three documents, and
the overstatement has put a 99-object blocker on D1's critical path.

`src/renderer/src/global.d.ts` declares `Window.api: DevDeckApi`, and
`tsconfig.json` includes `src`. So **renderer call sites are already bound**: if
D1 removes `api.db.query` from `src/preload/index.ts`, every renderer caller is
a typecheck error. The renderer is covered.

What is *not* covered is the **tests**. A suite that assigns its own
`{ api: { db: { query: ... } } }` through an `unknown` cast goes on passing
after `db.query` is deleted, asserting store behaviour over a branch that can no
longer be reached. That is not a hidden broken renderer. It is a **dead test
reporting coverage it does not have** — this project's canonical sin, the same
shape as the `changes: number` that erased its failures with `.catch(() => 0)`.

- **Now:** one factory plus 22 sites. Half a day.
- **After it bites:** a suite that certifies a deleted code path, discovered
  when someone trusts it.
- **Buys:** the rename case, which no other layer covers.
- **Ruling on ordering: this is NOT a precondition for D1.** Take it off D1's
  critical path. D1 deletes channels, and deletion is caught by the renderer
  typecheck plus the plan's own bare-channel grep. What D1 needs first is D-2,
  not this.

### D-4. `setView` records nothing, so D1's own condition (a) is unmeasurable.

`store.ts:1734` is `setView`. It appends nothing. `ActivityKind`
(`store.ts:112`) is `"start" | "attention" | "close" | "pipeline"`. `RunKind`
(`src/main/ledger.ts:13`) is `"card" | "pipeline" | "session"`. Nothing anywhere
records that a deck key was pressed or a view was opened.

D1's pre-registered condition (a) is *"no user opens Database or API
unprompted."* **The app as built cannot answer that question.** The only route
to it is asking the user, which is condition (c). See section 4 for the ruling.

- **Now:** free, if the answer is "strike (a)".
- **After it bites:** five sessions complete, and the deletion criterion is
  settled by whoever remembers hardest.

### D-5. One tsconfig, one lib set — the layers have no type-level separation.

`tsconfig.json` is a single project: `lib: ["ESNext", "DOM", "DOM.Iterable"]`,
`types: ["node"]`, `include: ["src", "tests", "electron.vite.config.ts"]`. So
`src/main/` may reference `document` and `localStorage` and typecheck clean;
`src/renderer/` may reference `process.platform` and typecheck clean. This is
*why* `server.ts:29` has been green for weeks.

**Ruling: leave it. This failure may stay invisible.** Project references would
split `npm run typecheck` into several commands, and the one number this project
defends is *zero errors from one command* — the `EditorPanel.tsx` story is that
a signal nobody runs is worse than a coarse one. And the failure is
self-announcing: DOM in main throws on the first line executed, on every launch,
in the loudest possible place. Cheap to detect means no rule needed. What
actually matters is the import *direction*, and section 6's R1 covers that.

### D-6. `runPipeline` is 373 lines inside `useStore`. See section 5.

### D-7. Cosmetic-but-lying: `asarUnpack` will name a dependency that is gone.

`package.json`'s `asarUnpack` lists `node-sqlite3-wasm`; D1 drops it. A glob
matching nothing is harmless, and `scripts/verify-packaged.mjs` will not notice.
Add it to D1's checklist; it is one line. Also worth a look while there:
`@xterm/xterm` is `asarUnpack`ed and it is pure JS — I did not investigate why,
and I am not ruling on it today.

## 3. What I would refuse

Two things, both well built.

### Refused: the `status` brand.

The proposal — brand `AgentStatus` so raw renderer status is unreadable and only
`deckKeyStatus` accepts it — was declined for cost (about 15 legitimate readers
need unwraps). **I decline it for a better reason, and I would decline it even
if the unwraps were free.**

`src/main/server.ts:38` puts the raw status **on the wire**:

```ts
status: "working" | "idle" | "attention" | "waiting"
```

That is the remote protocol's field. The phone client is HTML/JS served by main
and holds no share of this type at all. A brand therefore forces an `as` cast
into `server.ts`'s wire serialiser — the one seam in this application that
HANDOFF section 4 records as **never having been observed working**: "The phone
decision card has never rendered on a real phone. Every fix to it, including the
`dvh` one in 0.11.1, came from review." A brand buys renderer enforcement at the
price of an invisible cast at the least-verified boundary in the codebase. That
is a bad trade at any unwrap count.

**And the enforcement is available without the brand.** I checked every
reference to `AgentStatus` in `src/`. It appears in exactly five files:
`store.ts` (the producer), `deck.ts:1`, `keyStatus.ts:3`, `tileState.ts:16`, and
one comment in `missionTail.ts:227`. **No file under
`src/renderer/src/components/` imports it. Zero.** Meanwhile eleven component
files import `useKeyStatus`/`keyStatusOf`. So the rule is:

> No file under `src/renderer/src/components/**` may import `AgentStatus`.
> A component that needs a session's status calls `useKeyStatus`.

Executable, one assertion, **allowlist empty today**, no unwraps, no cast at the
wire, and it forbids at the *import* rather than at every read. It is strictly
better than the brand and it costs four lines.

### Refused as shaped: D1's dependency drop, bundled with the panel deletion.

Not the deletion — the bundling. Deleting `ApiPanel`/`DbPanel`/`WorkPanel`, the
renderer helpers, and 13 channels is reversible by `git revert`, changes no
packaging config and no lockfile. Dropping four production dependencies is
irreversible in practice (lockfile churn, `asarUnpack` change, a re-signed
rebuild that needs Avast's allowlist per HANDOFF section 3) and lands on two
callers D1 never named (D-2). Bundled, a mistake in the second half forces
re-litigating the first.

**Fine once changed: split D1 into D1a (surfaces plus channels plus store keys,
no `package.json`) and D1b (dependencies plus `asarUnpack` plus
`verify:packaged`), with the section 4 ruling between them.** Same total work,
and the panels are gone before the risky half starts.

## 4. Rulings the plan reserved for this seat

The execution plan's task D1-1 reserves four seams. Here they are.

**Seam 1 — `mcptools.ts` and `server.ts` as second callers of `db`/`http`.**
Keep `src/main/db.ts` and `src/main/http.ts`. Delete the *panel* handlers and
channels. Keep the four DB drivers **only if** the MCP `devdeck_db_*` tools
survive as a product decision (`product-director`'s call, not mine — I am ruling
that it *is* a decision, and that D1 as written silently makes it by deletion).
If the MCP tools go too, then `db.ts` goes, and `server.ts`'s db routes go with
it — say so out loud, because that is a documented remote capability
disappearing.

`http.ts` is different and should **stay regardless**: `server.ts:10` uses
`httpSend` for the relayed mobile path, it has an SSRF guard with a test
(`tests/http-ssrf.test.ts`), and it has no npm dependency to drop. Deleting
`ApiPanel` does not imply deleting `http.ts`.

**Seam 2 — retained settings keys.** D1-2 as planned (add `retained`, never
prune `%APPDATA%`) is the right shape and the right order: it lands *before* any
store definition is deleted. `src/main/settings.ts` being 37 lines and
schema-agnostic (`loadSettings(): unknown`) is what makes this safe — main never
validates the shape, so an orphan key survives a round-trip. Approved as
specified. The one thing to add: a test asserting an orphan key survives
`load` to `save` to `load`, which is what `tests/settingsOrphanKeys.test.ts` is
for.

**Seam 3 — deck key renumbering.** Not mine (`designer` plus owner).
Structurally neutral either way: `MainView` (`store.ts:62`) is a union and
`DECK_VIEWS` (`ViewKeys.tsx:6-19`) is an array; both change together and the
typecheck catches a mismatch.

**Seam 4 — `work.ts` interacting with `netproxy.ts`.** `work.ts` has exactly one
importer (`index.ts:44`) and `resolveProxy` is unit-tested
(`tests/work.test.ts`). `netproxy.ts` is separately imported and separately
tested. Deleting `work.ts` does not touch `netproxy.ts`. Clean cut; approved.

**Fifth ruling, which the plan did not reserve but needs: condition (a).**
Strike it, or replace it. Per D-4 the app cannot measure "opened Database
unprompted" — there is no view event in the ledger or the activity log. The fix
is about 15 lines (`setView` to `window.api.ledger.append`, a fourth `RunKind`),
but I will not authorise shipping a new usage-recording path to five strangers
twelve days before K6 without disclosure and a local-only guarantee, and
building that properly is not a twelve-day item. So: **strike (a) as
unmeasurable, and let (b) and (c) — both of which are things a human hears —
carry the criterion.** A criterion that cannot be evaluated is worse than one
fewer criterion; it is a signal that can lie.

## 5. `store.ts` — is it two files?

**No. Refused, as usually proposed.** And yes, once, in a way nobody has
proposed.

`store.ts` is 3164 lines, one `create<AppState>` at `:730`, `AppState` is 306
lines of interface, and 51 renderer files import it. Five agents serialised on
it yesterday.

The obvious split is the **UI-chrome cluster**: `activityOpen`, `usageOpen`,
`worktreesOpen`, `workOpen`, `switcherOpen`, `composerOpen`, `paletteOpen`,
`extendOpen`, `searchOpen`, `reviewOpen`, `shortcutsOpen`, `envEditorProject`,
`commandsEditorProject`, `identityEditorProject`, `changesTarget`, `prTarget`,
`pendingEditorOpen`, `dragPayload`. Eighteen flags with one-line setters:
declarations at `:275-345` and `:473-475`, initialisers at `:1433-1453`, bodies
at `:1723-1730` and `:2003-2021`. **That is roughly 60 lines out of 3164 — 2% of
the file and 0% of its risk** — and extracting it creates a second store that 51
importers must now choose between. It would also not have prevented yesterday's
collision, which was a merge-surface artefact, not a coupling one. Splitting a
big file into a big file and a small file, and calling that a fix, is the
refactor whose benefit is "cleaner."

The rest genuinely is one job. A pane's birth, layout placement, pty
subscription, status, exit stamp, close and reopen mutate together and must be
atomic inside one `set`; three stores would need cross-store coordination, which
is a worse seam than a long file. **A 3164-line module with one job beats four
800-line modules that must be read together** — and this one is unusually well
annotated for its size.

**The one split I would take.** I measured every top-level action in the store
body. The two largest are the pty subscription closure (about 388 lines) and
`runPipeline` at **373 lines**. `runPipeline` is not a store slice; it is an
orchestrator that *drives* sessions rather than being one. It already has its
domain modules (`pipeline.ts`, `gate.ts`) and its own tests
(`tests/pipeline.test.ts`, `tests/pipelineBranch.test.ts`). Its interface to the
store is narrow and nameable:

> **Responsibility A (stays):** the store owns sessions — create, place, stream,
> status, close.
> **Responsibility B (leaves):** the pipeline runner owns a plan's advance —
> given `runnableSteps`/`sessionPlan`, start sessions, watch derived status,
> record step state, honour the gate.
> **The interface between them:** a `createPipelineRunner({ get, set })`
> factory, exactly the pattern `createRunRecorder` (`store.ts:57`) already
> established in this file.

That takes the store to about 2790 lines, removes the largest single body from
the merge surface, and gives the pipeline a testable unit that does not need the
store. **Cost:** the runner reads and writes a dozen store fields, so the
factory's dependency object is the whole risk; `tests/pipeline.test.ts`,
`tests/pipelineBranch.test.ts`, `tests/gate.test.ts` and `tests/board.test.ts`
must be re-verified, and a pipeline run must be driven in the real app because
neither the build nor the typecheck catches a selector that now returns a fresh
object. **Buys:** one less 373-line function in the file five agents contend
for, and a pipeline runner with a unit test. **Verdict: worth doing, and not
before 2026-10-06.** It is a refactor with no user-visible benefit, and the
milestone is five strangers.

## 6. The rule that should catch all of this

`tests/architectureBoundaries.test.ts`. It does not exist; it was designed on
2026-08-25 and left. It needs **no new dependency** — the machinery is already
in the tree twice (`tests/signalSites.test.ts`'s `stripCode` scanner,
`tests/publishedIdentifiers.test.ts`'s tracked-file walk), and it runs in CI on
every push (`.github/workflows/check.yml`).

Five assertions. I verified each against the current tree.

**R1 — no value import crosses `main/` to `renderer/`.**
Walk every `.ts`/`.tsx` under `src/`, resolve each relative specifier to its
layer, and fail on any non-`import type` edge between `main` and `renderer` in
either direction. *Current state: **1 failure*** (`server.ts:29`), fixed by
section 0's split. Allowlist: empty, deliberately — this is the rule the project
has already broken once, so it gets no escape hatch.

**R2 — type-only cross-layer edges are an explicit, pinned allowlist.**
Eleven today, all verified: `preload` to `main` type-only, six times
(`preload/index.ts` to `main/{guards,projects,index,ledger,devices,server}`);
`main` to `preload` type-only, three times (`search.ts`, `system.ts`,
`usage.ts`); `renderer` to `main` type-only, twice (`ledgerView.ts:16`,
`runRecorder.ts:22`, both to `main/ledger`). Pinned as a set, so a twelfth needs
a deliberate edit. The two `renderer` to `main` edges are the ones I would move
to `src/shared/` next — not today; they are type-only and erase at build time,
and moving them touches `main/ledger.ts`, which the run-ledger data-loss bug is
already queued against.

**R3 — `src/shared/` imports neither `electron` nor `node-pty` nor the DOM.**
Currently true: nine modules, verified no `from "electron"` and no `from
"node:*"`. This is the rule that keeps `shared/` importable by both, and it is
the rule section 0's new `src/shared/termExit.ts` must satisfy — which it does,
being a pure function over a number and a boolean.

**R4 — no component imports `AgentStatus`.** Per section 3. Nothing under
`src/renderer/src/components/**` may import `AgentStatus` from the store.
*Current state: passes, allowlist empty.* This is the rule that replaces the
declined brand, and it is the answer to why eleven surfaces painting raw status
was one seam failure rather than eleven bugs: the general remedy is **a
derivation nobody can bypass plus a rule forbidding the bypass at the import**,
not a type that punishes fifteen honest readers.

**R5 — `asarUnpack` names only real dependencies.** Read `package.json`; every
`asarUnpack` glob's `node_modules/<pkg>` segment must resolve to a key in
`dependencies`. Catches D-7 mechanically, at the moment D1 drops the driver.
*Current state: passes.*

**What no rule here can catch, said plainly.** R1 to R5 say nothing about a
render loop, about whether a component is honest, or about whether a stub matches
the contract (that is D-3's typed factory, a different mechanism). And nothing in
this file can catch a *new* session surface that paints from a status it derived
some sixth way — R4 forbids the known bypass, not an unknown one. That is the
strongest available argument for keeping `keyStatus.ts` as the only door and
keeping components thin: **where no rule can run, the remedy is a narrower seam,
not a wider type.**

## 7. What the roadmap is missing, structurally

Two things no product seat would think to ask for, plus one they would ask for
wrongly.

### 7a. Nothing owns what a stranger sees when the contract is broken on *their* machine.

Five strangers will install a self-signed build. The renderer is typed against
`DevDeckApi` at compile time on the author's machine, and there is **no runtime
handshake** between the loaded preload and the loaded renderer. `out/preload/`
and `out/renderer/` are separate rollup outputs (`electron.vite.config.ts`) with
no shared build identity. On a partial install, an `app.asar` /
`app.asar.unpacked` mismatch, or a portable build launched beside a stale
`out/`, `window.api.something` is `undefined`, the renderer throws inside a tree
that has per-region error boundaries (shipped in 0.11.0), **the region blanks,
and the user has nothing to report.** Silence, not a bug report — from a cohort
of five, which is 20% of the entire evidence base per user.

**The fix is small and belongs before the invitations:** one build-stamp constant
embedded in both bundles, compared once on boot, surfaced in the existing
`diagnostics:record` path (`src/main/diagnostics.ts`, already wired to a
copy-to-clipboard affordance per `tests/diagnosticsCopy.test.ts`). Cost: a
`define` in `electron.vite.config.ts`, one field on `DevDeckApi`, one boot check,
one diagnostics line. Buys: a mismatch reports itself instead of blanking.
Compare that to the cost of one of five sessions producing silence.

### 7b. The five sessions produce quotes and nothing else, and nobody has said that is the plan.

`diagnostics:record` exists. `src/main/ledger.ts` exists and records
`"card" | "pipeline" | "session"`. `runRecorder.ts` appends to it. None of it is
named as the beta's evidence artefact in any document I read, and none of it
records the thing D1's condition (a) asks about (D-4). So the answer to "how
will we know it's working" is currently: `field` writes down what people said.

That may be the right answer for five users — I am not overruling it. But it
should be **stated**, because right now three documents imply a measurement the
app cannot take, and a criterion that silently degrades into "somebody
remembers" is the same failure as `.catch(() => 0)`: a signal that reports a
confidence it does not have.

### 7c. The thing a product seat would ask for wrongly.

Someone will propose component tests, because "we cannot verify a chip." Do not.
`environment: "node"` should stay. A jsdom component test in this app would
assert against a hand-built `window.api` — the *same* untyped stub as D-3 — and
would therefore pass while the real preload-backed app fails. That is not
coverage; it is a second lying signal, and this project has already paid for
one.

**The correct form of the ask is different and is already the house pattern:
push the decision out of the component into a pure module, then the node suite
covers it.** `deck.ts`, `keyStatus.ts`, `missionTail.ts`, `board.ts`,
`tileState.ts`, `probeView.ts`, `ledgerView.ts`, `broadcast.ts` are exactly
this, and it is why eleven surfaces could be fixed in one day: the decision had
one home. The residue — does the dot look right in 84 skins — is genuinely
unverifiable by any test and is `designer` / `design-reviewer`'s, driven in the
real app. **Ruling: keep the ban; the cost is real and it is paid in the right
currency.**

---

## Verdict summary

| Question | Ruling |
|---|---|
| `status` brand | **Refused.** Pushes an `as` cast into `server.ts`'s wire serialiser, the least-verified seam in the app. Replaced by R4: no component may import `AgentStatus` (passes today, empty allowlist). |
| `window.api` stub typing | **Fine once changed** — and cheaper than recorded. One typed factory over the existing `DevDeckApi` export plus 22 sites, not 99 objects. Renderer call sites are already bound via `global.d.ts`; the hole is dead *tests*, not a broken renderer. **Not a precondition for D1.** |
| `store.ts` | **Fine as shaped.** The 18 modal flags are 2% of the file and 0% of its risk; extracting them is the uncosted "cleaner" refactor. One split I would take, after 2026-10-06: `runPipeline` (373 lines) to `createPipelineRunner({get,set})`, following `createRunRecorder`. |
| D1 | **Fine once changed.** Split into D1a (surfaces, channels, store keys) and D1b (dependencies, `asarUnpack`, re-sign), with the Seam-1 decision between them. `http.ts` stays regardless. Condition (a) is unmeasurable — strike it. |
| Boundary rules | **Land `tests/architectureBoundaries.test.ts` before the first invitation.** R1 to R5, zero new dependencies, one existing violation to fix. |

**The one structural thing to do before the beta rather than after:** land the
four boundary rules and the `termExit.ts` split. Not because the beta needs them
— because they are the cheapest item here, they will never be cheaper than on a
clean tree before the deletions, and one of them is already broken in public.
