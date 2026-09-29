@echo off
rem Dung phan mem dang chay nen (truoc khi khoi phuc du lieu, bao tri may...).
rem Chay lai: khoi-dong-may-chu.bat, hoac khoi dong lai may.
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo Can quyen Administrator - bam Yes o hop thoai tiep theo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
if "%PORT%"=="" set PORT=8000
schtasks /end /tn "HuaNa - Tro ly ky thuat" >nul 2>&1
rem Tac vu dung chi tat cua so lenh; tat not Python dang giu cong.
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /r /c:"^ *TCP *[0-9.]*:%PORT% .*LISTENING"') do taskkill /PID %%p /F >nul 2>&1
echo Da dung phan mem. Chay lai: khoi-dong-may-chu.bat
if /i not "%~1"=="/im-lang" pause
