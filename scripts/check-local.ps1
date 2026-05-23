$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "local-env.ps1")

function Get-PortProcessIds {
  param([int]$Port)

  $processIds = @()

  try {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    $processIds += $connections |
      Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 } |
      Select-Object -ExpandProperty OwningProcess
  } catch {
    try {
      $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)"
      $lines = netstat -ano -p tcp | Select-String -Pattern ":$Port\s"

      foreach ($line in $lines) {
        if ($line.Line -match $pattern) {
          $processIds += [int]$Matches[1]
        }
      }
    } catch {
      Write-Warning "无法读取端口 $Port 占用情况：$($_.Exception.Message)"
    }
  }

  return $processIds | Sort-Object -Unique
}

function Test-TcpPort {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMilliseconds = 1000
  )

  $client = [System.Net.Sockets.TcpClient]::new()

  try {
    $asyncResult = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) {
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

function Test-AstroServiceHealth {
  param([string]$BaseUrl)

  try {
    $uri = [System.Uri]::new($BaseUrl.TrimEnd("/") + "/health")
    $response = Invoke-RestMethod -Uri $uri.AbsoluteUri -Method Get -TimeoutSec 3
    return [bool]$response.ok
  } catch {
    return $false
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$null = Import-LocalDotEnv -Path (Join-Path $repoRoot ".env.local")

if (-not $env:ASTRO_SERVICE_URL) {
  $env:ASTRO_SERVICE_URL = "http://127.0.0.1:4100"
}

if (-not $env:ASTRO_SERVICE_TIMEOUT_MS) {
  $env:ASTRO_SERVICE_TIMEOUT_MS = "45000"
}

$hasProblem = $false

foreach ($port in @(3000, 4000)) {
  $processIds = @(Get-PortProcessIds -Port $port)

  if ($processIds.Count -eq 0) {
    Write-Host "应用端口 $port 可用。"
  } else {
    Write-Warning "应用端口 $port 已被占用，PID：$($processIds -join ', ')"
    $hasProblem = $true
  }
}

if (Test-TcpPort -HostName "127.0.0.1" -Port 15432) {
  Write-Host "数据库隧道可用：127.0.0.1:15432"
} else {
  Write-Warning "未检测到数据库隧道：127.0.0.1:15432。请先打开 SSH tunnel。"
  $hasProblem = $true
}

if ($env:ENABLE_ASTRO_SERVICE -and $env:ENABLE_ASTRO_SERVICE.ToLowerInvariant() -eq "true") {
  try {
    $astroUri = [System.Uri]::new($env:ASTRO_SERVICE_URL)
    $astroPort = if ($astroUri.Port -gt 0) { $astroUri.Port } else { 4100 }
    $astroHost = if ($astroUri.Host -eq "localhost") { "127.0.0.1" } else { $astroUri.Host }
    $astroHealthBaseUrl = "$($astroUri.Scheme)://$astroHost`:$astroPort"

    if (
      (Test-TcpPort -HostName $astroHost -Port $astroPort) -and
      (Test-AstroServiceHealth -BaseUrl $astroHealthBaseUrl)
    ) {
      Write-Host "天文计算服务：可用"
    } else {
      Write-Warning "天文计算服务：不可用，请先启动 apps/astro-service"
      $hasProblem = $true
    }
  } catch {
    Write-Warning "天文计算服务：不可用，请检查 ASTRO_SERVICE_URL"
    $hasProblem = $true
  }
}

if ($hasProblem) {
  exit 1
}

Write-Host "本地开发环境检查通过。"
