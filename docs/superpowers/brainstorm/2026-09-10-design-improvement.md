# Design improvement — DevDeck's interface as it is, against the field, and the 4-key deck (2026-09-10)

`designer`, working from **~150 real screenshots** (`docs/qa/2026-09-08-shots/`,
101 before this week's fixes; `docs/qa/2026-09-09-shots/`, ~50 after, including
every skin zoomed at deck, tile and tab scale), `DESIGN.md` 0.9.2, `themes.ts`,
`styles.css`, the two review documents of 2026-09-08/09 and the verification of
2026-09-09. The app was not launched — a `product-reviewer` held the
single-instance lock. Competitor facts come from a research pass over current
docs and changelogs (sources named inline); anything that pass could not verify
is marked.

Scope: **the desktop renderer**. The phone client (`CLIENT_HTML` in
`src/main/server.ts`) has its own hard-coded palette and is not designed here.

Every proposal is labelled with when it should happen. Three labels, because a
further round of pre-beta engineering has been refused in advance:

- **with D1** — the deletion of API/Database/Work and the demotion of Tasks is
  already a deck re-layout; these ride in that change or not at all.
- **after the beta** — after 2026-10-06, once five strangers have been watched.
- **never** — considered and refused, with the reason.

Nothing below is labelled pre-beta.

---

## 1. An honest read of what ships

### 1.1 What works

**The state vocabulary is now genuinely good, and it survives a still frame.**
`02a-deck-four-states-slate-modern.png` and its Washi twin show four keys in a
row — flat bar · faint disc · hollow diamond · accent disc + stripe — and each is
a different *shape*, not a different brightness. The 1× pixel map
(`final-01-diamond-1x-pixels.png`) proves hollow-vs-filled is unambiguous in the
darkest and lightest theme. This is the part of the product that most
competitors get wrong (see §2), and DevDeck gets it right without a legend.

**Mission's tile is the best surface in the app.** Name · badge · project · the
agent's *actual last line* in mono · one chip with a glyph and a word · a
reply box or Approve/Deny. The 6× tile montage across all six skins
(`final-01-zoom-tile-all-skins.png`) shows no skin losing anything. The chip
`◇ WAITING 7s` beside a diamond dot is the tile agreeing with itself.

**The copy is unusually honest.** "Couldn't check for changes." "Sent 'y' ·
waiting for its next output." "Restored from your last run. This agent has no
resume command, so it starts a new conversation." "hand-written and
agent-written alike." The toast on an inert key offers the fix, not a second
copy of the reason. This is copy that names what it knows and what it does not,
and most of it should not be touched.

**The failure surfaces are better than the happy path.** Missing folder,
off-PATH agent, unreadable PATH, exited-and-killed-by-antivirus: each has a
form (dashed rule, pill word, bar) and a sentence. The `EXITED` tile
(`04n-exited-mission.png`) reads as dead at a glance: `–` dot, `□ EXITED`, `0
running`.

**All six skins hold.** Nothing clipped, nothing invisible, nothing unstyled in
any of the 6-skin montages. Washi — the one light theme — is now the theme with
the *best*-separated waiting mark (9.82:1) rather than the worst (2.92:1).

### 1.2 What is merely inoffensive

**Sumi and Slate are the same interface at a different temperature.** Set
`final-01-skin-slate-modern.png` beside `final-01-skin-sumi-wabi.png`: the
difference is a warm cast. That is fine — two dark themes that differ only by
hue temperature are cheap to carry — but nobody should believe the theme axis
is doing much work.

**Wabi-sabi and Modern Pro are provably identical at deck scale**
(`final-01-zoom-deck-all-skins.png`: six rows, three colourways, two of each
that are pixel-twins). The 2026-09-08 review traced why: Modern re-hardcodes
control radius to 7px, Wabi inherits 7px, and the only theme that ever supplied
a different number was deleted. The style axis today is letter-spacing, card
elevation and modal radius. It is not wrong; it is a second axis that costs a
2× verification multiplier for a difference a user will not notice on the
surface the product is about. §3.9 rules on it.

**The Terminal toolbar** (`07d-deck-12-keys-1384.png`): `New terminal` ·
`+ Claude` (accent fill) · `⌄` (accent) · `⌄` (ghost) · layout icons · expand ·
find · more. Two identical chevrons side by side, one filled and one not, are
"Launch options" and "More agents & SSH hosts" (`TerminalView.tsx:460,503`).
Nothing on their faces says so. Not confusing enough to block anyone; confusing
enough that a stranger will click the wrong one once.

