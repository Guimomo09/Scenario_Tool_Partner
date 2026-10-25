@echo off
rem Crée les raccourcis Partner (Bureau + menu Démarrer) : lancement direct, sans fenêtre de commande
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Creer-Raccourcis.ps1"
pause
