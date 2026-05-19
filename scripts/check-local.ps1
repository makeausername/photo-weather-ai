$ErrorActionPreference = "Stop"

function Get-PortProcessIds {
  param([int]$Port)

  $processIds = @()

  try {
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    $processIds += $connections |
      Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 } |
      Select-Object -ExpandProperty OwningProcess
  } catch {
    $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)"
    $lines = netstat -ano -p tcp | Select-String -Pattern ":$Port\s"

    foreach ($line in $lines) {
      if ($line.Line -match $pattern) {
        $processIds += [int]$Matches[1]
      }
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

$hasProblem = $false

foreach ($port in @(3000, 4000)) {
  $processIds = @(Get-PortProcessIds -Port $port)

  if ($processIds.Count -eq 0) {
    Write-Host "端口 $port 可用."
  } else {
    Write-Warning "端口 $port 已被占用，PID：$($processIds -join ', ')"
    $hasProblem = $true
  }
}

if (Test-TcpPort -HostName "127.0.0.1" -Port 15432) {
  Write-Host "数据库隧道可用：127.0.0.1:15432"
} else {
  Write-Warning "未检测到数据库隧道：127.0.0.1:15432。请先打开 SSH tunnel."
  $hasProblem = $true
}

if ($hasProblem) {
  exit 1
}

Write-Host "本地开发环境检查通过."

