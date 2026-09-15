# QA — the Work split, the phantom attention, and `/clear`

Tree at `963c8ef`, clean, nothing under `src/` touched by this pass. Three changes
had landed and none had been seen running: the `work.ts` → `azurepr.ts` split
(`e723165`), the notification-map fix (`d739f32`), and the `SessionStart.source`
read in the same commit.

Everything below was observed. Where a claim is derived rather than seen, it says
so. Where the method could not see something, §7 says that too.

**Scratch profile.** Every app run used `--user-data-dir` pointed at a throwaway
directory under the session scratchpad, and debug ports 9333–9338. The owner's
own DevDeck processes were not touched, not enumerated and not killed. Two
throwaway git repos were created as projects — one with an Azure DevOps remote in
a **path containing a space** (`…/scratchpad/azure repo`), one with a GitHub
remote. The agent preset used was a seeded `QA Agent` whose command is `cmd`, so
no real agent CLI, quota or credential was involved.

---

## 1. Baseline

| Check | Result |
| --- | --- |
| `npm run typecheck` | **0 errors** |
| `npm test` (full suite, not the new files) | **153 files, 2075 passed, 1 skipped**, 17.9s |
| `npx electron-vite build` | clean, `✓ built in 1m 3s` |

---

## 2. The Work split — the PR path survives

**The regression that was feared did not happen.** Driven three ways.

**a. The IPC itself.** `window.api.pr.createAzure({...})` called from the live
renderer, through `pr:createAzure` → `azurepr.createAzurePr`, returned:

```
{"ok":false,"error":"No Azure DevOps PAT saved. The Work panel that saved one was removed in 0.14.0, so only a PAT saved before then can be used - open the pull request in Azure DevOps."}
```

That is the **new** copy, verbatim, off the wire. It names the panel's removal and
no longer points at `Work → ⚙`. The handler is registered, reachable, and the
module loads.

**b. The Azure modal.** Mission → `Diff` on the Azure project → `Open PR ↗`.
Modal opened, rendered `feature/qa-pr-check → main`, host label
`Azure DevOps · Widgets/widget-api`, action button `Push & create PR`.
(`02-pr-modal-azure.png`.) **Zero console errors, zero unhandled rejections**
across the whole run (an in-page collector on `console.error`, `error` and
`unhandledrejection` returned `[]`).

**c. The GitHub modal is unaffected.** Same route on the GitHub project: host
label `GitHub · qa-org/qa-repo`, branch `feature/gh-pr-check`, target input
`main`, action button `Push & open PR page` (`03-pr-modal-github.png`).
`pr.remoteInfo` parsed both remotes correctly, including the Azure repo whose path
contains a space.

**d. Nothing reaches `window.api.work`.** At runtime `typeof window.api.work` is
`undefined`, and the bridge group list is
`pty, decisions, projects, menu, workspace, settings, server, devices, mcpsrv,
attention, checks, netproxy, clipboard, mobile, app, projectEnv, update, ai,
search, system, probe, diagnostics, usage, ledger, fs, git, pr, browser, mcp,
extend, shell, triggers, env, notify, badge` — no `work`. The built bundles carry
zero `work:*` channel strings and two `createAzurePr` / `pr:createAzure` sites in
`out/main/index.js`. No console error was raised by any surface reaching for it.

### Finding W1 — the PR modal still bills a panel that no longer exists (confirmed, low–medium)

`src/renderer/src/components/PrModal.tsx:143-147`

```
Azure DevOps PRs are created via the API using your Work PAT (needs
Code: read & write). Other hosts: DevDeck pushes the branch and opens
the create-PR page.
```

The error path was corrected; this hint was not. It is shown on **every** PR
modal — GitHub's too, where it is also irrelevant (`03-pr-modal-github.png`,
bottom). A stranger on a fresh install reads "your Work PAT", goes looking for
where to set one, and there is nowhere: the panel is gone and `azurepr.ts` has no
write path by design. The module doc-comment at `PrModal.tsx:9` says the same
thing to the next reader. This is the same class of stale copy the commit set out
to fix, one file away from the line it fixed.

---

## 3. The phantom attention — driven end to end

