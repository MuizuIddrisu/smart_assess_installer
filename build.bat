@echo off
REM ============================================================
REM  Smart Assess v1.0.0 — Production Build Script
REM  Run from smart_assess_installer/ folder:  build.bat
REM ============================================================
setlocal EnableDelayedExpansion

set "VERSION=1.0.0"
set "ROOT=%~dp0"
set "DJANGO_DIR=%ROOT%..\smart_assess"
set "INSTALLER_DIR=%ROOT%installer"

echo.
echo ====================================================
echo   Smart Assess v%VERSION% — Production Build
echo ====================================================
echo.

REM ── Step 1: PyInstaller ─────────────────────────────────────
echo [1/3] Building Django server with PyInstaller...
cd /d "%DJANGO_DIR%"
pip install pyinstaller waitress django openpyxl -q
python -m PyInstaller smart_assess.spec --clean --noconfirm
if errorlevel 1 ( echo ERROR: PyInstaller failed. && pause && exit /b 1 )
echo    OK — dist\SmartAssess\SmartAssess.exe

REM ── Step 2: npm install ─────────────────────────────────────
echo [2/3] Installing Node dependencies...
cd /d "%INSTALLER_DIR%"
call npm install --silent
if errorlevel 1 ( echo ERROR: npm install failed. && pause && exit /b 1 )
echo    OK

REM ── Step 3: Electron build ──────────────────────────────────
echo [3/3] Building installer with electron-builder...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run build
if errorlevel 1 ( echo ERROR: electron-builder failed. && pause && exit /b 1 )

echo.
echo ====================================================
echo   BUILD COMPLETE!
echo   Output: %INSTALLER_DIR%\dist\Smart Assess Setup %VERSION%.exe
echo ====================================================
echo.
pause