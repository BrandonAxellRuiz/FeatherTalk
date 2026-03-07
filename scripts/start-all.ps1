$ErrorActionPreference = "Stop"

function Test-ListenPort {
  param([int]$Port)

  try {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
  } catch {
    return $false
  }
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 20,
    [string]$Description = "service",
    [scriptblock]$Validator = $null
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 2
      if (-not $Validator -or (& $Validator $response)) {
        Write-Output "$Description is ready at $Url"
        return $true
      }
    } catch {
      # keep waiting
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Warmup-Ollama {
  param(
    [string]$BaseUrl,
    [string]$Model,
    [string]$KeepAlive
  )

  try {
    $body = @{
      model = $Model
      prompt = "."
      stream = $false
      keep_alive = $KeepAlive
      options = @{
        temperature = 0
        num_predict = 1
      }
    } | ConvertTo-Json -Depth 6

    Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 90 | Out-Null
    Write-Output "Ollama warmup completed for model: $Model"
  } catch {
    Write-Warning "Ollama warmup skipped: $($_.Exception.Message)"
  }
}

function Stop-FeatherTalkElectron {
  param([string]$RepoRoot)

  $targetPath = (Join-Path $RepoRoot "node_modules\electron\dist\electron.exe").ToLowerInvariant()
  $matches = @()

  foreach ($proc in (Get-Process -Name electron -ErrorAction SilentlyContinue)) {
    $procPath = $null
    try {
      $procPath = $proc.Path
    } catch {
      $procPath = $null
    }

    if ($procPath -and $procPath.ToLowerInvariant() -eq $targetPath) {
      $matches += $proc
    }
  }

  if ($matches.Count -gt 0) {
    Write-Output "Stopping existing FeatherTalk instance..."
    $matches | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 350
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$asrPython = Join-Path $repoRoot ".venv-asr\Scripts\python.exe"
$asrScript = Join-Path $repoRoot "scripts\parakeet-asr-worker.py"
$ollamaExe = "C:\Users\bcama\AppData\Local\Programs\Ollama\ollama.exe"
$fallbackFfmpeg = "C:\Users\bcama\OneDrive\Documentos\zyndovideo\node_modules\.pnpm\@remotion+compositor-win32-x64-msvc@4.0.417\node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"
$settingsPath = "$env:LOCALAPPDATA\FeatherTalk\config\settings.json"

if (-not (Test-Path $asrPython)) {
  throw "ASR venv missing at $asrPython"
}

if (-not (Test-Path $asrScript)) {
  throw "ASR worker script missing at $asrScript"
}

$settings = $null
if (Test-Path $settingsPath) {
  try {
    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
  } catch {
    Write-Warning "Could not parse settings at $settingsPath"
  }
}

$resolvedFfmpeg = $null
if ($settings -and $settings.ffmpegPath -and (Test-Path $settings.ffmpegPath)) {
  $resolvedFfmpeg = $settings.ffmpegPath
}

if (-not $resolvedFfmpeg -and (Test-Path $fallbackFfmpeg)) {
  $resolvedFfmpeg = $fallbackFfmpeg
}

if ($resolvedFfmpeg) {
  $env:FEATHERTALK_FFMPEG_PATH = $resolvedFfmpeg
  Write-Output "Using ffmpeg: $resolvedFfmpeg"
} else {
  Write-Warning "ffmpeg path was not resolved. Configure settings.ffmpegPath or install ffmpeg in PATH."
}

if (-not (Test-ListenPort -Port 11434)) {
  if (-not (Test-Path $ollamaExe)) {
    throw "Ollama not found at $ollamaExe"
  }

  Write-Output "Starting Ollama..."
  Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden | Out-Null
}

if (-not (Wait-HttpOk -Url "http://127.0.0.1:11434/api/tags" -TimeoutSeconds 25 -Description "Ollama")) {
  throw "Ollama did not become ready on http://127.0.0.1:11434/api/tags"
}

$ollamaBaseUrl = if ($settings -and $settings.ollamaBaseUrl) { $settings.ollamaBaseUrl } else { "http://127.0.0.1:11434" }
$llamaModel = if ($settings -and $settings.llamaModel) { $settings.llamaModel } else { "llama3.1:8b" }
$llamaKeepAlive = if ($settings -and $settings.llamaKeepAlive) { $settings.llamaKeepAlive } else { "30m" }
$warmupEnabled = if ($settings -and $null -ne $settings.llamaWarmupOnStart) { [bool]$settings.llamaWarmupOnStart } else { $true }

if ($warmupEnabled) {
  Warmup-Ollama -BaseUrl $ollamaBaseUrl -Model $llamaModel -KeepAlive $llamaKeepAlive
}

if (-not (Test-ListenPort -Port 8787)) {
  Write-Output "Starting Parakeet ASR worker..."
  Start-Process -FilePath $asrPython -ArgumentList $asrScript -WindowStyle Hidden | Out-Null
}

$asrReady = Wait-HttpOk -Url "http://127.0.0.1:8787/health" -TimeoutSeconds 30 -Description "Parakeet ASR" -Validator {
  param($response)
  return $response.status -eq "ok"
}

if (-not $asrReady) {
  throw "Parakeet ASR worker did not become ready on http://127.0.0.1:8787/health"
}

Stop-FeatherTalkElectron -RepoRoot $repoRoot

Set-Location $repoRoot
npm.cmd run start:desktop