Method: DevDeck's own loopback server on `127.0.0.1:8799` behind its bearer token
(seeded into the scratch `settings.json`, started by the app itself on load),
`POST /hook` with `X-DevDeck-Session` carrying a **live agent pane's** id — the
exact shape in `docs/attention-hooks.md`. A `UserPromptSubmit` was posted first so
a declared `working` was standing and the screen classifier could not be confused
with the hook. Outcome read from the `x-devdeck-hook` response header; UI read
from the DOM after each post.

| `notification_type` | HTTP | outcome header | `⚑ N` | deck-key form | tile |
| --- | --- | --- | --- | --- | --- |
| `push_notification` | 204 | `ignored` | **absent** | unchanged | unchanged |
| `computer_use_enter` | 204 | `ignored` | **absent** | unchanged | unchanged |
| `computer_use_exit` | 204 | `ignored` | **absent** | unchanged | unchanged |
| `worker_permission_prompt` | 204 | **`accepted`** | **`1 wants you`** | `key-attn` + `!` | `ASKING` |
| `brand_new_vendor_needs_input` (unknown) | 204 | **`accepted`** | **`1 wants you`** | `key-attn` + `!` | `ASKING` |

`04-silent-types-no-flag.png` is the deck bar after all three silent types: no
flag, hollow-diamond tile, nothing to answer. `05-worker-permission-raises-
attention.png` is the same deck one post later: `⚑ 1 wants you`, the key wearing
the filled dot, halo and `!`.

**Only `worker_permission_prompt` raises attention. The other three raise
nothing. An unknown type still raises attention** — the deliberate fallthrough is
intact, so a vendor's new "needs input" type will still reach the user.

