@echo off
title AUS Buyer Agent - Refresh
color 0E
echo ========================================
echo   Refreshing listings...
echo ========================================
echo.

cd /d "%~dp0"
python scripts/scout.py

echo.
echo Done! Reload the dashboard in your browser.
echo Press any key to close...
pause >/dev/null
