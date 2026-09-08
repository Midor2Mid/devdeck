# Beta execution plan — from the ruling to five recorded sessions, then D1

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to run this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** five recorded first sessions from five non-author users, each on their own
machine, each carrying at least one dated verbatim quote in `NOTES.md`, by
**2026-10-06** — with **kill criterion K6 firing if no candidate has been contacted by
2026-09-22**. Then, as authorised work that is deliberately not on that critical path,
**D1**: the deletion of the verify half.

**Source ruling:** `docs/superpowers/brainstorm/2026-09-08-product-direction.md`
(`product-director`, 2026-09-08, against `HEAD = cfe2f05`). Read §7 first; this plan
sequences it and does not re-open it. Where this plan departs from the ruling's stated
order it says so in **§Departures and under-specification** and gives the reason.

**Architecture — five tracks, and only two of them are agent work.**
The beta milestone is no longer blocked on anything an agent can do. So this plan is
built around the inverse of the usual shape: the **owner track starts at hour zero and
nothing waits for it to be unblocked**, the document and release tracks exist only to
stop the owner track handing a stranger a false sentence, and no agent task is ever
placed in front of a 🔒 item. D1 is a large, real engineering track and it is
**quarantined behind the fifth recorded session** — see §Ruling on D1's timing.

---

## Owner rulings received during planning — recorded here so they are not re-argued

1. **D1 is AUTHORISED and unconditional** (2026-09-08). It is no longer a pre-registered
   conditional deletion. It is executed on the **empty-table result** — the author's own
   stores — and not on beta evidence.
   - **D1's pre-registered firing conditions (a), (b) and (c) across five sessions are
     therefore MOOT. They must never be cited later as if users decided this.** Nobody
     will have decided it but the owner, on 2026-09-08, on the evidence of one machine's
     stores. Any future document that says "the beta showed nobody used the Database
     view" would be a fabrication.
   - **The ruling §6 "What would prove me wrong" clause tied to D1 — falsifier 2
     (prediction 2 fires → *"D1 must be withdrawn before it is ever executed"*) and
     falsifier 1 — now has no test.** D1 executes before any evidence that could
     withdraw it exists. This is a real loss of falsifiability and it is written down
     rather than smoothed over. Falsifier 2 (*a first session is spent in the API or
     Database panel and the user names it as the reason they would keep DevDeck*) can
     still fire — and if it does, it fires against a product that no longer has the
     panel. `po` records that outcome as a finding regardless; it is the only remaining
     way this decision can be shown to have been wrong.
2. **On upgrade data: orphan the keys, do not prune** (2026-09-08). D1's deletion must
   not touch `%APPDATA%/devdeck/settings.json`, `connections.json`, or any saved
   collections/environments belonging to the removed panels. No migration, no cleanup
   pass, no "tidy on first launch". The keys are left in place, unread. **This is harder
   than it sounds in this codebase and the mechanism that breaks it is identified at
   `src/renderer/src/settings.ts:713`** — see **Task D1-2**, which exists solely because
   of it.
3. **D1 stays off the critical path to 2026-10-06.** Authorised, not urgent. K6 still
   fires on 2026-09-22.

---

## Position, verified 2026-09-08 (not taken from any document)

| Fact | Command | Result |
|---|---|---|
| Tree | `git status --porcelain` | clean but for one untracked file — the ruling itself |
| HEAD | `git log --oneline -1` | `cfe2f05` |
| Tag | `git rev-list -n1 v0.13.0` | `cf38972` — **one commit behind HEAD** (`cfe2f05` is a ROADMAP doc commit) |
| Typecheck | `npm run typecheck` | **0 errors** |
| Suite | `npx vitest run` | **1641 passed, 1 skipped, 134 files, 22.2 s** |
| Manifest | `node scripts/update-manifest.mjs --check` | **exit 0** — `latest.yml` already describes the signed artifacts on disk |
| Draft release | `gh release view v0.13.0 --json isDraft,assets` | `isDraft: true`, 4 assets, URLs under `untagged-3296c18c…` |
| Draft vs local | asset sizes | Setup 114,749,795 (CI) vs **114,780,760** (local signed); Portable 114,501,756 vs **114,525,752**; blockmap 121,187 vs **120,527**. **All four differ. All four must be replaced.** |
| Pages | `gh api repos/Midor2Mid/devdeck/pages` | **404** |
| `gh` token scopes | `gh auth status` | `gist, read:org, repo, workflow` |
| D1 blast radius | `wc -l`, `grep` | see the inventory in **Phase 4** |

---

## Global constraints — standing, and they bind every task here

- **`npm run typecheck` must land at zero errors.** The build (`electron-vite`) does
  **not** typecheck, so nothing catches a type error unless this is run. Every task
  touching a `.ts`/`.tsx` file names it as its verification. No task in Phases 0–3
  touches one; **every task in Phase 4 does.**
- **`npm test` must stay green.** Baseline measured today at `cfe2f05`: **1641 passed,
  1 skipped, 134 files**. A task that changes the count **states the expected delta
  before it runs and the acceptance check is the exact number, not "green"** — a
  silently deleted test is invisible to a green suite and that is the whole point of the
  rule.
- **A count is only meaningful on a tree no other agent is touching.** Run
  `git status --short` and confirm no untracked test file belongs to someone else before
  quoting one. Vitest runs every test file it finds, committed or not; this repo has
  already drawn a wrong conclusion from exactly that.
- **There are no component tests, and none are to be added.** `vitest.config.ts` is
  `environment: "node"`. Logic testable in isolation gets a unit test; anything else
  gets a `run-app` observation. Do not add a DOM environment.
- **A green suite proves nothing about a deletion.** ~99 hand-written `window.api` stubs
  are cast through `unknown`, so **removing an IPC channel leaves every suite green**.
  Deletions are verified by grepping bare channel names and by driving the built app.
- **The two seams that do work:** mock `electron` for main-process modules
  (`tests/projects.test.ts`, `tests/aikeys.test.ts`), and drive the renderer store
  through a stubbed `window.api` (`tests/paneHold.test.ts`). Task D1-2's required test
  uses the second one.
- **No headless renderer.** A claim provable only visually names the `run-app` skill
  (`npx electron-vite build` first; the harness loads `out/`), passes a unique
  `{ debugPort, userDataDir }` scratch profile, and knows **HTML5 drag-and-drop cannot
  be simulated over CDP**.
- **`run-app` touches real state.** Use a scratch `userDataDir` for anything
  destructive, and back up `%APPDATA%/devdeck/{workspace,projects,settings}.json` before
  running against the real profile. Phase 4 requires a **synthetic fixture profile**,
  not the real one.
- **Never edit `src/` while `npm run dev` is running.** HMR on a mid-edit state crashes
  the dev process.
- **Commit or stash before dispatching per-task-reviewed execution.** A dirty tree
  contaminates every per-task diff review. This is **Task 0** and it is not optional.
- **Design tokens are the source of truth.** Change the token (`themes.ts`,
  `styles.css`), never hard-code a colour or size. One accent; state carries a form
  marker (dot/pill/stripe) as well as colour. Three states where there are three.
  Relevant only in Phase 4.
- **The fifth-piece refusal.** The ruling closes the door on further pre-beta
  engineering after items 1–4. **Phase 4 does not breach it, because Phase 4 is not
  pre-beta** — that is the load-bearing reason for the timing ruling below. Task 3 is
  the one place the refusal could still be breached and it is written to avoid it.
- **Network is not reliable here.** `git ls-remote --tags origin` failed today with
  *"Failed to connect to github.com port 443 after 21066 ms"* while `gh api` succeeded
  minutes earlier. Task 2 uploads ~229 MB; retry is expected.
- **`gh`'s token holds `repo`, not admin extras.** Step 4's `delete_repo` never reached
  the token after three attempts. Assume the same class of gap for the Pages API and
  write the escalation in rather than discovering it.
- **Avast.** Signing needs `powershell.exe` on Avast's **Allowed apps** list (not scan
  exceptions). Phases 0–3 re-sign nothing. **Phase 4 ends in a rebuild, which does need
  signing, on the owner's machine.**
- **Conventional commits.** 4-space indent, double quotes.

---

## The tracks

| Track | Who | Contains | Blocked by |
|---|---|---|---|
| **O — owner, 🔒** | the owner; `qa` and `field` in support | H1 phone sitting · H2 name candidates + first contact · H3 SignPath filing · H4 first session · H5 sessions 2–5 | **Nothing, at hour zero, for H1 and H2** |
| **D — documents** | `docs-writer` + `marketing` | T1 (one sitting, seven files) | Task 0 |
| **R — release** | `release-eng` + `marketing` | T2 (publish 0.13.0 signed) | Task 0 |
| **P — the page** | `marketing` | T3 (Pages) | T1 + C1 |
| **W — watch list** | `field` | T4 | nothing |
| **G — owner-gated docs** | `pm` → `docs-writer` | T5 (`ROADMAP.md` restructure) | the owner accepting the ruling |
| **E — D1, authorised** | `technical-director` → `designer` → `backend-dev` + `frontend-dev` → four reviewers | D1-1 … D1-7 | **H5 (the fifth record)** — see the timing ruling |

**Parallel-safe, as a rule and not a hope:** two agents may work at once only when they
share no file and no interface. `{T1, T2}` qualify, and any agent task runs alongside
`{H1, H2, H3}`. Everything else is sequential and the reason is in the pre-flight scan.
**Within Phase 4, nothing is parallel** — every task lands in `App.tsx`, `store.ts`,
`preload/index.ts` or `package.json`.

**Prefer the boring sequence.** One repo, one suite, one build, one working tree. A
merge conflict costs more than the wall-clock it saved.

---

# Ruling on D1's timing — it runs AFTER the fifth recorded session

Asked to rule, and ruling plainly rather than hedging: **D1's code executes in Phase 4,
after H5's fifth record and `po`'s verdict. Its document half merges into T1 now.
Executing it between the first invitation and the fifth record would invalidate the
milestone.** Three reasons, in order of force:

1. **It changes the instrument mid-measurement.** `05-validation-criteria.md` scores
   S1–S4 as tallies *across the first five* — S1 ≥ 4/5, S2 ≥ 4/5, S3 5/5, S4 ≥ 3/5.
   D1 removes **three of seven deck keys** (see the arithmetic correction in
   §Departures) and renumbers `Ctrl+1..7`. Users 1–2 would be scored on a seven-key deck
   and users 3–5 on a four-key one, and the tally would be a sum over two different
   products. That is not a tighter product; it is an unusable denominator, and no
   amendment to the criteria fixes it — the amendment rule would require it to be
   recorded in the verdict, which would then read "this milestone measured two apps".
2. **It invalidates the artefact.** `docs/beta/07-the-build.md` is a hash table for
   `DevDeck-{Setup,Portable}-0.13.0.exe` with exact SHA-256s that a user is asked to
   check before running. D1 drops four production dependencies and ~2,200 lines, so it
   needs a new version, a new package, a new signing pass (Avast-dependent, owner's
   machine) and a new hash table. Mid-beta that means either two cohorts on two builds
   or a pause in recruiting — and the only permitted reason to pause recruiting is a
   stop-the-line fix. D1 is not one.
3. **K6 is 14 days away and D1 is 2–3 days of work plus four review checkpoints.** The
   ruling's own second test applies with full force: *when every remaining blocker is a
   human act, a code change is a way of not performing the human act — including a
   correct, well-argued, authorised one.* D1 is now authorised, which makes it the most
   legitimate-looking way to spend the fortnight in which K6 fires.

