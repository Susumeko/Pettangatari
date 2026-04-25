@echo off
setlocal
cd /d "%~dp0"

set "PETTANGATARI_BACKEND_PORT=3210"
set "PETTANGATARI_FRONTEND_PORT=5173"

echo [Pettangatari] Preparing dev launch...

where npm >nul 2>nul
if errorlevel 1 (
  echo [Pettangatari] npm was not found. Install Node.js 20+ and retry.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [Pettangatari] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Pettangatari] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [Pettangatari] Checking for existing dev servers...
for %%P in (%PETTANGATARI_BACKEND_PORT% %PETTANGATARI_FRONTEND_PORT%) do (
  for /f %%p in ('powershell -NoProfile -Command "$p=(Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if($p){$p|ForEach-Object{Write-Output $_}}"') do (
    echo [Pettangatari] Stopping old process %%p on port %%P...
    taskkill /PID %%p /F >nul 2>nul
  )
)

for /f %%i in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"') do set PETTANGATARI_SHUTDOWN_TOKEN=%%i
set "PORT=%PETTANGATARI_BACKEND_PORT%"
set "PETTANGATARI_HOST=127.0.0.1"
set "FRONTEND_PORT=%PETTANGATARI_FRONTEND_PORT%"
set "FRONTEND_HOST=127.0.0.1"

echo [Pettangatari] Opening browser...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PETTANGATARI_FRONTEND_PORT%'" >nul 2>nul

echo [Pettangatari] Starting dev servers.
echo [Pettangatari] Frontend: http://localhost:%PETTANGATARI_FRONTEND_PORT%
echo [Pettangatari] Backend API: http://localhost:%PETTANGATARI_BACKEND_PORT%
call npm run dev

endlocal
