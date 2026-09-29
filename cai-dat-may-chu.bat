@echo off
rem Cai phan mem thanh may chu: tu chay khi bat may, tu sao luu, mo tuong lua.
rem Chay lai bao nhieu lan cung duoc. Go cai dat: go-cai-dat-may-chu.bat
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Can quyen Administrator - bam Yes o hop thoai tiep theo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cai-dat-may-chu.ps1"
echo.
pause
