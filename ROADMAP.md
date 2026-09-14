# Roadmap — DevDeck

DevDeck is a **supervision cockpit**: one window where a project is the unit of
context, and one row answers *which of my agents is waiting on me*. Around that
row sit four things and only four — Mission, a terminal, an embedded browser, and
a diff-and-read editor. The build is sequenced into milestones so there is a
usable daily-driver early. Keep each milestone ruthlessly shippable, and default
to removing.

**Added 2026-09-15, because the line above no longer distinguishes this product
from anything.** Herdr, Pane, Maestro, Nimbalyst, Orca and `claude agents` will
all tell you which agent is waiting. The one thing DevDeck does that none of
them does is **name the source of the signal and refuse what it cannot source**
— the agent said it, or DevDeck guessed, and a hook it cannot match to a session
attributes nothing. That is the whole of the claim, it is untested on anyone,
and it survives because nobody competes on it, which may also mean nobody buys
on it.

> *Amended 2026-09-11.* On 2026-09-08 `product-director` ordered this line
> replaced because it read *"The vision is all-in-one"* — a claim ruled **Not
> real** on 2026-08-25. That edit was never applied, and it is now obsolete twice
> over. Someone had already struck "all-in-one" (`3afe11d`), and the replacement
> text I proposed described "verification panels that are on notice (see kill
> criterion **D1**)". Both halves of that sentence are now wrong: **the panels
> are gone** (D1 executed 2026-09-10, `74e969b` / `d45d732`), and **D1 was never
> a kill criterion in the end** — the owner authorised it outright on 2026-09-08
> on the author's own empty stores, so the three user-conditions it was
> pre-registered against are moot, and this deletion must never be written up as
> though users decided it (`NOTES.md` → Decisions).

**Design north star:** ease of use + Japanese **wabi-sabi** — simplicity, calm, restraint, natural/imperfect beauty, quiet space. One earthy accent, minimal chrome, an ensō brand mark. Every feature must earn its visual weight; default to removing. (See `NOTES.md` → "Design north star".)

> ~~Direction confirmed 2026-06-27: pursue **all four** next-step tracks over time
> (terminal polish, Monaco editor, API depth, deeper Claude).~~ **Superseded
> 2026-09-11.** Two of those four tracks no longer exist: API depth was deleted
> with the API client on 2026-09-10, and "deeper Claude" is now bounded by a
> refusal — see *What this roadmap now forbids*. Default shell stays PowerShell.

---

## Next — the path to five recorded sessions

**Everything below the closed-history divider is history.** This section is the
only live plan; read it first. Ordered by `product-director` on 2026-09-03,
re-ordered 2026-09-04 and 2026-09-08, **re-ruled 2026-09-11**, and **re-ruled
again 2026-09-15** — both rulings below, the later one first in force. Standing decision in the Decisions log: the ambition is **a product with
users**, and the next milestone is **five recorded first sessions from people who
are not the author**. Not a public launch and not revenue.

Evidence for the 2026-09-08 ordering:
`docs/superpowers/brainstorm/2026-09-08-product-direction.md`. Row-by-row audit
of it: `docs/superpowers/brainstorm/2026-09-08-roadmap-audit.md` — ten rows
checked, seven true, three stale, none false. The market facts that change it:
`docs/superpowers/brainstorm/2026-09-10-competitive-review.md`, **including the
verification section appended to it.** The three waves of work between:
`docs/superpowers/plans/2026-09-10-pre-beta-development.md`.

### Where this stands on 2026-09-11, and it is not where 2026-09-08 predicted

**The important sentence in this file: every engineering blocker has been gone
since 2026-09-07, and in the four days since, three waves of engineering shipped
while not one lying document was corrected and not one person was contacted.**

What landed, and it is real work: three proven security holes closed, including a
diagnostics record that carried the user's home path — the exact leak that gated
`field`'s own plan of having candidates paste diagnostics into a public issue;
**the Desktop-notifications toggle, which had never delivered a notification and
had never said so**, fixed by notifying from main over IPC; seven must-fix
defects fixed and verified across seven `qa` passes; an `npm audit` gate in CI; a
`SECURITY.md`; an architecture-boundary test; the accent budget returned to one
accent; and **D1 in full** — `DbPanel`, `ApiPanel` and `WorkPanel` deleted with
their handlers and stores, Tasks demoted out of the deck, the deck reduced to
**four keys** (Mission · Terminal · Browser · Editor), and production
dependencies **9 → 5**.

What did not land, and it is the whole milestone: `README.md` still says the
current release is **0.12.0**, still tells a stranger the repository "is still
private", and still offers them "terminal, editor, API client, and database
panels", two of which no longer exist; `site/index.html` says the repository is
private and contradicts its own hero about the SignPath filing; **step 7 — the
phone card on real hardware — is now seven days idle with nothing in front of
it**; the SignPath form is unfiled; and **nobody has been contacted.** `K6` fires
on **2026-09-22**. That is eleven days.

**I set a rule on 2026-09-08 and it failed. Naming it, because the register of
this project is to say what changed and why.** The rule was: *steps 10, 11 and 12
are the last code-and-document work I am willing to order before an invitation
goes out; a fourth is a delay and will be named as one.* Three waves appeared. I
uphold two of them — Wave 1 (the security holes and the dead notification toggle)
is work that would have made a stranger's first session **wrong**, and Wave 2 was
the owner's own authorisation, not an agent's proposal. I name **Wave 3** as the
delay: the accent budget and the `termExit` boundary test correct things no
stranger would ever have noticed, and they were ordered inside the fortnight in
which `K6` fires. The rule failed because it counted *pieces* instead of asking
what each piece was for. Sharpened below.

> **Overtaken 2026-09-15.** The paragraph above is now history in every clause
> except one. `0.14.0` is **published** (`be54c6d`, tagged and released
> 2026-09-14, four signed assets, `latest.yml` verified by hash against the
> published installer); the `v0.13.0` draft is deleted with its tag and
> changelog entry intact, exactly as ruled; `README.md` and `site/index.html`
> have been corrected; step 13 is closed. The clause that survives untouched is
> **step 7 — the phone card has still never rendered on real hardware**, now
> eleven days idle with nothing in front of it.

### Where this stands on 2026-09-15 — the blockers are gone, and so is the differentiator

**Two sentences matter in this file today.**

**First: step 9 has no blockers left.** Not one. 10 is all but closed, 11 is
closed, 13 is closed, and 6 and 7 were ruled non-blocking twice. The only thing
between this project and its milestone is a person sending one message. `K6`
fires on **2026-09-22 — seven days.**

**Second: the reason for sending it has changed, and it is a worse reason than
the one I wrote down four days ago.** On 2026-09-11 I ruled that this milestone
stops testing *the problem* and starts testing *the residue* — cross-vendor, the
user's own Windows shell, no account, no relay, a GUI rather than a multiplexer.
**That ruling is overtaken. The residue is free elsewhere, today, in one
product.** `github.com/vc1492a/Pane` is AGPL-3.0, free, **Electron**, native
**Windows**, agent-agnostic across Claude Code / Codex / Cursor Agent / Aider /
Goose, worktree-per-agent, with a **self-hosted** Remote Pane for desktop or
phone — every clause of the residue sentence at once, at zero cost. Maestro
(3.3k stars, Electron, cross-vendor, QR phone access), Nimbalyst (MIT, Windows
10+, an iOS companion whose stated purpose is *"see which agents need you"*) and
Munder Difflin (**the same node-pty + xterm.js stack this app is built on**) sit
in the same space. Herdr raised **$6M on 2026-09-08** and 0.9 puts local and SSH
machines in one sidebar. Evidence and URLs:
`docs/superpowers/brainstorm/2026-09-15-trend-scan.md`, which I take as given.

