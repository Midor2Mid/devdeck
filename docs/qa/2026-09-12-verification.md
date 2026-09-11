# QA verification — 2026-09-12

Targets: `c13d135` (taskbar badge + the stall ruling) and `fb154dd` (declared-vs-inferred
provenance, hook health). Tree at `2f7aaa1`, nothing under `src/` touched.

**Method.** Every launch used the run-app harness with a **scratch `userDataDir`**
(`…/scratchpad/udd-*`, wiped and re-seeded per run) and a unique `--remote-debugging-port`
(9411–9427). The owner's own DevDeck (`DevDeck.exe`, PID 3140, running since 2026-09-04) was
left alone — no process of theirs was signalled, and no file outside the scratchpad was
written except this report and its shots. The scratch profile was seeded with one throwaway
project, one agent preset (`node`, so a session is alive and silent on demand), and the MCP
server on a non-default port so it could not collide with the owner's.

Baseline before any of this: `npm run typecheck` **0 errors**; `npm test` **147 files, 1963
passed, 1 skipped**; `npx electron-vite build` exit 0.

---

## How the taskbar was read

A taskbar badge is OS chrome; an app screenshot cannot contain it, and on this machine
`CopyFromScreen` cannot either — a full-screen app owns the display and the taskbar is
occluded. Instead the taskbar was asked to draw **itself**:
`PrintWindow(FindWindow("Shell_TrayWnd"), hdc, PW_RENDERFULLCONTENT)` into a 2560×72 bitmap.
That renders the real taskbar including its overlay icons, occluded or not. Captures were
then diffed pixel-for-pixel (LockBits byte compare, bounding box of every differing pixel),
and the changed region was cropped and scaled ×8 to be looked at.

This establishes what Windows **drew**. It does not establish what a human sitting at the
machine saw, and nothing below claims that.

---

## 1. The badge — CONFIRMED, it renders

`window.api.badge.set(...)` driven over CDP against the real `BrowserWindow`.

| call | returned `BadgeState` | taskbar diff vs previous capture |
| --- | --- | --- |
| `{count:3, description:"DevDeck — 3 want you"}` | `{supported:true, error:null}` | button region redrawn |
| `{count:12, …}` | `{supported:true, error:null}` | button region redrawn |
| `{count:0, description:""}` | `{supported:true, error:null}` | 518 px at (1386,11)–(1409,34) |
| `{count:5, description:""}` | `{supported:true, error:"DevDeck sent a taskbar badge with no description, so it was not shown"}` | **0 px changed** |
| `{count:"x", …}` / `{}` / `{count:-1, …}` | `{supported:true, error:"DevDeck sent a taskbar badge count that is not a number"}` | — |
| `{count:7, …}` | `{supported:true, error:null}` | 518 px at the same 24×24 box |

- **It appears with a real count.** `badge-taskbar-3.png`, `badge-taskbar-7.png` — amber disc,
  near-black rim, legible numeral, drawn by Windows at the top-right of the app's taskbar
  button (Win11 places it there, not bottom-right).
- **`9+` above nine.** `badge-taskbar-9plus.png` — the glyph reads `9+`, the plus clear of the
  rim on every row.
- **Zero clears it rather than drawing a `0`.** `badge-taskbar-cleared-at-zero.png`. Stronger
  than the picture: the capture after `count:0` is **byte-identical** to the capture taken
  before any badge was ever set (`DIFF n=0`).
- **An empty description is refused, loudly and without side effect.** The error is latched in
  `badgeState` and the taskbar is unchanged — `DIFF n=0` against the cleared capture. Same for
  a non-numeric, missing, or negative count.
- **`badgeState` on this machine: `{supported: true, error: null}`.** The overlay API is present;
  `setOverlayIcon` never threw across ~10 calls.

**Not observed:** whether the badge is legible on a light taskbar (this machine's is light-grey
and it read fine, but that is one taskbar theme on one DPI); whether a screen reader announces
the description.

---

## 2. Declared-vs-inferred provenance — CONFIRMED end to end, on all three routes

