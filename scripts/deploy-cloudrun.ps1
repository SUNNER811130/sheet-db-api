param(
  [ValidateSet("console", "gcloud")]
  [string]$Mode = "console",
  [string]$Service = "",
  [string]$Region = "",
  [string]$Project = "",
  [string]$ServiceAccount = "",
  [string]$EnvFile = ".env",
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$allowlist = @(
  "SPREADSHEET_ID",
  "SHEETS_MEMBERS_TAB",
  "MEMBER_ROSTER_SHEET",
  "DUAL_WRITE_MEMBERS",
  "API_KEY",
  "LINE_REPLY_MODE",
  "SHEET_MAIN_PAID",
  "SHEET_ICE_HEART",
  "SHEET_FLOW",
  "SHEET_WUXING",
  "SHEET_EMOTION",
  "SHEET_LUCK20",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN"
)

function Read-DotEnv {
  param([string]$Path)

  $dict = @{}
  if (!(Test-Path -LiteralPath $Path)) {
    return $dict
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = [string]$_
    if ([string]::IsNullOrWhiteSpace($line)) { return }
    if ($line.Trim().StartsWith("#")) { return }

    $m = [regex]::Match($line, "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")
    if (!$m.Success) { return }

    $k = $m.Groups[1].Value
    $v = $m.Groups[2].Value.Trim()
    if (($v.StartsWith("'") -and $v.EndsWith("'")) -or ($v.StartsWith('"') -and $v.EndsWith('"'))) {
      $v = $v.Substring(1, $v.Length - 2)
    }

    $dict[$k] = $v
  }

  return $dict
}

function First-NonEmpty {
  param([string[]]$Values)
  foreach ($v in $Values) {
    if (![string]::IsNullOrWhiteSpace($v)) { return $v.Trim() }
  }
  return ""
}

function Require-OrTodo {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return "TODO_$Name"
  }
  return $Value.Trim()
}

$envValues = Read-DotEnv -Path $EnvFile

$serviceFinal = Require-OrTodo -Name "SERVICE" -Value (First-NonEmpty @($Service, $env:SERVICE))
$regionFinal = Require-OrTodo -Name "REGION" -Value (First-NonEmpty @($Region, $env:REGION))
$projectFinal = Require-OrTodo -Name "PROJECT" -Value (First-NonEmpty @($Project, $env:PROJECT))
$serviceAccountFinal = Require-OrTodo -Name "SERVICE_ACCOUNT" -Value (First-NonEmpty @($ServiceAccount, $env:SERVICE_ACCOUNT))

$keysPresent = @()
$allowlist | ForEach-Object {
  $k = $_
  if ($envValues.ContainsKey($k) -and ![string]::IsNullOrWhiteSpace([string]$envValues[$k])) {
    $keysPresent += $k
  }
}

Write-Host "[deploy-cloudrun] mode=$Mode"
Write-Host "[deploy-cloudrun] service=$serviceFinal region=$regionFinal project=$projectFinal"
Write-Host "[deploy-cloudrun] service-account=$serviceAccountFinal"
Write-Host "[deploy-cloudrun] env file=$EnvFile"
Write-Host ""
Write-Host "Allowlist env keys for this project:"
$allowlist | ForEach-Object { Write-Host "  - $_" }
Write-Host ""

if ($Mode -eq "console") {
  Write-Host "Console mode: fill these keys in Cloud Run > Edit and deploy new revision > Variables & Secrets:"
  if ($keysPresent.Count -eq 0) {
    Write-Host "  (none found from $EnvFile, fill manually by key name above)"
  } else {
    $keysPresent | ForEach-Object { Write-Host "  - $_" }
  }
  Write-Host ""
  Write-Host "Important:"
  Write-Host "  - Do NOT set GOOGLE_APPLICATION_CREDENTIALS on Cloud Run."
  Write-Host "  - Attach a user-managed service account to Cloud Run service identity."
  exit 0
}

$todoFlags = @($serviceFinal, $regionFinal, $projectFinal, $serviceAccountFinal) | Where-Object { $_ -like "TODO_*" }
if ($todoFlags.Count -gt 0) {
  Write-Host "Missing required inputs:"
  $todoFlags | ForEach-Object { Write-Host "  - $_" }
  Write-Host "Provide -Service -Region -Project -ServiceAccount (or set env vars SERVICE/REGION/PROJECT/SERVICE_ACCOUNT)."
  exit 1
}

$updatePairs = @()
foreach ($k in $keysPresent) {
  $v = [string]$envValues[$k]
  $escaped = $v.Replace("\", "\\").Replace(",", "\,")
  $updatePairs += "$k=$escaped"
}
$updateEnvArg = [string]::Join(",", $updatePairs)

$deployCmd = @(
  "gcloud", "run", "deploy", $serviceFinal,
  "--project", $projectFinal,
  "--region", $regionFinal,
  "--source", ".",
  "--service-account", $serviceAccountFinal,
  "--allow-unauthenticated"
)

$updateCmd = @(
  "gcloud", "run", "services", "update", $serviceFinal,
  "--project", $projectFinal,
  "--region", $regionFinal,
  "--service-account", $serviceAccountFinal
)
if ($updateEnvArg) {
  $updateCmd += @("--update-env-vars", $updateEnvArg)
}

$urlCmd = @(
  "gcloud", "run", "services", "describe", $serviceFinal,
  "--project", $projectFinal,
  "--region", $regionFinal,
  "--format", "value(status.url)"
)

Write-Host "gcloud mode (safe preview):"
Write-Host "  $(($deployCmd -join ' '))"
if ($updateEnvArg) {
  Write-Host "  gcloud run services update $serviceFinal --project $projectFinal --region $regionFinal --service-account $serviceAccountFinal --update-env-vars <redacted>"
} else {
  Write-Host "  gcloud run services update $serviceFinal --project $projectFinal --region $regionFinal --service-account $serviceAccountFinal"
}
Write-Host "  $(($urlCmd -join ' '))"
Write-Host ""
Write-Host "Notes:"
Write-Host "  - This uses --update-env-vars (safer than --set-env-vars)."
Write-Host "  - Values are never printed."
Write-Host "  - --set-env-vars can overwrite keys not listed; avoid it unless intentional."

if (!$Execute) {
  Write-Host ""
  Write-Host "Dry run only. Add -Execute to actually run gcloud commands."
  exit 0
}

& $deployCmd[0] $deployCmd[1..($deployCmd.Length - 1)]
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $updateCmd[0] $updateCmd[1..($updateCmd.Length - 1)]
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $urlCmd[0] $urlCmd[1..($urlCmd.Length - 1)]
exit $LASTEXITCODE
