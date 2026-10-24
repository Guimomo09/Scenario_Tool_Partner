// === Accès fichiers sûrs pour le main process ===
const path = require('path');
const fs = require('fs');

const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
const comparable = (p) => (caseInsensitive ? path.resolve(p).toLowerCase() : path.resolve(p));

// Vrai si `target` est `root` ou se trouve dedans (refuse les ../ et les autres disques)
function isPathInside(root, target) {
  if (typeof target !== 'string' || !target) return false;
  const relative = path.relative(comparable(root), comparable(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// Écriture atomique : fichier temporaire puis renommage, ancienne version conservée en .bak
function atomicWriteFile(filePath, content) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, `${filePath}.bak`);
    }
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(tmpPath); } catch (e) {}
    throw error;
  }
}

// Sauvegardes datées de _PROJECT.json (avant migration ou restauration), jamais écrasées
const BACKUP_RE = /^_PROJECT\.backup-[a-z0-9-]+-\d{8}-\d{6}(?:-\d+)?\.json$/i;

function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Copie `filePath` vers une sauvegarde datée unique ; échoue plutôt que d'écraser une sauvegarde
function createBackup(filePath, label) {
  const dir = path.dirname(filePath);
  const base = `_PROJECT.backup-${label}-${timestamp()}`;
  for (let n = 0; n < 100; n++) {
    const name = n ? `${base}-${n}.json` : `${base}.json`;
    const backupPath = path.join(dir, name);
    try {
      fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
      if (fs.readFileSync(backupPath, 'utf-8') !== fs.readFileSync(filePath, 'utf-8')) {
        throw new Error('La sauvegarde ne correspond pas au fichier d\'origine.');
      }
      return backupPath;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Impossible de créer une sauvegarde unique.');
}

// Sauvegarde puis écrit le nouveau contenu ; vérifie l'écriture en relisant le fichier
function writeWithBackup(filePath, content, label) {
  const backupPath = createBackup(filePath, label);
  atomicWriteFile(filePath, content);
  if (fs.readFileSync(filePath, 'utf-8') !== content) {
    throw new Error(`Écriture non vérifiée. La version précédente est dans ${path.basename(backupPath)}.`);
  }
  return backupPath;
}

function listBackups(projectDir) {
  return fs.readdirSync(projectDir)
    .filter(name => BACKUP_RE.test(name))
    .sort()
    .reverse();
}

// Restaure une sauvegarde : la version actuelle est elle-même sauvegardée avant
function restoreBackup(projectDir, backupName) {
  if (!BACKUP_RE.test(String(backupName)) || path.basename(backupName) !== backupName) {
    throw new Error('Nom de sauvegarde invalide.');
  }
  const backupPath = path.join(projectDir, backupName);
  const content = fs.readFileSync(backupPath, 'utf-8');
  JSON.parse(content);
  const filePath = path.join(projectDir, '_PROJECT.json');
  const safetyCopy = fs.existsSync(filePath) ? writeWithBackup(filePath, content, 'avant-restauration') : null;
  if (!safetyCopy) atomicWriteFile(filePath, content);
  return { restored: backupName, safetyCopy: safetyCopy && path.basename(safetyCopy) };
}

// Nom de projet utilisable comme nom de dossier (pas de séparateur, pas de nom réservé)
function validateProjectName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Le nom du projet est vide.';
  if (trimmed.length > 80) return 'Le nom du projet est trop long (80 caractères maximum).';
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(trimmed)) return 'Le nom contient un caractère interdit (< > : " / \\ | ? *).';
  if (/^\.+$/.test(trimmed) || /[. ]$/.test(trimmed)) return 'Le nom ne peut pas finir par un point ou un espace.';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(trimmed)) return 'Ce nom est réservé par Windows.';
  return null;
}

module.exports = {
  isPathInside, atomicWriteFile, validateProjectName,
  createBackup, writeWithBackup, listBackups, restoreBackup
};
