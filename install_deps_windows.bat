@echo off
setlocal enabledelayedexpansion
:: Install all Lumen build dependencies on Windows (Environment Passthrough Engine)
echo Installing Lumen build dependencies...

:: 1. Declare Python path explicitly
set "FINAL_PY_BIN=C:\Users\woculuss\AppData\Local\Programs\Python\Python311"

:: 2. Initialize Visual Studio 2026 Environment
echo Initializing Visual Studio v18 Compiler Environment...
set "VS_PATH=C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"

if exist "%VS_PATH%" (
    echo Found Visual Studio 18 environment at: "%VS_PATH%"
    call "%VS_PATH%" >nul 2>&1
) else (
    echo [ERROR] Visual Studio 18 vcvars64.bat was not found.
    pause
    exit /b 1
)

:: 3. Wipe conflicting parameters completely
set "VCPKG_ROOT="
set "VCPKG_VISUAL_STUDIO_PATH="
set "VCPKG_FORCE_SYSTEM_BINARIES="

:: 4. CRITICAL: Force vcpkg to accept your clean system environment path mappings
set "VCPKG_ENV_PASSTHROUGH=PATH;SystemRoot;USERPROFILE;TEMP;TMP"
set "VCPKG_MAX_CONCURRENT_BUILDS=1"

:: 5. Re-inject tool chains, pushing the STABLE standalone Ninja to the absolute FRONT of the PATH
echo Re-establishing clean execution paths...
set "PATH=C:\lumen_tools;%PATH%;C:\Program Files\CMake\bin;C:\Program Files\Git\cmd;C:\Program Files\Git\bin;%FINAL_PY_BIN%;%FINAL_PY_BIN%\Scripts"

echo Verify active Ninja location:
where ninja

:: 6. Clean out corrupted build records
echo Purging build logs and engine cache trees...
if exist "C:\vcpkg\buildtrees" rmdir /s /q "C:\vcpkg\buildtrees" 2>nul
if exist "%USERPROFILE%\AppData\Local\vcpkg\archives" del /f /q /s "%USERPROFILE%\AppData\Local\vcpkg\archives\*.*" >nul 2>&1

:: 7. Run package installation
echo Compiling vcpkg libraries...
cd /d C:\vcpkg
call .\vcpkg install nlohmann-json spdlog leveldb openssl zlib argon2 sqlite3 gtest --triplet x64-windows-static

:: 8. Complete Python tasks
echo.
echo Checking Python packages...
"%FINAL_PY_BIN%\python.exe" -m pip install --upgrade pip --user 2>nul
"%FINAL_PY_BIN%\python.exe" -m pip install Pillow --user

echo.
echo All dependencies installed successfully!
echo Next: Download Qt 6.6 from https://download.qt.io
echo Then: scripts\build_windows.bat
pause
