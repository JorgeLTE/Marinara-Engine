@echo off
title Marinara Engine
cd /d "%~dp0"
echo Starting Marinara Engine...
echo.

:: Auto-update
if exist ".git" (
    echo Checking for updates...
    for /f "tokens=*" %%i in ('git rev-parse HEAD 2^>nul') do set OLD_HEAD=%%i
    git pull >nul 2>&1
    for /f "tokens=*" %%i in ('git rev-parse HEAD 2^>nul') do set NEW_HEAD=%%i
    if not "%OLD_HEAD%"=="%NEW_HEAD%" (
        echo Updated! Reinstalling...
        call pnpm install
        if exist "packages\shared\dist" rmdir /s /q "packages\shared\dist"
        if exist "packages\server\dist" rmdir /s /q "packages\server\dist"
        if exist "packages\client\dist" rmdir /s /q "packages\client\dist"
        call pnpm build
        call pnpm db:push 2>nul
    ) else (
        echo Already up to date.
    )
)

:: Build if needed
if not exist "packages\shared\dist" call pnpm build:shared
if not exist "packages\server\dist" call pnpm build:server
if not exist "packages\client\dist" call pnpm build:client

set NODE_ENV=production
set PORT=7860
set HOST=0.0.0.0

:: Open browser
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:7860"

echo.
echo  Marinara Engine running at http://localhost:7860
echo  Press Ctrl+C to stop
echo.

cd packages\server
node dist/index.js
