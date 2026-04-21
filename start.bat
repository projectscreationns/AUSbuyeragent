@echo off
title AUS Buyer Agent
color 0A
echo ========================================
echo   AUS Buyer Agent - Starting...
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Pulling latest data...
git pull
echo.

echo [2/4] Running listing scout...
python scripts/scout.py
echo.

echo [3/4] Starting dashboard server...
start "" http://localhost:5173
npm run dev
