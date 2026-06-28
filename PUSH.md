# Push to GitHub

This repo has **no remote yet**. Local branch is **`main`** (renamed from `master`).
The Claude Code sandbox has no network egress, so run these in a **normal terminal**
(PowerShell/Windows Terminal) where networking + `gh` work.

> First-push instructions. Delete this file once the remote is set up and the push is done.

## Option A — GitHub CLI (one shot: create private repo + origin + push)

```powershell
cd "D:\Personal\Personal Projects\Products\devdeck"
winget install --id GitHub.cli -e     # skip if gh is already installed
gh auth login                          # one-time, interactive (browser/device flow)
gh repo create devdeck --private --source=. --push
```

Branch is `main`, so GitHub sets `main` as the default branch automatically.

Then tag the release:

```powershell
git tag -a v0.4.0 -m "v0.4.0 — M4 network debugging panel + capture proxy"
git push origin v0.4.0
```

## Option B — manual (create an empty private `devdeck` repo in the web UI first)

Create it with **no** README / .gitignore / license (empty), then:

```powershell
cd "D:\Personal\Personal Projects\Products\devdeck"
git remote add origin https://github.com/<your-username>/devdeck.git
git push -u origin main
git tag -a v0.4.0 -m "v0.4.0 — M4 network debugging panel + capture proxy"
git push origin v0.4.0
```

## Verify after pushing

```powershell
git remote -v
git log --oneline -5 origin/main
git tag --list
```

Expected tip + recent commits on `origin/main`:

```
fc04ca3  chore(release): bump version to 0.4.0
be4c509  chore: gitignore PUSH.md (local push-notes scratch file)
217b2f3  chore(skills): add run-app skill (drive Electron app over CDP)
a7eda8a  feat(network): M4 network debugging panel + local capture proxy
9b35b7e  docs(roadmap): fix stale checkbox state across milestones
```
