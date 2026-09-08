# Design review — DevDeck as it ships, post-cut (2026-09-08)

`design-reviewer`, static review against `DESIGN.md`, `themes.ts`, `styles.css`,
and `docs/qa/2026-09-08-ui-ux-walkthrough.md` (101 screenshots, 43-minute driven
session, scratch profile). No headless renderer exists, so nothing below is a
visual claim — it is tokens, cascade, and copy, cited to `file:line`, plus a
short list for whoever does the visual pass.

Scope: judged against the **4-key** future (Mission · Terminal · Browser ·
Editor) per D1's authorization. API, Database and Work are not evaluated.

---

## The five findings I was asked to rule on

### 1. Working and waiting are the same clay colour

**Confirmed, and the mechanism is worse than "no colour axis was designed."** One
*was* designed and shipped, and a cascade bug silently deletes it for every
session, in every skin.

- `styles.css:1117-1126` sets `.tab-dot.status-attention` and
  `.tab-dot.status-waiting` to `background: var(--accent)`. Both are two-class
  selectors — specificity `(0,2,0)`.
- `styles.css:1620` sets `.tab-dot.claude { background: var(--clay) }` — also
  `(0,2,0)`, but ~500 lines later in the file, so it wins the tie.
- `AgentKey.tsx:69` always renders `className="tab-dot claude status-" + status`,
  so every agent dot carries both classes. `--clay` always wins; `--accent`
  never paints, for *all three* states equally. That is exactly why qa measured
  identical `rgb(201,144,106)` (Slate's `--clay`) for working **and** waiting —
  and by the same mechanism, attention's dot too (it stays legible only because
  it alone also gets a static halo and the separate `!` glyph).

**The token fix is a reorder, not a new token.** `--accent` and `--clay` are
already correct in all three `*_VARS` maps. Add
`.tab-dot.status-waiting, .tab-dot.status-attention { background: var(--accent) }`
*after* `.tab-dot.claude`'s rule (or scope `.claude`'s rule to
`:not(.status-waiting):not(.status-attention)`) — the same "win the tie by
staying later in the file" trick the codebase already uses on purpose
(`styles.css:6945-6952`, the "real-button pressables" comment, for `.deck-key`).

**But a colour fix alone is not the design answer** — DESIGN.md's own rule is
form *and* colour. The right form already exists and ships today, just gated
behind a media query: under `prefers-reduced-motion`, `.tab-dot.status-waiting`
becomes a **hollow ring** (`background:transparent; box-shadow: inset 0 0 0
1.5px var(--accent)`, `styles.css:1187-1190`) against working's filled, static
dot — a real shape difference, not a speed-of-animation one. **Promote that
hollow-vs-filled idiom to the unconditional default**, and let the motion
preference only decide whether it also breathes. That is the actual fix: form
that survives a still frame, not merely a corrected hue.

**Cost across the six skins: zero.** No new token. `--accent`/`--clay` are
already themed correctly; the hollow-ring idiom is pure border/box-shadow, so
it costs nothing in Sumi, Washi, or either style once promoted out from behind
the media query. This is the cheapest fix on this list.

### 2. Seven view keys are clickable and do nothing

**Confirmed as a real first-moment defect — but the code already implements more
of DESIGN.md's "Disabled controls" contract than the raw finding credits.**
`ViewKeys.tsx:54-89` does exactly what DESIGN.md's post-mortem prescribes:
`aria-disabled` not `disabled`, a **permanent** `aria-label` and `data-tip` in
both states, the dimmed form restored on `[aria-disabled="true"]`
(`styles.css:6212-6218`), hover-brightening withdrawn, and the focus ring
recoloured to `--text` so it doesn't spend the frame's one accent on seven
controls that can't act (`styles.css:6219-6226`). DESIGN.md documents this
exact incident as already fixed, and the code matches the documentation.

