@echo off
title AI Study Assistant Server
cd /d "%~dp0"
echo ========================================
echo.
echo    AI Study Assistant is starting...
echo.
echo ========================================
echo.
echo  Browser opens in 3 seconds, or visit http://localhost:3000
echo.
echo  *** Do NOT close this window while using ***
echo.
echo ========================================
echo.
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
"C:\Program Files\nodejs\node.exe" server.js
echo.
echo Server stopped. Press any key to close...
pause >nul
