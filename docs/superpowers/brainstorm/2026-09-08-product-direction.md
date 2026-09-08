# Product direction — the app, the target, the goal, the order

`product-director`, **2026-09-08**. Full direction pass, ordered by the owner:
*"review the app, define a roadmap, goal, target."* Written against `HEAD` =
`cfe2f05`, tree clean, version `0.13.0`.

This supersedes the ordering of 2026-09-04 where it says so, and leaves the rest
standing. Every load-bearing claim carries something you can check without
asking me. Where I checked live state rather than a document, the command is
named — because four tracked files currently assert a fact that stopped being
true on 2026-09-07.

**The one-line ruling: nothing about the identity changes, the milestone does not
change, and the sequence does — recruiting starts before the certificate, and the
four files that tell a stranger this repo is private get fixed first.**

---

## 0. Live state, verified 2026-09-08

Not taken from any document in this repo.

| Fact | Command | Result |
|---|---|---|
| Repo visibility | `gh repo view Midor2Mid/devdeck --json visibility,isPrivate` | **PUBLIC**, created 2026-09-07T11:52Z |
| Traction | same | **0 stars, 0 forks, 0 open issues** |
| Issues | `gh api repos/Midor2Mid/devdeck --jq .has_issues` | **enabled** (discussions off) |
| Licence | same | **MIT** |
| Repo description | same | *"A Windows desktop cockpit for supervising AI coding-CLI sessions across projects."* |
| Releases | `gh release list` | **one, `v0.13.0`, DRAFT** — 4 assets: Setup 114,749,795 B, Portable, blockmap, `latest.yml` (346 B) |
| GitHub Pages | `gh api repos/Midor2Mid/devdeck/pages` | **404 — not configured.** `site/index.html` is undeployed |
| Local signed build | `ls release/` | Setup **114,780,760 B** — 30,965 B larger than the draft's, i.e. the draft assets are the **unsigned CI set**, and its `latest.yml` hashes the unsigned installer |
| Workflows | `ls .github/workflows` | `check.yml`, `release.yml` |

So step 4 is genuinely done and step 6's CI half is genuinely proven. And **the
public repo currently offers a stranger nothing to download.** `README.md:47`
tells them to "Download the latest installer from the Releases page." A public
repo with one draft release shows an anonymous visitor an empty page. That is
today's first-five-minutes defect, and it did not exist on 2026-09-04.

---

## 1. The app as it is today

### What is actually in it

Seven view keys, `Ctrl+1..7`, in one row along the bottom, from
`ViewKeys.tsx:4-17`:

- **Mission** · **Tasks** · **Terminal** — then a hairline, then the group the
  file itself labels *"Verification tools: where you check what an agent did"*:
- **API** · **Database** · **Browser** · **Editor**

Terminal layouts are three, not four: `store.ts:127` —
`"tabs" | "grid" | "overview"`. Canvas is gone. Six skins (3 themes × 2 styles),
down from 84. 44 modules in `src/main`, 9 in `src/shared`, ~59 renderer
components. `npm run typecheck` at zero; 1,641 specs; no component tests
(`vitest.config.ts` is `environment: "node"`).

### What it does that nothing else does

This is the strongest version of "the product already knows what it is," and it
is not a claim about features. It is a claim about a theory of the user, and the
theory is enforced in the type system.

1. **A project is the unit of context**, and it is the only navigation object.
   `viewByProject` (`store.ts:122`) is the sole survivor of 23 layout candidates
   killed in `1devtool-2026-08-31/T1-verdict.md`.
2. **The attention / acknowledgement split.** `tileState.ts:275-290` takes `seen`
   as a *third argument* rather than a field, and the comment at `:264-267` says
   why: a field there "could be read by the classifier and would put a
   visibility-derived fact back into what a session IS." `styles.css:1165-1172`
   sets a tripwire against the regression. I know of no competitor with this.
3. **Three states, because there are three facts.** `changedCount: number | null
   | undefined` (`tileState.ts:53-64`) — found / asked-and-could-not-find-out /
   never-asked. 0.12.0 is almost entirely this idea applied to agent-CLI presence.
4. **Signals derived from prose are refused by policy**, at the top of the file
   that would classify them (`tileState.ts:5-11`).
5. **One count per question**, because eleven surfaces once answered "who needs
   me" (`CHANGELOG.md:587-591`; the rule is kept live at `tileState.ts:259-262`).
6. **The phone approve/deny card** — the parsed question with the raw excerpt
   beneath it, the decision bound to a `tailHash` and spendable once
   (`shared/approval.ts`, `main/decisions.ts`).
7. **Multi-client pty with buffer replay**, so panes detach and re-attach and a
   phone attaches to a live session with no relay, no daemon and no account.
8. **Corporate-network survival** — `netproxy.ts` injects an upstream proxy into
   every child DevDeck spawns; `projectenv.ts` holds per-project env, encrypted.

Where the last six months actually went, from `CHANGELOG.md` 0.9.0 → 0.13.0:
roughly **60% honesty and correctness fixes, 15% new surfaces, 15% deletions,
10% distribution.** That ratio is the product's real character and it is a good
one. The recurring bug class never varied: *a surface asserting something it
never observed.*

### Built, and unearned — the empty-table test, run on the one machine that has ever run DevDeck

