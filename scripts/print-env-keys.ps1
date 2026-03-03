param(
  [string]$EnvExamplePath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$target = if ([string]::IsNullOrWhiteSpace($EnvExamplePath)) {
  Join-Path $repoRoot ".env.example"
} else {
  $EnvExamplePath
}

if (!(Test-Path -LiteralPath $target)) {
  Write-Error "File not found: $target"
  exit 1
}

$exclude = @("GOOGLE_APPLICATION_CREDENTIALS")
$keys = New-Object System.Collections.Generic.List[string]

Get-Content -LiteralPath $target | ForEach-Object {
  $line = [string]$_
  if ([string]::IsNullOrWhiteSpace($line)) { return }
  if ($line.Trim().StartsWith("#")) { return }

  $m = [regex]::Match($line, "^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=")
  if (!$m.Success) { return }

  $key = $m.Groups[1].Value
  if ($exclude -contains $key) { return }
  $keys.Add($key)
}

$keys | Sort-Object -Unique | ForEach-Object { Write-Output $_ }
