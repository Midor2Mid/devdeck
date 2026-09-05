# Changelog

## 0.13.0 - 2026-09-05

The release that removes things. Six surfaces, 78 of the 84 skins, and one crash
that made the app unopenable. There is no new panel here; the largest single
change is a subtraction, and each section says what the thing cost to keep.

It is also the first build since **0.10.0** that anything outside this machine
could install. `0.11.0`, `0.11.1` and `0.12.0` were tagged and never published, so
one installer carries four versions — their entries are directly below this one
and are not repeated here.

### A project whose folder had moved took the app down, and kept it down

The worst defect this codebase has shipped. Opening a terminal in a project whose
folder had been moved, renamed or unmounted killed the main process — and the tab
that did it was persisted, so every later launch died before the UI loaded. The
only way back was to hand-edit files under `userData`. Three faults, fixed at
three levels.

- **The throw.** node-pty's Windows agent raises error 267 for a bad `cwd` from
  inside `_completePtyConnection`, and it does it *asynchronously* — so `pty.ts`'s
  try/catch, which exists for the synchronous missing-shell throw, never saw it and
  the throw reached Electron's fatal main-process dialog. The directory is checked
  before anything is spawned, and the failure is reported through the same corpse
  notice and exit event a real process death uses, naming the folder rather than
  sending you to fix a shell that is fine.
- **The trap.** A tab that never started was written to `workspace.json` like any
  other tab, so the next launch restored it and retried the same doomed spawn. That
  is what turned one crash into a permanent one. `pty:exit` now carries whether
  anything was actually started, and **only never-started panes are dropped** — a
  shell you ran and exited still comes back, because restoring the arrangement is
  the feature and a tab that did its job is not one that never opened. The
  un-persist writes immediately instead of through the usual debounce, since the
  failure it guards against is exactly the one where the app does not survive to
  flush a timer.
- **The backstop.** An uncaught throw anywhere in main used to produce Electron's
  "A JavaScript error occurred in the main process" — a sentence that names no
  cause, offers no action, and leaves nothing on disk. It is now written into the
  diagnostics record 0.12.0 added, and the app quits *through* the same teardown a
  normal quit runs, so pty trees, sqlite handles and the WS server are closed. It
  quits rather than continuing on purpose: nearly every store in main is
  load-mutate-save, and a throw between the mutate and the save followed by a later
  successful save writes a half-mutated object over a good file — the
  workspace-destroying failure this codebase already survived once. An unhandled
  promise rejection is recorded and is **not** fatal; registering that listener does
  suppress Node's default of re-raising it as an uncaught exception, which is a real
  behaviour change and is only defensible because the record makes the failure
  visible instead of silent. The dialog path itself is not proven — forcing a real
  main-process throw was not done.

### Six surfaces and 78 skins are gone, and that is the feature

Every UI change had to be verified against the skin matrix, and **84 combinations
is what made each one expensive**: a label change in this same round overflowed the
app's own minimum window in one style, and nothing short of measuring all twelve
would have found it. That cost was paid on every change, forever, for combinations
nobody has ever selected. The same argument, in a different currency, applies to
each deleted surface: it is code that has to keep working, in a file somebody has
to read, for a job something else already does.

- **84 skins → 6.** Slate (default), Washi (light) and Sumi — the stated wabi-sabi
  north star — across Modern Pro and Wabi-sabi. Ten styles and four themes deleted,
  Aurora Glass, Neo Holographic and Kinetic Minimal among them; a recorded
  product-identity candidate named those three, the conflict was put on the table
  first, and the cut was made anyway. It is reversible — the CSS is in git. A
  `settings.json` naming a deleted skin falls back to the default instead of
  rendering an unstyled window, and it falls back in the **loaded state**, not only
  at apply time: resolving at apply alone was tried and was not enough, because the
  store kept the dead id, so the window painted as Slate while the Appearance picker
  showed nothing selected and every other reader — the Monaco theme, the xterm
  palette, the accent Reset button — indexed `undefined`. Your accent survives the
  migration; it is a choice that outlives the theme it was defaulted from.
  `styles.css` went 8,716 → 7,081 lines.
- **The Network view and the local capture proxy.** A general-purpose forward proxy
  for arbitrary client traffic, with no agent edge — Fiddler, mitmproxy and browser
  devtools own that job. An earlier audit had already ruled it a failure of the
  product's own test and it shipped anyway. Deck view keys: **eight → seven**.
- **`Settings → Corporate proxy` was not removed and is not affected.** Three
  modules in this repo have "proxy" in the name, and an earlier kill list treated
  two of them as one feature. What survives, unchanged: the upstream corporate proxy
  applied to every child DevDeck spawns so `npm`, `git` and `dotnet` work behind a
  firewall (plus `NODE_EXTRA_CA_CERTS`), and the browser's own request capture, which
  feeds the → Agent payload and the MCP tools. Both were verified still answering in
  the built app after the deletion.
- **ReleaseBoard.** A deployment tracker, and a team artifact, in a single-developer
  cockpit; GitHub Environments and the CI system own it. It also held a permanent
  seat in the deck's status region, which is the scarcest chrome in the app. Its five
  `release:*` IPC handlers went with it, because a live channel no code can reach is
  worse than the component was.
- **StandupModal.** It generates a standup. A single developer does not have one, and
  a team's standup is not a product feature. The git-log-scraping worklog stack behind
  it was deleted too, since the modal was its only consumer.
- **DotnetPanel**, and `Ctrl+Shift+B` with it — including the palette entry and the
  terminal's own key-swallow list, which would otherwise have eaten the chord and done
  nothing. It jumps to file:line, i.e. it helps you author, which is Visual Studio's
  job, and it was stack-specific in a stack-agnostic product. The .NET review lens and
  `dotnet` project detection are unrelated and stay.
- **Terminal recording** and its modal. Buried under an overflow menu, never promoted,
  no agent edge; asciinema owns this. The run **ledger** also "records" and is
  untouched — it prices real tokens from agent transcripts and is load-bearing.
- **The Canvas terminal layout.** A third layout doing what Grid does, carrying drag
  positions, zoom and SVG connectors. Two layouts is a choice; three is a hobby. A
  `workspace.json` naming `canvas` now opens on Grid, through a real migration
  function rather than a `??` default — the old code read the key back with no
  validation at all, so a saved `canvas` matched no branch in the view and the stage
  rendered nothing.

### The path a stranger walks now has labels on it

- **All seven deck keys carry their name.** Only the active view's key had a label,
  which spent the label on the one view whose identity you already knew. Four
  independent audits arrived here by four routes; one of them counted that **14 of
  22 first-run instructions existed only to name an unlabelled control**. The
  minimum window size did not have to move: measured in the running app across all
  six surviving skins, the labelled key row is 590.45px — the same number in every
  one — and row plus tools plus bar chrome is 782.45px against the ~886px of CSS
  width a 900px window actually gives the page. What 900px does cost is the status
  region, so one measured collapse at 959px drops the verify group's labels and
  keeps the supervision three.
- **A view key that is off can now say so.** On first run all seven were `disabled`,
  and Chromium dispatches no mouse *or* focus events from a disabled button — so
  those seven glyphs could not be named by hovering, by Tab, or by a screen reader,
  at the first moment of the product, on the one screen where nothing else had taught
  you what they were. They take `aria-disabled` instead: focusable, hoverable, still
  announced as unavailable, with a permanent label and a per-key tip in both states
  ("API — open a project to use the views"). The hover brightening is withdrawn,
  because a control that lights up under the cursor is claiming it will do something.
  `Ctrl+1..N` used to bypass the disabled state entirely, moving the breadcrumb to a
  view the app was not showing; the keys and the chord now read one predicate.
- **An application menu, with `Ctrl+O`, and a menu bar you can see.** `src/main`
  never imported `Menu`, so Electron installed its own default and `Ctrl+O` — the
  first thing a Windows user tries — was a dead end. File → Open folder… /
  Switch Project… / Open Recent / Exit; Help → Keyboard Shortcuts / About DevDeck.
  The bar is **not** hidden until Alt: ~20px of chrome for an affordance every
  Windows user already knows, and a menu you have to know about defeats the point of
  adding one. Open Recent needed a command channel from main to the renderer that did
  not exist — the recency order lives in the renderer, while `projects.json` knows
  only when a project was *added*, so a submenu built in main would have been in the
  wrong order while calling itself Recent.
- **One verb for one act: `Open folder…`** Five labels shipped for the same thing —
  "Open a project folder", "+ Add folder", "Add project…", "Add or open a project"
  and the OS dialog's own title — and the deck's did neither, opening the switcher
  and putting the folder dialog three hops from the control that named it. Adding a
  project always activated it; only the interface pretended there was a distinction.
