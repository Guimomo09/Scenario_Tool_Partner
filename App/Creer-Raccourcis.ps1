# Crée les raccourcis « Partner » (Bureau et menu Démarrer) qui lancent l'app directement :
# pas de fenêtre de commande, icône de l'app. À relancer si le dossier Partner est déplacé.
# Usage : clic droit > « Exécuter avec PowerShell », ou double-clic sur CreerRaccourciBureau.bat

$ErrorActionPreference = 'Stop'
$appDir   = $PSScriptRoot
$electron = Join-Path $appDir 'node_modules\electron\dist\electron.exe'
$icon     = Join-Path $appDir 'assets\icon.ico'

if (-not (Test-Path $electron)) {
  Write-Host "Electron introuvable : lancez d'abord Installer.bat (npm install)." -ForegroundColor Red
  exit 1
}

$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Partner.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Partner.lnk')
)

$shell = New-Object -ComObject WScript.Shell
foreach ($lnk in $targets) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath       = $electron
  $s.Arguments        = '"' + $appDir + '"'
  $s.WorkingDirectory = $appDir
  $s.IconLocation     = "$icon,0"
  $s.Description      = "Partner — atelier d'écriture"
  $s.WindowStyle      = 1
  $s.Save()
  Write-Host "Raccourci créé : $lnk"
}
