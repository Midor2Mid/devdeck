# DevDeck — verification of the seven must-fix-before-beta issues, 2026-09-09

Everything below was **observed in the running app** unless it is labelled
**inferred**, **read from source**, or **not observed**. Screenshots are in
`docs/qa/2026-09-09-shots/` (96 files) and every claim names the one that shows
it. The before-state is `docs/qa/2026-09-08-ui-ux-walkthrough.md`.

---

## 0. Method, and what it changes about the answers

| | |
|---|---|
| Repo | `D:\Personal\Personal Projects\Products\devdeck`, branch `main`, **uncommitted work from five agents left exactly as found** (nothing reverted, stashed or committed; nothing edited outside `docs/qa/`) |
| Build | `out/` as handed over; no source change was made, so no rebuild was needed |
| `npm run typecheck` | **0 errors** (observed: the script printed nothing after its banner) |
| `npm test` | **136 files / 1721 passed / 1 skipped**, exit 0, 14.5s — the full suite, not a subset |
| Harness | `.claude/skills/run-app/cdp.js`, **12 scenario runs** on debug ports 9451–9468 |
| Profile | **Scratch `userDataDir` for every single run** — copies of the previous walkthrough's scratch profile (`…/4c5405ad…/scratchpad/ud1`), one fresh copy per run (`udE`, `udR1`–`udR6`, `udS`, `udT`, `udU`, `udV`, `udW`, `udX`, `udY`, `udZ`, `udAA`). The real `%APPDATA%/devdeck` was never pointed at. |
| Real user state | **Untouched.** `%APPDATA%/devdeck/workspace.json` did change during the session (03:05), but it contains **zero** traces of my scratch ids, paths or presets (`grep -c "4c5405ad\|sim-work\|sim-wait\|sim-attn\|sim-exit\|sim-write" → 0`) and its project ids are the user's own — the user's five live `DevDeck.exe` processes wrote it themselves. None of those processes was signalled or killed. |
| Projects | The previous walkthrough's scratch folders. `alpha app` is a git repo with **three deliberately pre-existing uncommitted changes** (`README.md`, `package.json`, `src/index.ts`) made *before* any session started — that is the exact precondition of the false-conflict bug. |

### The substitution, unchanged from last time

Agent states still come from stand-in presets whose commands are `node` scripts
that print, or go quiet, or emit `\x07`, or echo what they are sent. Bytes on the
pty are the only thing DevDeck's classifier reads, so every state below travelled
the real pty → real store → real components. Only the *program* was a stand-in.
Two new stand-ins were added **in the scratch profile only**:
`sim-exit` (`node -e "…"; exit` — makes the **pty itself** exit) and
`sim-write-late` (writes `agent-shared.txt` 12s after launch — a genuinely
agent-created file).

### What this method cannot see — stated up front

1. **HTML5 drag-and-drop is unobservable over CDP.** Not attempted, not reported.
   A human must try the deck drop targets, the editor-tree drag, and drag-to-split.
2. **The native folder dialog was never opened.** The toast's `Open folder…`
   action was found and read but not clicked (a modal OS dialog would wedge the run).
3. **Animation is judged from computed style, not from motion.** I read
   `animation-name` and sampled `opacity`/`box-shadow` mid-animation; I never
   watched a pulse. Every FORM claim below is a still-frame claim, which is the
   point.
4. **1× legibility is my own eye on a screenshot**, at 1384×835, on this monitor.
   It is a judgement, not a measurement — the measurements are the rgb/px/ratio
   numbers beside it.
5. **`status-idle` was never reached.** All four other forms were observed;
   `idle` (faint clay fill) is **not observed** — no stand-in produced it.
6. **A fresh bell re-raising a `seen` session** was not driven in the app
   (my stand-ins ring once). It is covered by `tests/seen.test.ts`; here it is
   **read from source** (`store.ts:685-695`), not observed.
7. **Method artifacts — ignore these eight screenshots:**
   `02-skin-{slate,sumi,washi}-{wabi,modern}-deck.png` and
   `02-skin-*-{wabi,modern}.png` from the first sweep. I switched skins by setting
   `document.documentElement.dataset.theme`, which **does not reskin DevDeck** —
   `applyTheme` writes the palette as *inline custom properties* on the root
   (`themes.ts:266-277`), so the attribute alone changes nothing. Those frames show
   Slate's palette under three different `data-theme` values. Every skin figure I
   report comes from the re-run that switches themes **through the command palette**,
   the way a user does.
8. **The single-instance lock did not stop anything.** I launched ~12 instances
   alongside the user's five running copies, always with a scratch `userDataDir`,
   and never once hit a lock. `cdp.js`'s own comment says there is none. I mention
   it only so the next agent does not plan around a constraint I could not
   reproduce.

---

## 1. Verdicts

| # | Issue | Verdict |
|---|---|---|
| 1 | False conflicts | **Verified with a hole** — false conflicts gone, worktrees fixed, real conflicts reported *only on the board-dispatch path*. On the deck's `+` launch path the whole feature is dark. |
| 2 | Four states, four colours/forms | **Verified**, measured in all six skins |
| 3 | `Approve` feedback + delivery | **Verified** on Mission and Overview's Focus rail; delivery unregressed. Overview's **Grid** card is a partial. |
| 4 | A dead session reads as dead | **Verified on 7 of 8 surfaces**; the task-board card is a no-op rather than a lie |
| 5 | Seven dead view keys | **Verified**, both paths, no toast stacking, no tooltip regression |
| 6 | Glancing erased the `!` | **Partially verified.** The owner's ruling holds when you **answer**. It fails when you **glance** — and glancing is the bug's own title. |
| 7 | Names past four keys + scrollbar | **Verified**, including the scrollbar (the "one empirical unknown") |

---

## 2. Issue 2 — the four states, measured

The old defect was that working, waiting and attention all computed
`rgb(201,144,106)` (2026-09-08 report §2.3). Measured now, in the running app,
`getComputedStyle` on `.deck-key .tab-dot`:

### Slate (default) — `02a-deck-four-states-slate-modern.png`, `02z-four-forms-slate-6x.png`

| state | background | size | radius | box-shadow | animation | glyph |
|---|---|---|---|---|---|---|
| working | `rgb(201,144,106)` **--clay** | 6×6 | 50% | none | `dot-pulse` | — |
| waiting | `rgba(0,0,0,0)` **transparent** | 6×6 | 50% | `inset 0 0 0 1.5px rgb(235,166,92)` + breathing halo | `dot-breathe` | — |
| attention | `rgb(235,166,92)` **--accent** | 6×6 | 50% | `0 0 0 3px accent/25%` | none | `!` `rgb(235,166,92)` **700** |
| not-running | `rgb(153,161,178)` **--muted** | **6×2** | **1px** | none | none | — |

Four different background values, two different shapes, and a hollow-vs-filled
distinction that survives a still frame. **The measured collision is gone.**

### All six skins (switched via the command palette, `02-skin-*.png`)

| skin | --accent | --clay | accent on the key's ground | clay on it | accent **vs** clay |
|---|---|---|---|---|---|
| slate / modern · wabi | `235,166,92` | `201,144,106` | 8.74:1 | 6.62:1 | **1.32:1** |
| sumi / wabi · modern | `184,137,92` | `196,133,93` | 5.30:1 | 5.37:1 | **1.01:1** |
| washi / wabi · modern | `176,122,74` | `176,106,68` | **2.92:1** | 3.36:1 | **1.15:1** |

(Ground = the deck key's own painted background, walked up from the dot;
`--bg-2` in every theme. Ratios computed in-page from the resolved rgb.)

**The headline number is `accent vs clay`.** In Sumi the two hues are
**1.01:1** — the same colour to any eye. In Washi, 1.15:1. So in two of the three
themes, working-vs-waiting rests **entirely** on filled-vs-hollow, with hue
contributing nothing. The fix's own comment says exactly this, and the
measurement agrees. That makes the form the load-bearing part, and it is real:
at 16× the Washi waiting dot is a clean donut with an unfilled ~2–3px hole
(`02z-washi-waiting-16x.png`) — anti-aliasing does **not** close it.

