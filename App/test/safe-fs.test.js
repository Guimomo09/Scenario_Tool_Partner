// Accès fichiers du main process — dossier temporaire uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isPathInside, atomicWriteFile, validateProjectName } = require('../lib/safe-fs');

const root = path.join(os.tmpdir(), 'partner-root');

test('chemins autorisés dans le périmètre', () => {
  assert.equal(isPathInside(root, root), true);
  assert.equal(isPathInside(root, path.join(root, 'Projet', '_NOTES.md')), true);
  assert.equal(isPathInside(root, `${root}/Projet/_PROJECT.json`), true);
});

test('chemins refusés hors du périmètre', () => {
  assert.equal(isPathInside(root, path.join(root, '..', 'App', 'settings.json')), false);
  assert.equal(isPathInside(root, `${root}-voisin/fichier.md`), false);
  assert.equal(isPathInside(root, path.join(os.homedir(), '.ssh', 'id_rsa')), false);
  assert.equal(isPathInside(root, ''), false);
  assert.equal(isPathInside(root, undefined), false);
  assert.equal(isPathInside(root, 42), false);
});

test('écriture atomique : contenu écrit, ancienne version en .bak, aucun fichier temporaire', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-test-'));
  const file = path.join(dir, '_NOTES.md');
  try {
    atomicWriteFile(file, 'v1');
    assert.equal(fs.readFileSync(file, 'utf-8'), 'v1');
    assert.equal(fs.existsSync(`${file}.bak`), false);

    atomicWriteFile(file, 'v2');
    assert.equal(fs.readFileSync(file, 'utf-8'), 'v2');
    assert.equal(fs.readFileSync(`${file}.bak`, 'utf-8'), 'v1');
    assert.deepEqual(fs.readdirSync(dir).sort(), ['_NOTES.md', '_NOTES.md.bak']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('écriture en échec : erreur levée, fichier existant intact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-test-'));
  try {
    assert.throws(() => atomicWriteFile(path.join(dir, 'absent', 'fichier.md'), 'x'));
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('noms de projet invalides refusés', () => {
  for (const bad of ['', '   ', '../evil', 'a/b', 'a\\b', 'CON', 'nom.', 'x'.repeat(81), 'a:b']) {
    assert.notEqual(validateProjectName(bad), null, `devrait refuser « ${bad} »`);
  }
  assert.equal(validateProjectName('Origin Zero'), null);
  assert.equal(validateProjectName('Épisode 2 — L\'abri'), null);
});