Driven for real: `POST http://127.0.0.1:<port>/hook` with `Authorization: Bearer <token>`,
exactly the shape in `docs/attention-hooks.md`, against a live agent pane.

**Inferred** (`mission-inferred-no-provenance.png`) — chip `QUIET` / `WAITING`, **no**
`.mtile-said` element, aria-label `qa agent 1 · qa-proj · QA · QUIET`. The word is absent.

**Declared, `session-env`** — header `X-DevDeck-Session: <pane id>` →
`204`, `x-devdeck-hook: accepted`, empty body. Tile (`mission-declared-session-env.png`):

```
chip  ◆ ASKING
said  the agent said “Claude needs your permission to use Bash(git push:*)”
tip   The agent stated this itself, over the hook — DevDeck did not read it off the terminal.
      Notification · matched by the session id DevDeck gave it
aria  qa agent 1 · qa-proj · QA · ASKING · the agent said “Claude needs your permission to
      use Bash(git push:*)” · Flagged for your attention, with no prompt we can answer for you.
```

**Declared, `cli-session`** — a later event with **no** header but the same `session_id`
followed the binding: `accepted`, tip `matched by the session id it sent earlier in this run`.

**Declared, `cwd`** — no header, real project folder, one agent in it: `accepted`, and the
subject is correctly hedged — `the agent in this folder said “…”`, tip `matched by its folder
— it was the only agent running there` (`mission-declared-attention-cwd.png`).

**No message** → `the agent said so` (`mission-declared-no-message.png`).

The deck flag went from absent to `1 wants you` on the declared attention, and an in-app
notification `qa agent 1 · qa-proj needs attention` fired. The route's refusals hold: bad
bearer → `401 unauthorized`, non-object body → `400 invalid`, unmatchable → `204 unmatched`,
**every response with `content-length: 0`**.

**Dot forms unchanged.** Five `status-*` forms in the stylesheet — `idle`, `not-running`,
`working`, `attention`, `waiting` — across 16 rules; no sixth form was added, and provenance
carries no mark, no accent and no new token.

### Hook health — CONFIRMED, misconfigured and unused no longer look the same

| state | what Settings → MCP → AGENT HOOKS said |
| --- | --- |
| nothing has fired | `No session is reporting its own state right now.` + the hint about a wired hook that never arrives |
| one declaration standing | `1 session is reporting its own state.` (`settings-hook-health-reporting.png`) |
| 1 unmatchable hook (bogus cwd, no header) | notice bar: `1 hook arrived since DevDeck started that it could not match to a session…` |
| 2 unmatchable hooks | `2 hooks arrived …` — **the count moves**, and the plural is right |

The two sentences are additive and coexisted correctly (one session reporting *and* unmatched
hooks outstanding).

---

## 3. The stall ruling — the count and the click agree; **the control does not appear**

Reached a real stall the way a user would: a board card dispatched to an agent (which is what
makes a session `awaited`), then 120 s of genuine silence. Observed twice, independently
(runs `s9`, `s10`).

At the stall, on Mission, with nothing else touched:

```
tile   ⋯ STALLED · silent 2m      (aria: "No output for 2m, and something is waiting on this session.")
deck   .deck-wants  ->  ABSENT.   No flag, no count, nothing.
```

`stall-no-deck-flag.png`. Then **Ctrl+Shift+J** — the jump behind the same count:

```
view switched to Terminal, focused pane = 54091973-…  (the stalled session)
and only now did the deck render:  "1 wants you"
```

`stall-jump-landed.png`.

So the ruling itself is right — `wantKinds` does contain the stall, the jump lands on it, and
there is no "nothing to jump to" lie. **What is broken is that the control never repaints.**
`DeckWants` subscribes to `seen`, `paneHold`, `boardTasks` and `pipelineRun` and has no clock;
a stall is a wall-clock threshold crossing with **no store write at all**, so nothing brings
the component back for another look. `MissionControl` has `setInterval(… , 1000)`
(`MissionControl.tsx:133`) and ticks; the deck does not. The flag appears only when some
unrelated slice happens to change.

### And the taskbar badge inherits it — CONFIRMED by pixels

