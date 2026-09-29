@echo off
rem Khoi phuc du lieu tu mot ban sao luu. Phai dung phan mem truoc
rem (dung-may-chu.bat, hoac dong cua so run.bat).
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
if not exist ".venv\Scripts\python.exe" (
  echo [LOI] Chua cai dat. Chay run.bat truoc.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m backend.saoluu --khoi-phuc
echo.
echo Xong thi chay lai phan mem: khoi-dong-may-chu.bat (hoac run.bat).
pause
