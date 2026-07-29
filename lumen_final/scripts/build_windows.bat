@echo off
:: ================================================================
::  Lumen Browser - Windows Build Script
::  Requirements: Visual Studio 2022, CMake 3.20+, Qt 6.6, vcpkg
::  See docs/BUILD.md for full instructions
:: ================================================================
setlocal

set QT_DIR=C:\Qt\6.6.0\msvc2022_64
set CEF_DIR=C:\cef_binary_119.x_windows64
set VCPKG_ROOT=C:\vcpkg
set BUILD_DIR=%~dp0..\build\windows_release
set DIST_DIR=%~dp0..\dist\windows

echo Lumen Browser - Windows Build
echo ================================

echo [1] Generating icons...
python scripts\generate_icons.py

echo [2] CMake configure...
cmake -S . -B "%BUILD_DIR%" ^
  -G "Visual Studio 17 2022" -A x64 ^
  -DCMAKE_BUILD_TYPE=Release ^
  -DCMAKE_PREFIX_PATH="%QT_DIR%;%CEF_DIR%" ^
  -DCMAKE_TOOLCHAIN_FILE="%VCPKG_ROOT%\scripts\buildsystems\vcpkg.cmake" ^
  -DVCPKG_TARGET_TRIPLET=x64-windows-static ^
  -DLUMEN_SANDBOX=ON -DLUMEN_GPU=ON -DLUMEN_EXTENSIONS=ON ^
  -DLUMEN_ADBLOCKER=ON -DLUMEN_READER=ON -DLUMEN_PIP=ON ^
  -DLUMEN_TRANSLATE=ON -DLUMEN_LTO=ON

echo [3] Building Release...
cmake --build "%BUILD_DIR%" --config Release --parallel %NUMBER_OF_PROCESSORS%

echo [4] Deploying Qt runtime...
if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
xcopy /E /I /Y "%BUILD_DIR%\Release" "%DIST_DIR%\"
"%QT_DIR%\bin\windeployqt.exe" --release --no-translations --webengine --multimedia "%DIST_DIR%\Lumen.exe"

echo [5] Copying CEF binaries...
xcopy /E /I /Y "%CEF_DIR%\Release\*"   "%DIST_DIR%\"
xcopy /E /I /Y "%CEF_DIR%\Resources\*" "%DIST_DIR%\"

echo.
echo Build complete: %DIST_DIR%\Lumen.exe
endlocal
