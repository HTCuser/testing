@echo off
rem Chay phan mem o che do may chu. Tac vu "HuaNa - Tro ly ky thuat" trong
rem Task Scheduler goi file nay khi bat may (cai bang cai-dat-may-chu.bat).
rem Khong can mo tay; muon chay thu bang tay thi dung run.bat.
setlocal
cd /d "%~dp0.."
set PYTHONUNBUFFERED=1
set PYTHONIOENCODING=utf-8
if exist may-chu.cfg.bat call may-chu.cfg.bat
if not exist data\logs mkdir data\logs
set LOG=data\logs\may-chu.log

rem Log qua 10 MB thi cat sang ban cu, giu mot ban.
if exist "%LOG%" for %%F in ("%LOG%") do if %%~zF GTR 10485760 move /y "%LOG%" "data\logs\may-chu.cu.log" >nul

rem Ollama (tim kiem ngu nghia): khi chua ai dang nhap Windows thi ung dung
rem Ollama chua chay, nen tu bat o day.
if defined OLLAMA_EXE if exist "%OLLAMA_EXE%" (
  netstat -ano -p tcp | findstr /r /c:":11434 .*LISTENING" >nul
  if errorlevel 1 (
    echo [%date% %time%] Khoi dong Ollama>> "%LOG%"
    start "" /b "%OLLAMA_EXE%" serve >> data\logs\ollama.log 2>&1
  )
)

:loop
echo [%date% %time%] Khoi dong may chu>> "%LOG%"
".venv\Scripts\python.exe" -m backend.main >> "%LOG%" 2>&1
echo [%date% %time%] May chu dung (ma loi %errorlevel%), chay lai sau 10 giay>> "%LOG%"
rem Khong dung "timeout": loi khi chay nen khong co ban phim.
ping -n 11 127.0.0.1 >nul
goto loop
