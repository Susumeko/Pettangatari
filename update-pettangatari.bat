@echo off
setlocal
cd /d "%~dp0"

set "REPO_URL=https://github.com/Susumeko/Pettangatari.git"
set "REPO_BRANCH=main"

echo [Pettangatari] Preparing update...

where git >nul 2>nul
if errorlevel 1 (
  echo [Pettangatari] Git was not found. Install Git and retry.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Pettangatari] npm was not found. Install Node.js 20+ and retry.
  pause
  exit /b 1
)

if not exist ".git" (
  echo [Pettangatari] This folder is not a git repository.
  pause
  exit /b 1
)

for /f "delims=" %%u in ('git remote get-url origin 2^>nul') do set "CURRENT_ORIGIN=%%u"

if not defined CURRENT_ORIGIN (
  echo [Pettangatari] Adding origin remote...
  git remote add origin "%REPO_URL%"
  if errorlevel 1 (
    echo [Pettangatari] Failed to add the origin remote.
    pause
    exit /b 1
  )
) else (
  if /I not "%CURRENT_ORIGIN%"=="%REPO_URL%" (
    echo [Pettangatari] Setting origin to %REPO_URL%...
    git remote set-url origin "%REPO_URL%"
    if errorlevel 1 (
      echo [Pettangatari] Failed to update the origin remote.
      pause
      exit /b 1
    )
  )
)

for /f "delims=" %%s in ('git status --porcelain') do set "HAS_LOCAL_CHANGES=1"
if defined HAS_LOCAL_CHANGES (
  echo [Pettangatari] Local changes were detected.
  echo [Pettangatari] Commit or stash your work before running the updater.
  git status --short
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git branch --show-current') do set "CURRENT_BRANCH=%%b"
if /I not "%CURRENT_BRANCH%"=="%REPO_BRANCH%" (
  echo [Pettangatari] Switching to %REPO_BRANCH%...
  git checkout %REPO_BRANCH%
  if errorlevel 1 (
    echo [Pettangatari] Failed to switch to %REPO_BRANCH%.
    pause
    exit /b 1
  )
)

echo [Pettangatari] Fetching latest changes...
git fetch origin %REPO_BRANCH%
if errorlevel 1 (
  echo [Pettangatari] Fetch failed.
  pause
  exit /b 1
)

echo [Pettangatari] Pulling latest %REPO_BRANCH% from origin...
git pull --ff-only origin %REPO_BRANCH%
if errorlevel 1 (
  echo [Pettangatari] Update failed.
  echo [Pettangatari] The local branch could not be fast-forwarded automatically.
  pause
  exit /b 1
)

echo [Pettangatari] Refreshing dependencies...
call npm install
if errorlevel 1 (
  echo [Pettangatari] npm install failed.
  pause
  exit /b 1
)

echo [Pettangatari] Update complete.
pause
endlocal
