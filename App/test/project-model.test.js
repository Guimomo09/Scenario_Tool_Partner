// Fusion non destructive — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyUpdates, validateUpdates } = require('../src/core/project-model');

const baseProject = () => ({
  title: 'Fixture',
  script: [
    { page: 1, action: 'Ouverture', _dialogues: [{ speaker: 'Lina', text: 'Bonjour.' }] },
    { page: 2, action: 'Couloir' }
  ],
  characters: [{ name: 'Lina', role: 'Protagoniste', goal: 'Retrouver son frère', traits: ['têtue'] }],
  places: [], systems: [], timeline: [], refs: [],
  todos: [{ title: 'Fin' }, { title: 'Pourquoi partir ?' }],
  customField: { keep: true }
});

test('une synchro partielle ne supprime pas les autres pages', () => {
  const { data } = applyUpdates(baseProject(), { script_updates: [{ page: 3, action: 'Nouvelle page' }] });
  assert.deepEqual(data.script.map(p => p.page), [1, 2, 3]);
  assert.equal(data.script[0]._dialogues[0].text, 'Bonjour.');
});

test('une page re-extraite met à jour son contenu sans toucher aux autres', () => {
  const { data } = applyUpdates(baseProject(), { script_updates: [{ page: 2, action: 'Couloir sombre' }] });
  assert.equal(data.script[1].action, 'Couloir sombre');
  assert.equal(data.script[0].action, 'Ouverture');
});

test('les champs manuels d\'un personnage sont conservés', () => {
  const { data } = applyUpdates(baseProject(), {
    character_updates: [{ name: 'lina', role: 'Antagoniste', trait: 'courageuse' }]
  });
  assert.equal(data.characters.length, 1);
  const lina = data.characters[0];
  assert.equal(lina.goal, 'Retrouver son frère');
  assert.equal(lina.role, 'Protagoniste'); // valeur existante non écrasée
  assert.deepEqual(lina.traits, ['têtue', 'courageuse']);
});

test('les homonymes partageant un prénom ne sont pas fusionnés', () => {
  const { data } = applyUpdates({ ...baseProject(), characters: [] }, {
    character_updates: [{ name: 'Jean Martin' }, { name: 'Jean Dupont' }, { name: 'Le Gardien' }]
  });
  assert.deepEqual(data.characters.map(c => c.name), ['Jean Martin', 'Jean Dupont', 'Le Gardien']);
});

test('les éléments narratifs ne deviennent pas des personnages', () => {
  const { data } = applyUpdates({ ...baseProject(), characters: [] }, {
    character_updates: [{ name: 'Voix off' }, { name: 'Narrateur' }, { name: 'Page 3' }]
  });
  assert.equal(data.characters.length, 0);
});

test('les notes courtes existantes sont conservées et un ajout identique ne crée pas de doublon', () => {
  const { data } = applyUpdates(baseProject(), { todos: [{ title: 'fin' }, { title: 'Nouvelle question ?' }] });
  assert.deepEqual(data.todos.map(t => t.title), ['Fin', 'Pourquoi partir ?', 'Nouvelle question ?']);
});

test('appliquer deux fois la même mise à jour ne crée aucun doublon', () => {
  const updates = {
    script_updates: [{ page: 3, action: 'X' }],
    character_updates: [{ name: 'Milo' }],
    timeline_updates: [{ period: 'An 1', event: 'Effondrement' }],
    todos: [{ title: 'Définir le motif' }]
  };
  const once = applyUpdates(baseProject(), updates).data;
  const { data: twice, summary } = applyUpdates(once, updates);
  assert.deepEqual(twice, once);
  assert.deepEqual(summary, {});
});

test('les champs inconnus du projet sont préservés et l\'original n\'est pas modifié', () => {
  const original = baseProject();
  const snapshot = JSON.stringify(original);
  const { data } = applyUpdates(original, { script_updates: [{ page: 9, action: 'Y' }] });
  assert.deepEqual(data.customField, { keep: true });
  assert.equal(JSON.stringify(original), snapshot);
});

test('le résumé ne compte que les changements réels', () => {
  const { summary } = applyUpdates(baseProject(), {
    script_updates: [{ page: 1, action: 'Ouverture' }, { page: 4, action: 'Fin' }]
  });
  assert.deepEqual(summary, { script: { added: 1, updated: 0 } });
});

test('validateUpdates rejette une réponse non structurée', () => {
  assert.equal(validateUpdates(null).valid, false);
  assert.equal(validateUpdates('texte').valid, false);
  assert.equal(validateUpdates([]).valid, false);
});

test('validateUpdates écarte les éléments mal formés', () => {
  const { valid, updates } = validateUpdates({
    script_updates: [{ page: '5', action: 'ok' }, { page: 'abc' }, 'texte', null],
    character_updates: [{ name: '' }, { role: 'sans nom' }, { name: 'Milo' }],
    timeline_updates: [{ event: 'sans période' }, { period: 'An 2', event: 'Retour' }],
    todos: 'pas un tableau'
  });
  assert.equal(valid, true);
  assert.deepEqual(updates.script_updates, [{ page: 5, action: 'ok' }]);
  assert.deepEqual(updates.character_updates, [{ name: 'Milo' }]);
  assert.deepEqual(updates.timeline_updates, [{ period: 'An 2', event: 'Retour' }]);
  assert.deepEqual(updates.todos, []);
});
