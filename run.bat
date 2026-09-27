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

rem Cong dang bi chiem: thuong la cua so run.bat lan truoc van con mo.
set BUSY_PID=
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /r /c:"^ *TCP *[0-9.]*:%PORT% "') do set BUSY_PID=%%p
if defined BUSY_PID (
  echo.
  echo [LOI] Cong %PORT% dang bi chuong trinh khac chiem ^(PID %BUSY_PID%^):
  tasklist /fi "PID eq %BUSY_PID%" /fo table /nh
  echo.
  echo  Thuong la phan mem nay dang chay san o mot cua so run.bat khac.
  echo  - Neu vay: mo trinh duyet vao http://localhost:%PORT% la dung duoc ngay,
  echo    hoac vao cua so do bam Ctrl + C roi chay lai run.bat.
  echo.
  choice /c CK /n /m "Tat chuong trinh dang chiem cong de chay lai? [C = Co, K = Khong] "
  if errorlevel 2 (
    pause
    exit /b 1
  )
  taskkill /PID %BUSY_PID% /F
  timeout /t 2 /nobreak >nul
)

echo.
echo ==^> May chu dang chay. Mo trinh duyet tai:
echo       http://localhost:%PORT%
echo     Tai lieu API: http://localhost:%PORT%/docs
echo     Nhan Ctrl + C de dung.
echo.
python -m uvicorn backend.main:app --host %HOST% --port %PORT%
pause
