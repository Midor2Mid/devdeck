# Install the build in release/win-unpacked over the local per-user install.
#
# Why this exists rather than "run the installer": a silent NSIS reinstall over
# an existing per-user install fails here with exit 2 (Avast blocks the
# uninstaller step), and it fails *quietly* - no files updated, same exe
# timestamp - so "rebuild and reinstall" silently no-ops and you spend an hour
# testing the old build. Copying the unpacked build over the install directory
# is deterministic, needs no admin, and leaves the Start Menu shortcut and
# Uninstall DevDeck.exe alone.
#
# It also waits for DevDeck to exit rather than killing it: a DevDeck window is
# usually full of live agent sessions, and one of them may be the session that
# asked for this install.

param(
    # How long to wait for DevDeck to be closed, in seconds. 0 = don't wait,
    # fail immediately if it's running.
    [int]$WaitSeconds = 300,
    # Start DevDeck again once the files are in place.
    [switch]$Relaunch
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repo "release\win-unpacked"
$target = Join-Path $env:LOCALAPPDATA "Programs\devdeck"

function Fail($msg) { Write-Host "  FAIL  $msg" -ForegroundColor Red; exit 1 }

# --- what we are about to install ------------------------------------------
if (-not (Test-Path $source)) { Fail "No build at $source. Run 'npm run package:signed' first." }
if (-not (Test-Path $target)) { Fail "No existing install at $target. Run the installer once by hand." }

$pkgVersion = (Get-Content (Join-Path $repo "package.json") -Raw | ConvertFrom-Json).version
$builtExe = Join-Path $source "DevDeck.exe"
if (-not (Test-Path $builtExe)) { Fail "No DevDeck.exe in $source." }
$builtVersion = (Get-Item $builtExe).VersionInfo.ProductVersion
Write-Host "==> installing $builtVersion (repo says $pkgVersion) into $target"

# Compare major.minor.patch only: Windows pads an exe's version to four parts
# ("0.10.0" becomes "0.10.0.0"), and npm allows a prerelease suffix. Comparing
# the raw strings failed every single time, which is worse than not checking -
# a check that always fails gets deleted rather than fixed.
function Triple($v) { (($v -split "[+-]")[0].Split(".") + @("0", "0", "0"))[0..2] -join "." }
if ($builtVersion -and $pkgVersion -and (Triple $builtVersion) -ne (Triple $pkgVersion)) {
    # A stale win-unpacked is the exact failure this script exists to catch, so
    # it is a refusal rather than a warning.
    Fail "The built app is $builtVersion but package.json says $pkgVersion - rebuild before installing."
}

# --- wait for the app to be closed -----------------------------------------
$deadline = (Get-Date).AddSeconds($WaitSeconds)
$warned = $false
while (Get-Process -Name "DevDeck" -ErrorAction SilentlyContinue) {
    if (-not $warned) {
        Write-Host "==> DevDeck is running. Close it (its agent sessions are still live) - waiting..." -ForegroundColor Yellow
        $warned = $true
    }
    if ((Get-Date) -gt $deadline) { Fail "DevDeck was still running after ${WaitSeconds}s. Nothing was changed." }
    Start-Sleep -Seconds 2
}

# --- copy ------------------------------------------------------------------
$before = (Get-Item (Join-Path $target "DevDeck.exe")).LastWriteTime
Write-Host "==> copying files"
Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force

# --- prove it landed, two ways ---------------------------------------------
# The timestamp alone would be satisfied by a partial copy, and the version
# alone would be satisfied by the previous install of the same version.
$after = (Get-Item (Join-Path $target "DevDeck.exe")).LastWriteTime
if ($after -le $before) { Fail "DevDeck.exe timestamp did not move ($before -> $after) - the copy did not land." }

$asar = Join-Path $target "resources\app.asar"
if (-not (Test-Path $asar)) { Fail "No app.asar at $asar." }
$bytes = [System.IO.File]::ReadAllBytes($asar)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
if ($text -notmatch [regex]::Escape("`"version`":`"$pkgVersion`"")) {
    Fail "app.asar does not carry version $pkgVersion - the bundle is not the one just built."
}

Write-Host "  ok   DevDeck.exe updated ($after)"
Write-Host "  ok   app.asar carries $pkgVersion"

if ($Relaunch) {
    Write-Host "==> starting DevDeck"
    Start-Process (Join-Path $target "DevDeck.exe")
}
Write-Host "Done. $pkgVersion is installed." -ForegroundColor Green
