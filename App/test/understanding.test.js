// Compréhension : contamination, fusion local/IA, provenance et révision — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const MangaParser = require('../src/core/manga-parser');
const { validateUpdates, applyUpdates, combineExtractions } = require('../src/core/project-model');
const Provenance = require('../src/core/provenance');
const Bible = require('../src/core/bible');
const { describeEntity, findMentionedEntities } = require('../src/core/partner-context');

global.window = { MangaParser };
const MangaAnalysis = require('../src/components/manga-analysis');
const analysis = new MangaAnalysis();

const INTERPRETIVE = ['type', 'description', 'traits', 'strengths', 'weaknesses', 'goals', 'motivations', 'relationships', 'arc'];
const local = (notes, known) => validateUpdates(analysis.parseNotesLocally(notes, known)).updates;
const byName = (list, name) => list.find(c => c.name === name);

// Lina parle de Marc ; Noé ne dit que deux phrases banales
const CONTAMINATION = [
  '## Séquence 1',
  '### Page 1',
  'Un régime contrôle la ville. Marc fait un salut militaire.',
  '**Lina:**',
  '- Marc est capitaine, exemplaire, et orphelin depuis toujours.',
  '- Il a les meilleurs résultats de la caserne, le plus jeune capitaine.',
  '**Marc:**',
  '- Merci. Je dois protéger la ville, pas le choix.',
  '### Page 2',
  '**Noé:**',
  '- Je cherche la gare.',
  '- À demain.'
].join('\n');

test('1. aucune biographie ni motivation n\'est attribuée par contamination du texte global', () => {
  const chars = local(CONTAMINATION).character_updates;
  const noe = byName(chars, 'Noé');
  assert.ok(noe, 'Noé reste identifié');
  INTERPRETIVE.forEach(f => assert.equal(noe[f], undefined, `Noé.${f}`));
  // Même Marc ne reçoit pas de lecture psychologique déduite de mots : seulement des observations
  const marc = byName(chars, 'Marc');
  INTERPRETIVE.forEach(f => assert.equal(marc[f], undefined, `Marc.${f}`));
  assert.deepEqual(noe.appearances, [2]);
  assert.equal(noe.dialogueCount, 2);
});

test('1b. aucune fiche de système n\'est créée à partir de mots-clés', () => {
  assert.equal(local(CONTAMINATION).system_updates.length, 0);
});

test('3. négation, mensonge ou projet ne deviennent pas des objectifs établis', () => {
  const notes = '## Séquence 1\n### Page 1\n**Roi:**\n- Je ne veux pas sauver le roi.\n**Ana:**\n- Il faut tuer Brun, je mens peut-être.\n- Je vais le faire.';
  local(notes).character_updates.forEach(c => {
    assert.equal(c.goals, undefined);
    assert.equal(c.motivations, undefined);
  });
});

test('5. un personnage muet de la bible est retrouvé ; partager une page ne crée pas de relation', () => {
  const notes = '## Séquence 1\n### Page 1\nSam observe sans rien dire.\n**Lina:**\n- Encore toi, toujours là quand il ne faut pas.\n**Marc:**\n- Oui.';
  const chars = local(notes, { characters: [{ id: 'ch_s', name: 'Sam' }] }).character_updates;
  assert.deepEqual(byName(chars, 'Sam').appearances, [1]);
  const lina = byName(chars, 'Lina');
  assert.equal(lina.relationships, undefined);
  assert.deepEqual(lina.coPresence, [{ character: 'Marc', pages: [1] }]);
});

test('6. un alias confirmé retrouve la fiche ; un alias ambigu reste séparé et signalé', () => {
  // (le parseur ne prend pas « Le Voyageur » pour un locuteur : article en tête, garde-fou existant)
  const notes = '## Séquence 1\n### Page 1\n**Voyageur:**\n- Je cherche la gare depuis ce matin.\n**Ombre:**\n- Personne ne passe ici.';
  const known = { characters: [
    { id: 'ch_n', name: 'Noé', aliases: ['Voyageur', 'Le Voyageur'] },
    { id: 'ch_a', name: 'Ana', aliases: ['Ombre'] },
    { id: 'ch_b', name: 'Brun', aliases: ['Ombre'] }
  ] };
  const raw = analysis.parseNotesLocally(notes, known);
  const names = raw.character_updates.map(c => c.name);
  assert.ok(names.includes('Noé'));
  assert.ok(!names.includes('Voyageur'));
  assert.ok(names.includes('Ombre'), 'alias ambigu gardé séparé');
  assert.ok(!names.includes('Ana') && !names.includes('Brun'), 'aucune des deux fiches ne reçoit la réplique');
  assert.ok(raw._notices.some(n => n.includes('Ombre') && n.includes('plusieurs fiches')));
  // Le contexte du partenaire retrouve aussi la fiche par son alias
  const found = findMentionedEntities('Le Voyageur ouvre la porte.', { characters: known.characters });
  assert.deepEqual(found.map(f => f.entity.name), ['Noé']);
});

