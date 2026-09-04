# Roadmap — DevDeck

The vision is all-in-one. The build is sequenced into milestones so there's a usable daily-driver early, with every later panel plugging into the same workspace shell. Keep each milestone ruthlessly shippable.

**Design north star:** ease of use + Japanese **wabi-sabi** — simplicity, calm, restraint, natural/imperfect beauty, quiet space. One earthy accent, minimal chrome, an ensō brand mark. Every feature must earn its visual weight; default to removing. (See `NOTES.md` → "Design north star".)

> Direction confirmed 2026-06-27: pursue **all four** next-step tracks over time (terminal polish, Monaco editor, API depth, deeper Claude). Default shell stays PowerShell.

---

## Next — the path to 5–10 real users

**Everything below Milestone 1 is history.** This section is the only live plan;
read it first. Ordered by `product-director` on 2026-09-03 and **re-ordered
2026-09-04**, against the standing decision in the Decisions log: the ambition is
**a product with users**, and the next milestone is **5–10 real external users** —
not a public launch and not revenue.

The one test every item passes: *does this get a stranger closer to running
DevDeck and saying something back?* Work that does not is **not yet**, however
good it is.

**What changed on 2026-09-04, and it is the important sentence in this file: the
milestone is no longer blocked on engineering.** A mid-milestone interrupt
(row **I**) deleted six surfaces, 78 skins and the crash that bricked the app,
and labelled the path a stranger walks. What remains is **two human acts** — one
authorisation from the owner (step 4) and one person at a keyboard holding a
phone (step 7) — plus the work that hangs off them. No agent can move either.
Writing more code will not make this milestone move, and any proposal to write
more is a way of not asking for the authorisation.

