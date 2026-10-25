// Structure (scènes, pages, doubles pages) — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const Structure = require('../src/core/structure');
const Schema = require('../src/core/schema');
const { applyUpdates } = require('../src/core/project-model');

const fixture = () => ({
  schemaVersion: 2,
  title: 'Fixture',
  characters: [{ id: 'ch_lina', name: 'Lina' }, { id: 'ch_marc', name: 'Marc' }],
  script: [
    { id: 'pg_1', page: 1, sequence: 1, _blocks: [{ type: 'action', text: 'Nuit.' }, { type: 'dialogue', speaker: 'Lina', text: 'Viens.' }] },
    { id: 'pg_2', page: 2, sequence: 1, _blocks: [{ type: 'thought', speaker: 'Marc', text: 'Non.' }] },
    { id: 'pg_3', page: 3, sequence: 2, isDoublePage: true, endNumber: 4, _blocks: [] },
    { id: 'pg_5', page: 5, sequence: 2, _blocks: [] },
    { id: 'pg_6', page: 6, sequence: 2, _blocks: [] }
  ],
  sequences: [{ number: 1, title: 'SÉQUENCE 1 — Le quai', _intro: [{ text: 'Brouillard.' }] }, { number: 2, title: 'SÉQUENCE 2' }],
  scenes: []
});

test('une scène peut être créée sans aucun champ rempli', () => {
  const { data, scene } = Structure.addScene(fixture());
  assert.equal(data.scenes.length, 1);
  assert.match(scene.id, /^sc_/);
  assert.equal(scene.title, '');
  assert.equal(scene.status, 'idea');
  assert.deepEqual(scene.characters, []);
});

test('les fonctions ne modifient jamais le projet reçu', () => {
  const original = fixture();
  const before = JSON.stringify(original);
  const { data } = Structure.addScene(original, { title: 'A' });
  Structure.updateScene(data, data.scenes[0].id, { title: 'B' });
  Structure.moveScene(data, data.scenes[0].id, 0);
  Structure.setPageSpread(original, 'pg_5', true);
  assert.equal(JSON.stringify(original), before);
});

test('la modification garde les champs inconnus et ignore un statut inconnu', () => {
  let { data, scene } = Structure.addScene(fixture(), { title: 'Quai' });
  data.scenes[0].custom = { keep: true };
  ({ data, scene } = Structure.updateScene(data, scene.id, { goal: 'Partir', status: 'nimporte', hack: 1 }));
  assert.equal(scene.goal, 'Partir');
  assert.equal(scene.status, 'idea');
  assert.deepEqual(scene.custom, { keep: true });
  assert.equal(scene.hack, undefined);
});

test('le réordonnancement garde identifiants et liens', () => {
  let data = fixture();
  const ids = [];
  for (const t of ['A', 'B', 'C']) {
    const r = Structure.addScene(data, { title: t, characters: ['ch_lina'], pages: ['pg_1'] });
    data = r.data;
    ids.push(r.scene.id);
  }
  data = Structure.moveScene(data, ids[2], 0).data;
  assert.deepEqual(data.scenes.map(s => s.title), ['C', 'A', 'B']);
  data = Structure.moveSceneBy(data, ids[0], 1).data;
  assert.deepEqual(data.scenes.map(s => s.title), ['C', 'B', 'A']);
  assert.deepEqual(data.scenes.map(s => s.id).sort(), [...ids].sort());
  assert.ok(data.scenes.every(s => s.characters[0] === 'ch_lina' && s.pages[0] === 'pg_1'));
  assert.equal(Structure.moveSceneBy(data, ids[0], 5).data.scenes.at(-1).id, ids[0], 'déplacement borné');
});

test('insertion après une scène donnée', () => {
  let { data, scene: a } = Structure.addScene(fixture(), { title: 'A' });
  ({ data } = Structure.addScene(data, { title: 'C' }));
  ({ data } = Structure.addScene(data, { title: 'B' }, { after: a.id }));
  assert.deepEqual(data.scenes.map(s => s.title), ['A', 'B', 'C']);
});

test('un personnage supprimé reste signalé dans la scène, pas retiré', () => {
  const { data, scene } = Structure.addScene(fixture(), { characters: ['ch_lina', 'ch_absent', 'ch_lina'] });
  assert.deepEqual(scene.characters, ['ch_lina', 'ch_absent'], 'doublons de lien retirés');
  const linked = Structure.charactersOf(data, scene);
  assert.deepEqual(linked.map(c => c.missing), [false, true]);
  assert.equal(Structure.scenesForCharacter(data, 'ch_lina').length, 1);
});

test('la suppression ne retire que la scène demandée', () => {
  let { data, scene: a } = Structure.addScene(fixture(), { title: 'A' });
  ({ data } = Structure.addScene(data, { title: 'B' }));
  const result = Structure.removeScene(data, a.id);
  assert.equal(result.removed, true);
  assert.deepEqual(result.data.scenes.map(s => s.title), ['B']);
  assert.equal(result.data.characters.length, 2);
});

