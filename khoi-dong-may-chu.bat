@echo off
rem Chay lai phan mem o che do may chu (sau khi da dung bang dung-may-chu.bat).
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Can quyen Administrator - bam Yes o hop thoai tiep theo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
schtasks /query /tn "HuaNa - Tro ly ky thuat" >nul 2>&1
if errorlevel 1 (
  echo [LOI] May nay chua cai che do may chu. Chay cai-dat-may-chu.bat, hoac dung run.bat.
  pause
  exit /b 1
)
schtasks /run /tn "HuaNa - Tro ly ky thuat" >nul
echo Da khoi dong. Doi 10-20 giay roi mo http://localhost:8000
echo Neu khong vao duoc: xem file data\logs\may-chu.log
if /i not "%~1"=="/im-lang" pause
