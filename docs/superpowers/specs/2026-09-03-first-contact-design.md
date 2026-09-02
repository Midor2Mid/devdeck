# First contact — design specification

**Date:** 2026-09-03
**Author:** designer
**Scope:** the first five minutes for someone who is not the author. Nothing else.
**Surfaces:** launch with no projects · the terminal launcher · the launcher card
and Settings → Agents under a three-state PATH probe · the Copy diagnostics
affordance.
**Surface not designed:** the phone client (`CLIENT_HTML` in
`src/main/server.ts`) has its own hard-coded palette and never sees first
contact — a paired device is by definition a second session. Everything below is
the **desktop renderer**.

---

## 0. What a stranger actually gets today

Verified in the running app on 2026-09-03 with an empty scratch `userDataDir`
(`run-app` skill, four screenshots). The brief described four surfaces; the app
has five problems, and two of them are worse than reported.

1. **The window opens on Mission, not the terminal.** With zero projects a
   stranger sees three section headers reporting nothing — `AGENTS · 0 running`,
   `REVIEW QUEUE · No uncommitted changes across your projects`, and a **`SYSTEM`
   row listing every listening port on their machine** (`:1433 :3306 :5432 :6379
   …  +8 more`). The port wall is the most concrete, highest-contrast thing on
   the screen and the least relevant object in the product. Below it, 60% void.
2. **The one control that matters is the quietest thing on screen.** "Add or open
   a project" (`Deck.tsx:38`, `.deck-empty`) is low-contrast text in the
   bottom-left corner.
3. **`IntroTip` teaches three chords** to someone with no project to apply them
   to, in an accent-bordered card at bottom-centre, and spends a second accent
   fill on the button that dismisses it.
4. **The project switcher, opened with zero projects, says "No matching
   projects."** (`ProjectSwitcher.tsx:209`) — the zero-*results* copy for an
   empty *list*. Absent rendered as zero. This is the house rule broken in the
   first thirty seconds.
5. **The launcher fabricates a command.** `a.command || a.id` (`CommandLauncher.tsx`)
   printed `blank1` in the mono command slot for the author's real "New agent"
   preset. Mono means "this is the literal string that will run"; `blank1` was
   never going to run. `newTab` resolves `initialCommand ?? preset?.command ??
   agentId`, and `""` is not nullish — so that card writes a blank line into a
   fresh shell and **literally nothing happens**. This is the exact failure
   `product-reviewer` named, and it is reachable in one click.

A configured-but-absent CLI is not silent, for the record: PowerShell prints
nine lines of `claude : The term 'claude' is not recognized as the name of a
cmdlet, function, script file, or operable program…` and the pane stays alive as
a shell. Not nothing — but not actionable, and not attributable to DevDeck by
anyone who did not already know.

Measurements taken at the minimum window (`minWidth: 900, minHeight: 600`,
`src/main/index.ts:124`): the launcher grid resolves to **4 × 173px** columns and
already overflows by 26px (`scrollHeight 470 / clientHeight 444`) with only five
cards. Anything added to the launcher head costs scroll on the smallest window.

---

## 1. Deletions

Prefer replacing what exists. Six deletions, two additions.

| Delete | Where | Why |
|---|---|---|
| `IntroTip` component | `src/renderer/src/components/IntroTip.tsx` (whole file), `App.tsx:43` (import), `App.tsx:456` (render) | Three chords to someone with nothing to apply them to; `F1` already lists every shortcut; it spends two accents on itself. |
| `.intro-tip*` CSS | `styles.css:5973–6014` (`/* ----- first-run intro tip ----- */` through `.intro-tip-actions`) | Follows the component. |
| The no-project `.empty-state` | `TerminalView.tsx:176–186` | Replaced by §2's routed panel. The chord copy goes with it. |
| `❯` in the launcher heading | `CommandLauncher.tsx`, `<h2>❯ Launch a command</h2>` | DESIGN.md: "No Unicode glyphs or emoji in chrome." The card icons are user data; a glyph in an `h2` is chrome. |
| `.accent` on `+ New terminal` | `CommandLauncher.tsx`, `.launcher-actions` | See §3.2 — restores one accent per screen. |
| `a.command \|\| a.id` | `CommandLauncher.tsx`, `.launch-card-cmd` | Prints an id where a command goes. See §4.3. |
| `No matching projects.` as the zero-projects copy | `ProjectSwitcher.tsx:209` | Absent ≠ zero matches. See §2.4. |

`localStorage["devdeck.seenIntro"]` becomes dead. Leave it — one string in one
browser profile, no migration warranted.

**Not deleted, and named so nobody thinks it was missed:** the Mission `SYSTEM`
port list. §2 removes it from *first contact* by construction (the no-project
route never renders Mission), but a user with one project still gets a wall of
their own listening ports as a peer of their agents. That is a Mission-view
question, not a first-contact one. Recorded, not designed.

---

## 2. Surface 1 — launch with no projects

### 2.1 The route

`product-director`'s default — delete `IntroTip`, fold first-run into the
no-project empty state — is **right, and does not go far enough.** Folding into
"the no-project empty state" leaves the stranger on Mission, because Mission is
the default view and its own empty state is the port wall.

