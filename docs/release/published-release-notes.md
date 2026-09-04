# The 14 published GitHub releases, harvested before the remote is deleted

This is a **verbatim archive**, not documentation. It exists because ROADMAP step 4
deletes and recreates `Midor2Mid/devdeck` (see `step-4-public-flip.md`), and a repository
delete takes its releases with it. The bodies below are the only record of how this
product has ever described itself to someone who was not building it - and most of what
is in them is **not** in `CHANGELOG.md`: the install instructions, the SmartScreen
warning, the "what this release is" framing and the known-issues wording appear nowhere
else in the repo. Re-use them when the recreated repo needs its first release notes.

Harvested 2026-09-04 with `gh api repos/Midor2Mid/devdeck/releases --paginate`.
The binaries are deliberately **not** archived: every tag v0.1.0..v0.12.0 is an ancestor
of `main`, so any of them can be rebuilt, and `release/` already holds a signed 0.12.0.

## The measurement that stops being a measurement

Lifetime downloads across all 14 releases and 28 installers, read from the GitHub API
the day before the delete:

| | |
|---|---|
| Releases | 14 |
| Release assets | 36 (28 installers, 3,053,592,909 bytes) |
| **Lifetime downloads, all assets** | **1** |
| Of which installers | 0 |

The single download is a 346-byte `latest.yml` on v0.10.0 - an `electron-updater` poll,
almost certainly from the author's own machine. **No human has ever downloaded a DevDeck
installer.** Recorded here because after the delete that stops being something the
project can cite and becomes something it merely asserts; `PRODUCT.md` is entitled to the
measured version.

## Publication timeline

| Tag | Published | Assets | Downloads |
|---|---|---|---|
| v0.10.0 | 2026-08-29 | 4 | 1 |
| v0.8.0 | 2026-08-17 | 4 | 0 |
| v0.7.12 | 2026-08-10 | 4 | 0 |
| v0.6.0 | 2026-07-08 | 2 | 0 |
| v0.5.9 | 2026-07-01 | 4 | 0 |
| v0.5.8 | 2026-07-01 | 2 | 0 |
| v0.5.7 | 2026-07-01 | 2 | 0 |
| v0.5.6 | 2026-07-01 | 2 | 0 |
| v0.5.5 | 2026-07-01 | 2 | 0 |
| v0.5.4 | 2026-07-01 | 2 | 0 |
| v0.5.3 | 2026-07-01 | 2 | 0 |
| v0.5.2 | 2026-07-01 | 2 | 0 |
| v0.5.1 | 2026-07-01 | 2 | 0 |
| v0.5.0 | 2026-07-01 | 2 | 0 |

The 10 releases dated 2026-07-01 were cut within three minutes of each other: v0.5.0
through v0.5.9 were backfilled from existing tags in one sitting, which is why their
bodies are one line each.

---

# Release bodies, verbatim

## v0.10.0 - DevDeck 0.10.0 — guards that check the thing, and an app that stops claiming what it doesn't know

*Published 2026-08-29T18:44:37Z. Assets: DevDeck-Portable-0.10.0.exe, DevDeck-Setup-0.10.0.exe, DevDeck-Setup-0.10.0.exe.blockmap, latest.yml*

