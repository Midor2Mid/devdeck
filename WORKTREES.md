# Parallel sessions without collisions — git worktrees

Running several Claude Code (or human) sessions against **the same working folder**
causes collisions: "file modified since read" races, and one session's `git add -A`
sweeping another's uncommitted work into its commit (this happened — a UX round got
bundled into an unrelated icon commit).

The fix: give **each concurrent session its own git worktree** — a separate folder
on its own branch, sharing the one repo. Edits and commits in one worktree never
touch another. Branches merge into `main` independently.

```
devdeck/                     ← main checkout (main)
devdeck-trees/
  api-polish/                ← session A,  branch wt/api-polish
  browser-console/           ← session B,  branch wt/browser-console
```

## Create a worktree for a session

```
npm run worktree -- new api-polish
```

or the script directly:

```
node scripts/worktree.mjs new api-polish
```

This creates `../devdeck-trees/api-polish` on branch `wt/api-polish` and **junctions
`node_modules`** from the main checkout so it builds immediately (no reinstall).
Then **open a Claude Code session in that folder** and work there.

> **Node, not PowerShell.** This was `scripts/worktree.ps1`, invoked as `pwsh -File`
> - and `pwsh` (PowerShell 7) is not installed here, so the documented command failed
> before it ever reached the script. Worse, no agent session on this machine can run
> or even parse a `.ps1`, which is how two real bugs survived in it: git reporting
> success on stderr (so a worktree was created without its `node_modules` link), and
> a worktree holding its own `node_modules` (so removal threw before removing
> anything). The logic now lives in `scripts/worktree.mjs`, covered by
> `tests/worktree.test.ts` against a throwaway repo, and the `.ps1` is gone.

## List / remove

```
npm run worktree -- list
npm run worktree -- remove api-polish   # removes the folder; keeps the branch
```

`remove` unlinks the shared `node_modules` before it removes the folder, so nothing
ever walks into the main checkout's dependency tree. A worktree that has its own
real `node_modules` (one pinning a different Electron, say) is left for git to take
with the rest, rather than being deleted file by file.

## Finishing up

From the worktree, land the branch:

```
git push -u origin wt/api-polish      # then open a PR on Azure DevOps / GitHub
# — or, locally —
git switch main; git merge wt/api-polish
```

## Rules of thumb

- **One session per worktree.** Never point two sessions at the same folder.
- **The main checkout (`devdeck/`) stays on `main`** — treat it as the integration
  branch, not a place to do parallel work.
- **Build one worktree at a time.** They share `node_modules` (incl. the Vite cache),
  so simultaneous `npm run build` in two worktrees can race; serialize builds.
- **Commit small and merge often** to keep branches from diverging.
- Worktrees live in `../devdeck-trees/` (outside the repo), so they're never tracked.