**When `projects.length === 0`, `.main` renders `<NoProjects/>` and nothing
else** — one guard above the panel stack in `App.tsx`, before the per-view
`<div className="panel">` list. Mission, Tasks, Terminal, API, Database,
Browser, Network and Editor all resolve to it. Every one of those views'
empty states is either a lie or a distraction with no project; there is
nothing to switch between.

The eight `.deck-view` keys are `disabled` while `projects.length === 0`, with
one shared `data-tip`: **"Add a project to use the views."** The existing
`button:disabled { opacity: .4 }` carries the form; no accent underline appears
anywhere, so nothing on screen claims to be active. This is chosen over leaving
them live because a live key that renders the same panel is a control that
visibly does nothing — the failure mode this whole cycle exists to remove.

`.deck-empty` in the deck strip keeps its position and gains nothing: the panel
above now carries the call to action, and a second one in the corner would be
two primaries.

### 2.2 `<NoProjects/>` — layout and tokens

Reuses `.empty-state`'s geometry and its ensō watermark (`styles.css:1500`,
`--accent` at 0.07 behind centre) — no new container. New class `.first-run`
applied alongside, for one rule only:

```
.first-run { max-width: 46ch; }    /* on the inner column, not .empty-state */
```

`.empty-state` today has no `max-width`, so its text sprawls the full 2000px.
Centred is correct on this one screen — a single object on a void, with the
centred ensō behind it — and it is the documented exception to
"no everything-centered", stated here so a reviewer does not read it as drift.

Vertical rhythm, top to bottom, using existing tokens:

| Element | Type | Colour | Spacing below |
|---|---|---|---|
| `h1` `DevDeck` | `--fs-title`, weight 600, `--ls-title` | `--text` | `--sp-md` |
| Lede, one sentence | `--fs-body`, `--lh-body` | `--muted` | `--sp-xl` |
| `button.accent` | `--fs-sm` | `--on-accent` on `--accent` | `--sp-xl` |
| Prerequisite line | `--fs-sm` | `--muted`, agent names in `--font-mono` at `--fs-sm` | `--sp-xs` |
| Probe line (§2.3) | `--fs-sm` | `--muted` | `--sp-xl` |
| Chord line | `--fs-label` | `--faint` | — |

Total height ≈ 260px. At **900 × 600** the panel is centred with ~150px of air
above and below; no scroll, no reflow, nothing to hide. The 46ch cap means the
lede wraps to two lines at 900px and two lines at 2000px — identical shape at
both ends, which is the point of the cap.

### 2.3 `<NoProjects/>` — exact copy

```
DevDeck

A cockpit for the projects you already have: terminals, agent sessions,
an editor and git status, one folder at a time.

            [ Open a project folder ]

DevDeck runs agent CLIs you install yourself — claude, codex, gemini.
<probe line>

Ctrl+K reopens this list later.
```

- `Open a project folder` calls the existing `addProject()` (the folder dialog).
  It is the **only** accent on this screen.
- `claude`, `codex`, `gemini` are values → `--font-mono`. "DevDeck", "Ctrl+K"
  are names → sans.
- "you install yourself" is the sentence the app has never said. It is not an
  apology and not a warning; it is the fact that decides whether the next click
  works.
- One chord, at the one moment it applies, in the smallest type on the screen.
  This is not `IntroTip` reduced to a third — the panel is about to disappear
  forever and the user needs a way back to project management. `Ctrl+Shift+P`
  and `F1` are deliberately not here: there is nothing to run and nothing to be
  a shortcut *to* yet.
- No "Welcome to". No exclamation mark. Nothing on this screen is celebrating.

**The probe line, four states.** Text only, `--muted`, one line, command names in
mono. This is the whole reason a stranger will not click into silence:

| Probe result | Copy |
|---|---|
| ≥1 `found` | `Found on your PATH: claude, codex.` |
| all `missing` | `None were found on your PATH. A shell alias or function still works — but if a launch does nothing, this is why.` |
| all `unknown` | `DevDeck couldn't read your shell's PATH, so it hasn't checked them.` |
| no agent presets configured | `You have no agent commands configured yet.` |

Mixed `found` + `missing` uses the `found` row: at this point in the session the
user has no project and cannot act on a per-agent fact. Naming which ones are
absent belongs in §3 and §4, where the cards are.

More than three found names: `Found on your PATH: claude, codex, gemini +2 more.`
The `+n more` is plain text, not a control — there is nothing to expand into on
this screen.

### 2.4 The project switcher's empty list — three states

`ProjectSwitcher.tsx:209` conflates absent with zero-matching. `q` is already in
scope; the fix is three branches on `projects.length` and `q`:

| Condition | Copy |
|---|---|
| `projects.length === 0` | `No projects yet. Add a folder to start.` |
| `projects.length > 0`, `q === ""`, `ordered.length === 0` | `No projects to show.` (unreachable today; present so the branch is not a lie if grouping ever filters) |
| `projects.length > 0`, `q !== ""` | `No projects match ` + `<code>{q}</code>` + `.` |

The query is a machine-readable value inside a sentence → `<code>` in
`--font-mono`, per DESIGN.md:363. `.switcher-empty` keeps `.muted`; the third
row needs `overflow-wrap: anywhere` on the `<code>` so a pasted path cannot
widen the modal.

---

## 3. Surface 2 — the terminal launcher

### 3.1 The head

Keep `Launch a command` (accurate, short) minus the `❯`. Keep the sub-line —
`No terminals yet in acme-web. Pick a startup command, or open a plain shell.` —
it is honest and names the project in sans, which is correct for a name.