`%APPDATA%/devdeck/`, read 2026-09-08. The 2026-09-02 decision correctly warns
that an empty store proves *"he did not use it"*, never *"nobody wants it"*. I am
not making the market claim. I am making a narrower and harder one: **these
features' entire stated justification was the author's own workday
(`IDEAS.md:8-10`), and the author's own stores refute it.** They are not
unvalidated. Their only evidence is against them.

| Store | Value | What it means |
|---|---|---|
| `connections.json` | **does not exist** | The Database view has never held **one** connection. It ships `pg`, `mysql2`, `mssql` and `node-sqlite3-wasm` — **4 of the 9 remaining production dependencies** — behind a 618-line panel. |
| `dbQueryHistory` | `{}` | Zero successful queries, ever (`settings.ts:1108-1111` records every one). |
| `collections` | `[]` | The API client — `ApiPanel.tsx`, **996 lines, the largest component in the app** — has never saved a request. |
| `environments` / `activeEnvId` | `[]` / `null` | API environments, never used. |
| `gitAccounts` | `[]` | Milestone 15 plus `gitpat.ts` (encrypted PATs, GitHub verify). Never used. |
| `sshProfiles` | `[]` | Milestone 16. Never used. |
| `routingRules` | `[]` | A whole spec and plan (`2026-08-13-agent-routing-design.md`). Never used. |
| `triggers` | `[]` | Never used. |
| `projectCommands` | `{}` | Saved commands per project. Never used. |
| `boardTasks` | **2 rows** | **Tasks** holds a top-level deck key and `Ctrl+2`. |
| `canvasPos` / `canvasLinks` | `{}` / `[]` | Debris — still persisted for a feature deleted on 2026-09-04. |
| `usageLog` | 76 rows | Real use. |
| `termLayout` | `"overview"` | The author uses neither tabs nor grid. |

`market/E3-ade-or-ide.md:253-254` already wrote the test that settles this:
**"Every surface must either feed an agent or judge one."** Row I applied it to
the four surfaces that failed outright (Network, ReleaseBoard, Standup, Dotnet).
It was never applied to the four that pass *in theory* and are refuted *in
practice*: `1devtool-2026-08-31/T1-verdict.md:36-41` recorded the verification
panels as "under-*used*, zero recorded uses" on 2026-08-31, and nothing happened.
`WorkPanel` is the same shape — E3 rules it **passes** the agent-edge test (it is
how delegated work enters), and `E3:55-64` records `work.ts` as four commits, all
on one day, never returned to. There is no work-item configuration among
`settings.json`'s 24 keys.

**I am not deleting any of them today.** A deletion before step 9 is UI work, and
UI work before step 9 is already refused (`ROADMAP.md:296-300`). I am
pre-registering the deletion instead — **D1**, section 6 — so it happens on
evidence rather than on my taste, and so it cannot be quietly dropped in October.

### Claimed and not proven

- **The phone approve/deny card has never rendered on real hardware.** Step 7,
  unmoved since 2026-09-04, blocked on nothing, four days idle.
- **0.13.0's release note claims its CI works.** `cf38972`, the same day, records
  that the workflows ran for the first time only when the repo went public, and
  `check` was **red on every push** — three failures fixed *after* the claim was
  written. 0.10.0's "something other than a person runs them" has the same
  problem retroactively.
- **"590.45px, identical in all six skins"** (`ROADMAP.md:193-207`). Six skins
  yielding the same two-decimal figure reads as one measurement generalised, and
  the entire `minWidth: 900` argument rests on the 782.45 vs ~886px margin.
- Single-sample "measured" latency figures (4 s shell / 12 s agent).
- From `HANDOFF.md` §4, unproven and occasionally restated as settled: F9 (does
  `new Notification` survive the deny-all permission handler), PowerShell
  bracketed paste, the pg `WITH x AS (DELETE …)` bypass.
- **The usage ledger has a confirmed data-loss bug** — it rewrites every session
  the user did not hand-close to 0 ms. It is the surface that shows money.

### Documents that are now false

This part costs a beta user, so it is not a footnote.

| File | The false sentence | Since |
|---|---|---|
| `README.md:26` | "Current release: **0.12.0**" | 0.13.0 tagged 2026-09-07 |
| `README.md:47` | "Download the latest installer from the Releases page" | the only release is a draft — that page is empty to a stranger |
| `README.md:56-60` | SignPath "has **not** been applied for yet, and cannot be: the Foundation requires a public repository and this one is still private" | **2026-09-07.** Half true and wholly misleading — it is unfiled, but the stated reason is gone |
| `README.md:60` | links `site/index.html` as "the DevDeck homepage" | Pages is 404; that is a path into a repo, not a homepage |
| `site/index.html:246-249` | "the Foundation requires a public repository and **this project's repository is still private**" | **2026-09-07.** The homepage of a public repo says the repo is private |
| `docs/beta/02-recruiting-message.md:10` | "The repo is private, so the user cannot open an issue" | **2026-09-07** — issues are enabled and open |
| `.superpowers/HANDOFF.md` §1–2 | "**0.11.1 is cut and tagged**"; next action "install 0.11.1" | two releases ago |
| `IDEAS.md` "the moat" | lists DotnetPanel, ReleaseBoard, StandupModal, terminal recording and Canvas as shipped assets | all deleted 2026-09-04 |
| `ROADMAP.md:3` / `PRODUCT.md:3` / `README.md:3` | "**The vision is all-in-one**" / "an editor, an API client, and a database client in one window" | `market/E3-ade-or-ide.md:341-343` ruled "All-in-one" **Not real** on 2026-08-25, and row I deleted four panels on that basis on 2026-09-04 |

