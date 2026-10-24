// Schéma, identifiants stables et migration — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const Schema = require('../src/core/schema');
const { applyUpdates, rolesAsSuggestions } = require('../src/core/project-model');

const legacyProject = () => ({
  title: 'Fixture',
  script: [{ page: 1, action: 'Ouverture' }, { page: 2, action: 'Couloir' }],
  characters: [
    { name: 'Lina', role: 'Protagoniste', dialogueCount: 4, goal: 'Partir' },
    { name: 'Marc', role: 'Mentor bourru' },
    { name: 'Ari' }, { name: 'Ari Rutoru' }
  ],
  todos: [{ title: 'Fin' }, { title: 'fin ' }, { title: 'Pourquoi partir ?' }, 'note brute'],
  places: [],
  customField: { keep: true }
});

test('un projet sans version est v1 et la migration est proposée, pas appliquée', () => {
  const raw = legacyProject();
  const before = JSON.stringify(raw);
  const plan = Schema.planMigration(raw);
  assert.equal(plan.status, 'migrate');
  assert.equal(plan.from, 1);
  assert.equal(JSON.stringify(raw), before, 'l\'original n\'est pas modifié');
});

test('la migration ajoute version et identifiants sans rien perdre', () => {
  const raw = legacyProject();
  const plan = Schema.planMigration(raw);
  const data = plan.data;
  assert.equal(data.schemaVersion, Schema.SCHEMA_VERSION);
  assert.deepEqual(data.customField, { keep: true });
  assert.equal(data.todos.length, 4);
  assert.equal(data.todos[3], 'note brute');
  assert.equal(data.characters[0].role, 'Protagoniste');
  assert.ok(data.script.every(p => /^pg_/.test(p.id)));
  assert.deepEqual(data.sequences, []);
  assert.deepEqual(Schema.verifyMigration(raw, data), []);
  const ids = Schema.COLLECTIONS.flatMap(c => data[c]).filter(i => i && i.id).map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
});

test('une migration répétée ne change plus rien (identifiants stables)', () => {
  const once = Schema.planMigration(legacyProject()).data;
  const again = Schema.planMigration(once);
  assert.equal(again.status, 'current');
  const copy = JSON.parse(JSON.stringify(once));
  Schema.ensureIds(copy);
  assert.deepEqual(copy, once);
});

test('la vérification détecte une perte ou une modification', () => {
  const raw = legacyProject();
  const data = Schema.planMigration(raw).data;
  const lost = { ...data, todos: data.todos.slice(1) };
  assert.ok(Schema.verifyMigration(raw, lost).length > 0);
  const changed = JSON.parse(JSON.stringify(data));
  changed.characters[1].role = 'Autre';
  assert.ok(Schema.verifyMigration(raw, changed).some(p => /characters\[1\]\.role/.test(p)));
});

test('la conversion des rôles devinés en suggestions est une option explicite', () => {
  const raw = legacyProject();
  const plan = Schema.planMigration(raw, { rolesToSuggestions: true });
  assert.equal(plan.report.guessedRoles, 1);
  const [lina, marc] = plan.data.characters;
  assert.equal(lina.role, undefined);
  assert.equal(lina.suggestedRole, 'Protagoniste');
  assert.equal(marc.role, 'Mentor bourru', 'un rôle saisi à la main reste un rôle');
  assert.deepEqual(Schema.verifyMigration(raw, plan.data, { rolesToSuggestions: true }), []);
  assert.ok(Schema.verifyMigration(raw, plan.data).length > 0, 'sans l\'option, la conversion est refusée');
});

test('un format plus récent ou invalide n\'est jamais migré', () => {
  assert.equal(Schema.planMigration({ schemaVersion: 99, title: 'x' }).status, 'too-new');
  assert.equal(Schema.planMigration({ title: 'x', todos: 'pas une liste' }).status, 'invalid');
  assert.equal(Schema.planMigration(null).status, 'invalid');
});

test('les doublons et noms proches sont signalés sans être fusionnés', () => {
  const data = Schema.planMigration(legacyProject()).data;
  const dup = Schema.findDuplicateCandidates(data);
  assert.equal(dup.todos.length, 1);
  assert.deepEqual(dup.todos[0].items.map(i => i.index), [0, 1]);
  assert.equal(Schema.extraCount(dup.todos), 1);
  assert.deepEqual(dup.aliases, [{ short: 'Ari', long: 'Ari Rutoru' }]);
  assert.equal(data.todos.length, 4);
});

test('un identifiant répété est réattribué sur la copie seulement', () => {
  const raw = { title: 'x', todos: [{ id: 'td_a', title: 'A' }, { id: 'td_a', title: 'B' }] };
  const plan = Schema.planMigration(raw);
  assert.equal(plan.data.todos[0].id, 'td_a');
  assert.notEqual(plan.data.todos[1].id, 'td_a');
  assert.deepEqual(Schema.verifyMigration(raw, plan.data), []);
});

test('les nouveaux éléments extraits reçoivent un id, les existants gardent le leur', () => {
  const project = Schema.planMigration(legacyProject()).data;
  const firstId = project.script[0].id;
  const { data } = applyUpdates(project, { script_updates: [{ page: 1, action: 'Ouverture revue' }, { page: 3, action: 'Fin' }] });
  assert.equal(data.script[0].id, firstId);
  assert.ok(data.script[2].id && data.script[2].id !== firstId);
  assert.equal(project.script.length, 2, 'le projet d\'origine n\'est pas modifié');
});

test('une séquence re-extraite garde ses pages précédentes', () => {
  const project = Schema.createEmptyProject('x');
  const first = applyUpdates(project, { sequences: [{ number: 1, pages: [1, 2] }] }).data;
  const second = applyUpdates(first, { sequences: [{ number: 1, pages: [3] }] }).data;
  assert.deepEqual(second.sequences[0].pages, [1, 2, 3]);
  assert.equal(second.sequences[0].id, first.sequences[0].id);
});

test('les rôles proposés par l\'IA deviennent des suggestions et ne remplacent rien', () => {
  const project = Schema.planMigration(legacyProject()).data;
  const updates = rolesAsSuggestions({ character_updates: [{ name: 'Marc', role: 'Traître' }, { name: 'Zoé', role: 'Alliée' }] }, 'IA');
  const { data } = applyUpdates(project, updates);
  const marc = data.characters.find(c => c.name === 'Marc');
  const zoe = data.characters.find(c => c.name === 'Zoé');
  assert.equal(marc.role, 'Mentor bourru');
  assert.equal(marc.suggestedRole, 'Traître');
  assert.equal(zoe.role, undefined);
  assert.equal(zoe.suggestedRole, 'Alliée');
  assert.equal(zoe.suggestionSource, 'IA');
});
