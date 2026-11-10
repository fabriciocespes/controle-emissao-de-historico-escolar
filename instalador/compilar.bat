@echo off
rem Compila o instalador com checagens previas: Inno Setup 6, pasta
rem node_modules (rode "npm install --omit=dev") e o node.exe a embutir.
rem Argumentos extras sao repassados ao ISCC (ex.: /Q).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0compilar.ps1" %*
set RC=%ERRORLEVEL%
echo.
pause
exit /b %RC%
