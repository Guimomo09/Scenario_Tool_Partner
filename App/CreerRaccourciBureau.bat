@echo off
chcp 65001 >nul
echo Création du raccourci bureau...

set "SCRIPT_DIR=%~dp0"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\Partner.lnk"
set "TARGET_PATH=%SCRIPT_DIR%Lancer.bat"
set "ICON_PATH=%SCRIPT_DIR%assets\icon.ico"
set "WORKING_DIR=%SCRIPT_DIR%"

:: Créer le raccourci via PowerShell
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_PATH%'; $s.WorkingDirectory = '%WORKING_DIR%'; if (Test-Path '%ICON_PATH%') { $s.IconLocation = '%ICON_PATH%' }; $s.WindowStyle = 7; $s.Save()"

if exist "%SHORTCUT_PATH%" (
    echo ✓ Raccourci créé sur le bureau !
) else (
    echo ✗ Erreur lors de la création du raccourci.
)

pause
