@echo off
echo ========================================================
echo   AUS Buyer Agent — Adelaide Metro Agentic Loop
echo   AUKUS Catchment Analysis
echo ========================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

cd /d "%~dp0"

REM Install dependencies if needed
if not exist node_modules\playwright (
    echo Installing Playwright + Chromium browser...
    npm install playwright
    npx playwright install chromium
    echo.
)

echo Starting agentic loop: suburbs scan + analysis + expansion...
echo Pass 1: Scan 16 Adelaide metro suburbs
echo Pass 2: Analyze results, expand to adjacent suburbs where strong
echo This will take 15-25 minutes.
echo.

node scripts\orchestrator.js --passes 2 --screenshot

echo.
echo Building and deploying to website...
call npm run build -- --base=/AUSbuyeragent/
npx gh-pages -d dist --branch gh-pages --dotfiles

echo.
echo ========================================================
echo   DONE! Refresh your dashboard at:
echo   https://projectscreationns.github.io/AUSbuyeragent/
echo ========================================================
pause
