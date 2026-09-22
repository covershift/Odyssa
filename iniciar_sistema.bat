@echo off
title Odyssa - Sistema Salon de Unas
cd /d "%~dp0"

echo ================================================================
echo        ODYSSA - SISTEMA DE GESTION DE SALON DE UNAS
echo      Almacenamiento en Archivos Planos (.txt)
echo ================================================================
echo.
echo Comprobando Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se encontro Node.js en el sistema.
    echo Por favor instale Node.js desde https://nodejs.org/
    pause
    exit /b 1
)

echo Iniciando servidor local en http://localhost:3000 ...
if not defined ODYSSA_ADMIN_PASSWORD set "ODYSSA_ADMIN_PASSWORD=Odyssa2026!"
if not defined ODYSSA_RECEPTION_PASSWORD set "ODYSSA_RECEPTION_PASSWORD=Recepcion2026!"
start http://localhost:3000
node server.js

pause
