@echo off
:: Install all Lumen build dependencies on Windows
echo Installing Lumen build dependencies...

:: Check winget
where winget >nul 2>&1 || (echo winget not found - install App Installer from MS Store & exit /b 1)

echo Installing Visual Studio Build Tools...
winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools"

echo Installing CMake...
winget install Kitware.CMake

echo Installing Git...
winget install Git.Git

echo Installing Python...
winget install Python.Python.3.11

echo Installing vcpkg...
if not exist "C:\vcpkg" (
  git clone https://github.com/microsoft/vcpkg C:\vcpkg
  C:\vcpkg\bootstrap-vcpkg.bat
)

echo Installing vcpkg libraries...
C:\vcpkg\vcpkg install nlohmann-json spdlog leveldb openssl zlib argon2 sqlite3 gtest --triplet x64-windows-static

echo Installing Pillow for icon generation...
pip install Pillow

echo.
echo All dependencies installed!
echo Next: Download Qt 6.6 from https://download.qt.io
echo Then: scripts\build_windows.bat