### Washi's verdict, specifically

- **The 1.5px accent ring on the light ground measures 2.92:1**, not the ~3.4:1
  the implementers estimated — because the key's ground is `--bg-2`
  (`rgb(236,229,214)`), not `--bg`. It is the thinnest, lowest-contrast mark in
  the app, on the lightest theme, and my measurement is *worse* than the flagged
  estimate.
- **At 6× it is unmistakable** (`02z-washi-keys-6x.png`: a clear donut beside a
  filled dot). **At 1× it is the weakest mark on the deck**
  (`02-washi-deck-full.png`, `02c-four-forms-washi-1x.png`) — I can see that
  *something* differs about the waiting key, but reading *which* state it is
  takes deliberate attention rather than a glance. This is a judgement, not a
  measurement.
- **The `--muted` 6×2 bar is fine on Washi.** `rgb(111,103,87)` on
  `rgb(236,229,214)` = **4.46:1**, and the dash form is the most legible of the
  four at 1× — it does not read as a dot at any size
  (`02z-four-forms-washi-6x.png`, `02z-washi-notrunning-16x.png`). This was the
  second flagged Washi risk and it is the one that came out well.
- **Both Washi styles survive.** Wabi-sabi and Modern Pro produce identical
  tokens and identical dot forms; only shape/depth differ
  (`02-washi-wabi-deck-full.png` vs `02-washi-deck-full.png`).
- **All six skins survive** — no skin lost a state, collapsed two forms, or
  dropped the glyph. The `!` renders `--accent`/700 in every one.

### Accent spend: does the deck still read calm?

**Yes.** `07d-deck-12-keys-1384.png` is four simultaneous waiting sessions on
Slate at 1×. Four hollow 6px rings are *quieter* than four filled dots were —
a ring has less ink than a disc. Nothing on that strip shouts. The concern that
five waiting sessions would put five accent marks on the deck is true in count
and wrong in weight.

### `key-seen` is still distinguishable

- **waiting + seen**: key keeps `key-waiting`, gains `key-seen`;
  `animation-name` goes `key-breathe` → `none` and `box-shadow` → `none`, while
  the dot stays `status-waiting` with its full-strength ring. Observed on a
  dispatched session (`vB`, `vD` runs).
- **attention + seen**: the `!` goes `rgb(235,166,92)`/700 →
  **`rgb(153,161,178)`/500** — hue *and* weight — while the dot keeps
  `status-attention` at full strength. Observed, and visible at 1× in
  `03f-overview-focus-sent.png`: three attention keys on the deck, the answered
  one's `!` visibly grey against the other two's orange.

---

## 3. Issue 1 — false conflicts

### The exact old setup, reproduced

Four agent sessions launched from the deck's `+` into **one** project whose tree
was **already dirty with three files** — the setup that produced `3 conflicts` in
red naming `README.md` twice (`13-two-projects-four-agents.png`).

**Observed: the `IN-FLIGHT CHANGES` section is not present at all.** Mission's
sections are `AGENTS`, `Uncommitted changes`, `Ports in use on this PC`. Sampled
at +3s and again at +15s (two poll ticks). `01a-mission-no-false-conflicts.png`.
**No false conflict, no red count, no file named.**

### A real conflict — reported, on one path

Two cards **dispatched** from the task board into the same dirty tree, each
running `sim-write-late`, both creating `agent-shared.txt` 12s after launch:

```
chipText  "1 conflict"
chipClass "muted small mission-own-warn"
chipColor rgb(233,120,107)          // --danger
chipTip   "1 file here appeared after two or more sessions in the same working
           tree had already started. DevDeck can't tell which session wrote them
           - only that nobody inherited them. …"
rows      [ { cls: "mission-own-row conflict", path: "agent-shared.txt",
              proj: "alpha app",
              owners: ["task Card A shared tree 1", "task Card B shared tree 2"] } ]
```
`01c-real-conflict-dispatched.png`, stable across two polls. The three
pre-existing dirty files are **not** listed. So the discrimination works: new
beats inherited.

### Finding 1 (confirmed) — the conflict map is dark on the launch path everyone uses

`captureBaseline` has exactly **two** callers, and both are the board-dispatch
path: `store.ts:1760` (dispatch a card) and `store.ts:1573` (drag a card into
`doing`). A session started any other way — the deck's `+`, the terminal
launcher's `+ Claude`, `splitActive`, `openWorkspacePreset` — never gets a
baseline. `baselineOf` returns `undefined`, `newPathsSince` returns `[]`
(`agentSignals.ts:67-72`), `buildOwnership` yields no files, and Mission's
`ownership.files.length > 0` guard hides the whole section.

**Observed, not inferred:** six deck-launched agent sessions in one tree, two of
which created `agent-shared.txt` **after all six had started** — git counting
4 changed files, Mission's own "Uncommitted changes" row saying `4 changed files`
— and `IN-FLIGHT CHANGES` **absent through three polls over ~40 seconds**
(`01b-mission-real-conflict.png`).

So the false-conflict fix is partly achieved by the feature going silent on the
common path. That silence is *honest* (unknown baseline → no evidence → no
claim, exactly as designed) but the consequence is that **two agents overwriting
each other in one working tree is not reported at all unless both were started
from the task board.** The source comment at `store.ts:1749-1755` justifies the
narrowing with "a baseline nothing could ever consult" — that sentence was true
before `buildOwnership` existed and is false now.

Damage × likelihood: **highest of everything in this report.** One developer
running several agents in one repo is the product's headline use case, the deck's
`+` is the documented way to start them, and the failure is silent.

### Two worktrees of one project — fixed

Two cards dispatched **with the worktree checkbox on**; each worktree's
`sim-write-late` created its own `agent-shared.txt`:

```
chipText  "changed since these sessions started"       // not red
chipColor rgb(153,161,178)                             // --muted
rows      [ { cls: "mission-own-row", path: "agent-shared.txt", owners: ["task WT card one 1"] },
            { cls: "mission-own-row", path: "agent-shared.txt", owners: ["task WT card two 2"] } ]
```
`01e-worktrees-no-conflict.png`. **Same relative path, two trees, one owner each,
zero conflicts.** Previously this conflicted on every shared path. Verified.

### The dispatch warning's wording — also fixed

The second dispatch into the shared tree raised, verbatim:

> Start Sim Write Late on "Card B shared tree" in alpha app? The card title is
> sent as its first prompt. ⚠ **task Card A shared tree 1 is already working in
> this tree, which has 3 uncommitted changes (README.md, package.json +1 more).
> Two agents in one working tree overwrite each other.** Turn on "worktree" to
> give it its own copy.

Names the session (true), attributes the changes to the **tree** (true), claims
nothing about who wrote them, uses file names not repo paths, and elides past
two. The `danger-btn` styling appears only when there is a clash. Verified.

---

## 4. Issue 3 — `Approve`

### Mission — verified, `03a`–`03d`, `03z-mission-sent-6x.png`

Clicking `✓ Approve` on a `NEEDS YOU` tile, sampled at +200/600/1500/3000ms:

- toast: `Sent "y" to sim attention 1 · alpha app` — **stops at "sent"**
- `.mtile-actions` innerText: `✓ Approve / ✕ Deny` → **`Sent "y" · waiting for its
  next output`**. The two live buttons are gone; the natural second press has
  nothing to hit.
- the question stays on screen (`Do you want to proceed? [y/n]`), and the chip
  stays `● NEEDS YOU` — nothing claims the answer was accepted
- at **+8.3s** the row is back to `✓ Approve / ✕ Deny` and the toast is gone
  (`03c-mission-after-6s.png`) — the 6s window closes and re-arms, as designed

### Delivery is not regressed — `03d-pty-received.png`

Pane text after approving the echoing stand-in:

```
Do you want to proceed? [y/n] y
RECEIVED "y\r\n"
```

**The keypress still reaches the real pty.** Same evidence as 2026-09-08.

### Overview — Focus rail verified, Grid card partial