The last row is the important one. GitHub's own repo description — the first
sentence a stranger reads — is already correct: *"A Windows desktop cockpit for
supervising AI coding-CLI sessions across projects."* Every document under it
still sells a different product. **That contradiction is now published.**

---

## 2. Target

### The claim, in three sentences

DevDeck is for **one developer, on Windows, in a real Windows shell, who runs an
agent CLI most days across more than one repo, and whose actual problem is not
knowing which of several agents is waiting on them.** What they do today is three
`claude` tabs in Windows Terminal, an IDE they alt-tab to in order to read what
the agent wrote, and no way at all to answer *"which one needs me"* except
clicking each tab in turn. That makes one thing unthinkable: **any surface that
competes for the attention it exists to protect** — which is why this product's
best work has been deletions, and why it is the only product in its category
that can say what it forbids.

### Ruling: the target has not drifted; the product's *description* has

"Terminal-first developer driving AI CLIs across several projects" is still
right, and for a reason stronger than habit: it is the only reading of this
codebase under which `tileState.ts`, `wantsYou`, the three-state probe and the
phone card are the centre and everything else is periphery. Every competing
reading has been tried in this repo — all-in-one, ADE, creativity, and
`market/D2`'s C#/legacy-workday moat — and each one generated a surface that was
built, never used, and deleted.

The drift is real but it is **in the copy, not in the roadmap.** The product
became a supervision cockpit over three releases; the words on its front page
still describe a Postman-plus-DBeaver-plus-VS-Code suite. A stranger recruited on
the first sentence will judge it as the second, which is how S4 fails for a
reason that has nothing to do with the interface.

`docs/beta/01-who-to-approach.md` already holds the operational form of the
target and it is better than anything I would write: three required facts
(Windows shell, agent CLI most days, more than one repo), plus a fourth asked
rather than assumed — *whose machine is it*. Its own sentence is the right one:
**"That is not a market segment; it is a situation a person is already in."** I
am adopting it unchanged.

### Who this is explicitly NOT for

- **macOS and Linux developers.** *Not us.* Windows-only is the position, not a
  limitation — DevDeck drives a real Windows shell and a real ConPTY. They have
  Orca, Warp, Ghostty, tmux.
- **Anyone driving agents from an IDE extension or a chat window.** *Not us.*
  There is no pain here: their agent is already where they read code. Cursor,
  Copilot, Claude in VS Code.
- **Anyone running one agent at a time.** *Not us.* The entire product answers a
  question that only exists at N ≥ 2. A terminal emulator is strictly better for
  them, and saying so is the honest sale.
- **Teams.** *Not us*, and the expansion most likely to arrive by accident. A
  second person seeing your agents needs shared state, which needs a service,
  which needs an account. Orca's relay, or a CI dashboard.
- **Anyone who wants an IDE.** *Not us.* No LSP, no debugger, no refactoring.
  The editor is a reader and a diff surface (`E3:309-313`).
- **Anyone who wants Postman or DBeaver.** *Not us* — and after section 1's
  stores I will go further: it was never *for* them, and the panels built as
  though it were are on notice.
- **A locked-down corporate machine that refuses an unsigned installer.** Not a
  "not for" — a **datum**, which `01-who-to-approach.md` already asks for. If it
  disqualifies three of five, that is kill criterion K4, not a segment.

---

## 3. Goal

### The goal, stated so it can be observed to have happened

**Five recorded first sessions from five people who are not the author, each on
their own machine, each carrying at least one verbatim dated quote in
`NOTES.md`, by 2026-10-06.**

Not five installs. Not five conversations. Not ten invitations. The countable
unit is a **recorded session** as defined in
`docs/beta/05-validation-criteria.md`, and that file's bar is unamended and stays
unamended: S1–S4 at their stated thresholds, E1–E5 held, R1–R3 *evaluated* and
written down whether they pass or fail. Five sessions with R1–R3 all failing is a
**completed** milestone with a **negative** result, and that is a legitimate
outcome.

### Ruling: the milestone does not change

I looked for a reason to change it, because the brief invited one and because a
milestone that survives every review starts to look like furniture. There is no
reason. The candidates I considered and rejected:

- **Raise it to a public launch.** Refused. 1DevTool got ~3,000 installs and ~20
  active users (`ROADMAP.md:686`); a launch enlarges the denominator of an
  adoption failure. And there is nothing to launch to: 0 stars, 0 forks, 0
  issues on a repo that has been public for a day.
- **Lower it to one user.** Refused. One user is an anecdote, and the first user
  will almost certainly come from the author's professional network — the
  archetype `01-who-to-approach.md` itself flags as capable of installing it "to
  be polite." Five is the smallest number at which S1's ≥4/5 and R1's ≥3/5 mean
  anything.
- **Add revenue.** Refused. Pricing before R3 exists is pricing a hypothesis.
  The standing decision says "possibly paid"; it does not say now.
