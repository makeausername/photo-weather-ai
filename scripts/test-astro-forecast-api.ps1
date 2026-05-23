$ErrorActionPreference = "Stop"

try {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
} catch {
  # Output encoding setup is best-effort for older hosts.
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
if ($repoRoot -and (Test-Path -LiteralPath $repoRoot)) {
  Set-Location -LiteralPath $repoRoot
}

$envFile = Join-Path $repoRoot ".env.local"
$logDir = Join-Path $repoRoot "logs"

function ConvertFrom-DotEnvValue {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  $trimmed = $Value.Trim()
  if ($trimmed.Length -ge 2) {
    $first = $trimmed.Substring(0, 1)
    $last = $trimmed.Substring($trimmed.Length - 1, 1)
    if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
      return $trimmed.Substring(1, $trimmed.Length - 2)
    }
  }

  return $trimmed
}

function Import-DotEnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $false
  }

  $loaded = $false
  $lines = Get-Content -LiteralPath $Path -Encoding UTF8
  foreach ($rawLine in $lines) {
    $line = $rawLine.Trim()
    if (-not $line) {
      continue
    }
    if ($line.StartsWith("#")) {
      continue
    }
    if ($line.StartsWith("export ")) {
      $line = $line.Substring(7).Trim()
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $name = $line.Substring(0, $separatorIndex).Trim()
    if ($name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
      continue
    }

    $value = ConvertFrom-DotEnvValue -Value $line.Substring($separatorIndex + 1)
    Set-Item -Path ("Env:" + $name) -Value $value
    $loaded = $true
  }

  return $loaded
}

function New-UnicodeString {
  param([int[]]$CodePoints)

  $text = ""
  foreach ($codePoint in $CodePoints) {
    $text = $text + [char]$codePoint
  }
  return $text
}

function Protect-SecretText {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }

  $safe = $Value
  $safe = $safe.Replace([string][char]0, "")
  $safe = $safe -replace '(?i)("?(apiKey|api_key|token|authorization|jwt_secret|secret)"?\s*[:=]\s*)("[^"]*"|[^&\s,}]+)', '$1[redacted]'
  $safe = $safe -replace '(postgresql://[^:/\s]+:)[^@\s]+(@)', '$1***$2'
  $safe = $safe -replace '(postgres://[^:/\s]+:)[^@\s]+(@)', '$1***$2'
  return $safe
}

function Read-HttpErrorBody {
  param([object]$ErrorRecord)

  try {
    if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
      return [string]$ErrorRecord.ErrorDetails.Message
    }
  } catch {
  }

  try {
    $response = $ErrorRecord.Exception.Response
    if ($response -and $response.GetResponseStream) {
      $stream = $response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader -ArgumentList $stream, [System.Text.Encoding]::UTF8
        return $reader.ReadToEnd()
      }
    }
  } catch {
  }

  try {
    $response = $ErrorRecord.Exception.Response
    if ($response -and $response.Content) {
      return $response.Content.ReadAsStringAsync().Result
    }
  } catch {
  }

  return ""
}

function Get-HttpStatusCode {
  param([object]$ErrorRecord)

  try {
    if ($ErrorRecord.Exception.Response -and $ErrorRecord.Exception.Response.StatusCode) {
      return [int]$ErrorRecord.Exception.Response.StatusCode
    }
  } catch {
  }

  return $null
}

function Get-LatestApiLogPath {
  $pointerPath = Join-Path $logDir "photo-weather-api-latest.txt"

  if (Test-Path -LiteralPath $pointerPath) {
    $pointerValue = Get-Content -LiteralPath $pointerPath -Encoding UTF8 -TotalCount 1 -ErrorAction SilentlyContinue
    if ($pointerValue -and (Test-Path -LiteralPath $pointerValue)) {
      return $pointerValue
    }
  }

  if (-not (Test-Path -LiteralPath $logDir)) {
    return $null
  }

  $latest = Get-ChildItem -LiteralPath $logDir -Filter "photo-weather-api-*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($latest) {
    return $latest.FullName
  }

  return $null
}

function Write-JsonOrRaw {
  param([string]$Content)

  if (-not $Content) {
    Write-Host "Response body: empty"
    return
  }

  try {
    $json = $Content | ConvertFrom-Json
    $formatted = $json | ConvertTo-Json -Depth 32
    Write-Host (Protect-SecretText -Value $formatted)
  } catch {
    Write-Host (Protect-SecretText -Value $Content)
  }
}

function Write-ApiLogTail {
  $apiLogPath = Get-LatestApiLogPath

  if ($apiLogPath) {
    Write-Host ""
    Write-Host ("Latest API log: " + $apiLogPath)
  } else {
    Write-Host ""
    Write-Host "Latest API log: not found"
    return
  }

  if (Test-Path -LiteralPath $apiLogPath) {
    Write-Host "API log tail (last 120 lines)"
    $tailLines = Get-Content -LiteralPath $apiLogPath -Encoding UTF8 -Tail 120 -ErrorAction SilentlyContinue
    foreach ($line in $tailLines) {
      Write-Host (Protect-SecretText -Value $line)
    }
  }
}