### 1.3 What a stranger finds confusing in the first ten minutes

**1. The accent is everywhere, so it points at nothing.** DESIGN.md says
"Never more than one accent on screen." `styles.css` has **181** `var(--accent`
references and 38 more `--accent-soft`. In one ordinary Terminal frame
(`07d-deck-12-keys-1384.png`) I count the accent on: the ensō brand mark, the
active tab underline, the `+ Claude` fill, its chevron, the active deck key's
stripe *and* tint, the Terminal view-key underline, `● 3 changes`, `⚑ 3`, the
cursor, the attention dot and halo, and four breathing key edges. Fourteen
instances. Each has a local justification; together they mean the eye has no
idea where "you can act here" is. The rule as written is not what ships, and a
rule nobody can obey is not a rule. §3.1 restates it as tiers and names the
cuts.

**2. The one number that matters lives in the coldest corner.** `⚑ 3` — three
agents want you — sits bottom-right, next to the git branch, as a 12px glyph
and a digit (`15-mission-many-agents.png`, `⚑ 5`). Its tooltip is excellent
and nobody will hover it. It vanishes at zero, so a person never learns what
it is. Meanwhile the primitive that answers it — `Ctrl+Shift+J`, jump to the
agent waiting longest — is reachable only from the palette. §4 moves the count
next to the view keys, gives it a word, and makes it the door to the jump.

**3. Three headings, three grammars, one view.** Mission at rest
(`final-01-skin-slate-modern.png`): `AGENTS` (11px uppercase label) ·
`Uncommitted changes` (sentence-case title) · `IN-FLIGHT CHANGES` (uppercase) ·
`Ports in use on this PC` (sentence case, with a lowercase sub-line "every
process listening right now, not only DevDeck" that reads as a note the author
left for themself). A stranger reads inconsistency as hierarchy and looks for
one that is not there. §3.3.

**4. Five identical glyph buttons.** The tool cluster is five 16px line icons
distinguished only by tooltip (`⎘ ⊐ ⫼ ⚙ ⋯`, roughly). The walkthrough found the
same. With D1 the bar gains room and loses reasons for two of them. §4.

**5. On first run there are two `Open folder…` controls, and a click on any key
produces a third** (`05e-inert-key-tip-plus-toast.png`). Each is individually
defensible; together they say the app is not sure which one it means. §3.6.

**6. Five keys breathing forever.** Every waiting key runs `key-breathe` 2s
infinite (`07d`: four of them). After the first cycle the motion carries no
fact the static edge does not — it is decoration with a heartbeat. Motion that
never stops is the opposite of calm. §3.5.

**7. Empty space that is not quiet space.** Mission with one agent is a 260px
tile in a 1384px frame with ~55% of the window empty below the fold. Wabi-sabi
permits emptiness; it does not permit the emptiness of a page that has not
been laid out. The fix is not to fill it (§3.3 is about alignment, not volume)
— but it should be said that one 260px card and a full-width `Uncommitted
changes` row do not share a grid, and a stranger feels that before they can
name it.

Not on this list, because they are fixed: the seven silent keys, the
working/waiting collision, the false conflicts, dead sessions reading QUIET,
the erased `!`, Approve's silence, the badge collision. I checked each in the
09-09 shots and did not re-litigate them.

---

## 2. The field, September 2026 — what to learn, what to refuse

Research pass over current docs and changelogs. Verified claims cite a source;
glyph shapes and colours were frequently *not* documented in text and are
marked unverified.

### 2.1 Where the bar is

**Warp** (Universal Agent Support, Apr 2026; `docs.warp.dev/agents/capabilities/agent-notifications/`,
`…/vertical-tabs/`). Vertical tab sidebar; per-pane state as a small circular
badge on the pane icon — "In progress — magenta clock; Done — green check;
Error — red triangle; Cancelled — gray stop; Blocked — yellow stop (Waiting for
user approval)". A *separate* accent dot on rows with unread activity that
clears on focus. Notifications typed **Complete / Request / Error**, where
Request means "the agent is blocked and needs your input… command approval,
permission requests, and idle prompts where the agent is waiting for you." A
bell "mailbox" with `All tabs / Unread / Errors` filters. Users have filed for
whole-tab colouring because badge+dot is "too subtle" (warp issue 13287).

