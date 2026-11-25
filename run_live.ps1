# ==============================================================================
# TurtleShell Live Dashboard Runner (Windows PowerShell)
# Launches FastAPI backend daemon and starts interactive frontend
# ==============================================================================

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = Get-Location }

$VenvPython = Join-Path $ScriptDir ".venv\Scripts\python.exe"
$BackendDir = Join-Path $ScriptDir "packages\turtleshell-live\backend"
$FrontendDir = Join-Path $ScriptDir "packages\turtleshell-live\frontend"

Write-Host "================================================================" -ForegroundColor White
Write-Host "  TurtleShell // Starting Live Isolation Dashboard             " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor White

# 1. Start FastAPI backend if available
$BackendJob = $null
if (Test-Path $VenvPython) {
    Write-Host "[+] Starting FastAPI backend on http://127.0.0.1:8000..." -ForegroundColor Green
    $BackendJob = Start-Process -FilePath $VenvPython -ArgumentList "-m uvicorn app.main:app --host 127.0.0.1 --port 8000" -WorkingDirectory $BackendDir -PassThru
    Start-Sleep -Seconds 1
} else {
    Write-Host "[*] Python .venv not found. Operating in standalone client-side engine mode." -ForegroundColor Yellow
}

# 2. Launch Frontend
$NpmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($NpmCmd -and (Test-Path $FrontendDir)) {
    Push-Location $FrontendDir
    $NodeModules = Join-Path $FrontendDir "node_modules"
    if (-not (Test-Path $NodeModules)) {
        Write-Host "[*] Installing frontend dependencies..." -ForegroundColor Green
        & $NpmCmd.Source install
    }
    Write-Host "[+] Starting frontend on http://localhost:5173..." -ForegroundColor Green
    Start-Process "http://localhost:5173"
    & $NpmCmd.Source run dev
    Pop-Location
} else {
    Write-Host "[+] Frontend dependencies absent. Launching in-browser simulation: https://turtleshell.iqumnov.com" -ForegroundColor Cyan
    Start-Process "https://turtleshell.iqumnov.com"
}

if ($BackendJob) {
    Stop-Process -Id $BackendJob.Id -ErrorAction SilentlyContinue
}

