@echo off
echo ================================
echo   Writing Partner - Installation
echo ================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe.
    echo.
    echo Telecharge Node.js depuis: https://nodejs.org
    echo Puis relance ce script.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detecte
node --version

echo.
echo Installation des dependances...
call npm install

if %errorlevel% neq 0 (
    echo [ERREUR] L'installation a echoue.
    pause
    exit /b 1
)

echo.
echo ================================
echo   Installation terminee !
echo ================================
echo.
echo Pour lancer l'application:
echo   npm start
echo.
echo Ou double-clique sur "Lancer.bat"
echo.
pause
