# The DevDeck team

Seventeen roles in `.claude/agents/`, in two tiers. Invoke one with the Agent
tool by its `name`.

The tiering exists for four reasons, decided **2026-09-02**: cost (11 of 12
roles were Opus, by accident rather than by choice), coverage (security,
performance, docs and user contact were being done ad hoc by whoever held the
keyboard), autonomy (a director can plan a whole cycle), and a structure that
says who decides what.

## The standing decisions every role works inside

Decided by the product's owner on **2026-09-02**. Premises, not open questions.

- **Ambition: a product with users** — terminal-first developers driving AI CLIs,
  possibly paid. `PRODUCT.md` still says "For me, first" and measures success as
  "it becomes my daily driver"; that section is stale and `product-director` owns
  fixing it.
- **The next milestone is 5–10 real users.** Not a public launch, not revenue. An
  installer a stranger can run, a trustworthy cert, first-run instructions, and a
  feedback path that ends in someone's actual words.
- **Zero external validation exists.** Nobody outside the author's machine has
  ever opened DevDeck. Every claim about what users want is currently a guess.
- **Everything is measured against that milestone.** Work that does not get a
  stranger closer to running this and saying something back is *not yet*,
  however good.

## Tier 1 — Directors (Opus)

| Role | Owns | Cannot |
|---|---|---|
| `product-director` | What DevDeck **is**, what that forbids, the roadmap to the milestone, and the product's name | Rank a backlog item by item; write code or specs |
| `technical-director` | The **seams** — what may depend on what, which failures may stay invisible, when a module has become two | Decide what to build, or judge whether a diff is correct |
| `pm` | The **order** — sequencing, parallelism, and keeping a running plan honest | Decide scope |

A director's output is a **plan or a ruling, never a memo**. The main session
executes it with the leads and stops at the gates. Directors do not dispatch
each other.

## Tier 2 — Leads

**Who makes**

| Role | Owns | Model |
|---|---|---|
| `designer` | Layouts, states, tokens, motion, copy — before code | Opus |
| `frontend-dev` | `src/renderer/` — React, zustand, CSS, themes | Opus |
| `backend-dev` | `src/main/`, `src/preload/` — IPC, pty, server, persistence | Opus |
| `docs-writer` | First-run instructions, the README's how-to half, in-app explanatory copy | Sonnet |
| `release-eng` | Package, sign, install, publish, and the updater | Sonnet |
| `marketing` | README's why, release notes, and whether to say anything at all | Sonnet\* |
| `unit-test-generator` | Tests for code that has none (a global role, not in this directory) | — |

**Who checks**

| Role | Reads | Model |
|---|---|---|
| `qa` | The running app. Writes missing tests, attacks the change, reports evidence | Opus |
| `security-engineer` | The boundaries — server, pty, DB, `fs:*`, MCP. Writes the exploit, not a checklist | Opus |
| `design-reviewer` | A UI diff, against `DESIGN.md` and the 84-skin matrix | Sonnet |
| `performance-analyst` | Numbers — cold start, memory per pane, floods, long sessions | Sonnet |
| `po` | The acceptance criteria it wrote earlier | Sonnet |

**Who decides (below the directors)**

| Role | Answers | Model |
|---|---|---|
| `product-reviewer` | What to build **next**, and what to stop carrying | Sonnet\* |
| `po` | What **done** means, and whether it was met | Sonnet |
| `request-reviewer` | What a batch of asks really contains, before any of it is built | Opus |
| `field` | Who the users are, what they did, and what they said — verbatim | Sonnet |

\* `product-reviewer` and `marketing` default to Sonnet and should be dispatched
on Opus for a real backlog triage or a launch decision. The file sets a default;
the dispatch can override it.

**Why the models fall this way.** Not by seniority — by whether being subtly
wrong is expensive. The traps that have actually cost this project days were
subtle: a zustand selector returning a fresh array and spinning forever, a guard
answering with a `TypeError` instead of a decision, `values: []` failing to force
pg's extended protocol. The seats where that kind of wrongness lands are Opus.
Drafting, measuring, packaging and criteria-writing are Sonnet.

## The usual shape of a piece of work

1. `product-director` says it serves the milestone (or rules it *not yet*).
2. `product-reviewer` ranks it against the alternatives and kills most of them.
3. `po` writes the acceptance criteria.
4. `designer` specifies it, if it has a surface.
5. `pm` sequences it into a plan with verification per task.
6. `frontend-dev` / `backend-dev` build it.
7. `qa`, `design-reviewer` and — where the diff touches a boundary —
   `security-engineer` run in parallel over the result.
8. `po` rules. `release-eng` ships it and **confirms it is installed**.

Skip steps freely for small work — the sequence is a default, not a process.
Four steps are not skippable:

- **Step 3.** Without acceptance criteria nobody can say whether step 6 worked.
- **Step 7's security leg** is mandatory, not advisory, on any diff touching
  `src/main/server.ts`, the pty layer, the DB or HTTP clients, an `fs:*` handler,
  or the MCP tools.
- **Step 8's second half.** A release that is built but not installed has changed
  nothing. This project has stalled there repeatedly.
- **Any step that produces a user-facing claim** needs `field` before it counts
  as validated.

## Rules every role inherits

- 4-space indent, double quotes, conventional commits, no secrets committed.
- `npm run typecheck` at zero and `npm test` green before anything is "done" —
  the build does not typecheck, so nothing else catches a type error.
- Design changes the **token**, not the component. 7 themes × 12 styles = 84
  skins, and one accent.
- There is no headless renderer: visual claims are verified with the `run-app`
  skill, launched with a **scratch `userDataDir`** so it never touches the real
  workspace, and never by killing the user's running DevDeck.
- **A signal that can lie is worse than no signal.** Unknown, absent and zero are
  three states and must look like three states.
- Report what happened, not what should have. A skipped check is stated, not
  implied. An unproven claim is labelled unproven.
- Dependencies point inward to `src/shared/`, never sideways. A main-process
  module importing from `renderer/` is a violation this repo has already
  committed once.

## What the team is not for

Producing documents. This repo carries several megabytes of analysis against a
few of source, and the standing rule is that **no new memo is written until a
prior one has caused a deletion in `src/`**. These roles exist to build and to
ship. A director's plan is not a memo — it is executable, and it is spent when it
is executed. If a dispatch would only add another file to `.superpowers/`, do not
make it.
