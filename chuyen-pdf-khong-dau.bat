@echo off
rem Chuyen tai lieu trong mot thu muc sang PDF, ten file khong dau.
rem Cach dung: keo tha thu muc vao file nay, hoac chay roi dan duong dan.
rem File goc giu nguyen; ket qua vao thu muc "<ten thu muc> - PDF" ben canh.
chcp 65001 >nul 2>nul
setlocal
set "DIR=%~1"
if "%DIR%"=="" set /p "DIR=Dan duong dan thu muc can chuyen roi bam Enter: "
set "DIR=%DIR:"=%"
if "%DIR%"=="" exit /b
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\chuyen-pdf-khong-dau.ps1" -Folder "%DIR%"
echo.
pause
