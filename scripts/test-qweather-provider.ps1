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

$accessToken = $env:PHOTO_WEATHER_ADMIN_ACCESS_TOKEN
if (-not $accessToken) {
  $accessToken = $env:ADMIN_ACCESS_TOKEN
}

function Protect-SecretText {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  $safe = $Value
  $safe = $safe -replace '(?i)(apiKey|api_key|key|token|authorization|secret)(["\s:=]+)([^&\s,}"]+)', '$1$2[redacted]'
  $safe = $safe -replace '(?i)(key=)[^&\s]+', '$1[redacted]'
  return $safe
}

function ConvertTo-SafeJson {
  param([object]$Value)

  $json = $Value | ConvertTo-Json -Depth 8
  return Protect-SecretText -Value $json
}

function Invoke-JsonGet {
  param([string]$Url)

  return Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 15
}

function Invoke-JsonPost {
  param(
    [string]$Url,
    [string]$Token
  )

  $headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
  }

  return Invoke-RestMethod -Uri $Url -Method Post -Headers $headers -Body "{}" -TimeoutSec 30
}

function Write-DebugStatus {
  try {
    $debug = Invoke-JsonGet -Url ($apiBaseUrl + "/debug/providers")
    Write-Host "QWeather debug status:"
    Write-Host (ConvertTo-SafeJson -Value $debug.qweather)
    return $true
  } catch {
    Write-Warning ("Local debug endpoint unavailable: " + (Protect-SecretText -Value $_.Exception.Message))
    return $false
  }
}

Write-Host ("API base URL: " + $apiBaseUrl)

if ($accessToken) {
  try {
    $result = Invoke-JsonPost -Url ($apiBaseUrl + "/admin/providers/weather/qweather/test-connection") -Token $accessToken
    Write-Host "QWeather admin test endpoint result:"
    Write-Host (ConvertTo-SafeJson -Value $result)
    exit 0
  } catch {
    Write-Warning ("QWeather admin test endpoint failed: " + (Protect-SecretText -Value $_.Exception.Message))
    if (Write-DebugStatus) {
      Write-Host "Manual UI test remains primary when admin auth is not available to this script."
      exit 0
    }
    exit 1
  }
}

Write-Host "No PHOTO_WEATHER_ADMIN_ACCESS_TOKEN or ADMIN_ACCESS_TOKEN found."
if (Write-DebugStatus) {
  Write-Host "Manual UI test is primary for real QWeather connection testing."
  exit 0
}

exit 1
