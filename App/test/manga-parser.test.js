// Parseur manga sans perte — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const MangaParser = require('../src/core/manga-parser');

const SCRIPT = [
  'Titre provisoire',
  '',
  'Séquence 1 : Le quai',
  'Brouillard sur le port.',
  'Page 1',
  'Lina attend sur le quai.',
  'Lina :',
  '- Il est en retard.',
  'Marc : Je suis là.',
  '(il essouffle)',
  'Lina (pensée) : Encore lui.',
  'BOUM',
  'Page 2 : La dispute',
  'Lina : Tu avais promis.',
  '- Mon frère...',
  'Séquence 2',
  'Page 3',
  'Ari : Bonjour.',
  'Ari Rutoru : Qui parle ?',
  'Lina (pensée) : Deux Ari ?',
  '- ligne orpheline',
  '(note ouverte',
  'Double page 4-5',
  'Vue large de la ville.'
].join('\n');

const nonEmpty = (text) => text.split('\n').map(l => l.trim()).filter(Boolean);

test('le script est reconnu comme manga', () => {
  assert.equal(MangaParser.isMangaScript(SCRIPT), true);
  assert.equal(MangaParser.isMangaScript('Une note sans page.\nLina : bonjour'), false);
});

test('aucune ligne non vide n\'est perdue, dans l\'ordre d\'origine', () => {
  const result = MangaParser.parse(SCRIPT);
  assert.deepEqual(MangaParser.sourceLines(result), nonEmpty(SCRIPT));
});

test('actions, dialogues et pensées gardent leur ordre commun', () => {
  const page1 = MangaParser.parse(SCRIPT).pages[0];
  assert.deepEqual(page1.blocks.map(b => b.type),
    ['header', 'action', 'dialogue', 'dialogue', 'indication', 'thought', 'action']);
  assert.deepEqual(page1.blocks.slice(1).map(b => b.text),
    ['Lina attend sur le quai.', 'Il est en retard.', 'Je suis là.', 'il essouffle', 'Encore lui.', 'BOUM']);
  assert.equal(page1.blocks[2].speaker, 'Lina');
  assert.equal(page1.blocks[2].raw, 'Lina :\n- Il est en retard.');
});

test('les pages sont rattachées à la séquence où elles commencent', () => {
  const result = MangaParser.parse(SCRIPT);
  const bySeq = Object.fromEntries(result.sequences.map(s => [s.number, s.pages]));
  assert.deepEqual(bySeq, { 1: [1, 2], 2: [3, 4] });
  assert.deepEqual(result.pages.map(p => [p.number, p.sequence]), [[1, 1], [2, 1], [3, 2], [4, 2]]);
  // La page 2 ne déborde pas sur la séquence 2
  assert.ok(!result.pages[1].blocks.some(b => /Séquence/.test(b.raw)));
});

test('préambule et introduction de séquence sont conservés', () => {
  const result = MangaParser.parse(SCRIPT);
  assert.deepEqual(result.preamble.map(b => b.raw), ['Titre provisoire']);
  assert.deepEqual(result.sequences[0].intro.map(b => b.raw), ['Brouillard sur le port.']);
  assert.equal(result.sequences[0].label, 'Le quai');
});

test('titre de page et double page reconnus', () => {
  const result = MangaParser.parse(SCRIPT);
  assert.equal(result.pages[1].heading, 'La dispute');
  const double = result.pages[3];
  assert.equal(double.isDoublePage, true);
  assert.equal(double.endNumber, 5);
});

test('les lignes non reconnues deviennent des blocs inconnus au lieu d\'être ignorées', () => {
  const page3 = MangaParser.parse(SCRIPT).pages[2];
  const unknown = page3.blocks.filter(b => b.type === 'unknown').map(b => b.raw);
  // Après une pensée, le tiret est rattaché à la pensée ; la parenthèse non fermée reste brute
  assert.ok(unknown.includes('(note ouverte'));
});

test('les noms proches ne sont pas fusionnés mais signalés', () => {
  const result = MangaParser.parse(SCRIPT);
  assert.ok(result.characters.has('Ari'));
  assert.ok(result.characters.has('Ari Rutoru'));
  assert.deepEqual(MangaParser.aliasCandidates(result.characters.keys()), [{ short: 'Ari', long: 'Ari Rutoru' }]);
});

test('le rôle n\'est qu\'une suggestion fondée sur les répliques du personnage', () => {
  const result = MangaParser.parse(SCRIPT);
  const lina = result.characters.get('Lina');
  assert.equal(lina.thoughtCount, 3); // dont la ligne à tiret qui prolonge sa pensée
  assert.equal(lina.suggestion.role, 'Point de vue');
  assert.match(lina.suggestion.evidence, /3 pensées/);
  // Un mot présent ailleurs dans le texte ne donne aucun rôle
  const other = MangaParser.parse('Page 1\nMarc : Oui, père. Ce fou finira le travail.\n');
  assert.equal(other.characters.get('Marc').suggestion, null);
});

test('une page répétée réunit ses contenus sans rien écraser', () => {
  const result = MangaParser.parse('Page 1\nLina : A\nPage 2\nMarc : B\nPage 1\nLina : C');
  assert.equal(result.pages.length, 2);
  assert.deepEqual(result.pages[0].dialogues.map(d => d.text), ['A', 'C']);
  assert.equal(result.warnings.length, 1);
});

test('un nom seul sur sa ligne suivi de répliques à tiret est un locuteur', () => {
  const text = 'Page 1\nAri\n-Bonjour, Père.\n-Je suis prêt.\n\nKeyn (pensée)\n-Il ne sait rien.\nLa porte\nUn couloir sombre.';
  const page = MangaParser.parse(text).pages[0];
  assert.deepEqual(page.blocks.slice(1).map(b => [b.type, b.speaker ?? null, b.text]), [
    ['dialogue', 'Ari', 'Bonjour, Père.'],
    ['dialogue', 'Ari', 'Je suis prêt.'],
    ['thought', 'Keyn', 'Il ne sait rien.'],
    ['action', null, 'La porte'],
    ['action', null, 'Un couloir sombre.']
  ]);
  assert.deepEqual(MangaParser.sourceLines(MangaParser.parse(text)), nonEmpty(text));
});

test('le texte HTML du manuscrit est conservé brut (l\'échappement se fait au rendu)', () => {
  const result = MangaParser.parse('Page 1\n<img src=x onerror=alert(1)>');
  assert.equal(result.pages[0].blocks[1].raw, '<img src=x onerror=alert(1)>');
});
