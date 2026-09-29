@echo off
rem Sao luu du lieu ngay. May chu cai bang cai-dat-may-chu.bat da tu sao luu
rem 11:50 va 23:50 hang ngay (goi file nay voi /tu-dong).
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
if not exist ".venv\Scripts\python.exe" (
  echo [LOI] Chua cai dat. Chay run.bat truoc.
  if /i not "%~1"=="/tu-dong" pause
  exit /b 1
)
if /i "%~1"=="/tu-dong" (
  if not exist data\logs mkdir data\logs
  ".venv\Scripts\python.exe" -m backend.saoluu >> data\logs\sao-luu.log 2>&1
  exit /b
)
".venv\Scripts\python.exe" -m backend.saoluu
echo.
".venv\Scripts\python.exe" -m backend.saoluu --danh-sach
pause
