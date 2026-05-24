$ErrorActionPreference = "Stop"

try {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
} catch {
  # Output encoding setup is best-effort for older hosts.
}

. (Join-Path $PSScriptRoot "local-env.ps1")

$repoRoot = Split-Path -Parent $PSScriptRoot
$null = Import-LocalDotEnv -Path (Join-Path $repoRoot ".env.local")

$apiBaseUrl = $env:NEXT_PUBLIC_API_BASE_URL
if (-not $apiBaseUrl) {
  $apiBaseUrl = "http://localhost:4000"
}
$apiBaseUrl = $apiBaseUrl.TrimEnd("/")

function Protect-SecretText {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  $safe = $Value
  $safe = $safe -replace '(?i)(apiKey|api_key|apikey|key|token|authorization|secret)(["\s:=]+)([^&\s,}"]+)', '$1$2[redacted]'
  $safe = $safe -replace '(?i)((apikey|key|token)=)[^&\s]+', '$1[redacted]'
  return $safe
}

function ConvertTo-SafeJson {
  param([object]$Value)

  $json = $Value | ConvertTo-Json -Depth 12
  return Protect-SecretText -Value $json
}

function Write-ListOrEmpty {
  param(
    [string]$Title,
    [object]$Value
  )

  Write-Host $Title
  if ($null -eq $Value) {
    Write-Host "[]"
    return
  }

  Write-Host (ConvertTo-SafeJson -Value $Value)
}

Write-Host ("API base URL: " + $apiBaseUrl)
Write-Host "Weather fusion test location: 黄山光明顶 WGS84 30.1328,118.1718"

try {
  $health = Invoke-RestMethod -Uri ($apiBaseUrl + "/health") -Method Get -TimeoutSec 10
  Write-Host "API health:"
  Write-Host (ConvertTo-SafeJson -Value $health)
} catch {
  Write-Error ("API is not reachable. Start it with corepack pnpm dev:local. " + (Protect-SecretText -Value $_.Exception.Message))
  exit 1
}

try {
  $result = Invoke-RestMethod -Uri ($apiBaseUrl + "/debug/weather-fusion") -Method Get -TimeoutSec 30

  Write-Host "Weather fusion provider:"
  Write-Host ("- providerCode: " + $result.providerCode)
  Write-Host ("- providerLabelZh: " + $result.providerLabelZh)
  Write-Host ("- dataMode: " + $result.dataMode)
  Write-Host ("- noticeZh: " + $result.noticeZh)

  Write-ListOrEmpty -Title "Source summaries:" -Value $result.sourceSummaries
  Write-ListOrEmpty -Title "Confidence by target:" -Value $result.confidenceByTarget
  Write-ListOrEmpty -Title "Conflict flags:" -Value $result.conflictFlags
  Write-ListOrEmpty -Title "Fusion summary:" -Value $result.fusionSummary

  if ($result.dataMode -eq "real") {
    Write-Host "Data mode used: real provider data"
  } elseif ($result.dataMode -eq "fixture") {
    Write-Host "Data mode used: fixture data"
  } else {
    Write-Host "Data mode used: demo data"
  }

  exit 0
} catch {
  Write-Error ("Weather fusion debug endpoint failed or is disabled outside local development. " + (Protect-SecretText -Value $_.Exception.Message))
  exit 1
}