**I got the shape of the error right and the timing wrong.** On 2026-09-11 I
wrote that the residue was "narrower than the claim this milestone was written
under, and nobody has ever tested it". What I did not price is that a
differentiator can expire *faster than the beta that was going to test it*. The
residue clauses did not lose an argument; they were shipped by someone else
between two of my own rulings. Every future dated claim in this file inherits
that: **a differentiator with a four-day half-life is not a differentiator, it
is a description.**

What survives is narrower and is stated with its own caveat, which `marketing`
has already published unlaundered in `PRODUCT.md`: **the signal names its source
and refuses what it cannot source** — hooked versus inferred, a tile that says
which one fired, and a hook matching no session attributing nothing rather than
picking between two candidates. Nobody else does this. *And it survives because
nobody competes on it, which may also mean nobody buys on it.* That sentence is
not a hedge; it is the thing the beta now exists to decide.

### The two tests every item passes

1. **Does this get a stranger closer to running DevDeck and saying something
   back?** Kept, unchanged since 2026-09-03. It is still the test that killed a
   creativity brainstorm on 2026-09-07 and that ranks a document edit above every
   item in `IDEAS.md`.
2. **Would a stranger's first session be *wrong* without this?** This replaces
   2026-09-08's *"is this a human act or a code change?"*, which was too blunt to
   apply: it would have refused the notification fix and the home-path
   redaction, both of which belonged, and it did not in fact refuse the accent
   budget, which did not. The sharpened form separates them cleanly — a session
   on the old build would have shown a toggle that lied and leaked a real user's
   name into a public paste; no session would have been wrong because one
   Terminal frame spent the accent on fourteen things.

Anything that passes neither is **not yet**, however good it is. There is no
third test; three tests is a framework, and this seat does not write those.

