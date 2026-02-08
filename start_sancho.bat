@echo off
title Sancho Electron
echo ================================
echo   Sancho Electron Starting...
echo ================================
echo.

cd /d "%~dp0"

set "PATH=C:\Program Files\nodejs;%PATH%"

if not exist "venv\Scripts\python.exe" (
    echo [!] No venv found. Run start_backend.bat first to set up Python.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [*] Installing Node dependencies...
    call npm install
    echo.
)

REM Kill any existing backend on port 8765
taskkill /fi "WINDOWTITLE eq Sancho Backend" /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo [*] Starting backend + frontend + Electron
echo [*] Backend: http://127.0.0.1:8765
echo [*] Frontend: http://localhost:5173
echo [*] Press Ctrl+C to stop all
echo.

start "Sancho Backend" cmd /c "cd /d "%~dp0" && venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload"

timeout /t 3 /nobreak >nul

call npm run electron:dev

taskkill /fi "WINDOWTITLE eq Sancho Backend" >nul 2>&1

pause