- **Replace it with the certificate.** Refused — and this is the substantive
  change in this document.

### What does change: the certificate stops gating the milestone

On 2026-09-04 the order was cert (steps 4 + 6) → publish → recruit. Step 4 is
done. Step 6's CI half is proven. What remains of step 6 is **a third party's
approval queue** — the SignPath Foundation web form, whose timeline nobody in
this repo controls and which can be refused.

`field` dissented on this dependency; the dissent is recorded at
`ROADMAP.md:43`. **I am upholding it.** The argument, and it is not close:

1. Whether SmartScreen actually stops a recruited stranger is **already a
   pre-registered experiment** — prediction 3, kill criterion K4, criterion S1,
   stop-the-line rule L4. Waiting weeks for a certificate to avoid running an
   experiment you have already designed is the most expensive possible way not to
   learn something.
2. The milestone's unit is a **hand-delivered build to a named person with the
   SHA-256 sent separately** (`docs/beta/07-the-build.md`). That needs no
   certificate. It needs a file and a message.
3. **L4 caps the downside at one candidate.** One abandonment at SmartScreen
   stops the line, and the certificate then becomes the top of the roadmap on
   evidence. The gate protects the remaining candidates by itself.
4. The upside of waiting is zero. A certificate held while nobody has been
   contacted buys nothing at all.

**Costing my own advice, as I am required to.** Taking it: you risk spending one
or two of roughly fifteen gate-qualified candidates on learning that the
certificate was the wall, and you accept that the first two users see "Windows
protected your PC." Refusing it: 100% of a milestone whose engineering is
complete waits on a form's approval queue, and the likeliest outcome is that
2026-10-06 arrives with the certificate granted and still zero recorded sessions.
That is the failure this product is actually at risk of, and it is not technical.

The filing still happens — this week, in parallel, by the owner — because it is a
web form and it gates users six through ten and everyone after them. It does not
gate user one.

### And a deadline, because the pattern needs one

Every engineering blocker named on 2026-09-04 is gone as of 2026-09-07. Step 7
has been "blocked on nothing, can start today" for **four days** and has not
started. Step 9's remaining blockers are now two document sittings and one
publish. The roadmap predicted this by name at `ROADMAP.md:29-30`: *"any proposal
to write more is a way of not asking."* It was right, and I am adding the one
thing that makes it enforceable — a date, and a kill criterion that fires on the
owner rather than on the users. See **K6**.

To be fair to the last four days: 2026-09-05 → 07 delivered step 2's second half
(a real, correctly found identity leak in 654 commits), step 4, and step 6's CI
half. That was roadmap execution, not avoidance. The avoidance candidates are
narrower and both are named above: step 7, idle four days with nothing in front
of it, and step 9, whose blocker list has shrunk to document edits.

---

## 4. The roadmap

### Closed

| # | Step | Closed |
|---|---|---|
| 1 | `LICENSE` + provenance audit | 2026-09-02 |
| 2 | Scrub the tree and its history | both halves 2026-09-05 (identity + content) |
| 3 | Rewrite the competitor kill-lists for publication | 2026-09-02 |
| **I** | The UI/UX overhaul interrupt — six surfaces, 78 skins, the crash | 2026-09-04 |
| 8 | First contact — empty states, presence, the failure a stranger hands back | 2026-09-03, shipped 0.12.0 |
| 4 | The public flip | **2026-09-07** — verified today: PUBLIC, MIT, issues on, feed URL byte-identical |
| — | *Added on 2026-09-04*, all three | `e5327ad` (double-spawn), `30cfe4a` (unreadable `projects.json`), and the deck measurement |

### Survives

| # | Step | State on 2026-09-08 |
|---|---|---|
| 5 | The homepage | drafted, **content-complete and factually wrong** (says the repo is private); Pages not configured |
| 6 | CI + SignPath | **CI half proven** on the `v0.13.0` tag; the signing half needs a filing nobody has made |
| 7 | The phone card on real hardware + the four CDP-blind observations | **not started, four days idle, blocked on nothing** |
| 9 | Recruit 5–10, one at a time | **not started, nobody contacted** |

### New, and none of it is a feature

| # | Step | Owner | Unblocks |
|---|---|---|---|
| **10** | **The documents that now lie about the repo being private** — `README.md` (status, the Releases instruction, the SignPath paragraph, the homepage link), `site/index.html:246-249`, `docs/beta/02-recruiting-message.md:10`, plus `HANDOFF.md` and `IDEAS.md`'s stale moat list | `docs-writer` / `marketing` | Step 5 (you cannot deploy a homepage that says the repo is private) and step 9 (the recruiting message currently tells a candidate they cannot file an issue) |
| **11** | **Publish `v0.13.0` with the locally signed binaries** — replace the draft's four unsigned CI assets with `release/`'s signed Setup + Portable + blockmap, regenerate `latest.yml`, prove it with `node scripts/update-manifest.mjs --check` | `release-eng` | The README's download path stops being a dead end; auto-update gets a real feed; step 9 gets a delivery path |
| **12** | **Lead with the cockpit, demote the suite** — one paragraph each in `README.md:3`, `PRODUCT.md:3`, `ROADMAP.md:3` and `site/index.html`'s hero, so the published claim matches GitHub's own description and the 2026-08-25 ruling that "all-in-one" is Not real | `marketing` / `product-director` | D1 being executable later without breaking a promise |

