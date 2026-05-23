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

function Mask-DatabaseUrl {
  param([string]$Value)

  if (-not $Value) {
    return ""
  }

  try {
    $builder = New-Object System.UriBuilder -ArgumentList $Value
    if ($builder.Password) {
      $builder.Password = "***"
    }
    return $builder.Uri.AbsoluteUri
  } catch {
    return ($Value -replace "(://[^:/?#]+:)[^@/?#]+(@)", '$1***$2')
  }
}

function Sanitize-Url {
  param([string]$Value)

  if (-not $Value) {
    return "not configured"
  }

  try {
    $builder = New-Object System.UriBuilder -ArgumentList $Value
    $builder.UserName = ""
    $builder.Password = ""
    $builder.Query = ""
    $builder.Fragment = ""
    $uri = $builder.Uri.AbsoluteUri.TrimEnd("/")
    return $uri
  } catch {
    return "<invalid-url>"
  }
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

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMilliseconds
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
    $connected = $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)
    if (-not $connected) {
      return $false
    }
    $client.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Status-Text {
  param([bool]$Ok)

  if ($Ok) {
    return "OK"
  }

  return "FAIL"
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

function Invoke-JsonGet {
  param([string]$Url)

  $result = New-Object PSObject
  $result | Add-Member -MemberType NoteProperty -Name Ok -Value $false
  $result | Add-Member -MemberType NoteProperty -Name Status -Value $null
  $result | Add-Member -MemberType NoteProperty -Name Body -Value $null
  $result | Add-Member -MemberType NoteProperty -Name RawBody -Value ""
  $result | Add-Member -MemberType NoteProperty -Name Error -Value $null

  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 3
    $result.Ok = $true
    $result.Status = [int]$response.StatusCode
    $result.RawBody = [string]$response.Content
    if ($response.Content) {
      try {
        $result.Body = $response.Content | ConvertFrom-Json
      } catch {
        $result.Body = $null
      }
    }
  } catch {
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $result.Status = [int]$_.Exception.Response.StatusCode
      }
    } catch {
      $result.Status = $null
    }
    $result.RawBody = Read-HttpErrorBody -ErrorRecord $_
    $result.Error = Protect-SecretText -Value $_.Exception.Message
  }

  return $result
}

function Get-LatestLogPath {
  param(
    [string]$PointerPath,
    [string]$SearchPattern
  )

  if (Test-Path -LiteralPath $PointerPath) {
    $pointerValue = Get-Content -LiteralPath $PointerPath -Encoding UTF8 -TotalCount 1 -ErrorAction SilentlyContinue
    if ($pointerValue -and (Test-Path -LiteralPath $pointerValue)) {
      return $pointerValue
    }
  }

  if (-not (Test-Path -LiteralPath $logDir)) {
    return $null
  }

  $latest = Get-ChildItem -LiteralPath $logDir -Filter $SearchPattern -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($latest) {
    return $latest.FullName
  }

  return $null
}

function Write-EnvStatus {
  param(
    [string]$Name,
    [string]$Value,
    [bool]$IsDatabaseUrl
  )

  if ($Value) {
    if ($IsDatabaseUrl) {
      Write-Host ($Name + ": present, " + (Mask-DatabaseUrl -Value $Value))
    } elseif ($Name -eq "ASTRO_SERVICE_URL") {
      Write-Host ($Name + ": present, " + (Sanitize-Url -Value $Value))
    } elseif ($Name -eq "ASTRO_SERVICE_TIMEOUT_MS") {
      Write-Host ($Name + ": present, " + $Value)
    } else {
      Write-Host ($Name + ": present")
    }
  } else {
    Write-Host ($Name + ": missing")
  }
}

$envLoaded = Import-DotEnvFile -Path $envFile
$astroServiceTimeoutConfigured = [bool]$env:ASTRO_SERVICE_TIMEOUT_MS

if (-not $env:ASTRO_SERVICE_URL) {
  $env:ASTRO_SERVICE_URL = "http://127.0.0.1:4100"
}

if (-not $env:ASTRO_SERVICE_TIMEOUT_MS) {
  $env:ASTRO_SERVICE_TIMEOUT_MS = "45000"
}

if (-not $env:NEXT_PUBLIC_API_BASE_URL) {
  $env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000"
}

Write-Host "Astro local diagnostics"
Write-Host ("Repo root: " + $repoRoot)
if ($envLoaded) {
  Write-Host ".env.local: loaded"
} else {
  Write-Host ".env.local: missing or empty"
}
Write-Host ""

Write-Host "Environment"
Write-EnvStatus -Name "DATABASE_URL" -Value $env:DATABASE_URL -IsDatabaseUrl $true
Write-EnvStatus -Name "NEXT_PUBLIC_API_BASE_URL" -Value $env:NEXT_PUBLIC_API_BASE_URL -IsDatabaseUrl $false
Write-EnvStatus -Name "ENABLE_ASTRO_SERVICE" -Value $env:ENABLE_ASTRO_SERVICE -IsDatabaseUrl $false
Write-EnvStatus -Name "ASTRO_SERVICE_URL" -Value $env:ASTRO_SERVICE_URL -IsDatabaseUrl $false
if ($astroServiceTimeoutConfigured) {
  Write-EnvStatus -Name "ASTRO_SERVICE_TIMEOUT_MS" -Value $env:ASTRO_SERVICE_TIMEOUT_MS -IsDatabaseUrl $false
} else {
  Write-Host ("ASTRO_SERVICE_TIMEOUT_MS: missing, local default " + $env:ASTRO_SERVICE_TIMEOUT_MS)
}
Write-Host ""

