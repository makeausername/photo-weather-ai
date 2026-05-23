param(
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "local-env.ps1")

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env.local"
$logDir = Join-Path $repoRoot "logs"
$runStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$apiLog = Join-Path $logDir "photo-weather-api-$runStamp.log"
$webLog = Join-Path $logDir "photo-weather-web-$runStamp.log"
$apiLatest = Join-Path $logDir "photo-weather-api-latest.txt"
$webLatest = Join-Path $logDir "photo-weather-web-latest.txt"

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
    Write-Host "已清理后台任务：$Name"
  }
}

function Remove-LogFileSafe {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  try {
    Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
    Write-Host "已清理旧日志：$Path"
  } catch {
    Write-Warning "旧日志文件正在被占用，已跳过清理，不影响本次启动。$Path"
  }
}

function Write-LatestLogPath {
  param(
    [string]$Path,
    [string]$LogPath
  )

  try {
    Set-Content -LiteralPath $Path -Value $LogPath -Encoding utf8 -ErrorAction Stop
  } catch {
    Write-Warning "最新日志指针写入失败，不影响本次启动：$Path"
  }
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

  Start-Job -Name $Name -ScriptBlock $ScriptBlock -ArgumentList $repoRoot, $LogPath, $Environment | Out-Null
  Write-Host "已启动后台任务：$Name"
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
Start-Sleep -Milliseconds 800

Remove-LogFileSafe -Path (Join-Path $logDir "photo-weather-api.log")
Remove-LogFileSafe -Path (Join-Path $logDir "photo-weather-web.log")

if ($Clean) {
  $nextDir = Join-Path $repoRoot "apps/web/.next"
  if (Test-Path -LiteralPath $nextDir) {
    try {
      Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction Stop
      Write-Host "已清理 apps/web/.next。"
    } catch {
      Write-Warning "apps/web/.next 正在被占用，已跳过清理，不影响本次启动。"
    }
  }
}

Write-LatestLogPath -Path $apiLatest -LogPath $apiLog
Write-LatestLogPath -Path $webLatest -LogPath $webLog

$envLocalLoaded = Import-LocalDotEnv -Path $envFile
if ($envLocalLoaded) {
  Write-Host "已加载 .env.local。"
} else {
  Write-Host "未找到 .env.local 或文件为空，使用脚本内置本地默认值。"
}

if (-not $env:NEXT_PUBLIC_API_BASE_URL) {
  $env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000"
}

if (-not $env:ASTRO_SERVICE_URL) {
  $env:ASTRO_SERVICE_URL = "http://127.0.0.1:4100"
}

if (-not $env:ASTRO_SERVICE_TIMEOUT_MS) {
  $env:ASTRO_SERVICE_TIMEOUT_MS = "45000"
}

if (-not $env:ENABLE_ASTRO_SERVICE) {
  $env:ENABLE_ASTRO_SERVICE = "false"
}

if (-not $env:JWT_SECRET -or $env:JWT_SECRET.Length -lt 32) {
  if ($env:JWT_SECRET) {
    Write-Warning "JWT_SECRET 少于 32 字符，已使用本地临时值。"
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
  "[$(Get-Date -Format o)] 天文计算服务启用：$($env:ENABLE_ASTRO_SERVICE)" | Out-File -FilePath $LogPath -Encoding utf8 -Append
  "[$(Get-Date -Format o)] 天文计算服务 URL：$($env:ASTRO_SERVICE_URL)" | Out-File -FilePath $LogPath -Encoding utf8 -Append
  "[$(Get-Date -Format o)] 天文计算服务超时：$($env:ASTRO_SERVICE_TIMEOUT_MS) ms" | Out-File -FilePath $LogPath -Encoding utf8 -Append
  "[$(Get-Date -Format o)] 已加载 .env.local：$($env:PHOTO_WEATHER_ENV_LOCAL_LOADED)" | Out-File -FilePath $LogPath -Encoding utf8 -Append
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
Write-Host "API 日志：$apiLog"
Write-Host "前台日志：$webLog"
Write-Host "最新 API 日志指针：$apiLatest"
Write-Host "最新前台日志指针：$webLatest"
Write-Host ("查看 API 日志：Get-Content -Wait " + $apiLog)
Write-Host ("查看前台日志：Get-Content -Wait " + $webLog)
Write-Host "停止本地服务：corepack pnpm stop:local"
Write-Host "保持此窗口打开以维持本地服务运行。"

try {
  Wait-Job -Name "photo-weather-api", "photo-weather-web" | Out-Null
} finally {
  Stop-LocalJob -Name "photo-weather-api"
  Stop-LocalJob -Name "photo-weather-web"
}