**Zed** (Parallel Agents, Apr 2026; `zed.dev/docs/ai/parallel-agents`,
discussion 54865). Threads sidebar grouped by project; each row "title, status
indicator, and which agent is running them"; "when a thread finishes or needs
attention, it surfaces to the top." Per users, indicators are a gray spinner
(running), the agent's logo in gray (done) and "a temporary blue dot, but it
disappears as soon as you focus an agent" — their top complaint is exactly
DevDeck's fixed defect #6: a transient attention mark erased by a glance.

**Cursor 3** (Agents Window, Apr 2026; `cursor.com/changelog/3-0`, forum
157310/168982). Sidebar status words **Draft / Running / Needs attention /
Done**, group-by-status. Two counters — dock badge ("activity you haven't seen")
and sidebar ("blocking approval, pending plan, or completed-and-unseen") — that
diverge, acknowledged. A 3.2.21 fix: plan approval showed as Done instead of
Needs attention. Glyphs unverified.

**Claude Code desktop** (Apr 2026 redesign; `claude.com/blog/claude-code-desktop-redesign`).
Sidebar of sessions filterable by status/project; rows self-archive when the PR
merges; `+12 -1` diff stats on rows; permission cards `Allow once / Always
allow / Deny`; OS notification "when a Code session finishes a task and you
aren't currently viewing that session." Row glyphs unverified.

