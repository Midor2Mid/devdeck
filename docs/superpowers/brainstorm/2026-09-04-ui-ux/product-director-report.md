# Ruling — the UI/UX overhaul

`product-director`, 2026-09-04. Against v0.12.0, branch `main`.

Standing decisions of 2026-09-02 apply: the ambition is **a product with users**; the
next milestone is **5–10 real external users**; zero external validation exists.

**Mid-flight audience ruling, accepted and applied:** when the daily driver and the
newcomer conflict, **DevDeck serves the 5–10 strangers first**, accepting that the
interface gets more verbose for its author. That settles ruling 2 outright and
sharpens ruling 5. It does not settle ruling 3 — and it does not license an overhaul.
Strangers-first is an argument about *which* fixes, not about *how many*. See
"On strangers-first" below, because it is about to be misused.

---

## The headline verdict

**No massive overhaul. Seven deletions, two empty states, one labelling change, one
icon collision, then first contact.**

The brief's own phrase is the thing to price. "Enhance massively" is a motion in the
opposite direction from everything this product has shipped since July. The record is
a **subtraction arc**:

- The left Rail and Sidebar deleted (0.6.0) — `CHANGELOG.md:1346-1348`: *"the biggest
  layout change since launch. The left icon rail and resizable sidebar are gone."*
- The agent bake-off deleted, **-2111 lines** (`.superpowers/removal/race-report.md:135-141`),
  described in `A2-long-arc.md:110-112` as *"the first deletion in the product's entire
  history."*
- The Inbox drawer deleted, **-180 lines** — `CHANGELOG.md:587-591`: *"a fifth
  attention-list carrying its own 'N need you' count, divergent from the others, in an
  app whose worst documented problem was **eleven surfaces answering that one
  question**… nothing replaces it, because nothing needs to."*
- 0.12.0: the keyboard-chord card removed, Mission demoted on first run, three-state
  honesty everywhere.

