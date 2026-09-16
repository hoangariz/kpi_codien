@echo off
chcp 65001 >nul
title MO PORT TUONG LUA WINDOWS CHO HE THONG KPI CO DIEN
echo ================================================================
echo   DANG MO PORT 3000 VA 8000 TRONG WINDOWS FIREWALL...
echo   (Yeu cau: Chay bang quyen Run as Administrator)
echo ================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [CANH BAO] Ban chua chay bang quyen Administrator!
    echo Vui long chuot phai vao file nay va chon "Run as administrator".
    echo.
    pause
    exit /b 1
)

netsh advfirewall firewall delete rule name="KPI Co Dien (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="KPI Co Dien (Port 3000)" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1

netsh advfirewall firewall delete rule name="KPI Co Dien Backend (Port 8000)" >nul 2>&1
netsh advfirewall firewall add rule name="KPI Co Dien Backend (Port 8000)" dir=in action=allow protocol=TCP localport=8000 >nul 2>&1

echo [THANH CONG] Da mo Port 3000 va 8000 trong Tuong lua Windows!
echo Nguoi khac cung mang Wi-Fi / LAN bay gio co the truy cap vao may cua ban.
echo.
pause