> The first published build since 0.8.0 — it carries **0.9.0, 0.9.1 and 0.10.0** in one installer. Most of what's here comes from a four-phase audit of DevDeck that produced sixteen ranked fixes; all sixteen are in this build.
> 
> ## Guards that read text now check the thing itself
> 
> Five places inspected a string and then handed the unconstrained operation to `spawn`, `fetch`, `readFileSync` or a SQL driver. Each is now a capability the underlying API already had.
> 
> - **A link no longer walks out of your project.** The filesystem guard resolved `..` textually, so a directory junction inside an open project pointing at `C:\Users\you\.ssh` read as inside the project — and on Windows, making that junction needs no elevation. Both sides are dereferenced for real now. A project you reach *through* a junction keeps working.
> - **A redirect can't take the phone somewhere it isn't allowed.** The private-host check ran once, on the URL you typed, then followed redirects automatically — so any allowed public host could answer `302 → http://127.0.0.1:8787/` (DevDeck's own MCP server, on the machine you're remoting). Redirects are followed one hop at a time and re-checked at each, against the address the name actually resolves to. That's what stops `http://127.1/` and `http://2130706433/`.
> - **Read-only means the database refuses the write.** Remote and agent queries ran a regex over the statement's first word; `WITH x AS (DELETE …) SELECT` starts with "with". Those queries now run in a read-only transaction (PostgreSQL, MySQL) or on a read-only connection (SQLite), so a write fails inside the database rather than being spotted by a pattern.
> - **Two channels that took a path now say which paths are allowed** — a pipeline check spawns a shell in a directory you name, and a SQLite connection *is* a file read.
> 
> Three things this deliberately costs you: **remote and agent SQL against SQL Server is refused** (T-SQL has no read-only transaction, so the promise couldn't be kept — run those in the DB panel yourself); **a SQLite file must be inside an open project or picked in the file dialog** (existing connections are carried over, and Browse still reaches anywhere); and **testing a path that doesn't exist now fails** instead of creating an empty database and reporting a healthy connection to it.
> 
> ## The remote login stops answering as fast as it's asked
> 
> The phone's authentication check was reachable before any credential was proven and answered at socket speed — a guessing oracle against the pairing token, and a way to make DevDeck busy, since every miss walked every paired device's decrypt on the thread that relays every terminal byte. Five misses from one address are free; then the refusal window doubles from a second up to thirty. What grows is the wait, not a strike count — the device most likely to fail repeatedly is your own phone with a revoked token, and a limiter that locks you out of your own machine would be worse than the attack. Any success clears it, and a valid token from elsewhere is unaffected.
> 
> ## The app stops claiming things it doesn't know
> 
> - **"Couldn't check" is no longer spelled "nothing to review."** A failed git read reported zero changes, which is the same shape as a clean tree. That count is nullable now, and every `.catch(() => 0)` that erased the difference is gone.
> - **An agent's state stops depending on whether you were looking.** Visibility gated the *classification*, not just the notification: the identical output produced a notification when you were in your browser and no state change at all when you were on the pane. Only the sound and the pop-up are withheld now. The quiet threshold moves from 1 s to 6 s in the same change — at one second, every tool call read as a finished turn. Expect the attention count to read **higher**; that's the honest number.
> - **A destructive operation's result gets read.** "Discarded." was printed unconditionally, behind a dialog that says *this cannot be undone*. Removing a git account now waits for the token to actually be gone, a worktree that won't remove says why, and four "Copied" messages now copy something — they called an API this app's own permission handler blocks.
> - **No assertion passes on an observation that was never made.** An `absent` check on empty text, and a "gone" pane falling through to done, both counted as success.
> 
> ## The shell, the close, and the stores
> 
> - **A prompt waits for readiness instead of sleeping.** Five sites spawned an agent CLI and slept 2800 ms; a shell that never starts now says so instead of leaving a permanently black pane.
> - **Main owns "is it safe to stop."** Closing the window while agents are live is decided in the main process, with a real veto and a real teardown, and child process trees are reaped.
> - **Undo belongs to the close, not to the view** — closing a pane offers undo wherever it was closed from.
> - **The stores stop destroying themselves** (0.9.1). Every JSON loader turned an unreadable file into an empty value, and an empty value means "nothing configured" — so the next save committed that emptiness over your real data. No click required. A store that can't be read is now never overwritten, `.mcp.json` keeps its other servers, the editor refuses to save over a file that moved, `atomicWrite` flushes before renaming, and your own files get that same crash-safe write. Only one DevDeck runs at a time now, because every store is read-modify-write from main.
> - **Pasting into a terminal can't execute your clipboard** — paste goes through xterm's bracketed-paste support instead of straight to the pty.
> 
> ## Smaller, faster, and actually tested
> 
> From 0.9.0: the agent bake-off and the Inbox drawer are gone, the app is **109 MB smaller** (half the dependencies were packed twice), Electron 43 / Vite 7 with `npm audit` at zero, a dead pane keeps its evidence, and terminal switching, moving and zooming were reworked.
> 
> And the suites are finally checked: `tsconfig.json` included only `src`, so 99 test files could drift from the types they exercise and stay green — the first typechecked run surfaced 25 real mismatches. A CI workflow now runs `npm run typecheck` then `npm test` on every push, on `windows-latest`, because a green run on Linux would be testing a platform DevDeck doesn't ship. **1165 tests, typecheck at zero.**
> 
> One thing this doesn't yet do, despite being the reason it was proposed: the suites' hand-written `window.api` stubs are still cast through `unknown`, so renaming an IPC channel still leaves every suite green.
> 
> ---
> 
> **Installers are signed with a self-signed certificate** (personal use), so SmartScreen will still warn on first run. Download `DevDeck-Setup-0.10.0.exe` to install, or the portable build to run without installing. `latest.yml` is required for auto-update.

## v0.8.0 - DevDeck 0.8.0 — agent routing, paired devices, and the run ledger

*Published 2026-08-17T18:36:39Z. Assets: DevDeck-Portable-0.8.0.exe, DevDeck-Setup-0.8.0.exe, DevDeck-Setup-0.8.0.exe.blockmap, latest.yml*

> Three pieces: who a card dispatches to, who can reach the app remotely, and a durable record of what agent work cost.
> 
> ## Agent routing
> 
> Dispatch used to hand every task-board card to `agents[0]` — whichever preset happened to sit first in Settings — so reordering presets silently changed who did every task. An ordered set of rules now chooses: match a card's title, a title glob, a project, or match always; first enabled rule wins. **Rules choose *who*, never *whether*** — nothing dispatches without a click. The card shows the agent that would run before you click, and names the rule that chose it.
> 
> Two things worth knowing rather than discovering: a **glob is anchored**, so `*login*` is the idiom for "contains"; and routing only ever targets **AI-mode presets**, so a rule pointing at a shell preset is skipped.
> 
> ## Paired remote devices
> 
> Remote access is still full remote code execution for any device that gets in — this changes *who gets in*, not what they can do once there.
> 
> - **A device pairs once and gets its own token**, instead of one shared token that worked forever for anyone who saw it. Settings lists every paired device with when it was last seen, and Revoke stops that one device on its next connection.
> - **Devices go idle** after 7 days, 30 days, or never. Shortening the window acts immediately.
> - **The network the server binds to is a choice, not a guess.** Choosing Tailscale with no tailnet address now refuses to start and says why, instead of silently binding every interface. Existing installs were migrated to Auto, the legacy behaviour, and the panel marks it as the choice to move off.
> - **Tokens are encrypted at rest**, in the same store as git PATs and API keys. The renderer never sees a device token.
> - **Fix:** closing the window mid-boot could write in-memory defaults over `settings.json`, losing every setting.
> 
> ## The run ledger
> 
> A race's or a pipeline's cost used to disappear the moment its pane closed. It now survives, in a new **Runs · all time** section of the usage panel — one row per finished run, filterable by kind and project, showing date, kind, outcome, label, project, agents, duration and cost. A race row says whether it **landed or was abandoned**. Deleting the card, race or pipeline doesn't touch the row.
> 
> **Totals never sum a cost that isn't a receipt.** A cost here is an attribution over a project directory and a time window: DevDeck prices a run by summing every agent transcript under the project's directory across the run's window, because Claude Code names transcripts by project rather than by pty. So a second session in that directory lands in the same figure, and adding two such figures together would double-count the same money. An excluded run is still shown — its figure marked with `~` and a dashed underline — while the total counts only summable rows and states how many were left out, separating a run that genuinely **shared a project** from one whose price simply **couldn't be read**.
> 
> Whether a run shared a project is decided **over the run's own window**, not by what happens to be open when it is filed. That distinction is the feature working or not working: a card is usually dragged to *done* long after its agent finished and its pane closed, so asking "is anyone else here right now?" would have let two cards dispatched into the same project each quietly claim the other's spend — two rows, both presented as receipts, adding up to roughly twice the real number.
> 
> The limit worth knowing: DevDeck can only account for agents **it** started. Type `claude` straight into a plain shell pane and it writes no session record, so a run covering that window is still filed as a receipt over money that was partly that agent's. And the ledger starts empty — past runs can't be honestly reconstructed.
> 
> ---
> 
> **Installers are signed with a self-signed certificate** (personal use), so SmartScreen will still warn on first run. Download `DevDeck-Setup-0.8.0.exe` to install, or the portable build to run without installing. `latest.yml` is required for auto-update.

## v0.7.12 - DevDeck 0.7.12 — pull latest from the deck

*Published 2026-08-10T18:30:57Z. Assets: DevDeck-Portable-0.7.12.exe, DevDeck-Setup-0.7.12.exe, DevDeck-Setup-0.7.12.exe.blockmap, latest.yml*

> Two things that were a trip to the terminal, and one design rule the app wasn't keeping.
> 
> This build also carries **0.7.11**, which was version-bumped but never tagged or built — the last installable release was 0.7.10, so everything from both versions lands here.
> 
> ### Pull latest without leaving the deck
> The status bar told you the branch and what was uncommitted, but getting the branch current still meant a terminal. A pull button now sits beside the branch, and carries the behind-count itself rather than adding a chip: neutral when there's nothing to fetch, accented with a number once you're behind. It only appears when the branch has an upstream.
> 
> It is `--ff-only` on purpose — a one-click action should never invent a merge commit or leave a conflicted tree, so a diverged branch fails with git's own message and the resolution stays a conscious call in the terminal. The behind-count comes off the porcelain status the deck was already polling, so watching for it costs no extra process.
> 
> ### Closing another session takes one click
> Tidying up used to mean pulling a row into focus and then closing the focused pane — two steps, and it moved the thing you were watching. Rail rows now take a × on hover, a middle-click, or Delete when focused. No confirmation, matching every other single-pane close; the row vanishing is the feedback. At rest no row shows a ×, so the list weighs the same as before.
> 
> ### Fixes
> - **Emoji out of the chrome.** DESIGN.md forbids them and three had slipped in — the welcome card's 👋 becomes the ensō (it draws in `currentColor`, so it re-themes), the browser panel's 💬 becomes the pencil its tooltip already promised, and the empty work panel loses its party popper. Left alone deliberately: the 🚀 in the project-icon placeholder, which is user content teaching you an emoji is allowed there.
> - **Rail rows stopped wrapping.** Reserving width for that hidden × is what keeps a row from shifting under the cursor, but it narrowed the row enough that a long project name pushed the session name onto a second line. The session name never wraps now; the project name ellipsizes instead.
> 
> ### Install
> `DevDeck-Setup-0.7.12.exe` is the installer, `DevDeck-Portable-0.7.12.exe` needs no install. `latest.yml` is the auto-update manifest — its hash matches the signed installer bytes.
> 
> Signed with a self-signed certificate (`CN=DevDeck Dev`), so Windows SmartScreen will still warn on a machine that doesn't trust it.

## v0.6.0 - v0.6.0 — Mission Control & the following-first cockpit

*Published 2026-07-08T08:44:58Z. Assets: DevDeck.0.6.0.exe, DevDeck.Setup.0.6.0.exe*

> DevDeck **0.6.0** reframes the cockpit around how work actually happens now: you spend your day *following* AI agents across several repos, not hand-editing code. The default view is a new supervision home, the shell was rebuilt, and six workflow features landed.
> 
> ## ✨ Highlights
> 
> ### Mission Control — a supervision-first home (new default view)
> Every live agent across **all** your projects as a tile (status + a live peek of its latest output), a cross-project **review queue** of repos with uncommitted AI changes (open the diff or fire the role-panel lenses), and a **System** strip (Docker containers + listening dev ports). The Editor is demoted from a co-equal view to a tool you drop into.
> 
> ### Console Deck shell
> The left icon rail and resizable sidebar are gone. Navigation moves to a slim **topbar** (brand · project switcher · breadcrumb · command pill) and a bottom **Console Deck** — agent sessions as live "keys" grouped by project, a view switcher, a tool cluster, and the git/branch/identity status folded in. Full-width main panel. Project management moved into the upgraded **Ctrl+K** switcher.
> 
> ## 🚀 New features
> - **Fire one prompt at many agents** — a target selector (grouped by project, with All / This-project / Idle presets) broadcasts one prompt to every chosen session.
> - **Cross-project search** (**Ctrl+Shift+F**) — search file contents across *all* projects (`git grep`); results grouped by project, click to open the file at its line.
> - **.NET build / test with clickable errors** (**Ctrl+Shift+B**) — run `dotnet build`/`test`; MSBuild diagnostics become a clickable list that jumps to `file:line`.
> - **Role-panel review** (**Ctrl+Shift+R**) — fan the current changes out to a panel of agent reviewers, one per lens (correctness / security / .NET / performance / tests), in the grid.
> 
> ## ⌨️ Keyboard
> `Ctrl+1…7` switch view · `Ctrl+Tab` cycle agent sessions · `Ctrl+Shift+F` search · `Ctrl+Shift+B` .NET build/test · `Ctrl+Shift+R` review · `Ctrl+K` projects · `Ctrl+Shift+P` command palette
> 
> ## 📦 Install
> Download **DevDeck Setup 0.6.0.exe** and run it (per-user install), or use the **DevDeck 0.6.0.exe** portable single-file.
> 
> > **Note:** this build is **unsigned**. Windows SmartScreen will warn on first run — click **More info → Run anyway**. (A code-signed build is produced separately.)
> 
> Windows 10/11, x64.

## v0.5.9 - DevDeck 0.5.9

*Published 2026-07-01T02:38:19Z. Assets: DevDeck.0.5.9.exe, DevDeck.Setup.0.5.9.exe, DevDeck.Setup.0.5.9.exe.blockmap, latest.yml*

> Modern look and motion: animated rail, a global motion layer, and three new skins - Aurora Glass, Neo Holographic, Kinetic Minimal. Plus an Electron security hardening pass (sandbox, strict CSP, permission and navigation guards).
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.8 - DevDeck 0.5.8

*Published 2026-07-01T02:37:54Z. Assets: DevDeck.0.5.8.exe, DevDeck.Setup.0.5.8.exe*

> Image-preview editor tabs, an expandable icon rail (icon + label), and a per-project saved command runner.
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.7 - DevDeck 0.5.7

*Published 2026-07-01T02:37:41Z. Assets: DevDeck.0.5.7.exe, DevDeck.Setup.0.5.7.exe*

> Agent pipeline live UI: per-step run timeline (status, gate notes, jump-to-session) plus a launcher.
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.6 - DevDeck 0.5.6

*Published 2026-07-01T02:37:29Z. Assets: DevDeck.0.5.6.exe, DevDeck.Setup.0.5.6.exe*

> Export DB grids and API responses to file (CSV / JSON).
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.5 - DevDeck 0.5.5

*Published 2026-07-01T02:37:17Z. Assets: DevDeck.0.5.5.exe, DevDeck.Setup.0.5.5.exe*

> API request chaining: extract a response value into a session variable later requests use as {{name}}.
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.4 - DevDeck 0.5.4

*Published 2026-07-01T02:37:04Z. Assets: DevDeck.0.5.4.exe, DevDeck.Setup.0.5.4.exe*

> Per-project environment variables injected into every terminal/agent session, encrypted at rest.
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.3 - DevDeck 0.5.3

*Published 2026-07-01T02:36:52Z. Assets: DevDeck.0.5.3.exe, DevDeck.Setup.0.5.3.exe*

> Per-terminal shell override (PowerShell/cmd/Git Bash/WSL) and auto-update via electron-updater.
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.2 - DevDeck 0.5.2

*Published 2026-07-01T02:36:31Z. Assets: DevDeck.0.5.2.exe, DevDeck.Setup.0.5.2.exe*

> Encrypted Git PATs for HTTPS push, API response tests/assertions, and opt-in remote TLS (self-signed HTTPS/WSS).
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.1 - DevDeck 0.5.1

*Published 2026-07-01T02:36:19Z. Assets: DevDeck.0.5.1.exe, DevDeck.Setup.0.5.1.exe*

> Remote security hardening (constant-time token auth, mobile-client escaping), push-on-attention, pipe API/DB result into the focused agent, DB query history, and rename sessions.
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

## v0.5.0 - DevDeck 0.5.0

*Published 2026-07-01T02:36:03Z. Assets: DevDeck.0.5.0.exe, DevDeck.Setup.0.5.0.exe*

> First 0.5 release: per-project task runner, agent triage inbox, workspace presets, and an AI usage/activity dashboard.
> 
> Signed with a self-signed certificate (CN=DevDeck Dev) - personal-use; trusted on the build machine. Windows SmartScreen may warn on other machines.

