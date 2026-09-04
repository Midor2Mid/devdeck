# What counts as validated — written 2026-09-04, before any user existed

Fixed in advance so the result cannot be rationalised afterwards. If these
criteria are only readable *after* the sessions, they are not criteria; they are
a description of whatever happened.

**The amendment rule.** A criterion may be amended, but only like this: the
original line stays, the amendment is added underneath with today's date and the
reason, and **any amendment made after the first session is recorded in the
milestone verdict itself**. A criterion silently rewritten to fit the data
invalidates the claim it was supposed to support.

---

## Definitions — so nobody counts the wrong thing

| Term | Means |
|---|---|
| **User** | A person who is not the author, who installed the app on their own machine. The author is never counted. Nor is anyone who only watched. |
| **Recorded session** | A first session with a record in `NOTES.md` carrying every **[required]** field of `04-session-record-template.md`, including at least one verbatim quote with a date. |
| **Uncoached** | The author said nothing beyond the opening script and the three permitted questions. One region hint makes the rest of the session coached, and the record says so. |
| **Reopened** | They launched DevDeck again, on their own, without being asked or reminded. A launch prompted by the day-7 message does not count. |
| **Funnel state** | invited · installed · used (a recorded session exists) · silent (installed, no reply, no evidence of reuse) · gone (uninstalled or explicitly out). |

## The milestone bar

**Five recorded sessions, up to ten.** Not five installs, not five conversations,
not ten invitations. The countable unit is a recorded session, because the
milestone's deliverable is other people's words.

---

## Success criteria

### Per-session bars — the first five

Judged per session, tallied across the first five. Each has a pass rule set now.

| id | Criterion | Bar | Why this bar |
|---|---|---|---|
| **S1** | **Installed unaided.** They got from file to running window past SmartScreen with no help beyond what was in the delivery message. | **≥ 4 of 5** | This is the wall a stranger meets before forming any opinion. Anything below 4 makes the certificate (roadmap 4 + 6) the top of the roadmap, ahead of every feature. |
| **S2** | **Reached a running agent session inside 5 minutes of first launch, uncoached.** A running plain shell counts only for a user with no agent CLI installed, and that is recorded as a different result. | **≥ 4 of 5** | The path is two clicks with the current empty states. Four minutes of the five are slack for reading. If this fails, the first-contact work did not land and the interface is the problem — not the recruiting. |
| **S3** | **No unrecoverable stop.** The session never ends with the app in a state the user cannot get out of themselves. | **5 of 5** | A confirmed hard-freeze of exactly this shape (a missing project folder) was fixed on `main` after the audits. One recurrence spends a user and blocks the next invitation. |
| **S4** | **They can say what DevDeck is for, in their own words, unprompted at the close**, and the answer is recognisably about a project as the unit of context or about supervising agents across projects. | **≥ 3 of 5** | Tests whether the product explains itself. An answer like "a terminal with tabs" is a fail, recorded verbatim, and it means the identity claim is not legible. |

### Retention criteria — the only signal that is not about the first five minutes

| id | Criterion | Bar |
|---|---|---|
| **R1** | Reopened DevDeck unprompted within 7 days | **≥ 3 of 5** |
| **R2** | Used it on ≥ 3 separate days within 14 days | **≥ 2 of 5** |
| **R3** | At least one user says, unprompted and verbatim, that they used DevDeck instead of what they used before | **≥ 1** |

R3 is the single sentence this whole milestone exists to obtain, and it cannot be
manufactured by asking for it. If it has to be prompted, it did not happen.

### Evidence criteria — what makes the deliverable real

| id | Criterion |
|---|---|
| **E1** | Every session, including abandoned ones, has a record in `NOTES.md` with a date. |
| **E2** | At least **three verbatim quotes from three different non-author users** exist in `NOTES.md`. |
| **E3** | At least one diagnostics record pasted by a user, **or** a recorded statement that nothing broke in any session — which would itself be a notable result and must be stated, not implied by absence. |
| **E4** | `PRODUCT.md`'s open validation item ("Anybody else has run it") is ticked **only** when E1 and E2 hold, and the quote that ticks it is pasted next to it. |
| **E5** | Every funnel state is final: no user left as `invited` with no outcome recorded. Silence is written down as silence. |

**The milestone is met when:** five recorded sessions exist, S1–S4 hold at their
bars, E1–E5 hold, and R1–R3 have been *evaluated* (met or not) with the result
written down. The retention bars are a verdict on the product, not a gate on the
milestone: five sessions with R1–R3 all failing is a **completed** milestone with
a **negative** result, and that is a legitimate and useful outcome.

---

## Stop the line

Recruiting is one at a time so that a defect is found once, not five times.
**Stop, fix, then invite the next person** when any of these fires:

- **L1** — Two users stop at the same place. (The second one is confirmation; a
  third is waste.)
