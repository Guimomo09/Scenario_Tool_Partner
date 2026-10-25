// Analyse heuristique des scripts manga — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const MangaParser = require('../src/core/manga-parser');
const { validateUpdates, applyUpdates } = require('../src/core/project-model');

// Le module est écrit pour le renderer : on lui fournit le `window` qu'il attend
global.window = { MangaParser };
const MangaAnalysis = require('../src/components/manga-analysis');
const analysis = new MangaAnalysis();

const SCRIPT = [
  'Séquence 1 : Le quai',
  'Brouillard sur le port.',
  'Page 1',
  'Lina attend sur le quai, 20 ans après la chute.',
  'Lina : Il est en retard.',
  'Marc : Je suis là.',
  '(il essouffle)',
  'Lina (pensée) : Encore lui.',
  'Page 2',
  'Lina : Tu avais promis de me faire confiance.',
  'Marc : Je dois rester.',
  'Séquence 2',
  'Double page 3-4',
  'Vue large de la ville.',
  'Page 5',
  'Garde : Halte.',
  'Ligne que le parseur ne sait pas classer ;'
].join('\n');

const run = () => analysis.parseNotesLocally(SCRIPT);

test('le résultat local passe la validation sans rien perdre des pages', () => {
  const raw = run();
  const { valid, updates } = validateUpdates(raw);
  assert.equal(valid, true);
  assert.deepEqual(updates.script_updates.map(p => p.page), [1, 2, 3, 5]);
  assert.equal(updates.script_updates.length, raw.script_updates.length);
});

test('chaque page garde les blocs du parseur, dans le même ordre', () => {
  const parsed = MangaParser.parse(SCRIPT);
  const pages = run().script_updates;
  parsed.pages.forEach((page, i) => {
    assert.deepEqual(pages[i]._blocks, page.blocks);
    assert.equal(pages[i].sequence, page.sequence);
  });
  assert.deepEqual(pages[0]._blocks.map(b => b.type), ['header', 'action', 'dialogue', 'dialogue', 'indication', 'thought']);
});

test('double page et lignes source conservées', () => {
  const pages = run().script_updates;
  const spread = pages.find(p => p.page === 3);
  assert.equal(spread.isDoublePage, true);
  assert.equal(spread.endNumber, 4);
  pages.forEach(p => {
    assert.equal(p.source, '_NOTES.md');
    assert.ok(p.sourceLines[0] <= p.sourceLines[1]);
  });
});

test('les rôles restent des suggestions justifiées, jamais des rôles', () => {
  const chars = run().character_updates;
  assert.ok(chars.length >= 2);
  chars.forEach(c => assert.equal(c.role, undefined));
  const lina = chars.find(c => c.name === 'Lina');
  assert.equal(lina.dialogueCount, 2);
  if (lina.suggestedRole) assert.match(lina.suggestionSource, /^analyse locale : /);
});

test('un figurant avec peu de répliques n\'est pas ajouté comme personnage', () => {
  assert.equal(run().character_updates.some(c => c.name === 'Garde'), false);
});

test('les événements de chronologie détectés passent la validation (période renseignée)', () => {
  const raw = run();
  assert.ok(raw.timeline_updates.length >= 1, 'événement « 20 ans après la chute » détecté');
  const { updates } = validateUpdates(raw);
  assert.equal(updates.timeline_updates.length, raw.timeline_updates.length);
  assert.equal(updates.timeline_updates[0].period, 'Il y a 20 ans');
});

test('analyse répétée : résultat identique et application sans doublon', () => {
  assert.deepEqual(run(), run());
  const { updates } = validateUpdates(run());
  const once = applyUpdates({ schemaVersion: 2 }, updates).data;
  const twice = applyUpdates(once, updates).data;
  ['script', 'characters', 'places', 'systems', 'timeline'].forEach(c => assert.equal(twice[c].length, once[c].length, c));
});

test('notes non manga : TODO et personnage explicite, dialogue en question ignoré', () => {
  const notes = '## Acte I\nTODO: définir le motif du méchant\nLina : pourquoi ?\npersonnage: Nora\n- [ ] relire la fin';
  const { updates } = validateUpdates(analysis.parseNotesLocally(notes));
  assert.deepEqual(updates.todos.map(t => t.title), ['définir le motif du méchant', 'relire la fin']);
  assert.equal(updates.todos[0].context, 'Acte I');
  assert.deepEqual(updates.character_updates.map(c => c.name), ['Nora']);
});

test('notes vides ou sans structure : aucun plantage, rien d\'inventé', () => {
  for (const notes of ['', '   ', 'Une phrase.']) {
    const { valid, updates } = validateUpdates(analysis.parseNotesLocally(notes));
    assert.equal(valid, true);
    assert.equal(updates.script_updates.length + updates.character_updates.length + updates.todos.length, 0);
  }
});
