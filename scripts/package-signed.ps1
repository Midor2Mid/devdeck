# Builds DevDeck and signs every .exe with the local self-signed cert, so the
# app and installers aren't flagged as unknown/unsigned on this machine.
#
# Prereq (run once):  npm run cert:make
# Build:              npm run package:signed
#
# Flow: build -> pack unpacked dir -> sign the app exes -> build installers FROM
# the signed dir (--prepackaged) -> sign the installer + portable exe. Signing
# the app before the installer packs it means the *installed* exe is signed too.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$subject = "CN=DevDeck Dev"
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -eq $subject } | Select-Object -First 1
if (-not $cert) {
    throw "No signing cert found. Run 'npm run cert:make' first."
}

$ts = "http://timestamp.digicert.com"

function Sign-Pe {
    param([string]$Path, [switch]$Recurse)
    $files = if ($Recurse) {
        Get-ChildItem -Path $Path -Recurse -Include *.exe -ErrorAction SilentlyContinue
    } else {
        Get-ChildItem -Path $Path -Filter *.exe -File -ErrorAction SilentlyContinue
    }
    foreach ($f in $files) {
        try {
            # Timestamping needs internet; keeps the signature valid past cert expiry.
            $r = Set-AuthenticodeSignature -FilePath $f.FullName -Certificate $cert `
                -HashAlgorithm SHA256 -TimestampServer $ts -ErrorAction Stop
            Write-Host ("  signed {0} [{1}]" -f $f.Name, $r.Status)
        } catch {
            $r = Set-AuthenticodeSignature -FilePath $f.FullName -Certificate $cert -HashAlgorithm SHA256
            Write-Host ("  signed {0} [{1}, no timestamp]" -f $f.Name, $r.Status)
        }
    }
}

Write-Host "==> electron-vite build"
npx electron-vite build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "==> electron-builder --dir (unpacked app)"
npx electron-builder --dir
if ($LASTEXITCODE -ne 0) { throw "pack failed" }

Write-Host "==> signing app binaries in release/win-unpacked"
Sign-Pe -Path "release/win-unpacked" -Recurse

Write-Host "==> electron-builder --prepackaged (installers from the signed dir)"
npx electron-builder --prepackaged "release/win-unpacked"
if ($LASTEXITCODE -ne 0) { throw "installer build failed" }

Write-Host "==> signing installers in release"
Sign-Pe -Path "release"

Write-Host ""
Write-Host "Done. Signed with $($cert.Subject) ($($cert.Thumbprint))."
Write-Host "Verify any exe with:  Get-AuthenticodeSignature '.\release\win-unpacked\DevDeck.exe' | Format-List"