$dbOk = Test-TcpPort -HostName "127.0.0.1" -Port 15432 -TimeoutMilliseconds 1000
$webOk = Test-TcpPort -HostName "127.0.0.1" -Port 3000 -TimeoutMilliseconds 1000
$apiOk = Test-TcpPort -HostName "127.0.0.1" -Port 4000 -TimeoutMilliseconds 1000
$astroPortOk = Test-TcpPort -HostName "127.0.0.1" -Port 4100 -TimeoutMilliseconds 1000

Write-Host "Ports"
Write-Host ("DB tunnel: " + (Status-Text -Ok $dbOk))
Write-Host ("Web: " + (Status-Text -Ok $webOk))
Write-Host ("API: " + (Status-Text -Ok $apiOk))
Write-Host ("Astro service port: " + (Status-Text -Ok $astroPortOk))
Write-Host ""

$astroHealth = Invoke-JsonGet -Url "http://127.0.0.1:4100/health"
$astroHealthOk = $false
if ($astroHealth.Ok -and $astroHealth.Body) {
  if ($astroHealth.Body.ok -eq $true) {
    $astroHealthOk = $true
  }
}

$astroDebug = Invoke-JsonGet -Url "http://localhost:4000/debug/astro-service"

Write-Host "HTTP"
Write-Host ("Astro service: " + (Status-Text -Ok $astroHealthOk) + " status=" + $astroHealth.Status)

if ($astroDebug.Ok -and $astroDebug.Body) {
  Write-Host ("Astro enabled: " + $astroDebug.Body.enabled)
  Write-Host ("Astro URL: " + $astroDebug.Body.url)
  if ($null -ne $astroDebug.Body.timeoutMs) {
    Write-Host ("Astro resolved timeout ms: " + $astroDebug.Body.timeoutMs)
  }
  Write-Host ("Astro health via API: " + $astroDebug.Body.healthOk)
  Write-Host ("Astro health status via API: " + $astroDebug.Body.healthStatus)
  if ($null -ne $astroDebug.Body.timezoneAvailable) {
    Write-Host ("Timezone available: " + $astroDebug.Body.timezoneAvailable)
  }
  if ($null -ne $astroDebug.Body.ephemerisAvailable) {
    Write-Host ("Ephemeris available: " + $astroDebug.Body.ephemerisAvailable)
  }
  if ($astroDebug.Body.ephemerisFileName) {
    Write-Host ("Ephemeris file: " + $astroDebug.Body.ephemerisFileName)
  }
  if ($astroDebug.Body.lastError) {
    Write-Host ("Astro last error: " + (Protect-SecretText -Value $astroDebug.Body.lastError))
  }
} else {
  $enabled = "false"
  if ($env:ENABLE_ASTRO_SERVICE) {
    $enabled = $env:ENABLE_ASTRO_SERVICE
  }
  Write-Host ("Astro enabled: " + $enabled + " (from local env; debug endpoint unavailable)")
  Write-Host ("Astro URL: " + (Sanitize-Url -Value $env:ASTRO_SERVICE_URL))
  if ($astroDebug.Error) {
    Write-Host ("Debug endpoint error: " + $astroDebug.Error)
  }
}
Write-Host ""

$apiLatestPointer = Join-Path $logDir "photo-weather-api-latest.txt"
$webLatestPointer = Join-Path $logDir "photo-weather-web-latest.txt"
$apiLogPath = Get-LatestLogPath -PointerPath $apiLatestPointer -SearchPattern "photo-weather-api-*.log"
$webLogPath = Get-LatestLogPath -PointerPath $webLatestPointer -SearchPattern "photo-weather-web-*.log"

if ($apiLogPath) {
  Write-Host ("Latest API log: " + $apiLogPath)
} else {
  Write-Host "Latest API log: not found"
}

if ($webLogPath) {
  Write-Host ("Latest Web log: " + $webLogPath)
} else {
  Write-Host "Latest Web log: not found"
}

if ($apiLogPath -and (Test-Path -LiteralPath $apiLogPath)) {
  Write-Host ""
  Write-Host "API log tail (last 120 lines)"
  $tailLines = Get-Content -LiteralPath $apiLogPath -Encoding UTF8 -Tail 120 -ErrorAction SilentlyContinue
  foreach ($line in $tailLines) {
    Write-Host (Protect-SecretText -Value $line)
  }

  Write-Host ""
  Write-Host "API log keyword matches"
  $keywords = @("astro", "Astro", "ASTRO", "forecast", "calculate", "503", "fetch", "ECONN", "error", "Error")
  $matches = @()
  $allLines = Get-Content -LiteralPath $apiLogPath -Encoding UTF8 -ErrorAction SilentlyContinue
  $lineNumber = 0
  foreach ($line in $allLines) {
    $lineNumber = $lineNumber + 1
    $safeLine = Protect-SecretText -Value $line
    foreach ($keyword in $keywords) {
      if ($safeLine -like ("*" + $keyword + "*")) {
        $matchItem = New-Object PSObject
        $matchItem | Add-Member -MemberType NoteProperty -Name LineNumber -Value $lineNumber
        $matchItem | Add-Member -MemberType NoteProperty -Name Line -Value $safeLine
        $matches = $matches + $matchItem
        break
      }
    }
  }
  $matches = $matches | Select-Object -Last 120

  if ($matches) {
    foreach ($match in $matches) {
      Write-Host (([string]$match.LineNumber) + ": " + $match.Line)
    }
  } else {
    Write-Host "No keyword matches found."
  }
} else {
  Write-Host "API log tail: not available"
}
