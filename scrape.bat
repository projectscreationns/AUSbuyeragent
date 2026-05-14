@echo off
echo ======================================
echo   AUS Buyer Agent - Full Listing Scan
echo ======================================
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
    echo Installing Playwright...
    npm install playwright
    npx playwright install chromium
)

echo.
echo Starting full listing scan across all suburbs...
echo This will take 10-15 minutes.
echo.

node scripts\scout_playwright.js

echo.
echo Building and deploying to website...
call npm run build -- --base=/AUSbuyeragent/
npx gh-pages -d dist --branch gh-pages --dotfiles

echo.
echo ======================================
echo   DONE! Refresh your dashboard at:
echo   https://projectscreationns.github.io/AUSbuyeragent/
echo ======================================
pause