**The one alternative window, priced honestly:** entirely *before* the first invitation.
That is internally consistent — one product, one build, one cohort — and it costs a
version bump, a repackage, a signing pass, a fresh `07-the-build.md`, a re-publish of
the release T2 just published, and four review checkpoints, i.e. **the better part of a
week with K6 fourteen days out**, to remove panels that a 30-minute first session would
never have reached. If the owner prefers that window, the plan is re-orderable: Phase 4
moves ahead of H2, and T2 publishes 0.14.0 rather than 0.13.0. **I do not recommend it,
and my reason is the third one above.**

**What merges into T1 now, because it cannot wait:** the claim repointing (ruling items
4 and 12) is now the same work as D1's document half. T1 leads with the cockpit *and*
must not write a single promissory sentence about the API client, the database panel or
the Work panel — no "collections", no "engines", no roadmap language. It may describe
them plainly as present, because they are present and a stranger will find them on
`Ctrl+4` and `Ctrl+5`; describing them as absent before the code is deleted would be a
surface asserting something it never observed, which is this repo's recurring bug class.
**Task D1-6 then strips those sentences in the same commit that deletes the panels.**

---

# PHASE 0 — the tree

### Task 0: Commit the ruling and this plan so every later diff is readable

**Owner:** `pm` (or whoever dispatches).
**Files:** `docs/superpowers/brainstorm/2026-09-08-product-direction.md` (untracked),
this plan file.
**Interfaces:** consumes nothing. Produces a clean tree, which every per-task diff
review in this plan depends on.
**Unblocks:** T1, T2. Nothing may be dispatched before it.
**Size:** 5 minutes.
**Concurrent with:** H1, H2 (they touch no file in the tree).

- [ ] **Step 1: Confirm what is actually dirty**

```bash
git status --porcelain
```
Expected, exactly: `?? docs/superpowers/brainstorm/2026-09-08-product-direction.md` plus
this plan file. Anything else belongs to somebody and is resolved with them, not stashed
blind.

- [ ] **Step 2: Commit both**

```bash
git add docs/superpowers/brainstorm/2026-09-08-product-direction.md \
        docs/superpowers/plans/2026-09-08-beta-execution.md
git commit -m "docs(plan): sequence the 2026-09-08 direction ruling into an execution plan"
```

- [ ] **Step 3: Verification that closes the task**

```bash
git status --porcelain   # must print nothing
```

**What breaks if this is wrong:** every per-task diff is reviewed against a tree
carrying someone else's work, and a reviewer either passes a change they never saw or
rejects one that is not there. This has happened in this repo — it is why the constraint
exists.

---

# PHASE 1 — day one, four things at once

Two agent tasks and two 🔒 owner acts, starting together. **No agent task is in front of
a 🔒 item.**

## 🔒 H1 — Step 7: the physical-phone sitting

**Owner:** `qa`, **a human at the keyboard with a phone.** No agent can do any part of it.
**Files:** none in `src/`. Writes a new §8 into
`docs/qa/phone-approval-verification.md`, and anything found into `NOTES.md`.
**Interfaces:** consumes the signed 0.13.0 already in `release/`. Produces (a) a verdict
on whether the approve/deny card renders and is readable on real hardware, (b)
dispositions for **J1–J6** and **D6**, (c) the four CDP-blind observations. Consumed by
**nothing on the critical path**, deliberately — see Step 4.
**Unblocks:** the beta's first impression; it removes the one claim in this product that
has never been observed. It is a precondition of H4.
**Size:** 10 minutes of protocol, ~3 of setup, ~30 to write down. Budget an hour.
**Concurrent with:** T1, T2, H2, T4 — all of them.

- [ ] **Step 1: Run `docs/qa/phone-approval-verification.md` §5 in order**

Setup S1–S3 (remote on; **Tailscale/VPN** if a tailnet is up, else Local network
*knowingly*; pair by QR; get a real Claude session to ask for permission with the pane
**off-screen** — that is the primary case, because main's 1 s refresh exists for a pane
nobody is looking at). Then P1–P4. §5's own instruction is the one that matters: **do
not run out of time before P1 and P2.**

*Verification:* each of S1–S3 and P1–P4 has a written outcome. "Did not reach it" is a
written outcome and beats a silence that later reads as a pass.

- [ ] **Step 2: The four CDP-blind observations, same sitting**

The native folder dialog and `addProjectByPath` on a bad path; `F1` / `Ctrl+K` via real
keys; the "none found on your PATH" state; the crash card. Plus a look at the phone
client's own palette.

*Verification:* one line each saying what was on the screen — not what was expected.

- [ ] **Step 3: Write §8 into `docs/qa/phone-approval-verification.md`**

Observed only, with the author's interpretation in a separate labelled paragraph, the
way `04-session-record-template.md` separates its parts.

*Verification:* `grep -n "^## 8" docs/qa/phone-approval-verification.md` hits, and each
of P1–P4 appears under it with an outcome.

- [ ] **Step 4: Dispose of J1–J6 and D6 — the step with a trap in it**

§3 carries six unresolved judgement calls (`J1` no attention-first sort on the phone
list, so NEEDS YOU sat at `y=1223` with 14 sessions · `J2` pinch-zoom disabled, a WCAG
1.4.4 failure · `J3` sub-44px tap targets on the quick-keys row, `esc` at 46×26 in
landscape · `J4` the raw excerpt at 4.84:1 and 12px — the text you must read before
approving a destructive command · `J5` you cannot answer from the list · `J6`
`cleanTail` glues two screen lines into one, which §3 says is a `technical-director`
call because it changes every `tailHash` and so which prompts are detected), plus **D6**,
unfixed.

**The rule, and it is the ruling's:** this sitting is an *observation* task. Its output
is a decision queue, not a work queue. **Nothing here becomes work before the first
invitation** unless it is **L2-class** (the app gives wrong information and a user acts
on it) or **L3-class** (unrecoverable stop / data loss). Everything else is written down
with a recommendation and parked. A well-argued fix from this list is exactly the fifth
piece of pre-beta engineering the ruling refuses in advance.

*Verification:* each of J1–J6 and D6 carries exactly one of three words — `parked`,
`L2/L3, fix before H4`, or `withdrawn` (the sitting showed it is not real). There is no
fourth option.

**Acceptance check:** §8 exists; P1–P4 each carry an observed outcome; J1–J6 + D6 each
carry one of the three dispositions; and `docs/beta/README.md`'s "the phone card has
never rendered on physical hardware" bullet is either still true or corrected by this
sitting.

**What breaks if this is wrong:** the most distinctive thing in the product goes to five
strangers having never rendered on hardware. The reverse failure is worse and likelier:
the sitting succeeds, yields six good recommendations, and a fortnight disappears into
them while nobody has been contacted. That is K6.

---

## 🔒 H2 — Name the candidates, and make first contact today

**Owner:** `field` drafts; **a human sends.** 🔒
**Files:** `NOTES.md` → "Beta — external users (step 9)" → the Funnel table (currently
`— | *none yet*`).
**Interfaces:** consumes `docs/beta/01-who-to-approach.md` (the three-fact gate, the
archetypes, the six intake questions) and `docs/beta/02-recruiting-message.md` **§1
only** — see Step 2. Produces named candidates in `invited` state with intake answers,
consumed by H4.
**Unblocks:** **K6.** This is the act that stops it firing, and it is available now.
**Size:** one hour to name six to eight and send the first message. Then it is other
people's calendars.
**Concurrent with:** everything. No agent task in this plan opens `NOTES.md`.

- [ ] **Step 1: Write the three sentences, from something they said or published**

`01-who-to-approach.md` §"The gate": Windows shell · agent CLI most days · more than one
repo. **From evidence, not a guess** — "a developer who might like this" is an
intention, not a candidate. Name at least six, so one declining does not stall the
funnel; cover archetypes A, B and C with a slot each; D gets one or two, knowingly.

*Verification:* the Funnel table has ≥ 6 rows, each with an archetype letter, a "reached
via" and a shell, and the three gate sentences exist in writing for each.

- [ ] **Step 2: Send `02-recruiting-message.md` §1 — the DM line — to candidate one**

**§1 needs nothing from any other task in this plan.** It is one sentence about a
Windows app for driving `claude`/`codex`/`gemini` across several projects in one
window — already cockpit-shaped, already true, carrying no claim this plan is about to
correct and none that D1 will remove. **This is the most important scheduling fact in
the document: the act that satisfies K6 is available in the next hour and is not
downstream of T1, T2 or H1.**

**Constraint:** do **not** use §2 (the longer version, for a post or a first reply) until
**T1 Step 4** has landed. §2 currently pitches *"an editor, an API client and a database
panel"* — the framing the ruling ordered demoted and D1 is about to delete — to the
exact person whose ability to say what DevDeck is for is criterion **S4**.

*Verification:* the Funnel's first row moves to `invited` with a date, and the message
actually sent is pasted into or referenced by the record.

- [ ] **Step 3: Ask the six intake questions in the invitation thread**

`01-who-to-approach.md` §"Intake". All six, verbatim where interesting, **before** the
build is sent. Q3 decides whether this is a shell-mismatch case; **Q6 is the only
question that tests `PRODUCT.md`'s premise and can never be asked honestly again once
they know what the app does.**

*Verification:* six answers recorded per candidate before any file is sent.

- [ ] **Step 4: Decide the one reply channel and write it into the message**

`docs/beta/README.md`'s third prerequisite. **Its stated reason is now false** — issues
are enabled on a public repo — but the *decision* is still required, and diagnostics
remains clipboard-only by design, so nothing reaches the owner unless the user is asked
to paste it. Pick email, DM or "open an issue", and say which. T1 Step 3 corrects the
file's reasoning; this step makes the choice.

*Verification:* the sent message names exactly one channel.

**Acceptance check:** ≥ 6 gate-qualified candidates named with archetypes; ≥ 1 contacted
with a date; six intake answers recorded for the first respondent; one reply channel
named. **K6 does not fire.**

**What breaks if this is wrong:** K6 — the only kill criterion that fires on the owner
rather than the users, and on the ruling's own assessment the most likely of the six to
fire. If nothing else in this plan happens, this task happening is the difference
between a completed milestone and the finding that the standing decision of 2026-09-02
is not held by the person who has to act on it.

---

## T1 — The one documents sitting: seven files, one agent, one review

**Owner:** `docs-writer`, with `marketing` on the claim half. **One agent's sitting.**
The ruling is right that items 1 + 2 + 4 cannot be split — they touch the same
sentences — and this task is that ruling honoured, plus D1's document half insofar as it
can be done before the code (see the timing ruling).
**Files (modified):**
- `README.md` — `:3` (lead), `:23` (status), `:38–42` (the "works without any of them"
  sentence naming the API client and database panels), `:47–60` (the install block:
  Releases instruction, the SignPath paragraph, the homepage link), plus a new
  `## Code signing` section if the owner takes H3 Step 1's recommendation
- `PRODUCT.md` — `:3` (tagline; drop *"For me … first"*), `:8` (the pain paragraph's
  Postman/database framing), `:68` (the "all-in-one is the vision" risk line)