That arc is the strongest work in the repo and it is the only thing about this product
a competitor is not also doing (`market/A1-market-scan.md:169-172` — *"Actively
deleting surfaces instead of adding them … no competitor's public material describes
doing this — they're all still in the adding phase."*).

**Two facts make a large redesign uninsurable right now**, and neither is in the
brief:

1. **There are no component tests** (`HANDOFF.md:58`).
2. **~99 untyped `window.api` stubs mean renaming an IPC channel leaves every suite
   green** (`HANDOFF.md:90-93`).

So a sweeping UI change in this codebase has no regression net at the component layer
and a silent failure mode at the IPC boundary — in the six weeks before ten strangers
install it. That is not a reason to never redesign. It is a decisive reason not to
redesign *now*, and it is a reason the deletions I order below must be executed with
`qa` grepping for bare channel names, not trusting a green suite.

**Cost of taking my advice:** you give up the satisfying version of this work, and
v0.13's changelog reads mostly as removals. **Cost of ignoring it:** ten users arrive
against an interface with no history, you cannot attribute one word of their feedback
to one change, and you will have bought opinions about an interface invented last week
instead of evidence about the one you spent six months earning.

---

## The claim

DevDeck is for one developer on Windows supervising several coding agents that write
code faster than he can read it. What he does instead today is three agent CLIs in
three Windows Terminal tabs plus whatever tool answers *"did that actually work"* —
because no competitor is structurally able to be a personal instrument rather than a
product. That makes an **authoring** interface unthinkable: the unit here is a unit of
delegated work and the human is a judge of output he did not write, so every surface
must **feed an agent or judge one**, and a pane with no edge to an agent belongs to a
different product.

The last sentence is not mine. It is `market/E3-ade-or-ide.md:253-254`, ruled and never
applied. This document applies it.

---

## Where the evidence agrees

- **The deck was decided as identity, in those words.** The deciding spec,
  `docs/superpowers/specs/2026-07-08-console-deck-shell-design.md:26-31`: *"Replace the
  Rail **and** Sidebar with a bottom **Console Deck** — a live control surface, in the
  spirit of the product's name… The deck expresses what DevDeck *is*: a surface for
  live agent sessions you can watch and switch between."* The same spec, `:22-23`,
  binds the non-goal in the same breath: *"Explicit non-goal (user confirmed): do
  **not** turn the main area into a multi-pane dashboard. One-view-at-a-time is good
  and stays."*
- **Re-ratified twice since.** `1devtool-2026-08-31/T1-verdict.md:136-139`: *"faced with
  'wasted horizontal space' and 'navigation friction', it **deleted the Rail and
  Sidebar**… The product's own answer to this complaint, once already, was subtraction
  toward one full-width view."* And `:244-245`: *"rebuilding it on the right is that
  decision reversed without a reason."* Twenty-two of twenty-three layout candidates
  died in that pass (`:188`).
- **The split-stage refusal is mechanism, not taste.** `ROADMAP.md:482`: `TerminalPane`
  resizes the pty to the pane, so a half-width stage halves `cols`, the agent wraps its
  permission prompt, and `detectApproval`'s `(esc)` and tail-position rules stop
  matching — Approve/Deny vanishes from the tile, the Overview row **and the phone**,
  silently.
- **Honesty is a design token, not a slogan.** `DESIGN.md:350-380` and `DeckStatus.tsx`
  carry three states where a lazier app carries two: `found / not on PATH / unchecked`;
  `N changes / none / ? changes`. 0.12.0 is almost entirely this.
- **One accent, no warning colour, reasoned** (`DESIGN.md:118-128`): the accent *is*
  amber, so an attention amber would be indistinguishable from "this tab is selected".
  State therefore carries **form**.
- **One count per question.** `DeckStatus.tsx` records that the inbox rendered a second
  badge counting the same set 200px away, disagreeing by construction; both now read
  `wantsYou` from `tileState.ts`.
- **Text labels on state glyphs are already the house position** —
  `orca-2026-09-01/R2-verdicts.md:165-167`, recorded as convergence with a competitor
  request, not as new work.

## Where the evidence disagrees

- **`PRODUCT.md` is still the June product, and it is load-bearing.** Line 3 sells *"a
  combination of IDE, Postman, network debugging"*; the validation block (`:18-23`)
  claims validation on the grounds that the author is the user. `ROADMAP.md:34`
  assigned its rewrite to step 8, **which is marked done**, and the file is unchanged.
  A stranger's first document states something false about the exact thing the
  milestone exists to obtain.
- **Four surfaces were ruled to fail the product's own test and all four still ship.**
  `E3-ade-or-ide.md:290-293` names `NetworkPanel`, `ReleaseBoard`, `StandupModal`,
  `DotnetPanel`. A test applied and not acted on is not a test; it is a note. Compare
  `A2-long-arc.md:369`: *"**Until something is deleted, none of these memos is a
  ruling. They are a hobby.**"*
- **Two of them belong to a different product.** `ReleaseBoard` (Dev → UAT → PROD, 282
  lines, holding a permanent icon in `DeckStatus`) and `StandupModal` are **team**
  artifacts. A single-developer cockpit acquired a release pipeline and a standup
  generator, and nobody decided that. This is the everything-app drift already inside
  the app, not a hypothetical.
- **84 skins.** Seven themes (`themes.ts:232-426`) × twelve styles (`themes.ts:511-566`).
  Every UI change must be checked against all of them — that is `design-reviewer`'s
  standing brief. Nobody but the author has ever chosen one. The largest hidden cost in
  the codebase, invisible to every roadmap because it is not a feature.
- **The zero-project screen was fixed and the zero-session screen was not.** 0.12.0
  named the defect precisely — *"'Add or open a project' as low-contrast text in a
  corner."* One step later, `MissionControl.tsx:248-249` reads *"No agent sessions
  running. Start one from the deck (＋) or the command palette."* — muted prose, no
  control, pointing at an icon-only `＋` in a bottom bar. `addProject()`
  (`store.ts:1266-1269`) sets the project active and opens nothing; the default view is
  `mission` (`store.ts:1110`). **A stranger's second minute is undefined.** This is the
  single highest-value fix available and it is not a redesign.
- **A confirmed icon collision, unfixed.** The 2026-08-26 prosecution rejected the
  "thirteen grey glyphs" charge as overstated but upheld two things
  (`audit-2026-08-26/prosecution.md:343-345`): *"three unrelated toolbars
  (`Deck.tsx:44-48`) with no visual separator, and the `play` icon meaning 'Scripts' in
  the deck and 'Run project' in the topbar."* Same glyph, two meanings, one screen —
  verified still true in `ToolCluster.tsx` and `Topbar.tsx`.
- **Discoverability has been an open, quoted complaint for over a year.** `NOTES.md`,
  2026-07-28: *"how to see the template of Claude start template commands?"* followed
  by *"Discoverability still unfixed."* From the one user who already knows the app.
- **`HANDOFF.md` is stale** — it says 0.11.1 is the tip; `main` is seven commits past
  0.12.0. Minor, but it is the file the next session trusts.

---

## The five rulings

### 1. What is the deck?

**The deck is identity. The deck *bar* is implementation.** They are not the same
thing, and the distinction is the whole of what a designer needs from me.

**Identity — off limits:**
- **One main view at a time, full width.** Decided at
  `2026-07-08-console-deck-shell-design.md:22-23`, user-confirmed, re-ratified twice.
- **The live agent population is on screen from every view.** This is the entire
  difference between DevDeck and an IDE with a terminal drawer: in an IDE the agents
  disappear when you open a file; here they cannot.
- **Project strips group that population by project**, because a project is the unit of
  context (`PRODUCT.md:14`) — the one line of `PRODUCT.md` that survives the pivot.

**Implementation — free:**
- That it is a bar, that it is at the bottom, its height, its two-row split, the order
  of strips / keys / tools / status, its behaviour at 1280px, whether the tool cluster
  is a cluster at all.

A proposal that moves or restyles the deck is arguable on its merits. A proposal that
lets you stop seeing your agents while you read a file is a different product.
A proposal that shows two main views at once is refused on mechanism.

**The reopening trigger already exists and I am not lowering it**
(`T1-verdict.md:363-383`): a **verbatim user complaint in `NOTES.md`**, plus
`detectApproval` becoming width-independent. Note what that means now — the beta is
precisely the machine that could produce that verbatim complaint. So: do not redesign
the deck before step 9; it is the one surface step 9 might legitimately unlock.

### 2. Icon-only vs icon+label

**Icon + label on the view keys. Permanently. No setting to turn it off.**

The audience ruling settles this, and the evidence already pointed the same way.
"Professional tool, for someone who lives here" is a claim about a user who does not
exist — nobody outside this machine has opened this app. Icon-only bets that the user
already knows the vocabulary; the product has zero evidence anyone does, and one
year-old verbatim complaint that its own author did not. A tooltip is not
discoverability: it answers a question you already knew to ask.

**Does the answer change after the first ten users? No — and that is the point of
ruling now.** An affordance you plan to remove after the beta is an affordance the beta
cannot evaluate. Ship the real interface to the real strangers.

Three constraints on `designer`:
- **The tool cluster stays icon-only.** Navigation earns words; the overflow does not.
  Five icons whose destinations are named elsewhere are not what a stranger is lost in.
- **The active-state form must survive.** Today `.deck-view-name` is `display:none`
  except on `.on` (`styles.css:7924-7932`) — the label *is* the active marker. Labelled
  everywhere, active state must carry its distinction in the document-tab underline it
  already has (`DESIGN.md:241`). State in form, not colour alone, still holds.
- **The `play` collision is fixed in the same change** — one glyph may not mean
  "Scripts" on the deck and "Run project" on the topbar.

Horizontal cost is real and is paid for by ruling 3: after the Network cut there are
**seven** keys, not eight.

**Falsifier:** if three of the first ten call the labels noise, revisit. Do not
pre-empt that with a toggle. A toggle is the absence of a decision, and Warp is the
cautionary tale — `1devtool-2026-08-31/R1-competitor.md:204-207`: *"**That is the
all-in-one endgame: you don't get to delete the panes, you get a settings page for
hiding them.**"*

### 3. The everything-app test — what gets killed

The test is `E3-ade-or-ide.md:253-254`. Applied honestly it costs six surfaces, one
section, and the skin matrix. This is the deliverable.

**Cut — delete, not hide:**

| Surface | Size | Why it fails | Whose it is instead |
|---|---|---|---|
| **Network view** — `NetworkPanel.tsx` + `main/proxy.ts` + Settings → Proxy | 367 + 346 | A general-purpose forward proxy for arbitrary client traffic. No agent edge. Named at `E3:290-293`. *(Keep `browserNet.ts` — it feeds the `→ Agent` payload and passes the test.)* | Fiddler, mitmproxy, browser devtools |
| **ReleaseBoard** + its permanent `DeckStatus` icon | 282 | A deployment tracker, and a **team** artifact in a single-developer cockpit | GitHub Environments, the CI system, Jira |
| **StandupModal** | 119 | Generates a standup. A single-developer cockpit does not have a standup | The team's standup, which is not a product |
| **DotnetPanel** | 148 | Jumps to `file:line` — i.e. helps you *author* (`E3:290-293`). Also stack-specific in a stack-agnostic product | Visual Studio |
| **RecordingsModal** + terminal record/replay | 270 | Buried under a `⋯` overflow, never promoted, no agent edge | asciinema |
| **Canvas terminal layout** — `CanvasView.tsx` + connectors + pan/zoom + persisted positions | 210+ | A third layout doing what Grid does, carrying drag positions, zoom and SVG connectors. Two layouts is a choice; three is a hobby | — |

**Hide — real content, wrong prominence:**

- **Mission's SYSTEM section** (Docker + listening ports, `MissionControl.tsx:469-489`).
  Ambient machine state, no agent edge, and already identified in the first-contact
  spec as *"the least relevant object in the product"* on the stranger's first screen
  (`2026-09-03-first-contact-design.md:21-45`). It is the exact re-entry `E3:409-411`
  warns about: *"the eleven-surfaces problem returns the moment a pane can justify
  itself by being useful rather than by touching an agent"* — and useful is an argument
  every feature wins.

**Cut — the one nobody will propose, and the one that pays back most:**

- **84 skins → 6.** Keep **Slate** (default dark), **Washi** (light), **Sumi** (the
  wabi-sabi original, the stated north star) × **Modern Pro** and **Wabi-sabi**.
  Delete Graphite, Zen, Aurora, Neo; delete Minimal, Neon, Flat, Bauhaus, CRT, Lacquer,
  Modern+, Aurora Glass, Neo Holographic, Kinetic Minimal.
  **This is the deletion that makes every subsequent UI change roughly an order of
  magnitude cheaper to verify** — and the next six months are UI change and beta
  reports. It also materially shrinks an 8,716-line `styles.css`.
  **What it gives up:** shipped work from M21 and M26, and a "look how customisable"
  pitch nobody has ever heard. It is reversible; the CSS is in git. Do not replace it
  with a "more themes coming" note.

**Explicitly NOT cut, so nobody re-litigates:** API, Database, Browser, Editor stay.
They are the *"did the agent's change actually work"* instruments and each carries a
`→ Agent` edge (`E3:263-266`). The Editor stays demoted — a reader and a diff surface,
never a language server, debugger, refactoring engine or Git GUI (`E3:312-314`).

**Net effect on the frame:** eight view keys → **seven**; three terminal layouts →
**two**; fifteen settings sections → **thirteen**; twenty overlays → **sixteen**;
eighty-four skins → **six**.

**Execution risk, priced:** with no component tests and ~99 untyped `window.api`
stubs, deleting the proxy's IPC channels will not fail a single test. `qa` greps for
bare channel names and drives the built app; a green suite proves nothing here. This
is the same lesson `@xterm/xterm` taught during the dependency audit — *"Read the hits;
do not trust the count."*

### 4. What must not change

The fixed points. A proposal from `designer`, `docs-writer` or `qa` that violates one
of these is refused without discussion of its merits.

1. **One main view at a time, full width.** No split, docked or multi-pane stage.
   Mechanism, not taste: pty `cols` → prompt wrapping → `detectApproval` → Approve/Deny
   vanishes from the tile, Overview **and the phone**, silently.
2. **The agent population is visible from every view.**
3. **One accent per screen. No warning colour, ever.** Attention carries a form marker
   (flag, `!`, dot, stripe) and may use accent only in addition.
4. **Three states where there are three, never two.** Absent, unknown and zero are
   different things. Nothing on screen may claim knowledge the app does not have.
5. **One count per question.** `wantsYou` in `tileState.ts` is the only computation of
   "who needs me". No second badge, ever again.
6. **Nothing is transmitted.** Diagnostics go to the clipboard; no endpoint, no upload,
   no telemetry. A UI overhaul is exactly when someone proposes onboarding analytics or
   a "help us improve" prompt. Refused in advance.
7. **One inline-SVG line icon set. No emoji or Unicode glyphs in chrome** — and no
   glyph carries two meanings.
8. **A project is the unit of context.** Every panel snaps to the active project.

### 5. Sequencing against the milestone

Each item passes one test: *does this get a stranger closer to running DevDeck and
saying something back?*

**Before first contact (ROADMAP step 9), in order:**

1. **Execute the kill list** — six surfaces, Mission's SYSTEM section, 84 skins → 6.
   Owner: `pm` sequences, `frontend-dev` + `backend-dev` cut, `qa` verifies by grep and
   by driving the built app.
   **Unblocks:** everything below is cheaper, and it removes ~6 of the 17 unguarded
   overlays item 4 would otherwise have to wrap. **This goes first** — polishing a
   surface you are about to delete is the only genuinely wasted work available here.
2. **The second empty state.** A project with zero sessions must present one accent
   control that starts an agent, on the screen the user actually lands on
   (`store.ts:1110` → `mission`), replacing `MissionControl.tsx:248-249`'s muted prose
   pointing at an icon. Owner: `designer` → `frontend-dev` → `design-reviewer`.
   **Unblocks:** a stranger reaching a running agent at all. Without this, step 9
   produces ten people who never saw the product.
3. **Labels on the (now seven) view keys**, tool cluster unchanged, active state moved
   fully onto the underline, and the `play`-icon collision fixed. Owner: `designer` →
   `frontend-dev` → `design-reviewer`. **Unblocks:** navigating without hovering.
4. **Error boundaries on the remaining overlays.** `WorktreesModal` is confirmed
   reachable and blanks the window (`ROADMAP.md:70-75`). A stranger who whitescreens on
   day one gives you an uninstall, not evidence. Owner: `frontend-dev` /
   `technical-director`.
5. **Rewrite `PRODUCT.md`.** Step 8 claimed this and did not do it. Owner: `docs-writer`
   / `product-director`. **Unblocks:** the public flip not shipping a false claim on the
   front page.
6. Roadmap steps 4, 6, 7 (public flip + SignPath, CI signing, the physical-phone check)
   proceed unchanged. Nothing here reorders them.

**Deferred, marked, with triggers:**

- **Any redesign of the deck's geometry.** *Deferred* — you would be redesigning a shell
  one person has ever used, and the existing reopening trigger
  (`T1-verdict.md:363-383`) requires a verbatim `NOTES.md` complaint that only the beta
  can produce. Trigger: five recorded first sessions.
- **The new-project → new-terminal mechanics.** The user asked about this directly, so
  the refusal is explicit: `+ Add folder` is already a labelled button
  (`ProjectSwitcher.tsx:163`), and starting an agent is already one click (deck `＋` →
  picker) or one chord (`Ctrl+Shift+Enter`). The only defect I can *prove* today is the
  empty state at item 2. Changing the mechanics before watching someone fail at them is
  guessing. Trigger: two of the first five hesitate. *Deferred.*
- **Starter-command / template discoverability.** The house rule
  (`A1-near-term.md:435-460`) is *"promote if it is asked a second time. Once is a
  question; twice is a defect."* It has been asked once. Strangers-first does not
  retroactively make it twice. *Deferred to step 9* — where it is one of the specific
  things `field` should watch for.
- **All motion, theme and style work.** *Deferred.* Not one item on the path to ten
  users is a motion item, and the skin cut runs the other way.
- **Tasks board / pipelines UI.** Passes the test; no stranger reaches it in a first
  session. *Deferred.*
- **Onboarding tours, tips, feature walls.** *Refused, not deferred.* See below.
- **Everything on `ROADMAP.md:104-110`** stands unchanged. A UI overhaul does not
  reopen it.

---

## On strangers-first, and how it is about to be misused

The user's ruling is right and I am applying it. But it will be quoted this week to
justify two things it does not say, so I am closing both now.

**It does not license onboarding chrome.** "Serve the stranger" means *the product* is
legible on its own. A tour is a second product that explains an illegible first one,
drifts out of sync with it on every change, and — decisively — is what gets built
*instead of* fixing `MissionControl.tsx:248-249`. Orca carries 93 + 22 + 24 files of
tours, tips and feature walls plus a nag to star its repo
(`E1-orca-inventory.md:50-52`), characterised there as *"in-app marketing/onboarding
chrome, not product features"*, and its own inventory concludes *"the friction is
setup/discoverability, not capability"* (`:146`). Refused.

**It does not license a bigger surface.** The opposite: a stranger meets every surface
at once, with none of the author's context about which ones matter. Thirteen settings
sections, three terminal layouts, eight views and 84 skins are a worse first impression
than seven views and two layouts, not a richer one. **Strangers-first is the strongest
argument for the kill list in this document**, and the audience ruling therefore
strengthens the "targeted fixes plus real evidence" conclusion rather than weakening
it. It changes *which* fixes — labels over icons, the empty state over the geometry —
not *how many*.

---

## Under pressure

The three most attractive things "enhance massively" will produce, and what each
silently commits the product to.

1. **A richer stage — multi-pane, docked panels, a dashboard.** The natural reading of
   "massive". It commits DevDeck to being an IDE, and it breaks approval detection by
   mechanism, invisibly, including on the phone. Orca shipped an agent map and then
   **deleted it** (PR #15853, v1.4.190) *"to simplify the dashboard UI and reduce
   maintenance overhead"* (`ROADMAP.md:479`), and its own users then filed #15573/#16885
   asking for a kanban that already existed. Adopting the frame a better-resourced
   competitor abandoned is inheriting its roadmap.
2. **Onboarding chrome.** Enormously tempting the week before a beta, and now
   rhetorically armed by "strangers first". Closed above.
3. **A setting for each ruling in this document** — icon-only vs labels, density, which
   views appear. The quiet one: it reads as generosity and it is the refusal to decide.
   It commits the product to a configuration matrix stacked on a skin matrix, converts
   every future design ruling into a preference nobody defends, and is exactly how 84
   skins happened. `A2-long-arc.md:282` already holds the line one level up: *"the day
   DevDeck's Settings needs a search box, the correct response is deletion, not
   search."*

---

## On the name

Not asked; I am ruling because the window is closing. **DevDeck stands, and this is the
wrong month to reconsider it.** The rename bill — `package.json`, the NSIS per-user
install directory, the Start Menu shortcut, the certificate subject, `latest.yml`'s
updater feed, the GitHub repo URL, eight published releases — is about to be paid in
the other direction: roadmap step 4 files a SignPath application whose certificate
subject names this product, and step 6 wires it into CI. A rename after that
invalidates the cert subject and orphans the update path from 0.12.0 for every early
user. On the criteria: it says what it is in two words, survives being spelled once,
and I found no colliding developer tool — though I checked only the competitive corpus
in `.superpowers/market/`, not a registry or a trademark database, and that check is
owed before the public flip. Reopen only if that search finds a real collision.

Related and already settled: **do not adopt the word "ADE"** (`E3:341-343`) — *"It is
Orca's category name. Using it invites the comparison table, and a comparison table is
a market frame imported into a product with no market. Say 'supervision cockpit,' or
say nothing."*

---

## What would prove me wrong

Two observations, either of which overturns this ruling:

1. **Three of the first five users, unprompted, ask where a cut surface went** —
   specifically Network or Canvas. That would mean the surface inventory was never the
   problem, the "feed or judge an agent" test is too narrow, and the identity claim is
   wrong rather than merely unapplied.
2. **The first five reach a running agent in under two minutes against the *current*
   empty states.** That would mean the first-run work I ordered first was not the
   blocker, the deck is far more legible to a stranger than I am crediting, and the
   pre-beta budget should have gone to the redesign after all.

If neither happens, the ruling holds, and the question this brainstorm actually wants
answered — *what should we redesign* — gets answered by ten strangers instead of by
four agents.
