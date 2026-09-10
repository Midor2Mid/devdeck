# Wave-3 verification — the accent budget, `.modal-head`, the HiDPI diamond

Range under test: `36fda76` (HEAD, tree clean). Targeted pass on the visual
changes made after `2026-09-10-post-d1-verification.md`, plus the HiDPI diamond
check outstanding from `2026-09-09-must-fix-verification.md`. Nothing already
verified in those two reports was re-verified; anything below that touches
earlier ground is there because it moved.

Shots: `docs/qa/2026-09-10-shots/w3-*.png` (77 files).

**Method.** Every launch used a **scratch `userDataDir`** under the session
scratchpad (`udW3*`, one fresh profile per run — a reused profile restored an
earlier run's panes once and I discarded that run) and a unique `debugPort`
(9501–9771). Two blocked agent sessions were produced with a seeded agent preset
whose command is a Node script that prints a Claude-Code-shaped permission
prompt and then blocks, so `main/decisions.ts` classifies a real prompt on a real
pty. Projects were scratch git repos (`proj-a`, `proj-c`), not the user's. The
owner's live DevDeck was never signalled; no `electron.exe` outside my own runs
was touched, and a process listing after the runs showed none of mine left over.
No file outside `docs/qa/` was written.

Baseline was taken on trust from the brief (typecheck 0, 1809 tests, clean
build) and not re-run — this is a visual pass.

---

## 1. The accent budget

### 1a. The count in a real frame — CONFIRMED at six

Counting rule, stated because the number depends on it: I walked every element
in `.app` (plus `::before`/`::after`) and matched the computed value of 13
paint properties, `box-shadow` and `background-image` against the *runtime*
`--accent`. Nested elements that inherit the same `color` from a counted parent
are one mark, not three. Measured twice per run, 1.5s apart; identical both
times in all six skins.

**Terminal frame — 6 accent marks**, with two agent sessions (one active, one
waiting):

| # | mark | property |
|---|---|---|
| 1 | `.term-tab.active` underline | inset `box-shadow` |
| 2 | `.term-pane.focused::after` focus ring | `box-shadow` |
| 3 | xterm block cursor | `color` |
| 4 | `.deck-key.active::before` 3px stripe | `background-color` |
| 5 | `.deck-view.on` underline | inset `box-shadow` |
| 6 | `.deck-wants-flag` ⚑ glyph | `color` (span → svg → path, one mark) |

Six is the claim and six is what a settled frame paints. The audit reported 7 or
8 *elements* per frame; the surplus is the flag's three nested nodes, and the
cursor drops out when it is in its blink-off phase (5 marks in 3 of 6 runs, 6 in
the other 3). Shots `w3-term-{slate,sumi,washi}-{modern,wabi}.png`.

**One accent-derived mark the strict count cannot see:**
`.deck-key.key-waiting`'s breathing edge is `color-mix(in srgb, var(--accent)
30%…8%)`, so it is accent-hued pixels that no `var(--accent)` grep and no exact
colour match will find — one per unseen waiting key. Same for
`.mtile-chip.tone-attention`'s 45% accent border. Not a defect; recorded so the
next person counting gets the same number I did.

**Mission frame:** 4 marks with one blocked session (chip ink, Approve fill,
`.deck-view.on`, ⚑), **6 with two** (both chips, both fills, underline, flag).

**The stylesheet figure in the commit message does not reproduce.**
`var(--accent)` in `styles.css` measures **131 → 121** across `4cf0b5f..36fda76`
(`--accent` as a bare string: 168 → 165). The commit says 159 → 149. The −10
delta is right; the absolute pair matches no pattern I could reproduce.
Cosmetic, but the number is quoted in DESIGN.md's rationale.

### 1b. The active deck key without its 14% tint — still identifiable, with a caveat

Measured, Slate/Modern, two keys in one strip:

| | inactive (waiting) | active |
|---|---|---|
| `background-color` | `rgb(19,22,29)` | `rgb(19,22,29)` — identical |
| `color` | `rgb(153,161,178)` = `--muted` | `rgb(231,234,241)` = `--text` |
| `::before` | none | 3px `rgb(235,166,92)` = `--accent` |
| `box-shadow` | breathing inset accent edge | `none` |

Same shape in all six skins (`w3-crop-deckkeys-6skins.png`, 4×). **Yes — the
active key is identifiable:** the 3px stripe is unmissable and the ink step
(`--muted` → `--text`) is a second, independent marker, exactly as the rule's
comment claims.

**The caveat is a judgement, not a measurement.** With the tint gone the active
key has *no* container treatment at all — same ground as its neighbours, marked
only by a 3px bar at its outer edge. An *unseen waiting* key, meanwhile, carries
a full breathing accent rim around its whole body. In a still frame the rimmed
key is the more decorated of the two, and on first read I picked the wrong one.
The forms are different (rim vs left bar) and the rim disappears on `seen`, so
this resolves the moment you look twice — but "which key is active" is now
carried by the quieter of two accent marks on the same row.

### 1c. Approve's fill beside the ghost Deny — reads as intended

One tile and two tiles, all six skins (`w3-crop-tiles-6skins.png`,
`w3-mission-*.png`).

- `.ov-approve-yes`: `background` = `--accent`, `color` = `--on-accent`,
  `font-weight` 600, border = `--accent`.
- `.ov-approve-no`: transparent, `--danger` ink, 45%-danger border, weight 400.

**Two tiles asking = two identical fills**, confirmed by pixel sampling, not by
eye: both buttons sample `rgb(176,122,74)` in Washi and `rgb(235,166,92)` in
Slate — the same `--accent`, no state drift between them. They read as two
questions rather than as noise: each fill sits inside its own tile, under its own
`Do you want to proceed?`, and the tile border does the separating. I would not
call this loud.

Two things I noticed while looking:

- **A blocked Mission tile spends the accent twice, 45px apart** — the
  `● NEEDS YOU` chip is accent *ink* and the Approve is the accent *fill*. The
  same file's `.tab-dot.status-waiting` comment says the tile was fixed for
  exactly this ("one Mission tile renders that chip and this dot 20px apart …
  one statement instead of two") by moving WAITING to `neutral`. ATTENTION kept
  the accent chip, so on the tile that has an act, the act is announced twice.
  Not a regression — the chip's tone predates this wave.
- **In Washi, Deny is the faintest control on the tile** (the file's own note:
  3.94:1) and beside a saturated fill it can read as disabled. Pre-existing
  token, but the new fill widens the gap.

**A fill still appears with no blocked session** — `button.accent` on Mission's
empty state (`Start a Claude session`), `Launch Claude` in the deck's launch
popover, `Commit all` in Review changes (`w3-mission-emptystate-slate-modern.png`,
`w3-terminal-ghost-launch-slate-modern.png`, `w3-head-changes-*.png`). Each is
an act, so this is inside the tier as written ("what the ceiling forbids is a
fill that is not an act") — but "at most once per blocked session" is not what
the app does, and the empty-state fill never coexists with an Approve only
because the empty state means zero sessions.

### 1d. The `button.accent:hover` defect — CONFIRMED, and worse than 4.07

Measured live, hover forced with a real `Input.dispatchMouseEvent`
(`b.matches(':hover')` verified true before reading):

| theme | rest `--on-accent` on `--accent` | **hover** `--on-accent` on `--accent-soft` |
|---|---|---|
| Slate | 9.09 | 10.43 (`#efb679`) |
| Sumi | 6.07 | 7.65 (`#c59e79`) |
| **Washi** | 5.13 | **3.65** (`#90643d`) |