Step 11 carries a real decision that must be stated: **publish the self-signed
local build, not the unsigned CI build.** An unsigned binary draws more antivirus
noise than a self-signed one (`ROADMAP.md:40` establishes this), and
`latest.yml`'s sha512 must match whatever is actually attached or auto-update
breaks on first contact. The draft's Setup is 30,965 bytes smaller than
`release/`'s; that difference is the signature.

### The order, in wall-clock terms

1. **Step 10 — fix the documents that now lie.** `docs-writer` + `marketing`.
   *Unblocks 5, 9, 11.* Half a day. **Nothing else goes out before this**: two of
   the four files are what a stranger reads first.
2. **Step 12 — repoint the published claim at the cockpit.** `marketing`. Same
   sitting, same files, one review pass.
3. **Step 11 — publish 0.13.0 with the signed assets and a verified manifest.**
   `release-eng`. *Unblocks step 9's delivery path.*
4. **Step 5 — enable Pages, deploy `site/index.html`, link it from the README.**
   `marketing`. *Unblocked by step 4; corrected by step 10.*
5. **Step 7 — the human sitting.** `qa`, a human with a phone. *Unblocks the
   beta's first impression.* **In parallel with 1–4.** It has been blocked on
   nothing for four days and must not now wait behind a document edit.
6. **File with SignPath.** Human, web form, ten minutes. **In parallel, gating
   nothing on this list.** *Unblocks users 6–10 and everyone after.*
7. **Step 9 — invite candidate one.** `field` drafts, a human sends. *Unblocks
   the evidence this milestone exists to get.* **Preconditions: 10, 11, 7. Not 6.**
8. Then, and only then: the usage-ledger data-loss bug, then
   `claude --session-id` per-pane transcripts.

**Left off on purpose:** every feature; any UI or motion work; the deletion of
the verify half (pre-registered as D1, executed *after* the milestone, never
before); the ledger fix (moved to the watch list — section 5); macOS, Linux,
`remote.enabled` by default, a sixth competitor study (permanently), a seventh
skin (refused in advance, twice), and every candidate in section 5.

### The test each item passes

**Kept, unchanged:** *does this get a stranger closer to running DevDeck and
saying something back?* It is the right test and it survived contact with
reality — it is what killed a creativity brainstorm on 2026-09-07 and what makes
step 10 outrank every item in `IDEAS.md`.

**One test added, because the first was insufficient in a specific way.** It
permitted four days in which the milestone's own document said the remaining
blockers were human acts. So:

> **Is this step a human act or a code change? When every remaining blocker is a
> human act, a code change is a way of not performing the human act — including a
> correct, well-argued, necessary one.**

Steps 10, 11 and 12 are the last code-and-document work I am willing to order
before an invitation goes out. If a fourth appears, it is being used to delay
step 9, and I will name it as one.

---

## 5. What the identity forbids

This is the deliverable. Each item names its kind of no, and who it belongs to.

### Killed on the empty-table result

- **The Database view as a product.** *Not us — DBeaver, SSMS, `psql`.* No
  connection has ever existed on the only machine that has ever run this app.
  Pre-registered for deletion as **D1**, along with `pg`, `mysql2`, `mssql` and
  `node-sqlite3-wasm` — 4 of the 9 remaining production dependencies.
- **The API client as a product.** *Not us — Postman, Insomnia, `curl`.* 996
  lines, zero saved collections, zero environments. Same criterion.
- **Any further growth of either, in any form** — a fifth engine, OAuth flows, a
  mock server, GraphQL. *Refused now, not pre-registered.* `market/D2` forbade
  this on 2026-08-25; it is re-forbidden here on stronger evidence.
- **The Work panel (Jira / Azure) as a moat.** *Not real, with a receipt.*
  `E3:55-64`: four commits, one day, never returned to; no work-item config among
  `settings.json`'s 24 keys. It passes the agent-edge test in theory and is
  refuted in practice. Folded into D1's scope.
- **Tasks as one of the seven deck keys.** *Not real, at that altitude.* Two rows
  on the author's machine, holding `Ctrl+2` and a seventh of the deck. Demotion
  is UI work, so it waits for D1's window — but the key is on notice.

### Killed on identity

- **Anything team-shaped** — a shared deck, a second person seeing your agents,
  seats, org defaults, SSO. *Not us — Orca's relay, or a CI dashboard.* This is
  the expansion that arrives one "let me just show a colleague" at a time.
- **A hosted service, an account, a relay, a pairing service, a daemon, anything
  that survives closing the window.** *Not us.* Decided 2026-08-30, re-affirmed
  here. `PRODUCT.md:20` is the promise that lets a stranger point this at client
  repos, and it is the only promise in the document that cannot be partly kept.
- **Telemetry — including anonymous, including "just for the beta."** *Not us*,
  and the item I most expect to be proposed in the next fortnight. A counter
  would answer a question nobody asked, at the cost of the promise above. The
  beta's instrument is a watched install and a verbatim quote. That is slower,
  and it is the point.
- **macOS and Linux.** *Not us.* The five are recruited on Windows or not
  recruited.
- **A native mobile app.** *Not us.* The only thing native buys over the web
  client is plain `ws://` without a secure-context rule.
