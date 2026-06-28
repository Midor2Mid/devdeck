# Creates a self-signed code-signing certificate for LOCAL / personal use and
# trusts it for the current user. Signed DevDeck builds are then recognized by
# Windows / SmartScreen / Avast on THIS machine, which stops unsigned-binary
# false positives. NOT for distribution - other machines won't trust this cert.
#
# Run once:  npm run cert:make
# (A Windows security prompt may appear when adding the cert to the Root store -
#  click Yes. No admin rights are needed; trust is per-user.)

$ErrorActionPreference = "Stop"
$subject = "CN=DevDeck Dev"

$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -eq $subject } | Select-Object -First 1

if ($cert) {
    Write-Host "Signing cert already exists: $($cert.Thumbprint)"
} else {
    Write-Host "Creating self-signed code-signing cert '$subject'..."
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $subject `
        -KeyUsage DigitalSignature -KeyExportPolicy Exportable `
        -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(5)
    Write-Host "Created: $($cert.Thumbprint)"
}

# Trust it for the current user so Authenticode chains to a trusted root and the
# signature counts as a known publisher (no admin required).
$cer = Join-Path $env:TEMP "devdeck-pub.cer"
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null
Remove-Item $cer -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done. Trusted for the current user (Root + TrustedPublisher)."
Write-Host "Now build signed installers with:  npm run package:signed"
