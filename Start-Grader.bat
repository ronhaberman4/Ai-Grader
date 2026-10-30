@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AI Exam Grader
set NODE_NO_WARNINGS=1

where node >nul 2>nul
if errorlevel 1 goto :nonode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto :oldnode

if not exist node_modules (
  echo.
  echo  First run: installing the app. This takes a few minutes...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :error
)

if not exist .next\BUILD_ID (
  echo.
  echo  Preparing the app. One time only, about a minute...
  echo.
  call npm run build
  if errorlevel 1 goto :error
)

echo.
echo  ==========================================================
echo   AI Exam Grader is starting.
echo   Your browser will open at http://127.0.0.1:3000
echo.
echo   Keep this window open while you work.
echo   To stop the app, close this window.
echo  ==========================================================
echo.
start "" /min cmd /c "timeout /t 5 /nobreak >nul & start http://127.0.0.1:3000"
call npm start
goto :end

:nonode
echo.
echo  Node.js is not installed.
echo  The download page will open now. Install the "LTS" version,
echo  then double-click this file again.
echo.
start https://nodejs.org
pause
goto :end

:oldnode
echo.
echo  Your Node.js version is too old. Please install the latest "LTS"
echo  version from the page that opens now, then double-click this file again.
echo.
start https://nodejs.org
pause
goto :end

:error
echo.
echo  Something went wrong. Please take a screenshot of this window.
echo.
pause

:end