`03f-overview-focus-sent.png`: the rail item shows
`Sent "y" · waiting for its next output` **within 150ms** of the click (measured
by sampling; `answered` is a subscribed store slice, so it does not wait for the
1500ms peek tick), the question stays above it, and the sibling rail item keeps
its own live buttons. Measured box: **258px × 24px, line-height 14.3px, one
rendered line, `scrollWidth === clientWidth` (no overflow, no clipping)**. So the
flagged `.ov-approve-sent`-wraps-to-two-lines risk **did not materialise** at the
rail's real width.

**Finding 2 (confirmed, minor) — on Overview's *Grid* cards the confirmation
never appears.** In Grid mode the attention card carried `.ov-approve-yes`;
after clicking it, `.ov-card .ov-approve` was **gone entirely** — no buttons and
no sent row (`03h-overview-grid-card-sent.png`). *Inferred* mechanism: a Grid
card embeds a live terminal, so the pane is rendered and visible; `respondApproval`
sets `seen`, the pane's own next byte reclassifies the session to `working`,
`promptFor` (gated on the derived status) stops returning a prompt, and the whole
block unmounts. The user does get the toast, so they are not left with nothing —
but the surface they clicked on says nothing.

---

## 5. Issue 4 — a dead session reads as dead

Two flavours were driven: **restored** (a workspace with two sessions, relaunched,
processes never started) and **exited** (`sim-exit`, whose pty really ends —
pane shows `[process exited]`).

| surface | observed | evidence |
|---|---|---|
| deck key | `tab-dot claude status-not-running`, `rgb(153,161,178)`, **6×2px**, radius 1px, no shadow, no animation; tip `sim ask 1 · alpha app - not running` | `04a`, `04m` |
| Mission header | `0 running` | `04b`, `04n` |
| Mission chip | `○ NOT RUNNING` (restored) / `□ EXITED` (exited), `tone-quiet` | `04b`, `04n` |
| terminal tab dot | `status-not-running`, 6×2 | `04h` |
| Overview main card | `status-not-running`, 6×2 | `04g`, `04s` |
| Overview Focus rail | `status-not-running`, 6×2 | `04g` |
| command palette | `Go to sim ask 1 · alpha app - not running`, sorted **last** | `04l`, `04r` |
| usage panel | `0 running now`; the `RUNNING NOW` section is **absent** — no blank-duration rows | `04k`, `04q` |
| prompt composer | row `composer-target not-running`, checkbox `disabled`, words **`NOT RUNNING`**, `aria-disabled="true"`, tip *"No process behind this session - open it to start it again"*, header *"No agent session is running - open one to start it again"*, `0 selected` | `04i`, `04p` |

That is **7 of the 8** named surfaces, on both flavours where applicable.

**Finding 3 (confirmed, low damage) — the task-board card says nothing at all.**
`TaskBoard.tsx:336-338` computes `status` only when `agentStatus[termId]` exists;
a restored session has no entry, so `status` is `undefined` and **no dot and no
label render**. Observed with a card seeded in `doing` pointing at a restored
session: `04j-board-restored.png` shows `Restored card linked to a dead session |
Jump | ‹ | › | ×` and **no `.tab-dot` in the card at all**. This is a no-op, not
a lie — the card no longer wears `idle` — but it is also not the "reads as dead"
the other seven surfaces deliver, and the `Jump` button is still offered.
*Not observed:* the exited-with-a-populated-`agentStatus` case on a board card;
my dispatch-then-exit attempt did not link a card in time.

---

## 6. Issue 5 — the seven dead view keys

Fresh, genuinely empty profile (`window.api.projects.list()` → `{projects:[],
activeId:null}`), `05a-first-run-empty.png`.

**Click path.** All seven keys clicked in order. Each produced exactly the right
sentence with the right action:

```
Mission   → "No project is open, so Mission has nothing to show yet."   [Open folder…]
Tasks     → "…so Tasks has nothing to show yet."                        [Open folder…]
Terminal  → …  API → …  Database → …  Browser → …  Editor → …
```

**After all seven clicks: `document.querySelectorAll('.toasts .toast').length === 1`.**
Seven inert keys cannot stack seven toasts. `05b-seven-clicks-one-toast.png`.
The breadcrumb stayed `No project / Mission` throughout, no key took
`aria-selected="true"`, and all seven kept `aria-disabled="true"`.

**Chord path.** `Ctrl+1` … `Ctrl+7` dispatched as real key events: each raised
the identical toast for the identical view, and the count after all seven was
again **1**. `05c-ctrl-1-7-one-toast.png`. The topbar still said `Mission` — the
chord no longer names a view it is not showing.

**Tooltip survives `mousedown`.** Real mouse events on the Terminal key:
tip absent at 0ms → present at 900ms (`Terminal - open a project to use the
views`) → **still present after `mousePressed`** → still present after
`mouseReleased` + click. And **no regression on live controls**: the same
sequence on `.cmd-pill` (a normal enabled button) shows its tip and the tip
**disappears on `mousedown`**, as before. `05d`, `05e`.

**Is tooltip + toast noisy?** Judgement: no, but it is untidy. They land in
opposite corners ~1100px apart, so nothing overlaps and nothing competes. The
one real blemish is that the tip, anchored above a bottom-left key, **covers the
deck's own `Open folder…` button** while the toast offers the same action in the
other corner — three `Open folder…` affordances on screen at once
(`05e-inert-key-tip-plus-toast.png`). Acceptable; not noise.

---

## 7. Issue 6 — the headline ruling

The ruling under test: *acknowledgement dims the nag, not the state — a
seen-but-unanswered session must drop out of `⚑ N` and still show its real
waiting/attention dot.*

### It holds when you ANSWER — verified, and this is the pair asked for

Approving a `sim-attn` session **from Mission** (its program ignores stdin, so no
byte comes back, and Mission is not the pane, so nothing resizes):

```
deck key   "deck-key key-seen key-attn"          ← both classes, together
dot        "tab-dot claude status-attention"      rgb(235,166,92), 3px halo   ← state untouched
glyph !    rgb(153,161,178) / weight 500          ← --muted, thinned: the nag dimmed
Mission    "● NEEDS YOU", tile status-attention   ← still asking
flag       ⚑ 2 → ⚑ 1                              ← dropped out of the count
```
Stable across +200/600/1500/3000ms. `03b-mission-sent-row.png`,
`06z-attn-seen-keys-6x.png`. And visible at 1× in `03f-overview-focus-sent.png`:
three attention keys, the answered one's `!` grey while the other two stay
orange. **Exactly the ruling.**

The waiting half also holds: an acknowledged waiting key keeps `key-waiting`,
loses only `key-breathe` and its edge, and its dot stays the full-strength hollow
accent ring.

### Finding 4 (confirmed, twice) — it FAILS when you GLANCE, which is the bug's own title

Three `sim-attn` sessions, all bells rung while I sat on Mission, all three keys
`key-attn` + `status-attention` + `!`, `⚑ 3`. I then clicked one deck key —
the ordinary "let me look at that one" gesture:

```
+150ms   "deck-key active"                       ← key-attn GONE, key-seen never appears
         "tab-dot claude status-working"          rgb(201,144,106), dot-pulse
         glyph: null                              ← the ! is not dimmed, it is GONE
         ⚑ 3 → ⚑ 2
Mission  "▶ WORKING" over the text "Do you want to proceed? [y/n]"
```
Sampled every 150ms for 2.1s — it was already `working` at the first sample.
`06b-after-ack-one.png`, `06c-mission-after-ack.png`, `06d-glance-path.png`,
`06z-seen-vs-unseen-6x.png`.

It also happens **without clicking a key at all**: merely switching to the
Terminal view acks whatever pane is active there, and in `vK` the freshly
launched attention session was reading `status-working` with no `!` the moment I
arrived (`02b-four-forms-slate-1x.png`, where the key labelled `sim attention 4`
wears a pulsing clay dot).