- **Adopting the word "ADE" publicly.** *Not us.* Say "supervision cockpit," or
  say nothing (`E3:341-343`).
- **"All-in-one" as a published claim.** *Not real.* Ruled 2026-08-25, acted on
  2026-09-04, still printed on three front pages — which step 12 fixes.

### Killed on sequence — *not yet*, with the trigger named

- **A public launch** — HN, Reddit, Product Hunt, a launch post. *Not yet.*
  **Trigger: five recorded sessions with S1–S4 met at their bars.** A launch
  before that spends the only first impression this product gets on a build no
  stranger has ever completed a session with.
- **A price, a licence key, a paid tier.** *Not yet.* **Trigger: R3 — one
  unprompted sentence that a user chose DevDeck over what they used before.**
- **The usage-ledger data-loss bug.** *Not yet*, and I am overruling the
  temptation to promote it. It corrupts a ledger nobody but the author reads, it
  loses no user's *work*, and S3/L3 cover unrecoverable stops — which this is
  not. **But** a cost display that lies is exactly stop-the-line rule L2's class
  (*wrong information, acted on*). So it moves to the **watch list** beside the
  shell-mismatch false negative: `field` adds it to
  `03-install-watch-protocol.md` as a known gap to watch for, not a build to
  schedule. **Trigger: any beta user opens the Usage view in a recorded
  session.** That is the cheap honest move; fixing it now is the expensive one.
- **PWA / Web Push / a trusted `tailscale cert`.** *Not yet.* Existing trigger
  stands: the recorded complaint is specifically "I missed it because the tab was
  closed."
- **`remote.enabled` on by default.** *Not yet.* Existing trigger stands.

### Refused again, by name, because they will be proposed again

- **A guided tour or onboarding modal.** *Refused, not deferred.* The fix for
  "the app explains itself once" is self-describing empty states, not a modal
  dismissed in two seconds.
- **A seventh skin** — mood, flow, focus, ambience, "we can afford it now."
  Refused in advance 2026-09-04, refused 2026-09-07, refused here. 84 → 6 bought
  cheap verification; spending it on a skin spends the only thing the cut bought.
- **The whole creativity family** — scratchpad, decision journal, session replay,
  Canvas revived as a spatial thinking surface, prompt inspiration, divergent
  multi-agent exploration. The 2026-09-07 ruling stands in full and I am not
  re-litigating it. Note only that the bake-off — the textbook version of the
  last one — holds this repo's record for largest deletion at −2,111 lines and
  never completed a race.
- **A sixth competitor study.** *Permanently off.* And a note on the existing
  ones: `.superpowers/market/` is now **partly superseded**. `D2`'s
  "Open-sourcing DevDeck, MIT or otherwise — Not us" is dead (MIT landed
  2026-09-02, public 2026-09-07), and `E3`'s headless argument is dead
  (`T2:134-162`). Read those folders for the **tests** they produced — the
  agent-edge test, the empty-table test, the `run-app`-observability test — not
  for their verdicts.

### The one thing I am refusing that nobody has proposed

**A fifth piece of pre-beta engineering.** Whatever it is, whoever proposes it,
however good. Steps 10, 11 and 12 close the door.

---

## 6. Kill criteria — pre-registered

`docs/beta/05-validation-criteria.md`'s K1–K5, S1–S4, R1–R3, E1–E5, L1–L4 and
its four predictions stand **unamended** — and its amendment rule (the original
line stays, the amendment is dated beneath it, and any amendment made after the
first session is recorded in the milestone verdict) is exactly why. I am adding
two, both today, both before any session exists.

- **K6 — the owner does not send the first invitation.** If **no candidate has
  been contacted by 2026-09-22**, with every engineering blocker gone since
  2026-09-07 and steps 10–12 costing under two days, the finding is that the
  standing decision of 2026-09-02 — *"a product with users"* — is not held by the
  person who must act on it. **Then:** revert `PRODUCT.md` to "for me, first,"
  close the distribution programme (no SignPath follow-up, no Pages, no
  recruiting), un-publish nothing, and keep DevDeck as a personal instrument —
  which is a respectable thing and a *cheaper* thing. This is the only kill
  criterion that fires on the author rather than the users, and on the evidence
  of the last four days it is **the most likely of the six to fire.** I would
  rather it be written down now than discovered in December.

- **D1 — the verify half is deleted on silence.** Fires when **all three** hold
  across the five recorded sessions: **(a)** no user opens the Database view or
  the API view unprompted in any session; **(b)** no user names either as a
  reason they would keep the app; **(c)** no user asks about either in the day-7
  follow-up. **Then:** delete `DbPanel`, `ApiPanel`, `WorkPanel`, their IPC
  handlers and their stores, together with `pg`, `mysql2`, `mssql` and
  `node-sqlite3-wasm`, and demote **Tasks** out of the deck. All three conditions
  are required deliberately — a 30-minute first session would not reach a
  database panel anyway, so (a) alone would be a rigged test.
  **What committing costs:** the "all-in-one" claim the product was founded on,
  plus roughly 2,200 lines and 4 of 9 production dependencies — which is also
  precisely what abandoning it *saves*, forever, in every future release, for a
  user who has never existed on any machine.

### What would prove me wrong

