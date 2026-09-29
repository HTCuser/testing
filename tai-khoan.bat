@echo off
rem Xem danh sach tai khoan, dat lai mat khau khi quen (ke ca tai khoan quan tri).
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
if not exist ".venv\Scripts\python.exe" (
  echo [LOI] Chua cai dat. Chay run.bat truoc.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m backend.taikhoan
echo.
set NAME=
set /p NAME=Nhap ten dang nhap can dat lai mat khau (Enter de thoat): 
if "%NAME%"=="" exit /b
".venv\Scripts\python.exe" -m backend.taikhoan --dat-lai %NAME%
pause
