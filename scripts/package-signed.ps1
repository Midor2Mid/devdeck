# Builds DevDeck and produces signed installers, then verifies the release is
# internally consistent.
#
# Prereq (run once):  npm run cert:make
# Build:              npm run package:signed
#
# electron-builder does the signing itself (win.signtoolOptions.certificateSubjectName
# points at the cert in CurrentUser\My), which matters for more than tidiness:
# it signs BEFORE hashing. The previous version of this script packed first and
# ran Set-AuthenticodeSignature afterwards, so every installer gained ~7 KB of
# Authenticode data *after* electron-builder had written its sha512 and size into
# latest.yml. The artifacts looked perfect - signature Valid, exit 0 - but
# latest.yml described the unsigned bytes, so electron-updater would download the
# real installer, fail the hash check, and refuse to update. Signing inside the
# build makes the manifest correct by construction.
#
# The verification block at the end exists because that failure was invisible:
# nothing in the build output was red.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$subject = "CN=DevDeck Dev"
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -eq $subject } | Select-Object -First 1
if (-not $cert) {
    throw "No signing cert found. Run 'npm run cert:make' first."
}
Write-Host "==> signing cert: $($cert.Subject) [$($cert.Thumbprint)] expires $($cert.NotAfter)"

# Stale artifacts from earlier versions are an upload hazard - it's easy to attach
# the wrong exe to a release. Start from a clean output dir.
if (Test-Path release) {
    Write-Host "==> clearing previous artifacts from release/"
    Get-ChildItem release -File | Remove-Item -Force
}

Write-Host "==> electron-vite build"
npx electron-vite build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "==> electron-builder (packs and signs)"
npx electron-builder
if ($LASTEXITCODE -ne 0) { throw "packaging failed" }

# ---- Verify ----------------------------------------------------------------
Write-Host ""
Write-Host "==> verifying signatures"
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$expected = @(
    "release\DevDeck-Setup-$version.exe",
    "release\DevDeck-Portable-$version.exe",
    "release\win-unpacked\DevDeck.exe"
)
$failed = @()
foreach ($f in $expected) {
    if (-not (Test-Path $f)) { $failed += "missing: $f"; continue }
    $sig = Get-AuthenticodeSignature $f
    Write-Host ("  {0,-34} {1}" -f (Split-Path $f -Leaf), $sig.Status)
    if ($sig.Status -ne "Valid") { $failed += "unsigned or invalid: $f ($($sig.Status))" }
}

Write-Host ""
Write-Host "==> verifying latest.yml matches the signed installer"
$manifestPath = "release\latest.yml"
if (-not (Test-Path $manifestPath)) {
    $failed += "missing: $manifestPath (auto-update manifest)"
} else {
    $manifest = Get-Content $manifestPath -Raw
    $installer = "release\DevDeck-Setup-$version.exe"
    # The file latest.yml points at must be the one that actually exists: GitHub
    # rewrites spaces in release-asset names, so a mismatch here 404s the updater.
    $namedFile = ([regex]::Match($manifest, 'path:\s*(.+)')).Groups[1].Value.Trim()
    if ($namedFile -ne (Split-Path $installer -Leaf)) {
        $failed += "latest.yml points at '$namedFile' but the artifact is '$(Split-Path $installer -Leaf)'"
    }
    if (Test-Path $installer) {
        $sha = [Convert]::ToBase64String(
            [System.Security.Cryptography.SHA512]::Create().ComputeHash(
                [System.IO.File]::ReadAllBytes($installer)))
        $size = (Get-Item $installer).Length
        $mSha = ([regex]::Match($manifest, '(?m)^sha512:\s*(.+)$')).Groups[1].Value.Trim()
        $mSize = ([regex]::Match($manifest, 'size:\s*(\d+)')).Groups[1].Value.Trim()
        Write-Host ("  sha512 match : {0}" -f ($sha -eq $mSha))
        Write-Host ("  size   match : {0} ({1} on disk / {2} in manifest)" -f ($size -eq [int64]$mSize), $size, $mSize)
        if ($sha -ne $mSha) { $failed += "latest.yml sha512 does not match the signed installer - auto-update would reject it" }
        if ($size -ne [int64]$mSize) { $failed += "latest.yml size does not match the signed installer" }
    }
}

Write-Host ""
if ($failed.Count -gt 0) {
    Write-Host "RELEASE IS NOT PUBLISHABLE:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw "verification failed"
}

Write-Host "Done. Signed with $($cert.Subject) ($($cert.Thumbprint))." -ForegroundColor Green
Get-ChildItem release -File | Sort-Object Name |
    Format-Table Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}} -AutoSize
Write-Host "Upload the .exe files plus latest.yml (auto-update needs the manifest)."
