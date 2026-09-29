@echo off
rem Cap nhat phan mem len ban moi: dung may chu, sao luu, git pull, cai thu
rem vien, chay lai. Lam ngoai gio thao tac (phan mem tat khoang 1-2 phut).
chcp 65001 >nul 2>nul
setlocal
net session >nul 2>&1
if errorlevel 1 (
  echo Can quyen Administrator - bam Yes o hop thoai tiep theo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
rem git pull co the ghi de chinh file nay trong luc cmd dang doc no -> chay
rem tu ban chep o thu muc tam.
if /i not "%~1"=="/tu-ban-tam" (
  copy /y "%~f0" "%TEMP%\huana-cap-nhat.bat" >nul
  "%TEMP%\huana-cap-nhat.bat" /tu-ban-tam "%~dp0."
  exit /b
)
cd /d "%~2"
set PYTHONIOENCODING=utf-8
set PY=.venv\Scripts\python.exe
if not exist "%PY%" (
  echo [LOI] Chua cai dat. Chay run.bat truoc.
  pause
  exit /b 1
)
set SERVICE=0
schtasks /query /tn "HuaNa - Tro ly ky thuat" >nul 2>&1 && set SERVICE=1

echo ==^> 1. Dung phan mem
if "%SERVICE%"=="1" (
  call dung-may-chu.bat /im-lang
) else (
  echo     May nay chay bang run.bat: dong cua so run.bat truoc khi cap nhat.
)

echo ==^> 2. Sao luu truoc khi cap nhat
"%PY%" -m backend.saoluu
if errorlevel 1 (
  echo [LOI] Sao luu that bai nen chua cap nhat. Xem loi o tren.
  goto start
)

echo ==^> 3. Lay ban moi
git -c safe.directory=* pull
if errorlevel 1 (
  echo [LOI] git pull that bai - phan mem giu nguyen ban cu.
  echo       Thuong do sua tay file trong thu muc phan mem, hoac mat mang.
  goto start
)

echo ==^> 4. Cai thu vien moi (neu co)
"%PY%" -m pip install --quiet --retries 8 --timeout 180 -r requirements.txt
if errorlevel 1 echo [CANH BAO] Cai thu vien loi - thu chay lai cap-nhat.bat khi mang on dinh.

:start
echo ==^> 5. Chay lai phan mem
if "%SERVICE%"=="1" (
  call khoi-dong-may-chu.bat /im-lang
) else (
  echo     Chay run.bat de mo lai phan mem.
)
echo.
echo Xong. Tren cac may dang mo phan mem: bam Ctrl + F5 mot lan.
pause
