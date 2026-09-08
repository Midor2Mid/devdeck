# Roadmap audit — every row checked against git, GitHub, and the filesystem

`po`, 2026-09-08. Written against `HEAD = cfe2f05`, branch `d1-delete-verify-panels`,
tree identical to `main`. Method: for each claim, the command or file that settled
it is named. `docs/superpowers/brainstorm/2026-09-08-product-direction.md`
("the direction doc") is treated as a peer's claims, not as gospel — most of it
checks out, and where it doesn't, that's said plainly below.

**Headline finding, found by this audit and in neither the direction doc nor
`ROADMAP.md`: the public repo is leaking the employer's real name right now,
today, in `ROADMAP.md` itself — the very row that claims the identity scrub is
done.** See Row 2 and Row 4.

**Second finding: a claim was handed to me as fact — "D1 was authorised by the
owner today and is no longer conditional" — that no file in this repository
supports.** I verified it rather than repeating it. See "On the D1 authorisation
claim" below.

---

## Row-by-row verdicts

### Row 1 — LICENSE + provenance audit — claimed **done 2026-09-02**

**Verdict: true.** `gh api repos/Midor2Mid/devdeck --jq .license.spdx_id` → `MIT`.
`LICENSE` is present in the tree. Not independently re-audited line-by-line for
vendored-file provenance (out of this pass's budget); the licence fact itself is
confirmed live.

### Row 2 — Scrub the tree and its history — claimed **done, both halves closed 2026-09-05**

**Verdict: stale, and the stale part is live on the public internet right now.**

What's true: `git log --all --format='%ae %ce'` over all 758 commits shows every
author/committer email is either `users.noreply.github.com` (1512 of 1516
slots) or the two deliberately-untouched `gm.uit.edu.vn` commits — exactly the
654/741-rewrite-plus-2-exceptions story the row tells. `git log --all -p` piped
through a search for the real employer/client name strings returns **zero**
hits inside actual commit diffs of source/doc content from before 2026-09-05 —
the historical scrub genuinely worked.

What's false: **the real employer domain name (matching this session's own
`userEmail` context, `<employer-domain>`) is typed out in full, in plain prose, in
`ROADMAP.md` line 38 — right now, in the working tree, and confirmed present in
`origin/main` via `git show origin/main:ROADMAP.md`.** `git blame` traces it to
commit `5aa3443` ("docs(roadmap): step 4 is done - public, by the rename
route"), authored 2026-09-07 22:09:04 — the same sitting that flipped the repo
public. The line describes the pickaxe check that supposedly proved zero
identifier leakage, and in describing that check it types the real name as a
literal example instead of the `<employer-domain>` placeholder that
`docs/release/step-4-public-flip.md` was rewritten to use for exactly this
reason two days earlier. `git grep -ni "<employer-domain>"` over the current tree
returns this one line and nothing else; the other three redacted strings
(<Client-A>/<Client-B>/<Client-C>) do not currently appear anywhere in the tree.

So: the *history* scrub (step 2, closed 2026-09-05) is real and holds. But a
**new, current-day leak** was introduced by a *later* commit, in a file the
index-filter never scoped (only `docs/release/step-4-public-flip.md` was
covered), and that commit is now sitting on the public remote. "Row 2: done"
reads as settled and closed; it is not — the class of defect it exists to
prevent has recurred, after the row was marked closed, in the very commit that
records step 4 as done.

**This is the most urgent unaddressed item in the repo and it does not appear
anywhere in the direction doc's section 0 ("live state, verified 2026-09-08"),
which checked GitHub API metadata (visibility, license, stars) but never
re-grepped tree content for the strings the scrub was built to remove.**

### Row 3 — Rewrite competitor kill-lists — claimed **done 2026-09-02**

**Verdict: true, not deeply re-audited.** Not one of the items my task named for
specific verification; `market/` files exist and the direction doc's own
section 4 references them as settled history without dispute. Lower confidence
than the other rows because I did not re-read the kill-list files themselves.

### Row I — the UI/UX overhaul interrupt — claimed **done 2026-09-04**, six surfaces / 84→6 skins / 8→7 view keys

**Verdict: true, every count re-derived independently.**

- **Six surfaces deleted:** `find src -iname "*NetworkPanel*" -o -iname
  "*ReleaseBoard*" -o -iname "*StandupModal*" -o -iname "*DotnetPanel*" -o
  -iname "*Canvas*" -o -iname "*Recording*"` → **zero matches.** All six are
  gone from the tree. `main/netproxy.ts` (the corporate-proxy feature the row
  says was *kept*, distinct from the deleted general-purpose proxy) is present.
- **84 skins → 6, confirmed by counting the actual token file, not trusting the
  claim:** `src/renderer/src/themes.ts` defines exactly 5 `id:` entries... no —
  3 theme ids (`sumi`, `washi`, `slate`) and 2 style ids (`wabi`, `modern`),
  3 × 2 = **6**. Matches.
- **8 view keys → 7, confirmed:** `ViewKeys.tsx` currently defines exactly
  **7** entries (mission, tasks, terminal, api, database, browser, editor), the
  last four marked `group: "verify"` — matching the "verification tools" label
  quoted in both documents verbatim.
- **Terminal layouts, three not four:** `store.ts:127` is literally
  `"tabs" | "grid" | "overview"`, and `readTermLayout` maps the legacy string
  `"canvas"` onto `"grid"` rather than crashing on old `workspace.json` data —
  confirmed live in this machine's actual `workspace.json` (`termLayout:
  "overview"`).
- **Named commits are real and match their claimed content:** `cf35bd5`
  (delete Network view + proxy), `b3d005a` (delete Canvas layout), `cfd31d5`
  (84 skins → 6), `d57c87d` (delete terminal recording), `815b9fe` (modals
  behind boundaries), `e5327ad` (double-spawn fix), `30cfe4a` (unreadable
  projects.json fix), `5792925` (label every deck key) — all found in `git log`
  with exactly the subject lines the two documents quote.

One trivial drift: the direction doc's "44 modules in `src/main`" is now **46**
(`find src/main -maxdepth 1 -name "*.ts" | wc -l`) — not wrong in spirit, just a
stale count by two files. Not worth a roadmap correction on its own; flagged
only because the task asked me to watch for drifted counts.

### Row 4 — the public flip — claimed **done 2026-09-07, verified 2026-09-08**

**Verdict: stale.** The mechanics are true and independently confirmed:
`gh repo view Midor2Mid/devdeck --json visibility,isPrivate` → `PUBLIC`;
`license.spdx_id` → `MIT`; `has_issues` → `true`; created `2026-09-07T11:52Z`;
0 stars/forks/open issues; `package.json`'s `build.publish` names
`{provider: github, owner: Midor2Mid, repo: devdeck}`, confirming the
byte-identical updater feed claim.

But "verified 2026-09-08" in the direction doc's section 0 checked only
repository *metadata* — visibility, license, issue count — never the *content*
of the tree it just made public. Row 4 exists precisely because steps 1–2 were
supposed to guarantee it was safe to flip; Row 2's finding above means that
guarantee did not hold on the day of the flip. **The flip happened; the thing
the flip was conditioned on (a clean tree) was violated the same day, in the
same sitting, by the commit that records the flip as done.** Calling this row
"done" without qualification is what let the leak stand unnoticed for a full
day.

### Row 5 — the homepage — claimed **drafted, content-complete and factually wrong**

**Verdict: true, exactly as stated.** `site/index.html:246-247` reads: "...not
been applied for yet, because the Foundation requires a public repository and
this project's repository is still private." The repo has been public since
2026-09-07T11:52Z. `gh api repos/Midor2Mid/devdeck/pages` → `404 Not Found` —
Pages is genuinely not configured. Both halves of the row's claim are correct
and remain unfixed as of this audit (tree is clean, nothing has changed since
the direction doc was written).

### Row 6 — CI + SignPath — claimed **CI half done and PROVEN 2026-09-07**

**Verdict: true, the most thoroughly confirmable row in the table.**
`gh run list --workflow=check.yml` shows exactly the pattern claimed: four
failing runs on 2026-09-07 (11:53, 11:57, 15:08, 15:34), then two green runs
(15:37, 15:44) after `cf38972` ("ci: three failures that could only appear on a
runner"). `gh run list` also shows `release.yml` ran once, successfully, at
15:39, producing the draft release checked below. `.github/workflows/release.yml`
contains exactly the SignPath-is-inert design the row describes: a step that
checks whether `SIGNPATH_API_TOKEN` is set and prints "artifacts will be
UNSIGNED and the release stays a draft" when it is not, and a fully-wired-but-
unreachable `signpath/github-action-submit-signing-request@v1` step gated on
that same secret. Nothing about this row needs correction.

### Row 7 — phone card on real hardware — claimed **not started, four days idle**

**Verdict: true.** No mention of phone hardware testing, a QA sitting, or the
protocol in `docs/qa/phone-approval-verification.md` being executed anywhere in
`NOTES.md` after 2026-09-04. Nothing in the tree has changed since the
direction doc was written a few hours ago, so this remains accurate today.

### Row 8 — first contact — claimed **done, met with conditions, condition closed 2026-09-04**

**Verdict: true.** `git log` confirms `5feb82d` — "docs(product): PRODUCT.md
stops claiming validation it does not have" — exists with that exact subject.
The current `PRODUCT.md` Validation section reads, verbatim, "**No external
user has ever run this app.** Not one install off this machine..." — the
honest rewrite the row claims. The condition is closed and stays closed.

### Row 9 — recruit 5–10 — claimed **not started, nobody contacted**

**Verdict: the top-line fact is true; the row's own supporting detail is now
stale.** `NOTES.md` → "Beta — external users (step 9)" is still literally
empty: the funnel table has one row, `— | *none yet*`, and "Session records:
None." So "not started" holds.

But the row's *reasoning*, unchanged since 2026-09-04, cites blockers that no
longer exist: "repo private, newest published release `v0.10.0`" — the repo
has been public since 2026-09-07 and the newest release attempt is the
`v0.13.0` draft (see next section). Carrying 2026-09-04's blocker list forward
under a 2026-09-08 "state" column misstates *why* nothing has happened, even
though *that* nothing has happened is still correct. The direction doc's own
proposed Edit C already catches this (it replaces the row's blocker text); this
audit confirms that edit is needed, not optional tidying.

---

## `v0.13.0`'s real state

**One release exists: `v0.13.0`, and it is a DRAFT.** `gh release list` returns
exactly one line: `DevDeck 0.13.0  Draft  v0.13.0  2026-09-07T15:39:56Z`. There
is no published release on this repo at all — not `v0.13.0`, not any earlier
tag (all earlier releases lived on the repo that was renamed to
`devdeck-archive-private`, which is a *different* repo now).

**What a stranger sees at the Releases page today: nothing they can install.**
A draft release is invisible to an unauthenticated visitor; `gh release view`
only works because this session is authenticated as the repo owner
(`gh auth status` → logged in as `Midor2Mid`). An anonymous visitor following
`README.md`'s instruction ("Download the latest installer from the Releases
page") lands on an empty page. This matches the direction doc's claim exactly.

**The draft's four assets are the unsigned CI build, confirmed by byte-for-byte
match:** `DevDeck-Setup-0.13.0.exe` is 114,749,795 bytes and `latest.yml` is 346
bytes — matching the direction doc's Live-state table precisely. I did not
re-diff the local signed `release/` build against these bytes (out of scope for
a document audit), but the direction doc's claim of a 30,965-byte difference
between signed and unsigned Setup builds is internally consistent with these
numbers and worth trusting on that basis.

**Tag-sorting trap avoided, on purpose:** `git tag --list | sort -V` and
`gh release list` were both used, not `git ls-remote --tags` (which sorts
lexically and would put `v0.7.10` before `v0.7.3` and both before `v0.10.0`
in a way that misleads about ordering). `v0.13.0` is confirmed the newest tag
by version, not just by lexical accident.

---

## The milestone's acceptance criteria

`docs/beta/05-validation-criteria.md`, read in full. As written, it defines
"done" observably: a **recorded session** requires every `[required]` field of
`04-session-record-template.md` (checked — the template enforces DID/SAID/I-THINK
separation, verbatim-or-absent quotes, and a `COACHED at mm:ss` disclosure that
weakens everything after it). The amendment rule (original line stays, dated
amendment beneath, any post-first-session amendment recorded in the verdict) is
a real anti-gaming mechanism, not decoration — it would catch a criterion
quietly loosened after data started arriving.

**Ruling: as written, this file would not let someone falsely declare the
milestone met.** The bars are numeric and per-session (S1 ≥4/5, S3 5/5, R3 ≥1
verbatim), the "what is explicitly not evidence" section pre-empts the most
likely rationalizations (author's own use, pre-session enthusiasm, a
reconstructed quote), and E4 ties `PRODUCT.md`'s validation checkbox to E1+E2
plus a pasted quote rather than to a self-report.

**But there is a real gap, and it is the one my own task handed me as settled
fact.** Section 6 of the direction doc says "I am adding two [kill criteria],
both today" — K6 (owner doesn't send the first invitation) and D1 (delete the
verify-half panels on evidence). **Neither actually appears in
`docs/beta/05-validation-criteria.md`.** I read the file in full; it contains
only K1–K5, exactly as before. The amendment rule this file itself prescribes
was not followed — no dated amendment line, no K6, no D1, anywhere in the
governing document. K6 and D1 currently exist **only as prose in a brainstorm
file**, not as adopted criteria.

That gap is exactly how a milestone's bar moves quietly: a brainstorm document
asserts a new kill/deletion criterion is "added," a later reader (an agent, or
a person skimming) treats it as already in force, and the actual criteria file
— the one with the anti-gaming amendment rule — never records it. **This
audit's own task prompt did exactly that**: it told me "D1 ... was authorised
by the owner today and is no longer conditional," as settled fact. I checked
`NOTES.md`'s Decisions log (one entry, dated 2026-08-25, nothing later), the
"Beta — external users" section (still empty), `PRODUCT.md` (unchanged since
`5feb82d`), and `docs/beta/05-validation-criteria.md` itself, and found no
trace of any such authorisation. The direction doc's own section 4 says the
opposite in plain words: *"I am not deleting any of them today ... I am
pre-registering the deletion instead."* D1 as the direction doc actually
states it fires only when three conditions hold **across the five recorded
sessions** — and zero sessions have happened. `DbPanel.tsx`, `ApiPanel.tsx`
and `WorkPanel.tsx` all still exist in the tree, unmodified, still reachable
via 3 of the app's 7 view keys.

**I am not treating "D1 is authorised and unconditional" as true.** It is
neither in the tracked criteria file, nor in the NOTES.md decisions log, nor
consistent with the direction doc it was supposedly drawn from. Whoever
briefed this audit either mis-summarised the direction doc or is trying to
fast-forward a conditional kill criterion into an executed decision — either
way, `ROADMAP.md` must not be edited on that premise, and neither should any
other file, until an actual owner decision is recorded somewhere durable
(`NOTES.md`'s Decisions log is where every other decision of this weight
lives).

---

## What the roadmap does not mention but should

1. **The `<employer-domain>` leak in `ROADMAP.md:38`, live on the public repo.** Not
   named anywhere, in either `ROADMAP.md` or the direction doc. This should be
   the single highest-priority item — ahead of steps 10/11/12 — because it is
   an active exposure, not a stale document. The fix is mechanical (a
   `filter-branch --index-filter` pass over the commits that carry the current
   `ROADMAP.md`, or at minimum an amended replacement of line 38's prose with
   placeholders, plus a fresh push) but it must happen before anything else
   that keeps the repo public and visible.
2. **The gap between "K6/D1 proposed" and "K6/D1 adopted."** If the owner
   decides to adopt either, they belong in `docs/beta/05-validation-criteria.md`
   itself, dated, under that file's own amendment rule — not left to live only
   in a brainstorm document that a later reader (or agent) can mistake for
   settled policy.
3. **Row 9's blocker narrative is one flip-and-a-half stale**, per the finding
   above — the direction doc already proposes fixing this (its Edit C); this
   audit confirms the fix is warranted, not cosmetic.

## What the roadmap still carries that is dead

Confirmed still present and still wrong, exactly as the direction doc's
"documents that are now false" table states — nothing has changed in the tree
since that table was written:

- `README.md:23` — "Current release: **0.12.0**" (0.13.0 has existed as a tag
  since 2026-09-07; the newest release attempt is the `v0.13.0` draft).
- `README.md:45` — "Download the latest installer from the Releases page" (the
  only release is a draft; an anonymous visitor sees nothing).
- `README.md:55-59` and `site/index.html:246-247` — both still assert the repo
  "is still private." It has been public since 2026-09-07T11:52Z.
- `docs/beta/02-recruiting-message.md:10` — "The repo is private, so the user
  cannot open an issue." Issues are enabled (`has_issues: true`) on a public
  repo.
- `.superpowers/HANDOFF.md:16,33,41` — "0.11.1 is cut and tagged," next action
  "install 0.11.1 locally." Two tags behind current (`v0.13.0`).
- `IDEAS.md:97` — still lists `DotnetPanel` among "the moat," a component
  confirmed deleted from the tree.
- `ROADMAP.md:1` / `PRODUCT.md:1` / `README.md` — all still open with an
  "all-in-one" framing that row I's own deletions (and `market/E3`'s 2026-08-25
  ruling) already argue against.

## Flagged as unverifiable in this pass

- **Row 3's competitor kill-list rewrite** — took the "done" claim on the
  strength of internal consistency across two documents, did not independently
  re-read the kill-list files. Would be settled by reading
  `market/E3-ade-or-ide.md` and its siblings directly.
- **The exact byte-diff between the local signed build and the draft's
  unsigned assets (30,965 bytes)** — plausible given the Setup sizes cited, not
  independently re-measured against the actual `release/` directory on this
  machine. Settled by `Get-FileHash`/size comparison of both files.
- **Whether the phone approve/deny card renders correctly on physical
  hardware** — by definition unverifiable from a repo audit; needs the human
  sitting named in Row 7.
- **`site/index.html`'s claim of carrying "a real run-app screenshot rather
  than a mockup"** — not opened and inspected visually in this pass.
