# Set Worker secrets from config/.env — one command after you paste values.
#
# Reads config/.env and pushes each configured secret to the Cloudflare
# Worker (sofrito-edge) via `wrangler secret put`.
# Empty / placeholder values are skipped, so this is safe to re-run any time.
#
# NOTE: run with PowerShell 7+ (pwsh). Wrangler's node runtime crashes on
# stdin under Windows PowerShell 5.1, so `powershell.exe` will NOT work.
#
#   # set every secret found in config/.env
#   pwsh -File scripts\set_worker_secrets.ps1
#
# Secrets (see marketing/general/setup-creds.md for where each value comes from):
#   RESEND_API_KEY, BUTTONDOWN_API_KEY, GUMROAD_ACCESS_TOKEN,
#   RESEND_WEBHOOK_SECRET

$ErrorActionPreference = "Continue"
$envFile = Join-Path $PSScriptRoot "..\config\.env"
$wrangler = Join-Path $PSScriptRoot "..\cloudflare\node_modules\.bin\wrangler.cmd"

$secretKeys = @("RESEND_API_KEY", "BUTTONDOWN_API_KEY", "GUMROAD_ACCESS_TOKEN", "RESEND_WEBHOOK_SECRET", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "META_ACCESS_TOKEN", "META_CAPI_ACCESS_TOKEN", "CALENDLY_WEBHOOK_SIGNING_KEY")
$placeholders = @("", "YOUR", "YOUR-KEY", "YOUR_TOKEN", "CHANGE_ME")

$vals = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $parts = $line -split "=", 2
    $vals[$parts[0].Trim()] = $parts[1].Trim()
  }
}

$any = $false
# Wrangler must run from the folder that owns wrangler.toml.
Push-Location (Join-Path $PSScriptRoot "..\cloudflare")
try {
foreach ($k in $secretKeys) {
  $v = $vals[$k]
  if (-not $v -or $placeholders -contains $v) {
    Write-Host "  $k -> skipped (empty or placeholder in config\.env)"
    continue
  }
  $any = $true
  Write-Host "  $k -> uploading..."
  # 2>$null keeps wrangler's stderr notice from surfacing as an error.
  $v | & $wrangler secret put $k 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "     done" } else { Write-Host "     FAILED (exit $LASTEXITCODE)" }
}
} finally { Pop-Location }

if (-not $any) {
  Write-Host "Nothing to upload. Paste secret values into config\.env first."
  exit 0
}
Write-Host "All done. Secrets are live (no redeploy needed)."