- **L2** — Any user is given **wrong information** by the app and acts on it.
  One instance is enough: this class is the fastest way to lose a stranger's
  trust, and DevDeck has one known such gap (`06-shell-mismatch-watch.md`).
- **L3** — Any unrecoverable stop, data loss, or a crash that takes work with it.
  One instance.
- **L4** — Any user abandons the install at SmartScreen. One instance: it means
  the delivery message, not the app, is the next thing to change — and if the
  second user does the same, the certificate becomes the milestone.

Fixing a stop-the-line defect is the only permitted reason to pause recruiting.
"Let me polish this first" is not.

## Failure criteria — the product is wrong, not broken

These do not stop the line; they change what gets built, and they are recorded as
verdicts against the milestone.

- **F1** — S2 fails (3 or more of 5 need coaching to reach a running agent). The
  first-run work is insufficient. Next work is first contact again, not features.
- **F2** — S4 fails (3 or more of 5 cannot say what it is for). The identity is
  not legible in the interface, and no feature fixes that.
- **F3** — Every user reaches a running agent easily and none of them comes back.
  The app is usable and the *problem* is unproven. This is the most likely
  failure and the easiest to explain away; it is written here so it cannot be.

## Kill criteria — what would mean DevDeck should stop

Each of these is real, and each is capable of firing on the evidence the beta
produces. Firing one means **stop investing in DevDeck as a product** — the app
can go on being the author's personal instrument, which is a different and
entirely respectable thing.

- **K1 — Nobody qualifies.** After approaching **15 candidates who genuinely
  meet the three-fact gate** (Windows, daily agent CLI, more than one repo),
  fewer than 5 accept a session. The target user is too rare to reach one at a
  time. **Then:** stop the distribution programme — no public flip, no SignPath
  application, no CI signing — and keep DevDeck as a personal tool.
  *Not a kill:* fewer than 5 out of 15 people who did not meet the gate. That is
  a recruiting failure, and it means go back to `01-who-to-approach.md`.
- **K2 — Installed, used once, never reopened.** Four or more of the first five
  complete a session and never open DevDeck again unprompted within 14 days, and
  none of them names a specific missing thing that would have brought them back.
  **Then:** the pain is not shared. Stop feature work. The tool is a habit, not
  a product.
- **K3 — The premise is false for everyone but the author.** Three or more of
  five say, in their own words, that they do not have the problem: they do not
  switch projects often, their terminal is fine, they run one agent at a time.
  **Then:** stop building and re-scope. `PRODUCT.md`'s problem statement is an
  n=1 observation and must be rewritten before another feature is added.
- **K4 — The trust wall is the product's ceiling.** Three or more of five refuse
  to install *at all* because it is self-signed, or because their machine
  forbids it, or because they will not point an agent-CLI cockpit at their
  repos. **Then:** stop recruiting immediately and do not spend the remaining
  candidates. Distribution is gated on trust this project cannot buy at this
  scale, and the only work that matters is a real certificate (roadmap 4 + 6)
  before another invitation goes out.
- **K5 — A defect class the architecture cannot fix.** Two independent users hit
  data loss or an unrecoverable stop whose fix requires DevDeck to stop being
  what it is (for example: it cannot drive a real Windows pty safely on a normal
  corporate machine). **Then:** stop.

**Nothing else is a kill.** Not a bad session, not a rude message, not one user
who hated the interface, not a feature request nobody built. The kill criteria
are about the *premise*, not about the polish.

## Pre-registered predictions

Written now so they can be wrong later. These are `product-director`'s two
falsifiers from 2026-09-04, plus two of the author's own, and each session's
record should say which fired.

1. **The first five reach a running agent in under two minutes against the
   current empty states.** If so, the pre-beta first-run work was not the
   blocker, and the deferred redesign was the better spend.
2. **Three of the first five ask, unprompted, where a deleted surface went**
   (specifically the Network view or the Canvas layout). If so, the
   "feed or judge an agent" test that killed them is too narrow.
3. **The SmartScreen wall stops at least one of the first five.** If it stops
   nobody, the certificate is less urgent than assumed and the roadmap can be
   re-ordered on evidence.
4. **The shell-mismatch false negative fires for the Git Bash / WSL user** and
   they interpret `not on PATH` as "this app is broken" rather than "my PATH is
   odd". See `06-shell-mismatch-watch.md`.

## What is explicitly not evidence

Stated so it cannot be quietly counted later.

- The author's own use, at any volume, for any duration.
- "Users would probably want…" in any form. That sentence has no user in it.
- A star, a like, a reply saying "this looks cool", or an install with no session.
- Anything a candidate says before they have run it. Enthusiasm at invitation
  time is not validation; it is politeness with a schedule attached.
- A session the author demoed. Once the product has been explained, the first
  five minutes are gone and cannot be re-run with that person.
- A quote the author reconstructed from memory. It does not exist.