`syncBadge()` runs inside that same render effect (`DeckWants.tsx`, `useEffect(…, [count,
syncBadge])`), so it never runs either.

```
taskbar at the stall          diff vs "running" = 79 px at (2454,17)-(2461,29)  <- the CLOCK, not the app
taskbar after Ctrl+Shift+J    diff vs stall    = 518 px at (1386,11)-(1409,34)  <- the badge, reading "1"
```

`badge-absent-during-stall.png` (no badge) and `badge-appears-after-repaint.png` (badge `1`).

This is the highest-damage finding in this pass, and it lands squarely on the feature's own
premise. A stall is the state that matters most when you are *not* looking at DevDeck — an
agent that has been silent for two minutes with a card open on it — and that is precisely the
state the badge cannot report. For one developer running several agent terminals, the badge is
correct for declared and inferred hand-overs and silently stale for stalls.

**Confirmed. Not a design question about ranking — the ranking is fine. It is a missing repaint.**

---

## 4. Smaller findings

- **A declared message truncates with no way to read it** (`src/renderer/src/styles.css:786`).
  `.mtile-said` is `white-space: nowrap; text-overflow: ellipsis`, matching `.mtile-q` — but
  `.mtile-q` carries `data-tip={st.detail}` (the same text, so hover recovers it) while
  `.mtile-said` carries `saidTip(d)`, the provenance explainer. So the agent's own sentence —
  the thing the commit argues is "strictly more useful than any badge" — is clipped on the tile
  at ~44 characters and is not hoverable anywhere. It *is* in the `aria-label`.
  Observed: `the agent in this folder said “Claude needs y…`. Low damage, trivial fix.
- **The unmatched-hook notice sits below the fold** of Settings → MCP at a 1256 px window
  height (`settings-hook-health-unmatched-below-fold.png`): after three unmatched hooks, the
  visible block still read only "No session is reporting its own state right now" plus the
  hint, and the diagnosis needed a scroll. The block is the thing a user opens when hooks are
  not working, so the order costs it some of its point. Low.
- **Pre-existing, not from these commits:** Mission's header reads `1 need attention`
  (`MissionControl.tsx:382`).

---

## 5. Regression glance

| surface | seen |
| --- | --- |
| four-key deck | Mission / Terminal / Browser / Editor all present and switching |
| five dot forms | five `status-*` forms in CSS, marks `○ – ◇ ◆ ⋯ ▶` rendering as before |
| notifications | in-app toast fired on a declared attention |
| modal heads & scroll | Settings opened, head `MCP servers · qa-proj`, nav intact, content scrolls |
| empty state | fresh profile boots to the DevDeck welcome card cleanly (`app-boot-fresh-profile.png`) |
| MCP server | started on the seeded port, bearer enforced, `/hook` and `/mcp` both reachable |

Nothing here regressed.

---

## What this pass could not see

- **Approve / Deny feedback was not re-driven.** It needs a real permission prompt from a real
  agent CLI, which the `node`-preset harness cannot produce. Unchanged code, not re-verified.
- **HTML5 drag-and-drop** cannot be simulated over CDP. Board card dragging is unverified here,
  as always — it is verified by a human or not at all.
- **The renderer store is not on `window`,** so everything above is the DOM's account of the
  store, not the store's own. Counts were read off `.deck-wants`, statuses off the tiles.
- **Whether a human sees the badge.** PrintWindow proves Windows drew it; it does not prove a
  tablet-mode, hidden or grouped taskbar shows it.
- One hook carrying a valid live session id came back `unmatched` in a single early run and
  never reproduced (a dedicated timing run had the session addressable **46 ms** after the
  launch click). The mechanism is that my synthetic client can post before the pty is
  registered; a real hook originates *inside* the pty and cannot. **Not a defect** — recorded
  so the log is not mistaken for one.

---

# Re-check — 2026-09-12, against `a6025af`

Narrow pass: only the blocker above and the two minor fixes. Same method — scratch
`userDataDir` (`udd-recheck`, `udd-clear2`, wiped per run), unique debug ports 9428–9430,
the owner's DevDeck untouched. Rebuilt first. `npm run typecheck` **0**, `npm test` **148
files / 1977 passed / 1 skipped**, build exit 0.