**Conductor** (`conductor.build/docs`, 0.85.0 on 2026-09-09). Working / idle /
"needs input"; "the sidebar badges tell you which workspaces need attention."
Honest caveat in their docs: a queued prompt "reports idle until it does" start
— the same unknown-state honesty DevDeck's `COULDN'T CHECK` has. Badge form
unverified.

**Crystal** (deprecated Feb 2026, `github.com/stravu/crystal`): six emoji
traffic lights — 🟢 Running · 🟡 Waiting "Needs your input" · ⚪ Completed ·
🔵 New Activity · 🔴 Error. Worth citing for one thing only: it split *waiting
on you* from *finished but unseen*, which is the right taxonomy carried the
wrong way.

**cmux** (`github.com/manaflow-ai/cmux`): "Panes get a blue ring and tabs light
up when coding agents need your attention", plus `Cmd+Shift+U` "jump to the
most recent unread."

**Linear** (UI refresh 2026-03-12; `linear.app/now/behind-the-latest-design-refresh`):
"Don't compete for attention you haven't earned." "Structure should be felt,
not seen." Sidebar dimmer, icons smaller, coloured icon backgrounds removed,
palette shifted to "a warmer gray that still feels crisp, but less saturated,"
fewer separators. This is a wabi-sabi manifesto written by a company with a
blue accent.

**Raycast** ("The New Raycast", May 2026) — density kept as a feature, no
component detail published. **Ghostty 1.3** — no agent awareness; relevant
primitive is the OSC 9;4 progress bar and `notify-on-command-finish` only when
unfocused. **Wave 0.14** — block badges that "roll up… visible in the tab bar."

### 2.2 What DevDeck should learn

1. **Two orthogonal signals, and DevDeck already has them — name them.** Warp
   and Crystal separate *state* (what the agent is) from *unseen* (whether you
   have looked). DevDeck's `status` vs `seen` is exactly this split and is
   better built than either (the state never changes on a glance; only the
   nag dims). What DevDeck lacks is the *word* for the second axis on the
   surface where it matters — see §4's wants-you control.
2. **Attention surfaces, it does not just mark** (Zed sorts to top; Cursor
   groups; Warp filters). Mission already sorts attention-first. Overview's
   rail and the deck strip do not — a waiting key keeps its launch position.
   The deck must not reorder (a key that moves is a key you cannot find by
   muscle memory — Warp's own docs stress stable positions), but Overview's
   rail can, and should, sort by `RANK`. **After the beta**, no token.
3. **A jump-to-the-one-that-needs-you chord with a visible door** (cmux's
   `Cmd+Shift+U`). DevDeck has `Ctrl+Shift+J` and hides it. §4.
4. **One counter, not two** (Cursor's divergent badges). DevDeck already
   fixed this (`wantsYou` feeds both the flag and Mission's header). Keep it
   that way when the count moves.
5. **Linear's chrome discipline** — dimmer nav, no coloured icon backgrounds,
   fewer separators — is a licence to do what §3.1 proposes: take the accent
   off everything that is not an act.
6. **Notify only when not viewing** (Claude Code, Warp, Codex issue 29008).
   DevDeck's toast fires on a real BEL regardless of whether the pane is in
   front of you. **After the beta**: suppress the toast when the session's
   pane is the focused, visible pane — the `!` and the tile already carry it.
   No token.

### 2.3 What DevDeck should refuse

**Traffic lights.** Every competitor that documents its glyphs uses hue as the
carrier — magenta/green/red/yellow (Warp), 🟢🟡🔴🔵 (Crystal), a blue ring
(cmux), a blue dot (Zed, Codex menubar tools). All of it depends on a blue
system accent that leaves yellow and red free for urgency. DevDeck's accent is
amber; "attention amber" would collide with active, focus and brand, which is
why DESIGN.md forbids a warning token. The field's answer does not port, and
the field's own users are asking for *more* colour (warp 13287) because the
badge-and-dot scheme fails them under load — which is evidence for form, not
against it. **Refuse: per-state hue, per-tab colour coding, numeric dock
badges, blue-dot "unread".** Also refuse the kanban/tile dashboards (Vibe
Kanban, AgentsRoom, Superset): they are busy by construction and DevDeck's
Tasks board is being demoted for the same reason.

---

## 3. Improvements, ordered

Each: the problem · the token or rule that changes · cost across six skins ·
when. "Cost" includes the one thing that can verify it — a `run-app` pass in at
least Slate and Washi, both styles, since no component test can.

### 3.1 The accent budget — restate the rule, then spend less

**Problem.** §1.3 item 1. Fourteen accent instances in one frame; "never more
than one accent" is contradicted 181 times in the stylesheet.

**Rule change (`DESIGN.md`, Colors).** Replace "Never more than one accent on
screen" with a tiered budget the code can actually honour:

> One accent *hue*, spent in three tiers, each with a ceiling:
> - **Fill** — the frame's primary act. **At most one** per frame. `button.accent`,
>   and nothing else.
> - **Stripe / underline** — *where you are*. One per surface: the active
>   container's stripe, the active document tab's underline, the active view
>   key's underline. Never on a toggle, never on a segment (segments use
>   `--seg-tint` + weight).
> - **Ink** — *you can act here, now*. The `attention` dot and its `!`, the
>   wants-you flag, focus rings, hover. Not for brand, not for facts.
> Decoration and facts get `--text`, `--muted` or `--faint`. If a thing is
> accent and a stranger cannot act on it, it is wrong.

**Cuts that follow (all CSS, all existing tokens):**

| Element | Today | Becomes | Why |
| --- | --- | --- | --- |
| `.topbar-brand` (ensō) | `--accent` | `--muted` | brand is not an act; a muted ensō is more wabi-sabi than an amber one |
| `.sb-changes` (`● 3 changes`) | `--accent-soft` | `--text`, hover `--accent` | a count of dirty files is a fact; the `●` is already the form; hover says it is clickable |
| `.deck-key.active` | 3px stripe **+** 14% tint | stripe only | DESIGN.md's own "known exception" — two axes for one active |
| `.ov-seg button.on`, `.usage-windows .btn-min.on` | accent fill | `--seg-tint` + 600 | DESIGN.md's own known exception; fill is Tier 1 and these are segments |
| Terminal toolbar `+ Claude` + chevron | accent fill | ghost `button` | the Terminal view's Tier-1 fill belongs to nothing while no act is pending; the launcher cards already offer the same act at full width in the empty state |
| Mission `✓ Approve` | outlined accent | **`button.accent` fill** | this is the act the product exists for; it should be the frame's one fill when present. `✕ Deny` stays ghost, `--danger` text |
| Mission header `1 running` | accent-tinted | `--muted` | a count, not an act |

**Cost.** Zero new tokens. `--on-accent` on the Approve fill: `#14110d` on
`#b07a4a` (Washi) is 5.13:1, on `#b8895c` (Sumi) 6.07:1, on `#eba65c` (Slate)
9.09:1 — clears text AA in all three themes (computed, not measured in-app; a
user-picked accent can lower it, which is already true of every `button.accent`). One `run-app` pass, six skins, Mission + Terminal + Overview,
because every row above lands in a `[data-style]` override's territory
(`[data-style="modern"] button` sets radius/transition on the same elements).
**After the beta.** It is the largest visual delta on this list and should be
made once, in one commit, so the beta's five users see a stable frame.

### 3.2 The wants-you control — count, word, door

Designed in full in §4.3, because its position depends on the 4-key bar.
**With D1.**

### 3.3 Mission's heading grammar

**Problem.** §1.3 item 3.

