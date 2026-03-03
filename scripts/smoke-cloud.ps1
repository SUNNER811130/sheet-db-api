param(
  [string]$RunUrl = "",
  [string]$Uid = "U_SMOKE_CLOUD"
)

$ErrorActionPreference = "Stop"

function Show-PossibleCauses {
  Write-Host ""
  Write-Host "Possible causes:"
  Write-Host "  - Cloud Run env vars are missing or incorrect."
  Write-Host "  - Cloud Run service account is not shared on target Google Sheet."
  Write-Host "  - Cloud Run service is not allowing unauthenticated access."
}

try {
  if ([string]::IsNullOrWhiteSpace($RunUrl)) {
    $RunUrl = Read-Host "Paste Cloud Run URL (example: https://xxxxx.run.app)"
  }

  if ([string]::IsNullOrWhiteSpace($RunUrl)) {
    throw "RUN_URL is required."
  }

  $RunUrl = $RunUrl.Trim().TrimEnd("/")
  if ($RunUrl -notmatch "^https?://") {
    throw "RUN_URL must start with http:// or https://"
  }

  $healthUrl = "$RunUrl/health"
  Write-Host "[smoke-cloud] checking health: $healthUrl"

  $healthRaw = curl.exe -sS $healthUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to call /health."
  }

  $healthJson = $null
  try {
    $healthJson = $healthRaw | ConvertFrom-Json
  } catch {
    throw "/health response is not valid JSON."
  }

  if ($null -eq $healthJson -or $healthJson.ok -ne $true) {
    throw "/health did not return ok=true."
  }

  Write-Host "[smoke-cloud] health check passed"
  $env:RUN_URL = $RunUrl

  Write-Host "[smoke-cloud] running npm run smoke:cloud"
  npm run smoke:cloud -- --uid $Uid
  if ($LASTEXITCODE -ne 0) {
    throw "smoke:cloud failed."
  }

  Write-Host "[smoke-cloud] completed"
} catch {
  Write-Host "[smoke-cloud] failed: $($_.Exception.Message)"
  Show-PossibleCauses
  exit 1
}
