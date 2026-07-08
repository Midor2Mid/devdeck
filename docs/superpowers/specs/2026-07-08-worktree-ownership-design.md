# Worktree file-ownership map — design

**Date:** 2026-07-08
**Status:** Approved · Roadmap #3 (scoped to the ownership/conflict map; flipping
the new-session default to a worktree is deferred).

## Problem
When several agents work in parallel (each in its own worktree, as the task board
now dispatches), you can't see **which agent is touching which files** or spot when
**two agents are editing the same file** (a coming merge conflict). This is the
supervisor need the 2026 research repeatedly calls out.

## Design (reuses existing infra — no new IPC)
For each live agent session, its working dir is `termCwd[termId] ?? projectPath`;
`window.api.git.changes(cwd)` already returns its changed files. Aggregate across
all live agents into a file→owners map and flag files owned by 2+ agents **in the
same project** (a real conflict; identical relative paths in different repos are not).

- **Pure core — `src/renderer/src/ownership.ts`:**
  - `interface OwnerRef { termId: string; sessionName: string }`
  - `interface FileOwnership { path: string; projectName: string; owners: OwnerRef[] }`
  - `interface OwnershipMap { files: FileOwnership[]; conflicts: number }`
  - `buildOwnership(entries: { termId: string; sessionName: string; projectName: string; files: string[] }[]): OwnershipMap`
    — key by `projectName + "\0" + path`; dedupe owners by `termId`; sort files with
    conflicts (owners > 1) first, then by path; `conflicts` = count of multi-owner files.
  - Unit-tested.
- **Surface — a section in `MissionControl.tsx`:** "In-flight changes · N conflicts".
  On an ~8s interval (skipped while `document.hidden`), for each live agent session
  call `git.changes(termCwd[termId] ?? projectPath)`, `buildOwnership`, and render:
  each file as a row (`projectName · path`) with owner chips; **conflict files** (2+
  owners) highlighted (danger accent). Clicking an owner chip → `jumpToTerm`.
  Section hidden when there are no in-flight changes.

## Reuse
`git.changes(cwd) → ChangeFile[]`, `termCwd`, `agentSessions()`, `jumpToTerm`,
Mission Control's existing slice subscriptions.

## Edge cases
- Agent with no changes → contributes nothing.
- Same relative path in two different projects → two separate rows, no conflict.
- Closed session's `termCwd` → `git.changes` returns `[]` (dir may be gone); harmless.
- Many files → cap the rendered list (e.g. 30), conflicts always shown first.

## Testing
- Unit-test `buildOwnership`: same-project same-file → 1 conflict/2 owners;
  cross-project same path → 0 conflicts; owner dedupe; conflict-first sort.
- run-app: Mission Control shows the section when agent worktrees have changes
  (existing projects have uncommitted changes, so real data appears).

## Build steps
1. `ownership.ts` (pure) + tests.
2. Mission Control "In-flight changes" section (interval fetch + render) + CSS.
3. `npm test`; run-app verify.
