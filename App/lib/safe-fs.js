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

module.exports = { isPathInside, atomicWriteFile, validateProjectName };