test('9. une description de lieu issue d\'une action est lue et reliée au bon lieu', () => {
  const notes = '## Séquence 1\n### Page 1\nLina arrive. La gare est sombre et glaciale. Le port est calme.\n**Lina:**\n- Personne.';
  const places = [{ id: 'pl_g', name: 'gare' }, { id: 'pl_p', name: 'port' }];
  const updates = local(notes, { places });
  const gare = byName(updates.place_updates, 'gare');
  const port = byName(updates.place_updates, 'port');
  assert.equal(gare.atmosphere, 'sombre, froid');
  assert.equal(gare._evidence.atmosphere.page, 1);
  assert.match(gare._evidence.atmosphere.quote, /La gare est sombre/);
  assert.equal(port.atmosphere, 'calme');
  // Appliquée : le lieu existant est complété, à vérifier, avec sa source
  const { data } = applyUpdates({ schemaVersion: 2, places }, updates, { origin: 'parseur' });
  const state = Provenance.fieldState(data.places[0], 'atmosphere');
  assert.equal(state.origin, 'parseur');
  assert.equal(state.status, 'à vérifier');
  assert.equal(state.source.line, 3);
});

test('2. une correction IA d\'une fiche existante n\'est pas perdue : elle devient une proposition', () => {
  const project = { schemaVersion: 2, characters: [{ id: 'ch_n', name: 'Noé', description: 'Ancienne description locale' }] };
  const localUpdates = local(CONTAMINATION);
  const ai = validateUpdates({
    character_updates: [{ name: 'Noé', description: 'Correction IA', goals: ['retrouver sa sœur'] }]
  }).updates;
  const { data, summary } = applyUpdates(project, combineExtractions(localUpdates, ai));
  const noe = data.characters.find(c => c.name === 'Noé');
  assert.equal(noe.description, 'Ancienne description locale', 'rien n\'est écrasé');
  assert.deepEqual(noe.goals, ['retrouver sa sœur'], 'champ vide complété');
  assert.equal(Provenance.fieldState(noe, 'goals').origin, 'ia');
  assert.equal(Provenance.fieldState(noe, 'goals').status, 'à vérifier');
  const reviews = Provenance.openReviews(data, 'characters', 'ch_n');
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].proposed, 'Correction IA');
  assert.equal(reviews[0].current, 'Ancienne description locale');
  assert.equal(reviews[0].currentOrigin, 'inconnu');
  assert.deepEqual(summary.reviews, { added: 1, updated: 0 });
});

test('2b. séquences, contexte et indices survivent au parcours avec IA', () => {
  const combined = combineExtractions(local(CONTAMINATION), validateUpdates({ character_updates: [] }).updates);
  assert.ok(combined.sequences.length >= 1);
  assert.ok(combined.worldContext);
  assert.ok(Array.isArray(combined.narrativeClues));
  const { data } = applyUpdates({ schemaVersion: 2 }, combined);
  assert.ok(data.sequences.length >= 1);
  assert.ok(data.worldContext);
});

test('2c. une page résumée par l\'IA ne remplace pas le texte du parseur', () => {
  const localUpdates = local(CONTAMINATION);
  const ai = validateUpdates({ script_updates: [{ page: 1, action: 'Résumé IA' }, { page: 9, action: 'Inventée ?' }] }).updates;
  const combined = combineExtractions(localUpdates, ai);
  assert.notEqual(combined.script_updates.find(p => p.page === 1).action, 'Résumé IA');
  assert.ok(combined._notices.some(n => n.includes('1 page')));
});

test('2d. une réponse IA ne peut pas se déclarer saisie de l\'auteur', () => {
  const ai = validateUpdates({ character_updates: [{ name: 'Zed', origin: 'auteur', description: 'X', _prov: { description: { origin: 'auteur', status: 'accepté' } } }] }).updates;
  const { data } = applyUpdates({ schemaVersion: 2 }, combineExtractions({}, ai));
  const zed = data.characters[0];
  assert.equal(zed.origin, undefined);
  assert.equal(Provenance.fieldState(zed, 'description').origin, 'ia');
  assert.equal(Provenance.fieldState(zed, 'description').status, 'à vérifier');
});

test('traits incompatibles : plus de cumul silencieux, une proposition par valeur', () => {
  const project = { schemaVersion: 2, characters: [{ id: 'ch_l', name: 'Lina', traits: ['Loyal'] }] };
  const updates = { character_updates: [{ name: 'Lina', traits: ['Méfiant'] }] };
  const { data } = applyUpdates(project, updates, { origin: 'ia' });
  assert.deepEqual(data.characters[0].traits, ['Loyal']);
  const [review] = Provenance.openReviews(data);
  assert.equal(review.op, 'add');
  assert.equal(review.proposed, 'Méfiant');

  const accepted = Provenance.acceptReview(data, review.id).data;
  assert.deepEqual(accepted.characters[0].traits, ['Loyal', 'Méfiant']);
  assert.equal(Provenance.fieldState(accepted.characters[0], 'traits').status, 'accepté');

  const rejected = Provenance.rejectReview(data, review.id).data;
  assert.deepEqual(rejected.characters[0].traits, ['Loyal']);
  // Même analyse relancée : la proposition tranchée n'est pas recréée
  const again = applyUpdates(rejected, updates, { origin: 'ia' }).data;
  assert.equal(Provenance.openReviews(again).length, 0);
});

