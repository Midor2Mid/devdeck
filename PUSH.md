# Push to GitHub

This repo has **no remote yet**. Local branch is **`main`**. The Claude Code
sandbox has no network egress, so run these in a **normal terminal**
(PowerShell/Windows Terminal) where networking + `gh` work.

> First-push instructions. Delete this file once the remote is set up and the push is done.

## Option A — GitHub CLI (one shot: create private repo + origin + push)

```powershell
cd "D:\Personal\Personal Projects\Products\devdeck"
winget install --id GitHub.cli -e     # skip if gh is already installed
gh auth login                          # one-time, interactive (browser/device flow)
gh repo create devdeck --private --source=. --push
git push origin v0.4.0 v0.4.1          # tags don't push automatically
```

Branch is `main`, so GitHub sets `main` as the default branch automatically.

## Option B — manual (create an empty private `devdeck` repo in the web UI first)

Create it with **no** README / .gitignore / license (empty), then:

```powershell
cd "D:\Personal\Personal Projects\Products\devdeck"
git remote add origin https://github.com/<your-username>/devdeck.git
git push -u origin main
git push origin --tags
```

## Verify after pushing

```powershell
git remote -v
git log --oneline -6 origin/main
git ls-remote --tags origin
```

Expected tip + recent commits on `origin/main`:

```
857b236  chore(release): bump version to 0.4.1
2471956  refactor(ui): declutter terminal toolbar — group actions + ⋯ overflow
047fc4f  feat(ui): ensō brand mark, empty-state watermark, contrast + modal focus
5732975  docs: remove PUSH.md (one-off first-push notes, no longer needed)
72c7924  docs: track PUSH.md with v0.4.0 push + tag steps
fc04ca3  chore(release): bump version to 0.4.0
```

Expected tags: `v0.4.0` → `fc04ca3`, `v0.4.1` → `857b236` (plus the older `v0.1.x`–`v0.3.x`).

## Cleanup (do this last, once the push is verified)

This file has served its purpose — remove it:

```powershell
git rm PUSH.md
git commit -m "docs: remove PUSH.md (pushed)"
git push
```