**Rule.** Mission has one section-header style: the `label` typography
(`--fs-label`, uppercase, `--ls-label`, `--muted`) — the style `AGENTS` already
uses — with the right-aligned meta in `--muted` body size. Applies to
`Uncommitted changes` → `UNCOMMITTED CHANGES`, `Ports in use on this PC` →
`PORTS IN USE`. The sub-line under Ports goes into the header's meta slot as
`every process on this PC, not only DevDeck`. `hand-written and agent-written
alike` stays as meta; it is a good sentence.

Copy fix already on the record: `1 need attention` → `1 needs attention`
(`MissionControl.tsx:338`). Should be part of this commit.

**Cost.** No token; a class swap and two strings. One `run-app` pass in Slate
and Washi. `--muted` on `--bg` computes to 4.88:1 (Washi) · 5.81:1 (Sumi) ·
7.44:1 (Slate) — Washi is the weakest and still clears 4.5:1 for the 11px label.
**After the beta.**

### 3.4 Overview's rail sorts by rank

**Problem.** §2.2 item 2. `OTHER SESSIONS · 11` lists in launch order
(`07j-deck-700-1x.png`); the one that needs you is wherever it happens to be.

**Rule.** The rail sorts by `missionTail`'s `RANK` — attention, waiting,
working, idle, not-running — then by launch order within a rank. The deck strip
does **not** sort (stable position is identity there). Mission already does.

**Cost.** No CSS. Logic change plus a unit test asserting the order equals
`RANK` (the tab-dot ladder already has one). **After the beta.**

### 3.5 Bounded nag motion

**Problem.** §1.3 item 6. `key-breathe 2s ease-in-out infinite` on every
waiting key, forever. `dot-pulse` on working is different — it says "bytes are
flowing" and should stay infinite while `working` is true.

**Rule (`DESIGN.md`, Motion).** *A nag animates to announce a transition, then
holds.* Add one token in `:root`:

```
--nag-cycles: 5;   /* breathe 5 × 2s = 10s, then hold at the strong end */
```

`.deck-key.key-waiting { animation: key-breathe 2s ease-in-out var(--nag-cycles) forwards; }`
— `forwards` holds the 100% keyframe, which is the strong (30% accent) edge, so
the static nag remains and `key-seen`'s `box-shadow: none` still wins at
(0,3,0). Under `prefers-reduced-motion` nothing changes: the existing rule
already freezes at the strong end.

**Cost.** One token, no per-theme value (it is a count). Re-check that a
*fresh* waiting transition restarts the animation — it will, because
`key-waiting` is removed and re-added on the status change; if a key goes
waiting → working → waiting the class toggles and the count restarts. One
`run-app` pass, any theme, to watch a cycle end. **After the beta.**

### 3.6 One `Open folder…` on first run

**Problem.** §1.3 item 5.

**Rule.** When `projects.length === 0`, the deck strips row renders nothing —
the first-run panel above owns the act. `.deck-empty` "Choose a project"
remains for the projects-exist-none-active case, where it is the only door.
The inert-key toast keeps its `Open folder…` action: that is the click
answering for itself, and it appears only after a click.

**Cost.** No token. Removes a control; nothing to verify visually beyond the
row staying its `min-height: 38px`. **After the beta.**

### 3.7 Switcher paths truncate from the wrong end

**Problem.** `12-project-switcher.png`: three projects read
`C:/Users/Admin/AppData/Local/Te…` — identical.

**Rule.** The subtitle shows the **last two path segments**, ellipsis on the
left: `…/projs/alpha app`. This is a string rule, not a CSS `direction: rtl`
trick (which mangles slashes and mixed scripts). The full path stays in the
card's `data-tip`.

**Cost.** No token. **After the beta.**

### 3.8 Preset icons through `Icon.tsx`

**Problem.** The launcher's `✳ ✦ ⚡ ◆ ◇ ▶ ⚒ ✓` are Unicode text, rendered as
text, outside the icon set — and `⚡` on the `--dangerously-skip-permissions`
card is an emoji-presentation glyph that ignores `color`, which breaks one of
the three Command Presence channels on the one card where it matters most
(`04-view-terminal.png` shows the bolt in full amber).

**Rule.** `AgentPreset.icon` becomes an `IconName`. No visual change intended
on healthy cards; the desaturation channel starts working on unhealthy ones.

**Cost.** No token; a type change and a migration for persisted presets.
**After the beta.**

### 3.9 The style axis — ruling

**Problem.** §1.2. Two styles, pixel-identical on the deck, differing in
letter-spacing, card shadow and modal radius. Every visual change is verified
twice for it.