- `site/index.html` — `:7` (`meta description`), `:146–151` (hero), `:192` (the API
  client bullet's register), `:246–249` (the "still private" paragraph)
- `docs/beta/02-recruiting-message.md` — `:10` (the private-repo/issue claim) and **§2's
  product sentence**
- `docs/beta/README.md` — `:45` and `:50` (two of three "prerequisites that are not app
  source" are false in every clause)
- `IDEAS.md` — `:13–15` (the parity claim naming record/replay and Canvas) and the moat
  list at `:83–110`, which still books DotnetPanel, ReleaseBoard, StandupModal,
  record→share and Canvas as shipped assets, all deleted 2026-09-04
- `.github/workflows/release.yml` `:175` — a comment asserting the repository is private
- `.superpowers/HANDOFF.md` §1–2 — **untracked** (`.gitignore:21`), so it costs no diff
  review; refresh via the `handoff` skill

**Explicitly NOT in this task:** `ROADMAP.md` (see **T5**), and any sentence that says
the API/Database/Work panels are *gone* (see **D1-6**).
**Interfaces:**
- Consumes: T2's published-release URL and confirmed asset names (Step 6 only).
- Produces: a public claim set with no false sentence in it, and no promissory sentence
  about a panel D1 will delete. Consumed by **T3**, **H3**'s policy link, **H2 Step 2**'s
  §2 unlock, **H4**'s delivery message, and **D1-6**, which strips the remaining
  descriptive sentences when the code goes.
**Unblocks:** T3, H3's policy link, H2's §2, H4, D1-6.
**Size:** half a day. Seven files, roughly eighteen sentences. Not a rewrite — the
ruling says so twice.
**Concurrent with:** T2 (disjoint files; see Step 6's ordering rule), H1, H2, T4.

- [ ] **Step 1: Correct the four sentences that tell a stranger this repo is private**

`README.md:56–60`, `site/index.html:246–249`, `docs/beta/02-recruiting-message.md:10`,
`docs/beta/README.md:50`. The repo went public 2026-09-07. The SignPath position is
**unfiled, and the stated reason for it being unfilable is gone** — half true and wholly
misleading is worse than false, so say the true thing: public repo, MIT, Foundation
application outstanding, build self-signed today.

*Verification:*
```bash
git grep -n -i -E "still private|repo is private|cannot open an issue|no issues on a private" \
  -- README.md site/index.html PRODUCT.md docs/beta .github/workflows
```
returns **nothing**. Hits in `ROADMAP.md`, `CHANGELOG.md` and
`docs/release/step-4-public-flip.md` are history and are correctly left alone.

- [ ] **Step 2: `README.md:23` — status → 0.13.0**

*Verification:* `grep -n "Current release" README.md` names `0.13.0` and matches
`node -e "console.log(require('./package.json').version)"`.

- [ ] **Step 3: `docs/beta/README.md:45` and `:50` — the prerequisites the ruling missed**

Prerequisite 1 ("the only artifacts on disk are 0.12.0") is false: `release/` holds
signed 0.13.0. Prerequisite 2 ("the repo is private, newest published release is
`v0.10.0`, the README's install steps point at a Releases page an external user cannot
open") is false in every clause once T2 lands. Prerequisite 3's *reason* is false; its
*decision* is still required (H2 Step 4).

*Verification:* all three read true against today's state, and the hand-delivery
instruction survives — a hand-delivered file with the SHA-256 sent separately is still
the delivery unit for the first five, and `07-the-build.md` is untouched by this task.

- [ ] **Step 4: Repoint the claim at the cockpit — five places, one paragraph each**

`README.md:3`, `PRODUCT.md:3` (drop *"first"*), `PRODUCT.md:8`,
`site/index.html`'s hero `:146–151` + `meta description` `:7`, and
**`docs/beta/02-recruiting-message.md` §2**. Match GitHub's own repo description, which
is already right: *"A Windows desktop cockpit for supervising AI coding-CLI sessions
across projects."* The verify tools become a second sentence, not the headline.
`PRODUCT.md:68`'s risk line stops calling all-in-one "the vision" and describes it as a
superseded one, dated.

**Two constraints on the second sentence, both from D1's authorisation:**
- **No promissory language.** Nothing about collections, environments, engines, OAuth, a
  fifth engine, or anything a database or API client "will" do. The ruling refuses any
  further growth of either outright, and D1 deletes them.
- **Do not write them out of existence yet.** They are on `Ctrl+4` and `Ctrl+5` today
  and a stranger will find them. A document that denies a surface the app has is the
  same bug class as a surface asserting something it never observed. D1-6 strips these
  sentences in the same commit that removes the code.

**§2 is in this step and is not in the ruling's item 4.** It is the only document on the
list a beta candidate actually reads, and S4 — *can they say what DevDeck is for* — is
scored on words they were primed with.

*Verification:*
```bash
git grep -n -i "all-in-one" -- README.md PRODUCT.md site/index.html DESIGN.md
```
returns nothing outside a dated, explicitly-superseded citation. `marketing` reads the
five leads against the repo description: same product, or the task is not done. And a
second grep confirms no future tense attaches to the API or database panels.

- [ ] **Step 5: `IDEAS.md`'s stale moat, and the `release.yml` comment**

Strike or mark-deleted DotnetPanel, ReleaseBoard, StandupModal, record→share/asciinema
and Canvas at `:83–110`, and the parity claim at `:13–15` naming terminal record/replay
and Canvas as the three places DevDeck leads. Fix
`.github/workflows/release.yml:175`'s "this repository is private" — low stakes as a
comment, and it is the exact block someone edits the day the certificate lands, so a
false premise sitting in it is a trap.

*Verification:* `git grep -n -i "DotnetPanel\|ReleaseBoard\|StandupModal" -- IDEAS.md`
returns only lines that say the surface was deleted, with a date.

- [ ] **Step 6: `README.md:47` and `:60` — the two lines only true after another task**

**This is the only ordering rule between T1 and T2.**
- `:47` ("Download the latest installer from the Releases page") is **false until T2
  publishes.** Write it last, after T2 reports the release published and visible to a
  logged-out client. `docs-writer`'s standing rule — every step it writes has been
  executed — means fetching that URL anonymously.
- `:60` links `site/index.html` as "the DevDeck homepage". Pages is 404. Until **T3**,
  drop the word *homepage* and describe it as the code-signing policy in the repo, or
  point at the new `README` section from H3. Do not link a `.html` blob URL and call it
  a homepage.

*Verification:*
```bash
gh release view v0.13.0 --json isDraft --jq .isDraft      # false
curl -sSIL -o /dev/null -w '%{http_code}\n' \
  https://github.com/Midor2Mid/devdeck/releases/latest    # 200, no auth
```
and the README's step-1 filename matches an asset actually attached.

- [ ] **Step 7: Refresh `.superpowers/HANDOFF.md` §1–2**

It says *"0.11.1 is cut and tagged"* with a next action of *"install 0.11.1"* — two
releases ago. Use the `handoff` skill; **never hand-type a mechanical fact** into it
(`.claude/resume.sh` derives position from git and cross-checks it, so a hand-typed
claim is flagged, not believed). §1–2 carry intent only.

*Verification:* `.claude/resume.sh` raises no contradiction against §1–2.

- [ ] **Step 8: Prove nothing typed broke, then commit**

```bash
npm run typecheck    # zero. No .ts file was touched; prove it rather than assert it.
git add README.md PRODUCT.md site/index.html IDEAS.md \
        docs/beta/02-recruiting-message.md docs/beta/README.md \
        .github/workflows/release.yml
git commit -m "docs: stop telling a stranger this repository is private

Four tracked files asserted a fact that stopped being true on 2026-09-07,
two of them being what a stranger reads first. Same sitting repoints the
lead claim at the supervision cockpit - the GitHub repo description was
already right and every document under it sold a different product."
```

**Acceptance check (`po` rules at C1):** every corrected sentence is now true *and was
executed*; the grep gates in Steps 1, 4 and 5 are clean; no **new** false statement
appears — nothing asserts a SignPath certificate, a granted application, a live
homepage, a user, or a future feature of either panel on notice.

**What breaks if this is wrong:** the ruling's own words — *"This part costs a beta
user, so it is not a footnote."* A candidate reads the SignPath paragraph, concludes the
project is private and abandoned mid-flip, and the loss is invisible because they simply
do not reply. The subtler failure: `:47` is written before T2 publishes and the README's
first instruction sends a stranger to an empty page — the exact defect this task exists
to remove.

---

## T2 — Publish `v0.13.0` with the locally signed binaries

**Owner:** `release-eng`, with `marketing` on the body.
**Files:** `release/` (read-only — **do not rebuild**), the GitHub release,
`docs/release/0.13.0-notes.md` (its "**Not published**" header), and a line appended to
`docs/release/published-release-notes.md`.
**Interfaces:** consumes the signed artifacts on disk and `docs/release/0.13.0-notes.md`
(the pre-written body). Produces a published release, four public asset URLs and
confirmed SHA-256s — consumed by **T1 Step 6** and **H4**.
**Unblocks:** the README's download path stops being a dead end; auto-update gets a real
feed; H4 gets a delivery path that is not only a hand-delivered file.
**Size:** one to two hours, most of it uploading ~229 MB over a link that failed once
today.
**Concurrent with:** T1 (disjoint files), H1, H2, T4.

- [ ] **Step 1: Establish, do not assume, that the local set is the signed set**

```bash
node scripts/update-manifest.mjs --check
```
Expected: exit 0 and the ten `ok` lines. **It already passes** (verified 2026-09-08), so
**`--rewrite` must not be run.** `--rewrite` exists for a signing service that returns
different bytes after electron-builder wrote the manifest; it has never run against a
real service, and here it would rewrite a manifest that is already correct.

Then confirm the hashes against `docs/beta/07-the-build.md`: Setup `8A8580CE…F101` /
114,780,760 and Portable `016BC4EB…A5C8` / 114,525,752; both Authenticode `Valid`,
subject `CN=DevDeck Dev`.

*Verification:* `--check` exit 0; both SHA-256s match `07-the-build.md` byte for byte.
If either differs, **stop** — the artefact being published is not the one the beta docs
describe, and the fix is to correct one of them, not to publish and hope.

- [ ] **Step 2: Know exactly what you are replacing**

The draft's four assets are the **unsigned CI set** and all four differ from local:
Setup by 30,965 bytes (the signature), Portable by 23,996, blockmap by 660. The draft's
`latest.yml` hashes the *unsigned* installer.

**Note the asset set, because the handoff's phrasing invites an error:** there are
**four** assets, not five — `DevDeck-Setup-0.13.0.exe`, `DevDeck-Portable-0.13.0.exe`,
`DevDeck-Setup-0.13.0.exe.blockmap`, `latest.yml`. electron-builder writes a blockmap
for the NSIS Setup only; **there is no Portable blockmap** and its absence is not a
missing file.

*Verification:* `gh release view v0.13.0 --json assets` lists exactly those four and
nothing else, before deletion.

- [ ] **Step 3: Replace the assets**

```bash
gh release delete-asset v0.13.0 DevDeck-Setup-0.13.0.exe          --yes
gh release delete-asset v0.13.0 DevDeck-Portable-0.13.0.exe       --yes
gh release delete-asset v0.13.0 DevDeck-Setup-0.13.0.exe.blockmap --yes
gh release delete-asset v0.13.0 latest.yml                        --yes
gh release upload v0.13.0 \
  release/DevDeck-Setup-0.13.0.exe \
  release/DevDeck-Portable-0.13.0.exe \
  release/DevDeck-Setup-0.13.0.exe.blockmap \
  release/latest.yml
```
The link is unreliable; a failed upload is retried, not worked around.

*Verification:* the four assets show sizes **114,780,760 / 114,525,752 / 120,527 / 346**
and `state: uploaded`.

- [ ] **Step 4: The body — `marketing`, from the file that already holds it**

`docs/release/0.13.0-notes.md` is the pre-written body; it rolls up
0.11.0 / 0.11.1 / 0.12.0 / 0.13.0 because its reader last saw **0.10.0**. Its own
instruction is to check three things first: the version numbers match the tag; **the
signature paragraph still describes the certificate the build was actually signed with**
(it is written for the self-signed one, which is still correct — no SignPath certificate
has landed, so that paragraph stays); and `latest.yml` is attached.

The opening states, in this order: **private beta · one maintainer · Windows-only ·
self-signed, so SmartScreen will warn.** Register prior art:
`docs/release/published-release-notes.md`.

*Verification:* `marketing` confirms no claim about users, no claim of a trusted
certificate, no link to a homepage that does not exist yet, and — given D1 — no
promissory sentence about the API or database panels.

- [ ] **Step 5: Note the tag, and decide it deliberately**

`v0.13.0` is `cf38972`; `HEAD` is `cfe2f05`, one ROADMAP-doc commit ahead; the binaries
were built from `12d25ef` per `07-the-build.md`. **Do not move the tag** — retagging
changes what the release points at for no gain. State the build commit in the body if it
is not already there.

*Verification:* `git rev-list -n1 v0.13.0` still returns `cf38972`.

- [ ] **Step 6: Publish, then prove it from outside**

```bash
gh release edit v0.13.0 --draft=false --latest
gh release view v0.13.0 --json isDraft,url --jq '{d:.isDraft,u:.url}'
curl -sSL https://github.com/Midor2Mid/devdeck/releases/latest/download/latest.yml
```
The fetched `latest.yml` must be byte-identical to `release/latest.yml`, and its
`sha512` must be the signed installer's —
`8p/5lqEcRjSKiIeh0yCTvAVPVoaHNAJYTXyXhLlO0GYAW/Qpv5JIB/kdUEMAnVUkGgQrQdSuNZ7dqWOPVOC0uA==`.

*Verification:* `isDraft: false`; the two files identical; the sha512 matches.

- [ ] **Step 7: Update the two release docs and commit**

Change `docs/release/0.13.0-notes.md`'s "**Not published.**" header to record the
publish date and that it was published with the **locally signed** binaries rather than
the CI set, and why (an unsigned binary draws more AV noise than a self-signed one; the
manifest must hash what is attached). Append the same to
`docs/release/published-release-notes.md`.

```bash
git add docs/release/0.13.0-notes.md docs/release/published-release-notes.md
git commit -m "docs(release): 0.13.0 is published, with the signed local binaries

The draft's four CI assets were unsigned and its latest.yml hashed the
unsigned installer. Replaced all four; update-manifest --check passes
against what is now attached, so auto-update will accept it."
```

**Acceptance check (`qa` rules at C2):** the release is public and marked latest; four
assets at exactly those sizes; the served `latest.yml` hashes the served installer; a
logged-out client can download. **Then, and only then, T1 Step 6 may be written.**

**What breaks if this is wrong:** publish the CI set and `latest.yml` hashes bytes that
are not there — auto-update breaks **silently**, nothing red in any log. This repo has
shipped that exact failure once (`scripts/update-manifest.mjs`'s own header records it).
And a stranger following `README.md:47` today sees an empty Releases page: the
first-five-minutes defect this task removes.

---

## T4 — The usage-ledger gap goes on the watch list, not on the roadmap

**Owner:** `field`.
**Files:** `docs/beta/03-install-watch-protocol.md`; one field in
`docs/beta/04-session-record-template.md` (Step 2 — read its note).
**Interfaces:** consumes the ruling §5's disposition. Produces a watched known gap, and
a recorded-absence field.
**Unblocks:** honest observation of L2's class.
**Size:** 30 minutes. A doc edit, not a build.
**Concurrent with:** everything.

- [ ] **Step 1: Add the ledger gap beside the shell-mismatch false negative**

The usage ledger rewrites every session the user did not hand-close to 0 ms — on the one
surface that shows money. The ruling **refuses to fix it now** and moves it to the watch
list: *trigger — any beta user opens the Usage view in a recorded session.* Write it in
the shape of `06-shell-mismatch-watch.md`: the mechanism, what it looks like on screen,
how to tell it from a correct zero, what to record. It is **L2's class — wrong
information, acted on** — so a user reading a cost off it and believing it is a
stop-the-line event, not a note. Say so.

*Verification:* `grep -n -i "ledger" docs/beta/03-install-watch-protocol.md` returns the
new section, naming the trigger and the L2 consequence.

- [ ] **Step 2: One recorded-absence field — an addition, flagged as one**

D1 is now authorised unconditionally, so its (a)/(b)/(c) conditions are moot as a
*decision procedure*. They remain the only way anyone will ever learn whether the
deletion was right: **falsifier 2 of the ruling §6 can still fire** — a user spends a
session in the API or Database panel and names it as the reason they would keep DevDeck.
`04-session-record-template.md` §5 has no field for that, or for its absence.

Add one line to §5: *did they open the API or Database view unprompted (y/n); did they
name either as a reason to keep it (y/n); did they ask about either at day 7 (y/n,
filled later)*. Mark it **not `[required]`** — it is filled with "n" when nothing
happened, which is the point.

**This is not in the ruling's item 8.** It is one line and it is the only remaining test
of an authorised, now-unfalsifiable deletion. If `po` judges it scope creep, drop it and
record that the D1 decision has no post-hoc test at all — but do not leave that silently
true.

*Verification:* the three y/n prompts exist in §5; the `[required]` markers are
unchanged.

**Acceptance check:** both files carry the additions; nothing was promoted to a build;
no code changed.

**What breaks if this is wrong:** a cost display that lies goes unwatched, so the first
user to read money off it is not recognised as an L2 event and the line is not stopped.
And the one surviving check on D1 is not recorded, so in December the deletion is
defended by recollection.

---

# CHECKPOINT C1 — `po`, over T1's diff (with `marketing`)

**Warranted because:** T1's whole deliverable is *the absence of a false sentence*,
which is what a criteria-owner catches and a code reviewer does not.

- [ ] `po` reads the diff (`git diff HEAD~1`), not a description of it.
- [ ] Every corrected sentence is **true today** and the step it describes **has been
      executed**. Specifically: was the Releases URL actually fetched anonymously?
- [ ] **No new false statement.** Nothing claims a granted certificate, a filed
      application, a live homepage, or a user.
- [ ] **No promissory sentence about a panel D1 deletes**, and equally **no sentence
      claiming a panel is already gone.** Both are failures; the second is the one an
      eager agent commits.
- [ ] The grep gates in T1 Steps 1, 4 and 5 are clean.
- [ ] `marketing` rules on register: the five leads describe the same product as the
      GitHub repo description; the verify tools are a second sentence.
- [ ] `npm run typecheck` → zero, run once to prove the "no `.ts` touched" claim.
- [ ] **`design-reviewer` is NOT warranted here.** `site/index.html` is a standalone
      page with no `[data-style]` and no theme matrix; the change is copy. It **is**
      warranted at C7.
- [ ] **`code-review` is NOT warranted here.** No `.ts`/`.tsx` file is touched; the only
      non-prose edit is a comment in `release.yml`. It **is** warranted at C6.

**Gate:** T3 does not start until C1 passes.

# CHECKPOINT C2 — `qa`, over the published release

**Warranted because:** this is the artefact a stranger downloads, and its failure mode —
a manifest hashing bytes that are not attached — is silent by construction.

- [ ] From a logged-out client: one published release, four assets.
- [ ] `curl` the served `latest.yml`; compare byte-for-byte with `release/latest.yml`.
- [ ] Download the served Setup, compute SHA-256, compare with `07-the-build.md`. ~115 MB.
      Do it once. It is the only way to know.
- [ ] Walk `README.md`'s "Install the released app" as a stranger would.
- [ ] `npm run verify:packaged` → 4/4, as `07-the-build.md` records.
- [ ] **Not in scope:** installing over the existing install. NSIS silent reinstall
      fails under Avast (exit 2); the documented route is copying `release/win-unpacked`
      over the install dir, and it is the owner's machine.

**Gate:** H4 sends no build until C2 passes.

---

# PHASE 2 — after the documents land

## 🔒 H3 — File with the SignPath Foundation

**Owner:** **the owner.** 🔒 A web form.
**Files:** none.
**Interfaces:** consumes a public repo (satisfied 2026-09-07) and a **published
code-signing policy**. Produces an application in a third party's queue.
**Unblocks:** users 6–10 and everyone after. **It gates nothing on this plan.**
**Size:** ten minutes.
**Concurrent with:** everything.

- [ ] **Step 1: Decide what satisfies "published policy" — and do not let T3 gate this**

The ruling puts H3 behind item 5 (Pages) because the policy lives only in
`site/index.html`, and a `blob` URL to raw HTML is not a published policy. **But T3's
mechanism is unproven and may need the owner anyway (T3 Step 2), which would put a
ten-minute 🔒 act behind an agent task that might 403.**

**Recommendation for the owner to accept or reject:** have T1 add a `## Code signing`
section to `README.md` carrying the same policy text as `site/index.html#code-signing`.
A public README section renders, has a permanent URL, and is a published policy on any
reading. Then H3 goes **today** and T3 upgrades the link later. If the owner judges the
Foundation wants a project page rather than a repo section, H3 waits for T3 — and that
is a decision, recorded, not a default.

*Verification:* the URL pasted into the form returns 200 to a logged-out client and the
policy is readable in a browser without downloading anything.

- [ ] **Step 2: File it. Do not assert the outcome anywhere.**

`site/index.html`'s `.attrib-slot` stays a marked, empty slot until a certificate
exists. The README says *applied for*, never *granted*.

*Verification:* a dated submission confirmation exists; **T5** adds the line to
`ROADMAP.md` row 4 (not this task — T5 owns that file).

**Acceptance check:** an application filed, with a date; nothing in the tree claims a
certificate.

**What breaks if this is wrong:** nothing on this milestone — which is the ruling's
point, and why it sits here rather than at the front. The cost of *not* doing it is paid
at user six.

---

## T3 — GitHub Pages, and the mechanism the ruling did not name

**Owner:** `marketing`, escalating to 🔒 the owner if the API refuses.
**Files:** a new `gh-pages` branch holding `site/`'s two files at its root;
`README.md:60`'s link upgraded to the live URL. **No file under `src/`.**
**Interfaces:** consumes T1 (a page that no longer says the repo is private). Produces a
homepage URL, consumed by `README.md` and, if the owner chose that route, by H3.
**Unblocks:** the SignPath filing's published-policy requirement, on that route.
**Size:** one hour, or one escalation.
**Concurrent with:** H1, H2, H3, T4, H4. **Sequential after T1 + C1** — it edits
`README.md`, which T1 owns, and it must not deploy a page saying the repo is private.

- [ ] **Step 1: Pick the source, and notice why the obvious two do not work**

**This is what the ruling under-specifies.** Branch-based Pages serves a branch's
**root** or its **`/docs`** folder — and `site/index.html` is in neither.

- Root of `main`: there is no root `index.html`; adding one puts a marketing page at the
  top of the repo.
- **`/docs` of `main`: this would publish `docs/beta/`, `docs/qa/`, `docs/release/` and
  `docs/superpowers/` as web pages on the project's homepage** — the recruiting message,
  the install-watch protocol, the validation criteria, the phone audit, every
  brainstorm, and this plan. They are already readable in a public repo, but serving
  them from the homepage and letting them be indexed is a different act and nobody has
  ruled on it. **Do not choose this.**
- An Actions-based Pages workflow (`upload-pages-artifact` with `path: site`) works and
  is tidiest — but it is a new workflow file, i.e. engineering before the first
  invitation, which the ruling refuses.
- **Recommended: a `gh-pages` branch holding `index.html` and `screenshot-terminal.png`
  at its root**, Pages source `gh-pages` / `/`. No workflow, no root clutter, exactly
  two files served. `site/index.html`'s only local reference is
  `src="screenshot-terminal.png"` (`:168`), so a flat copy is complete.

*Verification:* the chosen source is written down with its reason, and `/docs` was
rejected explicitly rather than by omission.

- [ ] **Step 2: Try to enable it, and expect a scope wall**

```bash
gh api -X POST repos/Midor2Mid/devdeck/pages \
  -f 'source[branch]=gh-pages' -f 'source[path]=/'
```
The token holds `gist, read:org, repo, workflow`. Step 4 already proved this token can
lack a right an operation needs (`delete_repo` never reached it after three attempts).
**If this returns 403 or 404, stop and hand it to the owner** — Settings → Pages, two
clicks — rather than inventing a workaround. That is a 🔒 escalation, not a failure.

*Verification:* `gh api repos/Midor2Mid/devdeck/pages --jq '.status,.html_url'` returns
`built` and a URL, from whichever hand pressed the button.

- [ ] **Step 3: Prove the page, then link it**

```bash
curl -sSL https://midor2mid.github.io/devdeck/ | grep -c "cockpit"
curl -sSIL -o /dev/null -w '%{http_code}\n' \
  https://midor2mid.github.io/devdeck/screenshot-terminal.png
```

*Verification:* 200 on both; the hero is T1's corrected text; `#code-signing` renders
with its attribution slot still visibly empty. **Then** update `README.md:60` to the live
URL and commit.

**Acceptance check:** a logged-out browser reaches the homepage; it contains no false
statement; the screenshot loads; `README.md` links the URL rather than a repo path;
`docs/` is **not** being served.

**What breaks if this is wrong:** the `/docs` route publishes the beta protocol and the
validation criteria on the project homepage — the recruiting materials, visible to the
people being recruited, which contaminates S2 and S4 for anyone who finds them. Or the
page deploys before T1 and the homepage of a public repo says the repo is private, which
is the defect the ruling opened with.

---

# PHASE 3 — the sessions

## 🔒 H4 — Candidate one: send, watch, record

**Owner:** `field` drafts; **a human sends and watches.** 🔒
**Files:** `NOTES.md` → Funnel + Session records.
**Interfaces:** consumes H2 (a named candidate with six intake answers), **T1** (a
delivery message with no false sentence), **T2 + C2** (a published, verified build),
**H1** (the phone card verified or knowingly not demoed), **T4** (the record fields), and
`07-the-build.md`'s hashes. Produces recorded session one.
**Unblocks:** the evidence this milestone exists to get; the answer to prediction 3 / K4.
**Size:** 30–40 minute call, plus the record **within one hour, not tomorrow**
(`03-install-watch-protocol.md` is explicit).
**Concurrent with:** nothing that touches `NOTES.md`. H1's write-up and T3 may run
alongside.
**Preconditions: H2, T1, T2 (+C2), H1, T4. NOT H3. NOT Phase 4.**

- [ ] **Step 1: Deliver** — `02-recruiting-message.md` §3 (invitation) then §4 (delivery,
      sent with the file). Both installers, **SHA-256 in a separate message**, Portable
      offered first (no install, no uninstall, one fewer thing to undo).
      *Verification:* every honest disclosure present — Windows-only, self-signed,
      SmartScreen will warn, one maintainer, watched and recorded — and no bracket
      placeholder survives.
- [ ] **Step 2: Watch** — `03-install-watch-protocol.md`. The opening script, then **stop
      talking.** The 90-second rule and only its named exceptions.
      *Verification:* every checkpoint timestamped; verbatim where they speak.
- [ ] **Step 3: Watch for the two known gaps by name** — the shell-mismatch false
      negative (`06-shell-mismatch-watch.md`; Q3 already told you if this is a
      candidate) and the usage-ledger lie (T4's entry). Both **L2 class**.
      *Verification:* the record says which of the three PATH states was on screen, and
      whether the Usage view was opened.
- [ ] **Step 4: Record** — `04-session-record-template.md`, every `[required]` field,
      what they *did* / what they *said* / what the author *thinks* in three separate
      parts, ≥ 1 dated verbatim quote, plus T4's absence field.
      *Verification:* E1 holds for this session; the funnel state is final, never left at
      `invited`.
- [ ] **Step 5: Score S1–S4 and name which predictions fired.**
      *Verification:* §5 filled, including a `fail` where it failed.
- [ ] **Step 6: Stop-the-line check before anyone else is invited.** L1–L4. **A
      stop-the-line fix is the only permitted reason to pause recruiting; "let me polish
      this first" is not — and neither is D1.**
      *Verification:* an explicit written "no L-rule fired", or a named fix, done, before
      H5 begins.

**Acceptance check:** one record with every `[required]` field and a dated verbatim
quote; S1–S4 scored; funnel state final; L1–L4 ruled on.

**What breaks if this is wrong:** an unrecorded session is not a session — the countable
unit is a record, and a quote reconstructed from memory *does not exist*. A demoed
session also destroys that person's first five minutes permanently.

---

## 🔒 H5 — Sessions two to five, then the verdict

**Owner:** `field` → `po`. 🔒 for the sessions.
**Files:** `NOTES.md`; then the milestone verdict.
**Interfaces:** consumes H4 repeated. Produces five records and the verdict — which is
what **Phase 4 is gated on**.
**Unblocks:** the milestone, and Phase 4.
**Size:** four repeats of H4 across the remaining calendar. **Deadline 2026-10-06.**
**Concurrent with:** the sourcing half only — see Step 1.

- [ ] **Step 1: Honour the cadence, and read it correctly.** Invite user *n+1* to a
      **session** only when *n*'s record is written and any stop-the-line defect is
      fixed. **The cadence governs sessions, not sourcing:** naming candidates and
      running intake for six to eight people in parallel is not a second session, and it
      is required to reach five records inside 28 days.
      *Verification:* no two sessions overlap; ≥ 2 qualified candidates in reserve at all
      times.
- [ ] **Step 2: Five records exist, E1–E5 held** — every session including abandoned ones
      recorded with a date; ≥ 3 verbatim quotes from 3 different users; one diagnostics
      paste **or** an explicit statement that nothing broke; `PRODUCT.md`'s validation
      item ticked only when E1 and E2 hold, with the quote pasted beside it; every funnel
      state final.
- [ ] **Step 3: `po` writes the verdict** — S1–S4 and E1–E5 at their bars, R1–R3
      **evaluated** and written down pass or fail, which of the four predictions fired,
      and any amendment made after the first session recorded in the verdict itself.
      *Verification:* every criterion id has an outcome. **Five sessions with R1–R3 all
      failing is a completed milestone with a negative result, and is recorded as
      completed.**
- [ ] **Step 4: Record what happened to D1's falsifiers.** D1 was authorised on
      2026-09-08 on the author's own stores, so (a)/(b)/(c) are moot as a decision
      procedure and **must not be written up as if the beta decided it.** But falsifier 2
      can still fire: if any user spent a session in the API or Database panel and named
      it as the reason they would keep DevDeck, **that is recorded as a finding against
      an already-authorised deletion**, and it is the only remaining evidence that the
      decision was wrong. Also record K1–K6.
      *Verification:* the verdict contains one paragraph headed *"D1 was decided before
      this evidence existed"* stating which way falsifier 2 went.

**Acceptance check:** five records; a verdict naming every criterion id with an outcome;
the D1 paragraph present whichever way it went.

**What breaks if this is wrong:** the milestone completes with no verdict, which is
indistinguishable from not completing. And the record silently acquires the claim that
users decided D1 — a fabrication, and exactly the failure mode the pre-registration
existed to prevent.

# CHECKPOINT C4 — `po`, the milestone verdict

Rules on whether the criteria were met, and is entitled to say *you got five sessions,
but not this*. Specifically: is every countable unit a **record** (not an install, not a
conversation); was any criterion amended after the first session without being recorded
in the verdict; and does the verdict avoid attributing D1 to the users.

**Gate:** Phase 4 does not start until C4 passes.

---

# PHASE G — owner-gated documents. Off the critical path.

## T5 — The `ROADMAP.md` restructure

**Owner:** `pm` → `docs-writer`. **Gated on the owner having accepted the ruling** — §8
says *"Do not apply until the owner has seen this ruling."*
**Files:** `ROADMAP.md` only — `:3` (Edit A), `:23–30` (Edit B), the state column plus
rows 10/11/12 (Edit C), `### The order, in wall-clock terms` (Edit D).
**Interfaces:** consumes ruling §8 verbatim plus the outcomes of T1, T2, T3, H3.
Produces a roadmap that matches the tree.
**Unblocks:** nothing. Deliberately.
**Size:** two hours.
**Concurrent with:** nothing else touches `ROADMAP.md`.

- [ ] **Step 1:** Apply Edits A–D exactly as §8 tables them. Keep *The 0.13.0 ruling
      (2026-09-04)* and *What step 4 costs, priced* as written — closed history, and a
      plan that deletes its own reasoning is how the same argument gets had twice. Append
      §8's supersession note beneath the 0.13.0 ruling.
- [ ] **Step 2:** Rewrite row 9's blocker list, row 5's Pages note, row 6's
      reclassification and row 4's SignPath line to what T1/T2/T3/H3 actually did, with
      dates.
- [ ] **Step 3:** Append §5's kill list and §6's **K6** verbatim, plus the pointer line
      to the ruling. **D1 is recorded differently from §6's text: not as a pre-registered
      criterion but as `AUTHORISED 2026-09-08 by the owner, unconditionally, on the
      empty-table result. Its (a)/(b)/(c) conditions never ran.`** Copying §6's
      conditional wording into the roadmap would leave a permanent implication that users
      decided it.
      *Verification:* `ROADMAP.md:3` no longer says "The vision is all-in-one"; K6
      appears in full with its date; the D1 row states that its conditions never ran;
      `git grep -n -i "all-in-one" -- ROADMAP.md` returns only the dated Decisions-log
      entry and the superseded citation.
- [ ] **Step 4:** Add a Decisions-log row dated 2026-09-08 for the D1 authorisation,
      including what committing costs (the founding "all-in-one" claim, ~2,200 lines, 4
      of 9 production dependencies) and what it saves (the same, forever, in every future
      release, for a user who has never existed on any machine).

**What breaks if this is wrong:** `ROADMAP.md`'s "Next" section is the first thing every
session reads. A roadmap that still orders cert-before-recruit will be executed
cert-before-recruit by the next agent that reads it, and the ruling will have changed
nothing.

---

# PHASE 4 — D1. Authorised, unconditional, and gated on C4.

**Status: AUTHORISED by the owner 2026-09-08, executed on the empty-table result, not on
beta evidence.** Gated on **C4** for the reasons in §Ruling on D1's timing — the deck
loses three of seven keys, and changing that between session one and session five makes
S1–S4 a sum over two different products.

**Inventory, measured 2026-09-08** — so the work argues from numbers:

| Item | Measured |
|---|---|
| `src/renderer/src/components/ApiPanel.tsx` | **996 lines** — the largest component in the app |
| `src/renderer/src/components/DbPanel.tsx` | **618 lines** |
| `src/renderer/src/components/WorkPanel.tsx` | **198 lines** |
| Main-process modules | `src/main/db.ts`, `src/main/http.ts`, `src/main/work.ts` |
| IPC handlers | `db:list/save/remove/test/query/tables/pickFile/disconnect` (`index.ts:912–932`), `http:send` (`:698`), `work:getConfig/saveConfig/test/items` (`:1153–1156`) — **14 channels** |
| Preload surface | `preload/index.ts:585–586` (`http`), `:614–625` (`db`), `:827–833` (`work`) |
| **Cross-seam consumers the ruling does not mention** | `src/main/mcptools.ts:35` imports `db`; `src/main/server.ts:10–11` imports `httpSend`, `allConnections`, `runQuery`, `listTables`. **5 MCP tools** (`devdeck_db_connections`, `devdeck_db_tables`, `devdeck_db_query`, the saved-request list, `devdeck_http_send`) and the remote server's routes depend on the modules being deleted |
| Production dependencies dropped | `pg`, `mysql2`, `mssql`, `node-sqlite3-wasm` — **4 of 9** |
| Deck | `DECK_VIEWS` (`ViewKeys.tsx:4–17`) loses `api`, `database` **and** `tasks` → **7 keys → 4** |
| `MainView` | `store.ts:59` — a 7-member union → 4 (or 5 if `tasks` survives off-deck) |
| Settings whitelist | `settings.ts:713` destructures 24 named keys; `:721` saves exactly those. **This is the pruning mechanism the owner forbade** |
| Tests fully in scope | `db-readonly`, `dbFileApproval`, `apiChain`, `apiTests`, `work`, `http-ssrf`, `mcpHttpBrowser` — **7 files, 79 specs, measured** |
| Tests partly touching them | `devices`, `mcpserver`, `ownership`, `redact`, `server-remote` — survey, do not delete |
| `boardTasks` consumers | `DeckStatus.tsx:21,109` and `MissionControl.tsx:74,90` via `awaitedTermIds`. **Tasks is not an isolated surface** |

## Task D1-1: `technical-director` rules on the four seams before any code moves

**Owner:** `technical-director`. **No code in this task.**
**Files:** reads `src/main/mcptools.ts`, `src/main/server.ts`, `src/main/index.ts`,
`src/renderer/src/settings.ts`, `ViewKeys.tsx`, `store.ts`. Writes a ruling into
`docs/superpowers/specs/2026-XX-XX-d1-seams.md`.
**Interfaces:** produces four decisions every later task consumes.
**Unblocks:** D1-2 … D1-6. Nothing starts before it.
**Size:** half a day.
**Concurrent with:** nothing in Phase 4.

- [ ] **Seam 1 — do the MCP tools and the remote server die with the panels?**
      `mcptools.ts` imports `db`; `server.ts` imports `httpSend` and three `db`
      functions. By the ruling's own **agent-edge test** — *every surface must either
      feed an agent or judge one* — `devdeck_db_query` **feeds an agent** and passes.
      But its store can then only be populated by a UI that no longer exists, so the
      tools would read connections nobody can create. Three coherent answers: delete the
      tools with the panels; keep `db.ts`/`http.ts` headless as agent-only surfaces and
      accept an unpopulatable store; or keep them and add no UI, marking the store
      import-only. **Rule, and give the reason.** The ruling's scope says "their IPC
      handlers and their stores" and is silent on MCP and remote — that silence is not
      an authorisation to delete them, and not an authorisation to keep them.
- [ ] **Seam 2 — where does Tasks live after leaving the deck?** `boardTasks` feeds
      `awaitedTermIds` in **both** `DeckStatus` and `MissionControl`. Demotion is not
      deletion: if `TaskBoard` becomes unreachable, Mission and the deck lose an input
      they use today. Rule on a destination (a modal? a Mission section? removal of the
      board with `boardTasks` retained as a data-only key?) or rule that Tasks is deleted
      outright and say what happens to `awaited`.
- [ ] **Seam 3 — the settings write path.** See D1-2; confirm the mechanism and the
      required shape of the fix.
- [ ] **Seam 4 — is `work.ts`'s proxy/`netproxy` interaction load-bearing elsewhere?**
      `netproxy.ts` injects an upstream proxy into every child; `work.ts` was proxy-aware
      from v0.2.0. Confirm nothing else depends on that path before removing it.

**Acceptance check:** a written ruling on all four seams, each with a reason, committed
before any deletion. **What breaks if this is wrong:** `db.ts` is deleted, the MCP server
fails to start, and no test catches it because ~99 `window.api` stubs are cast through
`unknown` and the MCP surface is only partly covered.

## Task D1-2: The settings layer must tolerate keys it no longer knows about

**Owner:** `frontend-dev`. **This task runs BEFORE any store definition is deleted.**
**Files:** modify `src/renderer/src/settings.ts` (`:713`, `:721`, `:938`); create
`tests/settingsOrphanKeys.test.ts`.
**Interfaces:** produces a save path that round-trips unknown keys. **Every later
deletion task depends on it.**
**Unblocks:** D1-3, D1-4.
**Size:** half a day.
**Concurrent with:** nothing.

**Why this task exists, precisely.** The owner ruled *orphan the keys, do not prune*.
`src/main/settings.ts` is 37 lines and schema-agnostic — `loadSettings(): unknown`,
`saveSettings(data: unknown)` writing `JSON.stringify(data)` atomically — so the main
process would preserve anything handed to it. **The renderer will not.**
`src/renderer/src/settings.ts:713` destructures an explicit 24-key whitelist out of the
store and `:721` passes exactly that whitelist to `window.api.settings.save(...)`.
Deleting `collections`, `environments`, `activeEnvId` and `dbQueryHistory` from that list
means **the next save writes a `settings.json` without them.** That is pruning by
omission, on the first save after upgrade, invisible to the typecheck and to every
existing spec. It is the single most likely way this authorisation gets violated by
accident.

- [ ] **Step 1: Write the failing test first**

`tests/settingsOrphanKeys.test.ts`, using the stubbed-`window.api` seam from
`tests/paneHold.test.ts`. Load a settings object containing a key the store does not
know (`"__retiredByD1": {"a": 1}` plus a realistic `collections` payload), trigger a
save, and assert the object handed to `window.api.settings.save` **still contains both.**

*Verification:* `npx vitest run tests/settingsOrphanKeys.test.ts` → FAIL, because the
whitelist at `:713` drops anything not named.

- [ ] **Step 2: Keep the raw loaded object's unknown keys aside on load, re-emit on save**

At `:938`'s load, retain every key of `raw` that the store does not consume into a
`retained` field; at `:721`, spread `retained` **first** so a known key always wins.
Comment the reason in the file — the next agent to add a settings key must not undo it.

*Verification:* the test passes. `npm run typecheck` → zero.

- [ ] **Step 3: Prove the round-trip does not depend on the panels still existing**

Re-run the test with `collections`/`environments`/`dbQueryHistory` removed from the
store's type, i.e. simulate the post-D1-3 state.

*Verification:* the test still passes, so D1-3 cannot break it silently.

- [ ] **Step 4: State the count and commit**

Expected: **1642 → 1643 passed** (the new file's spec, plus any it splits into — state
the exact number before running).

**Acceptance check:** a load→save round-trip preserves an unknown key, **proved by a
test, not an observation**; `npm run typecheck` zero; the stated spec count matches
exactly.

**What breaks if this is wrong:** every installed copy silently loses its saved
connections, collections and environments on the first save after upgrade. The owner
ruled specifically against that, it is unrecoverable for the user, and it would be
discovered — if at all — by someone downgrading and finding their data gone.

## Task D1-3: Delete the three panels, their IPC handlers, their preload channels and their stores

**Owner:** `frontend-dev` + `backend-dev`, **serial, one commit per panel**, because all
three land in `App.tsx`.
**Files:** delete `ApiPanel.tsx`, `DbPanel.tsx`, `WorkPanel.tsx`; modify `App.tsx`,
`store.ts` (`MainView`), `preload/index.ts` (`:585–586`, `:614–625`, `:827–833`),
`src/main/index.ts` (14 handlers), `src/renderer/src/settings.ts` (store definitions
only — **not** the retained-key path from D1-2); delete `apiChain.ts`, `apiTests.ts`,
`curl.ts`, `httpParams.ts` and `src/main/{db,http,work}.ts` **only as D1-1 ruled**.
**Interfaces:** consumes D1-1's seam ruling and D1-2's retained-key path. Produces the
deck's `MainView` shrinkage, consumed by D1-5.
**Unblocks:** D1-4, D1-5.
**Size:** one to one and a half days.

- [ ] **Step 1: Grep the bare channel names before and after.** A green suite proves
      nothing here — removing an IPC channel leaves every suite green.
      `grep -rn "db:\|http:send\|work:" src/ | wc -l` before and after; the after-count is
      stated and justified line by line.
- [ ] **Step 2: One panel per commit**, each with `npm run typecheck` → zero **and** the
      stated spec count in the message.
- [ ] **Step 3: Do not touch `%APPDATA%`.** No migration, no cleanup, no "tidy on first
      launch". The keys stay, unread. D1-2's test is the guard; re-run it after each
      commit.
- [ ] **Step 4: `run-app` after the last commit** — build first, scratch
      `userDataDir`, unique `debugPort`. Confirm the app mounts, the remaining deck keys
      work, and nothing throws on a profile that *has* orphaned keys (use the fixture
      from D1-7).

**Acceptance check:** the three components are gone; the 14 channels are gone from both
`preload` and `main`; typecheck zero; the spec count matches the number stated in
advance; `run-app` shows a mounting app; D1-2's test still passes.

**What breaks if this is wrong:** a renamed or half-removed channel leaves a renderer
call invoking a handler that no longer exists — a rejected promise in a component nobody
tests, on a build about to be handed to strangers.

## Task D1-4: Drop the four production dependencies

**Owner:** `backend-dev`.
**Files:** `package.json`, `package-lock.json`. Delete/rewrite `db-readonly.test.ts`,
`dbFileApproval.test.ts`, `apiChain.test.ts`, `apiTests.test.ts`, `work.test.ts`,
`http-ssrf.test.ts`, `mcpHttpBrowser.test.ts` **per D1-1's ruling**; survey
`devices`, `mcpserver`, `ownership`, `redact`, `server-remote` rather than trusting that
list.
**Size:** half a day.

- [ ] **Step 1: Remove `pg`, `mysql2`, `mssql`, `node-sqlite3-wasm`.** 9 production
      dependencies → 5.
- [ ] **Step 2: Delete each dying test *with* its code, and state the delta.** The seven
      in-scope files hold **79 specs, measured today.** The expected post-deletion count
      is `1641 − (specs that legitimately die)` and **that number is written into the
      commit message before the suite is run.** A count that comes out different is
      investigated, never accepted.
- [ ] **Step 3: `npm ci` from a clean `node_modules`**, then `npm run typecheck` → zero,
      then `npm test`.
- [ ] **Step 4: `npm run verify:packaged`** — the pty native module must still be
      unpacked beside the asar; dropping four drivers changes what electron-builder
      collects, and that is exactly where a packaging break hides.

**Acceptance check:** `node -e "console.log(Object.keys(require('./package.json').dependencies).length)"`
→ **5**; typecheck zero; the spec count equals the number stated in advance;
`verify:packaged` 4/4.

**What breaks if this is wrong:** a driver removed from `package.json` but still imported
somewhere builds fine (the build does not typecheck) and throws at runtime in the
packaged app, where no test runs.

## Task D1-5: Demote Tasks — the deck goes 7 keys to 4

**Owner:** `designer` first, then `frontend-dev`. **Do not let `frontend-dev` start
without the design spec.**
**Files:** `ViewKeys.tsx:4–17`, `store.ts:59` (`MainView`), `shortcuts.ts`,
`styles.css`, `App.tsx`; `TaskBoard.tsx` / `TaskRunner.tsx` / `board.ts` per D1-1 Seam 2.
**Size:** one day including the design pass.

- [ ] **Step 1: The arithmetic, corrected, is a decision and not a detail.** The
      authorisation as relayed says "7 keys → 6, `Ctrl+2` freed", which counts only the
      Tasks demotion. Removing `api` and `database` as well takes the deck **7 → 4**:
      **Mission · Terminal · Browser · Editor.** `Ctrl+1..7` collapses to `Ctrl+1..4`.
      **Whether the remaining keys renumber, or keep their current digits with gaps, is a
      decision for `designer` and the owner — do not assume it.** Renumbering breaks
      muscle memory for the one person who has used this app daily for months; keeping
      gaps leaves a deck whose digits do not match its positions. Both are defensible;
      pick one, in writing, with the reason.
- [ ] **Step 2: `designer` specifies against real tokens.** The group hairline is drawn
      from "first of the `verify` group" (`FIRST_VERIFY`), and the `verify` group after
      D1 is `Browser` + `Editor` only — so the hairline's meaning changes and may not
      survive. The responsive collapse drops labels from the `verify` group; with two
      members that behaviour needs re-deciding. `OFF_REASON` copy stays.
- [ ] **Step 3: `frontend-dev` implements**, then `run-app` at the widths `DESIGN.md`
      names, in **all six skins** (3 themes × 2 styles). No component test exists for the
      deck; `run-app` is the only proof.
- [ ] **Step 4: The `MainView` migration for a persisted `viewByProject`.** A user whose
      `viewByProject` holds `"api"` or `"database"` must land somewhere sensible, and
      `isMainView` (`store.ts:510`) already guards the shape. **Falling back is not
      pruning** — resolve the view for display; do not rewrite `workspace.json` to erase
      the old value unless D1-1 ruled otherwise.
      *Verification:* a unit test drives `resolveViewFor` with a retired view and asserts
      a valid fallback, and asserts the persisted value is untouched.

**Acceptance check:** `DECK_VIEWS` has 4 entries; `MainView` matches; the renumbering
decision is recorded with its reason; `run-app` screenshots in all six skins at the
named widths; a persisted `"database"` view resolves without erasing the stored value;
typecheck zero; spec count as stated.

**What breaks if this is wrong:** the deck is the product's one navigation object and
`Ctrl+1..7` is the muscle memory of its only daily user. Silently renumbering is a worse
outcome than either deliberate choice. And a persisted retired view that resolves to
nothing is a blank main area on launch — indistinguishable, to a user, from the app
being broken.

## Task D1-6: Strip the panel sentences from every document

**Owner:** `docs-writer` + `marketing`. **Same commit as, or immediately after, D1-3.**
**Files:** `README.md` (`:3`, `:38–42`, `:157`-area feature list, the test count at
`:133`), `PRODUCT.md` (`:3`, `:8`, `:68`), `site/index.html` (`:7`, `:146–151`, `:192`),
`docs/beta/02-recruiting-message.md` §2, `IDEAS.md`'s Work-panel moat row, `DESIGN.md` if
it names the panels, `ROADMAP.md`'s Milestone 3 / 3.5 / 15 / 16 rows (mark **DELETED
2026-XX-XX**, in the pattern Milestones 4 and 13 already use — do not delete the
history), and `CHANGELOG.md` (a new entry; never a rewrite of an old one).
**Interfaces:** consumes T1's already-repointed leads, so this is a **strip**, not a
rewrite. That is the payoff for the timing ruling.
**Size:** half a day.

- [ ] **Step 1:** Remove every descriptive sentence about the API client, the database
      panel and the Work panel. T1 already made them a second sentence rather than the
      headline, so this deletes clauses rather than restructuring paragraphs.
- [ ] **Step 2: Update the test count** wherever it is asserted (`README.md:133` and the
      four skin/count claims that Task 25 of the 2026-09-04 plan had to chase) to the
      number `npm test` actually prints after D1-4.
- [ ] **Step 3: The `CHANGELOG.md` entry says why, and says who decided.** *Authorised by
      the owner on 2026-09-08 on the empty-table result — no connection ever existed, no
      collection was ever saved, on the only machine that has ever run DevDeck.* **It
      must not say the beta showed this.**
      *Verification:*
      `git grep -n -i "API client\|database panel\|database client\|Work panel\|Postman\|DBeaver" -- README.md PRODUCT.md site/index.html docs/beta IDEAS.md DESIGN.md`
      returns only dated, explicitly-historical mentions.

**Acceptance check:** the grep above is clean of present-tense claims; the test count in
the README matches reality; the CHANGELOG entry attributes the decision to the owner and
the date, not to users.

**What breaks if this is wrong:** the README promises a stranger a database client the
app does not have — the same defect this whole plan opened by fixing, re-introduced from
the other direction. Or the changelog credits the beta with a decision the beta never
made, and that sentence outlives everyone who knows better.

## Task D1-7: The downgrade proof — a synthetic fixture profile

**Owner:** `qa`.
**Files:** a fixture profile under the scratch directory. **No tracked file.**
**Interfaces:** consumes D1-2, D1-3, D1-4, D1-5. Produces the owner's acceptance check.
**Size:** half a day.

- [ ] **Step 1: Build the fixture, because the real profile cannot serve.** The author's
      machine has **no** `connections.json`, an empty `dbQueryHistory`, `collections: []`
      and `environments: []` — that absence is the evidence D1 rests on, so it cannot
      also be the test data. Hand-write a `settings.json` with realistic `collections`,
      `environments`, `activeEnvId` and `dbQueryHistory` payloads plus a
      `connections.json`, in a scratch `userDataDir`.
      *Verification:* the fixture files exist and their SHA-256s are recorded **before**
      anything runs.
- [ ] **Step 2: Back up the real stores first**, per the standing constraint —
      `%APPDATA%/devdeck/{workspace,projects,settings}.json` — even though this test runs
      against a scratch dir. The constraint exists because `run-app` touches real state.
- [ ] **Step 3: Run the D1 build against the fixture.** Launch, open several views,
      change a setting so a save definitely occurs, quit cleanly.
      *Verification:* **the fixture's `settings.json` panel keys and `connections.json`
      are byte-identical afterwards** except for the key the deliberate change touched.
      Compare by hash against Step 1's record. This is the owner's acceptance check and
      it is the whole point of orphaning over pruning.
- [ ] **Step 4: Prove the downgrade.** Install/copy the pre-D1 0.13.0 build over the same
      fixture profile, launch, and confirm the panels find their data again.
      *Verification:* the Database view lists the fixture's connections; the API panel
      lists its collections. **If it does not, the orphaning failed and D1-3 must be
      reworked**, regardless of what any test said.
- [ ] **Step 5: Restore the real stores from Step 2's backup.**

**Acceptance check:** fixture panel data byte-identical after an upgrade run; a
downgraded build reads it back and displays it; the real `%APPDATA%` restored and
verified by hash.

**What breaks if this is wrong:** the owner's ruling is violated invisibly. Pruning is
irreversible for the user, and the only person who would notice is someone who
downgrades — by which time the data is gone.

# CHECKPOINT C5 — `technical-director`, on the seams

**Warranted because:** the diff crosses `main` / `renderer` / `preload` / `package.json`
and drops four production dependencies — the seat that can refuse a working change for
entangling the codebase. Reviews D1-1's ruling as executed: did the MCP and remote
surfaces end where the ruling said; is `settings.ts`'s retained-key path a seam or a
patch; did `boardTasks` keep its consumers.

# CHECKPOINT C6 — `code-review`, on every Phase 4 diff

**Warranted because:** ~2,200 lines of deletion across four process boundaries, and a
green suite proves nothing about a removed channel. Give it the **diff file**, not a
description. Specifically: every deleted channel gone from both sides; no orphaned import;
no `catch` swallowing a now-missing handler; D1-2's retained-key path not undone by a
later commit.

# CHECKPOINT C7 — `design-reviewer`, on the deck going 7 → 4

**Warranted because:** the deck is the product's only navigation object and this changes
its shape, its group hairline and its keyboard map. Give it the diff plus `run-app`
screenshots **in all six skins** at the widths `DESIGN.md` names. Judges: is the
renumbering decision legible; does the `verify` group still mean anything with two
members; does the responsive collapse still behave; is any state still carried by colour
alone.

# CHECKPOINT C8 — `qa`, on the built app

**Warranted because:** there are no component tests and the deletion's failure modes are
runtime. Owns D1-7, plus a `run-app` pass over the four remaining deck keys, a check that
the MCP server still starts, and `npm run verify:packaged` at 4/4.

# CHECKPOINT C9 — `po`, on the authorisation as executed

**Warranted because:** the seat that says *you built something, but not this*. Rules on:
was the authorised scope delivered (three panels, four dependencies, Tasks demoted, docs
updated); was `%APPDATA%` left alone; and **does any document now claim that users
decided D1**. That last one is a fail condition on its own.

---

# Pre-flight conflict scan

Every pair sharing a file or an interface, and the ruling.

| Pair | Shared | Ruling |
|---|---|---|
| T0 ↔ everything | the working tree | **Sequential.** Nothing dispatches until `git status --porcelain` is empty. |
| **T1 ↔ T2** | **no file.** Shared *interface*: the published-release URL and asset names | **Clean, concurrent — with one ordering rule.** T1 Step 6 is written after T2 reports `isDraft: false` and the anonymous fetch returns 200. T1's other seven steps run in parallel. Buys half a day against K6. |
| **T1 ↔ T3** | **`README.md:60`** | **Sequential: T3 after T1 + C1.** Two agents must not hold `README.md` at once. |
| T1 ↔ T5 | **`ROADMAP.md`** — ruling item 4 names `ROADMAP.md:3`, while §8 forbids applying ROADMAP edits before the owner has seen the ruling | **A conflict inside the ruling; it needed the plan changed.** Resolved by scope: T1 owns `README`/`PRODUCT`/`site`/`02-recruiting-message`; **`ROADMAP.md` is T5's alone**, owner-gated. Otherwise T1 would apply Edit A under an instruction not to. |
| T1 ↔ H2 | **`docs/beta/02-recruiting-message.md`** — T1 edits `:10` and §2; H2 *sends* §1 | **Clean, with a rule.** H2 uses **§1 only** on day one; §2 is unlocked by T1 Step 4. H2 does not edit the file. |
| **T1 ↔ D1-6** | **the same six prose files** | **Sequential and weeks apart, by the timing ruling.** T1 makes the panels a second sentence; D1-6 deletes that sentence. **Neither may write that a panel is absent while the code is present** — the failure this pair exists to prevent. |
| T1 ↔ H4 | `docs/beta/README.md` vs the delivery instruction | **Sequential — T1 before H4**, already enforced by the precondition list. `07-the-build.md` is untouched by T1, so H4's hashes are stable. |
| T1 ↔ T4 | none — different files under `docs/beta/` | **Clean, concurrent.** |
| T2 ↔ C2 | the published release | **Sequential.** Self-verification by the publishing agent is not verification. |
| T2 ↔ H4 | *interface:* the download path and the SHA-256s | **Sequential.** H4 sends nothing until C2 passes. |
| T3 ↔ H3 | *interface:* the published-policy URL | **Decoupled on purpose.** The ruling puts H3 behind T3; this plan offers the README-section route so a ten-minute 🔒 act does not queue behind an agent task that may 403. **The owner rules** (H3 Step 1). |
| T4 ↔ H4/H5 | *interface:* the new record field | **Sequential — T4 before H4.** A field added after session one leaves session one with a gap that later reads as a pass. T4 is 30 minutes. |
| **H1 ↔ T1/T2/T3/T4** | **nothing** | **Concurrent from hour zero.** Four days idle; it must not now wait behind a document edit. |
| **H2 ↔ everything** | `NOTES.md` Funnel only | **Concurrent from hour zero.** No agent task opens `NOTES.md`. |
| H1 ↔ H4 | *interface:* the phone-card verdict | **Sequential — H1 before the first build is sent.** |
| H1 ↔ any renderer work | *interface:* J1–J6, D6 | **Conflict, ruled: no work.** Only L2/L3 findings become work before the first invitation. J6 is additionally a `technical-director` call. |
| H4 ↔ H5 | `NOTES.md`, the cadence | **Strictly sequential for sessions;** sourcing runs in parallel. |
| **Phase 4 ↔ H4/H5** | **`ViewKeys.tsx`, `store.ts`, the built artefact, and the measurement itself** | **Hard gate: Phase 4 after C4.** The deck goes 7 → 4 and the build's hashes change; running it mid-beta makes S1–S4 a sum over two products and forces either two cohorts or a pause in recruiting that is not a stop-the-line fix. **This is the plan's central sequencing decision.** |
| **D1-2 ↔ D1-3/D1-4** | **`src/renderer/src/settings.ts`** | **Strictly sequential: D1-2 first.** Deleting store definitions before the retained-key path exists prunes user data on the next save. This pair is the reason D1-2 is a task and not a step. |
| D1-1 ↔ D1-3/D1-4/D1-5 | *interface:* the four seam rulings | **Sequential.** No deletion before the ruling. |
| D1-3 ↔ D1-4 ↔ D1-5 | `App.tsx`, `store.ts`, `preload/index.ts`, `package.json` | **Serial, one commit each.** All three land in `App.tsx`; two agents cannot hold it. |
| D1-5 ↔ D1-7 | *interface:* the fixture profile's persisted `viewByProject` | **Sequential — D1-5 before D1-7**, so the fallback is what gets tested. |
| D1-3 ↔ D1-6 | *interface:* code and its description | **Same commit, or D1-6 immediately after.** A gap in either direction is a document that lies. |
| T5 ↔ D1-6 | **`ROADMAP.md`** | **Sequential — T5 first.** D1-6 marks Milestones 3 / 3.5 / 15 / 16 deleted; doing that before T5's restructure means resolving the same file twice. |
| **Phase 4 ↔ everything in Tracks D/R/P** | the working tree, one build, one suite | **Fully sequential.** Nothing else runs while Phase 4 is open. |

**Two agents at once, permitted set:** `{T1, T2}`, plus any agent task alongside
`{H1, H2, H3}`. **Phase 4 permits none.** Everything else is sequential, with the reason
in the row above.

---

# Departures from the ruling, and what it under-specifies

Stated plainly rather than deferred to, because a plan that only agrees is not a plan.

1. **T1 and T2 run concurrently, not 10-then-11.** The ruling says *"Nothing else goes
   out before this."* That is right about the *documents a stranger reads first* and does
   not apply to the release body — I checked: `docs/release/0.13.0-notes.md` carries none
   of the false claims. The files are disjoint; the one true dependency is
   `README.md:47`, handled as an ordering rule inside T1 rather than by serialising two
   half-day tasks. **Cost of my being wrong:** T2 publishes, T1 stalls, and the repo has
   a real download plus four stale sentences for a few hours — strictly better than
   today, which is four stale sentences and no download.

2. **Item 9's preconditions apply to *sending the build*, not to *contacting anyone* —
   and this is the most consequential thing here.** The handoff lists item 9's
   preconditions as 1, 2, 3, 6, and **K6 fires on "no candidate contacted by
   2026-09-22."** But `02-recruiting-message.md` is a **nine-stage** sequence: §1 a DM
   line, §3 the invitation once they have said yes, §4 delivery with the file. **§1 needs
   nothing** — no document fix, no published release, no phone sitting — and
   `01-who-to-approach.md` asks the six intake questions *in the invitation thread,
   before the build is sent*. As handed off, the plan reads as though K6 cannot be
   satisfied for another day or two; in fact the act that satisfies it is available in
   the next hour. Hence **H2 is Phase 1, not Phase 3.**

3. **The stale-document list is incomplete, and one omission is load-bearing.** The
   ruling names four files. Four more assert the same dead facts:
   `docs/beta/README.md:45` and `:50` (two of three "prerequisites that are not app
   source" are false in every clause), `PRODUCT.md:68`, and
   `.github/workflows/release.yml:175`. The load-bearing one is
   **`02-recruiting-message.md` §2**, which pitches *"an editor, an API client and a
   database panel"* — the framing the ruling ordered demoted and D1 now deletes — **to
   the exact five people whose ability to say what DevDeck is for is criterion S4.** Item
   4 lists `README`, `PRODUCT`, `ROADMAP` and the site hero, and omits the one document a
   candidate reads.

4. **Item 5 (Pages) has no working mechanism as written, and the obvious one is
   harmful.** Branch Pages serves a branch's root or `/docs`; `site/` is neither.
   Choosing `/docs` would put `docs/beta/`, `docs/qa/` and `docs/superpowers/` on the
   project homepage — the recruiting message, the install-watch protocol and the
   validation criteria, servable and indexable, to the people being recruited. An Actions
   workflow works but is a new workflow file, i.e. the fifth piece of pre-beta
   engineering the ruling refuses. **Recommended: a `gh-pages` branch with the two files
   at its root.** And the token holds only `gist, read:org, repo, workflow`, with step 4's
   `delete_repo` as precedent, so T3 may escalate to 🔒.

5. **The SignPath filing is sequenced behind an agent task and should not be.** The
   handoff says item 7 *"gates nothing else on this list"* and then makes it depend on
   item 5's published policy. A ten-minute 🔒 owner act waiting on an agent task with an
   unproven mechanism is the exact inversion §3 spent its length arguing against. T1 can
   publish the policy as a README section today; H3 goes today. **The owner should rule
   on whether that satisfies the Foundation** — I assert only that the question is worth
   ten minutes rather than a week.

6. **Item 6 will produce a decision queue and the handoff does not say what happens to
   it.** `phone-approval-verification.md` §3 carries six unresolved judgement calls plus
   the unfixed **D6** — one a WCAG 1.4.4 failure, one explicitly a `technical-director`
   call. Six good recommendations landing on day two, in front of an owner who has not
   contacted anyone, is the most plausible mechanism by which K6 fires, and each would
   arrive as *a correct, well-argued, necessary* change. H1 Step 4 forces each into one
   of three words.

7. **`latest.yml` does not need regenerating.** The handoff says *"regenerate
   `latest.yml`"*; the check already passes against the on-disk signed set. `--rewrite`
   has never run against a real signing service and would rewrite a correct manifest.
   Related: there are **four** assets, not five — no Portable blockmap exists, because
   electron-builder writes one only for the NSIS Setup.

8. **D1's stated deck arithmetic is wrong, and by more than a key.** The authorisation
   says "7 keys → 6, `Ctrl+2` freed", which counts only the Tasks demotion. Removing
   `api` and `database` as well takes the deck **7 → 4** — Mission · Terminal · Browser ·
   Editor — and collapses `Ctrl+1..7` to `Ctrl+1..4`. That is a far larger interface
   change than relayed, it changes what `design-reviewer` is judging, and it is why
   D1-5 has a `designer` pass in front of it.

9. **D1's scope is silent on the MCP tools and the remote server, and they are real
   consumers.** `mcptools.ts:35` imports `db`; `server.ts:10–11` imports `httpSend`,
   `allConnections`, `runQuery`, `listTables`. Five MCP tools and the remote routes hang
   off the modules being deleted. By the ruling's **own agent-edge test**,
   `devdeck_db_query` *feeds an agent* and therefore **passes** — so this is not a
   mechanical follow-on deletion, it is a decision, and D1-1 Seam 1 makes
   `technical-director` take it rather than letting a deleting agent take it by accident.

10. **Tasks is not an isolated surface, so "demote" needs a destination.** `boardTasks`
    feeds `awaitedTermIds` in **both** `DeckStatus.tsx` and `MissionControl.tsx`. If
    demotion makes `TaskBoard` unreachable, Mission and the deck lose an input they use
    today. D1-1 Seam 2 rules on it.

11. **The orphan-keys ruling is violated by the code as it stands, and silently.**
    `src/renderer/src/settings.ts:713` destructures a 24-key whitelist and `:721` saves
    exactly that. Removing the panels' keys from the whitelist prunes them from
    `settings.json` on the very next save — invisible to the typecheck and to all 1,641
    specs. `src/main/settings.ts` is only 37 lines and schema-agnostic, so the main
    process is not the risk; the renderer is. **This is why D1-2 is a task with its own
    failing test and runs before any store definition is deleted.**

12. **D1 losing its falsifiers is a real cost and is recorded, not smoothed.** Executing
    on the empty-table result means falsifier 1 and falsifier 2's withdrawal clause can
    never fire. `po` at C9 fails the work if any document implies users decided it, and
    H5 Step 4 records which way the one surviving falsifier went.

---

# Critical path to 2026-10-06

**The critical path is not agent work, and no agent task is on it after day one.**

```
day 0    H2  name >=6 candidates, send the DM   (K6 satisfied)   <-- must happen today
day 0    T0 -> {T1, T2} concurrent; H1 in parallel; T4 in parallel
day 1    C1 (po) + C2 (qa) -> T1 Step 6 closes -> T3, H3
day 1-4  candidate replies + intake     (external latency; nobody here compresses it)
day 2-5  H4  session one -> record within the hour -> L1-L4 check
         ...four repeats, one at a time, each gated on the previous record
by 10-06 H5 Step 3-4: po's verdict; which predictions fired; D1's falsifier recorded
--- gate C4 ---
after    PHASE 4  D1-1 .. D1-7 + C5..C9  (2-3 days of work, four checkpoints)
```

**The binding constraint is the one-at-a-time session cadence, not the work.** 28 days
for five sequential sessions is ~5.5 days each including scheduling, the call, the
write-up within the hour, and any stop-the-line fix. Feasible **only if sourcing runs
ahead of sessions** — hence H2 naming six to eight on day one and holding two qualified
candidates in reserve. One stop-the-line defect costs the better part of a week; two puts
2026-10-06 out of reach, and the honest response then is four records and a partial
verdict, not a relaxed criterion.

**D1 is not on this path and must not be allowed onto it.** It is authorised, it is
2–3 days plus four checkpoints, and it is the most legitimate-looking way to spend the
fortnight in which K6 fires.

---

# Self-review

**Handoff coverage:** ruling §7 item 1 → T1 Steps 1, 2, 6. Item 2 → T1 Steps 1, 3, 5, 7.
Item 3 → T2. Item 4 → T1 Step 4 + D1-6 (`ROADMAP.md:3` moved to T5, reason given).
Item 5 → T3. Item 6 → H1. Item 7 → H3. Item 8 → T4. Item 9 → H2 + H4 (split, reason
given). Item 10 → H5. §8 → T5. **D1 (authorised) → Phase 4, all six numbered scope items:
panels/IPC/preload/stores → D1-3; dependencies → D1-4; Tasks demotion → D1-5; tests →
D1-4 Step 2; documents → D1-6 (merged with items 4 and 12); `%APPDATA%` → D1-2 + D1-7.**

**Review checkpoints, and where each is deliberately absent:** `po` at C1 (T1's
deliverable is the absence of a false sentence) and C4 + C9. `qa` at C2 and C8.
`technical-director` at C5. `code-review` at C6. `design-reviewer` at C7.
**`code-review` and `design-reviewer` are warranted nowhere in Phases 0–3** — no
`.ts`/`.tsx` file is touched and `site/index.html` has no theme matrix — and both are
warranted throughout Phase 4. Adding either to a prose task would be ceremony, and this
plan does not add ceremony.

**Known gaps, deliberate:**
- H1's four CDP-blind observations carry no scripted assertions, because the reason they
  are in a human sitting is that no harness can make them.
- H3 Step 1 leaves a decision open (does a README section satisfy the Foundation). It is
  the owner's, it takes ten minutes, and defaulting it either way costs more than asking.
- T3 Step 1 recommends a source without picking it, because the `/docs` route has a
  consequence — serving the beta protocol from the homepage — that nobody has ruled on.
- D1-1's four seam rulings are specified as questions, not answers. Two of them (the MCP
  surface, and where Tasks lives) are genuinely `technical-director`'s to take, and a
  plan that pre-decides them would be a plan deciding scope.
- D1-5's renumbering choice is left to `designer` and the owner, deliberately. Both
  options are defensible; assuming one is not.

**One thing this plan cannot verify and says so:** whether five gate-qualified candidates
exist and will reply. K1 is pre-registered for exactly that — fewer than 5 of 15 who
genuinely meet the gate accepting. No amount of sequencing touches it.