*Inferred* mechanism — `ack` no longer rewrites the status (`store.ts:706-733`),
so the reclassification must come from output: making the pane visible refits
xterm, which resizes the pty, which makes the shell redraw; that byte arrives
after `seen` is set, so `unseenBell` is false (`store.ts:978`) and
`setStatus(id, "working")` runs. I observed the effect at 150ms resolution; I did
not instrument the byte.

What a user sees is unchanged from 2026-09-08: **looking at a pane erases its `!`
and turns `NEEDS YOU` into `WORKING` above a question the agent is plainly still
blocked on.** The state is recoverable in principle (a fresh bell clears `seen`)
but that bell will not come — the agent already rang it. The
`.deck-key.key-attn.key-seen .claude-attn` rule the fix added is reachable
**only** via the answer path; on the glance path the classes never co-occur.

The waiting half of the ruling is genuinely fixed. The attention half — the
half the issue was named after — is not.

---

## 8. Issue 7 — names past four, and the scrollbar

### The short label inside the badge pill — verified

Six sessions in one project (`COMPRESS_THRESHOLD = 4`), keys compressed:

```
WORK1  WAIT2  ATTN3 !  ASK4  WRITE5  WRITE6
```
`.deck-key-ord` = `1`…`6`, inside the `.agent-badge` pill. `07a-deck-six-keys-compressed.png`.
At twelve sessions the ordinals reach `13` and stay inside the pill
(`07d`, `07g`). With a non-numeric name the label is initials, not an ordinal:
`restored dead` → `SIM-ASK RD` (`07z-scrollbar-560-8x.png`). Five identical
`CLAUDE` sessions would therefore read `CLAUDE1 … CLAUDE5` rather than five
identical pills. **The five-identical-pills defect is fixed.**

### The scrollbar — the one empirical unknown, answered: it renders

`.deck-strips` measured at several viewport widths with 12 keys:

| viewport | scrollWidth | clientWidth | offsetHeight | clientHeight | **gutter** | thumb |
|---|---|---|---|---|---|---|
| 1384 | 1384 | 1384 | 38 | 38 | **0** | — (not overflowing) |
| 900 | 1297 | 900 | 42 | 34 | **8px** | 69% of track |
| 700 | 1297 | 700 | 42 | 34 | **8px** | 54% |
| 560 | 1297 | 560 | 42 | 34 | **8px** | 43% |

**A gutter of 8px means Chromium laid out a classic scrollbar, not an overlay** —
the element's own height grew by exactly the declared 8px, and `clientHeight`
shrank by it. And it paints: `07z-scrollbar-560-8x.png` (8× zoom) shows a light
grey rounded `--border-strong` thumb spanning ~43% of the track, plainly visible
against Slate's ground. Scrolling works: `scrollLeft = 99999` lands on
`scrollWidth - clientWidth` exactly (`07h`, `07z-scrollbar-*-end-8x.png`).

**One honest qualification:** at 1384×835 the strip did **not** overflow with
12 compressed keys in one project (content 1297px < 1384px) — I only reached
overflow at 1384 with **24** keys (`vE` re-run, `maxScroll = 643`), or by
narrowing the viewport. So the scrollbar is correct and visible when it exists;
it just takes rather more than "five sessions" to bring it out.

### Also observed at 700px and below (out of scope, worth a line)

The **`.deck-bar`** — the row *below* the strip — clips and overlaps at 700px:
`● 3 changes` renders as `ges` behind the tool-cluster icons
(`07e-deck-12-keys-700.png`, `07j-deck-700-1x.png`). Not part of the seven
fixes and not a regression I can attribute; noted because a stranger with a
narrow window will see it.

---

## 9. Findings, ranked by damage × likelihood

**Confirmed**

1. **The conflict map never fires for deck-launched sessions** (§3, Finding 1).
   Two agents can overwrite each other in one working tree with no warning
   anywhere, unless both were started from the task board.
   `src/renderer/src/store.ts:1573`, `src/renderer/src/store.ts:1760` are the only
   `captureBaseline` callers; `src/renderer/src/agentSignals.ts:67-72` fails
   closed on an unknown baseline; `src/renderer/src/components/MissionControl.tsx:597`
   hides the section when the file list is empty.
   Steps: open a dirty git repo · start two agents from the deck `+` · have both
   touch a new file · Mission. Expected: `1 conflict`. Observed: no
   `IN-FLIGHT CHANGES` section at all, three polls, 40s.