| # | Step | Owner | Unblocks | State |
|---|---|---|---|---|
| 1 | `LICENSE` (MIT) + a provenance audit of every vendored file | `release-eng` / `technical-director` | The SignPath application, which cannot be filed without it | **done** 2026-09-02 |
| 2 | Scrub the tracked tree and its history of employer and client identifiers | `docs-writer` / `technical-director` | The public flip. **The irreversible step** | **done** 2026-09-02 — and it is *why* step 4 is a deletion. Verified 2026-09-04: local history is clean (`git log --all -- .claude/skills/apple-design/` is empty; every remaining identifier lives in `.superpowers/`, `.remember/` and `.claude/settings.local.json`, all gitignored). But `origin/main` is an ancestor of `HEAD`, so the pre-strip objects were force-pushed over and **remain on the remote, retrievable by SHA**. They are harmless while the repo is private and unforked; they become permanent the instant it flips |
| 3 | Rewrite the competitor kill-lists in a register that survives publication | `docs-writer` / `product-director` | The public flip | **done** 2026-09-02 |
| **I** | **Interrupt — the UI/UX overhaul.** Not one of steps 1–9. It arrived mid-milestone as a user request to "enhance massively the UI/UX"; `product-director` ruled *against* an overhaul and prescribed **deletions plus a small number of proven fixes**, and that is what shipped, in full: the folder-moved crash fixed at three levels; Network view + capture proxy, ReleaseBoard, StandupModal, DotnetPanel, terminal recording and Canvas all deleted; Mission's ports wall collapsed; **84 skins → 6**; 8 view keys → 7; every deck key labelled; disabled keys made readable; an application menu with `Ctrl+O` and a **visible** menu bar; one verb (`Open folder…`); drag-and-drop that animated but never worked, fixed; a three-state folder probe so a moved folder is attributed instead of misreported by three separate features; 10 modals behind boundaries; `Claude YOLO` → `Claude (no permission prompts)` with a `SKIPS PROMPTS` marker; the worktree default off; a spawning state. Spec `docs/superpowers/specs/2026-09-04-ui-ux-overhaul-design.md`, plan `docs/superpowers/plans/2026-09-04-ui-ux-overhaul.md`, four audits in `docs/superpowers/brainstorm/2026-09-04-ui-ux/` | `pm` → `frontend-dev` / `backend-dev` → `qa` / `design-reviewer` | The half of step 8 that step 8 did not do, `PRODUCT.md`'s validation rewrite, and roughly every later UI change (six skins to verify instead of 84) | **done** 2026-09-04 — 37 commits, tests 1,536 → **1,610** (128 files), typecheck zero, tree clean. **Unpublished.** See *The 0.13.0 ruling* |
| 4 | **Delete + recreate the remote** (same owner and name), push clean history, flip public, file with SignPath Foundation | `release-eng` | Everything that is left. A certificate that clears SmartScreen; the release feed; the updater; step 5's deploy; step 6; the installer step 9 hands a stranger | **NOT STARTED — blocked on the owner's authorisation.** Not on 1–3, which are done, and not on 5, which is drafted. It is one irreversible act nobody but the owner may authorise. Priced in *What step 4 costs* |
| 5 | A one-page homepage: SignPath attribution, the code-signing policy, **Windows-only**, **single maintainer, PRs by invitation** | `marketing` / `docs-writer` | Step 4 — the application requires the attribution line and a published policy | **drafted and content-complete** 2026-09-03 — `site/index.html`, self-contained, no build step, carries a real `run-app` screenshot rather than a mockup. The SignPath attribution line is **not asserted** (the certificate isn't granted); `#code-signing` holds a marked, empty slot for it plus the team-roles and privacy statements SignPath's terms require now. **Undeployed:** Pages needs the public flip, i.e. **step 4** — *not* step 6, as this row wrongly said until 2026-09-04. Deploying it is the first thing that happens after 4 |
| 6 | Move the release build to CI and wire SignPath into it | `release-eng` | An installer a stranger can run without meeting SmartScreen; ends the Avast dependency in the release path | **blocked on 4** |
| 7 | Verify the approve/deny card on a **physical phone** — and in the same sitting the four things CDP cannot observe (the native folder dialog, and `addProjectByPath` failing silently on a bad path; `F1`/`Ctrl+K` via real keys; the "none found on your PATH" state; the crash card), plus a look at the phone client's own palette | `qa` (a human at the keyboard) | Step 9's first impression. The most distinctive thing in the product has **never rendered on real hardware**, and 0.11.0/0.11.1 exist as tags precisely because it was never published | **not started — needs a human, and blocked on nothing else.** Moved ahead of 4 in wall-clock order 2026-09-04: it is the only remaining step needing neither the remote nor an authorisation, and it can start today against the signed build already in `release/` |
| 8 | First contact: the empty states, the agent-presence surfaces, and the failure a stranger can hand back | `designer` → `frontend-dev`/`backend-dev` → `qa` | Step 9 | **done** — both halves ruled *met, with conditions* 2026-09-03, shipped in 0.12.0. Its outstanding condition, `PRODUCT.md`'s validation rewrite, was closed by row **I** on 2026-09-04 (`aa50500`) |
| 9 | Recruit 5–10, one at a time. Every install watched, every first session recorded verbatim. **Watch specifically for the shell-mismatch false negative** (a Git Bash user told `not on PATH` about a working agent) — the one accepted gap that shows wrong information rather than no information | `field` | The evidence this whole milestone exists to get | **not started — needs a human. Nobody has been contacted.** Materials drafted 2026-09-04: `docs/beta/` (archetypes, recruiting message, install-watch protocol, session template, criteria, shell-mismatch watch); destination `NOTES.md` → "Beta — external users (step 9)", deliberately empty. Three blockers, none of them code: **a build from current `main`** (`release/` holds 0.12.0, which predates every fix in row I including the freeze), **a delivery path** (repo private, newest published release `v0.10.0`, so README's "download from Releases" is a dead end for an outsider), and **one reply address** (no issues on a private repo; diagnostics is clipboard-only by design, so a stranger's failure reaches the author only if they are asked to paste it). `field` dissents on the dependency: hand-delivering a verified build with SHA-256s to 5–10 *named* people needs neither 4 nor 6, and whether SmartScreen actually stops them is a pre-registered prediction (kill criterion K4) — i.e. the way to find out if the certificate is urgent instead of assuming it. 7 still gates the phone card being demoed at all. |

### The order, in wall-clock terms

The table is numbered as it was ordered. This is the sequence to execute.

1. **Cut 0.13.0 locally** — version bump, a `CHANGELOG.md` entry rolling up
   0.11.0 / 0.11.1 / 0.12.0 / 0.13.0, tag, `npm run package:signed`.
   `release-eng` + `marketing`. **Unblocks:** step 7 has something to test, and
   the beta has a version number. **Do not publish it** — see the ruling below.
2. **Step 7's human sitting** — the phone card on real hardware, the four
   CDP-blind observations, the phone-client palette look. `qa`. **Unblocks:** the
   beta's first impression. It needs nothing from anyone else, so it must not
   wait behind an authorisation.
3. **Ask for step 4's authorisation, with the price attached.** Priced below; the
   owner rules. **Unblocks:** everything remaining.
4. **Step 4, in one sitting:** harvest (below) → delete → recreate as
   `Midor2Mid/devdeck` → push clean history and tags → flip public → file with
   SignPath. `release-eng`. The delete and the flip are the **same** sitting: a
   flip before the delete publishes the identifiers, and "we deleted it
   afterwards" is not a fact about what was published.
5. **Deploy `site/index.html` to Pages** and link it from the README.
   `marketing`.
6. **Step 6** — CI plus SignPath in the release path. `release-eng`.
7. **Publish 0.13.0** as the new remote's first release: Setup + Portable +
   **blockmap + `latest.yml`**, because `electron-updater` reads that manifest and
   a beta you cannot update is a beta you cannot fix.
8. **Step 9** — recruit, one at a time. `field`.

**Left off this list on purpose:** every feature; every residual in *Added on
2026-09-04* except the three rows marked *before the cut*; and any further UI work
at all. The milestone has enough product and no distribution.

### The 0.13.0 ruling (2026-09-04)

**Cut 0.13.0 now. Publish nothing until step 4 has landed. Then 0.13.0 is the new
remote's first published release, and it is what a beta user installs.**

The facts it is ruled on:

- The last **published** release is **0.10.0** (2026-08-29). `v0.11.0`, `v0.11.1`
  and `v0.12.0` are tags only. There are **42 unreleased commits**.
- **Across 14 published releases and 28 installers, the lifetime download count
  is 1** — and that one is `latest.yml` on 0.10.0, i.e. an updater poll, almost
  certainly from this machine. Measured 2026-09-04 with
  `gh release view <tag> --json assets`. Zero issues, zero stars, repo private.

**Cut it, because a changelog is perishable.** 42 commits and four versions of
prose have to be written by the people who did the work, while they still
remember it, and a tag costs nothing. `release/` already holds a signed 0.12.0,
so the packaging path is known to work; 0.13.0 re-runs it.

**Do not publish it to the current remote, because step 4 deletes that remote.**
A 0.13.0 release on `Midor2Mid/devdeck` today is a fifteenth release destroyed by
the very next step, and a `latest.yml` on a feed that stops existing. Publishing
into a repo you have decided to delete is work that deletes itself.

**Do not publish it anywhere yet, because the only installer that exists is
signed `CN=DevDeck Dev`.** A stranger who runs it meets SmartScreen — the exact
wall this milestone exists to remove, and the wall step 6 removes. Spending a
first impression on a security warning buys "is this safe?" instead of a first
session, which is the one thing the milestone is trying to buy.

**On the crash fix, which is the strongest argument for shipping and still does
not carry it.** A project whose folder moved crashed the main process *and*
persisted the failed tab, so every later launch died before the UI loaded, with
hand-editing userData as the only recovery. That is as bad as a defect gets. Then
ask who it protects: nobody has ever downloaded a DevDeck installer. It protects
**the first stranger**, so its deadline is the beta install, not this week — and
it will be in that install either way. The crash fix sets the *floor* for what
may ship. It does not set the date.

**On the phone card, which argues the same direction.** It is unverified on
hardware (step 7). An unproven distinctive feature is an argument against a wider
audience and *for* the narrow one this milestone already chose.

**The update path survives the delete**, and this is the thing to check rather
than assume: `package.json` → `build.publish` names
`{ provider: github, owner: Midor2Mid, repo: devdeck }`, so recreating under the
**same owner and name** restores a byte-identical feed URL. `electron-updater` on
an existing install reads the new `latest.yml` and offers 0.13.0. The only loss is
differential download — the old blockmaps are gone, so it falls back to a full
download. Nobody is on an old version, so that costs nothing today, and it must
stay true tomorrow: **if step 4 ever changes the owner or the repo name, every
installed DevDeck silently stops updating.**

**0.13.0's notes must roll up four versions** (0.11.0, 0.11.1, 0.12.0, 0.13.0),
exactly as 0.10.0's notes rolled up 0.9.0 / 0.9.1 / 0.10.0. There is precedent in
this repo and `marketing` should reuse it. `CHANGELOG.md` is not that text — see
the harvest item below.

### What step 4 costs, priced (2026-09-04)

The roadmap ordered step 4 without pricing it. Priced: **deleting and recreating
the remote destroys 14 published releases and their 28 attached installers.**

**Take the trade.** The two sides are not close:

- **Given up:** binaries **no human has ever downloaded** — lifetime total across
  all 14 releases is 1 download, of a 346-byte manifest. Zero issues, zero stars,
  no forks. And they are reproducible: every tag from `v0.1.0` to `v0.12.0` is an
  ancestor of `HEAD`, so any historical version can be checked out and packaged
  again.
- **Bought:** not publishing an employer's and a client's identifiers,
  permanently, at the moment of the flip. GitHub keeps unreachable objects
  retrievable by SHA, so a force-push leaves the pre-scrub commits on the remote.
  Only deleting the repository removes them.

**The sequencing matters more than the trade.** Those objects are harmless right
now — the repo is private and unforked, so exposure is zero. The delete is
therefore not remediation of a live leak; it is a **precondition of the flip**,
and it belongs in the same sitting.

**Harvest before the delete — and none of it is an installer:**

1. **The release-note bodies of all 14 published releases.** Verified 2026-09-04
   that these are **not** in `CHANGELOG.md`: six of eight distinctive paragraphs
   in 0.10.0's body appear nowhere in this repo, including the install
   instructions, the SmartScreen warning, and the multi-version rollup framing.
   ~16 KB across 0.5.0–0.5.9, 0.6.0, 0.7.12, 0.8.0, 0.10.0. It is the **only
   prior art for how this product has ever described itself to an outsider**, and
   `marketing` needs it for 0.13.0's notes. One `gh release view --json body`
   loop. `release-eng` writes it under `docs/release/`; `marketing` uses it.
2. **The download counts and the publication timeline**, before they cease to
   exist. This is the only external-engagement data DevDeck has ever generated,
   and its value is precisely that it is **zero** — that number is evidence for
   `PRODUCT.md`'s validation section and for every future argument about what
   distribution is worth. Once the releases are gone, "nobody ever downloaded
   it" becomes an assertion instead of a measurement.
3. **Nothing else.** Skip the 0.10.0 binaries (~230 MB): `release/` already holds
   a signed 0.12.0, which is strictly more useful, and `release/` is gitignored,
   so it survives every remote operation.

**One gate `release-eng` must run before `git push --tags`**, because the failure
mode is republishing exactly what the delete removed. Verified safe today — every
tag is an ancestor of `HEAD`, so no tag reaches a stripped object — but it is one
command and it must be re-checked at push time, not assumed:

```
for t in $(git tag); do git merge-base --is-ancestor "$t" HEAD || echo "UNSAFE: $t"; done
```

It must print nothing.

### Added on 2026-09-04 — what the milestone needs that it did not on 2026-09-03

Four audits produced findings the 25-task plan deferred with triggers. **No
trigger moved** — every one of them waits on a recorded first session, which is
step 9. Three things did change:

- ~~**BEFORE the 0.13.0 cut — measure the labelled deck at `minWidth`.**~~
  **CLOSED, and it was already done** — corrected 2026-09-04 after this row was
  written. The spec ordered `minWidth: 900 → 1040` justified on Bauhaus 978px,
  CRT 916px and Flat 935px; Phase 1 deleted all three, so the change correctly
  did not ship. But the six survivors were **not** left unmeasured: `d82d9cc`
  re-measured them in the running app and records the numbers in its own commit
  message — the labelled key row is **590.45px, identical in all six skins**
  (Chromium's UA stylesheet resets `letter-spacing` on `button`, so Modern Pro's
  tracking never reaches a deck key), and row + tools + bar chrome is 782.45px
  against the ~886px of CSS width a 900px window actually gives the page. Twelve
  measurements — each skin at 900px and at 1386px — no key clipped, no bar,
  topbar or document overflow. `minWidth: 900` stands **on evidence**, not by
  omission. What 900 does cost is the status region, which is why the collapse
  drops the verify group's labels first. Kept here rather than deleted, because
  a plan that quietly loses a closed item is how the same work gets ordered twice.
- **BEFORE the 0.13.0 cut — re-run `qa`'s D6.** Double-clicking `+ Claude`
  launched two agents. The spawning state shipped, which gives feedback but does
  not debounce. These are paid CLIs: if it still reproduces, one stray
  double-click costs a beta user money, and that moves it from cosmetic to a
  defect. One observation, not a build. `qa`.
- **ADDED to the pre-beta build — `projects.json` unreadable is still read by
  zero renderer code.** Verified 2026-09-04: no project-facing renderer code
  reads `ProjectStore.unreadable`, which main sets diligently. A corrupt or
  locked `projects.json` therefore presents as *"you have no projects"*, and every
  project action silently no-ops **forever**, with no explanation anywhere. This
  is the same defect class the last two releases were spent removing — absent,
  unknown and zero are three states — it is a first-five-minutes failure with no
  recovery, and the repo already holds the working precedent
  (`PersistBlockedBar` handles the `workspace.json` equivalent properly). It
  survived a 25-task plan because no task owned it. `frontend-dev` /
  `technical-director`. **This is the only build work being added.**

**Ruled *not yet*, with triggers, so nobody re-opens them:**

- **The seeded preset icons are still `✳ ✦ ⚡ ◆ ◇ ▶ ⚒ ✓`**
  (`settings.ts:242-258`) — a direct violation of fixed point 7 of the spec that
  shipped today, by the product's own defaults. It is decoration; the beta will
  not fail on it, and it is not worth pre-flip verification budget across six
  skins. **Trigger: the first beta screenshot.**
- **Path dedupe is exact string equality** (`main/projects.ts`), so `C:\Repos\Foo`
  and `c:\repos\foo` become two project cards. **Trigger: a beta user does it.**
- **In Settings → Agents, `on PATH` and `unchecked` still differ only by the
  word** — verified still open; the string does not appear in `SettingsModal.tsx`,
  while the launcher carries three channels for the same distinction. Close it by
  adding a channel or by deciding out loud that one word is enough on a form —
  not by re-reading the tradeoff. **Not a beta blocker.**
- **A slot-aware sizing variant for a crashed top bar.** Region cards no longer
  escape their slots, but on a slot shorter than the card (~44px for the top
  bar's row) `Copy diagnostics` needs an in-card scroll. `frontend-dev` /
  `design-reviewer`.
- **The redactor's four known gaps**, to watch in beta reports rather than
  pre-solve: URL- and base64-encoded secrets (decoding arbitrary text would
  false-positive on every hash and cache path in the record); uncovered issuers
  (SendGrid, Slack and Discord webhooks, Google OAuth); `AKIA` followed
  immediately by an alphanumeric, since dropping the trailing word boundary would
  widen the rule into base64 runs and commit SHAs; and space-separated flag
  values (`mysql -p hunter2`), genuinely indistinguishable from a positional
  argument. `field` / `security-engineer`.
- **The report rate limit is a fixed window**, so 30 refusals at the end of one
  window plus 30 at the start of the next is 60 in an instant. Promote to a
  sliding window only if a beta report actually shows burst loss; the record
  already declares refusals in its own `Incomplete` block.
- **Deck geometry, the new-project → new-terminal mechanics, starter-command
  discoverability, the tasks board / pipelines UI** — all deferred on triggers
  only step 9 can move (five recorded first sessions; two of the first five
  hesitate; asked a second time). Re-checked 2026-09-04: none moved.
- **A guided tour / onboarding modal** — refused, not deferred. The fix for "the
  app explains itself once" is self-describing empty states, not a modal
  dismissed in two seconds.

**And one thing the skin cut must not be spent on.** 84 → 6 makes every future UI
change roughly an order of magnitude cheaper to verify. That saving is the
*point*, not a budget for a seventh skin. The first proposal to add a theme
because "we can afford it now" is spending the only thing the cut bought.
**Refused in advance.**

### Closed 2026-09-04

- **The 17 unguarded overlays** — closed. Four were deleted outright
  (`DotnetPanel`, `RecordingsModal`, `ReleaseBoard`, `StandupModal`) and the
  remainder sit behind their own boundary (`8b89409`). `WorktreesModal`, the one
  confirmed to blank the window, is among them.
- **`PRODUCT.md`'s false validation claim** — closed (`aa50500`). It now says, in
  its own words, that no external user has ever run this app.
- **The `Ctrl+O` menu-bar question**, which the spec insisted be decided
  explicitly rather than by default — decided: `autoHideMenuBar: false`
  (`index.ts:301`). The bar is visible, and a visible menu bar is itself a
  discoverability affordance for a stranger.
- **The two builds behind step 8** — the three-state agent-CLI presence probe and
  the diagnostics record both shipped in 0.12.0. See `CHANGELOG.md`.
- **`Ctrl+1..8` bypassing the disabled view keys** — closed (`App.tsx:219`).

### Behind those, in order

The confirmed usage-ledger data-loss bug (it rewrites every session the user did
not hand-close to 0 ms), then `claude --session-id <uuid>` per-pane transcripts,
which turns per-session cost from an attribution into a receipt and makes
`runRecorder.ts`'s attribution machinery deletable.

### Explicitly not on this path

Every feature: cost surfacing, quota, context fill, terminal colour, launch
templates, the `+Claude` menu. **Trigger: three users installed.** Also off:
turning `remote.enabled` on (its own trigger stands), macOS and Linux (the 5–10
are recruited on Windows or not recruited), a sixth competitor study —
permanently — and, added 2026-09-04, **any further UI or motion work before step
9**. Not one item on the path to ten users is a UI item that is not already named
in this section.

---

## Milestone 1 — Terminal + project core (the beating heart) ✅ MVP

- [x] App shell: Electron + electron-vite + React + TS, runs on Windows
- [x] Resizable layout (sidebar | main | terminal area) via `allotment`
- [x] Project sidebar: add a project (folder picker), list projects, select active project; persisted to disk
- [x] Multi-terminal: tabbed terminals via xterm.js + `@lydell/node-pty`, each spawned with `cwd` = active project
- [x] "New terminal" and "New Claude session" buttons (Claude session = pty launching `claude` in the project)
- [x] Terminals survive project switches (per-project terminal groups)

### Milestone 1.5 — terminal core polish ✅ (2026-06-27)

- [x] Split panes within a tab (binary layout tree; split right/down, close + collapse)
- [x] Pty buffer-replay: panes detach/re-attach without killing sessions (kill is explicit)
- [x] Persist + restore tabs/splits per project across restarts (`workspace.json`)
- [x] Rename tabs (double-click)
- [x] Keyboard shortcuts (new/close/split/cycle/find — all `Ctrl+Shift+…`, captured before xterm)
- [x] In-terminal search (`@xterm/addon-search`)

**Definition of done for the MVP:** I can add my real projects, switch between them with one click (no manual `cd`), and run several terminals — including parallel Claude CLI sessions — side by side, labeled. It's good enough to replace Windows Terminal for a day.

## Milestone 2 — Editor panel ✅ (2026-06-27)

- [x] File tree for the active project
- [x] Monaco editor: open, edit, save files (syntax highlighting, per-file undo)
- [x] Tabs for open files; dirty indicators
- [x] Monaco workers bundled locally (offline; no CDN) + wabi-sabi editor theme

## Milestone 3 — API client panel (Postman-lite) ✅ (2026-06-28)

- [x] Request builder: method, URL, headers, query params, body (JSON/form)
- [x] Send via main process (native `fetch`, bypasses CORS); status, timing, headers, pretty body (Monaco viewer)
- [x] Per-project request history + saved requests (collections), persisted to `settings.json`
- [x] **Beyond scope:** auth config, environments/variables, collections search + move/duplicate, **Import** (Postman / OpenAPI-Swagger / cURL → collections), cURL smart-paste into the URL bar
- [x] **Response tests/assertions** (2026-06-30, M24) — per-request checks (status/time/body/header/JSON-path) with a pass/fail Tests tab
- [x] **Request chaining** (2026-06-30) — a "Chain" subtab extracts a response value (JSON path / header / status / body regex) into a session variable later requests use as `{{name}}`; chain vars merge over the active environment, shown as removable chips. `apiChain.ts` + `chain.ts`, `tests/apiChain.test.ts`
- [x] **Export results to file** (2026-06-30) — DB grid → CSV/JSON, API response body → file, via a save-as dialog (`dialog:saveFile`). Pure serializers `exporters.ts`, `tests/exporters.test.ts`

## Agent pipelines — live UI (2026-06-30)

- [x] **Run timeline + launcher** — the run model tracks per-step status (pending/running/done/failed/skipped) + the session each step ran in; the floating PipelineBar expands into a step timeline (status dots, gate notes, jump-to-session). Pipelines launch from the new-terminal menu's PIPELINES section, not just Settings / command palette. (Editor + gates already shipped in M8/Settings.)

## Milestone 3.5 — Database panel ✅ (2026-06-27, partial)

- [x] Per-project saved connections (PostgreSQL, MySQL) with encrypted passwords (`safeStorage`)
- [x] Connect / test, list tables, run SQL (Monaco editor, Ctrl+Enter), results grid
- [x] **SQLite via WASM** (`node-sqlite3-wasm`, 2026-06-27) — no native build; reads/writes real `.db` files, file picker in the connection form
- [x] **SQL Server** (`mssql`/`tedious`, 2026-06-29) — pure-JS, no native build; the SSL toggle maps to `encrypt` with trust-server-certificate so local/dev instances work
- [x] **Query history per connection** (2026-06-29) — each successful query recorded per connection (deduped, capped 25), reloadable from a **History ▾** dropdown; persisted in `settings.json`
- [x] Packaging: `node-sqlite3-wasm` unpacked from asar in `electron-builder` config (`package.json` → `asarUnpack`) — done in M11

## Milestone 7 — Remote / mobile access ✅ (2026-06-27, terminals-first)

- [x] Multi-client pty (event bus + per-client buffer replay) so a phone can attach to live sessions
- [x] Token-guarded HTTP + WebSocket server in the main process (off by default)
- [x] Self-contained mobile web client (xterm served from node_modules): session list, attach, live output, input + quick keys, start a Claude session remotely
- [x] Settings → Remote: enable, port, token (regen), Tailscale/LAN URL + QR
- [x] Verified end-to-end headlessly (auth 401/reject, session broadcast, shell output over WS)
- Reach from anywhere: **Tailscale** (private, recommended) — bind is 0.0.0.0 but token-gated
- [x] **Push-on-attention** (2026-06-29) — mobile client title-badge + beep + best-effort OS notification when an agent flips to *attention* and you're not looking; the no-Tailscale case now warns that a plain-LAN link is unencrypted
- [x] **Constant-time token auth** (2026-06-29) — `tokenOk` (sha256 + `timingSafeEqual`) closes the `!==` timing side-channel; mobile-client `esc()` now escapes quotes (latent attribute XSS). Covered by `tests/server-guards.test.ts`
- [x] **TLS / HTTPS option** (2026-06-30) — opt-in self-signed cert (`tlscert.ts` via `selfsigned`, SANs for localhost + LAN/Tailscale IPs, cached + reused); serves https/wss so the link + token are encrypted even on plain LAN, and the session cookie can carry `Secure` + the `__Host-` prefix. Verified live (200 with token, 401 without, over TLS). Note: accepting the self-signed warning does **not** produce a secure context, so service workers and Web Push stay unavailable — a trusted cert (`tailscale cert`) is what would buy that
- [x] **Mobile coding + AI** (2026-07-16) — the web client gained a Files view
      (browse project tree, open/edit/save, confined to project roots via
      `isWithinRoots`) and an AI view (compose a prompt with tap-to-insert
      `@file` mentions, fire at any running agent). ws: projects/fs:tree/read/
      write/files. Verified live.
- [x] **Structured approve/deny on the phone** — **shipped 0.11.0 (2026-09-01)**,
      merged at `4af3de3`. `approval.ts` + `cleanTail`/`lastLines` live in `src/shared/`.
      The single classifier is **`src/shared/approval.ts`, driven from
      `src/main/decisions.ts`** — **not** `src/main/pty.ts`, which only keeps the
      cleaned tail and a digest of it and classifies nothing. Main mints a
      `PendingDecision` (paused-state gated, `tailHash`-bound, single-use) carried as
      `RemoteSession.pending` on the existing `broadcastSessions`; one inbound
      `{t:"choice"}`, token-allowlisted, three-valued ack; the card renders in
      `CLIENT_HTML` with the raw excerpt beneath the parsed question. 0.11.1 fixed two
      things on it (`100dvh` so the phone keyboard cannot bury the answer; no "Resume"
      offered to an agent that cannot resume). **Still unverified on a physical phone**
      — the card has never rendered on real hardware. That is a beta blocker, not a bug.
- [ ] Later, and only on a named trigger: PWA shell + Web Push + a trusted certificate
      (`tailscale cert`). Parked because Orca ships a native app *and* a cloud relay and
      still cannot wake a closed phone — its own code says the WebSocket "doubles as the
      push channel". Promote when the recorded complaint is specifically "I missed it
      because the tab was closed".
- CUT: full **native** mobile app. The only thing native buys over the web client is
  plain `ws://` without a secure-context rule. Not worth an app.

## Milestone 4 — Network debugging ✅ (2026-06-28) — **DELETED 2026-09-04**

> **This milestone no longer exists in the product.** `NetworkPanel.tsx` and
> `main/proxy.ts` were deleted after 0.12.0 (`4a5c936`): a general-purpose forward
> proxy for arbitrary client traffic, with no agent edge, costing more to carry
> than it returned. Two things that share the word survive and are unrelated:
> `main/browserNet.ts` (CDP capture on the embedded webview, feeds the `→ Agent`
> payload and the MCP tools) and `main/netproxy.ts` — **Settings → Corporate
> proxy**, which applies an upstream proxy to every child DevDeck spawns so npm,
> git and `gh` work behind a corporate firewall. That one was nearly deleted by
> conflation with this milestone and was deliberately **kept**. Record below is
> history only.

- [x] Local HTTP proxy to capture requests/responses (`src/main/proxy.ts`) — loopback-only forward proxy, off by default; full HTTP capture with gzip/deflate/br body decode; HTTPS via CONNECT tunneled end-to-end (encrypted, metadata only — no MITM)
- [x] Request list + inspector (`NetworkPanel.tsx`) — live list (method/status/host/path/time/size); inspector tabs for request/response headers + bodies (JSON pretty-printed)
- [x] Filter by project / host — free-text host/path/method/status filter + "this project" toggle (captures tagged with the active project at capture time)
- [x] Start/stop toggle, persisted port (`settings.network.port`, default 8899), copy proxy address, clear; covered by `tests/proxy.test.ts`
- [ ] Later: HTTPS MITM (generated CA) to decrypt tunneled payloads; replay/edit-and-resend a captured request into the API client

> Distinct from M19's **browser** network capture (`src/main/browserNet.ts`, CDP on the embedded webview, feeds the "→ Agent" payload). M4 is the general-purpose proxy for arbitrary client traffic: set `HTTP_PROXY`/`HTTPS_PROXY` to the proxy address and watch it in the Network panel.

## Milestone 5 — Deeper Claude CLI integration ✅ (2026-06-27, core)

- [x] Session registry: all Claude sessions across projects in the sidebar, status + click-to-jump
- [x] Status without parsing output — activity (working/idle) + terminal bell (attention); visibility-aware
- [x] Tab-level status dots; attention badge
- [x] Quick-resume (`claude --continue`)
- [x] Cross-pane action: send a file's `@path` from the editor into the last-focused Claude session
- [x] **Send API response / DB result into a session** (2026-06-29) — "→ Agent" button on the API response view and DB results grid pipes the captured response / query+result into the focused agent (capped 12k chars / 100 rows)
- [x] **Rename sessions independently of tabs** (2026-06-29) — double-click a session in the sidebar for a per-session label (`termNames` override, persisted); inbox + usage dashboard use it too

## Milestone 6 — Settings hub ✅ (2026-06-27)

- [x] Left-nav modal (reference-style): Appearance, Terminal, Editor, Claude, Shortcuts, About
- [x] Persisted to `settings.json`; wired to real behavior:
  - Appearance: accent color (single wabi-sabi accent, applied to CSS vars)
  - Terminal: default shell (PowerShell / cmd / Git Bash / WSL / custom) + font family/size (live)
  - Editor: font size, tab size, word wrap, minimap
  - Claude: command, resume args, idle→attention timing
- [x] Later sections all shipped: **AI settings** → M22, Git multi-account → M15, SSH → M16, Remote → M7, MCP → M18, light theme → M10, **Proxy** → 2026-07-16

## Milestone 8 — 1DevTool-inspired depth ✅ (2026-06-27)

From studying the 1DevTool reference (video + 1devtool.com):
- [x] **Multi-agent sessions** — agent presets (Claude/Codex/Gemini/custom) with type badges; generalized from Claude-only
- [x] **Prompt composer** — rich prompt box with `@file` mentions → focused agent (Ctrl+Shift+P)
- [x] **Project groups** — collapsible named groups in the sidebar
- [x] **Project switcher** — Ctrl+K launchpad grid (search, live counts, keyboard nav)
- [x] **Markdown preview** — Edit/Split/Preview + word count
- [x] **Status bar** — git branch + change count, attention, remote, project
- [x] From reference: image-preview tabs → 2026-07-01; agent pipelines → `pipeline.ts`, embedded browser → M9, AI diff → ticket→PR loop, activity feed → M20. (Deliberately skipping **more DB engines** — PG/MySQL/SQLite/MSSQL is enough.)

## Milestone 9 — more 1DevTool-inspired features ✅ (2026-06-27)

- [x] **SQLite** via `node-sqlite3-wasm` (no native build)
- [x] **Paste cURL → parse** into an API request
- [x] **Composer drafts** persisted per project + a discoverable launcher bar
- [x] **In-app notifications** (toasts) when a background agent needs attention
- [x] **Mobile DB + HTTP** — run SQL / send HTTP requests from the phone client
- [x] **Embedded browser** panel + **Comment Mode** → click page elements, annotate, send grouped feedback to the focused agent
- [ ] Later: **AI quota display** — quota only. **Cost is not "later"; it ships** —
      `src/main/usage.ts` computes real tokens and USD from Claude Code's transcripts (see
      the parking-lot entry and the 2026-09-02 Decisions-log row). The rest shipped:
      browser screenshot/console/network capture → M14/M19, terminal Canvas → M13,
      Dashboard → M12

## Milestone 10 — themes, polish & perf ✅ (2026-06-27)

- [x] **Theme system** (Zen deleted 2026-09-04; the surviving set is Sumi/Washi/Slate × Wabi-sabi/Modern Pro — **6 skins, down from 84**, `148154b`) — Sumi (dark), Washi (light), Zen (airy dark); picker in Settings → Appearance; applied across UI (CSS vars), terminal (xterm) and editor (Monaco). User chose mockups from generated PNGs first.
- [x] Accent customization derives `--accent-soft` as a proper tint (lighter on dark, darker on light)
- [x] **Perf:** debounced disk persistence (was writing on every composer keystroke / accent drag)
- [x] Theme-aware scrollbars
- [x] Spacing/typography theming (Zen's airiness), per-theme density — `themes.ts` COMPACT/AIRY density vars + per-theme line height

## Milestone 11 — installable app + robustness ✅ (2026-06-27)

- [x] **Packaging** via electron-builder (NSIS + portable); asar-unpack for node-pty / sqlite-wasm / xterm; ensō app icon; verified the packaged `DevDeck.exe` launches standalone
- [x] **Error boundary** (no more white-screen on a render error)
- [x] Window bounds + last-view restored across restarts
- [x] Code signing → M21 (self-signed Authenticode); auto-update → M25 (`electron-updater`, dormant until releases are public)

## Milestone 12 — snippets + dashboard layout ✅ (2026-06-27)

- [x] **Prompt snippets** — `/name` autocomplete in the composer (user-defined in Settings → Snippets)
- [x] **Dashboard grid layout** — toggle the terminal area between Tabs and a grid of all the project's terminals at once (persisted)

## Milestone 13 — Canvas layout ✅ (2026-06-27) — **DELETED 2026-09-04**

> Deleted (`9eac56a`), with its connectors and persisted positions: a third
> terminal layout doing what Grid does. Two layouts is a choice; three is a hobby.

- [x] **Canvas** terminal layout — free-form board: drag terminal cards anywhere, pan the surface; positions persisted. Third layout alongside Tabs + Grid.

## Milestone 14 — mobile attach + browser capture ✅ (2026-06-27)

- [x] **Mobile attach** — pick a screenshot/file on the phone → saved into the project (`.devdeck/uploads/`) → path typed into the agent session
- [x] **Browser capture** — "Send to AI" now includes recent console errors/warnings + a page screenshot (saved + path referenced) alongside the element comments

## Milestone 15 — Git multi-account ✅ (2026-06-27)

- [x] **Git accounts** in Settings → Git (label, user.name, user.email, custom SSH command)
- [x] Apply an account to the active project from the **status bar** (writes the repo's local `git config` incl. `core.sshCommand`); status bar shows the current identity
- [x] **PATs (encrypted) for HTTPS push + token verification** (2026-06-30, M24) — `gitpat.ts`; cache into Git's credential manager, GitHub verify

## Milestone 16 — SSH hosts ✅ (2026-06-27)

- [x] **SSH profiles** in Settings → SSH (label, user, host, port, extra args); launch a connected terminal from the ▾ menu

## Milestone 17 — command palette + canvas zoom ✅ (2026-06-27)

- [x] **Command palette** (Ctrl+Shift+P): fuzzy access to views, layouts, themes, new agent/SSH sessions, jump-to-session, settings, project switch. Composer hotkey moved to Ctrl+Shift+I.
- [x] **Canvas zoom** (Ctrl+scroll, 40–200%) + double-click to reset view

## Milestone 18 — MCP settings + audit batch 2 ✅ (2026-06-27)

- [x] **MCP** settings section — edit the active project's `.mcp.json` (servers: command/args/env) read by Claude Code & other agents
- [x] Audit batch 2: fs path confinement to project roots, binary-file guard, terminal fit() zero-dim guard

This completes every section from the original 1DevTool reference (Appearance, Terminal, Editor, Agents, Snippets, Git, SSH, MCP, Remote, Shortcuts, About).

## Milestone 19 — network capture + API smart-paste ✅ (2026-06-28)

- [x] **Browser network capture** (CDP on the webview): comment-to-AI now includes a request summary + failed/4xx/5xx requests
- [x] **API smart-paste** — paste a cURL command into the URL bar and it auto-parses (Postman-style); replaces the separate cURL button

## Milestone 20 — activity feed + canvas connectors ✅ (2026-06-28)

- [x] **Activity feed** — ⧗ in the sidebar opens a drawer of agent events (started / needs-attention / closed) across all projects; click to jump
- [x] **Canvas connectors** — ⚯ handle to link cards; SVG lines follow pan/zoom; click a line to remove; persisted

The reference feature set is fully covered. Remaining ideas are open-ended (terminal record/replay, embedded-browser polish).

## Milestone 21 — design pass + Lacquer style ✅ (2026-06-29)

From a live-app design review against the wabi-sabi north star:
- [x] **Ensō brand mark** — a real single-stroke ensō (`Enso.tsx`) for the rail logo + sidebar wordmark, replacing the placeholder "D" and the spinner-like ring
- [x] **Empty-state ensō watermark** — a faint accent ensō behind empty panels so they read as intentional space; muted/faint text contrast lifted to WCAG AA across themes; Settings modal backdrop now dims + blurs
- [x] **Terminal toolbar declutter** — grouped into create / layout / pane clusters; secondary tools (record, recordings — both deleted 2026-09-04, `51383af` — worktrees, review changes) moved into a `⋯` overflow; 13 → 10 controls
- [x] **Lacquer style** — **deleted 2026-09-04** in the 84 → 6 skin cut — a new opt-in design style (Settings → Appearance → Style): frosted-glass surfaces, gilded gradient accent buttons, soft accent glow on active tabs / rail / ensō, deep layered shadows, plus an animated sheen sweep + breathing ensō glow (honors `prefers-reduced-motion`). Additive — existing styles and the default are unchanged.
- [x] **Local signed builds** — `npm run cert:make` + `npm run package:signed` produce a self-signed Authenticode build (personal-use) to avoid unsigned-binary AV false positives; shipped as the signed **v0.4.2** release.

## Milestone 22 — AI settings ✅ (2026-06-29)

- [x] **Settings → AI** section — per-agent **default model** (injected at spawn via the agent's model env var, e.g. `ANTHROPIC_MODEL`) and **API key**
- [x] **Encrypted key storage** (`main/aikeys.ts`) — keys encrypted at rest via `safeStorage`/DPAPI (base64 fallback), keyed by agent id; never written to `settings.json`, never sent to the renderer; decrypted in main and injected into that agent's terminal env at launch (`pty.create` env merge). Covered by `tests/aikeys.test.ts`
- [x] Billing note — a stored key flips that agent to pay-as-you-go API usage (the Agents tab already warns when one leaks in from the environment)
- [x] **Usage/activity dashboard** (2026-06-29, M23) — session activity by agent & project; live token/cost still needs per-provider APIs

## Milestone 23 — daily-driver feature batch + hardening ✅ (2026-06-29)

Shipped as **v0.5.0** (signed), plus follow-on hardening:
- [x] **Per-project task runner** — runs `package.json` scripts as sidebar chips. Script names are allowlisted (`/^[A-Za-z0-9:._-]+$/`) so a hostile repo can't inject a shell command.
- [x] **Agent triage inbox** — every session across projects, attention-first, with quick reply + jump
- [x] **Workspace presets** — save/restore a project's tab/split layout (regenerates fresh pty ids); project context menu
- [x] **AI usage/activity dashboard** — sessions launched, agent time, running-now by agent & project over today/7d/all; honest that it tracks activity, not API tokens/cost
- [x] **Pipe result → agent** — "→ Agent" on the API response & DB result views (capped)
- [x] **Remote hardening** — constant-time token auth, mobile-client quote-escaping, push-on-attention, cleartext-LAN warning
- [x] **DB query history** per connection; **rename sessions** independently of tabs

## Later / maybe (parking lot)

> Pruned 2026-06-28: command palette (M17), split terminals + layout restore (M1.5), Git multi-account (M15), SSH profiles (M16), remote/mobile (M7), MCP (M18), embedded browser (M9), light theme (M10), snippets (M12), and file-`@path`-into-session (M5) all shipped.
> Pruned 2026-06-29: the v0.5.0 four-feature batch (task runner, agent triage inbox, workspace presets, AI **usage/activity** dashboard) + pipe-result-into-session + push-on-attention + DB query history + rename-sessions all shipped (see M5/M3.5/M7 above and M23 below). What's left is genuinely unbuilt:

- **Live AI *cost* display — SHIPPED, and the claim that used to sit on this line was
  false.** It said DevDeck "can't see the API". It never needed to: `src/main/usage.ts`
  reads Claude Code's own transcripts under `~/.claude/projects`, dedupes rows by
  message/request id, and computes real input/output/cache tokens plus a per-model USD
  cost (`costOf`, `costInWindow`, `MODEL_RATES`). What M23's activity dashboard tracks
  (sessions and time) is a different quantity from what `usage.ts` computes (tokens and
  dollars); conflating the two is what kept this line wrong for two months. The open work
  is surfacing it honestly, not obtaining it.
- **Live AI *quota* display — not real, and not for want of an API.** A subscription's
  remaining quota is in no transcript and behind no endpoint DevDeck is entitled to read.
  Anything shown would be a guess rendered as a gauge — the exact failure this repo has
  spent three releases removing. Unknown, absent and zero are three states; a quota gauge
  can only show an invented fourth.
- Cross-platform (macOS/Linux) polish
- [x] **Saved command runner per project** (2026-07-01) — arbitrary shell commands per project (Sidebar → project menu → "Saved commands…"), launched as chips beside the package.json task runner; stored in `projectCommands`
- Remote project folders over SSH (SSH terminals shipped; mounting remote folders did not)
- (cleared) — image-preview tabs shipped 2026-07-01 (editor renders png/jpg/gif/webp/svg/… as a preview via `fs:readDataUrl`)
- **Auto-update is wired but dormant** (M25) — `electron-updater` + the in-app flow ship now; it only fetches once the **repo/releases are public** (private repo has no embedded token, by design). Make releases public to activate, and upload `latest.yml` with each release.
- ~~**Coordinated Electron/deps bump**~~ **DONE 2026-08-24** — Electron 43, Vite 7, electron-vite 5, vitest 4; `npm audit` 25 → 0. The Node block had already lifted (22.23.2 on this machine) and four doc claims still said otherwise. See Maintenance/security.

## Milestone 24 — Git PATs · API tests · remote TLS ✅ (2026-06-30)

- [x] **Encrypted Git PATs** (M15 close-out) — per-account tokens encrypted at rest (`gitpat.ts`, DPAPI), "Cache for HTTPS push" via `git credential approve`, GitHub "Verify". `tests/gitpat.test.ts`
- [x] **API response tests/assertions** — status/time/body/header/JSON-path checks per request; pass/fail Tests tab + summary. Pure engine `apiTests.ts`, `tests/apiTests.test.ts`
- [x] **Remote TLS** (M7 close-out) — opt-in self-signed HTTPS/WSS (`tlscert.ts`)

## Milestone 25 — per-terminal shells · auto-update ✅ (2026-06-30)

- [x] **Per-terminal shell override** — the new-terminal menu's SHELLS section opens a terminal with a chosen shell (PowerShell/cmd/Git Bash/WSL/custom) regardless of the global default; stored per terminal (`termShells`, persisted), `resolveShell(kind?)`. Verified live (cmd.exe banner in an override terminal). Closes the parking-lot per-terminal-shell item.
- [x] **Auto-update** — `electron-updater` + GitHub publish provider; Settings → About shows the real version + Check-for-updates; available/ready raises an actionable toast (Download → Restart & install). `update.ts` + `app:version`/`update:*` IPC. **Dormant until releases are public** (private repo, no embedded token).
- [x] **Per-project env vars → terminals** (2026-06-30) — Sidebar → project menu → "Environment variables…"; merged into every terminal/agent session's env for that project, encrypted at rest (`projectenv.ts`), injected in the main `pty:create` handler. `tests/projectenv.test.ts`

## Milestone 26 — modern look & motion ✅ (2026-07-01)

A "more modern / creative / future" pass, all opt-in (calm default unchanged).
**Aurora Glass, Neo Holographic and Kinetic Minimal were all deleted 2026-09-04**
in the 84 → 6 skin cut; the animated rail and the global motion layer survive:
- [x] **Animated rail** — the icon rail glides between collapsed/expanded; labels fade+slide, the toggle chevron sweeps › ↔ ‹.
- [x] **Global motion layer** — modals pop, backdrops fade, the drawer slides, menus pop; buttons/chips get press feedback. Pure-additive; `prefers-reduced-motion` disables it.
- [x] **Aurora Glass** — theme (cool-indigo) + style (frosted glass, gradient accent, soft glow).
- [x] **Neo Holographic** — theme (cyan/violet near-black) + style (dot grid, luminous edges, neon active, pulse).
- [x] **Kinetic Minimal** — theme-agnostic style: spring-lift hovers + an active indicator that springs in.

## Maintenance / security

- **Electron security hardening** (2026-07-01) — audited `src/main`/`src/preload` against the vendored **electron-best-practices** skill. Fixed: `sandbox: true` (third pillar restored), strict **CSP** on file:// content (no unsafe-eval; blob: only for Monaco workers; scoped so the `<webview>` browser is untouched), **deny-all** permission/check handlers, and `web-contents-created` popup/navigation guards. Verified live. Already-good: contextIsolation, nodeIntegration off, no raw `ipcRenderer`, path-guarded IPC, protocol-gated `shell.openExternal`, ASAR integrity + signing. Remaining: none — the Electron CVE bump shipped 2026-08-24 (Electron 43). It was never Electron-blocked; it was waiting on Node >=22.12, and that had already lifted.

- **Coordinated dependency bump** — **SHIPPED 2026-08-24.** `npm audit` is now **0** (was 25: 2 critical, 19 high). Electron 33 -> 43.4.1, Vite 5 -> 7.3.6, electron-vite 3 -> 5, vitest 2 -> 4, @vitejs/plugin-react 4 -> 5.2, electron-builder 25 -> 26.15.3, then `npm audit fix` (no `--force`) for the in-range remainder. Verified: typecheck clean, 985 tests, `npm run build` clean, and `npm run verify:terminal` **15/15** driving the built app, including a positive check that a shell is printing. **Correction:** the first pass claimed 14/14 as proof that the pty module loads. It was not - every check read the DOM or app state, and the only one touching terminal contents was negative ("no escape sequence reached the shell"), which a blank screen passes. Both terminals were blank, because the default shell is powershell and this environment cannot spawn it. With `cmd` seeded a shell prints, the harness gained a positive assertion, and the packaged artifact was checked the same way (opens on Electron 43.4.1, spawns a real pty from its asar-unpacked module). The conclusion held; the evidence for it had to be earned twice. **Packaging: two blockers, both PowerShell, both identified.** Builder 26 routes its npm invocation through `powershell.exe` by design (`nodeModulesCollector.js:324`, avoiding `.cmd` shims after CVE-2024-27980), so its "node module collector" crash was never a builder-26 bug: `"packageManager": "traversal"` selects a collector that walks node_modules directly and passes it. The second is the code-signing cert lookup, avoidable only with `signAndEditExecutable: false`, which also drops the icon and version resources. With both, `package:dir` completes and the artifact runs. Neither workaround is committed - traversal misreports optional dependencies as missing, and shipping an exe without its resources to satisfy a headless check is the wrong trade. In a shell where PowerShell works, no workaround is needed; if the collector still crashes there, pin `electron-builder@^25.1.8` (its 12 advisories are build-time only, since it never ships). **Root cause of the PowerShell wall, found 2026-08-24 and NOT a property of this machine's Windows:** `powershell.exe` dies at startup with `0xC0000409` / exception data `0xa` = `__fastfail(FAST_FAIL_GUARD_ICALL_CHECK_FAILURE)`, i.e. Control Flow Guard rejecting an indirect call. The crash report (`%ProgramData%\Microsoft\Windows\WER\ReportArchive\AppCrash_powershell.exe_*\Report.wer`) shows one non-Windows module loaded, `C:\Program Files\Avast Software\Avast\ArPotEx64.dll` (Avast 26.7), and death at 21 modules - before the CLR. So this is an Avast incompatibility, not a property of this machine. **RESOLVED the same day: Avast was updated, PowerShell runs, and `npm run package:dir` then succeeded on the FIRST try with committed config and no workarounds** - npm collection, asar integrity, and signtool signing with `CN=DevDeck Dev` (including the pty's bundled `OpenConsole.exe`), exit 0, followed by `verify:packaged` 4/4 against that artifact. So neither `packageManager: "traversal"` nor `signAndEditExecutable: false` was ever needed for anything except working around the Avast bug, and neither is committed. Packaging on Electron 43 + electron-builder 26 is verified end to end. Original triage, kept for the record:
  - **Shipped to users:** only **Electron** (≤39.8.4, ~11 high — UAF / ASAR-integrity / protocol-handler issues, many macOS-specific). ~~Fix is Electron 41, gated on Node 22.11 → ≥22.12 (the reason Electron 33 is pinned).~~ **Fixed 2026-08-24 by Electron 43.4.1.** Nothing is pinned; the machine runs Node 22.23.2.
  - **Dev/build-only (never shipped):** esbuild/vite/vitest (moderate) and the electron-builder → `tar`/`node-gyp` chain (high + the 1 critical) run only at dev/package time.
  - **Plan:** one coordinated bump — Node LTS → Electron latest → Vite / electron-builder — clears the shipped Electron CVEs and most of the rest. **Do not** `npm audit fix --force` — the rule stands on its own merits, though its original reason (forcing Electron 41 onto Node 22.11) is gone. **Followed as written**, and the no-force rule held: plain `npm audit fix` cleared the last four in-range advisories after the majors were chosen by hand.
  - For the record: `mssql`/`tedious` (M3.5 SQL Server) added **zero** advisories.

### Artifact size: measured, and `npm dedupe` is not the lever (2026-08-24)

The packaging log's `duplicate dependency references` list (react/react-dom, the
`@azure/*` and `@peculiar/asn1-*` trees) looks like waste and is not: those are
version-IDENTICAL packages referenced from several places in the tree, which is
hoisting bookkeeping, not duplicated bytes. `npm dedupe` was run to test that:

| | before | after |
|---|---|---|
| `node_modules` | 725 MB | 725 MB |
| packages | 470 | 470 |
| `release/win-unpacked` | 544 MB | 544 MB |
| `app.asar` | 178 MB | 178 MB |

Zero change on every measure, and the warning still prints. All it did was collapse
`@types/node` 22.20.0/22.20.1 to one copy and drop a nested dev-only `ci-info`.
Kept, since it is a real if tiny tidy, but do not reach for it to shrink the app.

Where the 178 MB actually is, measured against `dependencies`:
**`monaco-editor` 98 MB**, `@xterm/xterm` 7 MB, `react-dom` 5 MB, everything else
under 2 MB, plus 26 MB of built app code in `out/`. Monaco is 55 percent of the
payload on its own, and it ships every language grammar - the build log lists
`abap`, `elixir`, `postiats`, `freemarker2` and dozens more as separate chunks.
**DONE the same day, and the bigger half was not the subset.** Two changes:

- **Language subset.** `monaco-setup` imports `editor.api` plus exactly the 4 rich
  services and 16 basic languages this app can request, instead of the package entry
  that pulls all 83. Main renderer chunk 8,089 kB -> 6,141 kB, `out/` 26 -> 23 MB.
- **Monaco was packed TWICE.** Vite bundles it into `out/renderer`, and
  electron-builder also packed the whole `node_modules` copy as a production
  dependency: 1,927 files, every grammar, never resolved at runtime. Moving
  `monaco-editor` and `@monaco-editor/react` to devDependencies took **app.asar from
  178 MB to 82 MB** and win-unpacked 544 -> 447 MB, with monaco package files in the
  asar going 1,927 -> 0. The bundled code still ships as app chunks, all four workers
  included.

So the subset was worth ~2 MB of bundle and the double-packing was worth ~96 MB.

**That audit is now done for all 20 production dependencies.** Eleven more were
renderer-only and packed for nothing (react, react-dom, allotment, marked, dompurify,
qrcode, zustand, both @xterm addons, both @fontsource-variable families): app.asar
82 -> 70 MB, win-unpacked 447 -> 435 MB. Cumulative 178 -> 70 MB, a 61 percent cut.
Nine dependencies remain and each is imported by `src/main`, which electron-vite
externalizes rather than bundles: the native pty, four database drivers, `ws`,
`selfsigned`, `electron-updater`.

**`@xterm/xterm` stayed, and that is the lesson worth keeping.**
`src/main/server.ts:89#xtermAsset` calls `require.resolve("@xterm/xterm")` at RUNTIME
to serve `xterm.js` and `xterm.css` to the mobile web client. There is no import
statement, so a grep for imports classifies it as renderer-only and moving it would
have shipped a broken remote terminal, silently, with every test green. A looser grep
for the bare package name is what caught it - and that same pass flagged `marked` as
used in main, which turned out to be the word "bookmarked". Read the hits; do not
trust the count.

The risk this creates is guarded: `tests/monacoLanguages.test.ts` fails if an
extension is added to `LANG` without bundling its language, which would otherwise
degrade that file type to plaintext with no error anywhere.

## Decisions log

| Date | Decision | Why |
|------|----------|-----|
| 2026-06-26 | Electron + electron-vite + React + TS | Best-in-class terminal libs (xterm.js, pty), easy to add Monaco + HTTP client; ship fast on Windows. |
| 2026-06-26 | `@lydell/node-pty` instead of `node-pty` | Ships prebuilt binaries → no MSVC C++ toolchain needed (user's machine lacks the compiler). Removes the #1 Windows setup risk. |
| 2026-06-26 | Sequence "all-in-one" into milestones; terminal/project core first | User chose the all-in-one vision; honored in architecture, but the terminal core must be excellent before layering editor/API/network or it's all lipstick. |
| 2026-06-26 | `allotment` for layout | Lightweight resizable split panes; defer a full docking lib (dockview/rc-dock) until layout needs grow. |
| 2026-06-27 | Pinned Electron 33 + Vite 5 (not latest 42 / 7) | Electron 42's installer (`@electron/get@5`) is ESM-only and needs Node >=22.12; machine runs 22.11. Electron 33 + Vite 5 support Node 22.11 cleanly. Revisit after a Node LTS bump. **SUPERSEDED 2026-08-24: node is 22.23.2, pin removed, now Electron 43 + Vite 7.** |
| 2026-08-24 | Vite 7, not the 8 that `npm audit` suggests | `electron-vite@5` peers on `vite ^5 \|\| ^6 \|\| ^7`. Vite 8 would need electron-vite to move first, and 7 is already out of the advisory's range (`<=6.4.2`), so it clears the CVE without an unsupported combination. `@vitejs/plugin-react@5.2.0` is the one version spanning both, which is why plugin-react stops at 5. |
| 2026-08-24 | Kept `electron-builder@26`; its collector crash was Avast, and packaging now passes | Builder 25 carries 12 advisories (1 critical) in its own tree; 26 clears them, and none of them ever ship, since builder is a devDependency. Packaging fails **here** on a `powershell.exe` cert lookup that cannot run in the agent environment at all - not on anything version-specific. One `npm run package:dir` in a working shell settles it; pin 25 if builder 26's node-module collector still crashes there. |
| 2026-06-27 | Verified `@lydell/node-pty` loads under Electron's ABI | Headless Electron smoke test spawned a shell with no rebuild/compiler — confirms the prebuilt-binary bet before building UI on it. |
| 2026-06-27 | Pty sessions own a replay buffer; panes don't kill on unmount | Lets a pane detach/re-attach (splits, tab/project switches) without losing the session — main keeps the pty + ~256 KB tail, replayed to the new xterm. Kill is explicit only. |
| 2026-06-27 | Split layout = binary tree, terminal-mgmt keys are `Ctrl+Shift+…` | Tree keeps split/close/collapse simple and serializable for persistence. `Ctrl+Shift` combos (captured before xterm) avoid clobbering shell keys like Ctrl+C/Ctrl+W. |
| 2026-06-27 | DB panel ships Postgres + MySQL first; SQLite deferred | `pg`/`mysql2` are pure-JS (no compiler); `better-sqlite3` is native and won't build without MSVC. SQLite will use a WASM driver later to stay compiler-free. |
| 2026-06-27 | DB passwords encrypted at rest via Electron `safeStorage` (DPAPI) | Avoid plaintext credentials on disk; passwords are never sent back to the renderer (only referenced by connection id). |
| 2026-06-27 | Claude status from activity + bell, not output parsing | Coupling to Claude CLI's text output is fragile (NOTES risk). Output-activity (working/idle) and the bell char `\x07` (attention) are format-independent and intentional signals. Visibility-aware so viewing a session clears attention and buffer-replay doesn't false-trigger. |
| 2026-06-27 | Mobile access = terminals-first + Tailscale; pty made multi-client | A remote terminal is RCE surface, so: off by default, token required, prefer Tailscale (no public exposure). Pty refactored to an event bus + per-client buffer replay so phone + desktop attach to the same sessions. Session metadata stays in the renderer and is synced to the server. |
| 2026-08-30 | No relay, no pairing service, no daemon, no native mobile app. The server lives in the main process; close the window and everything stops. | Promoted from an accident of architecture to a decision. Orca's relay bug wall (#12518, #12931, #13735, #16789) is the bill for the alternative; #15615 is its own users asking for the Tailscale path DevDeck already ships. |
| 2026-08-30 | No agent map, no dashboard pop-out window, no supervision surface behind an experimental flag. | Orca shipped an agent map and deleted it (PR #15853, v1.4.190) "to simplify the dashboard UI and reduce maintenance overhead". Its dashboard is flag-gated, and the consequence is users filing #15573/#16885 asking for a kanban that already exists. |
| 2026-09-02 | **The distribution refusal is reversed, and distribution is now the milestone.** `.superpowers/roadmap-2026-09-01/A2-long-arc.md` §4 lists *"Distribution, in any form"* (`:245`) and *"Code signing, `electron-updater`, and published GitHub releases"* (`:285`) as **Unthinkable**. Both are **superseded**, one day later, by the owner's standing decisions of 2026-09-02 (`.claude/agents/TEAM.md`): the ambition is a product with users and the next milestone is **5–10 real external users**. A public repo, an OSI-approved licence, a trustworthy certificate, a published release with `latest.yml`, first-run instructions, a feedback path, and a homepage carrying SignPath's required attribution are therefore **ordered work**, not refusals. **What survives from A2:** the **empty-table test** itself (`:33`) — a surface whose store has never held a row is not a feature — plus Unthinkable **#3** (no fifth strategy memo), **#4** (no sixteenth settings section) and **#6** (no second ledger). **What does not survive is that test's evidence base:** the only `settings.json` it can read belongs to the one person who has ever run this app, so an empty store proves *"he did not use it"* and never *"nobody wants it"*. Keep the test as a test; stop citing one machine's stores as market evidence until there are five to ten of them. | A2's argument was that 1DevTool got ~3,000 installs and ~20 active users, so distribution only enlarges the denominator of an adoption failure. That is sound about a **launch** and wrong about **this** milestone, which is 5–10 named users rather than 3,000 anonymous installs. The gate is not marketing, it is **trust**: the build is self-signed and trusted on exactly one machine, so a stranger meets a SmartScreen wall before forming any opinion at all, and a refusal to sign is a refusal to ever be evaluated. A2's own strongest sentence — that zero external validation exists — is the argument *for* getting some; until it does, every refusal in `.superpowers/` reasons about users from a sample of one, A2's included. **Cost of the reversal:** the licence to hard-code one shell, fight one antivirus and delete a feature the day its owner stops using it is spent; a signed release path, an issue tracker and a support surface arrive in its place. |
| 2026-09-02 | **Compaction proximity is unavailable, deliberately — and the question is now closed.** Measured, not assumed: across **516** transcripts under `~/.claude/projects`, `"context_window"` appears in **0** files and `"rate_limits"` in **0**. The transcript does carry the **numerator** (`input_tokens + cache_read_input_tokens + cache_creation_input_tokens` on the last assistant line) and an exact record that a compaction **already happened** (`isCompactSummary` / `compact_boundary` — 7 of 516 files). It does not carry the **denominator**. The only channel that would deliver real limits to a third-party client is the **`statusLine` slot in the user's own CLI config**, and writing into `~/.claude/settings.json` is the **vendor-config write retired on 2026-09-01** (`.superpowers/roadmap-2026-09-01/A1-near-term.md:284`). So: *"this session has compacted"* is reportable; *"this session is about to compact"* is **not**, and is not to be re-proposed. | A gauge whose denominator DevDeck holds and the vendor changes without telling it is the signal-that-can-lie failure, and it would lie hardest in exactly the eight-hour session it exists to protect. Reading the fill without the limit is the honest half and is already available; inventing the limit is not worth a write into a config the user edits by hand — which A1 refused on stronger grounds than this one. |
| 2026-08-31 | No split, docked or multi-pane stage. One main view at a time; a project remembers which one. | Prompted by 1DevTool (terminal + browser + DB on one screen). Disqualifying on mechanism, not taste: `TerminalPane` resizes the pty to the pane, so a half-width stage halves `cols`, the agent wraps its permission prompt, and `detectApproval`'s `(esc)` + tail-position rules stop matching — Approve/Deny then vanishes from the tile, the Overview row **and** the phone, silently. Evidence for the pain was nil (no user quote anywhere asks for two views at once). Full argument: `.superpowers/1devtool-2026-08-31/T1-verdict.md`. |
| 2026-09-04 | **Cut 0.13.0; publish nothing until step 4 lands.** Then 0.13.0 is the new remote's first published release, with Setup, Portable, blockmap and `latest.yml`. | Measured, not assumed: across **14 published releases and 28 installers the lifetime download count is 1** — a 346-byte `latest.yml` poll on 0.10.0, almost certainly from this machine (`gh release view <tag> --json assets`, 2026-09-04). So there is no installed base, and the crash fix that bricks the app for anyone who moves a project folder — the strongest argument for shipping — protects only the *first stranger*, whose install is after step 6. Publishing to the current remote is worse than useless: step 4 deletes it, so the release and its updater feed would be destroyed by the very next step. And the only installer that exists is signed `CN=DevDeck Dev`, so it spends a first impression on a SmartScreen warning — the exact wall this milestone exists to remove. Cutting the tag is still right now, because 42 commits of changelog prose is perishable and must be written by the people who did the work. |
| 2026-09-04 | **Step 4's price is accepted: destroy 14 published releases and 28 installers rather than leave pre-scrub objects on a repo that is about to go public.** Harvest the 14 release-note bodies and the download counts first; harvest no binaries. | GitHub keeps unreachable objects retrievable by SHA, so a force-push leaves the commits carrying employer and client identifiers on the remote; only deleting the repository removes them. Against that: binaries no human has ever downloaded, 0 issues, 0 stars, 0 forks, and every tag from `v0.1.0` to `v0.12.0` is an ancestor of `HEAD`, so any version can be rebuilt. The delete is not remediation of a live leak — the repo is private and unforked, so exposure is zero today — it is a **precondition of the flip**, and belongs in the same sitting. Two things are genuinely unrecoverable and neither is code: the 14 release-note bodies (verified **not** in `CHANGELOG.md` — 6 of 8 distinctive paragraphs in 0.10.0's body appear nowhere in this repo), which are the only prior art for how this product has described itself to an outsider; and the download counts, whose value is precisely that they are zero. `build.publish` names `Midor2Mid/devdeck`, so recreating under the **same owner and name** keeps the updater feed URL byte-identical — changing either silently stops every installed DevDeck from updating. |
