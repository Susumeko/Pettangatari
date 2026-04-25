@echo off
setlocal
cd /d "%~dp0"

rem Change these ports if you want Pettangatari to listen somewhere else.
set "PETTANGATARI_BACKEND_PORT=3210"
set "PETTANGATARI_FRONTEND_PORT=5173"

rem Use 0.0.0.0 to allow other devices on your network to connect.
set "PETTANGATARI_LISTEN_HOST=0.0.0.0"

echo [Pettangatari] Preparing network dev launch...

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
set "PETTANGATARI_HOST=%PETTANGATARI_LISTEN_HOST%"
set "FRONTEND_PORT=%PETTANGATARI_FRONTEND_PORT%"
set "FRONTEND_HOST=%PETTANGATARI_LISTEN_HOST%"

echo [Pettangatari] Opening local browser...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PETTANGATARI_FRONTEND_PORT%'" >nul 2>nul

echo [Pettangatari] Starting network dev servers.
echo [Pettangatari] Frontend: http://localhost:%PETTANGATARI_FRONTEND_PORT%
echo [Pettangatari] Backend API: http://localhost:%PETTANGATARI_BACKEND_PORT%
echo [Pettangatari] Network listen host: %PETTANGATARI_LISTEN_HOST%
echo [Pettangatari] Other devices can connect with http://YOUR-PC-IP:%PETTANGATARI_FRONTEND_PORT%
call npm run dev

endlocal
