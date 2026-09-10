# Pre-beta development plan — 2026-09-10

Ordered by the owner's instruction to begin development, against the findings of
seven agent seats on 2026-09-09 and 2026-09-10. Every item below traces to a
named finding in `docs/superpowers/brainstorm/2026-09-10-*.md`; nothing here was
invented for this plan.

**The dissent, recorded once and then dropped.** `field`, `pm`, `product-reviewer`
and `product-director` all concluded that no code is build-now and that the
binding constraint is `docs/beta/02-recruiting-message.md` §1, drafted and unsent,
with **K6 firing 2026-09-22**. That remains true while this plan executes. The
plan is deliberately scoped so that nothing in Wave 1 competes with sending it —
Wave 1 is work that must be true *before* a stranger runs the app, not work that
delays reaching one.

---

## Wave 1 — what must be true before a stranger runs it

Three tracks, disjoint files, run in parallel.

### 1A — the three proven holes (`security-engineer`)
Files: `src/main/guards.ts`, `src/main/server.ts`, `src/main/redact.ts`, their tests.

| # | Finding | Fix |
|---|---|---|
| F-1 | `isBlockedAddress` enumerates only `::ffff:/96`; NAT64, 6to4, IPv4-compatible, IPv4-translated and Teredo all pass with `guardRemote: true`. `dns.lookup` returns those literals verbatim, so both layers ask the same wrong question. **7 proven assertions.** | `embeddedV4()` at the decision point, plus `fec0::/10` and `ff00::/8`. Note `server-guards.test.ts:82` currently **asserts `fec0::1` is allowed** — a test asserting a bypass. |
| F-2 | `/xterm.js` is served above `authFor` (`server.ts:320` vs `:331`) and re-read synchronously per request: 488,663 bytes, 3.45 ms each, **290 rps blocks the event loop that relays every PTY byte**, unauthenticated. | Memoize. |
| F-3 | `redact.ts` has no rule for a filesystem path, so `shell.resolved` and every `agents[].command` carry `C:\Users\<real name>\…`. | Redact the home path. **Gates `field`'s plan**: candidates are to paste diagnostics into a public issue. |

F-1 blocks the beta if the remote server ships on by default. Establish which it does.

### 1B — the notification that does nothing, and the last blip (`backend-dev`)
Files: a new main-process notify path, `src/preload/index.ts`, `src/renderer/src/store.ts`.

- **F9, settled by measurement 2026-09-10** (`scratchpad/f9-notification.js`):
  `Notification.permission` reads `denied`, the constructor **does not throw**,
  `requestPermission()` resolves `denied`, and the clipboard control confirms the
  handler is active and not selective. `notifyAttention` (`store.ts:944`)
  constructs and trusts `try/catch` — the one signal that never fires here. **The
  Desktop-notifications toggle has never worked and has never said so**, on the
  surface a user reaches for when they stop watching the deck.
  Fix: notify **from main over IPC**, where the permission handler does not apply.
  **Not** by exempting `notifications` from the handler. The toggle must not be
  able to read on while nothing is delivered.
- **The tab-remount blip:** re-entering an agent's tab flips `waiting` → `WORKING`
  for ~6s (`store.ts:1180-1187`), because the remount replays ≥2 chunks and the
  `waiting` gate's bar is that output *continues*. `qa` observed the pane's
  characters do not change — that is the discriminator. Not a regression (before
  the gate, one chunk sufficed) and the **last remaining disclosure**.

### 1C — the published falsehoods (`marketing`)
Files: `PRODUCT.md`, `README.md`, `ROADMAP.md`, `site/index.html`.

- **`PRODUCT.md`'s premise is now false.** It says of the status quo *"none of them
  can tell me which agent needs me."* Verified 2026-09-10: Herdr (37.2k stars,
  Apache-2.0, native Windows including "endpoint-protected Windows", panes marked
  "working, blocked, or idle", *"when an agent stops and needs an answer, herdr
  says so"*, positioned as "one rust binary, no electron") and
  `microsoft/intelligent-terminal` (Windows Terminal fork, agent status bar over
  ACP, Build 2026) both do. Correcting a sentence that has become untrue is not a
  strategy decision.