1. **Prediction 2 fires** — three of the first five ask, unprompted, where the
   Network view or Canvas went. Then the agent-edge test that killed six surfaces
   is too narrow, the subtraction thesis is wrong, and D1 must be withdrawn
   before it is ever executed.
2. **A first session is spent in the API or Database panel, and the user names it
   as the reason they would keep DevDeck.** Then the verify half *is* the
   product, the cockpit is the wrapper, "all-in-one" was right all along, step 12
   was a mistake, and the empty stores measured only one man's habits. One such
   sentence outweighs the whole of section 1.
3. **S1 passes 5 of 5 through SmartScreen.** Then the certificate was never the
   gate, prediction 3 fails, and my sequencing call in section 3 was right for
   the wrong reason — I expect it to cost one or two candidates.
4. **K4 fires at user one.** Then my sequencing call cost a candidate the
   certificate would have saved, and the 2026-09-04 ordering was right.
5. **S4 passes with the wrong words** — users can say what DevDeck is for, and
   three or more say it in terms of holding their own head straight across
   several repos rather than in terms of supervising agents. Then the attention
   frame is the narrow one, and the interface is already teaching a broader
   lesson than I think it is.

---

## 7. Handoff to `pm`

Ordered work items. `pm` sequences and assigns; it does not re-open the ordering.
**Items marked 🔒 cannot be moved by any agent** — they need a person.

| # | Item | Owner | Unblocks | Notes |
|---|---|---|---|---|
| **1** | Correct `README.md` — status → 0.13.0; the Releases-page instruction (true only after item 3); the SignPath paragraph (repo is public, filing outstanding); the `site/index.html` "homepage" link (true only after item 5) | `docs-writer` | 2, 5, 9 | Every step it writes must have been executed |
| **2** | Correct `site/index.html:246-249` and `docs/beta/02-recruiting-message.md:10`; refresh `.superpowers/HANDOFF.md` §1–2 to 0.13.0; strike the deleted surfaces from `IDEAS.md`'s moat list | `marketing` / `docs-writer` | 5, 9 | Same sitting as item 1; one `po` pass over both |
| **3** | Publish `v0.13.0`: replace the draft's four unsigned CI assets with `release/`'s signed Setup + Portable + blockmap, regenerate `latest.yml`, verify with `node scripts/update-manifest.mjs --check`, then publish. Notes roll up 0.11.0 / 0.11.1 / 0.12.0 / 0.13.0 and open by stating: private beta, one maintainer, Windows-only, self-signed | `release-eng` + `marketing` | 9; the README's download path; auto-update | Prior art: `docs/release/0.13.0-notes.md`, `published-release-notes.md`. **Do not publish the CI assets** — sha512 must match what is attached |
| **4** | Repoint the published claim at the cockpit: lead paragraph of `README.md:3`, `PRODUCT.md:3`, `ROADMAP.md:3`, and `site/index.html`'s hero — matching GitHub's own repo description; the verify tools become a second sentence, not the headline | `marketing` | D1 being executable without breaking a promise | One paragraph each. Not a rewrite |
| **5** | Enable GitHub Pages (currently 404), deploy `site/index.html`, link it from the README | `marketing` | The SignPath filing's published-policy requirement | Needs items 1–2 first, or it publishes a false statement |
| **6** | 🔒 **Step 7 — the human sitting.** Phone approve/deny on real hardware; the native folder dialog and `addProjectByPath` on a bad path; `F1`/`Ctrl+K` via real keys; the "none found on your PATH" state; the crash card; the phone client's palette | `qa`, **a human at the keyboard** | The beta's first impression | **Runs in parallel from now.** Four days idle, blocked on nothing. Protocol: `docs/qa/phone-approval-verification.md` |
| **7** | 🔒 **File with the SignPath Foundation.** Web form; needs the public repo (satisfied) and the published policy (item 5) | **the owner** | Users 6–10 and everyone after | **Gates nothing else on this list.** Ten minutes |
| **8** | Add the usage-ledger data-loss bug to `docs/beta/03-install-watch-protocol.md` as a watched known gap, beside the shell-mismatch false negative | `field` | Honest observation of L2's class | A doc edit, not a build |
| **9** | 🔒 **Step 9 — invite candidate one.** Name them against the three-fact gate, send the message, watch the install, record the session verbatim into `NOTES.md` → "Beta — external users" | `field` drafts; **a human sends** | The evidence this milestone exists to get | **Preconditions: 1, 2, 3, 6. NOT 7.** One at a time; stop the line on L1–L4 |
| **10** | 🔒 Repeat item 9 to five recorded sessions, then write the milestone verdict against S1–S4 / R1–R3 / E1–E5 and record which predictions fired | `field` → `po` | The verdict; D1's evaluation | Deadline **2026-10-06**. **K6 fires if item 9 has not happened by 2026-09-22** |

**Parallel-safe:** items 1 + 2 + 4 touch the same four files and must be one
agent's sitting, reviewed once. Item 3 touches only `release/` and the GitHub
release. Items 6 and 7 touch nothing in the tree. Item 5 needs 1–2 merged.

**Nothing in this handoff is a feature, a spec, or a component.** If `pm` finds
itself sequencing renderer work, an item has been mis-read.

---

## 8. Proposed `ROADMAP.md` edit

