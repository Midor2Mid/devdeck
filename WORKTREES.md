# Parallel sessions without collisions — git worktrees

Running several Claude Code (or human) sessions against **the same working folder**
causes collisions: "file modified since read" races, and one session's `git add -A`
sweeping another's uncommitted work into its commit (this happened — a UX round got
bundled into an unrelated icon commit).

The fix: give **each concurrent session its own git worktree** — a separate folder
on its own branch, sharing the one repo. Edits and commits in one worktree never
touch another. Branches merge into `master` independently.

```
devdeck/                     ← main checkout (master)
devdeck-trees/
  api-polish/                ← session A,  branch wt/api-polish
  browser-console/           ← session B,  branch wt/browser-console
```

## Create a worktree for a session

```powershell
pwsh -File scripts/worktree.ps1 new api-polish
```

This creates `../devdeck-trees/api-polish` on branch `wt/api-polish` and **junctions
`node_modules`** from the main checkout so it builds immediately (no reinstall).
Then **open a Claude Code session in that folder** and work there.

## List / remove

```powershell
pwsh -File scripts/worktree.ps1 list
pwsh -File scripts/worktree.ps1 remove api-polish   # removes the folder; keeps the branch
```

## Finishing up

From the worktree, land the branch:

```powershell
git push -u origin wt/api-polish      # then open a PR on Azure DevOps / GitHub
# — or, locally —
git switch master; git merge wt/api-polish
```

## Rules of thumb

- **One session per worktree.** Never point two sessions at the same folder.
- **The main checkout (`devdeck/`) stays on `master`** — treat it as the integration
  branch, not a place to do parallel work.
- **Build one worktree at a time.** They share `node_modules` (incl. the Vite cache),
  so simultaneous `npm run build` in two worktrees can race; serialize builds.
- **Commit small and merge often** to keep branches from diverging.
- Worktrees live in `../devdeck-trees/` (outside the repo), so they're never tracked.
