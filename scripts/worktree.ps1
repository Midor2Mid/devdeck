# DevDeck parallel-session worktrees.
#
# Each concurrent Claude Code (or human) session should work in its OWN git
# worktree — a separate folder on its own branch, backed by the same repo. That
# way edits and `git add -A` in one session never collide with another, and each
# branch merges into main independently.
#
# Usage (run from anywhere in the repo):
#   pwsh -File scripts/worktree.ps1 new   <name>   # create ../devdeck-trees/<name> on branch wt/<name>
#   pwsh -File scripts/worktree.ps1 list            # list worktrees
#   pwsh -File scripts/worktree.ps1 remove <name>   # remove the worktree (keeps the branch)
#
# After `new`, open a Claude Code session in the printed folder and work there.
# node_modules is shared from the main checkout via a junction, so builds work
# immediately (no reinstall). Build one worktree at a time to avoid racing the
# shared Vite cache.

param(
    [Parameter(Position = 0)][string]$Command = "list",
    [Parameter(Position = 1)][string]$Name
)

$ErrorActionPreference = "Stop"
$repo = (git rev-parse --show-toplevel).Trim()
$treesDir = Join-Path (Split-Path $repo -Parent) "devdeck-trees"

function New-Worktree {
    if (-not $Name) { Write-Error "Usage: worktree.ps1 new <name>"; return }
    if (-not (Test-Path $treesDir)) { New-Item -ItemType Directory -Force -Path $treesDir | Out-Null }
    $path = Join-Path $treesDir $Name
    $branch = "wt/$Name"

    git worktree add -b $branch $path
    if (-not $?) { return }

    # Share node_modules from the main checkout so the worktree can build at once.
    $srcModules = Join-Path $repo "node_modules"
    $dstModules = Join-Path $path "node_modules"
    if ((Test-Path $srcModules) -and -not (Test-Path $dstModules)) {
        New-Item -ItemType Junction -Path $dstModules -Target $srcModules | Out-Null
        Write-Host "Linked node_modules from main checkout."
    }

    Write-Host ""
    Write-Host "Worktree ready:" -ForegroundColor Green
    Write-Host "  folder: $path"
    Write-Host "  branch: $branch"
    Write-Host "Open a Claude Code session in that folder. When done:"
    Write-Host "  git push -u origin $branch   (then open a PR), or merge into main."
}

function Remove-Worktree {
    if (-not $Name) { Write-Error "Usage: worktree.ps1 remove <name>"; return }
    $path = Join-Path $treesDir $Name
    # Delete the junction itself (NOT its target) before removing the worktree,
    # so git/Remove-Item never traverse into the shared node_modules.
    $dstModules = Join-Path $path "node_modules"
    if (Test-Path $dstModules) { (Get-Item $dstModules).Delete() }
    git worktree remove $path --force
    Write-Host "Removed worktree $path (branch wt/$Name kept; delete with: git branch -D wt/$Name)"
}

switch ($Command) {
    "new" { New-Worktree }
    "remove" { Remove-Worktree }
    default { git worktree list }
}
