# Thin shim. The implementation is scripts/worktree.mjs (Node), which is covered by
# tests/worktree.test.ts against a real throwaway repo.
#
# Why a shim and not a second implementation: the two would drift, and the
# PowerShell one could not be run - or even parsed - by an agent session on this
# machine, so its bugs were only ever found by hitting them. One implementation,
# two entry points.
#
# Usage (unchanged, and `powershell` rather than `pwsh`, which is not installed here):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/worktree.ps1 new    <name>
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/worktree.ps1 list
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/worktree.ps1 remove <name>
#
# Equivalent, and what CI or a Node-shaped session should use:
#   npm run worktree -- new <name>
#   node scripts/worktree.mjs new <name>

& node (Join-Path $PSScriptRoot "worktree.mjs") @args
exit $LASTEXITCODE
