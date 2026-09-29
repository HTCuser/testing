@echo off
rem Go tac vu tu chay, tac vu sao luu va quy tac tuong lua. Du lieu giu nguyen.
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Can quyen Administrator - bam Yes o hop thoai tiep theo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
choice /c CK /n /m "Go cai dat may chu (phan mem se khong tu chay khi bat may nua)? [C = Co, K = Khong] "
if errorlevel 2 exit /b
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cai-dat-may-chu.ps1" -GoBo
pause
