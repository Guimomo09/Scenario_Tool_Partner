// Bible (fiches manuelles) — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const Bible = require('../src/core/bible');
const { applyUpdates } = require('../src/core/project-model');

const fixture = () => ({
  schemaVersion: 2,
  characters: [
    { id: 'ch_1', name: 'Lina', suggestedRole: 'Point de vue', suggestionSource: 'parseur', dialogueCount: 4,
      relationships: [{ character: 'Marc', type: 'frère' }], traits: ['tenace'] },
    { id: 'ch_2', name: 'Lina Voss' }
  ],
  places: [], systems: [], timeline: [{ id: 'tl_1', period: 'An 0', event: 'Chute' }], refs: []
});

test('ajout manuel : identifiant, origine, listes une valeur par ligne', () => {
  const { data, entry, error } = Bible.addEntry(fixture(), 'characters', {
    name: '  Marc ', traits: 'bourru\n\n loyal ', unknown: 'ignoré'
  });
  assert.equal(error, null);
  assert.match(entry.id, /^ch_/);
  assert.equal(entry.name, 'Marc');
  assert.deepEqual(entry.traits, ['bourru', 'loyal']);
  assert.equal(entry.origin, 'auteur');
  assert.equal(entry.unknown, undefined);
  assert.equal(data.characters.length, 3);
});

test('un nom existant est refusé, jamais fusionné ; un homonyme partiel est accepté', () => {
  const dup = Bible.addEntry(fixture(), 'characters', { name: 'lina' });
  assert.ok(dup.error);
  assert.equal(dup.duplicate.id, 'ch_1');
  assert.equal(dup.data.characters.length, 2);
  assert.equal(Bible.addEntry(fixture(), 'characters', { name: 'Lina Martin' }).error, null);
});

test('champ obligatoire vide refusé', () => {
  assert.match(Bible.addEntry(fixture(), 'places', { name: '  ' }).error, /Nom/);
  assert.match(Bible.addEntry(fixture(), 'timeline', { period: 'An 1' }).error, /Événement/);
});

test('modification : champs extraits et inconnus conservés, liste d\'objets non écrasée', () => {
  const data = fixture();
  data.characters[0].custom = 42;
  const { entry, error } = Bible.updateEntry(data, 'characters', 'ch_1', {
    description: 'Pilote', traits: 'tenace\ncurieuse', relationships: 'texte'
  });
  assert.equal(error, null);
  assert.equal(entry.description, 'Pilote');
  assert.deepEqual(entry.traits, ['tenace', 'curieuse']);
  assert.equal(entry.dialogueCount, 4);
  assert.equal(entry.custom, 42);
  assert.deepEqual(entry.relationships, [{ character: 'Marc', type: 'frère' }]);
});

test('renommer vers le nom d\'une autre fiche est refusé', () => {
  const r = Bible.updateEntry(fixture(), 'characters', 'ch_2', { name: 'LINA' });
  assert.ok(r.error);
  assert.equal(r.data.characters[1].name, 'Lina Voss');
});

test('confirmer un rôle suggéré est une décision explicite', () => {
  const { data, changed } = Bible.confirmSuggestedRole(fixture(), 'ch_1');
  assert.equal(changed, true);
  assert.equal(data.characters[0].role, 'Point de vue');
  assert.equal(data.characters[0].suggestedRole, undefined);
  assert.equal(Bible.confirmSuggestedRole(data, 'ch_1').changed, false);
});

test('une saisie manuelle n\'est pas écrasée par une extraction ultérieure', () => {
  let data = Bible.updateEntry(fixture(), 'characters', 'ch_1', { description: 'Version auteur' }).data;
  data = applyUpdates(data, { character_updates: [{ name: 'Lina', description: 'Version IA', arc: 'Nouveau' }] }).data;
  assert.equal(data.characters[0].description, 'Version auteur');
  assert.equal(data.characters[0].arc, 'Nouveau');
});

test('suppression ciblée et champs en lecture seule', () => {
  const { data, removed } = Bible.removeEntry(fixture(), 'characters', 'ch_2');
  assert.equal(removed, true);
  assert.deepEqual(data.characters.map(c => c.id), ['ch_1']);
  const extra = Bible.extraFields('characters', fixture().characters[0]).map(([k]) => k);
  assert.deepEqual(extra.sort(), ['dialogueCount', 'relationships']);
});

test('chronologie : identité période + événement, titre lisible', () => {
  assert.ok(Bible.addEntry(fixture(), 'timeline', { period: 'an 0', event: 'chute' }).error);
  assert.equal(Bible.addEntry(fixture(), 'timeline', { period: 'An 0', event: 'Exode' }).error, null);
  assert.equal(Bible.titleOf('timeline', fixture().timeline[0]), 'An 0 — Chute');
});