### 3.2 One accent

Verified on screen: at the launcher, **three** things carry the accent
simultaneously — the tab bar's `+ Claude` (filled), the tab bar's `↻ Resume`
(outlined), and the launcher's `+ New terminal` (filled). DESIGN.md: "If
something is filled, it is the one thing to act on."

On this screen the one thing to act on is an agent — and a grid of cards cannot
all be accent, so **the launcher body carries no accent at all.**
`+ New terminal` drops `.accent` and becomes a ghost button beside
`Add starter commands (n)` and `Settings`. The screen's single filled action
stays the tab bar's `+ <first agent>`, which is the button the product is
about. This is a deletion, not an addition.

(`↻ Resume`'s accent outline is pre-existing and out of this cycle's scope.
Named so it is not read as endorsed.)

### 3.3 The notice bar — when the launcher must speak before the click

A PATH result that makes every card likely to fail is a condition that outlives
a toast, so it is a `.notice-bar` (DESIGN.md:346–364) at the top of the launcher
panel, above `.launcher-head`. Existing class, existing 1px `--border-strong`
left stripe, existing `Icon` glyph, existing accent-on-the-one-action rule. No
new tokens, no fade, no colour.

| Probe state | Bar? | Glyph | Copy | Action |
|---|---|---|---|---|
| any `found` | **no bar** | — | — | — |
| all agent commands `missing` | yes | `help` | `Not on your PATH: `<code>claude</code>`, `<code>codex</code>`, `<code>gemini</code>`. A shell alias or function still works — but if a card does nothing, this is why.` | `Agent settings` → opens Settings → Agents |
| all `unknown` | yes | `help` | `DevDeck couldn't read your shell's PATH, so these commands are unchecked. Cards still run; they just weren't verified.` | `Re-check` → re-runs the probe |
| no agent presets configured | **no bar** — the head says it (§3.4) | — | — | — |

Rules that make this honest rather than noisy:

- **Silence is the correct report for a healthy machine.** No "all good" bar.
- **A partial result gets no bar.** If two of three resolved, the per-card marker
  (§4) carries it. A bar for a partial condition is a wolf cry, and by the third
  launch it is furniture.
- **`unknown` never renders as `missing`.** Two different sentences, two
  different actions (`Agent settings` vs `Re-check`), and the `unknown` sentence
  makes no claim about whether anything works. This is the state the author's own
  machine hits, because the antivirus can kill the hydration probe.
- `Re-check` that fails again leaves the same bar standing. It does not fade and
  it does not turn into a `missing` bar — the app still does not know.
- Copy never says "not installed". A PATH walk cannot see an alias or a shell
  function, and telling a user their tool is not installed when it is would be
  the most expensive sentence in the app.

**At 900px** the bar's sentence wraps to three lines and the action button stays
on the first, `flex: none` (existing `.notice-bar` behaviour, and
`styles.css:8486` already has a narrow rule for `.notice-bar-action`). The bar
costs ~54px of the 444px launcher viewport — which is why it appears only in the
two states where the alternative is a stranger clicking into silence.

### 3.4 The zero-presets head

A user who deletes every preset gets an empty grid. Today that is a bare screen
with three buttons and no explanation. Copy, replacing the sub-line:

```
No startup commands configured. Add one in Settings, or open a plain shell.
```

with `Add starter commands (8)` and `Settings` as the two ghost actions. This is
the *absent* case, and it must not look like the *missing* case (§3.3) or the
*unknown* case: no bar, no pills, no stripe — a different sentence in the head.

---

## 4. Surface 3 — the launcher card and Settings → Agents

### 4.1 The probe contract this design assumes

Backend's to build; stated so the UI is not designed against a guess.

```ts
type ProbeState = "found" | "missing" | "unknown"
interface ProbeResult {
    /** The first token of the preset's command, i.e. what was looked up. */
    token: string
    state: ProbeState
    /** Absolute path, only when state === "found". A value → mono, tooltip only. */
    resolved?: string
}
```

Two rules the UI depends on:

- **Only `runMode: "agent"` presets are probed, and only their first token.** A
  normal-mode preset is a shell line — `npm run dev`, `cd api && go run .`,
  a pipe. Probing its first token would report on `npm` or `cd` and tell nobody
  anything, and would mark a working `&&` chain as absent. **Normal-mode cards
  are never marked.** That is a deliberate non-design (§7) and it is what stops
  the probe lying about eight kinds of shell line.
- **`unknown` is a first-class answer, not an error.** A probe that cannot
  resolve the shell PATH returns `unknown` for every preset and the UI renders
  the `unknown` state. It never falls back to `missing`, and it never renders as
  `found`.

### 4.2 Card state — first match wins

Four states. The order matters and is not negotiable: a blank command cannot be
probed, so it is decided before the probe is consulted.

1. `command.trim() === ""` → **no command**
2. probe `unknown` → **unchecked**
3. probe `missing` → **not on PATH**
4. probe `found` → **no marker**

### 4.3 Card form per state

Card anatomy today: `.launch-card-icon` (20px, `--accent`) · `.launch-card-name`
(sans 13px/500, `--text`) · `.launch-card-cmd` (mono 10px, `--faint`).