test('doubles pages : détectées par le parseur ou marquées par l\'auteur', () => {
  let data = fixture();
  data = Structure.setPageSpread(data, 'pg_5', true).data;
  const units = Structure.groupSpreads(data.script);
  assert.deepEqual(units.map(u => [u.spread, u.pages.map(p => p.page)]),
    [[false, [1]], [false, [2]], [true, [3]], [true, [5, 6]]]);
  data = Structure.setPageSpread(data, 'pg_5', false).data;
  assert.equal(data.script.find(p => p.id === 'pg_5').spread, undefined);
});

test('la marque de double page survit à une nouvelle synchronisation de la page', () => {
  let data = Structure.setPageSpread(fixture(), 'pg_5', true).data;
  data = applyUpdates(data, { script_updates: [{ page: 5, action: 'Re-extrait', _blocks: [] }] }).data;
  const page = data.script.find(p => p.page === 5);
  assert.equal(page.spread, true);
  assert.equal(page.id, 'pg_5');
  assert.equal(page.action, 'Re-extrait');
});

test('scènes proposées depuis les séquences, sans doublon avec l\'existant', () => {
  let data = fixture();
  const proposals = Structure.proposeScenesFromSequences(data);
  assert.equal(proposals.length, 2);
  assert.equal(proposals[0].title, 'SÉQUENCE 1 — Le quai');
  assert.equal(proposals[0].summary, 'Brouillard.');
  assert.deepEqual(proposals[0].pages, ['pg_1', 'pg_2']);
  assert.deepEqual(proposals[0].characters, ['ch_lina', 'ch_marc']);
  assert.equal(data.scenes.length, 0, 'rien n\'est ajouté par la proposition');
  data = Structure.addScene(data, proposals[0]).data;
  assert.deepEqual(Structure.proposeScenesFromSequences(data).map(p => p.pages[0]), ['pg_3']);
});

test('scènes proposées depuis les titres d\'un document et retrouvées par section', () => {
  let data = fixture();
  const text = '# Acte I\ntexte\n## Le quai\n...\n## Le quai\n### Fuite ###\n#### trop profond';
  const proposals = Structure.proposeScenesFromHeadings(data, 'Episode.md', text);
  assert.deepEqual(proposals.map(p => p.heading), ['Acte I', 'Le quai', 'Fuite']);
  data = Structure.addScene(data, proposals[1]).data;
  assert.equal(Structure.sceneAt(data, 'Episode.md', '  le QUAI ').title, 'Le quai');
  assert.equal(Structure.sceneAt(data, 'Autre.md', 'Le quai'), null);
  assert.equal(Structure.proposeScenesFromHeadings(data, 'Episode.md', text).length, 2);
});

test('les scènes passent la migration et reçoivent un identifiant', () => {
  assert.ok(Schema.COLLECTIONS.includes('scenes'));
  const plan = Schema.planMigration({ title: 'v1', scenes: [{ title: 'Sans id' }] });
  assert.equal(plan.status, 'migrate');
  assert.match(plan.data.scenes[0].id, /^sc_/);
  assert.deepEqual(Schema.verifyMigration({ title: 'v1', scenes: [{ title: 'Sans id' }] }, plan.data), []);
});

test('renommer un titre de section : les scènes liées suivent', () => {
  let data = Structure.addScene(fixture(), { title: 'Le quai', doc: 'Ep.md', heading: 'Le quai' }).data;
  data = Structure.addScene(data, { title: 'Titre libre', doc: 'Ep.md', heading: 'Le quai' }).data;
  data = Structure.addScene(data, { title: 'Le quai', doc: 'Autre.md', heading: 'Le quai' }).data;
  const r = Structure.followHeadingRename(data, 'Ep.md', ['Intro', 'Le quai', 'Fin'], ['Intro', 'Le quai de nuit', 'Fin']);
  assert.equal(r.renamed.length, 2);
  assert.deepEqual(r.data.scenes.map(s => [s.title, s.heading]),
    [['Le quai de nuit', 'Le quai de nuit'], ['Titre libre', 'Le quai de nuit'], ['Le quai', 'Le quai']]);
});

test('renommage ambigu ou structurel : aucun lien modifié', () => {
  const data = Structure.addScene(fixture(), { doc: 'Ep.md', heading: 'A' }).data;
  const cases = [
    [['A', 'B'], ['A2', 'B2']],      // deux titres changés
    [['A', 'B'], ['A', 'B', 'C']],   // section ajoutée
    [['A', 'B'], ['B', 'B']],        // le nouveau titre existe déjà
    [['A', 'A'], ['X', 'A']],        // l'ancien titre était en double
    [['A', 'B'], ['', 'B']]          // titre vidé
  ];
  for (const [before, after] of cases) {
    const r = Structure.followHeadingRename(data, 'Ep.md', before, after);
    assert.equal(r.renamed.length, 0, JSON.stringify(after));
    assert.equal(r.data, data);
  }
});