Repeated against a second app launch (§4's run) with the three silent types posted
while the activity drawer was open: **no activity row, no count change, no key
class change** for any of them.

The message survives the round trip: the Mission tile for the
`worker_permission_prompt` session reads *the agent said "worker needs permission
for…"* (`06-mission-four-keys-dot-forms.png`), and the in-app toast reads
`⚑ qa agent 3 · ghrepo needs attention`.

---

## 4. `/clear` — reported on the route, invisible everywhere else

| Payload | outcome header | `⚑ N` | tile / deck key | activity feed |
| --- | --- | --- | --- | --- |
| `SessionStart` + `source:"clear"` | **`context-reset`** | unchanged (absent) | unchanged | **no new row** |
| `SessionStart` + `source:"clear"` (again) | `context-reset` | unchanged | unchanged | no new row |
| `SessionStart` + `source:"compact"` | **`context-reset`** | unchanged | unchanged | no new row |
| `SessionStart` + `source:"startup"` | `ignored` | unchanged | unchanged | no new row |
| `SessionStart` + `source:"not-a-source"` | `ignored` | unchanged | unchanged | no new row |
| `Notification` + `source:"clear"` (spoof) | **`ignored`** | unchanged | unchanged | no new row |

The route names it. The count does not move, no tile changes, nothing is written
to the activity feed. The last row is the guard working: a payload cannot staple
`clear` onto an event that is not `SessionStart` — it came back `ignored`, not
`context-reset`. An unrecognised `source` is dropped rather than carried.

The count keeps meaning "these are asking".

**Taskbar badge (derived, not observed — see §7).** The badge is pushed only from
`DeckWants`' effect, keyed on `count`, and `syncBadge` re-reads `wantsCount()`
rather than taking a number (`store.ts:2042`, `DeckWants.tsx:72`). The count was
observed unchanged across every row above, so the badge cannot have moved. I could
not watch the IPC itself.

---

## 5. Regression glance

`06-mission-four-keys-dot-forms.png`, one frame, four live agent panes:

- **Four-key deck** — four keys, correct names, `QA` badges, the `!` on the one
  asking.
- **Dot forms** — three of five seen live: `status-attention` (filled + halo + `!`),
  `status-waiting` (hollow diamond `◇`), `status-working` (filled, pulsing). Chips
  agree: `ASKING` / `WAITING 7s` / `WAITING 6s` / `WORKING`. `status-idle` and
  `status-not-running` were **not** produced in this pass — unverified, not
  broken.
- **Merged palette** — `07-merged-palette.png`: SESSIONS (each row carrying
  *waiting for you*), PROJECTS (with `4 terms · 4 agents`), COMMANDS with their
  chords, footer hint. Search narrowed to `Open activity feed` correctly.
- **Notifications** — in-app toast raised on the attention (visible bottom-right
  of `06-…`), activity feed carries the `⚑` row plus the four `· started` rows
  (`08-activity-feed.png`).
- **Counts agree** — deck bar `2 want you`, Mission header `4 running · 2 need
  attention`, with two of four keys carrying `key-seen` (acknowledged, correctly
  excluded). The acknowledgement axis behaved as documented.
- **Unmatched-hook honesty** — a hook posted at a *restored, not-yet-respawned*
  pane came back `unmatched` and wrote the activity row *"A UserPromptSubmit hook
  could not be matched to a session - check the X-DevDeck-Session header in your
  hook config"*. Never silent, as designed.

### Finding R1 — one fact, three different words (confirmed, cosmetic, pre-existing)

The deck bar says **`2 want you`**, the Mission header says **`2 need
attention`** (`MissionControl.tsx:382`), and the tiles being counted say
**`WAITING`**. All three read the same `wantsYou` set. Not from this diff — the
wording landed in `d72724e`, well before — so it is out of scope for these three
changes, but it is the kind of thing a stranger reads as a bug.

---

## 6. What I attacked

- A repo whose **path contains a space** — `remoteInfo`, the Changes modal and the
  PR modal all handled `…/scratchpad/azure repo` correctly.
- A hook aimed at a **restored (dead) pane** — `unmatched`, reported, no phantom.
- A **spoofed `source`** on a non-`SessionStart` event — refused.
- An **unrecognised `source`** value — dropped.
- An **unknown `notification_type`** — still raises, on purpose.
- Four concurrent agent panes, four keys, mixed declared states, two acknowledged.
- `createAzurePr` on an install that has **never** had a Work panel to save a PAT
  (fresh scratch profile, no `work.json`) — the intended message, not a wrong-
  credential failure.

---

## 7. What this method could not see

- **The Windows taskbar badge and the desktop toast were not directly observed.**
  My first attempt instrumented `window.api.badge.set` and
  `window.api.notify.attention` from the page. It silently did nothing:
  `Object.isFrozen(window.api) === true`, `Object.isFrozen(window.api.badge) ===
  true`, and `window.api` is `configurable=false, writable=false`. The contextBridge
  surface cannot be wrapped from the renderer. The run-3 readings of "no badge
  pushes, no toasts" from that instrumentation are **void and are not reported as
  evidence anywhere above**; §4's badge claim is derived from the count instead.
  A real badge check needs a main-process seam or a human looking at the taskbar.
- **`status-idle` and `status-not-running` dot forms** were not produced.
- **HTML5 drag-and-drop** cannot be simulated over CDP. Untouched, unverified.
- **The renderer store is not on `window`**, so every scenario drove the DOM and
  the preload, never the actions directly.
- The deck key moving to `key-waiting` partway through the §3 sequence is the
  **screen classifier's idle timer**, not a hook: the three silent types return
  before `ingest` ever calls `emit`, so the renderer was never told about them.
  That attribution is reasoned from the route's structure plus the `ignored`
  outcome header — I did not isolate the timer.
- `azurepr.createAzurePr`'s **success** path (a real PAT, a real Azure org) was not
  exercised. Only the no-token branch and the module's reachability were.
- The app was driven at one window size on one machine. No phone, no second
  display, no weaker hardware.

---

## 8. Verdict

**Confirmed working:** the Azure PR path survives the split and returns the new
no-token copy; the GitHub PR path is unaffected; nothing reaches
`window.api.work`; only `worker_permission_prompt` of the four raises attention;
an unknown type still does; `/clear` and `compact` are named on the route and
appear nowhere in the UI.

**Confirmed defect:** W1 — the PR modal's footer hint still tells every user to
use a "Work PAT" they have no way to save. Copy-only, one file, no behaviour.

**Cosmetic, pre-existing:** R1 — three wordings for one count.

**Is what is on `main` safe to hand a stranger?** Yes, with W1 fixed first. It is
a two-line copy change in a sentence that currently sends a new user looking for a
screen that does not exist; everything load-bearing behind it works. Nothing found
in this pass risks data, credentials or a false "wants you".
