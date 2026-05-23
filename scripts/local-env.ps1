$ErrorActionPreference = "Stop"

function ConvertFrom-DotEnvQuotedValue {
  param([string]$Value)

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

function Import-LocalDotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    $env:PHOTO_WEATHER_ENV_LOCAL_LOADED = "false"
    return $false
  }

  $loadedAny = $false

  foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding utf8) {
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
    if ($name -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") {
      continue
    }

    $value = ConvertFrom-DotEnvQuotedValue -Value $line.Substring($separatorIndex + 1)
    Set-Item -Path "Env:$name" -Value $value
    $loadedAny = $true
  }

  $env:PHOTO_WEATHER_ENV_LOCAL_LOADED = if ($loadedAny) { "true" } else { "false" }
  return $loadedAny
}

function Mask-DatabaseUrl {
  param([string]$DatabaseUrl)

  if (-not $DatabaseUrl) {
    return ""
  }

  try {
    $builder = [System.UriBuilder]::new($DatabaseUrl)
    if ($builder.Password) {
      $builder.Password = "***"
    }
    return $builder.Uri.AbsoluteUri
  } catch {
    return ($DatabaseUrl -replace "(://[^:/?#]+:)[^@/?#]+(@)", '$1***$2')
  }
}
