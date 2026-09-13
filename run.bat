@echo off
chcp 65001 >nul
title HE THONG THEO DOI & THONG KE CONG VIEC CO DIEN - VCC
cd /d "%~dp0"

python run.py

if %errorlevel% neq 0 (
    echo.
    echo [THONG BAO] He thong da dung lai hoac gap su co.
)

pause
