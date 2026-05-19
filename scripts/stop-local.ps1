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

function Stop-PortProcess {
  param([int]$Port)

  $processIds = @(Get-PortProcessIds -Port $Port)

  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "已停止占用端口 $Port 的进程：PID $processId"
    } catch {
      Write-Warning "无法停止端口 $Port 的进程 PID $processId：$($_.Exception.Message)"
    }
  }
}

foreach ($jobName in @("photo-weather-api", "photo-weather-web")) {
  $jobs = @(Get-Job -Name $jobName -ErrorAction SilentlyContinue)

  foreach ($job in $jobs) {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    Write-Host "已停止后台任务：$jobName"
  }
}

Stop-PortProcess -Port 3000
Stop-PortProcess -Port 4000

Write-Host "本地服务已停止."

