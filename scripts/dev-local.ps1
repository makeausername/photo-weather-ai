param(
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.local"
$logDir = Join-Path $repoRoot "logs"
$apiLog = Join-Path $logDir "photo-weather-api.log"
$webLog = Join-Path $logDir "photo-weather-web.log"

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

function Stop-LocalJob {
  param([string]$Name)

  $jobs = @(Get-Job -Name $Name -ErrorAction SilentlyContinue)

  foreach ($job in $jobs) {
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    Write-Host "已清理后台任务：$Name"
  }
}

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    Write-Host "未找到 .env.local，使用脚本内置本地默认值."
    return
  }

  foreach ($rawLine in Get-Content $Path) {
    $line = $rawLine.Trim()

    if (-not $line -or $line.StartsWith("#")) {
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
    $value = $line.Substring($separatorIndex + 1).Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    Set-Item -Path "Env:$name" -Value $value
  }

  Write-Host "已加载 .env.local."
}

function Export-ProcessEnvironment {
  $envMap = @{}
  Get-ChildItem Env: | ForEach-Object {
    $envMap[$_.Name] = $_.Value
  }

  return $envMap
}

function Start-LocalJob {
  param(
    [string]$Name,
    [string]$LogPath,
    [scriptblock]$ScriptBlock,
    [hashtable]$Environment
  )

  if (Test-Path $LogPath) {
    Remove-Item $LogPath -Force
  }

  Start-Job -Name $Name -ScriptBlock $ScriptBlock -ArgumentList $repoRoot, $LogPath, $Environment | Out-Null
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (@(Get-PortProcessIds -Port $Port).Count -gt 0) {
      return $true
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

Set-Location $repoRoot
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host "正在清理已有本地服务..."
Stop-LocalJob -Name "photo-weather-api"
Stop-LocalJob -Name "photo-weather-web"
Stop-PortProcess -Port 3000
Stop-PortProcess -Port 4000

if ($Clean) {
  $nextDir = Join-Path $repoRoot "apps/web/.next"
  if (Test-Path $nextDir) {
    Remove-Item $nextDir -Recurse -Force
    Write-Host "已清理 apps/web/.next."
  }
}

Import-DotEnv -Path $envFile

if (-not $env:NEXT_PUBLIC_API_BASE_URL) {
  $env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000"
}

if (-not $env:JWT_SECRET -or $env:JWT_SECRET.Length -lt 32) {
  if ($env:JWT_SECRET) {
    Write-Warning "JWT_SECRET 少于 32 字符，已使用本地临时值."
  }

  $env:JWT_SECRET = "change-this-local-dev-secret-for-dev-only"
}

$env:PORT = "4000"

$jobEnvironment = Export-ProcessEnvironment

$apiScript = {
  param([string]$RepoRoot, [string]$LogPath, [hashtable]$Environment)

  foreach ($item in $Environment.GetEnumerator()) {
    Set-Item -Path "Env:$($item.Key)" -Value $item.Value
  }

  Set-Location $RepoRoot
  "[$(Get-Date -Format o)] 启动 API：http://localhost:4000" | Out-File -FilePath $LogPath -Encoding utf8 -Append
  & corepack pnpm --filter "@photo-weather/api" dev *>> $LogPath
}

$webScript = {
  param([string]$RepoRoot, [string]$LogPath, [hashtable]$Environment)

  foreach ($item in $Environment.GetEnumerator()) {
    Set-Item -Path "Env:$($item.Key)" -Value $item.Value
  }

  Set-Location $RepoRoot
  "[$(Get-Date -Format o)] 启动前台：http://localhost:3000" | Out-File -FilePath $LogPath -Encoding utf8 -Append
  & corepack pnpm --filter "@photo-weather/web" dev *>> $LogPath
}

Start-LocalJob -Name "photo-weather-api" -LogPath $apiLog -ScriptBlock $apiScript -Environment $jobEnvironment
Start-LocalJob -Name "photo-weather-web" -LogPath $webLog -ScriptBlock $webScript -Environment $jobEnvironment

$apiReady = Wait-ForPort -Port 4000
$webReady = Wait-ForPort -Port 3000

if ($apiReady) {
  Write-Host "API 已启动：http://localhost:4000"
} else {
  Write-Warning "API 启动状态未确认，请查看日志：$apiLog"
}

if ($webReady) {
  Write-Host "前台已启动：http://localhost:3000"
} else {
  Write-Warning "前台启动状态未确认，请查看日志：$webLog"
}

Write-Host "后台入口：http://localhost:3000/admin/login"
Write-Host ""
Write-Host "查看 API 日志：Get-Content -Wait .\logs\photo-weather-api.log"
Write-Host "查看前台日志：Get-Content -Wait .\logs\photo-weather-web.log"
Write-Host "停止本地服务：corepack pnpm stop:local"
Write-Host "保持此窗口打开以维持本地服务运行."

try {
  Wait-Job -Name "photo-weather-api", "photo-weather-web" | Out-Null
} finally {
  Stop-LocalJob -Name "photo-weather-api"
  Stop-LocalJob -Name "photo-weather-web"
}