2. **Glancing at an attention pane still erases the `!`** (§7, Finding 4).
   `src/renderer/src/store.ts:978` (`unseenBell`), `src/renderer/src/store.ts:706-733` (`ack`).
   Steps: agent rings a bell while you are on Mission · click its deck key.
   Expected (owner's ruling): `key-attn key-seen`, dot still `status-attention`,
   `!` dimmed to `--muted`/500, out of `⚑`. Observed within 150ms:
   `status-working`, no `!`, Mission `▶ WORKING` above the unanswered question.
3. **Washi's waiting ring measures 2.92:1**, worse than the 3.4:1 estimate, and
   at 1× it is the weakest mark in the app (§2). Not a defect against the spec —
   the form is correct and pixel-clean at 16× — but it is the mark most likely to
   be missed by a stranger on the light theme.
4. **Overview's Grid card shows no confirmation after Approve** (§4, Finding 2).
   The whole question+buttons block unmounts. Toast still fires.
5. **A task-board card whose session is dead shows no status at all** (§5,
   Finding 3). `src/renderer/src/components/TaskBoard.tsx:336-338`.
6. **`.deck-bar` clips at ≤700px** (§8). Cosmetic, outside the seven.

**Suspected (mechanism inferred, effect observed)**

7. The reclassification behind (2) and (4) is the pane's own resize-redraw byte
   arriving after `seen` is set. If that is right, any fix for (2) fixes (4) too.

**Regressions found: none.** Approve still delivers `y\r\n` to the pty; the
tooltip still withdraws on `mousedown` for enabled controls; `npm test` and
`npm run typecheck` are where they were.

---

## 10. Is this app in a state to hand to a stranger?

**Yes — with the two confirmed findings above disclosed, or fixed first.**

What a stranger meets is now honest in the places they will look first: the
first-run screen answers a click instead of ignoring it, a dead session says so
on seven surfaces, a pressed `Approve` visibly stops at "sent" and actually
reaches the agent, and the deck can finally tell working from waiting in a still
frame in all six skins. Those were the four things that made the previous
walkthrough uncomfortable, and they are fixed and measured.

What is not ready is the one claim the product is *sold* on. "You can tell which
agent is waiting on you" is true until you look at one, at which point the mark
disappears and Mission starts saying `WORKING` over an unanswered question — and
"two agents in one tree overwrite each other" is a warning the app will not give
unless the agents were started from a screen most users have not found. Neither
loses data on its own; both make the app quietly less trustworthy the more you
use it, which is exactly the wrong direction for a five-person beta whose whole
purpose is to find out whether people trust it.

If the beta ships today, tell those five people plainly: *the `!` on a session
goes quiet once you have looked at it, and DevDeck will not warn you about two
agents sharing one folder unless you launched them from the task board.* A named
limitation costs nothing. A silent one costs the feedback.

---
---

# SPOT-CHECK, 2026-09-09 (later the same day)

**Scope: only what changed since the verification above.** Nothing already
verified in §2–§8 was re-verified. Same rules as before: everything below was
observed in the running app unless it is labelled **inferred**, **read from
source**, or **unit-verified**. New screenshots are `10*`–`16*` in
`docs/qa/2026-09-09-shots/`.

## S0. Method

| | |
|---|---|
| Repo | unchanged; **uncommitted work from the fixes left exactly as found**. Nothing edited outside `docs/qa/`. |
| `npm run typecheck` | **0 errors** (observed: the script printed nothing after its banner) |
| `npm test` | **137 files / 1738 passed / 1 skipped**, exit 0, 10.3s — the full suite |
| `npx electron-vite build` | clean (`✓ built in 15.77s`) |
| Harness | `.claude/skills/run-app/cdp.js`, **11 scenario runs**, debug ports 9491–9507 |
| Profile | **Scratch `userDataDir` for every run** — fresh copies of `…/scratchpad/ud1` per run (`udG`, `udG2`–`udG7`, `udC`–`udC5`, `udV`–`udV5`, `udO2`). The real `%APPDATA%/devdeck` was never pointed at, and none of the user's five live `DevDeck.exe` processes was signalled or killed. |
| Projects | the same scratch folders. `alpha app` still carries the **three deliberately pre-existing uncommitted changes** (`README.md`, `package.json`, `src/index.ts`) — the false-conflict precondition. `agent-shared.txt` was deleted between runs so each conflict run started clean. |
| Stand-ins | the same presets, plus two rebuilt in the scratch profile only: `sim-write-late` (writes `agent-shared.txt` 9s after launch — a genuinely agent-created file) and `sim-quiet` (prints once, then silent). |

### A method error in my earlier run, and what it cost

My first three scenarios this round could not navigate to Mission: I used
`.view-key[…]`, and the deck's view keys are **`.deck-view`**
(`ViewKeys.tsx:66`). `MissionControl`'s ownership poll is gated on
`view === "mission"` (`MissionControl.tsx:207`), so those runs were measuring a
Mission that was never being polled. Their screenshots have been deleted rather
than filed. **Every conflict figure below comes from a run whose navigation was
confirmed** — `.deck-view.on` read back as `Mission (Ctrl+1)` after the click.

### What this method could not see this round

1. **HTML5 drag-and-drop** — unobservable over CDP. Not attempted, not reported.
2. **`window.api` is a frozen contextBridge object.** Assigning over
   `window.api.git.changes` silently fails, so I could not force a `git.changes`
   rejection in the running app. The unknown-baseline case below is therefore
   **unit-verified + read from source**, not app-observed.
3. **Only ONE pty per app launch produced output on this machine today** (see
   S5). That capped every scenario at one live agent session, so the four dot
   forms were **not** re-observed simultaneously in Sumi and Washi this round —
   only `waiting` and `not-running` were. All four in all six skins remain
   verified from the earlier run (§2), which the waiting-ink change does not
   invalidate.
4. **1x legibility is my own eye** on a 1384x835 frame on this monitor. The
   ratios beside it are measurements; the reading is a judgement.

---

## S1. Defect 1 — the glance path. **FIXED (attention). Residual on waiting.**

### Attention: fixed, at the sample rate that caught it

Reproduction re-run exactly (`g1.js`): attention sessions launched from the
deck's `+`, bell rung, then **one deck key clicked** — the ordinary "let me look
at that one" gesture — sampled every **150ms for 3.0s**.

At the **first 150ms sample**, and unchanged through +3000ms:

```
key       "deck-key active compressed key-seen key-attn"   <- both classes, together
dot       "tab-dot claude status-attention"  rgb(235,166,92) + 3px accent/25% halo
glyph !   present, rgb(153,161,178) / weight 500           <- --muted, thinned
flag      1 -> null                                        <- dropped out of the count
Mission   tile "mission-tile status-attention", chip "NEEDS YOU"
          tone-attention rgb(235,166,92), over the live text
          "Do you want to proceed? [y/n]", with "Approve / Deny" still offered
```

`10a-glance-before.png`, `10b-glance-after-terminal.png`,
`10c-mission-after-glance.png`. **That is the pair asked for**: seen, out of the
flag, nag dimmed — state and question untouched and answerable. The
`.deck-key.key-attn.key-seen .claude-attn` rule is now reachable on the glance
path, which it was not before.

### Residual (confirmed) — glancing at a WAITING session shows `WORKING` for 2–4s

Not the same defect, and not fatal, but the same shape. An **unseen** waiting
session, glanced by clicking its deck key (`v3.js`, sampled from 150ms to +42s):

| t | key | dot | Mission |
|---|---|---|---|
| +150ms → +2s | `deck-key active` | `status-working`, `dot-pulse`, clay | `WORKING` over "Refactored 4 files. Ready for review." |
| +4s onward, stable to +42s | `deck-key active key-waiting key-seen` | `status-waiting`, ring `rgb(153,161,178)` = --muted, static | `WAITING 6s` |

So it **self-heals** on the next idle tick and lands exactly on the ruling.
`14a-waiting-unseen.png`, `14b-waiting-after-glance.png`,
`14c-mission-after-waiting-glance.png`.

*Read from source:* the gate at `src/renderer/src/store.ts:1089` is
`agentStatus[id] === "attention" && !actedOn.has(id)`, so it protects `attention`
only; a `waiting` session's own resize-repaint byte still reclassifies it to
`working`, and the idle timer puts it back. Damage: a 2–4s wrong word on the tile
and a 2–4s pulse on the key, on the state that means "your move". The wants-you
count is correct throughout (the glance legitimately acknowledges it).

---

## S2. Defect 2 — conflicts for deck-launched sessions. **FIXED.**

Two agent sessions started from the **deck's `+`** (never the board) into the one
already-dirty tree; the first creates `agent-shared.txt` 9s after both had
started (`c4.js`, run on a confirmed Mission view):

```
section   IN-FLIGHT CHANGES  PRESENT
chipText  "1 conflict"
chipCls   "muted small mission-own-warn"
chipColor rgb(233,120,107)                       // --danger
chipTip   "1 file here appeared after two or more sessions in the same working
           tree had already started. DevDeck can't tell which session wrote them
           - only that nobody inherited them. ..."
rows      [ { cls: "mission-own-row conflict", path: "agent-shared.txt",
              owners: ["sim write late 2", "sim quiet 3"] } ]
```

Absent at +7s, **present and identical at +14s, +21s, +28s and +35s**
(`11-deck-launch-conflict.png`). `window.api.git.changes` on the tree returned
`["README.md","package.json","src/index.ts","agent-shared.txt"]` at every poll,
and **the three pre-existing files are not listed** — inherited still loses to
new. The blind path is lit: `newTabIn -> newTab -> beginAgentSession ->
ensureBaseline` (`src/renderer/src/store.ts:2537`, `:2595`, `:767`), with
`beginAgentSession` on five launch sites and `captureBaseline` still only on the
two card-lifecycle sites.

### The false positives did not come back

Same two deck-launched sessions, same three pre-existing dirty files, **neither
session creating anything**: `IN-FLIGHT CHANGES` **ABSENT through five polls over
35s** (`11-deck-launch-quiet.png`), while `git.changes` still reported the three
inherited files. No red count, no file named, no claim. Two sessions in one dirty
tree with inherited files is silent, as it must be.

### Unknown baseline still reads as no-evidence — **unit-verified, not observed**

`newPathsSince(undefined, …)` returns `[]`
(`src/renderer/src/agentSignals.ts:66-73`), so `buildOwnership` yields no file
and the section hides itself rather than claiming "nothing changed". Asserted by
`tests/agentSignals.test.ts:21` ("treats an unknown baseline as no evidence, not
as everything"), `:67` ("keeps the baseline unknown when the read rejects, not
clean"), `:124`, `:253`, and by `tests/launchBaseline.test.ts` (6 tests, all
passing in the full run above). I could not drive it in the app: the preload
bridge is frozen (S0.2).

**Worktrees:** not re-driven. The deck's `+` passes `allowWorktree={false}`
(`src/renderer/src/components/ProjectStrip.tsx:66`), so this path cannot produce
the worktree case at all; §3's board-dispatch verification stands and nothing in
the diff touches the `normDir`/`sameDir` tree keying.

---

## S3. The waiting mark — measured, then judged

### The numbers are exactly as claimed

Measured in-page per skin (`v4.js`): resolved `--text` / `--muted` / `--accent`
and the deck key's **own painted ground**, walked up from a real dot — `--bg-2`
in all six skins, confirmed (`keyGround === bg2` in every run).

| skin | ground | `--text` | ring **--text vs ground** | `--muted` vs ground | old accent ring vs ground |
|---|---|---|---|---|---|
| Slate | `rgb(19,22,29)` | `rgb(231,234,241)` | **15.03:1** | 6.98:1 | 8.74:1 |
| Sumi | `rgb(33,31,28)` | `rgb(228,221,207)` | **12.17:1** | 5.49:1 | 5.30:1 |
| Washi | `rgb(236,229,214)` | `rgb(58,52,43)` | **9.82:1** | 4.46:1 | **2.92:1** |

**All three claimed figures reproduce to the decimal.** Washi's 2.92:1 — the
worst mark in the app and my strongest finding this morning — is now 9.82:1, and
at 4x the Washi ring is the darkest, cleanest donut in the strip
(`16e-washi-deck-6x.png`). This is the single biggest improvement of the round.

Form, measured in all six skins: `background: rgba(0,0,0,0)`, 6x6,
`box-shadow: inset 0 0 0 1.5px <--text>`, **`animation-name: none`** — the halo
and `dot-breathe` are gone, as claimed. The key still breathes (`key-breathe`,
an accent inset edge).

### Does a `--text` ring read as a state, or as a bullet point?

**Both, depending on the surface — and it is a bullet on the surfaces where the
name is also `--text`.**

- **On a deck key: a state.** The session name there is `--muted`/400 (measured
  `rgb(153,161,178)`, weight 400), so the ring is the brightest thing on the key
  and reads as a mark (`16c-deck-attention-vs-waiting-4x.png`).
- **On a Mission tile: a bullet.** The ring sits ~4px left of a `--text`/600
  session name, at the same ink and the same baseline. At 5x
  (`16d-mission-tile-ring-5x.png`) it is unmistakably a donut; at 1x
  (`14a-waiting-unseen.png`) it reads as a leading bullet before the title rather
  than as a status mark. **The cost is small because the tile also carries the
  word:** the `WAITING 13s` chip sits right below it.
- **Same on the ACTIVE deck key and on Overview's focus header**, where the name
  also goes `--text`/600 (`14b-waiting-after-glance.png`, and the bottom row of
  `16c-deck-attention-vs-waiting-4x.png`).

### Do the chip and the dot agree on the tile? **Yes, measured.**

One Mission tile, `mission-tile status-waiting`:

```
chip  "WAITING 13s"  cls "mtile-chip tone-neutral"  color rgb(231,234,241)
dot   "tab-dot claude status-waiting"               ring  rgb(231,234,241)
```

Identical token, 20px apart. The tile makes one statement.

### Does waiting still sit below attention? **Yes — no inversion.**

Judged from `16c-deck-attention-vs-waiting-4x.png`, an attention strip and a
waiting strip cropped from the same place at the same zoom. Contrast ratio is not
eye-draw, and attention wins on four axes the ring does not have: **hue** (the
only saturated mark on the deck), **ink area** (a filled disc beats a 1.5px
ring), a **3px halo**, and a **second glyph** — an accent `!` at weight 700. The
higher-contrast mark is genuinely the quieter one here. My eye goes to the
attention key first in that frame every time.

### Is the loss of the dot's breathing too quiet?

**On the deck, no. On Overview and the tab strip, yes — under-marked.** The deck
key still breathes an accent edge and the deck still shows the wants-you flag, so
waiting still nags there. But `.deck-key.key-waiting` is the only breathing rule:
on Overview's focus header (`14b-waiting-after-glance.png`) and on a terminal tab,
waiting is now a static 6px hollow ring **with no word, no chip and no motion**,
next to a same-ink bold name. Those surfaces have no nag channel of their own and
now depend on the deck to raise the state at all. This is a judgement, not a
defect against the spec — the spec deliberately moved the nag onto the key.

---

## S4. Acknowledgement in a still frame — **FIXED**

Same key, same position, same skin, two frames (`16g-seen-vs-unseen-7x.png`):

| | key | dot ring | key edge |
|---|---|---|---|
| unseen | `deck-key key-waiting`, `animation-name: key-breathe` | `rgb(231,234,241)` = --text | warm accent inset, visible |
| seen | `deck-key key-waiting key-seen`, `animation-name: none` | `rgb(153,161,178)` = --muted | **none** |

`--text` vs `--muted` measures **2.15:1 (Slate) / 2.22:1 (Sumi) / 2.20:1
(Washi)** — the claimed 2.15–2.22 reproduces exactly. Two independent
still-frame signals (the ring's ink, and the presence of the key's edge), and I
can tell the two crops apart at 1x as well as at 7x. The defect — pixel-identical
at the breathe's rest point — is closed.

**Confusion with `not-running`:** they are now the **same ink**
(`rgb(153,161,178)` in Slate, measured on both), so form is the only separator: a
6x2 bar with 1px radius versus a 6x6 donut. At 7x they are obviously different;
at 1x in the full frame the bar reads as a dash and the ring as a small circle,
and I could still separate them (`14a-waiting-unseen.png`: keys `sim ask 1` /
`sim waiting 2` versus `sim waiting 3`). Acceptable, and it is the trade the CSS
comment states — but it is now a **single-channel** distinction, where the unseen
ring has two.

## S4b. Overview's Grid card — **FIXED**

Grid mode, attention card, `Approve` clicked (`o1.js`):

```
+150ms -> +2s   .ov-approve present, buttons GONE, row reads
                'Sent "y" - waiting for its next output'
                tip "DevDeck sent "y" to this session. Whether it was accepted
                     shows up in the agent's own output."
                toast 'Sent "y" to sim attention 2 - alpha app'
~+7s            the whole block is gone (the 6s window closed)
```

`15b-overview-grid-before.png`, `15c-overview-grid-sent.png`,
`15d-overview-grid-8s.png`. The block no longer unmounts on the click, and the
wording matches the Focus rail's. **One small disagreement remains:** the Grid
card *replaces* the question with the sent row (`.ov-approve-q` was empty at
+150ms), where Mission keeps the question visible above it; and when the window
closes the Grid block disappears entirely rather than re-arming with buttons the
way Mission's row does at +8.3s. Cosmetic, and in the honest direction.

*Not a regression:* Focus mode showed **no** `.ov-approve` at all in this run.
That is correct — the block is rendered only for **rail** rows (`rest`,
`src/renderer/src/components/OverviewView.tsx:353`), never for the focused
session, which has a live terminal in front of you. With one agent session the
rail is empty.

---

## S5. Observed obstacle, cause NOT established — one working pty per launch

In **every** run today, only the **first** agent session launched produced any
pty output. Tapped at the IPC boundary (`window.api.pty.onData`, `g3.js` /
`g6.js`): after three deck launches, exactly **one** term id had ever emitted a
byte (789 bytes, 2 BELs, ending `"Do you want to proceed? [y/n] "`); the second
and third emitted **zero bytes and no `pty:exit`** for 12s each. Their tabs were
created, active and rendered, and Mission treated them as live.

I cannot attribute this. It contradicts the earlier run today (six deck-launched
sessions all produced output), memory records this machine's `powershell.exe`
being killed by Avast's Behavior Shield, 17.2 GB of RAM was free, and no code in
the diff touches `src/main/pty.ts`. Treat it as **environmental until reproduced
on another machine.**

**One user-visible consequence I did observe, and it is the app's, not the
environment's:** `newTab` sets `agentStatus[termId] = "working"` optimistically
(`src/renderer/src/store.ts:2582`), and `deckKeyStatus` returns `not-running`
only on an exit code or a pane hold (`src/renderer/src/deck.ts:47`). A session
whose pty never spoke therefore reads `WORKING` with a **pulsing** dot
indefinitely — observed for 12s on the key and on the Mission tile. Nothing in
this round's diff caused it; `markLaunched`'s silence measurement is the intended
mitigation and I did not reach its threshold. Filed as **confirmed, cause of the
silence unattributed.**

---

## S6. Spot-check verdicts

| what | verdict |
|---|---|
| Defect 1 — glance erased attention | **FIXED**, at 150ms resolution, through +3s |
| Defect 1b — glance at a *waiting* session | **residual, confirmed**: `WORKING` for 2–4s over a finished turn, then self-heals |
| Defect 2 — conflicts on the deck `+` path | **FIXED**: `1 conflict`, red, correctly attributed, stable over 35s |
| Defect 2 — false positives not reintroduced | **CONFIRMED absent** over 35s |
| Defect 2 — unknown baseline = no evidence | **unit-verified + read from source**, not app-observed |
| Waiting ring 15.03 / 12.17 / 9.82 | **all three reproduce to the decimal** |
| Seen ring 2.15–2.22 vs unseen | **reproduces**; two still-frame channels |
| Chip and dot agree on the Mission tile | **CONFIRMED**, same rgb |
| Hierarchy: waiting still below attention | **no inversion** (judgement, from `16c`) |
| A `--text` ring reads as a bullet beside `--text` names | **yes** — Mission tile, active deck key, Overview header (judgement) |
| Static dot too quiet | **on Overview and the tab strip, yes** (judgement); the deck still nags |
| Overview Grid card confirmation | **FIXED**; minor wording/lifecycle disagreement with Mission |
| Six skins survive | waiting + not-running observed in **all six**; all four forms in Slate only this round |
| Regressions against the earlier run | **none found.** `not-running` still 6x2 `--muted`; `attention`+`seen` still dims the `!` to `rgb(153,161,178)`/500. Approve's pty delivery was **not** re-driven this round. |

## S7. Is this in a state to hand to a stranger, with nothing needing disclosure?

**Yes to the first; no to the second — one line of disclosure is still owed.**

Both defects I found this morning are genuinely closed, and closed in the app,
not only in the tests. The two claims that mattered most — "you can tell which
agent is waiting on you" and "two agents in one folder overwrite each other" —
now hold on the paths a stranger will actually use: the `!` survives being looked
at, and the deck's `+` is no longer a blind spot for the conflict map. Washi's
waiting mark went from below the 3:1 floor to 9.82:1, which was the
accessibility hole.

What still needs saying out loud to five beta users:

1. **Glancing at a session that has finished its turn makes it say `WORKING` for
   two to four seconds before it settles back to `WAITING`.** Harmless,
   self-correcting, and it will be noticed.
2. **A session whose process never produced output reads `WORKING` with a
   pulsing dot** rather than saying nothing (S5). Rare, but it is the app
   claiming activity it has no evidence for.

Neither loses work. Neither is the quiet erosion of trust the two fixed defects
were. If those two sentences go in the beta note, nothing else here needs
disclosure.

---

# FINAL CONFIRMATION - the five changes made after the spot-check

Third and last pass, scoped to the five post-spot-check changes only. Nothing
already verified in the two sections above was re-verified; where a run crossed
old ground it is mentioned only if it regressed.

**Method.** `npx electron-vite build` clean. `npm run typecheck` = 0 errors.
`npm test` = 138 files / 1748 passed / 1 skipped, run in full rather than
per-file. The app was driven over CDP via the `run-app` skill, every launch with
a **scratch `userDataDir`** under the session scratchpad (`udQ1`...`udQ14`,
`udS-*`, `udP-*`) and a **unique `debugPort`** (9411-9454). The user's own
DevDeck was never touched and no process of theirs was killed.

Statuses were produced by real ptys, not by poking the store (it is not exposed
on `window`). Each scratch profile was seeded **on disk before launch** with a
scripted agent preset - writing settings through `window.api.settings.save`
loses the race, because the live renderer's debounced `persist()` writes its own
hydrated state back over the file. The project folder used is
`.../scratchpad/projs/alpha app`, a **Windows path containing a space**.

Two scripted agents did the work:

- `QATalker` - prints `Ready for review`, sleeps 25s (well past the 6s idle
  timer), then prints two lines ~900ms apart, so the "banked first chunk /
  promoted on the second" rule is exercised deliberately rather than hoped for.
- `QAMute` - a blank command on a custom shell of `sort.exe`, which blocks on
  stdin and writes nothing, so the pty is **alive and has genuinely never
  spoken**.

## 1. The hollow diamond - CONFIRMED, with one honest qualification

Geometry, measured in the running app in **all six skins** (3 themes x 2 styles,
each a separate boot with the skin seeded into `appearance`, because
`applyTheme` writes the palette as inline custom properties on `:root` - setting
`data-theme` by hand changes nothing, and an earlier attempt to do so produced
six identical readings that were all really Slate):

| context | content box | ring | radius | rotated | animation | painted extent |
|---|---|---|---|---|---|---|
| `.term-tab` | 6x6 | `inset 0 0 0 1.5px` | 1px | yes (45deg) | none | **8.49 x 8.49** |
| `.deck-key` | 6x6 | `inset 0 0 0 1.5px` | 1px | yes (45deg) | none | **8.49 x 8.49** |
| `.mission-tile-head` | 6x6 | `inset 0 0 0 1.5px` | 1px | yes (45deg) | none | **8.49 x 8.49** |
| `.ov-grp-mini` (7px) | 7x7 | `inset 0 0 0 1.5px` | 1px | yes (45deg) | none | **9.90 x 9.90** |

Identical in every skin. Contrast on the Mission tile head came back at
**15.03 (slate) / 12.17 (sumi) / 9.82 (washi)** - exactly the figures recorded
in the earlier pass, so the ink is genuinely untouched by the shape change.

**Clipping and overlap: none anywhere.** At the deck key's 6px gap the rotated
paint leaves **4.76px** of clear space to the next element (8.49px in a 6px slot
overhangs 1.24px each side); in the tab strip's 7px gap, 5.76px. Every parent
computes `overflow: visible` and `clipped` came back false in all six skins. On
`.mission-tile-head` the paint does extend past the parent's box
(`escapes: true`) but nothing clips it. The **7px collapsed mini-strip** is the
tightest case: two adjacent waiting diamonds sit **1.10px** edge-to-edge (the
4px gap less 2 x 1.45px of overhang) and a waiting-beside-working pair 2.55px -
close, but **no overlap** (`overlaps: false`). Measured against the view's real
CSS with the DOM shaped as `.ov-grp-mini` emits it, since reaching a genuinely
collapsed group needed setup this run did not justify: the geometry is real, the
data is synthetic, and that is labelled.

**Chip and dot now agree on shape.** The Mission tile chip renders a diamond
glyph ahead of `WAITING 7s`, beside a diamond dot, in all six skins. Confirmed.

**Does it read as a state rather than a bullet?** Partly - and this is a
judgement for the designer's eye rather than a pass or a fail. I first read the
6x montage as "a soft blob" and that was wrong: an ASCII luminance map of the
true 1x pixels shows a clean rhombus outline with distinct diagonal edges
(`final-01-diamond-1x-pixels.png`, 22x nearest-neighbour, no resampling). So it
is a diamond, and it is unmistakably *not* the filled pulsing circle of
`working` nor the flat bar of `not-running` - the state distinction does its job
in a still frame, which was the whole point.

But at 6px the diamond-ness is carried by roughly **four antialiased corner
pixels** at about 50% ink; the dominant read is still a small hollow ring. It is
weakest in **Washi**, where those corners are faintest. So "no bullet glyph is a
diamond" is satisfied in geometry and only weakly in perception at 6px. The 7px
mini-strip, painting 9.9px, reads as a diamond much more clearly. Not a defect -
a note that the argument for the rotation is thinner at 6px than the
measurements alone suggest.

Pixel-verified in the tab strip and the deck key; geometry-verified on the
Mission tile head. Overview's focus header carries the same rule with identical
computed geometry, so its raster is identical - that one is **inferred from
identical computed style**, not separately pixel-mapped.

## 2. Overview's blocked-on-you word - CONFIRMED

Measured on both heads, with the width and the view set *before* the session was
allowed to reach `waiting`, so nothing the harness did disturbed the state:

- `.ov-main-head` (focus header) at **1384px, 700px and 640px**: renders
  `waiting for you`, class `ov-flag waiting`, `color: rgb(231,234,241)` =
  `--text` (the accent is **not** spent on it), `font-weight: 600`, 73x14px,
  **not clipped**.
- `.ov-card-head` (grid card head) at **700px**: the same flag, same class, same
  token, same weight, 73px, not clipped.

The narrow case holds at 700px and below: the flag computes `flex: 0 0 auto`
(i.e. `flex: none`, so it is not the item that gets squeezed), the name computes
`white-space: nowrap`, the project computes `text-overflow: ellipsis /
overflow: hidden / white-space: nowrap`, and neither head overflows
(`scrollWidth` equals `clientWidth`) at 1384, 700 or 640.

**One gap, stated plainly:** the fixture project is named `alpha app`, short
enough that the ellipsis never actually engaged (`projTruncated: false` at
640px). The truncation mechanism is declared and correct; I did not observe it
truncate. A long project name at 640px is unchecked.

## 3. The terminal tab strip renders waiting - CONFIRMED

Two agent tabs in one strip, one waiting and one working, measured together:

| tab | class | radius | transform | animation | box |
|---|---|---|---|---|---|
| `qatalker 1` | `status-waiting` | 1px | 45deg rotation matrix | **none** | 8.49x8.49 |
| `qatalker 2` | `status-working` | **50%** | none | **dot-pulse** | 6x6 |

They differ in shape, in motion and in ink - three channels, not one. The strip
no longer collapses `waiting` to `idle`.

**Two agent panes inside one tab could not be reached.** Every split path in
`TerminalView.tsx` (lines 175-176, 338, 345, 639, 647) spawns `SHELL`, so the
only way to get a second *agent* pane into a tab is dragging a tab onto a pane -
**HTML5 drag-and-drop, which cannot be simulated over CDP**. That exact case is
however pinned at the unit level: the pair loop in `tests/deck.test.ts:265-282`
asserts a waiting-plus-working pair resolves to `waiting` in **both** orders,
and it passes.

## 4. A launching session no longer claims to be working - CONFIRMED

Sampled every ~45ms from the instant of the launch click:

```
    0ms  status-idle      <- launch click
  229ms  status-idle
  275ms  status-working   <- the shell's first bytes
```

Six consecutive samples read `status-idle` before any byte arrived, on both the
tab strip and the deck key. Nothing ever read `working` before the pty spoke,
and a normal agent still reaches `working` the moment it does - 275ms here. It
then went `waiting` on the idle timer at 6521ms.

**The never-speaks case was reproduced deliberately** this time, with `QAMute`
on a `sort.exe` shell: pty alive, terminal rows empty, zero bytes for the full
10s observation.

- tab strip dot: `status-idle` throughout
- deck key: `status-idle` throughout
- Mission tile: `mission-tile status-idle`, chip **`QUIET 11s`**, section header
  `1 running` - honest, because the process *is* running

That is exactly the claim: a booting session claims nothing and its tile reads
`QUIET <ago>`. See `final-04-silent-pty-mission.png`.

Also attacked with a **shell path that does not exist**: the pane explains
itself ("DevDeck could not start this terminal... Pick a different shell in
Settings, or fix the path there"), the status is `not-running`, and the tile
reads `EXITED 1`. Honest. A dropped letter in my own `innerText` dump of that
tile was an artifact of the probe - the rendered pixels read correctly. Not a
bug; recorded because I nearly reported it as one.

**Disclosure #2 from the section above can be dropped.**

## 5. The glance blip for waiting - FIXED for the glance, still open by another route

**The original reproduction is closed.** A session was driven to `waiting`
(confirmed), left off-screen on Mission, then glanced at by clicking its Mission
tile to jump to the pane. Sampled **70 times from 12ms to 2162ms** after the
click - my original catch depended on a single 150ms sample, so this is roughly
30x denser and spans the whole window:

```
key states: {status-waiting: 70}    tab states: {status-waiting: 70}
samples showing WORKING during the glance: 0
```

Zero. The pane was genuinely visible and reading "Ready for review"
(`final-05-after-glance.png`, which also shows the diamond in the tab and in the
deck key).

**The intended behaviour still works.** The hand-back held through the first
resume line at ~25.3s - the banked first chunk did **not** reclassify it - and
promoted to `working` at **26457ms**, after the second line arrived. So a
genuinely resuming agent returns to `working` promptly, and the second chunk is
what does it, exactly as designed.

### CONFIRMED - a waiting agent still reads WORKING for ~6s after you leave and re-enter its tab

`src/renderer/src/store.ts:1180-1187` (the `unactedHandover` gate).

Steps: launch an agent that hands back, let it settle to `waiting`, add a second
tab, click tab 2, click back to tab 1.

| step | observed |
|---|---|
| waiting, untouched for 4s | stays `waiting`, 231 pane chars - stable |
| click tab 2, click back to tab 1 | `status-working` at **79ms**, holds **5984ms**, returns to `waiting` at 6063ms |
| repeat | `status-working` at **78ms**, holds **5983ms** - reproducible |

`final-05-tabswitch-blip.png` shows it in a still frame: a filled round
`working` dot on both the tab and the deck key while the pane plainly reads
`Ready for review`.

Mechanism: re-entering a tab remounts the xterm, which resizes the pty, which
emits **more than one chunk** - so the "held until output *continues*" bar is
cleared by the remount itself. The pane's character count did not even change
(231 to 231), so the promoting bytes were control sequences, not visible output.
Switching the terminal **layout** (Tabs to Grid) does the same thing: `working`
at 276ms, held ~6.0s, self-healed at 6256ms
(`final-05-layout-recovery.png`, `final-05-layout-flip-overview.png`).

Two things it is **not**:

- **Not a regression.** Before this change a *single* chunk promoted `waiting`
  with no gate at all, so this path blipped then too, and faster. The gate
  narrowed the defect; it did not open it.
- **Not the glance.** Arriving at the pane from Mission is clean (0/70). A plain
  **window resize** of a mounted pane is also clean - 1384 to 1000 while
  waiting: no working sample at all, stayed `waiting`. The trigger is
  specifically a pane **remount** (tab re-entry, layout switch), not visibility
  and not size.

Ranked by damage x likelihood for one developer running several agent terminals,
this is the highest finding of the pass. It is the same lie item 5 exists to
prevent, it lasts ~6s rather than 2-4s, it is self-correcting, and it fires on
**the most common action in the app** - switching between agent tabs.

## What this method could not see

- **HTML5 drag-and-drop cannot be simulated over CDP.** Two agent panes in one
  tab, and tab reordering, are verified by a human or not at all.
- **The renderer store is not exposed on `window`**, so every scenario drove the
  DOM and real ptys, never the actions directly.
- The `.ov-grp-mini` 7px geometry used real CSS with a synthetic DOM.
- Overview's focus-header diamond is inferred from identical computed style, not
  separately pixel-mapped.
- A long project name ellipsising at 640px is unchecked.
- Every skin reading is at `deviceScaleFactor: 1`; there was no HiDPI pass.

## Verdict

| # | change | verdict |
|---|---|---|
| 1 | waiting dot became a hollow diamond | **confirmed** - geometry, no clipping, chip agrees; diamond-ness weak at 6px, clear at 7px |
| 2 | Overview gained the blocked-on-you word | **confirmed** at 1384 / 700 / 640; long-name ellipsis unchecked |
| 3 | tab strip renders waiting | **confirmed** in-app for one pane; the multi-pane case is pinned by unit test only |
| 4 | launching session no longer claims to be working | **confirmed**, including a deliberately silent pty reading `QUIET` |
| 5 | glance blip for waiting | **fixed for the glance**; a ~6s `WORKING` blip remains on tab re-entry / layout switch |

Nothing regressed against either earlier run.

**Can this be handed to a stranger with no disclosures attached?** No - one
sentence is still needed, and it is a different sentence than this morning's.
Disclosure #2 (a silent session claiming `WORKING`) is **gone**. Disclosure #1
has **narrowed but not closed**: it is no longer "glancing at a session", it is
"leaving and re-entering an agent's tab makes it say `WORKING` for about six
seconds before settling back to `WAITING`". Harmless, self-correcting, and
certain to be noticed by anyone switching between two agents. With that one
sentence in the beta note, nothing else in this pass needs disclosing.