**Ruling.** Do not fix the radius collision and do not delete the axis before
the beta. **Ask the five users which style they are on at the end of their
first week** (there is no telemetry, and the diagnostics record is the right
place for `appearance` to appear if it does not already). If none of the five
moved off Modern Pro, **delete the Wabi-sabi style after the beta** — 6 skins
become 3, and the verification multiplier halves. If any did, make the
difference real with one token: `[data-style="wabi"] { --radius: 10px }` and
strike Modern's hardcoded `7px` list in favour of `var(--radius)`
(`styles.css:5434-5446`), so the two styles differ at the deck by a number a
user can see. Either way, correct DESIGN.md's Shapes paragraph, which promises
a distinction that does not render today.

**Cost.** Deleting: negative. Making real: one token in one style block; a full
six-skin pass because it touches every `<button>`. **After the beta.**

### 3.10 Toast only when not looking

**Problem.** §2.2 item 6.

**Rule.** The attention toast is suppressed when the session's pane is
currently focused and visible. The `!`, the dot, the tile and the wants-you
control still fire; only the fourth, transient copy is withheld. Copy of the
toast when it does fire is unchanged.

**Cost.** No token. **After the beta.**

### Considered and refused

- **A legend or a "what do the dots mean" panel.** DESIGN.md prefers a word to
  an encoding that needs a key. The words exist (chips, Overview heads, §4's
  control). **Never.**
