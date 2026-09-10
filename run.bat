@echo off
rem Khoi dong he thong tro ly ky thuat NMTD Hua Na (Windows).
chcp 65001 >nul 2>nul
setlocal
cd /d "%~dp0"

if "%PORT%"=="" set PORT=8000
if "%HOST%"=="" set HOST=0.0.0.0

set PY=
where python >nul 2>nul && set PY=python
if "%PY%"=="" where py >nul 2>nul && set PY=py
if "%PY%"=="" (
  echo [LOI] Khong tim thay Python.
  echo       Hay cai Python 3.10 tro len tai https://www.python.org/downloads/
  echo       Nho tich chon "Add python.exe to PATH" khi cai dat.
  pause
  exit /b 1
)

if not exist .venv (
  echo ==^> Tao moi truong ao .venv
  %PY% -m venv .venv
  if errorlevel 1 (
    echo [LOI] Khong tao duoc moi truong ao.
    pause
    exit /b 1
  )
)

call .venv\Scripts\activate.bat

echo ==^> Cai dat thu vien (lan dau co the mat vai phut)
rem Mang noi bo nha may thuong cham hoac qua proxy nen noi thoi gian cho.
python -m pip install --quiet --retries 8 --timeout 180 --upgrade pip
python -m pip install --quiet --retries 8 --timeout 180 -r requirements.txt
if errorlevel 1 (
  echo.
  echo [LOI] Tai thu vien that bai - thuong do mang cham hoac bi chan.
  echo       Hay chay lai run.bat ^(cac goi da tai xong se duoc dung lai^),
  echo       hoac cau hinh proxy:  set HTTPS_PROXY=http://^<proxy^>:^<cong^>
  pause
  exit /b 1
)

if not exist data\huana.db (
  echo ==^> Nap du lieu mau Nha may Thuy dien Hua Na
  python -m backend.seed
)

echo.
echo ==^> May chu dang chay. Mo trinh duyet tai:
echo       http://localhost:%PORT%
echo     Tai lieu API: http://localhost:%PORT%/docs
echo     Nhan Ctrl + C de dung.
echo.
python -m uvicorn backend.main:app --host %HOST% --port %PORT%
pause
