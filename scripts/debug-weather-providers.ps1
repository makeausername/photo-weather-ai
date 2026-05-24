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

  $json = $Value | ConvertTo-Json -Depth 10
  return Protect-SecretText -Value $json
}

Write-Host ("API base URL: " + $apiBaseUrl)

try {
  $health = Invoke-RestMethod -Uri ($apiBaseUrl + "/health") -Method Get -TimeoutSec 10
  Write-Host "API health:"
  Write-Host (ConvertTo-SafeJson -Value $health)
} catch {
  Write-Error ("API is not reachable. Start it with corepack pnpm dev:local. " + (Protect-SecretText -Value $_.Exception.Message))
  exit 1
}

try {
  $providers = Invoke-RestMethod -Uri ($apiBaseUrl + "/debug/providers") -Method Get -TimeoutSec 15
  Write-Host "Weather provider debug status:"
  Write-Host (ConvertTo-SafeJson -Value $providers)
  exit 0
} catch {
  Write-Error ("Provider debug endpoint failed or is disabled outside local development. " + (Protect-SecretText -Value $_.Exception.Message))
  exit 1
}