Do not apply until the owner has seen this ruling. Four changes, all inside
`## Next — the path to 5–10 real users`, plus the file's opening line. Everything
below Milestone 1 is untouched.

### Edit A — replace `ROADMAP.md:3` (the file's opening line)

It currently reads *"The vision is all-in-one."* That is the claim
`market/E3-ade-or-ide.md:341-343` ruled **Not real** on 2026-08-25 and that row I
acted on. Replace with:

> DevDeck is a **supervision cockpit**: one window where a project is the unit of
> context, and one row answers *which of my agents is waiting on me*. Around that
> sit the tools for judging what an agent did — a terminal, a diff-and-read
> editor, and verification panels that are on notice (see kill criterion **D1**).
> The build is sequenced into milestones so there is a usable daily-driver early.
> Keep each milestone ruthlessly shippable, and default to removing.
>
> *(Amended 2026-09-08. The previous line read "The vision is all-in-one." That
> claim was ruled Not real on 2026-08-25 and six surfaces were deleted on it on
> 2026-09-04, while three front pages went on printing it.)*

### Edit B — replace the header block at `ROADMAP.md:23-30`

Replace the paragraph beginning *"What changed on 2026-09-04, and it is the
important sentence in this file"* with:

> **What changed on 2026-09-08, and it is the important sentence in this file:
> the milestone is no longer blocked on anything an agent can do.** Step 4 landed
> on 2026-09-07 — the repo is public, MIT-licensed, issues open, the updater feed
> URL byte-identical. Step 6's CI half is proven. Every engineering blocker named
> on 2026-09-04 is gone. What remains is **four human acts** — a phone sitting
> (step 7), a web form (the SignPath filing), a publish, and an invitation
> (step 9) — plus under two days of document correction, because **four tracked
> files still tell a stranger this repository is private.**
>
> **The certificate no longer gates the milestone.** `field`'s dissent at row 9
> is upheld: whether SmartScreen stops a recruited stranger is already a
> pre-registered experiment (prediction 3, K4, S1, L4); the delivery path is a
> hand-delivered signed build with the SHA-256 sent separately; and L4 caps the
> downside at one candidate. The filing happens this week, in parallel, and gates
> users six through ten. It does not gate user one.
>
> Two tests now, and the second is new. **(1)** *Does this get a stranger closer
> to running DevDeck and saying something back?* **(2)** *Is this a human act or
> a code change?* When every remaining blocker is a human act, a code change is a
> way of not performing the human act — including a correct one. Steps 10, 11 and
> 12 are the last code-and-document work ordered before an invitation goes out. A
> fourth is a delay and will be named as one.

### Edit C — the state column, plus three new rows

- **Row 4** → `**done 2026-09-07**`, keeping the existing detail (it is
  accurate). Append: *"Verified 2026-09-08 by `gh repo view`: PUBLIC, MIT, issues
  enabled, 0 stars / 0 forks / 0 issues. Remaining: the SignPath filing — a web
  form, now unblocked, and no longer a gate on step 9."*
- **Row 5** → append: *"**Still undeployable as written**: `site/index.html:246-249`
  says the repository is private. Pages is not configured (`gh api …/pages` →
  404). Fix step 10 first, then enable Pages."*
- **Row 6** → append: *"**Reclassified 2026-09-08: no longer a gate on step 9.**
  The signing half waits on a third party's approval queue; the milestone does
  not."*
- **Row 9** → replace *"Three blockers, none of them code"* with: *"**Blockers as
  of 2026-09-08: step 10 (four documents that say the repo is private), step 11
  (publish 0.13.0 signed — the public repo currently shows a stranger an empty
  Releases page), and step 7. Not step 6.** `field`'s dissent is upheld."*
- **New rows 10, 11, 12** — exactly as tabled in section 4 above.

### Edit D — replace `### The order, in wall-clock terms`

Replace the eight-item list with section 4's eight-item list. Replace the *Left
off this list on purpose* paragraph with section 4's. Append two new
subsections carrying section 5's kill list and section 6's **K6** and **D1**
verbatim. Add a pointer line under the section heading:

> Re-ordered **2026-09-08** by `product-director`. Full ruling and evidence:
> `docs/superpowers/brainstorm/2026-09-08-product-direction.md`.

The **0.13.0 ruling (2026-09-04)** and **What step 4 costs, priced (2026-09-04)**
subsections stay as written — they are closed history, and a plan that deletes
its own reasoning is how the same argument gets had twice. Add one line beneath
the 0.13.0 ruling:

> **Superseded 2026-09-08 on its own terms.** Step 4 has landed, so "publish
> nothing until step 4 lands" is satisfied. 0.13.0 is now ordered published —
> with the locally *signed* binaries rather than the unsigned CI set, and
> `latest.yml` regenerated to match what is actually attached.

### And one `PRODUCT.md` note, for the owner to consider in the same sitting

`PRODUCT.md:3`'s tagline and its closing "For me (a developer who lives in agent
CLIs), first" contradict the standing decision of 2026-09-02. Its Validation
section was rewritten on 2026-09-04 and is exemplary; the tagline was not
touched. It should lead with the cockpit and drop "first" — but that is item 4 of
the handoff, and it goes out in the same reviewed sitting as the other three
files, not as a separate pass.