| State | Icon | Command line | Extra row | Launchable |
|---|---|---|---|---|
| **found** | `--accent` (unchanged) | `claude`, mono `--faint` | none | yes |
| **unchecked** | `--accent` (unchanged) | `claude`, mono `--faint` | `.probe-tag` reading `UNCHECKED` | yes |
| **not on PATH** | **`--faint`** | `claude`, mono `--faint`, **1px dashed `--border` bottom rule** | `.probe-tag.qualified` reading `NOT ON PATH` | **yes** |
| **no command** | `--faint` | `no command set` — **sans, italic, `--faint`** | none | **no** — click opens Settings → Agents |

The four decisions inside that table, and why:

- **The icon losing the accent is the primary marker for `not on PATH`.** Every
  card's icon is accent-coloured, so a faint icon is the odd one out in a grid at
  a glance, with no legend. It is a **lightness** drop rather than a hue change,
  so it survives every colour-vision difference and all 84 skins — both tokens
  exist in every theme. The dashed rule under the command is the second,
  static, non-colour channel; the word in the pill is the third. Three channels,
  no new token.
- **`not on PATH` cards still launch.** This is the load-bearing honesty call. A
  PATH walk cannot see a shell alias or a function, so gating the card would make
  DevDeck refuse to run something that works. The marker is a reading, not a
  gate — which is exactly why the pill says `NOT ON PATH` and not `MISSING`.
- **`no command` cards do not launch,** because there is nothing to run. That is
  a fact, not an inference — the only one of the four states where refusing is
  honest. The click goes to the fix (`openSettings("agents")`) rather than
  nowhere, which is what kills the reported failure. `disabled` is **not** used:
  a disabled button has no click target and cannot route to the fix. Use
  `aria-disabled="true"` plus the `--faint` treatment, and keep the handler.
- **`a.command || a.id` is deleted.** Mono in this system means "this is the
  literal string that will run". `blank1` was not. The replacement is a **sans
  italic phrase**, because there is no value to typeset — the absence of a value
  must not be dressed as one. This single change is the difference between the
  card lying and the card reporting.

`.probe-tag` — new class, no new token, geometry copied from `.mtile-chip`
(`styles.css:705`):

```
.probe-tag {
    align-self: center;                /* the card is a centred column */
    font-size: 10.5px; font-weight: 600; letter-spacing: .04em;
    padding: 1px 7px; border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--faint);
}
.probe-tag.qualified { border-style: dashed; color: var(--muted); }
```

Dashed = "this reading is qualified" is the established idiom in two places
already (`.mtile-chip.tone-warn`, `.usage-run-cost.approx`), and it is the one
form marker in this system that carries meaning with hue switched off entirely.
The mission tile keeps `.mtile-chip`: those are tone-coloured and glyphed at 9px,
a different axis, and merging them would couple two surfaces that answer
different questions.

**Composition with the risk stripe.** `.launch-card-unsafe`
(`styles.css:1720–1729`, a 2px inset `--danger` left stripe for
`--dangerously-skip-permissions`) is **orthogonal to all four states** and
composes with each. A YOLO card that is not on PATH shows the danger stripe *and*
the faint icon *and* the dashed `NOT ON PATH` pill. They answer different
questions — "what will this do to my repo" versus "will this run at all" — and
must not be made to share a marker. Stated because the two are the only colour
spends on a card and someone will otherwise try to resolve the "collision".

**Narrow window.** At 900px a card is 173px. `claude` + `NOT ON PATH` will not
share a line, so `.probe-tag` sits on its **own row below** the command
(`.launch-card` is already `flex-direction: column`), and a marked card grows
~16px. The launcher already overflows by 26px at 900 × 600 with five cards, so
this is a real scroll cost — accepted, because the extra row exists only on the
**unhealthy** card. A healthy launcher does not grow by a pixel.

### 4.4 Settings → Agents

The status belongs on the row it is about — the `Command` field's row in
`.cmd-edit-grid` — right-aligned, `--fs-label`, no pill. Settings is a form; a
pill per row would be eight pills competing with eight inputs.

| State | Mark | Tooltip (`data-tip`) |
|---|---|---|
| found | `on PATH`, `--faint` | the resolved absolute path, mono |
| not on PATH | `not on PATH`, `--muted`, **1px dashed `--border` underline** | `DevDeck looked for `<code>claude</code>` on your PATH and didn't find it. A shell alias or function is invisible to that check — if it runs in your terminal, it will run here.` |
| unchecked | `unchecked`, `--faint` | `DevDeck couldn't read your shell's PATH. Nothing is wrong with this command — it just wasn't verified.` |
| blank command | A line below the card (see below). **No border on the input** — see the ruling | — |
| normal-mode preset | **no mark at all** | — |

Blank-command line, below the card, same slot the existing `.agent-warn` block
uses:

```
This command is blank, so its launcher card can't run anything.
```

Present tense, names the consequence, does not scold.