test('8. une correction acceptée n\'est pas annulée par une analyse identique ou tardive', () => {
  const project = { schemaVersion: 2, characters: [{ id: 'ch_n', name: 'Noé', description: 'Ancienne' }] };
  const step1 = applyUpdates(project, { character_updates: [{ name: 'Noé', description: 'Corrigée' }] }, { origin: 'ia' }).data;
  const review = Provenance.openReviews(step1)[0];
  const accepted = Provenance.acceptReview(step1, review.id).data;
  assert.equal(accepted.characters[0].description, 'Corrigée');
  // Ancienne analyse qui revient avec l'ancienne valeur, puis la même analyse une seconde fois
  const late = applyUpdates(accepted, { character_updates: [{ name: 'Noé', description: 'Ancienne' }] }, { origin: 'parseur' }).data;
  const same = applyUpdates(late, { character_updates: [{ name: 'Noé', description: 'Corrigée' }] }, { origin: 'ia' }).data;
  assert.equal(same.characters[0].description, 'Corrigée');
  assert.equal(Provenance.openReviews(same).length, 0);
});

test('une proposition dont la valeur a changé entre-temps devient obsolète sans rien modifier', () => {
  const project = { schemaVersion: 2, characters: [{ id: 'ch_n', name: 'Noé', description: 'A' }] };
  const data = applyUpdates(project, { character_updates: [{ name: 'Noé', description: 'B' }] }, { origin: 'ia' }).data;
  const review = Provenance.openReviews(data)[0];
  const edited = Bible.updateEntry(data, 'characters', 'ch_n', { description: 'Écrit par l\'auteur' }).data;
  const result = Provenance.acceptReview(edited, review.id);
  assert.match(result.error, /obsolète/);
  assert.equal(result.data.characters[0].description, 'Écrit par l\'auteur');
  assert.equal(result.data.reviews[0].status, 'obsolète');
});

test('retirer une information extraite : elle n\'est pas réintroduite par la prochaine analyse', () => {
  const project = { schemaVersion: 2, characters: [{ id: 'ch_m', name: 'Marc', traits: ['Discipliné(e)'] }] };
  const removed = Provenance.rejectField(project, 'characters', 'ch_m', 'traits').data;
  assert.equal(removed.characters[0].traits, undefined);
  const again = applyUpdates(removed, { character_updates: [{ name: 'Marc', traits: ['Discipliné(e)'] }] }, { origin: 'parseur' }).data;
  assert.equal(again.characters[0].traits, undefined);
  assert.equal(Provenance.openReviews(again).length, 0);
});

test('anciens champs sans provenance : conservés, « à vérifier », validables', () => {
  const legacy = { id: 'ch_o', name: 'Ancien', description: 'Venu de l\'ancien parseur' };
  const state = Provenance.fieldState(legacy, 'description');
  assert.equal(state.status, 'à vérifier');
  assert.equal(Provenance.describeState(state), 'provenance non renseignée · à vérifier');
  const validated = Provenance.validateField({ characters: [legacy] }, 'characters', 'ch_o', 'description').data;
  assert.equal(Provenance.describeState(Provenance.fieldState(validated.characters[0], 'description')), null);
  assert.equal(validated.characters[0].description, legacy.description);
});

test('une saisie de l\'auteur n\'est jamais remplacée ; le désaccord est signalé comme tel', () => {
  const start = { schemaVersion: 2, characters: [{ id: 'ch_n', name: 'Noé', description: 'Extraite' }] };
  const authored = Bible.updateEntry(start, 'characters', 'ch_n', { description: 'Mon Noé' }).data;
  assert.equal(Provenance.fieldState(authored.characters[0], 'description').origin, 'auteur');
  const data = applyUpdates(authored, { character_updates: [{ name: 'Noé', description: 'Autre lecture' }] }, { origin: 'ia' }).data;
  assert.equal(data.characters[0].description, 'Mon Noé');
  assert.equal(Provenance.openReviews(data)[0].againstAuthor, true);
});

test('le contexte du partenaire distingue lecture à vérifier, saisie de l\'auteur et observation', () => {
  const entity = {
    name: 'Noé', description: 'Taciturne', notes: 'Mon idée', appearances: [2, 5], _prov: {
      description: { origin: 'ia', status: 'à vérifier', source: { document: '_NOTES.md', page: 2, line: 12, quote: 'Il se tait.' } },
      notes: { origin: 'auteur', status: 'accepté' }
    }
  };
  const text = describeEntity(entity);
  assert.match(text, /description \(IA · à vérifier — lecture non validée par l'auteur\) : Taciturne \[source : _NOTES\.md, p\. 2, l\. 12 — « Il se tait\. »\]/);
  assert.match(text, /^notes : Mon idée$/m);
  assert.match(text, /appearances \(observé dans le texte\) : 2 ; 5/);
  assert.doesNotMatch(text, /_prov/);
});