- **Colouring tabs or keys per agent type** (Warp's colour-coded tabs). Multi-
  hue chrome; the outlined `--clay` badge already carries identity. **Never.**
- **A sidebar of sessions** (Warp, Zed, Cursor, Claude Code all went vertical).
  DevDeck removed its rail and sidebar deliberately; the deck is its answer to
  the same question, and it wins vertical space for the terminal on a Windows
  laptop. Nothing in the field is an argument against a bottom deck; the
  argument is only that whatever surface holds the sessions must be always
  visible, and the deck is. **Never**, at least not on the evidence of
  screenshots.
- **Filling Mission's empty space** with a second column, a timeline, a
  usage widget. The product is subtracting. **Never** — §3.3 fixes the
  alignment and leaves the air.
- **Per-theme overrides** for any of the above. None was needed; if an
  implementer finds one is, the design is unfinished and should come back.

---

## 4. The 4-key deck

Designed for the D1 deletion: API, Database and Work gone; Tasks demoted from a
view key to the More menu (and the palette). The deck goes from seven keys to
four: **Mission · Terminal · Browser · Editor**, `Ctrl+1..4`.

### 4.1 What does not change

The **strips row** — per-project `ALPHA APP` label, agent keys with dot ·
name · badge · `!`, the dashed `+`, the explicit 8px `--border-strong`
scrollbar when it overflows — is the deck's reason to exist and is right as it
is. It is not moved into the bar, it does not sort, it does not gain a fifth
signal. The five dot forms and the `key-seen` rules are as shipped.

### 4.2 The bar, at 1384

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ALPHA APP  ◆ qatalker 1 [QA]  ○ claude 2 [CLAUDE]  +  │  BETA-SERVICE  – codex 1 [CODEX]  +        │  ← strips (unchanged)
├──────────────────────────────────────────────────────────────────────────────────┤
│ ⌇ Mission   >_ Terminal   ▭ Browser   <> Editor      ⚑ 2 want you                 ⎇ master  ● 3 changes  ⚇   ⎘ ⚙ ⋯ │
│   ‾‾‾‾‾‾‾                                             ^ accent flag, --text word    ^ status region, --muted   ^ 3 tools │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Left to right, and the reading order is deliberate: **where am I → what needs
me → facts about the repo → tools**. Today's order puts tools between the keys
and the facts and the count at the far end; the eye has to cross the whole bar
to find the only number that changes what you do next.

**View keys** (`.deck-views`). Four, always labelled. The `group-start`
hairline and the `verify` class go: with four keys the supervise/verify
grouping is carried by order alone, and a hairline between key 2 and key 3 is
chrome that no longer earns its pixel. The `@media (max-width: 959px)` collapse
is deleted with it — measured fully-labelled width for seven keys was 590px;
four keys are ~350px, so the rule could never fire at the window's 900px
minimum, and DESIGN.md's own words apply: a media query that can never fire is
a rule nobody can trust. Active key keeps the 2px accent underline (the
recorded "known exception" — it is a segment by shape that selects the main
view; leave it, it is the bar's one Tier-2 accent). Inert state unchanged
(`aria-disabled`, 0.4, toast on click).

**Wants-you control** (`.deck-wants`, new; replaces `.sb-attn`). Sits
immediately after the keys with `margin-left: var(--sp-lg)`. It is a
`<button>` styled like `.sb-pull` (no chrome), containing the `flag` icon at
12px in `--accent` — the bar's one Tier-3 accent — and a word in `--text`,
weight 600, `--fs-sm`:

| Count (from `wantsYou`) | Text |
| --- | --- |
| 0 | *(renders nothing — the marker only ever adds)* |
| 1 | `1 wants you` |
| n | `n want you` |

"Want you" is the tooltip's existing word and covers both mechanisms (a bell
and a finished turn), which is what the count already sums. It deliberately
does not say `waiting` or `needs`: those two words are spent on the per-session
heads, where they distinguish attention from waiting, and the aggregate must
not borrow one of them and lie about the other. **Click:** the same act as
`Ctrl+Shift+J` — jump to the session that has waited longest — and the
`data-tip` says so: `Agent sessions that want you — asking a question, or
finished a turn. Click to open the one waiting longest (Ctrl+Shift+J).`
`aria-label` identical. One control carries the state and the act it invites,
which is the bar's own `sb-pull` precedent.

Why this and not a badge: a bare digit disappears at zero and never teaches
what it is; a word arriving beside the keys is read the first time it appears.
Why `--text` and not accent for the word: DESIGN.md's Overview rule — the flag
is the accent's marker, and colouring the word too is the same spend twice
(and `--accent` at 12px on Washi's `--bg` is the 2.92:1 mark this system just
removed).

**Status region** (`.deck-status`). Unchanged content — branch · pull ·
changes/unknown · identity · remote — with `.sb-changes` moving to `--text`
per §3.1. It keeps `flex: 1` and right alignment. The measured 900px case:
keys ~350 + wants ~110 + tools 88 + bar padding 20 + gaps 36 = ~604, leaving
~296px for a status region that needs 139. No overflow, no collapse stage,
and the left-edge clipping the current comment documents cannot recur.

**Tool cluster** (`.deck-tools`). Five becomes **three**: Scripts & saved
commands · Settings · More. `Agent context files` and `AI usage` move into
More — they are visits, not glances, and a 16px glyph for each was two more
unnamed buttons on a bar whose job is to be scanned. More's menu, in order:
`Tasks` · `Agent context files` · `AI usage` · `Activity` · separator ·
`Keyboard shortcuts (F1)`. Tasks was `Ctrl+2`, and `Ctrl+2` is now Terminal;
Tasks gets no chord — a demoted view does not keep a top-row key — and is
reached from More and from the palette (`Go to Tasks`). The F1 sheet and the
palette entries update to `Ctrl+1..4`.

**Empty deck.** No project: strips row empty (§3.6); keys inert; wants-you
absent; status empty; tools present (Settings must stay reachable). Projects
but none active: `Choose a project` dashed button in the strips row, as today.

### 4.3 The bar, at the 900px minimum

Same bar, nothing collapses. Only the strips row scrolls, as it does now. The
`07j-deck-700-1x.png` capture (below minimum; the window cannot get there
without a harness) shows the status region starting to eat `● 3 changes` from
the left — at 900 with the 4-key arithmetic above it does not.

### 4.4 States of the wants-you control, exhaustively

| Condition | Renders |
| --- | --- |
| No project | nothing |
| Project, no agent sessions | nothing |
| Sessions, none want you | nothing |
| 1 wants you (attention or waiting, unseen) | `⚑ 1 wants you` |
| n want you | `⚑ n want you` |
| All wanting sessions acknowledged (`seen`) | nothing — `wantsYou` already excludes seen; the dots still say waiting |
| A wanting session dies | drops out — `wantsYou` reads the derived status |
| Could not determine (never — `wantsYou` is a pure function of store state) | n/a; no unknown state exists here and none is invented |

Hover: `--accent-soft` on the word, matching `.sb-pull:hover`. Focus-visible:
the base accent ring. Reduced motion: nothing here moves. No animation is
added to the control — the deck's nag is the key edge, and a second breathing
thing on the same bar would be the additive mistake this document keeps
refusing.

### 4.5 Copy that changes with D1

- Palette: `Go to API`, `Go to Database`, `Work - Jira / Azure items` removed;
  `Go to Tasks` stays; `Go to …` entries read `(Ctrl+1)`…`(Ctrl+4)`.
- F1: `Switch view (Mission … Editor)  Ctrl + 1 … 4`; the `DATABASE` section
  goes.
- Settings → About tagline: already flagged to marketing; it must stop naming
  API and database.
- First-run lede stays as is — it already describes the 4-key product:
  "terminals, agent sessions, an editor and git status, one folder at a time."

### 4.6 Cost

No new colour token. One new class (`.deck-wants`) built from existing idioms
(`.sb-pull` chrome-less button, `flag` icon, `--text`/600). Deletions: the
`verify` group hairline, one media query, two tool buttons, three view keys.
Verification is one `run-app` pass across all six skins at 1384 and 900, with
0, 1 and 3 wanting sessions — three deck screenshots per skin. The whole thing
is a re-layout of one component tree (`Deck.tsx`, `ViewKeys.tsx`,
`ToolCluster.tsx`, `DeckStatus.tsx`) and should land as **one commit with D1**,
because D1 already forces the keys to change and a second deck re-layout later
would be the beta users learning the bar twice.

---

## 5. The 6px diamond — ruling

**Keep it as shipped. Do not spend a pass on it before or during the beta.**

The evidence (`final-01-diamond-1x-pixels.png`, true 1× pixels at 22×): a clean
rhombus outline in Slate and Washi, on the deck and in the tab. The qa note is
accurate — at 6px the diamond-ness rides on four ~50%-ink corner pixels and the
dominant read is a hollow ring, faintest in Washi. Three reasons that does not
matter enough to change anything:

1. **The load-bearing distinction is hollow-vs-filled, and it is total.** The
   rotation was added for a second, weaker job: not reading as a typographic
   bullet next to a `--text`/600 name. Every surface where that misreading
   happened — Mission tile heads, Overview heads — now carries a word or chip
   beside the mark (`◇ WAITING 7s`, `waiting for you`), so a viewer who reads
   the mark as a bullet is corrected 20px to the right. On the deck key, where
   no word sits beside it, the name is `--muted` and 12px, not `--text`/600,
   and the bullet reading was never observed there.
2. **1× is the minority case on the hardware this ships to.** Every skin
   reading was at `deviceScaleFactor: 1` and there was no HiDPI pass. Most
   Windows laptops run at 125–150% scaling, where the mark paints 7.5–9 device
   pixels and the corners resolve — the 7px mini-strip already demonstrates
   that a diamond at 9.9px painted extent "reads much more clearly." This is
   inferred, not measured; it is the one thing worth a look *after* the beta,
   on a 150% display, not before.
3. **The alternative is not free.** Growing the base mark to 7px touches
   eleven surfaces and five forms across six skins for a marginal gain on the
   one form, and 7px is odd, so the filled disc and the flat bar lose their
   pixel-centring.

**The conditional, if a beta user at 100% scaling says "which one is
waiting":** introduce one token, `--dot: 6px`, in `:root`, read by `.tab-dot`'s
width and height (`styles.css:1713-1714`, `6868-6869`), and raise it to `7px`.
The mini-strip's own `7px` override becomes `var(--dot)` and stops being a
special case. No per-skin exception; contrast is untouched; one six-skin pass.
Do not add a legend, do not add a word to the deck key, and do not go back to
a circle — the pixel map shows the circle would be the same four pixels
brighter, which is the bullet problem returned.

---

## 6. What I deliberately did not design, and why

- **The phone client.** Separate surface, hard-coded palette, its own
  verification (`docs/qa/phone-approval-verification.md`). Nothing here
  applies to it and nothing here should be copied into it without its own
  pass.
- **The Editor, Browser, and Terminal panes' interiors.** The Terminal is
  xterm with the theme's palette and is not chrome; Monaco is Monaco. The
  toolbar's two chevrons (§1.2) are worth a copy fix (`+ Claude ⌄` → the
  chevron carries `Launch options`, and the second becomes a `⋯`-style `More
  agents` glyph so two identical arrows do not sit side by side) — noted, not
  designed, because it depends on what D1 leaves in that toolbar.
- **Settings' fifteen sections.** `Proxy` may have no subject after the
  network view's deletion; that is a product question before it is a design
  one.
- **A HiDPI pass.** Should happen, after the beta, on a 150% display — it is
  the one measurement this whole system lacks, and §5 depends on it.
- **Anything pre-beta.** Refused in advance, and correctly: every item here
  needs a `run-app` pass, the app is the only test rig, and the beta's five
  users should meet one interface, not a moving one.
