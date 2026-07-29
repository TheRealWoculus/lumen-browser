@echo off
setlocal
:: Build Lumen Browser for Windows (NSIS installer + portable exe).
:: Requires: Node.js 18+ on PATH
set "ROOT=%~dp0.."
cd /d "%ROOT%\app"

echo Lumen Browser - Windows Build
echo ===============================

echo [1] Installing dependencies...
call npm install

echo [2] Rebuilding native modules for Electron...
call npx electron-builder install-app-deps

echo [3] Building Windows packages...
call npx electron-builder --win

:: Copy artifacts to downloads/
if not exist "%ROOT%\downloads" mkdir "%ROOT%\downloads"
copy /Y "%ROOT%\releases\Lumen Setup 1.0.0.exe" "%ROOT%\downloads\" 2>nul
copy /Y "%ROOT%\releases\Lumen 1.0.0.exe" "%ROOT%\downloads\" 2>nul

echo.
echo Build complete!
echo   Installer: %ROOT%\downloads\Lumen Setup 1.0.0.exe
echo   Portable:  %ROOT%\downloads\Lumen 1.0.0.exe
endlocal
