// Sauvegardes de migration et restauration — dossier temporaire uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeWithBackup, listBackups, restoreBackup, createBackup } = require('../lib/safe-fs');

function withProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partner-backup-'));
  const file = path.join(dir, '_PROJECT.json');
  fs.writeFileSync(file, JSON.stringify({ title: 'v1' }));
  try {
    fn(dir, file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('migration : l\'original est sauvegardé avant l\'écriture', () => withProject((dir, file) => {
  const backup = writeWithBackup(file, JSON.stringify({ title: 'v2', schemaVersion: 2 }), 'v1');
  assert.equal(JSON.parse(fs.readFileSync(backup, 'utf-8')).title, 'v1');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf-8')).title, 'v2');
  assert.deepEqual(listBackups(dir), [path.basename(backup)]);
}));

test('deux sauvegardes dans la même seconde ne s\'écrasent pas', () => withProject((dir, file) => {
  const a = createBackup(file, 'v1');
  const b = createBackup(file, 'v1');
  assert.notEqual(a, b);
  assert.equal(listBackups(dir).length, 2);
}));

test('restauration réversible : la version remplacée est elle-même sauvegardée', () => withProject((dir, file) => {
  const backup = path.basename(writeWithBackup(file, JSON.stringify({ title: 'v2' }), 'v1'));
  const result = restoreBackup(dir, backup);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf-8')).title, 'v1');
  assert.ok(result.safetyCopy);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, result.safetyCopy), 'utf-8')).title, 'v2');
}));

test('restauration refusée pour un nom hors sauvegardes ou un chemin', () => withProject((dir) => {
  assert.throws(() => restoreBackup(dir, '../settings.json'), /invalide/);
  assert.throws(() => restoreBackup(dir, '_NOTES.md'), /invalide/);
  assert.throws(() => restoreBackup(dir, '_PROJECT.json'), /invalide/);
}));

test('une sauvegarde corrompue n\'est pas restaurée', () => withProject((dir, file) => {
  const name = '_PROJECT.backup-v1-20260101-120000.json';
  fs.writeFileSync(path.join(dir, name), '{ cassé');
  assert.throws(() => restoreBackup(dir, name));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf-8')).title, 'v1');
}));