**The Washi figure is 3.65:1, not 4.07:1.** 4.07 is the contrast against
`--accent-soft: #9c6a3d`, the literal in `themes.ts`, which `applyTheme`
**unconditionally overwrites** on every launch with
`shade(accent, -0.18)` = `#90643d` (`themes.ts:273`). Every quoted
`--accent-soft` ratio is computed against a token the runtime never uses — the
other two are optimistic the same way (11.10 vs 10.43, 7.91 vs 7.65). Only
Washi's crosses a threshold.

**How bad it looks:** `w3-crop-hover-washi-modern.png` puts the hovered button
next to the un-hovered one at 3×. The label stays readable — this is not an
unreadable control — but it is visibly muddier, and the failure is directional
rather than marginal: on the one light theme, hovering makes the button
**darker and quieter**, so it reads as pressed or disabled instead of as
"about to be clicked". The rest state is the more inviting of the two. App-wide
on every CTA, and now on the one control this product exists for. Confirmed, not
fixed.

### 1e. The retired spends — all confirmed live

Computed values, three themes (`w3t-*.json`):

| what | measured | expected |
|---|---|---|
| `.topbar-brand` (ensō) | `--muted` (e.g. `rgb(153,161,178)` Slate) | `--muted` |
| `.empty-state::before` watermark | `--muted`, opacity 0.07 | `--muted` |
| `.sb-changes` `● 1 change` | `--text` | `--text` |
| `.sb-pull.behind` | `--text` (`rgb(58,52,43)` Washi) | `--text` |
| `.term-launch-new` `+ Claude` | transparent bg, `--text` ink, `--border` | ghost |
| `.term-launch-caret` | transparent bg, `--muted` ink, `--border` | ghost |
| `.deck-key.active` | no tint (bg == inactive), 3px accent `::before` | tint deleted |
| `.usage-windows .btn-min.on` | `--seg-tint` bg, `--text` ink, weight 600 | seg + 600 |