What the contract guarantees is that the reason is **nameable** — not that it's
seen without a second action. And `Tooltip.tsx` makes that gap concrete:
`HOVER_DELAY_MS = 420` before a tip first appears, and
`window.addEventListener("mousedown", hide, true)` (`Tooltip.tsx:113`, capture
phase) forcibly hides any visible tip the instant a mousedown fires — **before**
the guarded click handler (`ViewKeys.tsx:82`, `if (off) return`) even runs. So a
stranger who hovers a key, waits the 420ms, reads *"Terminal - open a project to
use the views,"* and then does the natural next thing — clicks it — has the
explanation withdrawn in the same gesture that produces the silent no-op. The
tooltip and the click are mutually exclusive in time, by design (that dismissal
rule is otherwise correct tooltip hygiene; it just collides with a control whose
only explanation lives in that same tooltip).

**No token to change here** — this is interaction sequencing, not colour/shape.
The fix: surface the reason *at* the click, not only on hover — e.g. route the
guarded click through the existing toast pipeline with the same `data-tip`
string, reusing `.toast` styling that already exists. No new token, and it
costs nothing across skins.

### 3. Past four agent keys, the names vanish

**Confirmed exactly as described.** Compression triggers at
`COMPRESS_THRESHOLD = 4` (`deck.ts:13`) and hides `.deck-key-name`
(`AgentKey.tsx:121`, `!compressed &&`), leaving only a dot and a badge. The
badge is bound to the **preset**, not the **session**:
`RECOMMENDED_COMMANDS` (`settings.ts:242`) gives every session launched from the
"Claude" preset the badge `CLAUDE`, so five such sessions compress to five
identical outlined pills. The badge is doing its documented job — DESIGN.md's
badge-tier table reserves the outlined pill for *"identity... never urgency,"*
and it correctly names the agent *type* — the gap is that compression removes
the other identity axis (session name) without substituting anything.

**No colour/shape token fixes this — it's a data-modelling gap**, not a form
violation. The design answer, consistent with "promote an existing idiom before
inventing one": the project switcher already draws initials into an avatar for
identity at a glance; compression could do the equivalent — a launch-order
numeral suffix (`CLAUDE ①`) inside the same outlined pill, or an initial drawn
from the session name. Whatever is chosen, it must survive compression, which
today reduces every session to `(dot, badge)` with the badge value duplicated
across N sessions.

**Cost:** none to the colour system (the badge already renders identically,
correctly, in all six skins); the fix is compositional, so once decided it's
free across themes and styles.

### 4. Approve gives zero confirmation