> **RULED 2026-09-03 — overruled: no border.** The spec originally reused
> `.warn-field` (a 1px `--danger` border) on the command input, on the grounds
> that the precedent already exists in this section (the `OPENAI_API_KEY` field
> on the author's own Codex preset renders it today). Overruled by the owner:
> `DESIGN.md:355` forbids a warning colour, and a blank command is a config
> fault that makes a control inert rather than anything destructive — spending
> `--danger` on "inert" dilutes it where it marks genuinely destructive things.
> **The sentence carries it.** The existing `.warn-field` usage elsewhere in the
> section is left alone; this is not a licence to go remove it, and it is not a
> precedent for adding it.

> **RULED 2026-09-03 — the CTA gap is accepted.** No missing-agent marker goes
> inside the tab bar's accent-filled `+ <agent>` button. No legible
> non-colour marker fits inside a 28px filled pill, and a badge on the primary
> CTA is the surface proliferation this product spent six months undoing. The
> caret menu row and the notice bar carry the state. Recorded as a **conscious
> gap**: a stranger can still click the product's main button and get a shell
> error, and the mitigation is that the probe's state is legible one row away.
> Revisit only if a beta user actually hits it.

Section-level, once, not per row:

- `unknown` for all: one `.settings-hint` line above the list —
  `DevDeck couldn't read your shell's PATH, so none of these were checked.`
- A `Re-check PATH` ghost button added to the existing `.cmd-add-row`. One
  button in a row that already exists; no new surface.
- `found` / partial: no section line. The per-row marks say it.

**At 900px** the settings modal is already `max-width`-constrained and the
`.cmd-edit-grid` collapses to one column at its existing breakpoint. The status
mark moves from right-of-field to a line under the field. No new breakpoint.

---

## 5. Surface 4 — Copy diagnostics

Two placements: the crash cards, and Settings → About.

### 5.1 The sentence that is the whole design

A stranger pasting a diagnostics blob into a stranger's inbox deserves to know
what is in it, in the order that matters to them:

> Copies your DevDeck and OS version, your agent commands and whether each was
> found on your PATH, and the recent app log — file paths and command lines
> included, with API keys and tokens removed. Nothing is sent anywhere; it goes
> to your clipboard.

Every clause is load-bearing:

- **"Copies"** — present tense, says what the control will do.
- **The three contents, named**, in the order a reader cares.
- **"file paths and command lines included"** comes *before* the reassurance. A
  reader who stops halfway must have read the half that costs them.
- **"with API keys and tokens removed"** — says what was taken out. Never
  "sanitised", never "safe", never "anonymous". Redaction is a mechanism, not a
  guarantee, and the copy must not upgrade it into one.
- **"Nothing is sent anywhere; it goes to your clipboard."** The single most
  important sentence for a beta user and the easiest one to leave out.

`--fs-sm`, `--muted`, sitting under the control. No modal, no consent dialog.

### 5.2 On the crash card (`ErrorBoundary`)

Today: `h2` · muted paragraph · `.crash-msg` (mono, `--danger`) · `Try again` +
accent `Reload`. Add exactly one control and one line.

`.crash-actions` becomes `Copy diagnostics` (ghost) · `Try again` (ghost) ·
`Reload` (accent, unchanged). The accent does not move: reloading is still the
one action worth taking. The §5.1 sentence goes below the actions row in
`--faint` `--fs-sm`, with the About-only clause dropped (the crash record carries
no PATH results):

> Copies this error, your DevDeck and OS version, and the recent app log — file
> paths and command lines included, with API keys and tokens removed. Nothing is
> sent anywhere.

**Feedback must be a label swap here, not a toast.** `<Toasts/>` is rendered
inside `<App/>`, which is inside `<ErrorBoundary/>` (`main.tsx`) — on a root
crash the toast layer is not mounted, so `toast()` would confirm nothing. The
button label becomes `Copied` for 2000ms and reverts. On the **region** crash
card (`RegionBoundary`) and in Settings → About, the app is intact and the
existing `toast("Diagnostics copied to the clipboard")` is used instead. This is
a constraint of the component tree, not a style preference.

`RegionBoundary` gets the same button in its single-button actions row, promoted
to two buttons: `Copy diagnostics` (ghost) · `Try again` (ghost). No accent — a
region crash is not the app's one thing to act on while seven other views still
work. Its explanatory line is the same sentence at `--fs-label` `--faint`, one
line shorter: `Copies this error, your versions and the recent log — paths
included, secrets removed. Nothing is sent anywhere.`

### 5.3 The copy control's own three states

A copy button whose failure is silent is the same class of lie this whole cycle
is about.

| State | Form | Copy |
|---|---|---|
| ready | ghost button | `Copy diagnostics` |
| done | label swap 2s (crash) / toast (elsewhere) | `Copied` / `Diagnostics copied to the clipboard` |
| clipboard refused | label swaps to `Couldn't copy`, and a `<pre class="crash-msg" style="user-select:text">` appears below holding the record | `Couldn't reach the clipboard. Select the text below and copy it manually.` |
| record unavailable | button `disabled` (existing `opacity:.4`), sentence replaced | `Diagnostics aren't available — DevDeck couldn't read its own log.` |

The fourth row is the **unknown** state of this surface, and it is why the button
must not be unconditionally enabled: offering to copy nothing, and succeeding, is
worse than refusing. Three states — available, refused, unavailable — three
treatments.

### 5.4 In Settings → About

Verified: the About pane has ~500px of unused vertical space below the update
hint. A new block at the bottom of `.settings-section`, matching the section's
existing shape:

```
Diagnostics

[ Copy diagnostics ]  [ Show what's copied ]

Copies your DevDeck and OS version, your agent commands and whether each was
found on your PATH, and the recent app log — file paths and command lines
included, with API keys and tokens removed. Nothing is sent anywhere; it goes
to your clipboard.
```

`Show what's copied` toggles a `<pre>` with the **actual record**, not a
description of it: `--font-mono`, `--fs-sm`, `--bg-3`, 1px `--border-soft`,
`--radius`, `max-height: 240px`, `overflow: auto`, `user-select: text`. One
`useState`, one `<pre>`, no modal. Showing the record is the only fully honest
answer to "what does this blob contain", and it is cheaper than any paragraph
that tries.

Under the `<pre>`, `--faint` `--fs-label`: `Last 200 log lines. Long values are
truncated.` If the record itself carries a truncation marker, **render it** —
the UI must never hide the fact that the record is partial. Both `h3`-less
heading and button row use existing classes (`.settings-section`,
`.settings-hint`, `.update-row`'s flex shape).

**At 900px** the settings modal already constrains its width; the two buttons
wrap onto two rows and the `<pre>` scrolls horizontally inside itself
(`overflow: auto`), never widening the modal.

---

## 6. Token audit — 84 skins, zero new tokens

Everything above resolves to tokens that exist in all seven themes and are
untouched by all twelve styles:

`--accent` · `--on-accent` · `--text` · `--muted` · `--faint` · `--border` ·
`--border-soft` · `--border-strong` · `--danger` · `--bg-2` · `--bg-3` ·
`--font-mono` · `--fs-title` · `--fs-body` · `--fs-sm` · `--fs-label` ·
`--lh-body` · `--ls-title` · `--sp-xs/sm/md/lg/xl` · `--radius` · `--dur-fast` ·
`--ease` · `--enso-mask`.

New **classes** (not tokens): `.first-run`, `.probe-tag`, `.probe-tag.qualified`.

**No new colour token, and here is what one would have cost.** The tempting
addition is an attention/warning colour for `NOT ON PATH`. In Slate, Sumi, Zen
and Washi the accent *is* amber or clay, so an attention amber would be the same
hue as brand, active and focus — "this command is absent" would be
indistinguishable from "this tab is selected" in four of seven themes, and
`--clay` already sits within a hair of `--accent` in Sumi and Washi
(DESIGN.md:276–281 records that exact collision). Defining it across seven
themes means seven hand-tuned values that must each clear 3:1 against three
grounds, plus twelve style layers that may re-tint it, plus a per-theme
regression whenever a theme is retuned — for a fact that a **lightness drop on
the icon**, a **dashed rule**, and the **word "NOT ON PATH"** already carry with
hue switched off entirely. The form channels are strictly better here, not
merely cheaper.

**Motion:** none added. Every state above is static. The only transition is
`.probe-tag`'s inherited `--dur-fast` border-colour on card hover, already gated
by the global `prefers-reduced-motion` block. Nothing in this spec needs motion
to be readable, which is the test DESIGN.md sets.

---

## 7. What I deliberately did not design

- **A first-run wizard, tour, checklist or progress ring.** Explicitly refused.
  Orca's was 39 files plus an 11-file setup guide, killed as fifty files of chrome
  for a funnel DevDeck does not have. The whole of §2 is one component and one
  guard.
- **A marker inside the tab bar's accent-filled `+ <agent>` button.** If that
  agent is `missing`, the button keeps its label and its accent — it is still the
  thing to do, and there is no legible non-colour marker that fits inside a 28px
  filled pill. The caret menu's row for that agent carries the `not on PATH`
  mark, the tooltip gains a second line, and §3.3's bar covers the only case
  where the click is likely to fail outright. **A conscious gap, not an
  oversight:** a badge on the primary CTA is precisely the surface proliferation
  this product's history warns about. Flag it if you disagree — it is the second
  decision I would like ruled on.
- **Probing normal-mode presets.** §4.1. A shell line is not a binary, and a
  probe that marked `cd api && go run .` as missing would be a signal that lies.
- **Auto-installing, auto-detecting or offering to install an agent CLI.** DevDeck
  reports; it does not acquire. The copy says "you install yourself" precisely so
  the app is never on the hook for a capability it does not have.
- **The SmartScreen warning.** Release and docs, not design.
- **The Mission `SYSTEM` port list.** §1. Removed from first contact by the §2
  route; still questionable on its own terms; a Mission-view question.
- **Sending diagnostics anywhere.** No upload, no issue link, no email template,
  no server. Clipboard is the entire affordance; the beta's feedback path is a
  human channel `field` owns.
- **The phone client.** Separate surface, separate palette, never first contact.

---

## 8. Build order

Each step is independently shippable and independently verifiable.

1. **Deletions** (§1) — `IntroTip`, its CSS, its two `App.tsx` lines, the `❯`,
   the `.accent` on `+ New terminal`, `a.command || a.id`. Nothing depends on the
   probe. Verify: launch with a scratch `userDataDir`, no card prints an id.
2. **`<NoProjects/>` + the route + disabled view keys** (§2.1–2.2) and the
   **switcher's three empty states** (§2.4). The probe line renders its
   `unknown` copy until step 4 lands, which is the honest placeholder.
3. **Copy diagnostics** (§5) — independent of the probe; the About record simply
   omits the PATH block until step 4.
4. **The probe** (§4.1, backend) then the card and Settings marks (§4.2–4.4) and
   the launcher bar (§3.3).

Verification for every step is `run-app` with a scratch `userDataDir`, at both
2079px and 900 × 600, in at least Slate + Modern Pro and **Washi + Bauhaus**
(the light theme this file's own contrast math flags, and the zero-radius style
that will reshape `.probe-tag` into a rectangle).

---

# Acceptance criteria

Written by `po` on 2026-09-03, before implementation, against this spec and the
live tree. **These are the contract this build is ruled against** — `qa` executes
them and `po` rules on the result. `[must]` blocks the build; `[should]` is
reported but does not block.

Ground truth they were written against: the author's real `settings.json` holds
8 presets — 5 `runMode: "agent"` (`claude`, `codex`, `gemini`, `claude-yolo`, and
**`New agent` with `command: ""`**) and 3 `runMode: "normal"` (`dev`, `build`,
`test`). The blank-command preset is real, not hypothetical.

**Out of scope, deliberately:** the *Copy diagnostics* affordance (§5). The
record it copies does not exist yet; it ships with the diagnostics build.

## 1 · The presence probe

| # | Criterion | Verified by | Fails if |
|---|---|---|---|
| 1 | [must] Resolves against the hydrated login-shell PATH, never main's `process.env.PATH` | unit — hydrated PATH holds a fake binary that main's does not, assert `found`; then the inverse, assert `missing` | either direction resolves off `process.env.PATH` |
| 2 | [must] The walk expands `PATHEXT`, not a bare-name stat | unit — a directory holding only `claude.cmd` resolves bare `claude` to `found`, `resolved` ending `.cmd` | only an exact-filename stat exists. **The single most likely real-world false negative** — a global npm install writes `claude.cmd`, nothing named `claude` |
| 3 | [must] Hydration failure answers `unknown` for every preset — never `missing`, never `found` | unit — hydration throws or times out over a list containing a would-be-`found` command | any preset falls back to `found` (a stale cache) or `missing` (treating "couldn't check" as "checked and absent") |
| 4 | [must] Only `runMode: "agent"` presets are probed | unit — probe a mixed list; `dev` gets no entry | `npm` is stat-walked and scored as a binary |
| 5 | [must] Probing never spawns `where`/`which` per call | inspection — no per-token subprocess; hydration spawns once, not once per preset | each preset triggers a child process (privilege-management software gates each spawn) |
| 6 | [should] `found` carries the resolved absolute path; `missing`/`unknown` carry none | unit — `.resolved` is absolute on `found`, `undefined` otherwise | a negative result carries a stale or guessed path the tooltip would render as meaningful |

## 2 · Zero-projects route

| # | Criterion | Verified by | Fails if |
|---|---|---|---|
| 7 | [must] With zero projects, all eight view targets render the same `NoProjects` panel | run-app, scratch profile, empty `projects.json`; screenshot `.main` after each of the eight keys | any view still renders its own empty state — e.g. Mission's `SYSTEM` port wall is reachable |
| 8 | [must] `TerminalView`'s old "No project selected" block is unreachable at zero projects | inspection (deleted per the deletion table) plus the terminal screenshot from #7 | the block survives and is reachable by any path |
| 9 | [must] The eight `.deck-view` keys are disabled, tooltip `Add a project to use the views.`, none active | run-app — assert the attribute and `data-tip` on each; assert no `.deck-view.on` | any key switches `view` at zero projects, or one shows the accent underline |
| 10 | [must] The `NoProjects` probe line renders one of the four documented sentences, and the `unknown` sentence is textually distinct from the `missing` one | run-app (`found`/`missing`/no-presets live; `unknown` via `DEVDECK_FORCE_PATH_UNKNOWN=1`) | the two sentences collapse into one string, or either uses the word "installed" |
| 11 | [must] More than three `found` names truncate to a plain-text `+2 more.`, not a control | run-app with 5 or more resolvable presets | it is a button, or the count is wrong |
| 12 | [must] `Open a project folder` is the panel's only accent element and invokes the real folder dialog | run-app — computed styles over the panel; a click transitions `projects.length` to 1 and routes away | a second accent exists, or the button is inert |

## 3 · Project switcher's three empty states

| # | Criterion | Verified by | Fails if |
|---|---|---|---|
| 13 | [must] Zero projects shows `No projects yet. Add a folder to start.` | run-app, scratch profile, Ctrl+K | it still reads `No matching projects.` |
| 14 | [must] Projects present with a non-matching query shows the query inside a real `code` element | run-app, 8 seeded projects, query `zzzznope` | the query is plain text, or a pasted Windows path widens the modal |
| 15 | [should] The third, currently unreachable branch exists in code | inspection only | only two of the three conditions were implemented |

## 4 · The launcher head

| # | Criterion | Verified by | Fails if |
|---|---|---|---|
| 16 | [must] `+ New terminal` is a ghost button; the tab bar's agent button is the screen's only accent | run-app with terminals open | two accent-filled elements are visible at once (three are today) |
| 17 | [must] The chevron glyph is gone from the launcher heading | inspection / run-app | any glyph remains (DESIGN.md's chrome rule) |
| 18 | [must] The notice bar appears only for all-`missing` or an unhydrated PATH — never partial, never healthy | run-app — one `found` plus one `missing` shows **no** bar; all-nonsense commands shows the bar with `Agent settings` | a bar appears for a mixed result, or is absent for all-missing, or its action is not `Agent settings` |
| 19 | [must] The unhydrated bar's copy and action (`Re-check`) are distinct from the all-`missing` bar's | run-app via the force seam, plus inspection of both branches | both render through one branch, collapsing `unknown` into `missing` visually while the data distinguishes them |
| 20 | [must] Zero presets shows `No startup commands configured. Add one in Settings, or open a plain shell.` with no bar, no pill, no stripe | run-app with `agents: []` | the zero-presets state is indistinguishable from all-`missing`, or from a healthy grid (today's bug) |
| 21 | [must] At 900×600 the bar's action stays on the first wrapped line and nothing scrolls `.main` horizontally | run-app at the documented minimum; `scrollWidth` against the viewport | horizontal scroll appears, or the action drops to its own line |
| 22 | [should] In Washi + Bauhaus the dashed pill and the faint-icon lightness drop stay visible on a light ground | run-app, theme and style switched | the marker is distinguishable only by a hue this theme collapses |

## 5 · Launcher cards — four states, first match wins

| # | Criterion | Verified by | Fails if |
|---|---|---|---|
| 23 | [must] A blank-command card shows `no command set` in sans italic `--faint`, and clicking it opens Settings → Agents without launching | run-app with the real `New agent` preset | it prints the preset id (today's behaviour), or a click opens a pane |
| 24 | [must] That card uses `aria-disabled="true"`, not `disabled`, and its click handler still fires | run-app — attribute inspection plus the navigation in #23 | real `disabled` is used, which makes the fix-it click impossible and reintroduces the failure by another route |
| 25 | [must] A `found` card is unchanged from today — mono `--faint` command, accent icon, no extra row | run-app with a resolvable command | a healthy card grows or changes colour; a healthy launcher does not grow by a pixel |
| 26 | [must] An `unknown` card shows `UNCHECKED`, **keeps the accent icon**, keeps mono, and still launches | unit on the state-selection function, plus run-app via the force seam | it renders identically to `missing`. **Collapsing `unknown` into `missing` is the one failure this entire build exists to prevent** |
| 27 | [must] A `missing` card shows a `--faint` icon, a dashed rule and a `NOT ON PATH` pill — and **still launches** | run-app with command `zzz-not-a-real-cli`; click and confirm a live pane | it refuses to launch, the icon stays accent, or the pill reads `MISSING` |
| 28 | [must] The pill sits on its own row at 900px, and only marked cards grow (~16px) | run-app — compare a `found` card's height to a `missing` one in the same grid | all cards grow, or the pill overlaps the command |
| 29 | [must] The existing unsafe danger stripe composes with the probe markers | run-app — `claude-yolo` pointed at a nonsense command shows stripe **and** faint icon **and** dashed pill | either marker is dropped when the other is present |

## 6 · Settings → Agents

| # | Criterion | Verified by | Fails if |
|---|---|---|---|
| 30 | [must] Each row shows a right-aligned `on PATH` / `not on PATH` / `unchecked` mark; `not on PATH` carries the dashed underline, `unchecked` none | run-app with seeded states | any state uses a pill here, or two states share one treatment |
| 31 | [must] The `not on PATH` tooltip names the alias-or-function caveat and never says "not installed" | run-app — read the tooltip | "installed" appears, or the caveat is dropped |
| 32 | [must] A blank command gets **no** border on the input, and the sentence below it | run-app on the real `New agent` preset | a `--danger` border appears (explicitly overruled), or the sentence is missing or reads "error"/"invalid" |
| 33 | [must] Normal-mode presets show no status mark at all | run-app — the `dev`/`build`/`test` rows | `npm` is probed and marked (criterion 4 at the second surface) |
| 34 | [must] One `Re-check PATH` control; an unhydrated PATH yields exactly one section hint, not one per row | unit on the handler, plus run-app | the hint repeats per row, or the control is missing |
| 35 | [must] At the narrow breakpoint the mark moves under the field, with no new breakpoint added | run-app at the existing single-column collapse | the mark is clipped or overlaps the input |

## 7 · Copy rules, cross-cutting

| # | Criterion | Verified by | Fails if |
|---|---|---|---|
| 36 | [must] No new user-facing string contains the word "installed" | grep over the diff | any new string says "not installed" rather than "not found on your PATH" |
| 37 | [must] Values — commands, resolved paths, queries — are mono or `code`; names — DevDeck, Ctrl+K, Settings — are sans | inspection of the new JSX | a command renders in the same typeface as its sentence, the complaint that motivated the card fix |

## Rejected as unverifiable, and who owns each gap

- **"The `unknown` state renders correctly when the antivirus genuinely kills hydration."** Not reproducible on demand, and provoking it deliberately is worse than the gap. Covered by criterion 3's unit test plus the `DEVDECK_FORCE_PATH_UNKNOWN=1` seam `backend-dev` built for exactly this — which is what promoted criteria 10, 19 and 26 from inspection to real observation. The real-antivirus path stays **unproven** and is labelled so.
- **"A stranger's first five minutes feel calm."** A judgement, not a criterion. Owned by `design-reviewer`, then by `field`'s real users.
- **"The probe never delays the launcher paint."** A measurement with no agreed target, so any pass/fail line would be invented rather than derived. Owned by `performance-analyst`. Measured incidentally: 48 ms first call, 36 ms after, 188 ms on `Re-check`.
- **All 84 theme × style combinations.** Owned by `design-reviewer`. Criterion 22 smoke-checks Washi + Bauhaus only.
- **"The agent button warns before launching a `missing` preset."** Settled as a conscious gap by this file's own ruling; a criterion requiring it would reopen a closed decision.
