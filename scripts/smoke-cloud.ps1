param(
  [Parameter(Mandatory = $true)]
  [string]$RunUrl,
  [string]$Uid = "U_SMOKE_CLOUD"
)

$ErrorActionPreference = "Stop"

node scripts/smoke.js --no-auto-start --base $RunUrl --uid $Uid