- **The folder drop that had animated for two major Electron versions now works.**
  The switcher read `File.path` on drop. Electron removed that property in 32 and
  this app is on 43, so the read was `undefined`, the guard under it was always
  false, and `webUtils` was absent from the preload entirely. The dashed accent
  outline lit up on drag and the drop did nothing — a promised feature failing
  quietly, which is worse than not having one. The target also moved to the app root
  so it works with the picker closed, which was the point: the old target was the
  switcher backdrop, so dropping a folder meant first opening the picker you were
  trying to avoid. Three outcomes, not two — a folder; a definite file ("That's a
  file, not a folder. DevDeck opens folders."); and anything else ("DevDeck couldn't
  open that.", which claims no cause). The classifier has 8 unit tests. **The drop
  gesture itself cannot be simulated by this project's harness**, so the wiring is
  tested and the gesture is not.
- **A folder that is not there is attributed to the folder.** No path validation
  existed anywhere, so a project whose folder had moved, been renamed or been
  unmounted rendered as perfectly healthy — and three separate features then blamed
  whatever you clicked next. A probe answers in three states, reusing the
  command-presence grammar 0.12.0 introduced rather than inventing a second
  vocabulary for the same idea: **ok** (nothing on screen — a healthy project does
  not grow by a pixel), **missing** (the OS answered and said not-there: the chip
  desaturates, the path takes the dashed qualified rule, and a `FOLDER MISSING` tag
  appears), and **unchecked** (the stat failed or timed out: full colour, solid pill
  — nothing about the project is qualified, only our knowledge of it). The active
  project also gets a notice bar naming the folder, with `Locate…` on the accent and
  `Remove from DevDeck` secondary — never "deleted", which DevDeck cannot know.
  Locate re-points the project keeping its id, so its tabs, remembered view and saved
  layouts survive. **A marker is not a gate:** a missing project still activates and
  still opens a terminal, because a path can come back. The poll is deliberately not
  gated on whether the window is visible — what a project *is* cannot depend on
  whether anyone was looking.
- **A pane says which process it is waiting for.** Between the click and the first
  byte a pane was an unlabelled black rectangle for a measured 4s (shell) and 12s
  (agent) — identical to a spawn that had hung. It now renders one muted line,
  "Starting Claude…", becoming "Still starting Claude…" after 5s. No spinner, so it
  reads the same under `prefers-reduced-motion` and never implies progress nothing is
  measuring. It is armed *after* the spawn is accepted, so a refused spawn never
  claims to be starting anything, and it is never armed for a pane that mounted onto
  an already-dead session.
- **A new project opens on Terminal, not Mission.** The launcher is the only screen
  that answers all three of a stranger's questions — what is this for, what do I
  press, what could go wrong — and it was three steps and a guess away. A returning
  project keeps its remembered view; this changes first contact only.
- **Mission's empty AGENTS section gets a control, not a signpost.** It was muted
  prose pointing at an icon-only plus on the deck and at "the command palette",
  neither of which a stranger can name. Three states, because there are three: a
  project with an agent command gets the act; a project with none gets the place to
  configure one, because DevDeck runs CLIs you install and "start an agent" would be
  a button that cannot keep its word; with no active project there is no directory to
  spawn into, so nothing is offered rather than a control that no-ops.
- **The ports wall a stranger landed on is collapsed.** Eighteen port pills belonging
  to Steam and SQL Server were the loudest object on the first project screen, under
  a heading that read `SYSTEM` — a name for an internal concept rather than for what
  the list is.
- **Ten modals are behind their own error boundaries.** Worktrees, Changes, Commands,
  ExtendAgent, Import, Pr, ProjectEnv, ProjectIdentity, Search and Shortcuts had
  none, so a throw in any of them blanked the whole renderer — which leaves ptys
  running in main with nothing able to see or answer them. Each card gets overlay
  placement and its own Close control, because a crashed modal takes its own Escape
  handler and close button down with it.
- **One keyboard reference instead of two that disagreed.** Settings → Shortcuts and
  the F1 overlay each kept a hand-written list. Settings had 10 of 27 bindings and
  still called `Ctrl+Shift+Enter` a "New Claude session" when the chord starts a
  preset that may be Codex or Gemini; the overlay labelled `Ctrl+Shift+J` "Agents
  inbox", a drawer deleted two releases ago. Both now read one module, and a test
  pins each documented chord to the guard that makes it real **in both directions** —
  forward catches a reference promising a keystroke that does nothing, reverse
  catches the app growing a keystroke the reference never learned about.

### Controls that did something riskier than their words admitted

- **`Claude YOLO` is now `Claude (no permission prompts)`.** It runs
  `claude --dangerously-skip-permissions` — the agent edits and runs anything in the
  project without asking — and the only marking was a 2px stripe and a hover tooltip.
  The rename reaches fresh installs and "Add recommended" only, because presets are
  persisted and overwriting a name you may have chosen would be worse. The durable
  marking is derived from the **command** at render time, so a hand-rolled preset —
  or a saved one still carrying the old name — is marked too: a `SKIPS PROMPTS` label
  on the launcher card, and a `BYPASS` badge.
- **Dispatching a task no longer creates a git worktree by default.** The checkbox
  said "worktree", lowercase and unexplained, and was checked, so every dispatch
  silently made a worktree in a sibling folder. It now reads "Give the agent its own
  worktree" and starts off.
- **A double-click no longer starts two paid agent sessions.** The launch card and
  the tab bar's `+ <agent>` are single-click controls and Windows delivers a
  double-click as two clicks, so two sessions started — for an agent that is two paid
  CLI processes, which is what makes it money rather than cosmetic. A guard at the
  click sites, keyed on the OS double-click threshold rather than a rate limit, so a
  second session a moment later is a real intent and still works. It is deliberately
  **not** in `newTab`: that seam looks tidier and is wrong, because restoring a saved
  layout creates several shells in a burst all carrying the same id, and a guard
  there would silently drop every one after the first.
- **Deny meant something different on a phone than at a desk.** At 46 terminal
  columns — about what the phone client's own fit resizes the host pty to on a 390px
  screen — Deny silently stopped sending Esc and started sending the digit of the
  "No" option. Esc rejects and returns; that digit is *"No, and tell Claude what to
  do differently"*, a different thing to do to a live agent, under the same button,
  with nothing on screen saying it had changed. The cause was not the resize: a
  terminal hard-wraps a long option, the `(esc)` marker lands on a continuation line
  matching no option, and the option reads as truncated. Each option is now re-joined
  with the lines it wrapped onto before the marker is looked for. The new test asserts
  the property that was violated — Deny resolves to the same keystroke at all eight
  tested widths, because whatever Deny means it must not depend on how wide the
  terminal happens to be.

### Fixed

- **An unreadable `projects.json` no longer looks like a fresh install.** Main
  latches `unreadable` when the file exists but cannot be read, and then refuses to
  save over a store it could not read — so every project action was a silent no-op
  for the session and the list came back empty. That rendered as *"you have no
  projects"*, with no recovery and no explanation, in the first five minutes. The
  reason no renderer code read the flag is that the preload's type never declared it:
  the value crossed the bridge and the type said it did not exist, so there was
  nothing to notice. It is declared now, a notice bar names the file, and the copy
  says the projects are not lost — because they are not; DevDeck just cannot see them.
- **Mission and the review queue stop reporting a clean tree for a folder that is
  gone.** `gitStatus` already answered honestly in all four cases — a count, `0` for
  a folder that resolves but is not a repo, and `null` when the count is unknown —
  but both consumers wrote `isRepo ? changes : 0`, and a missing folder is *also*
  `isRepo: false`, so the ternary threw the `null` away. Deeper down, the git probe
  itself resolved `changes: 0` for a directory that does not exist: zero is a claim
  about a working tree, and there was no working tree to make it about.
- **The Run button stops naming a cause nobody could read.** For a folder that is
  gone it said "No runnable project type detected" — a claim about contents nobody
  could read — and because Chromium dispatches nothing from a `disabled` button, the
  sentence explaining why Run was off could not be reached by hover, Tab or a screen
  reader. It now says "This project's folder isn't there right now.", for `missing`
  only, on an `aria-disabled` control.
- **A failed spawn's notice was printed twice.** The notice is written during create
  and emitted live to every window and remote client; the create handler then replayed
  the session buffer unconditionally, so the pane showed the same two lines twice. The
  replay is now gated on a session that existed before the call.
- **Five defects on the phone approve/deny card**, found by driving the real client in
  Chrome device emulation at five phone viewports. The one that matters: in landscape
  the terminal canvas painted 114px of output over the card's question and raw excerpt
  while Approve and Deny stayed tappable — you could answer a prompt you could not
  read. Then: a tap the server never answered left both buttons disabled forever with
  nothing said, and a socket that dropped mid-tap left the reconnected card
  unanswerable; there is now a sticky "Sending" note, a 10s release reading "Response
  unconfirmed", a release on close, and a refusal rather than a dead card when the
  socket is shut. Re-enabling is safe because main's once-only rule means a second tap
  on the same decision can never reach the agent. The header's content was a fixed
  431px against a 320–390px viewport, so every portrait phone scrolled sideways and
  "disconnected — retrying" sat off the right edge — the one thing that explains a tap
  that did nothing. And the raw excerpt opened at its *oldest* line, hiding the
  `(esc)` option Deny actually sends. A new test compiles the client's HTML under
  `node:vm`: it is a template literal, so `tsc` does not parse it, the build does not
  parse it, and nothing loaded it — a syntax error in the phone client would ship
  green and surface only on a phone.
- **Resume is no longer offered where it cannot work.** It is hidden until a session
  running that same command has existed in this project, because `--continue`
  reattaches to what the CLI recorded in the directory — on a fresh project it was a
  control for a thing that does not exist, and it could only fail in the agent's own
  words. It also drops from accent-outline to plain secondary, so the launcher has one
  accent instead of two side by side, neither of which said "act here".
- **`+ Terminal` and `+ New terminal` were the same action under two labels**, visible
  within a second of each other. Both say "New terminal".
- **`Ctrl+Shift+Enter` and the button beside it start the same agent.** The chord took
  the first preset in Settings while the button took the first AI-mode preset; they
  diverged the moment a normal-mode command sat first. With nothing configured the
  chord now does nothing, matching a button that is not rendered — the old fallback
  guessed at a command that may not be installed.
- **The "not on PATH" copy names the PATH it read.** 0.12.0's mitigating sentence said
  a shell alias or function still works, but a Git Bash or WSL user's `claude` is a
  real binary on a PATH that PowerShell never sees — and PowerShell's is the one this
  app hydrates. Both surfaces now say which PATH was read and name the shells it does
  not cover.
- Nine dead CSS classes, three unused icons and a stale comment claiming to feed a
  panel deleted the same morning.

### Build, tests and the state of the signature

- **A release can be built somewhere other than one laptop.** A GitHub Actions
  workflow on a `vX.Y.Z` tag checks the tag against `package.json`, gates on typecheck
  and the suite, packages NSIS and portable on `windows-latest`, verifies `latest.yml`
  against the artifacts it just built, and attaches the installer, blockmap, portable
  exe and manifest to a **draft** release. The manifest and blockmap are not optional:
  `electron-updater` reads the manifest to find the download and the blockmap to fetch
  only what changed. This already ends the dependency on one machine's antivirus
  configuration, because CI signs nothing and therefore looks up no certificate. The
  draft's own body says the artifacts are unsigned and must not be published, and the
  CI packaging config drops the publisher name, because an unsigned build making a
  publisher claim is exactly what `electron-updater` refuses an update over.
- **The installers are still signed with a self-signed certificate**, made on the
  machine that builds them. It is trusted by no other Windows install, so
  **SmartScreen will warn on first run**. A free certificate for open-source projects
  is the plan, and the workflow carries an inert, never-executed block waiting for one
  — but the application cannot be filed yet, because the granting foundation requires
  a public repository and this one is private. Nothing about the signature changes in
  this release.
- **1,536 → 1,657 tests, 133 files. Typecheck at zero.** The count is not only
  growth: seven suites were deleted with the features they tested, and every deletion
  was verified by grep rather than by the suite, because the tests' hand-written
  `window.api` stubs are cast through `unknown` — a dangling IPC channel leaves every
  spec green. That gap is the same one 0.10.0's notes named, and it is still open.

### What this release still does not do

- **The phone approve/deny card has never rendered on real hardware.** Every fix
  above was found and checked under Chrome's device emulation, against a decision
  minted by the real app from a real pty, over loopback. Emulation is not a phone,
  and the distinction is load-bearing: three findings behind the Deny fix are
  explicitly *not* settled by it — the phone still resizes the host pty, a redraw can
  still re-mint the decision under a new id, and the desktop pane is left narrow.
  Those need a physical device.
- **No external user has ever run this app.** No install off this machine, no
  recorded first session, no sentence from anybody who is not its author.
  `PRODUCT.md` now says so in those words, and the validation claims that were
  previously ticked have been corrected to what the evidence supports.

## 0.12.0 - 2026-09-03

The release that stops the app claiming things it does not know, and starts
letting it explain itself when it breaks. Both halves came out of one question:
what happens when someone who is not the author opens this.

### The app stops offering to run what it cannot find

A preset whose command is not on your PATH used to launch anyway, silently. The
pane opened, DevDeck registered it as an agent session, opened a usage event for
it and rendered it as **waiting** — while the shell printed "not recognized" into
it and no agent ever started. The app said an agent was running when none was.

- **A three-state presence probe.** `found`, `not on PATH`, `unchecked`. The
  launcher card, the Settings → Agents row and the first-run screen all read it.
  A healthy card is unchanged — a healthy launcher does not grow by a pixel.
- **It resolves against your shell's PATH, not the app's.** `process.env.PATH` in
  a GUI-launched Electron process is not the PATH a pane gets: panes spawn
  PowerShell, which runs your profile, and a profile is exactly where an
  npm-global `claude` lands. DevDeck now asks your shell once, at startup,
  deliberately *without* `-NoProfile`. Reading its own environment instead would
  have reported `missing` for an agent your terminal runs perfectly.
- **`unchecked` is not a weaker "missing".** If that shell probe fails — and on
  this machine an antivirus can kill it outright — every card answers
  `unchecked` and keeps its accent icon. Nothing about the card is qualified;
  only our knowledge is.
- **A marker, not a gate.** A `not on PATH` card still launches, because a PATH
  walk cannot see a shell alias or a function. The copy says "not found on your
  PATH", never "not installed". The only card that refuses is one with a blank
  command, which is a fact about the preset rather than a guess about your
  machine — and it routes you to Settings to fix it.
- Resolution walks `PATHEXT`, so a global npm install (`claude.cmd`, no
  extensionless `claude`) resolves. Two of three agents on the author's own
  machine only resolve that way.

### A stranger's first five minutes

- **Zero projects now open one panel, not Mission.** Previously the first thing
  a new user saw was a `SYSTEM` row listing every listening port on their
  machine, above 60% empty space, with "Add or open a project" as low-contrast
  text in a corner. All eight views now resolve to one screen with a single
  accent action, the prerequisite named out loud, and a truthful line about which
  agent commands were found.
- **The keyboard-chord card is gone.** It taught three shortcuts to someone with
  no project to use them on and no agent installed, while `F1` already lists
  every shortcut.
- **The project switcher stops reporting zero results for an empty list.** Three
  states now: no projects yet, no match for what you typed (with your query in
  mono so a pasted path cannot widen the modal), and the list.
- **One accent per screen** in the launcher again. Three filled controls were
  competing; the agent button — the thing the product is about — is the one.

### When something breaks, you can hand someone the reason

Eleven error boundaries reported to a console that does not exist in a packaged
app. There was no log file anywhere.

- **A capped, deduped, redacted record**, and a *Copy diagnostics* button on both
  crash cards and in Settings → About. It carries your versions, your OS, your
  shell, your agent commands and their PATH result, the recent errors with their
  component stacks, and the last pty exit.
- **Nothing is sent anywhere.** No endpoint, no telemetry, no upload, no issue
  link. It goes to your clipboard and the sentence under the button says so —
  along with the fact that file paths and command lines are included, *before* the
  reassurance that secrets are removed.
- **"Show what's copied" shows the record**, not a description of it. It is the
  only fully honest answer to "what is in this blob".
- **A render loop cannot flood it.** Ten thousand identical throws collapse to one
  entry with a count. If anything was dropped, the record says so in prose and
  the screen renders that verbatim.
- **The copy control has four states, and the fourth is the point.** If DevDeck
  cannot read its own log, the button is disabled and says so. Offering to copy
  nothing and succeeding would be worse than refusing.

### Fixed

- **A crashed region no longer re-throws every time the app re-renders.** A
  boundary with no reset key was clearing itself on any re-render — and the app
  re-renders on agent status, sessions, tabs and projects. One crash could become
  sixty error reports, half of them then discarded by the log's own rate limit,
  taking any other error in that window with them.
- **Settings, the project switcher and the command palette can no longer blank
  the window.** A throw in any of them now shows that surface's own card with the
  rest of the cockpit intact — and a way out, because a crashed modal used to
  take its own close button down with it.
- **Six "Copied" confirmations that could not know whether they were true.** The
  clipboard bridge returned nothing, so every caller announced success blind.
  It now reports failure, and the callers wait for the answer. In the terminal
  that matters twice over: a refused copy used to clear your selection too,
  leaving nothing to copy by hand.
- **Two clipboard writes at once no longer report a false failure.** The write
  and its read-back are one serialized step; before, nine of ten parallel writes
  claimed to fail while succeeding.
- **A crashed top bar's card no longer renders its own heading off-screen**, and
  crash cards no longer cover each other's buttons on a small window.
- The Settings → Agents form no longer breaks its own layout for every AI agent
  preset: the API-key field had been orphaned onto a third row without its label,
  and the command field you type in had lost 56% of its width.

### Security

Every item below was found by attacking the new code, and each ships with a
regression test that was watched to fail first.

- **A UNC path in a preset command opened an outbound SMB session.** Windows
  authenticates as you to whoever answers on port 445, and the call blocked the
  main process for **26 seconds** — every window, every terminal and the remote
  server — before answering `missing` about a host it never reached. No attacker
  needed: a corporate PATH containing a UNC entry, off VPN, would have done this
  on every launcher open.
- **`PASSWORD=` was not redacted.** The rule required at least one character
  before the keyword, so `DB_PASSWORD=` was caught and the plainest form in
  existence was not. Neither was `NAME: value` in any form — headers, YAML and
  JSON all use a colon, and no rule looked for one.
- **The diagnostics record is redacted on the way out, not only on the way in.**
  It always was documented that way; it was not doing it. That also makes the fix
  retroactive: a secret already written to the log is removed when the record is
  built, rather than being permanently baked in.
- **One NUL byte from a crash report used to break the copy button permanently**,
  and would otherwise have handed you a record silently cut at that byte.
- A crafted error report could forge the record's own sections — a second
  "Incomplete" heading, or an entire fictitious error line.
- The PATH walk no longer freezes the app on a slow miss: it is asynchronous with
  a time budget, and `powershell.exe` is now resolved absolutely rather than
  through a PATH whose third entry is user-writable.

## 0.11.1 - 2026-09-02

Two honesty fixes on surfaces 0.11.0 had just touched.

### Fixed

- **The phone keyboard can no longer bury the answer.** `#app` was
  `height:100vh` - a fixed layout-viewport height - and nothing inside the
  terminal view is a scroll container, so focusing the input bar below the
  decision card opened the keyboard over the answer with no way to scroll it
  back. Neither iOS Safari nor Chrome Android shrinks the layout viewport in
  response. `100dvh` (with `100vh` left as the fallback) and a `dvh` cap on the
  tail excerpt are the whole fix. Found by a review pass, not by testing - the
  card has still never rendered on a real phone, though the buttons were always
  in normal flow at 44px, so the answer itself stayed under the thumb.
- **Resume is no longer offered to an agent that cannot resume.** `resumeCmd`
  falls back to the cold-start command whenever a preset has no `resumeArgs`, so
  for claude-yolo, gemini and any user preset without one, the cold-start card's
  "Resume" and "Start fresh" ran the identical command - under copy promising to
  restore the conversation the button was about to discard. The card now reads
  the same `canResumeAgent` predicate the dead-pane bar has always used, and asks
  "Start this agent?" with a single button when resuming is not a thing that
  agent can do.

### Also

- **Eight agent roles under `.claude/agents/`** (pm, po, designer, frontend-dev,
  backend-dev, qa, release-eng, marketing) plus a `TEAM.md`. The four that
  existed only judge work; these mostly build it, and each carries the
  constraints this repo has paid to learn.
- **The local installer stops reporting a landed copy as a failure.** It checked
  `DevDeck.exe`'s mtime, which electron-builder leaves untouched when it reuses
  the cached Electron binary, and matched the asar version against an unspaced
  `"version":"x"` the pretty-printed bundle never contains. Both are now a
  SHA-256 comparison against the build just made, which catches a partial copy
  and a stale same-version install alike.

## 0.11.0 - 2026-09-01

### Answer a permission prompt from your phone

An agent that stops to ask permission used to reach the phone as the word
"attention" and nothing else — you could see that something wanted you, open the
terminal and type the digit yourself. Now the question travels with it.

- **One classifier, in main.** `approval.ts` and the tail helpers moved to
  `src/shared/`, and `src/main/pty.ts` keeps the cleaned tail that main reads.
  The renderer used to build its own copy of the same screen, so the tile and the
  phone could describe one prompt two different ways; there is now one answer to
  what an agent asked.
- **A decision is bound to the screen that produced it.** Main mints it only for
  a session actually waiting on you, hashes the tail it was read from, and spends
  it once. Answer at the desk and every paired phone drops the card without being
  told; tap a card whose terminal has moved on and the answer is refused with
  "the terminal moved on — check it before answering again" rather than firing a
  digit into whatever the agent asked next.
- **The card shows the raw screen, not just the parsed question.** The question
  is the one string an agent controls, so the excerpt it was read from sits under
  it. Approve and Deny are 44px targets above the quick keys, and a session
  waiting on you carries a NEEDS YOU badge in the list.
- **A phone can only replay tokens main recorded.** A made-up `send` string is
  refused, as is a tap from a device that never opened that session, or one
  naming a different session than the decision belongs to. None of those write
  anything to the terminal.

### Fixed

- **A region can fail without taking the cockpit with it.** One error boundary
  wrapped the whole app, so a throw in the Database or API panel blanked the
  window while several agents kept running in main — invisibly, with nothing
  able to answer them. The topbar, the deck and each panel now fail on their
  own, and the view recovers when you switch away and back.
- **The wants-you count stops counting an agent you have already looked at.** It
  counted every session that had finished its turn, and the acknowledgement only
  fired when you *navigated* to a pane — so sitting on the pane while an agent
  finished left the light on. A session that has been seen keeps saying
  `waiting`; only the count changes, and the deck key says so by form (the
  breathe stops, the dot becomes a hollow ring) rather than by colour.
- **A project remembers the view it was last in.** The main view was global while
  the active tab and pane were per project, so switching projects landed you in
  the previous project's view pointed at the new project's data.
- **The Overview grid orders sessions like everything else does.** It ranked them
  with a private function while the rail directly above it, and Mission, used the
  shared follow order.
- **Self-signed HTTPS no longer claims to unlock mobile push.** It does not:
  clicking through the browser warning marks the origin insecure, so service
  workers and Web Push stay unavailable. What the certificate really buys —
  encryption on plain LAN, and `Secure` + `__Host-` on the session cookie — is
  what the copy now says.

## 0.10.0 - 2026-08-29

### Guards that read text now check the thing itself

Remedy item 14, five sites that shared one habit: inspect a string, then hand
the unconstrained operation to `spawn`, `fetch`, `readFileSync` or a SQL
driver. Each one is replaced by a capability the underlying API already had.

- **A link no longer walks out of your project.** The filesystem guard resolved
  `..` textually, so a directory junction inside an open project pointing at
  `C:\Users\you\.ssh` was, as far as it could tell, inside the project — and on
  Windows, creating that junction needs no elevation. Both the target and the
  project roots are now dereferenced for real. A project you reach *through* a
  junction keeps working; that was the likeliest thing to break.
- **A redirect can't take the phone somewhere it isn't allowed.** The
  local/private-host guard ran once, on the URL you typed, and then followed
  redirects automatically — so any allowed public host could answer
  `302 → http://127.0.0.1:8787/` (DevDeck's own MCP server, on the machine
  you're remoting) or the cloud metadata address. Redirects are followed one at
  a time now and re-checked at every hop, and the check is against the address
  the name actually resolves to, which is what makes `http://127.1/` and
  `http://2130706433/` stop working.
- **Read-only means the database refuses the write.** Remote and agent queries
  ran a regex over the statement's first word. `WITH x AS (DELETE …) SELECT`
  starts with "with"; on PostgreSQL, `SELECT 1; DROP TABLE t` is one call.
  Those queries now run inside a read-only transaction (PostgreSQL, MySQL) or
  on a read-only connection (SQLite), so a write fails inside the database
  rather than being spotted by a pattern.
- **Two channels that took a path now say which paths are allowed.** A pipeline
  check spawns a shell in a directory you name, and a SQLite connection *is* a
  file read — both were the way around the confinement every other channel has.

Three things this deliberately costs you:

- **Remote and agent SQL against SQL Server is refused.** T-SQL has no
  read-only transaction, so the promise could not be kept there; the honest
  move is to remove the capability rather than keep claiming it. Run those
  queries yourself in the DB panel.
- **A SQLite file must be inside an open project or picked in the file
  dialog.** Connections you already have keep working — they're carried over on
  first launch — and Browse still reaches anywhere on disk.
- **Testing a SQLite path that doesn't exist now fails**, and says so in those
  words rather than the driver's. It used to create an empty database and
  report a healthy connection to it, so a typo looked like a working connection
  with no tables in it. The flip side: DevDeck no longer *creates* a database
  for you — make the file, then point a connection at it.

### The remote login stops answering as fast as it's asked

Remedy item 15. The phone's authentication check was reachable before any
credential was proven and answered at socket speed — a guessing oracle against
the pairing token, and a way to make DevDeck busy: every miss walked every
paired device's decrypt on the same thread that relays every terminal byte.

Repeated failures from one address now stop being answered. Five misses are
free, then the refusal window doubles from a second up to a cap of thirty, and
any success clears it. What grows is the wait, not a strike count — the device
most likely to fail repeatedly is your own phone with a token you revoked, and
a limiter that locks you out of your own machine would be worse than the attack
it prevents. A valid token from anywhere else is unaffected.

### The tests are typechecked, and something other than a person runs them

Remedy item 16 (an enabler, done last rather than first). `tsconfig.json`
included only `src`, so `tsc --listFiles` reported zero files under `tests/` —
99 suites could drift from the types they exercise and stay green. There was no
`.github` directory either, so `npm test` and `npm run typecheck` ran only when
somebody remembered.

- `tests` is in the typecheck. The first run surfaced 25 real mismatches (a
  `Project` missing `addedAt`, a `StepGate` missing its retry fields, a
  `runsSentence` argument that was still a boolean after the parameter became a
  union) — all fixed here.
- A CI workflow runs `npm run typecheck` then `npm test` on every push and pull
  request, on `windows-latest`, because a green run on Linux would be testing a
  platform DevDeck does not ship.

One thing this does **not** yet do, despite being the reason it was proposed:
the suites' hand-written `window.api` stubs are still cast through `unknown`, so
they are not checked against `src/preload/index.ts`. Renaming an IPC channel
still leaves every suite green. Typing those stubs is a change across 99 files
and is not this.

### An agent's state stops depending on whether you were looking

Remedy item 13. Visibility gated the **classification**, not just the
notification: the identical byte sequence from the identical agent produced a
notification when you were in your browser and no state change at all when you
were on the pane. The state that caused the signal was destroyed by looking at
it, so no one could reproduce, confirm, or falsify an attention claim — which is
why tuning the heuristic could never have fixed it.

- **A session you are watching now records what it did.** Going quiet marks it
  `waiting`, and a bell marks it `attention`, whether or not the pane is on
  screen. Only the sound and the in-app notification are still withheld from a
  pane you are already looking at.
- **The quiet threshold moves from 1 s to 6 s**, in the same change and not a
  later one. At one second every tool call and API round trip read as a finished
  turn — survivable only while watching a pane suppressed the signal entirely.
  It is a setting; the clamp around it is unchanged.
- **The tile stops claiming a turn finished.** It says what was actually
  observed: quiet since the last output. The chip beside it already says for how
  long.

Expect the deck's attention count to read **higher** on stock settings. Sessions
you are watching now count, which is the honest number.

### A destructive operation's result gets read

Remedy item 12. `ChangesModal`'s `act(fn: () => Promise<unknown>, ok: string)`
printed its success string unconditionally — and its three callers are stage,
unstage, and the **discard** behind a dialog that says "This cannot be undone."
Fifteen lines below it, `commit` branches on the result and renders the error, so
the right shape was already in the file.

- **"Discarded." is no longer printed for a discard that failed.** Narrowing that
  parameter to `Promise<boolean>` was the whole fix — `stageFile`, `unstageFile`
  and `discardFile` all already returned one, thrown away a single hop from where
  it was produced.
- **Removing a git account waits for its token to actually be gone.** `clearPat`
  was un-awaited and returned `void`, so the row vanished while the encrypted PAT
  stayed on disk — the store deliberately refuses to save when it could not be
  read, and that refusal was invisible here.
- **A worktree that will not remove says why**, instead of the row quietly
  reappearing on the next refresh.
- **Browser comments are no longer cleared into the void** when there is no agent
  session to send them to.
- **Four "Copied" messages now copy something.** They called
  `navigator.clipboard.writeText`, which this app's own deny-all permission
  handler blocks — the house `window.api.clipboard` goes through main and works.
- Discarding an untracked directory is recursive. (After `-uall` above, git's
  porcelain lists the files rather than the directory, so this is now defence
  rather than a reachable bug — but a non-recursive delete of a directory failing
  and reporting success is how it stayed hidden.)

### A prompt waits for the shell, and a shell that never starts says so

Remedy item 11. Five places spawned an agent CLI, slept a hard-coded 2800 ms,
and typed the prompt whether or not anything was listening - and `writePty`
drops a write to a session that is not live yet **silently**, so a slow boot lost
the prompt with no trace. The card that prompt was for had already been marked
dispatched, given a cost window, and appended to an append-only ledger.

- **Readiness is observed instead of guessed.** The store already sees every
  session's first byte; `whenReady` resolves on that byte plus a short quiet
  settle, with the old 2800 ms demoted from plan to deadline. On a deadline miss
  the prompt is still sent - losing work is worse than a quiet CLI - but the
  activity feed now says it may not have landed, which is the part that did not
  exist. Six hard-coded sleeps deleted.
- **A shell that fails to start reports itself.** `nodePty.spawn` throws for a
  missing or non-executable shell, and that throw was swallowed whole: main
  stayed healthy, nothing reached stderr, and the pane simply stayed black
  forever. It now prints which shell it tried, git's - or Windows' - own error,
  and where to change it.
- **`initialCommand` rides the first byte** rather than a 500 ms timer, in the
  one process that can see that byte for free.
- **A custom shell with a blank path is refused, not substituted.** It used to
  fall through to PowerShell without a word, so a broken setting looked like a
  working one. Relatedly, selecting Git Bash no longer launches whatever is in
  the custom-path box **with bash's arguments** - the two settings shared a
  field and only one of them owned it.

### Main owns "is it safe to stop"

Remedy item 6 of the 2026-08-26 audit. The renderer knew how many agents were
live and could not veto anything; main could veto and did not know. `Ctrl+W` on
a pane the user thought was a tab took the whole window and every agent in it,
with no way back.

- **Closing the window while an agent is running now asks.** Main already
  receives `agentId` on `pty:create` (it decrypts that agent's API key from it)
  and used to throw it away; it now keeps it, so the close handler can count
  what is running and refuse. Cancel is the default button. A plain shell
  sitting at a prompt is not counted - prompting for one would train you to
  dismiss the dialog without reading it.
- **A quit now tears down from any direction.** `before-quit` runs the same
  teardown `window-all-closed` did, so a quit that never goes through the last
  window closing no longer leaves pty trees alive, sqlite handles open and the
  WS server bound. It never prompts - the close handler already asked.
- **Closing a pane kills what the pane started.** `proc.kill()` signals the
  shell alone: a `npm run dev` that backgrounded a dev server left it running
  and holding its port after the pane was gone, invisibly. Panes are now reaped
  with `taskkill /T` on Windows. **This is a behaviour change:** something your
  shell launched deliberately to outlive the pane now dies with it.
- **A recording is written before it is forgotten.** `stopRecording` used to
  detach the listener and drop the events *before* writing the file, so a
  read-only directory or a project deleted mid-recording destroyed the only copy
  and the error you saw was the sound of it going. The write now comes first,
  and a failure leaves the recording intact and retryable. The destination is
  also captured at `rec:start` rather than supplied at stop - which removes the
  renderer's ability to be wrong about where a recording goes, and lets a quit
  flush a recording in progress.
- **Closing a recording pane no longer claims it saved.** The UI cleared the
  recording indicator on the same tick it asked main to stop, without waiting
  for or catching the answer.

### Uninstalling a skill is confined to a root

Remedy item 7. `skills.remove` guarded a recursive `rmSync` with an unanchored,
root-agnostic regex: any path whose middle looked like `/.claude/skills/<leaf>`
passed it, wherever it lived. `D:/OtherProduct/.claude/agents/x` and another
user's home directory both qualified. It did not need an attacker to be
dangerous - a bug in a path string was enough.

- The location is now **rebuilt** from the scope's root with the same function
  that decided where the item was installed, and the caller's path is checked
  against it rather than acted on. Removing a global skill still works; removing
  one project's item while another project is open does not.
- `extend:list` and `extend:remove` were the only two path-taking handlers in
  the IPC surface with no containment check at all. Both have one now.

### Undo belongs to the close, not to the view

Remedy item 8. Closing a session offered an Undo in Tabs and offered nothing in
Overview or Canvas - the two cross-project surfaces the product exists for. The
split was never a decision about intent, only about which file the button
happened to live in.

- `closePane` is now the closer that offers undo, so a view gets it by doing
  nothing special. Closing a row in Overview (the hover x, middle-click, or
  Delete) and closing a card in Canvas now offer the session back.
- The close that must stay silent - the multi-pane tab close, where an undo
  restoring one pane of three would lie - says so explicitly with
  `closePaneSilent`.

### "Couldn't check" stops being spelled "nothing to review"

Remedy item 9. A failed `git status` - a held `.git/index.lock`, a repo
mid-rebase, a corrupt index, the timeout - resolved to `0`, and every surface in
DevDeck renders `0` as a sentence: *"No uncommitted changes across your
projects."*, *"Working tree clean - nothing to review."*, *"Its own checkout, so
it can't collide with an agent already working in this project."* Each of those
was a claim about a working tree the app had just failed to read.

- **The count is now `number | null` end to end**, and each surface says which
  one it has. The review queue keeps the project and says "couldn't check for
  changes"; the deck shows a muted `? changes` chip where it used to show
  nothing at all; the diff panel names git's own error instead of declaring the
  tree clean; the launch popover warns that a session it couldn't read may still
  collide; the standup names the repo rather than omitting it.
- **A failed read no longer disables acting on it.** The review panel's Start
  button used to grey out, the diff panel's Review / Explain / Commit-msg /
  PR-description buttons went with it, and a dead session's tile dropped its
  Review action - all on the strength of a `git status` that never returned.
- **A Mission tile whose file check failed says so.** It cannot read CHANGED,
  and where it would have read QUIET - which a user reads as "nothing happened
  here" - it now reads `COULDN'T CHECK` and keeps a Review button. A session
  nobody has polled yet stays silent: not asked and asked-and-failed are
  different facts and are now spelled differently.
- **Untracked files are counted individually** (`-uall`). Git's default collapses
  a wholly untracked directory into one entry, so an agent that scaffolded forty
  files contributed `1` to the number the review queue is sorted by.
- Two side channels invented to work around the old type are gone: the
  carry-forward that presented a count from eight seconds ago as current, and
  the run ledger's catch-to-empty that told someone with months of history
  "nothing recorded yet".

### No assertion passes on an observation that was never made

Remedy item 10. DevDeck already diagnosed this once, in its own test harness -
*"the only one that touched the terminal contents was NEGATIVE ... which a blank
screen satisfies perfectly"* - fixed the harness, and left the same mistake in
three engines in the shipped product.

- **An `absent` pipeline gate now fails on empty output.** `!"".includes(pattern)`
  is `true`, so a step whose shell never spawned printed "✓ gate passed" for a
  check with nothing to check. **This is a behaviour change:** a gate that was
  passing vacuously will start failing, which is the point, but it will look like
  a regression to whoever meets it first.
- **An API test whose value could not be read now fails instead of passing.**
  `actualFor` folded "could not be read" into `""`, and an empty string compares
  as a value: an unreadable body made `neq` true and `lt` true for any positive
  threshold, so every row showed a green tick and the tab said "Tests ✓". The row
  now reads `got: (nothing to read)`, which is distinct from `(empty)`.
- **A pipeline step whose agent session disappears is no longer marked done.**
  `waitForIdle` named three outcomes and the caller handled two, so "the session
  left the grid" - killed, crashed, closed - fell into the success branch and the
  whole run finished green on work that never happened. The result is now a
  discriminated `ok`, so falling through on an unhandled outcome is impossible
  rather than merely wrong.

## 0.9.1 - 2026-08-27

### The stores stop destroying themselves

Five fixes from an audit of the persistence layer. One mechanism sat under most
of them: **every JSON loader turned an unreadable file into an empty value**, and
an empty value means "you have nothing configured" - so the next save committed
that emptiness over the user's real data. No click was required. An antivirus
lock, a truncated write, or an agent writing the same file mid-read was enough.

- **A store that cannot be read is no longer overwritten.** A new `Loaded<T>`
  keeps "the file isn't there" (a legitimate first run) distinct from "it's there
  and I couldn't read it", so a writer can refuse. `projects.json` latches the
  failure and all six mutators return early; `workspace.json`, `aikeys.json` and
  `gitpats.json` do the same. A damaged `aikeys.json` used to delete every stored
  API key.
- **`.mcp.json` keeps its other servers.** `writeMcp` opened with
  `// preserve any other top-level keys` and that comment was false on exactly the
  path that mattered: a malformed or mid-write file read as `{}`, and the write
  deleted every other MCP server and every other top-level key. It now refuses,
  and pressing Save tells you so instead of reporting success.
- **The workspace survives a file that parses but is wrong.** One tab whose split
  tree was missing or written by an older schema threw during load; the throw was
  swallowed, the store kept its module-load defaults, and closing the window wrote
  those defaults out. Layout is now validated at the one door it comes through
  (the bad tab is dropped, never the project), and nothing is saved at all until
  the load has actually completed. When it can't, a bar says so for as long as it
  is true - rather than a toast that fades while the condition doesn't.
- **The editor refuses to save over a file that moved.** This app's premise is
  agents editing your files while you watch, and the editor was holding a string
  with no idea which version it came from. Saves now carry the mtime the file was
  read at; a conflicting save offers Reload or Overwrite instead of silently
  winning. Compared on mtime only, so a formatter rewriting identical bytes can't
  make the editor unusable.
- **Pasting into a terminal can't execute your clipboard.** Paste went straight to
  the pty, bypassing the bracketed-paste support the terminal already had, so a
  trailing newline in whatever you copied ran on arrival. It now goes through
  xterm, which brackets the payload when the shell asked for it. A shell that
  doesn't (cmd.exe) receives exactly the same bytes as before.
- **`atomicWrite`'s promise is now true.** A rename is atomic against a process
  crash but not a machine crash - it can reach the disk before the data it points
  at, leaving a zero-length file where your workspace was. It now flushes before
  renaming, uses a temp name no second writer can collide with, and cleans up
  after itself on failure.
- **Your own files get that same write.** The doctrine was inverted: fifteen
  bookkeeping files got the crash-safe write while your source code, exports and
  uploads got a bare one, so an interrupted editor save truncated the file being
  edited and an interrupted layout save did not. Five sites now share one path.
- **One DevDeck at a time.** Every store is read-modify-write from the main
  process, so a second launch was a second writer to all of them and the loser's
  changes vanished silently. A second launch now raises the window you already
  have. (This does mean two instances side by side is no longer possible.)

Tests went from 1013 to 1036. Four existing suites had hand-written IPC stubs
that had drifted from the real preload types and were passing against a boundary
the app no longer has; they now match. `atomic.ts` had no test at all despite
sitting under fifteen modules - it has five.

## 0.9.0 - 2026-08-25

### The agent bake-off is gone

- **Removed the race feature entirely** — the task-board Race button, the
  race modal, `store.ts`'s `races`/`startingRaceIds`/`raceCardId` state and its
  `openRace`/`closeRace`/`startRace`/`landRaceWinner`/`abandonRace` actions, the
  poll/generation-counter machinery four rounds of concurrency fixes were spent
  keeping honest, the `race` kind in the run ledger, and the git-side
  `landFrom`/`shortstat` plumbing that existed only to serve it. About 2,100
  lines net. The honest reason: **it never completed a race.** Three live
  attempts died before any agent committed, and nothing since gave it a fourth.
  A feature that costs this much to keep correct and has zero confirmed
  successful runs in the field is a liability every time `store.ts` is
  touched, not a feature waiting for its lucky run.
- `samePath` — the Windows-aware path comparison the race poll relied on — was
  rescued first, in its own commit, since cost attribution in `runRecorder.ts`
  depends on it and is very much alive. It now lives in `paths.ts` with its
  tests intact. (The two `store.ts` lookups that also called it turned out to
  be race code themselves, and went with the feature.)
- Nothing here needed a migration. Races were runtime-only and never reached
  `workspace.json`, and the run ledger keeps what it already had: a historical
  `kind: "race"` row in `runs.jsonl` still loads, still renders, and still
  counts its money in the totals — it just loses the "Races" filter chip.

### The Inbox drawer is gone

- **Removed the agent triage drawer** — `InboxPanel.tsx`, the `inboxOpen` store
  state and its toggle, the deck's inbox icon, and the palette's "Agents inbox"
  entry. It was a fifth attention-list carrying its own "N need you" count,
  divergent from the others, in an app whose worst documented problem was
  eleven surfaces answering that one question. Mission Control's tiles now
  carry Approve / Deny / Reply, which was the drawer's only capability the
  tiles didn't already have — nothing replaces it, because nothing needs to.
- `Ctrl+Shift+J` is unbound. The global handler that used it to jump to the
  oldest waiting agent is removed along with the palette entry that advertised
  it; the chord is free but deliberately not repurposed here — that's its own
  decision, not a side effect of this one.
- Nothing here needed a migration: `inboxOpen` was runtime-only and never
  reached `workspace.json`.

### A dead pane keeps its evidence

- **A dead pane keeps its evidence.** A terminal whose process exited now holds
  what it printed and offers a restart, instead of silently spawning a fresh
  shell over it the next time the pane is mounted — which, since only the active
  tab's panes stay mounted, was the normal path with several terminals open.
  Agent panes offer Resume or Start fresh; a restart is logged to the cost ledger
  like any other run. Remote and mobile clients get the dead session's output on
  attach too.

### The app is 109 MB smaller, and half the dependencies were packed twice

- **`app.asar` 178 MB -> 70 MB**, `release/win-unpacked` 544 -> 435 MB. Most of that
  is one thing: Vite bundles monaco-editor into `out/renderer`, and electron-builder
  *also* packed the entire `node_modules/monaco-editor` copy because it sat in
  `dependencies` - 1,927 files, all 83 language grammars, never resolved at runtime.
  It and `@monaco-editor/react` are devDependencies now. Monaco package files in the
  asar: 1,927 -> 0, with the bundled code and all four language workers still
  shipping as app chunks.
- **The language subset that started this** is the smaller half: `monaco-setup`
  imports `editor.api` plus the 4 rich services and 16 basic languages this app can
  actually request, rather than the package entry that pulls all 83. Main renderer
  chunk 8,089 kB -> 6,141 kB. The grammars nothing here can open (abap, elixir,
  postiats, freemarker2, solidity, powerquery) are gone from the build.
- The language data moved to `src/renderer/src/monacoLanguages.ts`, deliberately free
  of any monaco import so it can be tested in node. Nine tests guard the hazard the
  subset creates: adding an extension to `LANG` without bundling its language
  degrades that file type to plaintext with no error at all. They also fail if the
  entry ever reverts to `from "monaco-editor"`, which would silently restore all 83.
- **The same audit, run across every production dependency.** Eleven more were
  renderer-only and bundled by Vite, so they were being packed into the asar for
  nothing: `react`, `react-dom`, `allotment`, `marked`, `dompurify`, `qrcode`,
  `zustand`, both `@xterm` addons and both `@fontsource-variable` families. Another
  12 MB off the asar. Nine dependencies remain, and every one earns it: the native
  pty, the four database drivers, `ws`, `selfsigned`, `electron-updater` - all
  imported by `src/main`, which electron-vite externalizes rather than bundles.
- **`@xterm/xterm` deliberately stayed**, and finding out why is the reason this was
  done by audit rather than by pattern. `src/main/server.ts:89#xtermAsset` does
  `require.resolve("@xterm/xterm")` at runtime to serve `xterm.js` and `xterm.css` to
  the mobile web client. A grep for import statements misses that entirely; moving it
  would have shipped a broken remote terminal, silently, with every test green. Its
  two served files are confirmed present in the packaged asar.
- Editor colours confirmed by hand before merging. The automated harness could not
  reach a mounted Monaco instance - the Editor view needs a file opened through its
  tree - so that one check is a human's, and the commit says so rather than implying
  otherwise.

### Toolchain: Electron 43, Vite 7, and `npm audit` at zero

The pin was never really about Electron. It was about Node: Electron 42 and Vite 7
need `>=22.12`, the machine ran 22.11, so Electron 33 + Vite 5 were pinned in June
with "revisit after a Node LTS bump" written beside them. The machine now runs
**22.23.2**. The block had already lifted, and four separate doc claims still said
it had not - including the security triage that called the shipped Electron CVEs
"Node-blocked".

- **Electron 33.3.1 -> 43.4.1**, electron-vite 3 -> 5, Vite 5.4 -> 7.3.6, vitest
  2.1 -> 4.1, @vitejs/plugin-react 4.3 -> 5.2, electron-builder 25 -> 26.15.3, then
  plain `npm audit fix` for the in-range remainder. `npm audit`: **25 advisories
  (2 critical, 19 high) -> 0**. The ROADMAP's "do not `npm audit fix --force`" rule
  held: every major was chosen by hand first.
- **Vite stops at 7, not the 8 npm suggests**, because `electron-vite@5` peers on
  `vite ^5 || ^6 || ^7`. Vite 7 is already outside the advisory's `<=6.4.2` range, so
  the CVE clears without an unsupported combination. `@vitejs/plugin-react@5.2.0` is
  the single version whose peers span both 7 and 8, which is why plugin-react stops
  at 5.
- **The risk that mattered was the pty native module, and it took two attempts to
  actually settle.** `@lydell/node-pty`'s prebuilds are per-ABI, and a broken one
  under a new Electron would take the terminals - the whole product - with it.
  `npm run verify:terminal` reported 14/14 under Electron 43 and that was claimed
  as proof. **It was not.** Every one of those checks reads the DOM or app state,
  and the only one that touched the terminal contents was NEGATIVE ("no escape
  sequence reached the shell"), which a blank screen satisfies perfectly. Both
  terminals were in fact blank, because the app's default shell is powershell and
  this environment cannot spawn powershell.exe at all. Re-run with `cmd` seeded, a
  shell printed its banner, and the same harness passes 15/15 including a new
  **positive** assertion that a shell is running. The packaged artifact was checked
  the same way: it opens on Electron 43.4.1 and spawns a real pty from its
  asar-unpacked native module. So the conclusion held - node-pty loads fine under
  Electron 43 - but the evidence first offered for it did not, and the harness now
  fails instead of passing when the terminals are empty.
- **Packaging: both blockers found, both PowerShell, and it does complete once they
  are worked around.** `electron-builder` needs PowerShell twice on Windows, and
  this environment cannot run it at all (exit 3221226505, the same wall that made
  `worktree.ps1` unrunnable). Builder 26 routes its whole npm invocation through
  `powershell.exe` on purpose (`nodeModulesCollector.js:324`, avoiding `.cmd` shims
  after CVE-2024-27980), so the "node module collector" crash was never a builder-26
  bug - setting `"packageManager": "traversal"` selects a collector that walks
  node_modules directly and gets past it. The second is the code-signing cert
  lookup, which only `signAndEditExecutable: false` avoids - and that also skips the
  icon and version resources, so it changes the artifact. With both, `package:dir`
  completes and the result runs. **Neither workaround is committed**: traversal
  reports optional dependencies as "missing" and losing the exe resources is not
  something to ship for a headless check. **Settled later the same day:** the
  PowerShell failure was Avast 26.7 injecting `ArPotEx64.dll` and tripping Control
  Flow Guard (`0xC0000409`, fast-fail subcode `0xa`), not a property of the machine.
  With Avast updated, `npm run package:dir` succeeded on the first attempt with
  committed config - npm collection, asar integrity, and signtool signing with
  `CN=DevDeck Dev`, including the pty's bundled `OpenConsole.exe` - and
  `verify:packaged` passed 4/4 against that artifact. Neither workaround was ever
  needed for anything but the antivirus bug, and neither is committed. Packaging on
  Electron 43 + electron-builder 26 is verified end to end.

Typecheck clean, 985 tests, `npm run build` clean, `verify:terminal` 15/15.

### Terminal mechanics: switching, moving, zooming, and getting a session back

The awareness layer knew which agent wanted you; the mechanics for actually
getting around did not keep up. Five gaps, each one a missing verb rather than a
missing feature.

- **`Alt+1..9` jumps straight to a session**, counted the way the tab bar reads:
  tab order, then panes within a tab. `Alt+9` is "the last one" whatever the
  count, so the key at the end of the row is never dead; any other index past the
  end does nothing rather than clamping, because `Alt+5` quietly meaning `Alt+3`
  turns positions into guesses. Holding `Alt` reveals each tab's number, so the
  shortcut teaches itself instead of living in the F1 sheet.
- **`Ctrl+Tab` now covers every session, shells included.** It walked
  `agentSessions()`, so a shell running a dev server could not be reached by the
  one key that exists for reaching sessions. It also anchors on the pane you are
  in rather than the last agent touched, so the cycle starts where you are.
- **`Alt+arrows` move focus between split panes.** Decided by geometry, not by
  walking the layout tree: in a nested split those two disagree, and "the pane to
  the right" is a question about pixels. A candidate has to share more than a seam
  of the facing edge, so a pane touching only at a corner is not to the right of
  anything.
- **`Ctrl+Shift+Z` zooms the focused pane** to fill the stage, and back. The pane
  never leaves the layout tree, so nothing detaches from its pty and no buffer
  replays; it is lifted over the stage in CSS. The zoom is derived at render from
  what is on screen rather than cleared on every event, because there are three
  ways to orphan one (close the pane, switch tab, switch layout) and a zoom
  pointing at a pane the stage is not showing would blank the stage.
- **Closing one session offers Undo instead of asking first.** A single-pane tab
  used to die silently on a mis-clicked `x`; it now closes and leaves an Undo
  toast, which beats a dialog (nothing to read, and it survives the mis-click).
  An agent comes back resumed where its preset knows how, a shell re-runs whatever
  it was started with, and the reopened pane goes into the tab it came from. Said
  plainly: it is a reopen, not a resurrection, which is also why a multi-pane tab
  still asks - undo restores one session, and an Undo that silently brought back
  one of three would lie. Middle-click closes a tab, as it already did on the
  Overview rail.
- **The palette finds a session by what distinguishes it.** Shells included,
  ordered so the ones that want you float up, and titled with the session's own
  name, its project, and the worktree it sits in when that is not the project
  root - so typing a branch name reaches its session. Eight rows reading "claude"
  was not a way to find anything.

Alt chords are swallowed before xterm encodes them, or `Alt+Left` would write
`[1;3D` into the shell on its way to moving focus. Narrowed on purpose:
AltGr arrives as Ctrl+Alt on Windows layouts, so anything carrying Ctrl is left
alone. 44 new tests (`tests/paneNav.test.ts`, `tests/closedSessions.test.ts`,
`tests/reopenClosed.test.ts`); the ordering, the direction-picking, the zoom
validity rule and the undo ring are all pure functions.

Four signals DevDeck uses to tell you an agent needs you, and one of them was
wrong three different ways. Six tasks, several needing more than one fix round
before they held up.

- **A dispatched card now reaches "review" on evidence, not on a pause.** The
  card board used to slide a dispatched card from *doing* to *review* the
  moment its agent's terminal went quiet for `agentIdleMs` — one second by
  default — whether or not it had written anything. An agent thinking through
  a hard problem, or answering a question with no file touched at all, filed
  itself as finished. DevDeck now snapshots the session's directory when the
  card enters *doing* and only advances the card once `git status` shows a
  path that wasn't dirty at that snapshot — a real, new change, not a silence.
  Re-entering *doing* (reopening a card, or sending it back for another pass)
  takes a fresh snapshot, so a card given more work doesn't get yanked forward
  again on the very next pause — and if that snapshot fails, the baseline is
  dropped rather than kept, so a card sent back for more work can never snap
  straight to *review* on the strength of the work that got it there. A card
  also stays put while its agent is waiting on a permission prompt: quiet with
  three files written is what "blocked halfway" looks like too, and handing you
  a half-applied change as "ready for review" is the same lie in a new place.
  A snapshot that never happened (or failed) is no longer permanent either —
  the next pause re-establishes it and the pause after that decides, instead of
  the card sitting in *doing* for the rest of the session.
  **This fixes the card, not the chrome:** on a thinking pause the tile still
  flips to "waiting", the deck badge still counts it and the soft beep still
  fires. The status transition is deliberately out of scope — a thinking pause
  no longer files a card as finished, but DevDeck has not stopped saying your
  agent went quiet.
- **A terminal title is no longer read as a request for attention.** `\x07`
  (BEL) is both the terminal bell *and* the byte that terminates an OSC escape
  sequence — the same one a shell prompt or a CLI uses to set its terminal's
  title, or to emit an OSC-8 hyperlink. DevDeck's "agent rang the bell" signal
  fired on both, so an agent naming its own tab could mark itself as needing
  you. It now tracks, per session, whether it is inside an OSC sequence, so
  only a genuine bell raises attention — including when the escape sequence's
  bytes are split across two separate chunks of pty output, which happens
  routinely.
- **Fix: a stalled agent could never actually be flagged.** The stalled check
  required a session to still read as "working" after 120 seconds of silence,
  but the idle timer always clears "working" within about a second — so the
  two conditions could never both be true, and the check had never fired in
  production. It also required a last-output timestamp that was only ever
  stamped on real output, so an agent that crashed before printing a single
  line was invisible to it. Every agent-launch path now stamps a launch time up
  front, so silence is measurable from the first second. And because "quiet for
  two minutes" is also the normal resting state of an agent that finished and
  handed back to you, stalled asks one more question: is anything actually
  waiting on this session — a card in *doing*, or a pipeline step blocked on it?
  If not, its silence is not a stall, and the tile says nothing. A marker that
  is always on tells you as little as one that never fires.
- **The "quiet after" threshold is now a real bound, and still typeable.** Its
  `min`/`max` were HTML attributes only — nothing stopped a typed value (or an
  emptied field, which reads as `0`) from reaching the setting itself. Both the
  setter and the settings loader now clamp it. The clamp lands when you leave
  the field, not on every keystroke: clamping mid-typing meant the first `2` of
  `2500` became `300` and the rest was appended to that, so any value starting
  below the floor was untypeable and the field could never be cleared. The
  previous 5-second ceiling is gone on purpose: this number answers "how long
  before we call an agent quiet," not "how long before its work is done," so
  there's no reason to cap it low.
- **Fix: a failed `git status` used to read as a clean working tree.** The
  change-review helper swallowed any git failure and resolved an empty list —
  indistinguishable from "nothing changed." That's fatal for a baseline: a
  transient failure (no git on PATH, an `.git/index.lock` held by another
  operation, the read timing out) would make a card that was mid-work look
  finished. It now rejects instead, and every caller decides for itself
  whether "unknown" should read as "nothing to show" or as "no evidence yet."
- **The deck groups the supervision keys apart from the verification tools.**
  Mission, Tasks, and Terminal now sit visually apart from API, Database,
  Browser, Network, and Editor behind a hairline divider — no border box, no
  new chrome, just a gap that says "these two rows answer different
  questions." **No shortcut changed**: `Ctrl+1`–`Ctrl+8` keep meaning exactly
  what they meant before, since the views were already ordered
  supervision-first.
- **Decide from Mission.** Every agent tile now carries one state chip — NEEDS
  YOU, EXITED, ASKING, STALLED, CHANGED, WAITING, WORKING, QUIET — and only the
  action that answers it: Approve/Deny on a detected permission prompt, Reply
  on a question, a stall, or a session that finished a turn while you were
  away (WAITING), Review on files the session changed. The chip replaces the
  old `needs you` and `stalled` lines, so the two states that used to carry a
  line break even; every other tile gains the one-line chip in exchange for a
  state that used to take reading eight peeks to find, now readable as "which
  pill is the amber one." The pty exit code is now recorded per session, so a
  dead pane reads as dead instead of merely silent.

## 0.8.0 - 2026-08-18

Two unrelated pieces of hardening: who a task-board card dispatches to, and who
can reach the app remotely.

- **Dispatch picks an agent by rule, not by list position.** DevDeck used to
  hand every task-board card to `agents[0]` — whichever preset happened to sit
  first in Settings — so reordering presets silently changed who did every
  task. An ordered set of rules now chooses instead: match a card's title
  (substring), a title glob, a project, or match always, first enabled rule
  wins. **Rules choose *who*, never *whether*** — nothing dispatches without a
  click. The card itself shows the agent that would run before you click it,
  names the rule that chose it when one did, and a chevron opens a menu to
  override it for that dispatch only. The rules themselves live in a new
  Settings editor, alongside a fallback default agent for when nothing
  matches. Two behaviours worth knowing rather than discovering: a **glob is
  anchored**, so `login` as a glob matches only the exact title "login" —
  `*login*` is the idiom for "contains", and the editor's placeholder teaches
  it, but it's easy to miss the first time. And **routing only ever targets
  AI-mode presets** — a rule pointing at a shell preset (e.g. a dev-server or
  build command) is skipped, the same as a rule naming a deleted preset,
  because dispatch pastes the card title in as a prompt and a fixed-command
  preset has no use for one. The **fallback changed too, not just rule
  targets**: with no matching rule and no default agent configured, dispatch
  now falls back to the first *AI-mode* preset rather than the first preset of
  any kind — a normal-mode preset sitting above your AI agents in Startup
  commands is never silently picked.
- **Fix: dispatching with no AI-mode preset configured used to proceed
  anyway.** With nothing to route to, the confirm dialog read "Start  on
  ..." with a blank agent name, and confirming it opened a bare shell tab,
  moved the card to "doing", and — after the usual 2.8s boot wait — pasted the
  raw card title into that shell as a literal typed command. Dispatch now
  refuses before the confirm is even shown, with a message that no AI agent
  preset is configured.

Remote access is still full remote code execution for any device that gets in —
this round changes *who gets in*, not what they can do once there. Five tasks,
eleven fix rounds; several of the defects it caught were in the plan itself, not
just the code.

- **Paired devices, not one shared token.** Enabling remote used to mint a single
  token that worked forever for anyone who ever saw it. Now a device pairs once
  with that token and gets its own, and Settings lists every paired device by
  name (a readable guess from its user-agent, e.g. "iPhone · Safari", editable)
  with when it was last seen and a Revoke button. Revoking one device stops it on
  its next connection and touches nothing else — the capability the old design
  had no way to express. The pairing token itself still never expires and can
  enrol unlimited devices, and regenerating it deliberately leaves already-paired
  devices working, so the device list and per-device revoke are the real
  mitigation for a leaked pairing link, not a nicety layered on top.
- **Devices go idle, not just revoked.** A new setting — 7 days, 30 days, or
  never — drops a device's record once it has sat unused past the window,
  checked at connection time rather than by a background sweep. **Shortening the
  window acts immediately**: any device already idle past the new setting is
  dropped within seconds of the change, even while remote access itself is off,
  and re-pairing is the only way back in.
- **The network the server binds to is now a choice, not a guess.** Three options
  — Tailscale/VPN, Local network, or the legacy Auto — replace the old silent
  fallback that quietly bound every interface whenever no tailnet address was
  found. Choosing **Local network means every device on that Wi-Fi or LAN can
  reach a full terminal on this machine**; the panel says so before you pick it,
  not after. Choosing Tailscale with no tailnet address now **refuses to start
  and says why**, instead of substituting the wide-open bind — a feature that
  can't honour the safe option should stop, not fall back to the unsafe one.
  Existing installs were migrated to **Auto**, the legacy behaviour, so nothing
  that worked yesterday silently breaks — but Auto can still bind everything
  when the tailnet happens to be down, and the panel marks it as the choice to
  move off, not the safe default.
- **Tokens are encrypted at rest.** Device tokens and the pairing token now live
  in the same `safeStorage`-encrypted store already used for git PATs and agent
  API keys, instead of in plaintext in `settings.json`. The renderer never sees
  a device token, only `{ id, name, createdAt, lastSeenAt }` for display. A
  legacy install's plaintext token is migrated into the encrypted store and
  removed from settings on first run.
- **Fix: closing the window mid-boot could wipe settings.json.** Settings load
  from disk asynchronously; the quit-time flush was wired to run regardless of
  whether that load had finished. Closing the app in the gap between launch and
  load meant the flush wrote the in-memory defaults over the real file, losing
  every setting, not only the ones this feature touches. The flush now waits for
  load to actually apply before it's allowed to write.

A third, unrelated piece: a race's or a pipeline's cost used to disappear the
moment its pane closed. It now survives.

- **Every finished run is kept, in a new Runs · all time section of the usage
  panel.** A task-board card reaching done, a race landing or being abandoned, a
  pipeline run reaching a terminal status, and an ad-hoc agent pane closing each
  add one row — newest first, filterable by kind and by project, showing date,
  kind, outcome, label, project, agents, duration and cost. A race row says
  whether it **landed or was abandoned**, which is the difference between money
  that bought something and money that bought nothing. Deleting the card, race,
  or pipeline afterward doesn't touch the row; it lives on its own in a new
  `runs.jsonl`, independent of whatever spent the money, and it keeps the
  project's name as it was, so a removed project's history stays readable.
- **Totals exclude any run whose cost isn't a receipt, and say which kind of
  not-a-receipt it was.** A cost here is an attribution over a project
  directory and a time window — DevDeck prices a run by summing every agent
  transcript under the project's directory across the run's window, because
  Claude Code names transcripts by project rather than by pty, so a second
  session working in that same directory during the run lands in the same
  figure. Adding two such figures together would double-count the same money.
  So an excluded run is still shown, but is never added to a total: its own
  figure gets a `~` and a dashed underline so it can't be mistaken for a plain
  number, the total beside it counts only the summable rows, and the number
  left out is stated right next to that total rather than silently vanishing
  from it — separating a run that genuinely **shared a project** from one whose
  price simply **couldn't be read**, which are different things to be told
  about your own money.
- **Whether a run shared a project is decided over the run's own window, not by
  looking at what happens to be open when it is filed.** This is the whole
  feature working or not working: a card is usually dragged to *done* long
  after its agent finished and its pane closed, so asking "is anyone else here
  right now?" at that moment would have let two cards dispatched into the same
  project each quietly claim the other's spend — two rows, both presented as
  receipts, adding up to roughly twice the real number. DevDeck now answers it
  from its own persisted record of every agent session's start and end, so the
  answer is the same however long the card sat in *review* first. The limit
  worth knowing: DevDeck can only account for agents **it** started. Type
  `claude` straight into a plain shell pane and it writes no session record, so
  a run covering that window is still filed as a receipt over money that was
  partly that agent's.

## 0.7.13 - 2026-08-13

Two features. One is finished; the other is built, reviewed hard, and has never
successfully run — and this note says which is which.

- **Agent tiles show what each session is actually doing.** Every Mission Control
  tile now carries a two-minute sparkline of its agent's terminal activity, so a
  session that has gone quiet looks different from one that is still producing.
  It replaces the stalled ribbon and the relative-time text, which said the same
  things in words, so the tile carries no extra chrome. It measures output volume,
  not usefulness: an agent repainting a spinner with ordinary line endings reads as
  active, and one repainting in place with a bare carriage return reads as silent.
  Read it for pace, not for progress — three attempts to make it distinguish real
  work from repaint noise all failed, and pretending otherwise was the worse option.
- **Race two or three agents on one card (new, and unproven).** Give a task-board
  card to several agents at once and each gets its own git worktree. Each is told
  to commit when it finishes; the same gate command then runs **inside that agent's
  worktree**, and anything whose gate fails is eliminated on the exit code — a fact,
  not a judgement. You read the survivors' diffs and land one, which arrives in your
  working tree unstaged so you write the commit message rather than inheriting an
  agent's. Cost is attributed per entrant, which works because each worktree is its
  own directory and therefore its own transcript.

  **It has never completed a race.** Three live attempts died before any agent
  committed — almost certainly an antivirus behaviour shield killing the Electron
  process tree, with the path and the confirmation test recorded in `NOTES.md`.
  What is proven is that dispatch creates distinct worktrees on distinct branches.
  Everything after an agent commits is verified by reading the code and by unit
  tests, not by watching it happen. Note also that a gate runs in a fresh checkout
  with no dependencies installed, so `npm test` alone will fail — use
  `npm ci && npm test` or something that needs nothing.
- **Fix: a confirmation dialog could hang forever.** Opening any second confirm
  while one was showing dropped the first one's promise, so whatever was waiting on
  it waited permanently. Harmless in most of the app's ten confirm sites and not in
  all of them — a caller that took a lock before asking would never release it. All
  of them now resolve as cancelled instead.

## 0.7.12 - 2026-08-11

Two things that were a trip to the terminal, and one design rule the app wasn't
keeping.

- **Pull latest without leaving the deck.** The status bar told you the branch and
  what was uncommitted, but getting the branch current still meant a terminal. A
  pull button now sits beside the branch, and carries the behind-count itself
  rather than adding a chip: neutral when there's nothing to fetch, accented with
  a number once you're behind. It only appears when the branch has an upstream. It
  is `--ff-only` on purpose — a one-click action should never invent a merge commit
  or leave a conflicted tree, so a diverged branch fails with git's own message and
  the resolution stays a conscious call in the terminal. The behind-count comes off
  the porcelain status the deck was already polling, so watching for it costs no
  extra process.
- **Closing another session takes one click.** Tidying up used to mean pulling a
  row into focus and then closing the focused pane — two steps, and it moved the
  thing you were watching. Rail rows now take a × on hover, a middle-click, or
  Delete when focused. No confirmation, matching every other single-pane close; the
  row vanishing is the feedback. At rest no row shows a ×, so the list weighs the
  same as before.
- **Fix: emoji out of the chrome.** DESIGN.md forbids them and three had slipped
  in — the welcome card's 👋 becomes the ensō (the brand mark belongs on the one
  card that introduces the app, and it draws in currentColor so it re-themes), the
  browser panel's 💬 becomes the pencil its tooltip already promised, and the empty
  work panel loses its party popper. Left alone deliberately: the 🚀 in the
  project-icon placeholder, which is user content teaching you an emoji is allowed
  there, and typographic marks like ✓ ✗ ❯ ⚑, which are text carrying meaning rather
  than pictographs.
- **Fix: rail rows stopped wrapping.** Reserving width for that hidden × is what
  keeps a row from shifting under the cursor, but it narrowed the row enough that a
  long project name pushed the session name onto a second line. The session name is
  what you scan for, so it never wraps now and the project name ellipsizes instead.

## 0.7.11 - 2026-08-07

Three things from the backlog, and one bug that only turned up by opening the
window rather than running the tests.

- **The starter commands are offered where you'd ask for them.** "How do I see the
  template start commands?" had an answer — Settings → Startup commands → *Add
  recommended* — but nothing at the launch screen said so. The empty-terminal
  launcher now offers the ones you're missing directly. It only appears when some
  are actually missing, so a complete config never sees it.
- **The worktree option tells you who is already in the tree.** It used to say only
  that a worktree "can't collide with an agent already working in this project" —
  advice, where it could give you the facts. It now names the sessions running
  there and what the tree has uncommitted, so ticking the box is a decision instead
  of a precaution. Still not a dialog: the plain click stays one keystroke.
- **Task cards and pipeline runs show what they cost.** DevDeck already read real
  token spend from Claude Code's transcripts, but only ever sliced it by model,
  project and day — never "what did *this* cost". A dispatched card now carries its
  estimated spend, and a running pipeline shows the total so far. Read it as an
  attribution rather than a receipt: everything that project's agents did while the
  card was open counts, because transcripts are keyed by project, not by terminal.
  Sub-cent work shows as `<$0.01`, never `$0.00`.
- **Fix: that same warning was naming agents that hadn't touched anything.** It
  claimed "claude 1, claude 2, claude 3, claude 5, claude 6 are already editing
  this project (one-file.md)" while the status bar said *1 change* — because git can
  say what changed in a directory but never which session changed it, so every
  session sharing a tree was credited with all of it. It now names who is working
  there, says what the tree has uncommitted, and claims nothing about who did it.
- **Enter adds a task again.** The board's box is multi-line so a pasted checklist
  keeps its rows, but it only committed on Ctrl+Enter, and almost every card is one
  line. Enter adds, Shift+Enter makes a newline, Ctrl+Enter still works, and pasting
  a checklist is unchanged.

## 0.7.10 - 2026-08-07

The MCP surface gets the two tools it was missing, plus a design pass that started
as a competitor teardown and ended up auditing DevDeck's own UI against its own
written rules — where the rules lost, twice.

- **An agent can replay your saved API requests.** `devdeck_http_requests` lists
  what you've saved in the API panel and `devdeck_http_send` replays one, returning
  the real status, timing and body — so an agent checks what an endpoint actually
  returns instead of guessing from the code. It can only send a request **you
  already saved**: it picks one by id and cannot supply a URL of its own, so there
  is no way to aim it at a host you didn't choose. Params, headers and auth
  (bearer/basic/api-key) are applied as the panel would; bodies are capped at
  20,000 characters. It's the one MCP tool that isn't read-only, because an HTTP
  request is whatever the endpoint makes of it — the tool description tells the
  agent not to replay anything that mutates state unasked.
- **An agent can read the browser panel's console and network log.**
  `devdeck_console_logs` returns console messages, uncaught exceptions, CSP and
  deprecation warnings, and recent requests with their status codes — so "the page
  is broken, here's the console" no longer needs you to copy anything out of
  DevTools. With one page open you don't even pass an id. Console capture is new:
  the panel only ever recorded network activity before this.
- Console messages are rendered the way DevTools renders them, so `%c`-styled logs
  (Electron's own security warnings, most logging libraries) no longer arrive with
  their CSS spliced into the message text, and `%s`/`%d` placeholders are filled in.
  One caveat worth knowing: capture starts when the Browser panel attaches, so
  anything a page logged before that isn't in the buffer.

- **Active tabs are marked, not just tinted.** A terminal or editor tab showed it
  was active by shifting its background, which reads as *hover*, not *selected* —
  and DESIGN.md had been claiming for months that tabs carried an accent stripe
  they didn't have. They now carry a 2px accent underline. Three of the twelve
  design styles were already doing this; the default just never got it.
- **Segmented controls mark the active segment with weight, not only colour.**
  Edit/Split/Preview, the AI toggle, and the .NET panel modes tint the active
  segment *and* set it bold. The tint alone can't do the job: on Washi, 18% of the
  accent over its own ground measures 1.2:1, and even a solid accent fill only
  reaches 2.9:1 — under the 3:1 floor for a UI element. On a light theme a tint can
  never be the marker, so the weight is what actually carries it.
- **Quotes in the markdown preview no longer italicise the whole block.** Italic
  made `*emphasis*` inside a quote render exactly like the quote around it, so the
  emphasis vanished. The quote is now marked by its bar and muted text only.
- **Washi's dividers hold up where they're load-bearing.** The "strong border"
  value is derived by mixing the border toward the text colour, which gains far
  less contrast on a light ground than a dark one — 2.51:1 on Washi against ~3.7:1
  everywhere else. Washi now states its own value, at 3.05:1.
- **Two accent-filled buttons had labels you couldn't read on Washi** — the
  overview segments and the usage window picker used the page background as their
  text colour instead of the on-accent token, giving cream-on-amber at 3.2:1. Now
  5.13:1.
- **Fix: the Kinetic style's tab animation works again.** Kinetic springs its own
  underline in, and the new base underline painted instantly at full width behind
  it — so the animation was invisible and at rest you saw a doubled line. Kinetic
  drops the base rule.

Also, for anyone (or anything) doing UI work here: `DESIGN.md` now documents the
active-state grammar and badge tiers, **including a list of the places the code
doesn't follow them** rather than asserting a compliance it doesn't have. There's a
new `devdeck-design` skill carrying the token-first workflow and a review checklist
— including the two `themes.ts` traps that make theme changes look like no-ops.

## 0.7.9 - 2026-07-28

Everything here came out of real use, not the roadmap.

- **Agent output has colour again.** Claude Code, Codex and Gemini were rendering
  flat monochrome, which makes a long agent session genuinely hard to follow. The
  cause was `NO_COLOR`: chalk checks it *before* `TERM`, `COLORTERM` or the TTY
  test, so a single inherited `NO_COLOR=1` silences colour in every ink/chalk CLI.
  DevDeck passed its whole parent environment to the terminal, so whatever launched
  the app decided whether your agents got colour. It's now stripped for terminal
  children — it's a convention for pipes and CI, not for a terminal you're reading.
  `TERM` is pinned too: conpty ignores node-pty's terminal name, so on Windows the
  child previously inherited `xterm-256color` from Git Bash or *nothing* from the
  Start Menu. Colour no longer depends on how you started DevDeck.
- **Launch options on the agent button.** `+ <agent>` gains a caret; the button
  itself still launches instantly (one keystroke to a new session, unchanged). The
  caret opens options for that one launch — currently **a git worktree with a
  branch name**, so you can act on the "another agent is already editing this
  project" warning at the moment it matters instead of going to a separate modal.
- **The deck's per-project `+` asks which agent** instead of firing your first
  configured one. It names no agent, so launching a paid CLI off it was a guess.
- **The prompt composer no longer says "for Claude".** It always fanned out to
  whichever agent sessions you picked; the label just named your first preset,
  implying a lock that was never there. It now names the live session, or the count
  ("Write a prompt · 3 agent sessions…").
- **Remote panel tells you whether the phone will work off your Wi-Fi.** It now
  reports the interface actually bound — "Tailscale only (reachable anywhere on
  your tailnet)" vs "this Wi-Fi only (same network required)" — rather than what
  addresses merely exist. That difference was previously left for you to infer, and
  bringing Tailscale up *after* starting the server would show a private `100.x`
  address while the server was still listening on every interface, including the
  LAN. That case is now flagged with a **Restart remote** button.
- **Auto-update would have rejected every installer.** `package:signed` signed the
  exes *after* electron-builder had hashed them, so `latest.yml` described the
  unsigned bytes — ~7 KB and a different sha512 from what shipped. electron-builder
  now signs during the build, artifact names lost their spaces (GitHub rewrites
  those, 404ing the updater), stale artifacts are cleared first, and the script
  fails loudly if the manifest and the installer disagree. **If you published
  0.7.7 or 0.7.8, re-publish from this build.**

## 0.7.8 - 2026-07-27

- **Fix: the MCP bearer token is no longer written into `.mcp.json`** (security).
  0.7.7 inlined it as `"Authorization": "Bearer <token>"` — but `.mcp.json` is the
  file Claude Code expects you to commit ("designed to be checked into version
  control"), so the first commit after registering would have put a live token in
  git history. The entry now references `${DEVDECK_MCP_TOKEN}`, which Claude Code
  expands from the environment, and DevDeck sets that var in the agent sessions it
  starts. `.mcp.json` is safe to commit and share — a teammate supplies their own
  token. Re-running **Add to this project** rewrites an inlined token from 0.7.7.
  **If you registered on 0.7.7 and committed, treat that token as leaked:** rotate
  it in Settings → MCP.

## 0.7.7 - 2026-07-27

- **DevDeck is an MCP server** - agent CLIs can now *pull* context instead of you
  pasting it in. Turn it on in **Settings → MCP** and "Add to this project", and
  Claude Code gets `devdeck_projects`, `devdeck_db_connections`,
  `devdeck_db_tables` and `devdeck_db_query` - so an agent reads your project's
  live database itself, mid-task, rather than reasoning over a table you copied
  ten minutes ago. Registered in `.mcp.json` over HTTP (hosted by DevDeck, so the
  tools run in the process that already holds the connection pools).
  **Read-only and local:** writes are refused, credentials are never sent to the
  agent, results are row-capped, it binds to `127.0.0.1` only behind a bearer
  token, and it's off by default.
- **Pipeline gates can check ground truth** - two new gate modes, **Command
  succeeds (exit 0)** and **Command fails (non-zero exit)**, decide from the
  machine instead of from the agent's prose. "All tests pass now" satisfies a
  text gate whether or not it's true; `npm test` cannot be talked into passing.
  The second mode is how you assert a negative - `git diff --quiet` exits
  non-zero exactly when the tree is dirty, i.e. when the agent really did change
  something. Commands run in the project directory, are killed at their timeout,
  and a check that never launched fails rather than passing.
- **Hand a diff to a different agent** - the AI actions in Review changes gain a
  **with \<agent\>** picker, so "have Codex review what Claude just wrote" is one
  click. When the reviewer isn't the agent that last worked in the project, the
  prompt says so and tells it not to assume the changes are correct - an agent
  re-reading its own diff tends to defend it.
- **Conflict warning at dispatch, not after** - dispatching a task without a
  worktree now names any agent already editing that project ("claude 1 is
  already editing this project (store.ts, gate.ts)") and points at the worktree
  toggle. The in-flight conflict map only tells you once both agents have
  written; this is the same question asked while it's still avoidable.
- **`npm run typecheck`** - added, and now at zero errors. `electron-vite` builds
  without typechecking, so nothing had been running `tsc`; a stale error in the
  editor panel had been sitting there long enough that any new error was just
  more noise. Fixed by typing the editor ref from Monaco's own signature.

## 0.7.6 - 2026-07-27

- **One-click Resume** - the primary agent's launch button gains a quieter paired
  **↻ Resume**, so continuing your last session (`claude --continue`) is a peer of
  starting a fresh one instead of being buried in the agent dropdown. Only shown
  for agents that define resume args.
- **Terminal pane no longer sticks to the previous project** - after switching
  projects the pane kept rendering, and typing into, the *previous* project's
  shell, so anything typed after a switch went to the wrong session. Its
  xterm/pty attach effect is mount-once and the pane wasn't keyed on its terminal
  id, so React reused the instance without re-binding.
- **Commit honours staging** - the review modal offers per-file stage/unstage, but
  committing ran `git add -A` first, so a file you deliberately *unstaged* was
  re-staged and committed anyway. Staging anything now scopes the commit
  ("Commit staged (N)"); with nothing staged, commit-everything is unchanged.
- **Multi-statement SQL no longer silently truncated** - a pasted SQLite script
  (`CREATE …; INSERT …;`) ran only its first statement and dropped the rest with
  no error.
- **Pre-flight on the two clicks that spend money** - dispatching a board task
  fired instantly without naming which agent it used, created a worktree, and
  pasted the card title into the CLI; running a pipeline starts an agent session
  per step in whatever project is active. Both now confirm first. File triggers
  are already opted into, so they bypass it.
- **Permission-bypassing agents are marked** - `--dangerously-skip-permissions`
  (and `--yolo` / `--full-auto` / `--auto-approve`) were one-click cards styled as
  peers of a normal launch; they now carry a danger stripe and say what they skip.
  Matched on the command line, so custom agents are flagged too.
- **Ctrl+K no longer leaks into the shell** - app-reserved chords (Ctrl+K,
  Ctrl+1..9, Ctrl+Tab, Ctrl+Shift+P/F/B/R/J/K) were still encoded by xterm, so
  opening the switcher left a stray `^K` on the command line.
- **Ctrl+Shift+I works everywhere** - the prompt-composer chord was dead outside
  Terminal view while the launcher, shortcuts overlay and palette all advertised
  it; it now switches view first.
- **Palette finds the buried panels** - AI usage, the agents inbox and the
  pipeline builder had no palette entries (they existed only as unlabelled deck
  icons); rows now also show their shortcut.
- **Smaller legibility fixes** - the deck's "N changes" chip opens the diff;
  Mission's SYSTEM row folds ephemeral ports into "+N more" instead of ~24 chips;
  the usage dashboard's unexplained "other" bucket is now "outside DevDeck
  projects"; Run explains itself when `package.json` won't parse instead of
  claiming no runnable project type; HTTP errors surface the real
  `ECONNREFUSED`/`ENOTFOUND` instead of a bare "fetch failed"; agent-menu rows are
  keyboard-reachable buttons; a saved request no longer repeats its method chip;
  a newly added DB connection is selected.

## 0.7.5 - 2026-07-26

- **Inline Approve / Deny for agent permission prompts** - answer an agent that's
  waiting on a permission question straight from its Overview tile, without
  jumping into the session.
- **Curated recommended startup commands** - an "Add recommended" action that
  merges any of the bundled agent/command presets your config is missing.

## 0.7.3 - 2026-07-26

Consolidated entry: this release accumulated ~60 commits over two weeks and was
tagged without a changelog pass, so it is grouped by theme rather than split into
the untagged 0.7.1/0.7.2 that never shipped.

- **Extend Agent hub** - browse, preview, install and remove agent **skills and
  subagents** from a catalog (or a URL), scoped per project or per user, with
  full read-before-install and path-traversal guards.
- **Per-project visual identity** - a colored monogram tile per project (with
  optional emoji/color overrides), shown in the switcher and topbar.
- **Console deck declutter + cross-project Overview** - icon-first views and a
  leaner status bar; a new Overview terminal layout (focus+rail / grouped grid)
  spanning projects, with session rename and collapsible, persisted groups.
- **Agent supervision** - an explicit **"waiting for you"** state when an agent
  finishes a turn, a jump-to-waiting hotkey (Ctrl+Shift+J), per-tier notification
  sounds, and **one-click resume of agent sessions after a restart**.
- **Pipelines: branching, delays and manual checkpoints** - conditional routing
  between steps, delay nodes, and checkpoints that pause for you.
- **One-click Run** - a topbar Run for Node/.NET/Go projects, plus **Watch** in
  the .NET panel (build/test/watch now complete).
- **Startup commands** - per-agent and per-terminal startup commands.
- **Corporate proxy support** - proxy configuration applied to terminals and
  child processes.
- **Mobile client gains coding + AI** - not just terminals.
- **Session recordings export** - save a session as an asciinema `.cast`.
- **Composer image input** - drop or paste an image into the prompt.
- **Switcher** - MRU ordering, preselect-previous, Ctrl+Shift+K to flip to the
  previous project, and responsive columns with arrow-key navigation.
- **Accessibility pass** - a shared `<Modal>` (Escape, focus trap, roles) adopted
  across every modal, `IconButton` with aria-labels, deck keys / terminal tabs /
  accent swatches as real buttons, keyboard-and-focus tooltips, and full
  arrow/Enter/Escape navigation in context menus.
- **Design polish** - bundled mono font, scrim/radius token sweep, `--faint`
  retuned to clear AA contrast, unified section-label typography, and unified
  overlay entrance easing.
- **Hardening** - IPC upload directory confined to a project, write payloads
  capped, and traversal guards on skill install/remove.
- **Terminal** - explains *why* a shell died, including an Avast/fast-fail hint.

## 0.7.0 - 2026-07-10

- **Agent context files** - the tool cluster gains a **Context** popover listing the
  active project's agent memory files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`): open a
  present one in the editor, or create a missing one from a seeded starter template.
  Root-only; a lens over the real files the CLI agents already load.
- **MCP server catalog** - the MCP settings section gains an **Add from catalog**
  list of common servers (filesystem, github, memory, sequential-thinking,
  puppeteer, brave-search, postgres, sqlite, fetch, slack). One click drops an
  editable `npx`-based server template (command/args/env) into the project's
  `.mcp.json`; already-added servers show **Added** and disable.
- **File-ownership / conflict map** - Mission Control gains an "In-flight changes"
  section showing which agent is changing which files (across their worktrees), and
  flags a file two agents in the same project both touched as a **conflict** (a
  coming merge collision). Click an owner to jump to that session.
- **Task board** - a per-project kanban (**Todo · Doing · Review · Done**) as a new
  **Tasks** view (Ctrl+2). Create task cards (or paste a checklist), **dispatch** one
  to an agent in its own git worktree (toggle), and the card auto-moves to **Review**
  when that agent finishes a turn; jump to the session, open its diff, or move it on.
- **Token & cost dashboard** - the AI usage panel now shows real token counts and
  **estimated USD cost** (total, by model, by project, by day), parsed from Claude
  Code's local transcripts (`~/.claude/projects/**.jsonl`) - no provider API needed.
- **Mission Control refinements** - tiles sort **attention-first**, show
  **time-since-last-output**, **expand** to read an agent's recent output inline,
  and flag **stalled** agents (working but silent past a threshold).
- **Notifications hub** - a Settings section to get a **desktop notification** and/or
  **sound** when an agent needs attention (click the notification to jump to it).
- **Editor snippets** - insert a saved snippet at the editor cursor (previously
  snippets were composer-only).

## 0.6.0 - 2026-07-08

- **Mission Control - a supervision-first home.** The new **default view**
  reflects how work has changed: you spend your day *following* AI agents, not
  hand-editing code. It shows every live agent across *all* your projects as a
  tile (status + a live peek of its latest output), a cross-project **review
  queue** of repos with uncommitted AI changes (open the diff or fire the
  role-panel lenses), and a **SYSTEM** strip (Docker containers + listening dev
  ports). The **Editor is demoted** from a co-equal view to a tool you drop into,
  and deck agent-keys gained the same live output peek.
- **Console Deck shell** - the biggest layout change since launch. The left icon
  rail and resizable sidebar are gone; navigation moves to a slim **topbar**
  (brand · active-project switcher · view breadcrumb · command pill) and a bottom
  **Console Deck** - a live control surface where your agent sessions are "keys"
  grouped by project (status dot, rename, drag-to-agent, attention), alongside a
  view switcher, a tool cluster, and the git/branch/identity status folded in. The
  main panel is now full-width. Project management (add, group, reorder, presets,
  new-group) moved into the upgraded **Ctrl+K** switcher. Reskins across all
  themes & styles; keyboard: **Ctrl+1…6** switch view, **Ctrl+Tab** cycle sessions.
- **Fire one prompt at many agents** - the prompt composer gains a target selector
  (agent sessions grouped by project, with All / This-project / Idle presets) so a
  single prompt fans out to every chosen session at once; a confirm guards larger
  broadcasts.
- **Cross-project search** (**Ctrl+Shift+F**) - search file contents across *all*
  your projects at once (`git grep`, fixed-string, case-insensitive); results are
  grouped by project and clicking one opens the file at its line in the editor.
- **.NET build / test with clickable errors** (**Ctrl+Shift+B**) - run
  `dotnet build`/`test` for the active project and get MSBuild diagnostics as a
  clickable list that jumps to `file:line`; handles no-project and missing-SDK.
- **Role-panel review** (**Ctrl+Shift+R**) - fan the current changes out to a panel
  of agent reviewers, one per lens (correctness / security / .NET / performance /
  tests), laid out in the grid so each review is read side by side.

## 0.5.11 - 2026-07-07

- **Refined visual craft (every theme & style)** - a global design-token pass that
  makes the whole app feel more premium while staying calm and legible: a bundled
  **Inter + Geist Mono** type pair (shipped offline, no download), a refined type
  scale, a layered **elevation** system (soft shadows on cards, menus and modals,
  tuned per light/dark), unified motion timing with a subtle button-press response,
  and **tabular numerals** so counts, durations and status digits line up. It
  re-binds every theme and style with no layout changes; your terminal font is
  untouched.
- **UI polish** - the primary **+ Claude** action is now a filled accent button; a
  keyboard **focus ring** works in every style and the Settings theme/style pickers
  are keyboard-reachable; a single terminal now fills the cockpit instead of a small
  card; the command-palette hint shows the correct **Ctrl+Shift+P**; Settings shows
  all seven themes (Aurora/Neo were cut off); and inline `...`/edit glyphs are now
  crisp icons.
- **Performance** - the status bar throttles its git polling and pauses while the
  window is hidden; mobile session sync only runs when the remote server is enabled.

## 0.5.10 - 2026-07-01

- **Fix** - eliminated a cursor hand/arrow flicker caused by hover-lift transforms
  in the newer styles.

## 0.5.9 - 2026-07-01

- **Modern look & motion** - an animated icon rail and a **global motion layer**
  (floating surfaces ease/scale in, interactions give press feedback; all disabled
  under `prefers-reduced-motion`), plus three new opt-in skins: **Aurora Glass**,
  **Neo Holographic**, and **Kinetic Minimal**. DESIGN.md synced.

## 0.5.8 - 2026-07-01

- **Image-preview editor tabs** - open images in the editor as preview tabs.
- **Expandable icon rail** - the rail expands to show icon + label.
- **Per-project saved commands** - a saved command runner scoped to each project.

## 0.5.7 - 2026-06-30

- **Agent pipeline live UI** - a per-step run timeline (status, gate notes,
  jump-to-session) plus a launcher in the new-terminal menu.

## 0.5.6 - 2026-06-30

- **Export to file** - export Database grids and API responses to **CSV / JSON**.

## 0.5.5 - 2026-06-30

- **API request chaining** - extract response values into session variables
  (`{{name}}`) for use in later requests.

## 0.5.4 - 2026-06-30

- **Per-project environment variables** - injected into terminals and agent
  sessions, encrypted at rest.

## 0.5.3 - 2026-06-30

- **Per-terminal shell override** - choose the shell per terminal.
- **Auto-update** - via electron-updater + GitHub releases (dormant until releases
  are public).

## 0.5.2 - 2026-06-30

- **Encrypted Git PATs** - stored encrypted, for HTTPS push.
- **API response tests/assertions** - assert on captured responses.
- **Opt-in remote TLS** - self-signed HTTPS/WSS for the remote server.

## 0.5.1 - 2026-06-29

- **Remote security hardening** - constant-time token auth, mobile-client
  quote-escaping, and a task-runner allowlist.
- **Workflow** - push-on-attention notifications, pipe a result into an agent,
  Database query history, and renameable sessions.

## 0.5.0 - 2026-06-29

- **Task runner** - run saved project commands/tasks.
- **Agent triage inbox** - every session, attention-first, with quick reply.
- **Workspace presets** - saved workspace layouts.
- **AI usage dashboard** - session activity by agent & project.

## 0.4.8 - 2026-06-29

- **Network → API** - the Network inspector has a **→ API** button that loads the
  selected captured request (method, URL, headers, body) into the API client to
  replay or edit. Disabled for tunneled HTTPS captures.
- **DESIGN.md** rewritten in Google's DESIGN.md token+rationale format (front-matter
  design tokens + canonical sections), and a repo **CLAUDE.md** added that points
  agents at it for UI work. (Docs only.)

## 0.4.7 - 2026-06-29

- **Right-click context menus** - on projects (Open / Move to group / Remove),
  terminal tabs (Rename / Split right / Split down / Close), and API requests &
  collections (Open / Duplicate / Move to / Delete). Cursor-positioned, dismissed
  by clicking away.
- **Undo toasts** - deleting an API request or collection now removes it instantly
  and shows a "Deleted X · Undo" toast (restoring it at its original spot) instead
  of a blocking confirm dialog.

## 0.4.6 - 2026-06-29

- **Cross-panel drag** - drag an editor file, or a database table, onto a running
  agent session in the sidebar to feed it to that agent: a file inserts its
  `@path`, a table inserts `SELECT * FROM <table>`, and the view jumps to that
  terminal. Generalizes the old "send @path to the last agent" button into a
  gesture that can target any specific session.

## 0.4.5 - 2026-06-29

- **Modern look (opt-in)** - a new **Graphite** theme (cool near-black neutrals
  with a vivid indigo accent) and **Modern+** style (crisp radii, hairline borders
  with soft elevation, vivid filled accent buttons, focus rings, snappy
  micro-interactions). Settings → Appearance; the warm wabi-sabi default is
  unchanged.
- **Drag & drop** - reorder projects (drag onto another project, or onto a group
  header to move it); drop an OS folder onto the project list to add it as a
  project; reorder API requests and collections; and **drag terminal tabs to
  reorder, or drop one onto a pane to split** (VS Code-style 4-way drop zones).
  Terminal sessions persist across a tab move - no restarts.

## 0.4.4 - 2026-06-29

- **SQL Server support** - a fourth database engine (Database panel → New
  connection → **SQL Server**) via the pure-JS `mssql`/`tedious` driver (no
  native build, like `pg`/`mysql2`). Connect / test / list tables / run SQL
  like the others; the **SSL** toggle maps to `encrypt` with
  trust-server-certificate so local/dev instances work. Default port 1433.
  Also usable from the mobile/remote DB client.

## 0.4.3 - 2026-06-29

- **AI settings** - new Settings → AI section: per-agent **default model** (injected
  at launch via the agent's model env var, e.g. `ANTHROPIC_MODEL`) and **API key**.
  Keys are encrypted at rest (DPAPI/`safeStorage`) and injected into the agent's
  terminal env at spawn - never written to `settings.json` or sent back to the UI.
  A stored key flips that agent to pay-as-you-go API billing. (Usage/quota display
  is deferred - it needs per-provider APIs.)

## 0.4.2 - 2026-06-29

- **Lacquer style** - a new opt-in design style (Settings → Appearance → Style):
  frosted-glass surfaces, gilded gradient accent buttons, a soft accent glow on
  active tabs / rail / the ensō, and deep layered shadows. Animated - a periodic
  light-sheen sweep across accent buttons and a slow breathing glow on the ensō
  (both honor `prefers-reduced-motion`). Purely additive; existing styles and the
  default are unchanged.
- **Local signed builds** - `npm run cert:make` then `npm run package:signed`
  produce an Authenticode-signed build using a self-signed cert trusted on your
  machine, to avoid unsigned-binary antivirus / SmartScreen false positives.
  (Personal-use only; distribution needs a purchased OV/EV cert.)

## 0.4.1 - 2026-06-29

- **Wabi-sabi design pass** - a real ensō brand mark (rail logo + sidebar)
  replacing the placeholder; a faint ensō watermark behind empty states so they
  read as intentional space; lifted muted/faint text contrast across all themes
  (the faint tier was failing WCAG AA); the Settings modal now dims + blurs its
  backdrop for focus.
- **Terminal toolbar declutter** - regrouped into create / layout / pane clusters,
  with the secondary tools (record, recordings, worktrees, review changes) moved
  into a `⋯` overflow menu and the redundant composer button dropped. 13 → 10.

## 0.4.0 - 2026-06-28

- **Network debugging panel (Milestone 4)** - a local loopback HTTP forward proxy
  (off by default) that captures traffic for inspection: full HTTP with
  gzip/deflate/br body decoding; HTTPS tunneled via CONNECT (metadata only - no
  MITM). New **Network** view with a live request list, a headers/body inspector
  (JSON pretty-printed), and host / method / status / project filters. Point a
  client's `HTTP_PROXY` / `HTTPS_PROXY` at the proxy address to capture it.

## 0.3.4 - 2026-06-28

- **Tooltips everywhere** - swept the rest of the icon/affordance buttons across
  all modals and panels onto the custom `data-tip` tooltip (status-bar items show
  theirs upward so they don't clip).
- **Plain hyphens** - replaced em-dashes ("—") with regular hyphens ("-") in all
  UI text and labels, per preference.

## 0.3.3 — 2026-06-28

- **Tooltips** — hover any icon button (the rail, terminal toolbar, sidebar,
  status bar) and a styled tooltip explains what it does after a brief pause.
  Hidden by default; rendered as a fixed-position chip so it never clips against
  the rail or panes. Opt-in via `data-tip` — richer and more legible than the
  old native title tooltips.

## 0.3.2 — 2026-06-28

- **AI on the diff** — Review changes now has AI actions: **Review / Explain /
  Commit msg / PR description** feed the working diff to an agent (in the right
  repo or worktree) and ask for exactly that. Turns the review surface active.
- **Open PR** — from Review changes, push the branch and open a pull request.
  On **Azure DevOps** it creates the PR via the API (using your Work PAT) and
  opens it; on GitHub/other it pushes and opens the host's create-PR page.
  Detects the remote automatically, with a target-branch + title + description
  composer (draft the description with the AI button).
- Completes the loop: **Jira/Azure ticket → worktree → agent → review → PR →
  release board**, all in one window.

## 0.3.1 — 2026-06-28

- **Slim icon-rail layout** — primary navigation moved to a 58px icon rail on the
  far left: the five views (terminal / editor / API / database / browser) switch
  from the rail with an active accent indicator, and the cross-cutting tools
  (work, activity, standup, release, shortcuts, settings) sit at its foot. The
  sidebar slimmed to projects + sessions, and the top bar is now a breadcrumb +
  a **⌘K command pill**. Completes the modernization.

## 0.3.0 — 2026-06-28

Modernization pass — DevDeck looks like a contemporary product now.

- **Line-icon system** — a new inline-SVG icon set (Lucide-derived) replaces the
  Unicode glyphs across the sidebar, terminal toolbar, and status bar. One weight,
  one grid, currentColor; no icon font / dependency (proxy-safe). This is the
  single biggest "modern" upgrade.
- **Slate theme** — a cool slate-blue color theme that keeps the warm amber accent
  (warm-on-cool reads modern). Joins Sumi / Washi / Zen.
- **Modern Pro style** — a clean contemporary design style: 8px radii, subtle
  elevation, snappy transitions, a focus ring, tight type. Pairs with Slate.
- **New default look** — fresh installs open in **Slate + Modern Pro**. Existing
  setups can switch in Settings → Appearance (your six other styles + three other
  themes remain). 7 styles × 4 themes now available.
- Next: a slim icon-rail layout + top command bar (structural; coming separately).

## 0.2.6 — 2026-06-28

- **Phosphor CRT style** — the sixth and final design style: monospace chrome,
  a scanline wash with gentle flicker, and phosphor glow on accents. Set a green
  accent on a dark theme for the classic green-screen look. The design-style set
  is now complete: **Wabi-sabi, Modern Minimal, Neon, Flat Vector, Bauhaus,
  Phosphor CRT** — 6 styles × 3 color themes = 18 combinations.

## 0.2.5 — 2026-06-28

- **Bauhaus style** — a fifth design style: hard square corners (0 radius), heavy
  2px frames, filled uppercase accent blocks, square dots/pills, and a signature
  **hard offset shadow** (solid accent block, no blur) behind floating surfaces.
  Bold, structural, poster-like. Five styles now ship: Wabi-sabi, Modern Minimal,
  Neon, Flat Vector, Bauhaus — each combinable with any color theme.

## 0.2.4 — 2026-06-28

- **Flat Vector style** — a fourth design style: big rounded corners, **filled
  accent buttons**, fully-rounded pill badges, and soft card elevation that lifts
  surfaces off the background. Friendly and product-y; reads brightest on the
  Washi (light) theme. Four styles now ship: Wabi-sabi, Modern Minimal, Neon,
  Flat Vector — each combinable with any of the three color themes.

## 0.2.3 — 2026-06-28

- **Neon style** — a third design style: glassy blurred panels, glowing accents
  (active tab, accent buttons, focused inputs/pane), glowing status dots, and a
  subtle scanline wash. The glow is driven by your **accent color**, so it works
  with any theme — set a cyan accent on a dark theme for the classic neon look.
- **Modern Minimal, sharpened** — pushed further so it reads as a distinct style:
  tighter radii (modal 12→6px, controls →4px), denser padding, near-flat depth
  (crisp 1px edge instead of a soft glow), and tighter UI type.

## 0.2.2 — 2026-06-28

- **Design styles** — a new **Style** picker in Settings → Appearance, independent
  of the color theme. Ships **Wabi-sabi** (default — warm, soft, generous) and
  **Modern Minimal** (crisp small radii, flat surfaces, tighter spacing & snappier
  interactions — Linear/Vercel-style). Style × color theme combine freely (e.g.
  "Modern Minimal + Zen dark"); the choice persists. See `DESIGN.md`.

## 0.2.1 — 2026-06-28

- **Standup / worklog generator** — the ▤ sidebar button (or command palette)
  collects the commits you authored across every project in a time window
  (Today / 24h / 3 days / 7 days), plus uncommitted work and the session's agent
  activity, and renders an editable markdown standup: **Done / In progress /
  Next**. Tweak it and **Copy markdown** to paste into Jira or your standup.
  Commits are filtered to your git email per repo.

## 0.2.0 — 2026-06-28

- **Release / promotion board** — model a project's deploy stages (Dev → UAT →
  PROD), each mapped to a git ref, and see at a glance what commit sits in each
  and **how many commits are waiting to be promoted** to the next. Click a gap
  to see the exact commits, tick a **pre-flight checklist**, then either **send
  the promote commands to a terminal**, copy them, or **tag the release**.
  DevDeck never pushes for you — promotion stays explicit. Open via the
  ⬆ release button in the status bar or the command palette; stages + checklist
  are editable and stored per project in `.devdeck/release.json`.
- **Proxy support** — work-item calls now route through a corporate proxy
  (HTTPS via CONNECT tunnel, HTTP via absolute-form), configured in the Work
  drawer or auto-detected from `HTTPS_PROXY`/`HTTP_PROXY` env vars. Pairs with
  the existing "ignore TLS errors" toggle for locked-down corporate networks.

## 0.1.9 — 2026-06-28

- **Work panel (Jira + Azure DevOps)** — the ◷ sidebar button (or command
  palette) opens a drawer listing your assigned work items. **Start work** on a
  ticket launches an agent session (optionally in a fresh worktree) pre-seeded
  with the ticket brief — title, type, status, link, description — and asks it to
  investigate and propose a plan before changing code. Your day starts from the
  ticket, not a blank terminal. **Open ↗** jumps to the item in your browser.
  - Connect via the drawer's ⚙: Jira (base URL + email + API token + JQL) and/or
    Azure DevOps (org URL + project + PAT + WIQL). Tokens are encrypted on-device
    (safeStorage) and never read back into the UI. All calls happen in main (no
    CORS), with an **"ignore TLS errors"** option for corporate MITM proxies.

## 0.1.8 — 2026-06-28

- **Worktree-per-agent** — spin up an agent (or shell) in its own git worktree
  so parallel sessions on one repo don't collide. Settings via the ⑂ toolbar
  button / command palette: name a branch, pick an agent, and it creates a
  worktree in a sibling `<project>.worktrees/` folder and launches the session
  pinned to it. List and remove worktrees from the same place.
- **Unified change review** — the ✓ toolbar button (or "Review changes" in the
  palette, or a worktree's "review") opens a diff viewer for any project or
  worktree: per-file colorized diffs, **stage / unstage / discard**, and a
  **commit-all** with a message. Review what the agents wrote before it lands.
- Per-terminal working directory is now persisted (so worktree sessions survive
  restarts).

## 0.1.7 — 2026-06-28

- **Pipeline file-triggers** — auto-run a pipeline when files matching a glob
  change in a project. Configure in Settings → Pipelines → File triggers
  (project, glob like `src/**/*.cs`, target pipeline, debounce). Triggers are
  **off by default**; a fired trigger switches to the project and runs the
  pipeline, and won't start while another run is in progress. Watching ignores
  `node_modules`, `.git`, build output, etc. Fires are logged to the activity feed.
- Also lands in-progress API **request collections** (Postman-style saved
  requests sidebar) alongside the existing environments work.

## 0.1.6 — 2026-06-28

- **Per-step success gates** — a pipeline step can now require its agent's output
  to pass a check before advancing: "output contains", "does NOT contain", or
  "matches /regex/". On failure it retries up to N times, then either stops the
  run or continues. The runner bar shows gate status live (✓ passed / retrying /
  ✗ failed). The starter pipeline's Verify step ships with a gate that re-runs
  until the test output shows no failures.
- **API environments** — define named environments (dev / UAT / PROD) of
  `{{variable}}` values and switch the active one from the API client. URL,
  headers, and body interpolate `{{tokens}}`; unresolved tokens are flagged.

## 0.1.5 — 2026-06-28

- **Agent pipelines** — define an ordered sequence of prompts (each routed to an
  agent) that runs hands-free: each step is sent, waits for the agent to settle,
  then the next fires. Same-agent steps reuse one session so context carries
  across them; tick "fresh" to force a new session. Edit pipelines in
  Settings → Pipelines (title, agent, prompt, reorder); run from there or the
  command palette. A floating runner bar shows step/progress with a Stop control;
  closing a pane mid-run is handled, and runs are logged to the activity feed.
  Ships with a starter "Investigate → Fix → Verify" pipeline.

## 0.1.4 — 2026-06-28

- **Terminal record & replay** — hit ⏺ in the terminal toolbar to record a
  session's output (with timing); ▷ opens the Recordings player to replay it
  with play/pause, restart, and 1×–8× speed. Recordings are saved per project
  under `.devdeck/recordings/` and survive restarts. A recording is auto-saved
  if you close the pane mid-record. (Also reachable from the command palette;
  recorded events show in the activity feed.)

## 0.1.3 — 2026-06-28

- **Browser network capture** — Comment Mode's "Send to AI" now includes captured
  network requests (summary + failed/4xx/5xx) alongside comments, console, and screenshot.
- **API smart-paste** — paste a cURL command into the URL bar and it auto-parses.
- **Activity feed** (⧗) — agent events (started / needs-attention / closed) across all
  projects; click to jump.
- **Canvas connectors** — link terminal cards with ⚯; lines follow pan/zoom; persisted.

## 0.1.2 — 2026-06-28

- **Command palette** (`Ctrl+Shift+P`): fuzzy-run any action — views, layouts, themes,
  new agent/SSH sessions, jump-to-session, settings. (Composer moved to `Ctrl+Shift+I`.)
- **Canvas zoom** (`Ctrl+scroll`, 40–200%; double-click to reset).
- **MCP settings** — manage the active project's `.mcp.json` (command/args/env).
- **Hardening (audit batch 2):** filesystem access confined to open project roots,
  editor refuses binary files, terminal fit() zero-dimension guard.
- Tests up to 34 (added fs-confinement + MCP round-trip).

## 0.1.1 — 2026-06-27 (hardened)

Security & robustness pass from a multi-agent audit (17 confirmed findings):

- **Security:** sanitize markdown preview (renderer XSS); SSRF guard on remote HTTP
  relay; remote DB access is read-only; WebSocket payload cap; remote server binds
  to the Tailscale interface when present instead of all-interfaces.
- **Robustness:** flush pending writes on quit (no more lost drafts/settings);
  atomic config writes (no corruption on crash); PTY replay no longer breaks
  mid-escape; canvas positions cleaned up; sqlite probe handle closed.
- **Tests:** first Vitest suite (26 tests) — layout engine, cURL parser, theme
  math, SSH builder, security guards.

## 0.1.0 — 2026-06-27 (first installable build)

First packaged release. Terminal-first dev cockpit:

- Multi-agent terminals (Claude/Codex/Gemini/custom) with Tabs / Grid / Canvas
  layouts, splits, persistence, session registry, resume, send-to-agent.
- Monaco editor (+ markdown Edit/Split/Preview), API client (+ cURL import),
  database (PostgreSQL/MySQL/SQLite), embedded browser with comment-to-AI.
- Prompt composer (@file + /snippet), project groups + Ctrl+K switcher, three
  wabi-sabi themes, status bar with git identity, Git accounts, SSH hosts.
- Mobile remote (terminals + DB + HTTP + file attach) over a token-guarded server.
- Installable via electron-builder (NSIS + portable).