| # | Step | Owner | Unblocks | State |
|---|---|---|---|---|
| 1 | `LICENSE` (MIT) + a provenance audit of every vendored file | `release-eng` / `technical-director` | The SignPath application, which cannot be filed without it | **closed** 2026-09-02. Confirmed live: `gh api …/license` → MIT |
| 2 | Scrub the tracked tree and its history of employer and client identifiers | `docs-writer` / `technical-director` | The public flip. The irreversible step | **closed 2026-09-11 — one commit later than this row claimed twice.** Both halves shipped 2026-09-05: an `--env-filter` pass remapped 654 of 741 commits whose author/committer fields still carried the employer domain, and an `--index-filter` pass replaced the literals in every version of `docs/release/step-4-public-flip.md`. Then `po`'s audit found the class had **recurred**: commit `5aa3443` — the very commit recording step 4 as done — typed the real employer domain into this file's own prose as an example, on the day of the flip, and it sat on the public remote for a day. Fixed, and this time the fix is a **test**: `tests/publishedIdentifiers.test.ts` (`1ebb38c`) guards tracked *content*, not just commit metadata, against identifier tokens and non-allowlisted email domains. Two things remain and neither is an identifier: `git config --global user.email` is still the employer address, so a fresh clone without the repo-local override reintroduces it; and the pre-scrub objects survive in the private archive repo, which `scripts/check-repo-visibility.mjs` exists to watch — **never flip that repo public** |
| 3 | Rewrite the competitor kill-lists in a register that survives publication | `docs-writer` / `product-director` | The public flip | **closed** 2026-09-02 |
| **I** | **Interrupt — the UI/UX overhaul.** `product-director` ruled *against* an overhaul and prescribed deletions plus a small number of proven fixes; that is what shipped. Six surfaces deleted, 84 skins → 6, every deck key labelled, the folder-moved crash fixed at three levels, 10 modals behind boundaries, the worktree default off | `pm` → `frontend-dev` / `backend-dev` → `qa` / `design-reviewer` | Roughly every later UI change, and `PRODUCT.md`'s validation rewrite | **closed** 2026-09-04, shipped in the `v0.13.0` tag. Independently re-derived by `po` 2026-09-08: six surfaces absent from the tree, 3 themes × 2 styles = 6, all eight named commits real |
| 4 | **The public flip** — clean history pushed, repo public, filed with SignPath | `release-eng` | Everything left. The certificate; the release feed; the updater; step 5's deploy; step 6 | **closed 2026-09-11**, by a route the runbook did not anticipate: `delete_repo` never reached the token, so the old repo was **renamed** to a private archive and a fresh repo created under the **same owner and name**, keeping `build.publish`'s update-feed URL byte-identical — the one constraint that could silently stop every installed copy updating. Verified 2026-09-11: **PUBLIC, MIT, issues enabled, 0 stars / 0 forks / 0 issues.** On 2026-09-08 this row was marked done on the strength of *metadata* while the tree it had just published was leaking; it is done now because row 2 is. **Remaining: the SignPath filing**, a web form, which gates nothing on this list |
| 5 | A one-page homepage carrying SignPath's required attribution and the code-signing policy | `marketing` / `docs-writer` | The SignPath application, which requires a published policy | **survives, and it is now two clicks and one paragraph.** Updated 2026-09-15: the **mechanism exists** — `.github/workflows/pages.yml` publishes `site/` and only `site/` (`b7a73f3`), with `tests/pagesDeployScope.test.ts` failing if that artifact path ever widens, which is the guard that matters because everything else in this tree is internal. The hero is corrected: it is provenance-first and it names Herdr and Pane by name. Two things stand. **(a)** Pages is still **not configured** (`gh api …/pages` → 404 on 2026-09-15) — an owner action, two clicks, gating nothing on this list. **(b)** `site/index.html:250-251` still tells a reader the SignPath filing is impossible "because the Foundation requires a public repository and this project's repository is still private." **The repository has been public since 2026-09-07.** That is the *last surviving instance* of the falsehood class step 10 exists to kill, and it sits in the one section the page exists to carry. Fix (b) before (a) |
| 6 | Move the release build to CI and wire SignPath into it | `release-eng` | An installer a stranger can run without meeting SmartScreen; ends the Avast dependency in the release path | **CI half closed and proven** 2026-09-07 — `release.yml` ran on the `v0.13.0` tag and produced a draft with Setup, Portable, blockmap and `latest.yml`, which `electron-updater` reads and without which auto-update breaks. The SignPath stage is present and inert, gated on a secret that does not exist. Strengthened 2026-09-10 by an `npm audit` gate in `check.yml`, as a separate job so a red audit cannot hide a red build. **The signing half survives and is a third party's approval queue. Reclassified 2026-09-08 and re-affirmed: not a gate on step 9** |
| 7 | Verify the approve/deny card on a **physical phone** — and in the same sitting the five things CDP cannot observe (the native folder dialog; `addProjectByPath` on a bad path; `F1`/`Ctrl+K` via real keys; the "none found on your PATH" state; the crash card), plus a look at the phone client's own palette | `qa` (a human at the keyboard) | Step 9's first impression | **not started. Eleven days idle, blocked on nothing, and it is the oldest untouched row in this file.** It **has still never rendered on real hardware**, and no sentence anywhere may present it as proven until it has. Updated 2026-09-15: its *strategic* weight has fallen, and this must be said rather than quietly enjoyed — the 09-10 review named the phone card as one of three things surviving comparison with Herdr, but Pane ships a self-hosted Remote Pane, Maestro ships QR-code phone access and Nimbalyst ships an iOS companion, all free. The card is no longer a differentiator; it is **an unverified feature in the shipped build**, which is a worse thing to carry into a stranger's first session than an unverified differentiator. Protocol: `docs/qa/phone-approval-verification.md` |
| 8 | First contact: the empty states, the agent-presence surfaces, and the failure a stranger can hand back | `designer` → `frontend-dev`/`backend-dev` → `qa` | Step 9 | **closed** — both halves ruled *met, with conditions* 2026-09-03, shipped in 0.12.0; the outstanding condition (`PRODUCT.md`'s validation rewrite) closed 2026-09-04 (`5feb82d`) |
| 9 | Recruit five, one at a time. Every install watched, every first session recorded verbatim. **Watch specifically for the shell-mismatch false negative** (a Git Bash user told `not on PATH` about a working agent), and for the usage-ledger data-loss bug if anyone opens the Usage view | `field` | The evidence this whole milestone exists to get | **not started. Nobody has been contacted.** Materials drafted 2026-09-04 (`docs/beta/`); destination `NOTES.md` → "Beta — external users (step 9)", deliberately empty. **Blockers as of 2026-09-15: none.** 11 is closed, 13 is closed, 10 is down to three documents no candidate reads before installing. This row's blocker list was stale on 2026-09-08 ("repo private, newest release v0.10.0"), stale again on 2026-09-11 ("publish 0.13.0 signed", which step 11 reversed), and correct on 2026-09-11 ("10, 11 and 13"). It is now **empty**, and an empty blocker list is the only state in which `K6` can mean what it says |
| **10** | **The documents that still lie to a stranger** — `README.md` (release is 0.12.0; the Releases-page instruction, true only after 11; "terminal, editor, API client, and database panels", two of which are deleted; SignPath "cannot be applied for … this one is still private"); `site/index.html:158` against `:246`; `docs/beta/02-recruiting-message.md:10` ("the repo is private, so the user cannot open an issue"); `.superpowers/HANDOFF.md` §1–2, still "0.11.1 is cut"; `IDEAS.md`'s moat list | `docs-writer` / `marketing` | Steps 5, 9 and 11 | **largely closed 2026-09-11 → 2026-09-15.** `README.md` corrected 09-11 (`2f7aaa1`); `02-recruiting-message.md`'s private-repo line and `site/index.html`'s self-contradiction and stale version corrected 09-15. **Precisely what remains, and it is not the whole row: (a)** `site/index.html:250-251` — "this project's repository is still private", carried in row 5; **(b)** `.superpowers/HANDOFF.md` §1–2, still *"0.11.1 is cut"* and still telling the next session the latest release is 0.10.0 — read by every agent and no stranger, so it is cheap and it is last; **(c)** `IDEAS.md` — untouched, and worse than recorded: its moat list still claims the **Jira/Azure Work panel** as shipped (D1 deleted it), its API- and DB-era entries describe a product that no longer exists, and line 7 still says *"DevDeck's moat is being a **personal** tool"*, which contradicts the standing decision of 2026-09-02. **(d) New, and it is the recurrence:** `02-recruiting-message.md:10-12` now says *"there is no published release yet — the build still ships hand-delivered as a file, not a download link"*, which `0.14.0` made false the day after it was written, and which its own DM line ("there's a signed installer now") already contradicts. The class recurs because these documents encode release state in prose. Someone must decide whether hand-delivery is still the channel — it may well be, deliberately — and then say so once, rather than describing the release feed |
| **11** | **Cut, sign and publish `0.14.0` from current `main`** — and **delete** the draft `v0.13.0` release | `release-eng` + `marketing` | Step 9's delivery path; the README's download link stops being a dead end; the updater gets a real feed | **closed 2026-09-14.** `be54c6d` cut it; `v0.14.0` is published with four assets, signed, and `latest.yml`'s sha512 verified against the published installer rather than against the local build — the one check that decides whether auto-update survives first contact. The `v0.13.0` draft is deleted; its **tag and changelog entry survive**, as ruled. A stranger following `README.md` to Releases now gets a download instead of an empty page, which had been true of this project for its entire existence |
| **12** | **Lead with the cockpit, demote the suite** — the published claim must match the repo's own description and survive D1 | `marketing` / `product-director` | Step 10 being coherent; the recruiting message being true | **ordered 2026-09-08, and now down to one bullet.** `README.md:3`, this file's line 3, GitHub's repo description and — as of 2026-09-15 — `site/index.html`'s hero are cockpit-first, the hero having gone further than ordered by naming Herdr and Pane in the claim itself. **Outstanding: `PRODUCT.md:14`**, which still promises "terminals, editor, **API client, database client, task board**" snapping to a project, and `:62`, which repeats it. This is the more embarrassing survivor of the two, because the paragraph directly above it (`:9`) was rewritten today to be scrupulously honest about the competition while the paragraph below it still sells three deleted panels |
| **13** | **Two sentences in two beta documents, and one adoption** — the fourth **asked, not gating** fact in `docs/beta/01-who-to-approach.md` (which agent CLIs a candidate runs, and whether they already use `claude agents`, Claude Code Desktop, `/remote-control`, the Codex app, Herdr, Orca or Warp for the same job); the **S4 weak-pass amendment** in `docs/beta/05-validation-criteria.md`; and **`K6` adopted into that file** under its own dated amendment rule | `field` / `po` | Step 9 asking the one question whose answer cannot be recovered once a session is spent | **closed 2026-09-15**, and wider than ordered. The fourth asked fact is in `01-who-to-approach.md` as question 7 with its never-gating rule stated twice, and its tool list was **widened on the day** to include Pane, Maestro, Nimbalyst and Munder Difflin — the four that matter most, because they are DevDeck's own shape. The S4 weak-pass amendment is in `05-validation-criteria.md:50`; `K6` is in at `:154`, so it is now a criterion and not prose. `03-install-watch-protocol.md` gained the **disagreement instrument** (`:70-93`): every time the row and the pane disagree, which source claimed it, and `0 disagreements` written down rather than left blank. That last one was not in my 09-11 order and is the most valuable thing in the row — see *What the five sessions now test* |

### The order, in wall-clock terms

Re-ordered **2026-09-15**. `pm` sequences and assigns; it does not re-open the
ordering. Items marked 🔒 need a person and no agent can move them. The 09-11
order is superseded: items 1–4 of it are done except one bullet each, and the
list is now short enough that its length is the point.

1. 🔒 **Step 9 — invite candidate one. Today or tomorrow.** `field` has the
   draft; a human sends it. **Preconditions: none.** This is first now, not
   seventh, and that is the whole substance of this re-ordering. It was seventh
   on 09-11 because three documents stood in front of it; they no longer do.
2. **Step 10's three survivors and step 12's one bullet** — `site/index.html`'s
   private-repo paragraph, `PRODUCT.md:14`/`:62`, `IDEAS.md`'s moat list and
   philosophy line, `.superpowers/HANDOFF.md` §1–2, and a decision about
   `02-recruiting-message.md`'s delivery-channel sentence. `docs-writer` +
   `marketing`, one sitting, one `po` pass. **In parallel with 1, not in front
   of it** — none of these is read by a candidate before they install, and the
   one that is (the recruiting message) is contradicted only in a direction that
   *understates* what exists.
3. 🔒 **Step 7 — the human sitting.** The phone card on real hardware, the five
   CDP-blind observations, the phone client's palette. `qa`, a human with a
   phone, against the published 0.14.0 build. **In parallel.** Eleven days idle.
   If it is still untouched when the first session is recorded, the honest
   conclusion is that this product ships a feature nobody — including its
   author — has ever seen work, and `field` must say so in the record.
4. 🔒 **File with the SignPath Foundation**, and **enable Pages** once item 2's
   `site/` fix has merged. The owner; two web forms and two clicks between them.
   **In parallel, gating nothing.** *Unblocks users 6–10.*
5. 🔒 Repeat to five recorded sessions, then write the milestone verdict against
   S1–S4 / R1–R3 / E1–E5 and record which predictions fired. `field` → `po`.
   **Deadline 2026-10-06. `K6` fires if item 1 has not happened by 2026-09-22.**
6. **One scoring amendment, `po`, any time before the verdict and not before
   candidate one:** S4's full pass for *"a sentence naming more than one
   vendor"* was written when cross-vendor was DevDeck's. Pane gives a stranger
   cross-vendor free, so that sentence is now a **weak pass** too unless it
   names something Pane does not do. This tightens a bar against the product's
   own interest, which is the only direction a bar may move once evidence
   exists — and it must be dated under the criteria file's amendment rule, not
   slipped in.
7. Then, and only then: the usage-ledger data-loss bug, then Q1.

**Left off this list on purpose:** every feature; any further UI, motion, colour
or boundary work; a fifth wave of pre-beta engineering under any name; the
homepage's redesign as opposed to its correction; macOS, Linux, `remote.enabled`
on by default; a seventh skin (refused in advance three times); a sixth
competitor study (permanently); and everything in *What this roadmap now
forbids*.

### Re-ruling the milestone (2026-09-15): what the five sessions now test

**The count stands. The deadline stands. The 09-11 ruling below — that these
sessions test *the residue* — is overtaken, and I am saying so rather than
editing it out.** The residue was four feature clauses and they are Pane's,
free, on Windows, today. A beta cannot test a differentiator that a stranger can
have for nothing; at best it would measure politeness.

**What five sessions now test, in order of what only they can decide:**

1. **Whether the honesty layer is *right*** — not whether anyone likes it. The
   disagreement instrument `field` landed today (`03-install-watch-protocol.md`)
   counts every time the deck's row and the pane disagree, and which source
   claimed it. This is the one measurement in the whole milestone that **does
   not depend on the user noticing anything**, which is exactly why it is first.
   If hooked claims and screen-inferred claims disagree at the same rate, the
   provenance split is decoration and the last surviving claim is dead — killed
   by five sessions rather than by a competitor.
2. **Whether anyone will pay attention to provenance at all.** Unprompted, in
   their own words, without the watcher pointing at the tile. I expect this to
   fail. A first session is thirty minutes and provenance is a property of being
   *wrong* less often, which is invisible until something is wrong. If nobody
   mentions it across five sessions, that is not noise — it is the answer to
   *"nobody competes on it, which may also mean nobody buys on it."*
3. **Whether anyone installs a second cockpit at all.** Question 7 now asks what
   they already run, including Pane, Maestro, Nimbalyst and Munder Difflin. A
   candidate who runs one of those and installs this anyway, and says why, is
   worth the other four put together.

**So the milestone stops being a validation and becomes a decision procedure.**
It decides between *"a product with users"* (2026-09-02) and *"a personal
instrument"* (`K6`'s alternative), on evidence, before 2026-10-06. Both are
legitimate exits. What is not legitimate is reaching the second one by running
out of days, which is the only outcome this project has actually been trending
toward.

**Should the milestone itself change? I priced three changes and refused all
three.**

- **Abandon the beta now, on the grounds that the differentiator expired.**
  *Refused.* It would save roughly a week of a person's evenings and it would
  spend the one thing that cannot be recovered: the answer to whether provenance
  is a product or a preference. The author cannot produce that answer on the one
  machine that has ever run this app, and `product-reviewer`, `marketing` and I
  have now all argued it from the same artifacts without moving it an inch.
- **Cut five to three, because a thinner claim means fewer acceptances.**
  *Refused, and refused for the second time.* S1's ≥4/5 and R1's ≥3/5 stop
  meaning anything below five, and lowering a bar in the week its kill criterion
  fires is the exact move the criteria file's amendment rule exists to catch.
- **Extend past 2026-10-06 because the ground moved again.** *Refused.* The
  ground moving twice in four days is an argument for evidence sooner. Note the
  asymmetry honestly: every previous refusal to extend assumed the blockers were
  real work. There are none left. An extension now would be buying time to do
  nothing.

**What committing costs, since a recommendation that costs nothing is not one.**
Sending the invitation this week means the first five sessions run against a
build whose phone card has never rendered on hardware, whose `IDEAS.md` still
sells a deleted panel, and whose only remaining claim is one the market has
declined to compete for. Those sessions are unrepeatable and they will probably
produce a negative verdict. **Spend them anyway.** The alternative on offer is
not better sessions later; it is `K6` firing on 2026-09-22 with nothing learned,
and DevDeck becoming a personal instrument by default rather than by choice —
which is the same destination reached in the one way that teaches nothing.

### Ruling on the milestone (2026-09-11): it stands, the deadline stands, its meaning changes

**Five recorded first sessions from five people who are not the author, each on
their own machine, each carrying at least one verbatim dated quote in
`NOTES.md`, by 2026-10-06.** Unchanged. The countable unit is a **recorded
session** as `docs/beta/05-validation-criteria.md` defines it, and that file's
bars stay at their stated thresholds. Five sessions with R1–R3 all failing is a
**completed** milestone with a **negative** result, and that remains a legitimate
outcome.

**What changed is what five sessions can tell you.** The milestone was set when
this repository believed the question *"which of my agents is waiting on me"* was
answered nowhere else. Verified 2026-09-10, it is answered in at least five other
places: **Herdr** — 37.2k stars, Apache-2.0, one Rust binary, native Windows
including "endpoint-protected Windows", every pane badged working/blocked/idle,
its own README saying *"when an agent stops and needs an answer, herdr says
so"*, and positioned explicitly as **"no electron"**, an argument aimed precisely
at this product's form factor; **`microsoft/intelligent-terminal`**, a Windows
Terminal fork with an agent status bar over ACP, shipped at Build 2026; **Claude
Code's own `claude agents`**, which sorts needs-input to the top with each
session's last response; Claude Code Desktop's session sidebar and notifications;
and the Codex app on Windows.

~~So this milestone stops being a test of **the problem** and becomes a test of
**the residue**: cross-vendor, in the user's own Windows shell, no account, no
relay, no daemon, a GUI rather than a TUI, a phone approve/deny card bound to the
exact screen that produced the question, and a *project* — not a repo, not a
worktree — as the unit of context.~~ **Overtaken 2026-09-15 — four of those
clauses are Pane's, free, and the phone half is Pane's, Maestro's and
Nimbalyst's. See the re-ruling above. Left in place because it is the clearest
record of how fast a differentiator can expire: four days.** That residue is narrower than the claim this
milestone was written under, and nobody has ever tested it. Note what makes it
narrower still: D1 deleted most of the panels that made "one window" mean
anything, and the phone card has never rendered on hardware.

**Which is why step 13 is a precondition and not a nicety.** Without the fourth
asked fact, five recorded sessions cannot distinguish *"the residue is wanted"*
from *"these five happened to have no alternative"* — and S4 as written scores a
sentence the vendor already sells for free. `field`'s proposal is adopted in
full: record which CLIs each candidate runs and which first-party tools they
already use for this job, verbatim, **as a question and never as a
disqualifier**; and amend S4 so a pass sentence naming **more than one vendor**,
or naming their **own terminals**, is a full pass, while *"a terminal with tabs
that shows Claude waiting"* is recorded as a **weak pass**, because `claude
agents` already gives a Claude-only user that sentence with no install.

**The deadline does not move in either direction, and here is what I rejected.**
Extending it because the ground moved: refused — the ground moving is an argument
for evidence sooner, not later, and every remaining blocker is under two days of
work. Lowering the count to three because a thinner differentiator means fewer
people will accept an install: refused — that lowers the bar exactly when the
evidence needs to be stronger, and S1's ≥4/5 and R1's ≥3/5 stop meaning anything
below five. Raising it because the competition demands more proof: refused — the
binding constraint is invitations sent, which is zero, not sample size.
Abandoning the beta because five competitors got there first: **refused, and this
is the one worth stating.** The competition makes the beta *more* necessary, not
less. The residue is a hypothesis, the author cannot test it on the one machine
that has ever run this app, and `K6`'s alternative — keep DevDeck as a personal
instrument — is a respectable outcome that should be chosen on evidence rather
than reached by running out of days.

**Costing this, as I am required to.** Committing: the fourth asked fact will
probably produce answers that weaken the product's case, in the candidates' own
words, recorded permanently, before anything has been sold to anyone.
Abandoning it: you save two document edits and you spend five irreplaceable first
sessions on a question the market has already answered — much the more expensive
mistake.

### What this roadmap now forbids that it did not on 2026-09-08

The 2026-09-08 forbidden list (`…2026-09-08-product-direction.md` §5) stands in
full and is not re-argued here — teams, a hosted service, a relay or a daemon,
telemetry of any kind, macOS and Linux, a native mobile app, "all-in-one" as a
published claim, a guided tour, a seventh skin, a sixth competitor study. Six
things are **new**, and they are new because the product is now smaller and the
differentiator thinner than when I last ruled.

- **Answering "which agent needs me" a second time, in any form.** *Not real.*
  No second list, panel, badge, tray window, pop-out or view that re-answers the
  question the deck's one row already answers. Eleven surfaces once answered it
  here and the whole recovery was deleting ten of them; the market now holds at
  least eleven answers across five vendors. DevDeck's claim is that it has
  **one**. *Belongs to:* `claude agents`, Claude Code Desktop, Intelligent
  Terminal's agent panel, Orca's dashboard — every one of which ships theirs off
  by default or behind a flag, having learned the same lesson elsewhere.
- **Re-adding a panel or a deck key to make "one window" mean something again.**
  *Not us.* D1 removed three panels, four database drivers, five MCP tools and
  **830 ms of every cold start**. The first proposal to add a fifth key back —
  under any name, for any stack, however well argued — is spending the only
  thing D1 bought, exactly as a seventh skin would spend the skin cut.
  **Refused in advance.** *Belongs to:* whatever tool already owns that job,
  which is the argument that deleted each of them.
- **Competing with Herdr on Herdr's axis.** *Not us, and losing is certain.*
  Speed, binary size, "no Electron", agent-preset breadth, a TUI mode,
  multi-machine session lists, sessions that survive closing the window. Herdr
  has a Rust binary, 37.2k stars and roughly a hundred times this project's
  throughput; DevDeck loses that race the day it enters it. *Belongs to:* Herdr.
  Copy nothing from it except the lesson already encoded at
  `styles.css:1165-1172` — that *done* must not become a status — which this
  repo reached independently.
- **Adopting a structured protocol as the session transport.** *Not us.* Running
  agents over ACP instead of in a pty buys exact permission prompts at the price
  of replacing the real Windows shell the identity is built on with a JSON-RPC
  subprocess whose UI DevDeck would then have to draw. That is a chat client.
  *Belongs to:* Zed, JetBrains, Microsoft. Copy the **stance** — structured over
  scraped — via Q1's hooks; never the transport. "An ACP client mode as an
  addition" is the same kill plus a second session model beside the pty one: two
  truths about one agent.
- **Publishing any differentiator sentence that does not name the alternative.**
  *New rule, and it is the register `PRODUCT.md` now sets.* Any README, homepage,
  release note or recruiting message asserting that DevDeck tells you which
  agent needs you, without saying in the same breath that `claude agents`,
  Claude Code Desktop and Herdr also do, is a false premise re-published — and
  `PRODUCT.md` was corrected on 2026-09-10 precisely because that sentence had
  gone untrue. This generalises the correction instead of applying it once and
  waiting for the next drift. It binds the phone card twice over: **the card has
  never rendered on real hardware**, so no published sentence may present it as
  proven until step 7 has happened.
- **Recruiting a candidate without recording what they already use.** *Not a
  forbid on the product; a forbid on the evidence.* A session record with no
  answer to the fourth fact cannot be scored against S4's amended bars, and
  spending one of five on an unscoreable record is unrecoverable.

**Four more, added 2026-09-15 because the category moved and the pressure is
new.** Everything above stands unchanged; nothing comes off the list.

- **Agents that supervise agents.** *Not us.* A coordinator pane, a dispatcher
  that plans and delegates, an orchestrator role, an agent that answers "what
  are the other panes doing" on the human's behalf. This is where the category
  went in the last five days — Cursor Projects (09-10), Munder Difflin's GOD
  agent, Codex scheduling its own future work — and it is the one vector that
  would quietly redefine the user. DevDeck is for the human who is the
  bottleneck at 2–3 agents; a coordinator is for the human who has given up
  being it. *Belongs to:* Cursor, Warp, Munder Difflin. The `devdeck_sessions`
  park trigger stands and has not fired; V1 makes it likelier, not true.
- **Publishing an expired clause as a differentiator, even with the alternative
  named.** *A tightening of the 09-08 rule, which is no longer sufficient.*
  Cross-vendor, the user's own Windows shell, no account or relay, and "a GUI
  not a multiplexer" are now descriptions, not claims, and attribution does not
  rescue them — "unlike Pane, we are also cross-vendor" is a false sentence with
  a citation attached. They may be *stated as facts about the build*; they may
  not be the reason anyone is asked to install it. The only claim that may carry
  that weight today is provenance, and it carries its own caveat with it.
- **Presenting provenance as validated before a recorded session has counted
  disagreements.** *The phone-card rule, generalised to the claim that replaced
  it.* Nobody competing on something is not evidence that it works; it is
  evidence that it is unpriced. Until `03-install-watch-protocol.md`'s tally
  exists in at least one record, every published provenance sentence is a
  description of a mechanism, never a demonstrated advantage.
- **Re-opening any settled default on the grounds that the market settled it the
  other way.** *Not a product forbid; a forbid on the argument.* Worktree-per-
  task is now the default everywhere and DevDeck is an explicit minority; the
  seventh skin, the fifth deck key and the second attention surface will all
  return wearing the same clothes. "Everyone else does it" is not evidence about
  this product's users, of whom there are still zero. **Only a recorded session
  re-opens a default.** `W5` is the correct instrument: two of five asking
  unprompted why dispatch does not make a worktree re-opens the 0.13.0 default;
  one does not.

And a kill I adopt from the 09-15 scan rather than re-deriving: **free-text
"steer" on the phone card** (agentproto's feedback field, 09-06). *Not us.* The
card's entire safety argument is that the route writes one keypress bound to a
`tailHash`, or nothing. Free prose from a phone into a live shell, on a surface
that has never rendered on real hardware, is the most expensive possible place
to be wrong. Typing already exists — in the pane, at the desk.

### The reviewer's queue — ruled, 2026-09-15

The 09-15 scan's best candidate: order "who needs me" by **how much reading it
will cost**, and remember what was already judged. It is the one direction with
a measured bottleneck behind it, nobody holds it, and DevDeck already carries the
seed — the `seen` axis (`tileState.ts:275-290`) and the three-state
`changedCount`.

**Verdict: not built, not queued, not now — and it is nearer *not real* than the
scan allows.** Three reasons, and the third is the one that decides it.

1. The demand is inferred from an industry statistic about review time, not from
   anyone who has used this product. Nobody has used this product.
2. The product's own workflow evidence says review happens somewhere else — the
   target user "alt-tabs to a real IDE to read code"
   (`2026-09-08-developer-workflow.md`). A queue that orders reading in a window
   where reading does not happen is a better-argued version of the panels D1
   deleted, which were also each defensible alone.
3. **It would be the sixth wave.** Three waves shipped before 0.14.0, a fifth
   landed after it, and a sixth is in `src/` as I write. This seat's job is not
   to find the one feature good enough to justify another one.

**It stays exactly what it is: `W3`, a watch, with a threshold rather than a
feeling.** Two of five, unprompted, either opening Changes or asking which one to
read first. Below two, it is dead and I will say so in the verdict. If it does
fire, it returns as a **re-ordering of the one existing row and its existing
`seen` state** — never a queue, never a panel, never a fifth key. A reviewer's
queue drawn as its own surface is the second answer to "which agent needs me"
that this file forbids, wearing the best disguise it has yet been offered.

And one refusal carried forward with its wording repaired: **a fifth wave of
pre-beta engineering, whatever it is and however good.** The 2026-09-08 version
failed because it counted pieces. The repaired version is test 2 above — if a
stranger's first session would not be *wrong* without it, it waits until after
the fifth recorded session. The 0.14.0 cut is not a wave; it is the act of
handing over what already exists.

> **And it happened anyway. Naming it, 2026-09-15.** After `0.14.0` was
> published on 09-14, a nav design pass, the nav merge (`60c0ac0`) and two fixes
> (`e6efff7`, `58ff133`) landed, with a `qa` pass over them (`a19858d`). That is
> the fifth wave, refused in advance on 2026-09-11, and `product-reviewer`
> named it independently today. None of it would have made a stranger's session
> *wrong*; a resting mouse fighting the arrow keys in the palette is a real
> defect and it is not one of the five. A sixth is in `src/` as this is written.
> **The rule has now failed twice — once by counting pieces, once by being
> ignored — and I am not going to repair it a third time.** A rule that only
> agents read cannot stop work that agents are asked to do. The only instrument
> left that can is `K6`, which fires on a person, and that is precisely why it
> is the most likely of the six to fire.

### K6 — pre-registered, and not yet adopted where it belongs

**`K6` — the owner does not send the first invitation.** If **no candidate has
been contacted by 2026-09-22**, with every engineering blocker gone since
2026-09-07 and steps 10, 11 and 13 costing under two days between them, the
finding is that the standing decision of 2026-09-02 — *"a product with users"* —
is not held by the person who must act on it. **Then:** revert `PRODUCT.md` to
"for me, first", close the distribution programme (no SignPath follow-up, no
Pages, no recruiting), un-publish nothing, and keep DevDeck as a personal
instrument — which is a respectable thing and a cheaper thing.

It is the only kill criterion that fires on the author rather than on the users,
and on the evidence of the last seven days it is **the most likely of the six to
fire.** Written down now rather than discovered in December.

~~**It is not yet a criterion.**~~ **It is one, as of 2026-09-15.** Step 13
closed it: `K6` is in `docs/beta/05-validation-criteria.md:154`, under the
file's dated amendment rule, alongside K1–K5. It is now policy rather than
prose, it fires in **seven days**, and the blocker list it was written against
is empty. **Nothing on this roadmap can prevent it firing and no agent can
discharge it** — it is discharged by one person sending one message. **D1 needs no such adoption:** it was pre-registered as a
conditional kill and then authorised outright by the owner on 2026-09-08 on the
author's own empty stores, so its three user-conditions are moot — recorded in
`NOTES.md` → Decisions, together with the instruction that this deletion must
never be written up as though users decided it.

### What would prove this ordering wrong

1. **Three of the first five ask, unprompted, where the Database, API or Network
   view went.** Then the agent-edge and empty-table tests that killed nine
   surfaces are too narrow, the subtraction thesis is wrong, and D1 was a
   mistake made on one machine's habits. Note that authorising D1 outright
   removed the test that would have caught this *before* the deletion; this is
   now the only place it can surface.
2. **A candidate already runs Pane, Herdr, Maestro, Nimbalyst, `claude agents`
   or Intelligent Terminal and installs DevDeck anyway, and says in their own
   words why.** Widened 2026-09-15; the original named only the first tier, and
   the free Windows GUIs are the informative ones now. Only question 7 can
   produce that sentence, and its answer decides whether anything survives.
3. **Four of five are Claude-only and name `claude agents` or Claude Code
   Desktop.** Then the cross-vendor residue is not the product either, and the
   milestone's honest verdict is negative however well the sessions go.
4. **S1 passes 5 of 5 through SmartScreen.** Then the certificate was never the
   gate, prediction 3 fails, and holding the sequence open for the filing would
   have cost the whole milestone.
5. **K4 fires at candidate one.** Then upholding `field`'s dissent cost a
   candidate the certificate would have saved, and the 2026-09-04 ordering was
   right. L4 caps that at one.

Three added **2026-09-15**, against the re-ruling rather than the ordering:

6. **The disagreement tally comes back non-zero and lopsided — screen-inferred
   claims wrong, hooked claims right.** Then provenance is not a stance, it is a
   measurable accuracy advantage, this is the product, and the sentence
   `marketing` published today was too modest. This is the single observation
   that would most change what DevDeck is, and it costs nothing to collect.
7. **The tally comes back zero across five sessions on the screen classifier
   alone.** Then the honest reading is that inference was good enough all along,
   the hook route is engineering nobody needed, and the last surviving claim is
   a solution to a problem this product does not have. I would rather find that
   out from five strangers than defend it for another quarter.
8. **Two of five ask, unprompted, which agent they should read first.** Then the
   reviewer's queue is real, my verdict above is wrong, and `W3` becomes the
   first feature after the beta — as a re-ordering of the existing row.

### The 0.14.0 ruling (2026-09-11) — **executed 2026-09-14, kept for its reasoning**

**Cut `0.14.0` from current `main`, sign it locally, publish it, and delete the
draft `v0.13.0` release.** This reverses step 11 as I ordered it on 2026-09-08,
which said to publish that draft with `release/`'s locally signed 0.13.0 assets.

The facts it is ruled on:

- **Neither existing artefact is this product.** The draft's four assets are the
  **unsigned** CI set built at the `v0.13.0` tag; `release/`'s
  `DevDeck-Setup-0.13.0.exe` is the **self-signed** local build of the same tag,
  dated 2026-09-07. HEAD is **22 commits** past that tag — 600 files, D1's two
  breaking commits among them, plus three security fixes and the notification
  fix. Publishing either would hand a stranger a seven-key app with a toggle
  that lies and a diagnostics record carrying their own name, and then tell them
  in a release note that those had been fixed.
- **The version cannot be 0.13.0.** `package.json` still says 0.13.0 and the tag
  is taken. Two commits are marked `feat!`, and they remove three views, four
  production dependencies and five MCP tools. Pre-1.0, that is **0.14.0**.
- **Sign locally; do not publish the CI set.** Established at step 6 and
  unchanged: an unsigned binary draws more antivirus noise than a self-signed
  one, and the SignPath stage stays inert until the filing lands and the secret
  exists. Run `node scripts/update-manifest.mjs --check` before attaching
  anything, because `latest.yml`'s sha512 must match what is actually there or
  auto-update breaks on first contact.
- **Delete the draft rather than publish it.** A draft is invisible to an
  anonymous visitor, so deleting it costs a stranger nothing; publishing it
  would make an unsigned build of a deleted product the thing `electron-updater`
  polls. The `v0.13.0` **tag** and its `CHANGELOG.md` entry stay — they are
  accurate history of what shipped on 2026-09-07.
- **The update path is unaffected**, and this is checked rather than assumed:
  nobody is installed anywhere, so there is no differential-download loss and no
  live feed to break. `build.publish` still names the same owner and repo, so
  the feed URL is byte-identical — and that must stay true. **If the owner or
  the repo name ever changes, every installed DevDeck silently stops updating.**
- **0.14.0's notes must carry D1 and the three waves**, in the rolled-up register
  0.13.0 and 0.10.0 used, and must open by stating what the build is: private
  beta, one maintainer, Windows-only, self-signed. Prior art:
  `docs/release/0.13.0-notes.md` and `published-release-notes.md`.

### Behind those, in order

1. **The usage-ledger data-loss bug** — it rewrites every session the user did
   not hand-close to 0 ms, on the one surface that shows money. Still *not yet*:
   it corrupts a ledger nobody but the author reads and loses no user's work. It
   is on the **watch list**, not the build list — `field` carries it in
   `docs/beta/03-install-watch-protocol.md` beside the shell-mismatch false
   negative. **Trigger: any beta user opens the Usage view in a recorded
   session.**
2. ~~**Q1 — CLI-declared attention signals**~~ **— shipped in 0.14.0, and it is
   now the only claim this product has.** `b7e2d69` landed the hook route and
   `fb154dd` made Mission show *that the agent said it, rather than that DevDeck
   guessed*; `src/main/attention.ts` holds the line *"NOTHING LEAVES THE
   MACHINE"*. Both constraints below were honoured: a hooked session that goes
   quiet falls back to the classifier, and the tile shows which source it read.
   **The Codex half is not built and waits for a beta user who runs Codex**
   (`W1`). Kept in full below because it is the reasoning the surviving claim
   rests on. Original text: Claude, Codex and Gemini hooks
   posting to the local MCP server DevDeck already runs on `127.0.0.1:8787`.
   *This replaces the item that used to sit here* — `claude --session-id <uuid>`
   per-pane transcripts — because the hook payload carries `transcript_path`
   exactly, so `usage.ts` stops guessing which transcript belongs to which pane.
   It is the only mechanism in the market that beats a screen-scrape for Claude
   Code, and it is the same structural move Intelligent Terminal made without
   giving up the pty. Two constraints if it is ever built: a hooked session that
   goes quiet with **no** event must fall back to the screen classifier rather
   than to silence, and the tile must show which source it is reading from —
   otherwise a missing hook is a silent false negative, the worst class this
   product has. Do **not** hold a `PermissionRequest` hook open until a human
   taps; that is a daemon in disguise and it dies at the hook timeout.
3. ~~**Q2 — the Windows taskbar overlay badge**~~ **— shipped in 0.14.0**
   (`c13d135`): same file, same count, no new surface, as ordered.

~~Neither Q1 nor Q2 is build-now, and neither may precede a recorded session.~~
**Both preceded a recorded session, because there are none.** They shipped
inside the 0.14.0 cut. I do not reverse them — Q1 is the reason there is
anything left to test — but the record must show that the rule was written and
then not enforced, twice. **This section is now empty of build items, and it
must stay empty until a session is recorded.**

### Explicitly not on this path

Every feature: cost surfacing, quota, context fill, terminal colour, launch
templates, the `+Claude` menu. **Trigger: three users installed.** Also off:
turning `remote.enabled` on (its own trigger stands — and F-1 established the
server ships off, while being a proven remote SSRF the moment a user ticks the
box); macOS and Linux (the five are recruited on Windows or not recruited); a
sixth competitor study — permanently, **including "install Herdr for two weeks"**
and, added 2026-09-15, **"install Pane for two weeks"**, because that two-week
test is now cheaper as question 7, answered by five strangers instead of by the
author (the 09-15 scan is a *seventh* study and is the last one; it is allowed
only because it arrived unasked and changed a ruling); and **any further UI,
motion, colour or boundary work before step 9.** Not one item on the path to five
sessions is a UI item that is not already named in this section.

---

## Closed history — kept for its reasoning, not as live plan

A plan that deletes its own reasoning is how the same argument gets had twice.
Nothing in this section is an open item.

### The 0.13.0 ruling (2026-09-04) — superseded twice

Ruled: *cut 0.13.0 now, publish nothing until step 4 lands, then 0.13.0 is the
new remote's first published release.* Its evidence was that across 14 published
releases and 28 installers the **lifetime download count was 1** — a 346-byte
`latest.yml` poll, almost certainly from this machine (`gh release view <tag>
--json assets`, 2026-09-04) — so there was no installed base; the folder-moved
crash fix protected only the first stranger; and the only installer that existed
was self-signed, so publishing spent a first impression on SmartScreen. It also
predicted correctly that publishing into a repo about to be deleted is work that
deletes itself.

**Superseded 2026-09-08 on its own terms** — step 4 landed, so "publish nothing
until step 4" is satisfied. **Superseded again 2026-09-11:** 0.13.0 is no longer
the build to publish at all, because HEAD is 22 commits and one deleted deck past
it. See *The 0.14.0 ruling*.

### What step 4 costs, priced (2026-09-04) — closed

Priced at 14 published releases and 28 attached installers, against not
publishing an employer's and a client's identifiers permanently, since GitHub
keeps unreachable objects retrievable by SHA and only deleting the repository
removes them. **The trade was taken and the price was never paid:** `delete_repo`
never reached the token, so the old repo was renamed to a private archive with
its 14 releases intact and a fresh repo was created under the same owner and
name. The pre-scrub objects therefore **survive in a private archive instead of
being destroyed** — exposure is zero (private, 0 forks, 0 collaborators), and
`scripts/check-repo-visibility.mjs` exists to assert that, deliberately not from
CI and deliberately naming no repository in this tree. **That repo must never be
flipped public.** The harvest ran first: the 14 release-note bodies — verified
*not* to be in `CHANGELOG.md`, and the only prior art for how this product has
ever described itself to an outsider — and the download counts, whose value is
precisely that they are zero. Once the releases are gone, "nobody ever downloaded
it" becomes an assertion instead of a measurement.

### Ruled *not yet*, with triggers, so nobody re-opens them

Re-checked 2026-09-11 and again **2026-09-15**. **No trigger has moved**, on
either date, because every one of them waits on a recorded first session and
there are none. Two items joined them today as watches rather than plans: `W3`
(the reviewer's queue — ruled above, threshold two of five) and `W5`
(worktree-per-task as a candidate's expectation, same threshold).

- **The seeded preset icons** (`settings.ts`) violate fixed point 7 of the spec
  that shipped on 2026-09-04, by the product's own defaults. It is decoration.
  **Trigger: the first beta screenshot.**
- **Path dedupe is exact string equality** (`main/projects.ts`), so `C:\Repos\Foo`
  and `c:\repos\foo` become two project cards. **Trigger: a beta user does it.**
- **In Settings → Agents, `on PATH` and `unchecked` still differ only by the
  word.** Close it by adding a channel or by deciding out loud that one word is
  enough on a form — not by re-reading the tradeoff. Not a beta blocker.
- **A slot-aware sizing variant for a crashed top bar** — on a slot shorter than
  the card, `Copy diagnostics` needs an in-card scroll.
- **The redactor's remaining gaps**, to watch in beta reports rather than
  pre-solve: URL- and base64-encoded secrets; uncovered issuers (SendGrid, Slack
  and Discord webhooks, Google OAuth); `AKIA` followed immediately by an
  alphanumeric; and space-separated flag values (`mysql -p hunter2`), genuinely
  indistinguishable from a positional argument. The **home-path** gap that used
  to head this list closed on 2026-09-10 (F-3) — it gated `field`'s plan of
  having candidates paste diagnostics into a public issue.
- **The report rate limit is a fixed window**, so 30 refusals at the end of one
  window plus 30 at the start of the next is 60 in an instant. Promote to a
  sliding window only if a beta report actually shows burst loss.
- **The tab-remount blip** — re-entering an agent's tab flips `waiting` →
  `WORKING` for about six seconds, because a remount replays chunks and the
  `waiting` gate's bar is that output *continues*. `qa` observed that the pane's
  characters do not change, and that is the discriminator. Not a regression, and
  the last remaining disclosure.
- **Deck geometry, the new-project → new-terminal mechanics, starter-command
  discoverability** — all deferred on triggers only step 9 can move.
- **HiDPI verification of the 6 px diamond.** Every measurement was taken at 1×;
  most Windows laptops run at 125–150%.
- **A guided tour / onboarding modal** — refused, not deferred. The fix for "the
  app explains itself once" is self-describing empty states, not a modal
  dismissed in two seconds.
- **A seventh skin.** 84 → 6 made every UI change roughly an order of magnitude
  cheaper to verify. That saving is the *point*, not a budget. Refused in advance
  2026-09-04, refused 2026-09-07, refused again here.

### Closed between 2026-09-04 and 2026-09-11

- **The 17 unguarded overlays** — four deleted outright, the remainder behind
  their own boundary (`815b9fe`), `WorktreesModal` among them.
- **`PRODUCT.md`'s false validation claim** — closed `5feb82d`. It now says, in
  its own words, that no external user has ever run this app. Its *status-quo*
  premise was a separate falsehood — *"none of them can tell me which agent needs
  me"* — corrected 2026-09-10 once Herdr and Intelligent Terminal were verified.
- **The `Ctrl+O` menu-bar question** — decided: `autoHideMenuBar: false`. A
  visible menu bar is itself a discoverability affordance for a stranger.
- **`Ctrl+1..8` bypassing the disabled view keys** — closed, and the chord range
  is now `Ctrl+1..4`.
- **The three items added on 2026-09-04** — the `+ Claude` double-spawn
  (`e5327ad`), `projects.json` unreadable presenting as *"you have no projects"*
  (`30cfe4a`), and the labelled deck measured at `minWidth` (`5792925`). Note
  that the measurement's headline figure — "590.45px, identical in all six
  skins" — describes a **seven-key** deck that no longer exists. The four-key
  deck measures roughly 350px, which is why the collapse query that shipped
  alongside it can never fire again.
- **Seven defects that lied to a stranger** (`a0d925a`), verified across seven
  `qa` passes.
- **Three proven security holes and a toggle that had never worked**
  (`0746eac`): every IPv4-in-IPv6 embedding past `isBlockedAddress` — including
  a test that had been *asserting* a bypass; `/xterm.js` re-read
  unauthenticated from disk on every request, on the thread that relays every
  PTY byte; the home path in the diagnostics record; and Desktop notifications,
  which had never fired because `Notification.permission` reads `denied` under
  the deny-all handler while the constructor does not throw, so a `try/catch`
  reported success forever.
- **D1** (`74e969b`, `d45d732`) — three panels with their handlers, channels and
  stores; `pg`, `mysql2`, `mssql` and `node-sqlite3-wasm`; five MCP tools and the
  phone's `db:*` routes; Tasks demoted. Deck **7 keys → 4**, production
  dependencies **9 → 5**, and **830 ms off every cold start**, all of it
  `require()`d eagerly before `app.whenReady()`.
- **An `npm audit` gate in CI, a `SECURITY.md` and an architecture-boundary
  test** (`36fda76`); the accent budget returned to one accent (`80a9caf`).

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
> `main/proxy.ts` were deleted after 0.12.0 (`cf35bd5`): a general-purpose forward
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

- [x] **Theme system** (Zen deleted 2026-09-04; the surviving set is Sumi/Washi/Slate × Wabi-sabi/Modern Pro — **6 skins, down from 84**, `cfd31d5`) — Sumi (dark), Washi (light), Zen (airy dark); picker in Settings → Appearance; applied across UI (CSS vars), terminal (xterm) and editor (Monaco). User chose mockups from generated PNGs first.
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

> Deleted (`b3d005a`), with its connectors and persisted positions: a third
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
- [x] **Terminal toolbar declutter** — grouped into create / layout / pane clusters; secondary tools (record, recordings — both deleted 2026-09-04, `d57c87d` — worktrees, review changes) moved into a `⋯` overflow; 13 → 10 controls
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