- **The "all-in-one" repointing**, ordered 2026-09-08 and still undone. Replacement
  lead paragraphs are already drafted in `2026-09-10-marketing.md`. It must not be
  repointed onto the suite, which D1 deletes.
- **`site/index.html:158` contradicts `:246`** — the hero says "SignPath applied
  for", the code-signing section says the filing has not been applied for. A live
  self-contradiction on the most-skimmed part of an undeployed page.

---

## Wave 2 — D1, split, plus the deck it implies

Authorised outright by the owner 2026-09-08 (`NOTES.md` Decisions). Runs after
Wave 1 because it touches `store.ts`, the components, and `package.json`.

**D1a — the panels (reversible).** Delete `DbPanel`, `ApiPanel`, `WorkPanel` with
their handlers, channels and stores; demote Tasks. Note the `window.api` stub hole
is **17 sites, not 99** — `global.d.ts` already binds the renderer to `DevDeckApi`,
so a channel *deletion* is a typecheck error and only dead tests are blind. One
deep-partial factory closes it; it is **off** D1's critical path.

**D1b — the drivers (needs lockfile, `asarUnpack`, re-sign).** Drop `pg`,
`mysql2`, `mssql`, `node-sqlite3-wasm`. Three seats converge that this is the
valuable half:
- **performance:** measured **830 ms of every cold start**, `require()`d eagerly
  before `app.whenReady()`, nearly all `mssql`. Contributes **zero renderer
  bytes** — the "6.1 MB bundle" framing was wrong.
- **security:** keeping `devdeck_db_query` keeps `rejectUnauthorized: false` on pg
  and mysql and unconditional `trustServerCertificate: true` on mssql — **the SSL
  checkbox is a control that lies.**
- **competitive:** the MCP db tools' precondition (a saved connection) has never
  existed on any machine.

But `db.ts` has **three** importers (`index.ts:11`, `mcptools.ts:35`,
`server.ts:11`) and `http.ts` two, so dropping the drivers silently removes five
MCP tools and the phone's db routes with no panel left to reveal the loss.
`asarUnpack` still names `node-sqlite3-wasm` and nothing compares those globs to
`dependencies`.

**D1c — the four-key deck.** `Mission · Terminal · Browser · Editor`, then a
`⚑ N want you` control that renders nothing at zero, then repo facts, then three
tools with Tasks folded into More. Specified in `2026-09-10-design-improvement.md`.
Nobody had designed the post-D1 layout before that document.

---

## Wave 3 — queued behind the beta, not before it

Named here so they are not silently lost, and explicitly **not** started.

- **Accent discipline.** `DESIGN.md` says one accent; one Terminal frame spends it
  on ~14 things out of **181 `var(--accent)` uses**, so it points at nothing — and
  the wants-you count, the product's whole promise, is a 12px glyph in the corner
  beside the git branch. Three tiers proposed.
- **The `termExit` boundary.** `src/main/server.ts:29` value-imports
  `../renderer/src/termExit` — the only value-import among 63 cross-layer edges,
  and exactly what the 2026-08-25 boundary work existed to prevent. ~2 h, five
  assertions, zero new dependencies.
- **Q1** — CLI-declared attention signals as `http` hooks into the MCP server
  already running on `127.0.0.1:8787`; the payload carries `transcript_path`,
  which also deletes the roadmap's separate `--session-id` plan.
- **Q2** — the Windows taskbar overlay badge, riding on F9's fix: same file, same
  count.
- `npm audit` in CI, a `SECURITY.md`, and a tripwire on `devdeck-archive-private`
  ever becoming public.
- HiDPI check on the 6px diamond: every measurement was at 1×, most Windows
  laptops run 125–150%.

## Standing constraints for every wave

`npm run typecheck` ends at **zero**. `npm test` ends green and no lower than
**1748 passed / 1 skipped / 138 files**. No component tests — `vitest` is
`environment: "node"`, there are no `.test.tsx` files and none may be added, so a
form change is verifiable only by driving the real app. Do not run prettier. Read
`src/renderer/src/ownership.ts` with `git diff --text`. All six skins survive any
CSS change. Only one agent may drive the app at a time (single-instance lock).
