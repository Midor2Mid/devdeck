# The DevDeck team

Twelve agent roles, in `.claude/agents/`. Four already existed and only ever
judge; eight are new and most of them build. Invoke one with the Agent tool by
its `name`.

## Who decides

| Role | Answers | Does not |
|---|---|---|
| `strategy-reviewer` | What DevDeck **is**, and what that forbids | Pick features |
| `product-reviewer` | What to build **next**, and what to stop carrying | Write code |
| `po` | What **done** means, and whether it was met | Set priority |
| `pm` | The **order**, the seams, who can work in parallel | Decide scope |
| `request-reviewer` | What a batch of asks really contains, before any of it is built | Build it |

## Who makes

| Role | Owns |
|---|---|
| `designer` | Layouts, states, tokens, motion, copy — before code |
| `frontend-dev` | `src/renderer/` — React, zustand, CSS, themes |
| `backend-dev` | `src/main/`, `src/preload/` — IPC, pty, server, persistence |
| `unit-test-generator` | Tests for code that has none |
| `release-eng` | Package, sign, install, publish, and the updater |
| `marketing` | README, release notes, and whether to say anything at all |

## Who checks

| Role | Reads |
|---|---|
| `qa` | The running app. Writes missing tests, attacks the change, reports evidence |
| `design-reviewer` | A UI diff, against `DESIGN.md` and the 84-skin matrix |
| `po` | The acceptance criteria it wrote earlier |

## The usual shape of a piece of work

1. `product-reviewer` says it is worth building (or kills it).
2. `po` writes the acceptance criteria.
3. `designer` specifies it, if it has a surface.
4. `pm` sequences it into a plan with verification per task.
5. `frontend-dev` / `backend-dev` build it.
6. `qa` and `design-reviewer` run in parallel over the result.
7. `po` rules. `release-eng` ships it and **confirms it is installed**.

Skip steps freely for small work — the sequence is a default, not a process. But
note which two are hardest to skip safely: without step 2 nobody can say whether
step 5 succeeded, and without step 7's second half a release changes nothing.

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
  implied.

## What the team is not for

Producing documents. This repo already carries several megabytes of analysis
against a few of source, and the standing rule from the strategy pass is that no
new memo is written until a prior one has caused a deletion in `src/`. These
roles exist to build and to ship; if a dispatch would only add another file to
`.superpowers/`, do not make it.