`.sb-pull.behind` needed a repo genuinely behind its remote; I built one (bare
origin + a clone that pushed ahead) rather than infer it.

**Not verified in the app:** `.ov-seg button.on`. The Overview layout is behind
a cycling layout control whose selector I failed to hit in four attempts, so I
never rendered `.ov-seg`. The rule reads `--seg-tint` + `--text` + 600 in the
stylesheet and its sibling (`.usage-windows`) is confirmed live — but I did not
see this one, and the one thing this wave proves is that "the rule says so" and
"the app lays it out" are different claims.

---

## 2. `.modal-head` restored — all 8 heads lay out as rows, 6/6 skins

For every head I measured the computed `display`/`justify-content`, each child's
rect, whether all children share one row (every child's vertical span overlaps
the first child's), and the px from the last control's right edge to the head's
content right edge.

**Result: 8 heads × 3 themes × 2 styles = 48 head layouts, every one
`display: flex`, one row, right gap 0.**

| head | modal | verdict |
|---|---|---|
| `env` | Environment variables | row, gap 0, title→control 178–183px |
| `commands` | Saved commands | row, gap 0 |
| `identity` | Project appearance | row, gap 0, 3 children (chip, `h3`, Close); own `border-bottom: none` + `padding: 0` overrides, as documented |
| `usage` | AI usage | row, gap 0; `Today / 7 days / All time / ×` all on the title's line |
| `extend` | Extend agent | row, gap 0, 3 children; `.extend-head`'s own `padding-bottom: 14px` / `margin-bottom: 0` |
| `worktrees` | Worktrees | row, gap 0 |
| `changes` | Review changes | row, gap 0, **full-bleed**: `padding: 12px 16px`, `margin-bottom: 0`, divider spanning the modal |
| `pr` | Open pull request | row, gap 0, over the still-open changes head |

`.changes-modal`'s head is the one I most wanted to see and it is correct
(`w3-head-changes-*.png`): title left, `refresh ×` at the right edge, the rule
running the full width between the head and a flush body.

**`font-weight: 600` on a head does not reach `refresh` or `×` at all.** Every
control inside every head computes **400**/12px/`--muted`, against the title's
600/13px/`--text`, in all six skins, on the same baseline (y=97 for all three
children of the changes head). `button` carries its own weight, which beats
inheritance. So the question is moot rather than answered acceptably: the 600 is
a title weight, and the controls were never bolded.

**The divider against a scrolling body — it works.** The AI usage modal at a
1100×380 viewport gives a genuinely overflowing body: `scrollHeight` 474 >
`clientHeight` 252, `overflow-y: auto`, head `flex: 0 0 auto`. Scrolled to
`scrollTop` 222, the head's `y` is unchanged (41.8 before and after) and the
body's top edge is unchanged at 85.8 — content moves *under* a fixed rule with
14px of clearance, and never touches it (`w3-scroll-top-…`,
`w3-scroll-mid-slate-modern.png`). At mid-scroll the head reads as a toolbar and
the half-cut tile below it reads as scrolled content, which is the thing the
divider was added for. Honest qualification: the line itself is a hairline
(1.26:1 Slate, per the file) — most of the separation is carried by the fixed
position and the 14px gap, not by the line.

One inconsistency inside a head: `.extend-tab.on` ("Skills") is ink-only —
weight 400, `--text` vs `--muted` — while the AI usage segment two heads over
now uses `--seg-tint` + 600. Two segmented controls, two active-state grammars.

---

## 3. The HiDPI diamond — RESOLVED; 6px→7px still unnecessary

Launched with `--force-device-scale-factor` at 1, 1.25 and 1.5;
`window.devicePixelRatio` read back 1 / 1.25 / 1.5 in the renderer. Screenshots
come back in **device pixels**, so `w3-crop-diamond-dpr.png` is true pixels at
26× nearest-neighbour, no resampling. Same mark in all three
(`.term-tab .tab-dot.status-waiting`, `--text` ink).

| scale | CSS rect | painted device px |
|---|---|---|
| 100% | 8.49 × 8.49 | 8.49 |
| 125% | 8.49 × 8.49 | 10.61 |
| 150% | 8.49 × 8.49 | 12.73 |

**Ruling: it resolves.** At 1× it is a hollow ring with four faint corner hints —
the 09-09 finding, reproduced. At **125%** the four points are distinctly
present and the sides are visibly flat: it reads as a diamond, not a circle. At
**150%** it is unambiguous, with resolved straight diagonal edges. The
diamond-ness stops resting on ~4 antialiased pixels and starts resting on ~8.
**The 6px→7px token bump remains unnecessary** — on the 125–150% machines the
concern was about, the extra device pixels already do the work, and the only
scale where the mark is weak is the one where a bump would also cost the most
relative to its 6px flex slot.

Two supporting facts rather than assumptions: the CSS rect is **identical
(8.49px) at all three scales**, so nothing about layout, clipping or the
1.10px gap between two adjacent diamonds changes with DPI — only sampling
density does. And no crop shows a clipped edge at any scale.

Limit of the method, stated plainly: this is a resolution claim. A 12.73-device-px
mark on a 150% laptop is roughly the same *physical* size as an 8.49px mark at
1× on a 96dpi monitor — sharper, not bigger. I judged sharpness from magnified
device pixels; I did not view it on a 150% panel at arm's length.

---

## Regressions

**None.** Every claim in the brief that I could reach held in the running app,
and nothing verified on 09-09 or earlier today has moved.

## What needs disclosure

1. **`button.accent:hover` in Washi measures 3.65:1, not 4.07:1** (§1d). The
   quoted figure is against `themes.ts`'s literal `--accent-soft`, which
   `applyTheme` overwrites at runtime. Every `--accent-soft` contrast number in
   the design rationale is computed against a dead token. Still a known defect,
   still unfixed, now app-wide *and* on Approve.
2. **`font-weight: 600` on `.modal-head` does not reach the controls** (§2) — the
   open question is answered by "it never happened", not by "it looks fine".
3. **`var(--accent)` counts 131 → 121, not 159 → 149** (§1a).
4. **The Tier-1 ceiling as written is not what the app does** (§1c): three
   `button.accent` fills appear with no blocked session, and a blocked tile
   spends the accent twice.
5. **`.ov-seg button.on` was not seen in the app** (§1e) — stylesheet only.

## What this pass could not observe

- **`.ov-seg`** — never rendered; the Overview layout control resisted four
  selector attempts.
- **PR-modal screenshots for the Washi skins.** `Page.captureScreenshot` timed
  out (15s) five times across the session, on three different themes and two
  different modals, while `Runtime.evaluate` immediately before it returned
  normally — so the renderer's JS thread was live and the stall was in capture.
  I read it as machine load from ~30 app launches and did not treat it as an app
  defect; I also cannot rule out a paint stall, and the head geometry for those
  two skins is measurement without a picture.
- **Hover on anything but `.ov-approve-yes`.** The 3.65:1 figure is measured on
  Approve; the "app-wide on every CTA" part is inferred from `button.accent`
  being the shared rule, not measured on each CTA.
- **Drag, touch, real DPI.** Unchanged from previous passes: HTML5 drag-and-drop
  cannot be driven over CDP, a forced device scale factor is not a HiDPI panel,
  and the renderer store is not on `window`, so every scenario above drove the
  DOM and not the actions.

## Observation, out of scope

With two blocked sessions where one had been focused (`key-seen`), the header
read `2 running · 1 need attention` and the deck read `1 wants you` while **both**
tiles showed `● NEEDS YOU` (`w3-mission-washi-wabi.png`). That is consistent with
the documented model — `seen` dims the nag, not the fact, and the two counters
count nags — but three surfaces state the same situation with two different
numbers. Pre-existing, unrelated to this wave, not investigated further.
