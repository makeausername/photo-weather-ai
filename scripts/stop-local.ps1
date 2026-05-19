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

function Stop-PortProcess {
  param([int]$Port)

  $processIds = @(Get-PortProcessIds -Port $Port)

  if ($processIds.Count -eq 0) {
    Write-Host "端口 $Port 未被占用。"
    return
  }

  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "已停止占用端口 $Port 的进程：PID $processId"
    } catch {
      Write-Warning "无法停止端口 $Port 的进程 PID $processId：$($_.Exception.Message)"
    }
  }
}

function Stop-LocalJob {
  param([string]$Name)

  $jobs = @(Get-Job -Name $Name -ErrorAction SilentlyContinue -WarningAction SilentlyContinue)

  if ($jobs.Count -eq 0) {
    Write-Host "未发现后台任务：$Name"
    return
  }

  foreach ($job in $jobs) {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    Write-Host "已停止后台任务：$Name"
  }
}

Write-Host "正在停止逐光天气本地服务..."
Stop-LocalJob -Name "photo-weather-api"
Stop-LocalJob -Name "photo-weather-web"
Stop-PortProcess -Port 3000
Stop-PortProcess -Port 4000
Start-Sleep -Milliseconds 800

foreach ($port in @(3000, 4000)) {
  $processIds = @(Get-PortProcessIds -Port $port)

  if ($processIds.Count -eq 0) {
    Write-Host "端口 $port 已释放。"
  } else {
    Write-Warning "端口 $port 仍被占用，PID：$($processIds -join ', ')"
  }
}

Write-Host "本地服务停止流程已完成。"