$null = Import-DotEnvFile -Path $envFile

$forecastUrl = "http://localhost:4000/forecast/calculate"
$spotName = New-UnicodeString -CodePoints @(0x9EC4, 0x5C71, 0x5149, 0x660E, 0x9876)
$script:hadFailure = $false

function Get-RequestTimeoutSeconds {
  $defaultTimeoutMs = 45000
  $timeoutMs = $defaultTimeoutMs
  if ($env:ASTRO_SERVICE_TIMEOUT_MS -and $env:ASTRO_SERVICE_TIMEOUT_MS -match "^[0-9]+$") {
    $parsed = [int64]$env:ASTRO_SERVICE_TIMEOUT_MS
    if ($parsed -gt 0) {
      $timeoutMs = $parsed
    }
  }

  $seconds = [int][Math]::Ceiling($timeoutMs / 1000)
  return [Math]::Max(30, $seconds + 15)
}

function New-AstroForecastPayload {
  param([string]$Horizon)

  $payload = New-Object PSObject
  $payload | Add-Member -MemberType NoteProperty -Name name -Value $spotName
  $payload | Add-Member -MemberType NoteProperty -Name source -Value "local_photo_spot"
  $payload | Add-Member -MemberType NoteProperty -Name latitudeGcj02 -Value 30.13254
  $payload | Add-Member -MemberType NoteProperty -Name longitudeGcj02 -Value 118.16876
  $payload | Add-Member -MemberType NoteProperty -Name latitudeWgs84 -Value 30.1321
  $payload | Add-Member -MemberType NoteProperty -Name longitudeWgs84 -Value 118.1691
  $payload | Add-Member -MemberType NoteProperty -Name elevationMeters -Value 1800
  $payload | Add-Member -MemberType NoteProperty -Name timezone -Value "Asia/Shanghai"
  $payload | Add-Member -MemberType NoteProperty -Name horizon -Value $Horizon
  $payload | Add-Member -MemberType NoteProperty -Name target -Value "astro"
  $payload | Add-Member -MemberType NoteProperty -Name locationId -Value "location-huangshan"
  $payload | Add-Member -MemberType NoteProperty -Name photoSpotId -Value "spot-guangmingding"
  return $payload
}

function Invoke-AstroForecast {
  param([string]$Horizon)

  $payload = New-AstroForecastPayload -Horizon $Horizon
  $json = $payload | ConvertTo-Json -Depth 8
  $requestBody = [System.Text.Encoding]::UTF8.GetBytes($json)
  $requestTimeoutSec = Get-RequestTimeoutSeconds
  $configuredTimeout = "missing"
  if ($env:ASTRO_SERVICE_TIMEOUT_MS) {
    $configuredTimeout = $env:ASTRO_SERVICE_TIMEOUT_MS
  }

  Write-Host ""
  Write-Host ("POST " + $forecastUrl)
  Write-Host ("Payload: target=astro horizon=" + $Horizon + " WGS84=30.1321,118.1691 elevation=1800 timezone=Asia/Shanghai")
  Write-Host ("ASTRO_SERVICE_TIMEOUT_MS: " + $configuredTimeout)
  Write-Host ("HTTP request timeout seconds: " + $requestTimeoutSec)

  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest `
      -Uri $forecastUrl `
      -Method Post `
      -ContentType "application/json; charset=utf-8" `
      -Body $requestBody `
      -UseBasicParsing `
      -TimeoutSec $requestTimeoutSec

    $timer.Stop()
    Write-Host ("HTTP status: " + $response.StatusCode)
    Write-Host ("Elapsed ms: " + [int]$timer.Elapsed.TotalMilliseconds)
    Write-JsonOrRaw -Content ([string]$response.Content)
  } catch {
    $timer.Stop()
    $script:hadFailure = $true
    $status = Get-HttpStatusCode -ErrorRecord $_
    if ($null -ne $status) {
      Write-Warning ("Forecast API request failed. HTTP status: " + $status)
    } else {
      Write-Warning "Forecast API request failed. HTTP status: unknown"
    }
    Write-Host ("Elapsed ms: " + [int]$timer.Elapsed.TotalMilliseconds)

    $body = Read-HttpErrorBody -ErrorRecord $_
    if ($body) {
      Write-JsonOrRaw -Content $body
    } else {
      Write-Warning (Protect-SecretText -Value $_.Exception.Message)
    }
  }
}

Write-Host "Checks: horizon=24h and horizon=7d"
foreach ($horizon in @("24h", "7d")) {
  Invoke-AstroForecast -Horizon $horizon
}

Write-ApiLogTail

if ($script:hadFailure) {
  exit 1
}
