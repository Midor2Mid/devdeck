# DevDeck parallel-session worktrees.
#
# Each concurrent Claude Code (or human) session should work in its OWN git
# worktree - a separate folder on its own branch, backed by the same repo. That
# way edits and `git add -A` in one session never collide with another, and each
# branch merges into main independently.
#
# Usage (run from anywhere in the repo):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/worktree.ps1 new    <name>
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/worktree.ps1 list
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/worktree.ps1 remove <name>
#
# `powershell` is Windows PowerShell 5.1, which every Windows box has. `pwsh`
# (PowerShell 7) runs this too, but it is NOT installed on this machine, and the
# docs used to name it exclusively - so the documented command failed outright.
# -NoProfile keeps a slow or noisy user profile out of it; -ExecutionPolicy
# Bypass avoids the unsigned-script refusal on a default machine.
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

# Native commands are checked by EXIT CODE, never by $?. git writes progress to
# stderr on success ("Preparing worktree (new branch ...)"), and in Windows
# PowerShell 5.1 that is enough to leave $? as $false after a command that
# worked. The old `if (-not $?) { return }` after `git worktree add` could
# therefore bail on success and skip the node_modules link below, leaving a
# worktree that cannot build.
function Test-LastExit {
    param([string]$What)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "$What failed (exit $LASTEXITCODE)." -ForegroundColor Red
        return $false
    }
    return $true
}

function New-Worktree {
    if (-not $Name) {
        Write-Host "Usage: worktree.ps1 new <name>"
        exit 2
    }
    if (-not (Test-Path $treesDir)) { New-Item -ItemType Directory -Force -Path $treesDir | Out-Null }
    $path = Join-Path $treesDir $Name
    $branch = "wt/$Name"

    git worktree add -b $branch $path
    if (-not (Test-LastExit "git worktree add")) { exit 1 }

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
    if (-not $Name) {
        Write-Host "Usage: worktree.ps1 remove <name>"
        exit 2
    }
    $path = Join-Path $treesDir $Name
    if (-not (Test-Path $path)) {
        Write-Host "No worktree at $path." -ForegroundColor Red
        exit 1
    }

    # Delete the junction itself (NOT its target) before removing the worktree, so
    # git/Remove-Item never traverse into the shared node_modules. Only when it IS
    # a link: a worktree that needed its own dependency tree (a toolchain upgrade
    # pinning a different Electron, say) has a REAL node_modules here, and calling
    # .Delete() on a non-empty directory throws - which, under
    # $ErrorActionPreference = "Stop", used to abort before the worktree was ever
    # removed. A real directory is left for git to take with the rest.
    $dstModules = Join-Path $path "node_modules"
    if (Test-Path $dstModules) {
        $item = Get-Item $dstModules -Force
        if ($item.LinkType) {
            $item.Delete()
            Write-Host "Unlinked the shared node_modules."
        } else {
            Write-Host "node_modules here is a real directory, not a link - git will remove it with the worktree."
        }
    }

    git worktree remove $path --force
    if (-not (Test-LastExit "git worktree remove")) { exit 1 }
    Write-Host "Removed worktree $path (branch wt/$Name kept; delete with: git branch -d wt/$Name)"
}

switch ($Command) {
    "new" { New-Worktree }
    "remove" { Remove-Worktree }
    "list" { git worktree list }
    default {
        Write-Host "Unknown command '$Command'. Use: new <name> | list | remove <name>"
        exit 2
    }
}
