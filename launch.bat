@echo off
setlocal
title RMIT Workload Report - Dev Server
cd /d "%~dp0"

echo ===============================================
echo    RMIT Workload Report - starting dev server
echo ===============================================
echo.

REM --- Make sure Node.js is available -----------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on your PATH.
  echo Install the LTS version from https://nodejs.org/ then run this file again.
  echo.
  pause
  exit /b 1
)

REM --- Install dependencies on first run --------------------------
if not exist "node_modules" (
  echo First run detected - installing dependencies ^(this may take a minute^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed - see the messages above.
    pause
    exit /b 1
  )
  echo.
)

echo Opening http://localhost:5173 in your browser when ready.
echo Keep this window open while you work. Press Ctrl+C or close it to stop the server.
echo.

REM --- Start Vite and auto-open the browser -----------------------
call npm run dev -- --open

endlocal