Same reproduction as before: a board card dispatched to an agent, then real silence. **While
waiting, nothing wrote to the store** — the poll is a read-only DOM eval every 3 s — so
anything that appeared, appeared on its own.

## 1 & 2. The deck and the badge now appear AT the crossing

Run `s12`, unprovoked, at **t+111 s** after the dispatch:

```
deck    .deck-wants  ->  "1 wants you"
tile    ⋯ STALLED · silent 2m      (mission-tile status-waiting stalled)
```

`fix-deck-flag-at-crossing.png`. No `Ctrl+Shift+J`, no click, no view change — the flag was
simply there on the next read. Re-read immediately after: identical, so it is not a
poll-induced artefact.

**The badge, by pixels, the same way as before.** `PrintWindow(Shell_TrayWnd,
PW_RENDERFULLCONTENT)` into a 2560×72 bitmap, LockBits byte diff:

```
before the crossing -> at the crossing   DIFF n=596  box=(1386,11)-(2461,34)
```

That box is the badge's own 24×24 region (1386–1409) plus the clock digits at the far right
(2454–2461) which ticked during the wait; 518 + 78 = 596, the same 518-pixel badge footprint
measured in the first pass. Cropped and scaled ×8:
`fix-badge-before-crossing.png` (bare icon) → `fix-badge-at-crossing.png` (**amber disc
reading `1`**). Reproduced independently in run `s14` (crossing again at t+111 s,
`DIFF n=664` over the same box).

## 3. The two surfaces agree, at the same instant

Read in one evaluation at the crossing:

```
flag   "1 wants you"
tile   task QA stall recheck 1  ·  ⋯ STALLED · silent 2m
deck   deck-key key-waiting … task QA stall recheck 1
```

One session, one count, one name. Mission's header read `1 running · 1 need attention`.

## 4. It clears

Run `s14`: at the crossing, flag `1 wants you` + badge `1`. Opening the session (Ctrl+Shift+J)
and returning to Mission:

```
deck    .deck-wants  ->  null
tile    ◇ WAITING 7s     (the `stalled` class gone)
tray    DIFF vs crossing = 518 px at exactly (1386,11)-(1409,34)  -- the badge region only
```

`fix-badge-cleared-after-ack.png` — bare icon, no disc. The alarm leaves nothing latched.

*(One inconclusive attempt is worth recording so the log is not misread: a run that posted a
declared `attention` before the wait never reached `STALLED`, because a declared attention
outranks a stall by design. That is the documented behaviour, not a defect.)*

## The two minor fixes — both confirmed

- **`.mtile-said` tooltip.** With a 105-character declared message the line is still clipped
  (`scrollWidth > clientWidth`), and `data-tip` now reads: the full sentence first, then the
  provenance — `the agent said “Claude needs your permission to run git push
  --force-with-lease origin feature/the-very-long-branch-name”` ⏎ `The agent stated this
  itself, over the hook — …` ⏎ `Notification · matched by the session id DevDeck gave it`.
  `fix-said-tooltip.png`.
- **Unmatched notice above the fold.** After three unmatched hooks, the notice bar is now the
  **first** child of the AGENT HOOKS block (top 590 px, above the prose at 704 px) and fully
  inside the viewport (`vis: true`) at the flagged window size — 1386×837 CSS px, the 2079×1256
  device-pixel frame these shots are taken at. `fix-unmatched-notice-first.png`.

## Regressions

None. The declared path, the hook-health sentences, the five dot forms, the four-key deck, the
modal heads and scrolling all behaved as in the first pass; the badge's zero-clears and
empty-description refusal are unchanged by this commit and were not re-driven.

## Verdict

**Yes — this is in a state to cut 0.14.0 from.** The one blocker is fixed and the fix was
observed at the crossing, in the deck and on the real Windows taskbar, twice, without being
provoked; it clears cleanly; and the two minor findings are closed. The standing gaps are the
ones method cannot close here, not defects: drag-and-drop is human-verified or not at all, and
Approve/Deny was not re-driven because the harness cannot produce a real permission prompt.
