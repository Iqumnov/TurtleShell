# ==============================================================================
# TurtleShell Automated Windows Toolchain & Benchmark Setup
# Sets up Python virtual environment, installs qib CLI, and configures frontend
# Repository: https://github.com/Iqumnov/TurtleShell
# Author: Matvei Igumnov
# License: MIT
# ==============================================================================

[CmdletBinding()]
param(
    [string]$InstallDir = "$HOME\.turtleshell\bin"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor White
Write-Host "  TurtleShell // Windows Automated Toolchain Setup             " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor White
Write-Host ""

# 1. Check Python
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    $PythonCmd = Get-Command py -ErrorAction SilentlyContinue
}
if (-not $PythonCmd) {
    Write-Error "Python 3.9+ was not found in PATH. Please install Python from https://python.org."
    exit 1
}

$PyVersion = & $PythonCmd.Source --version
Write-Host "[+] Detected Python: $PyVersion" -ForegroundColor Green

# 2. Determine project root or clone if piped from irm ... | iex
if ($MyInvocation.MyCommand.Path) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    $ScriptDir = Get-Location
}

if (-not (Test-Path (Join-Path $ScriptDir "packages\quantum-isolation-benchmark"))) {
    $TargetDir = Join-Path (Get-Location) "TurtleShell"
    if (-not (Test-Path $TargetDir)) {
        Write-Host "[+] Cloning TurtleShell repository into $TargetDir..." -ForegroundColor Green
        git clone https://github.com/Iqumnov/TurtleShell.git $TargetDir
    }
    $ScriptDir = $TargetDir
    Set-Location $ScriptDir
}

$VenvDir = Join-Path $ScriptDir ".venv"

if (-not (Test-Path $VenvDir)) {
    Write-Host "[+] Creating virtual environment in $VenvDir..." -ForegroundColor Green
    & $PythonCmd.Source -m venv --system-site-packages $VenvDir
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

Write-Host "[+] Installing TurtleShell Python packages..." -ForegroundColor Green
& $VenvPip install --upgrade pip setuptools wheel
& $VenvPip install --no-build-isolation -e (Join-Path $ScriptDir "packages\quantum-isolation-benchmark")

$BackendReqs = Join-Path $ScriptDir "packages\turtleshell-live\backend\requirements.txt"
if (Test-Path $BackendReqs) {
    & $VenvPip install -r $BackendReqs
}

# 3. Create qib wrapper
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$QibBat = Join-Path $InstallDir "qib.cmd"
$BatContent = "@echo off`r`n`"$VenvPython`" -m quantum_isolation_benchmark.cli %*"
Set-Content -Path $QibBat -Value $BatContent -Force

Write-Host "[+] Created qib CLI wrapper at $QibBat" -ForegroundColor Green

# 4. Install local web app dependencies if npm exists
$NpmCmd = Get-Command npm -ErrorAction SilentlyContinue
$FrontendDir = Join-Path $ScriptDir "packages\turtleshell-live\frontend"
if ($NpmCmd -and (Test-Path $FrontendDir)) {
    Write-Host "[+] Installing local web app dependencies..." -ForegroundColor Green
    Push-Location $FrontendDir
    & $NpmCmd.Source install
    Pop-Location
}

# 4. PATH Notification
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$InstallDir;$UserPath", "User")
    Write-Host "[+] Added $InstallDir to user PATH." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  TurtleShell Windows Installation Complete!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor White
Write-Host "Commands:"
Write-Host "  - Benchmark:      qib benchmark --provider all" -ForegroundColor Cyan
Write-Host "  - Launch UI:      .\run_live.ps1" -ForegroundColor Cyan
Write-Host "  - In-Browser Web: https://turtleshell.iqumnov.com" -ForegroundColor Cyan