**Confirmed, and total rather than partial.** `respondApproval`
(`store.ts:2263-2269`) does exactly two things: `window.api.pty.input` (the real
send — this part works, qa verified `RECEIVED "y\r\n"` on the pty) and
`markSeen` + `pushActivity(..., "answered prompt")`. `pushActivity` only appends
to an internal 200-row `activity` array read solely by the palette's "Open
activity feed" — never the toast pipeline. `markSeen` sets `seen[termId]`, but
`tileState.ts`'s own documented rule deliberately excludes `seen` from the
classifier (*"a field there could be read by the classifier and would put a
visibility-derived fact back into what a session IS,"* `tileState.ts:264-267`) —
so the Mission tile's chip, question text, and Approve/Deny buttons are
untouched by design. There is also no `.deck-key.key-attn.key-seen` rule (only
`.key-waiting.key-seen`, `styles.css:1159`), so the deck key's `!` is equally
unaffected. **Net: pressing Approve changes nothing visible, anywhere, until the
agent's next byte arrives** — which invites exactly the double-press qa
predicted.

**The fix reuses a form idiom the app already has**, rather than inventing
urgency colour: the "seen" idiom (hollow ring in place of filled/breathing) *is*
"acknowledged, not resolved" — precisely the state Approve produces (I answered;
outcome unknown). Add `.deck-key.key-attn.key-seen` styling mirroring
`.key-waiting.key-seen`'s hollow-ring rule (`styles.css:1163-1167`), and on the
Mission tile, dim the pressed action row the same way `.deck-view[aria-disabled]`
dims an inert control (opacity 0.4, no hover-brighten) for a short window or
until the next byte arrives, rather than leaving both buttons live and
re-clickable.

**Cost:** zero new tokens — reuses `--accent`-ring and opacity idioms already
proven across all three colour themes and both styles.

### 5. Wabi and Modern are near-identical at deck scale

**Confirmed — and the cause is a documented collision, not an accident.**
Modern Pro's own style block explicitly re-hardcodes control radius to 7px:
`[data-style="modern"] button, input, select, textarea, .icon-action, .term-tab,
.tab-rename, .chip, .work-type, .work-status, .mtile-chip { border-radius: 7px }`
(`styles.css:5242-5253`). Every deck control is a bare `<button>` —
`.deck-key` (`AgentKey.tsx:109`), `.deck-view` (`ViewKeys.tsx:55`), `.deck-add`
(`ProjectStrip.tsx:53`) — so all three are caught by that rule regardless of
their own `border-radius: var(--radius, 7px)` fallback. **Wabi-sabi has no
`[data-style="wabi"]` block in `styles.css` at all** — its controls fall
through to the bare theme token `--radius`, which all three surviving themes
set to `7px` via the shared `COMPACT` map (`themes.ts:43-48`). The two numbers
were never going to differ: Modern writes 7 explicitly, Wabi inherits 7 by
default, and the only theme that ever supplied a different number — Zen, `11px`
`AIRY` — was one of the four themes deleted on 2026-09-04. `--radius: 8px`,
which `[data-style="modern"]`'s own root rule sets (`styles.css:5239`), never
reaches a single deck control, because the more specific `button`/`.chip`/etc.
list two lines later pins it back to 7 first.

**DESIGN.md needs a correction, not just the code.** Line 189 says *"Wabi-sabi
keeps the softer default"* as if that is still a real distinction at control
scale. It was true while Zen (11px) existed as the airy counterpoint; after the
cut, it is false everywhere a `<button>` renders, because Modern's control
radius (7) is the same integer as Wabi's inherited theme default (7). The
styles now diverge only at panel/card/modal scale (Modern: 10px cards, 12px
modals, `styles.css:5268,5276`; Wabi: no override, base component radii apply)
— and the deck (agent keys, view keys, the `+` button) is entirely
control-scale, so it is provably identical between the two surviving styles,
not merely "less different than the names suggest."

**Token fix, if a shape distinction at the deck is wanted:** let Modern's
control-radius rule read `var(--radius)` instead of hardcoding `7px` — a
one-line deletion that lets the already-set `8px` actually reach the deck,
giving Modern 8px controls against Wabi's 7px. **If it is not wanted**, correct
DESIGN.md's line 189 instead, so the file stops promising a distinction the
deck cannot show.

**Cost:** either fix is free across the other four skins — `--radius` already
resolves correctly per theme everywhere else; only the deck-scale collision is
new information here.

---

## My own findings, beyond qa's list

Ranked; separated by whether the defect is **dishonest/illegible** (a surface
claims something the code doesn't back, or a state becomes unreadable) versus
**merely unpolished** (real, but doesn't mislead anyone).

### Illegible

**A. The tooltip that explains a disabled control is withdrawn at the exact
moment the click needs it.** Covered in full under Finding 2 above
(`Tooltip.tsx:113`). Listed again here because it is a mechanism qa's writeup
didn't name — qa attributed the seven dead keys to "hover-only," but the
`mousedown`-capture dismissal means the explanation and the click are
*structurally* incompatible, not just easy to miss. Worth fixing in the same
pass as Finding 2.

**B. Preset icons bypass `Icon.tsx` and silently break one of the three
Command-Presence channels DESIGN.md itself names.** `RECOMMENDED_COMMANDS`
(`settings.ts:242-258`) stores raw Unicode glyphs — `✳ ✦ ⚡ ◆ ◇ ▶ ⚒ ✓` — as each
preset's `icon`, rendered as bare text via `{a.icon || "❯"}` in both
`CommandLauncher.tsx:160` and `TerminalView.tsx:533`, never through
`components/Icon.tsx`. This is the rubric's "no pictographic glyphs, no emoji
in chrome" rule, violated on the surface qa specifically praised (the launcher
cards). It is more than cosmetic: DESIGN.md's own Command Presence Marker
section (the "the icon desaturates" channel) already names this failure mode by
example — *"a preset whose icon is a bolt kept a full-strength accent-looking
icon while the computed style claimed `--faint`... `color` does not mark an
emoji-presentation glyph — it paints its own colours and ignores the
property."* That sentence describes exactly `claude-yolo`'s `⚡` glyph, which
Windows' emoji font very likely renders in full colour regardless of the
`currentColor`/`filter: grayscale(1)` treatment applied around it. So for the
one preset DESIGN.md flags as the highest-risk launch (`--dangerously-skip-permissions`),
one of the three documented signal channels for "is this command trustworthy"
is live-broken, leaving the word (`NOT ON PATH`) and the dashed rule to carry it
alone — DESIGN.md says there are three channels "because two aren't enough,"
and this is a case where it's down to two. Fix: give every `AgentPreset` an
`IconName` from `components/Icon.tsx` instead of a Unicode string; the
grayscale/opacity treatment then works as designed for all seven presets.

### Unpolished (real, doesn't mislead)

**C. `themes.ts:42-48`'s comment is stale.** *"Density/typography vars per
feel. Sumi/Washi are compact; Zen is airy"* and the `AIRY` constant it
describes refer to a theme (Zen) deleted on 2026-09-04; `AIRY` is applied
nowhere in the current three-theme roster. Harmless today, but it's the same
class of drift DESIGN.md itself warns against — a stale comment that will read
as a design decision to the next person who touches radius, the way the stale
ROADMAP/README claims did in the product-direction review. Update or delete the
comment and the dead `AIRY` export together.

---

## Must-fix-before-a-stranger vs. can-wait

**Must fix before the beta** (dishonest or illegible — these are the surfaces a
stranger will hit doing exactly what the product is for):

1. False `N conflicts` in red on Mission (qa's #1) — endorsed without
   qualification; it fires on the product's own headline use case and teaches
   the user to distrust the app's one alarm-adjacent colour.
2. Working/waiting collision on the deck (Finding 1) — the deck is the
   always-visible surface; the fix above is free.
3. Approve gives no confirmation (Finding 4) — a live action with zero
   feedback invites a double-press on something already sent.
4. Dead sessions read as `QUIET` after a restart (qa's #3) — the tile system
   already has the vocabulary (`EXITED`) it just isn't asked the question.
5. Seven silent, clickable view keys at first launch, sharpened by the
   tooltip-dismissal mechanism (Finding 2 + own finding A).
6. Glancing at a pane permanently erases its `!` (qa's #4, `store.ts:926`).
7. Badge collision past four sessions (Finding 3 / qa's #7) — DevDeck's own
   intended scenario (several Claude sessions) is the one that breaks it.

**Can wait** (real, but doesn't mislead a first-session stranger):

- Wabi/Modern radius parity at deck scale (Finding 5) — an internal
  design-system promise, not user-facing copy; fix the sentence or the CSS on
  the next pass through `styles.css`, no urgency.
- Preset icons bypassing `Icon.tsx` (own finding B) — the word and dashed rule
  still carry the NOT ON PATH signal even with the icon channel silently down.
- The stale Zen/`AIRY` comment (own finding C) — pure hygiene.
- Everything else in qa's ranked list below "badge collision" — deck clipping
  at 1000px, switcher path truncation, `1 need attention`, Overview mode buried
  in the palette, the About tagline still selling the pre-D1 shape (already on
  a marketing-owned fix per the product-direction handoff) — all real, none of
  them illegible, all safely sequenced after the seven items above.

No new colour or shape token is required anywhere on the must-fix list. Every
fix above is a cascade reorder, a wiring of an idiom the app already ships
somewhere else, or a data-modelling change to what a badge carries — which is
the right shape for a system whose actual failure mode, end to end, is a
surface asserting something it never observed.
