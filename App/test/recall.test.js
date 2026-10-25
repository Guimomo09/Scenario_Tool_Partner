// Compréhension, incrément 3 : mémoire narrative du partenaire, connaissances, intentions, critique — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../src/core/understanding');
const Claims = require('../src/core/claims');
const Recall = require('../src/core/recall');
const Critique = require('../src/core/critique');
const PC = require('../src/core/partner-context');
const PS = require('../src/core/partner-store');

// Script fictif en quatre séquences : la trahison de Marc n'est révélée qu'à la séquence 4
const SCRIPT = [
  '## Séquence 1', '', '### Page 1', 'Lina et Marc réparent la lanterne du phare.', '',
  '**Lina:**', '- Sans toi, je n\'aurais jamais tenu ce phare.', '',
  '## Séquence 2', '', '### Page 2', 'Marc glisse une lettre sous la porte du gardien.', '',
  '**Marc (pensée):**', '- Elle ne doit jamais savoir que je travaille pour la Compagnie.', '',
  '## Séquence 3', '', '### Page 3', 'Lina confie la clé de la lanterne à Marc.', '',
  '**Lina:**', '- Garde-la, j\'ai confiance en toi.', '',
  '## Séquence 4', '', '### Page 4', 'Lina trouve la lettre de la Compagnie signée par Marc.', '',
  '**Lina:**', '- Tu m\'as menti depuis le début.', ''
].join('\n');

const PROJECT = { characters: [
  { id: 'ch_lina', name: 'Lina', aliases: ['La gardienne'] },
  { id: 'ch_marc', name: 'Marc' },
  { id: 'ch_ines', name: 'Inès' }
] };

function readScript(byNeedle, content = SCRIPT) {
  const units = U.buildUnits([{ path: '_NOTES.md', content }]).units;
  let store = U.createStore();
  units.forEach(unit => {
    const claims = [];
    for (const [needle, list] of Object.entries(byNeedle)) if (unit.text.includes(needle)) claims.push(...list);
    store = U.applyUnitResult(store, unit, { entities: [], claims }, { model: 'simulé', currentVersion: unit.version }).store;
  });
  return { units, store };
}

const READINGS = {
  'Sans toi': [{ subject: { kind: 'relation', name: 'Lina' }, object: { name: 'Marc' }, nature: 'parole', aspect: 'relation', speaker: 'Lina',
    content: 'Lina dit qu\'elle doit beaucoup à Marc.', quote: 'Sans toi, je n\'aurais jamais tenu ce phare.' }],
  'la Compagnie.': [{ subject: { kind: 'personnage', name: 'Marc' }, nature: 'croyance', aspect: 'connaissance', speaker: 'Marc',
    content: 'Marc cache qu\'il travaille pour la Compagnie.', quote: 'Elle ne doit jamais savoir que je travaille pour la Compagnie.' }],
  'Garde-la': [{ subject: { kind: 'relation', name: 'Lina' }, object: { name: 'Marc' }, nature: 'parole', aspect: 'relation', speaker: 'Lina',
    content: 'Lina dit qu\'elle a confiance en Marc.', quote: 'Garde-la, j\'ai confiance en toi.' }],
  'signée par Marc': [
    { subject: { kind: 'personnage', name: 'Lina' }, nature: 'montre', aspect: 'revelation',
      content: 'Lina découvre que Marc travaille pour la Compagnie.', quote: 'Lina trouve la lettre de la Compagnie signée par Marc.' },
    { subject: { kind: 'relation', name: 'Lina' }, object: { name: 'Marc' }, nature: 'parole', aspect: 'opposition', speaker: 'Lina',
      content: 'Lina accuse Marc de lui avoir menti.', quote: 'Tu m\'as menti depuis le début.' }]
};

const lineOf = (needle, content = SCRIPT) => content.split('\n').findIndex(l => l.includes(needle)) + 1;

test('4. un personnage ne connaît pas une révélation future ; le lecteur non plus', () => {
  const { units, store } = readScript(READINGS);
  const ids = Recall.identities(PROJECT);
  const point = Recall.pointOf(units, '_NOTES.md', lineOf('Garde-la'));
  assert.equal(point.label, 'Séquence 3');
  const lina = Recall.knowledgeAt(store.claims, ids, 'id:ch_lina', point.order);
  assert.equal(lina.known.length, 0);
  assert.equal(lina.later.length, 1);
  assert.match(lina.later[0].content, /découvre/);
  // Marc, lui, sait déjà (sa pensée de la séquence 2)
  const marc = Recall.knowledgeAt(store.claims, ids, 'id:ch_marc', point.order);
  assert.equal(marc.known.length, 1);
  const reader = Recall.readerKnowledge(store.claims, point.order);
  assert.equal(reader.known.length, 0);
  assert.equal(reader.later.length, 1);

  // Le contexte envoyé le dit explicitement, situé au point du récit
  const { items } = Recall.contextItems({ store, units, projectData: PROJECT, intent: 'coherence', docName: '_NOTES.md',
    cursorLine: lineOf('Garde-la'), focusText: 'Lina confie la clé de la lanterne à Marc.' });
  const know = items.find(i => i.id === 'connaissances');
  assert.match(know.text, /Point du récit consulté : Séquence 3/);
  assert.match(know.text, /Lina :[\s\S]*NE SAIT PAS ENCORE[\s\S]*découvre que Marc travaille pour la Compagnie[\s\S]*Séquence 4/);
  assert.match(know.text, /Marc :[\s\S]*sait ou croit à ce point[\s\S]*Marc pense/);
  // Au point de la séquence 4, la révélation est connue
  const after = Recall.knowledgeAt(store.claims, ids, 'id:ch_lina', Recall.pointOf(units, '_NOTES.md', lineOf('menti')).order);
  assert.equal(after.known.length, 1);
});

test('4. une relation qui change au fil du récit est une évolution, pas une incohérence', () => {
  const { store } = readScript(READINGS);
  const ids = Recall.identities(PROJECT);
  const t = Recall.relationTimeline(store.claims, ids, 'id:ch_lina', 'id:ch_marc');
  assert.equal(t.steps.length, 3);
  assert.ok(t.changes);
  assert.deepEqual(t.steps.map(c => c.period.label), ['Séquence 1', 'Séquence 3', 'Séquence 4']);
  const { units } = readScript(READINGS);
  const { items } = Recall.contextItems({ store, units, projectData: PROJECT, intent: 'coherence', docName: '_NOTES.md', cursorLine: lineOf('menti'), focusText: 'Lina Marc' });
  const know = items.find(i => i.id === 'connaissances').text;
  assert.match(know, /le lien évolue : une étape nouvelle n'est pas une incohérence/);
  assert.doesNotMatch(know, /contradiction/i);
});

test('contexte : lectures sourcées par alias et par fiche de scène, validées avant « à vérifier »', () => {
  let { units, store } = readScript(READINGS);
  const trust = store.claims.find(c => /confiance/.test(c.content));
  store = { ...store, claims: Claims.setStatus(store.claims, trust.id, 'accepté') };
  // « La gardienne » (alias confirmé) retrouve Lina ; Inès est liée à la scène sans être nommée
  const { items, focus } = Recall.contextItems({ store, units, projectData: PROJECT, intent: 'reviser', docName: 'autre.md',
    cursorLine: 1, focusText: 'La gardienne hésite.', sceneCharacterIds: ['ch_ines'] });
  assert.deepEqual(focus.map(f => f.name).sort(), ['Inès', 'Lina']);
  assert.equal(focus.find(f => f.name === 'Inès').via, 'scène');
  const lectures = items.find(i => i.id === 'lectures');
  assert.match(lectures.label, /1 validée, 3 à vérifier/);
  const first = lectures.text.indexOf('lecture validée par l\'auteur');
  const pending = lectures.text.indexOf('à vérifier — lecture non validée');
  assert.ok(first >= 0 && pending > first);
  assert.match(lectures.text, /Séquence 3, l\. \d+ — « Garde-la/);
  // Une lecture rejetée n'est jamais envoyée
  store = { ...store, claims: Claims.setStatus(store.claims, trust.id, 'rejeté') };
  const again = Recall.contextItems({ store, units, projectData: PROJECT, docName: 'autre.md', focusText: 'Lina' }).items.find(i => i.id === 'lectures');
  assert.doesNotMatch(again.text, /confiance en Marc/);
});

test('contexte : fiche liée à la scène jointe même si son nom n\'apparaît pas dans le passage', () => {
  const items = PC.buildContextItems({ docName: 'a.md', docText: '## Scène 1\nLa porte claque.', cursor: 5, projectData: PROJECT,
    scene: { title: 'La porte', characters: ['ch_ines'], characterNames: ['Inès'] } });
  assert.ok(items.some(i => i.id === 'bible:ch_ines'));
});

test('unités pertinentes au-delà de la section active, selon la demande et l\'intention', () => {
  const { units, store } = readScript(READINGS);
  const current = Recall.pointOf(units, '_NOTES.md', lineOf('Garde-la'));
  const base = { store, units, projectData: PROJECT, docName: '_NOTES.md', cursorLine: lineOf('Garde-la'), focusText: 'Lina confie la clé à Marc.', currentUnitIds: [current.unitId] };
  const structure = Recall.contextItems({ ...base, intent: 'structurer', message: 'Est-ce que la trahison est préparée ?' });
  const joined = structure.items.filter(i => i.kind === 'unit');
  assert.ok(joined.length >= 2);
  assert.ok(!joined.some(i => i.id === `unit:${current.unitId}`), 'la section active n\'est pas jointe deux fois');
  assert.ok(joined.some(i => /Séquence 4/.test(i.label)));
  const write = Recall.contextItems({ ...base, intent: 'ecrire' });
  assert.equal(write.items.filter(i => i.kind === 'unit').length, 1);
  // Un passage décoché n'est plus envoyé et le périmètre le dit
  const id = joined[0].id;
  const unchecked = Recall.contextItems({ ...base, intent: 'structurer', excluded: [id] });
  assert.equal(unchecked.items.find(i => i.id === id).included, false);
  assert.match(unchecked.items.find(i => i.id === 'perimetre').text, /décoché/);
  // Mots de la question : « lettre » retrouve la séquence 2 même sans personnage nommé
  const words = Recall.relevantUnits({ units, store, projectData: PROJECT, focus: [], message: 'Où apparaît la lettre ?', intent: 'structurer' });
  assert.ok(words.chosen.some(s => s.unit.label === 'Séquence 2'));
});

test('périmètre : lecture partielle et sources insuffisantes annoncées', () => {
  const units = U.buildUnits([{ path: '_NOTES.md', content: SCRIPT }]).units;
  const { items, insufficient } = Recall.contextItems({ store: U.createStore(), units: [], projectData: {}, intent: 'coherence', docName: 'x.md', focusText: 'Rien.' });
  assert.ok(insufficient);
  assert.match(items.find(i => i.id === 'perimetre').text, /SOURCES INSUFFISANTES/);
  const partial = readScript({});
  const store = { ...partial.store, units: Object.fromEntries(Object.entries(partial.store.units).slice(0, 2)) };
  const scope = Recall.contextItems({ store, units, projectData: PROJECT, intent: 'reviser', docName: '_NOTES.md', cursorLine: 3, focusText: 'Lina' })
    .items.find(i => i.id === 'perimetre').text;
  assert.match(scope, /2\/4 unités lues — compréhension PARTIELLE/);
});

test('intentions : saisies de l\'auteur seulement, modifiables, envoyées au partenaire', () => {
  let store = U.createStore();
  assert.ok(U.addIntention(store, { kind: 'inconnu', text: 'x' }).error);
  assert.ok(U.addIntention(store, { kind: 'ton', text: '  ' }).error);
  let r = U.addIntention(store, { kind: 'ambiguite', text: 'On ne doit pas savoir si Marc aime Lina.', quote: 'Garde-la, j\'ai confiance en toi.', document: '_NOTES.md' });
  store = r.store;
  assert.equal(r.intention.origin, 'auteur');
  r = U.updateIntention(store, r.intention.id, { kind: 'ambiguite', text: 'Ambiguïté sur les sentiments de Marc.' });
  store = r.store;
  assert.equal(store.intentions[0].quote, undefined, 'passage vidé = retiré');
  store = U.addIntention(store, { kind: 'theme', text: 'La loyauté qu\'on paie cher.' }).store;
  const norm = U.normalizeStore(JSON.parse(U.serialize(store)));
  assert.equal(norm.store.intentions.length, 2);
  assert.ok(U.normalizeStore({ intentions: {} }).error);
  const { items } = Recall.contextItems({ store, units: [], projectData: {}, focusText: '' });
  const item = items.find(i => i.id === 'intentions');
  assert.match(item.text, /Ambiguïté volontaire :\n- Ambiguïté sur les sentiments de Marc/);
  assert.match(item.text, /Thème :/);
  // Les intentions ne viennent jamais d'une analyse
  assert.match(Claims.validateClaim({ subject: { kind: 'recit' }, nature: 'intention', content: 'x', quote: 'y' }, { origin: 'ia' }).error, /auteur/);
});

test('consigne : critique sourcée pour structurer / réviser / cohérence, pas pour écrire', () => {
  const sys = PC.systemPrompt({}, 'coherence');
  assert.match(sys, /<remarque nature=/);
  assert.match(sys, /ambiguïté déclarée volontaire/);
  assert.match(sys, /pose une question précise au lieu de conclure/);
  assert.match(sys, /révélation ultérieure/);
  assert.doesNotMatch(PC.systemPrompt({}, 'ecrire'), /<remarque/);
  const req = PC.assembleRequest({ intent: 'coherence', items: [
    { id: 'perimetre', kind: 'perimetre', label: 'Périmètre consulté', text: 'SOURCES INSUFFISANTES', included: true, chars: 10 },
    { id: 'intentions', kind: 'intentions', label: 'Intentions', text: 'Ton : sec', included: true, chars: 9 }
  ], userMessage: 'Est-ce cohérent ?' });
  assert.match(req.messages[0].content, /<perimetre>\nSOURCES INSUFFISANTES\n<\/perimetre>/);
  assert.match(req.messages[0].content, /<intentions>/);
});

test('10. critique : preuves réelles vérifiées, ambiguïté volontaire respectée, abstention possible', () => {
  const sources = [{ label: 'Section active — Séquence 3', text: 'Lina confie la clé de la lanterne à Marc.\n**Lina:**\n- Garde-la, j\'ai confiance en toi.' },
    { label: 'Passage — Séquence 2', text: 'Marc glisse une lettre sous la porte du gardien.' }];
  const intentions = [{ kind: 'ambiguite', text: 'On ne doit pas savoir si Lina soupçonne Marc.', quote: 'Garde-la, j\'ai confiance en toi.' }];
  const reply = `Intention rappelée : ambiguïté sur Lina. Périmètre : séquences 2 et 3.
<remarque nature="lisibilite">
<constat>La confiance de Lina paraît naïve.</constat>
<passage>« Garde-la, j'ai confiance en toi. »</passage>
<raisonnement>Elle ignore la lettre.</raisonnement>
<effet>Le lecteur peut la juger crédule.</effet>
<pistes>Un regard appuyé ; ou rien.</pistes>
</remarque>
<remarque nature="erreur">
<constat>Marc signe la lettre à la séquence 2.</constat>
<passage>Marc signe la lettre de son nom.</passage>
</remarque>
<remarque nature="preference">
<constat>La lettre arrive vite.</constat>
<passage>Marc glisse une lettre sous la porte du gardien.</passage>
<passage>Une phrase inventée par le modèle.</passage>
</remarque>
<remarque nature="question">
<constat>Que sait Lina de la Compagnie ?</constat>
<question>Lina a-t-elle déjà entendu parler de la Compagnie avant la séquence 4 ?</question>
</remarque>
<remarque><raisonnement>sans constat</raisonnement></remarque>`;
  const extracted = Critique.extractRemarks(reply);
  assert.equal(extracted.remarks.length, 4);
  assert.equal(extracted.problems.length, 1, 'bloc sans constat signalé et laissé dans le texte');
  assert.match(extracted.text, /\[Remarque 1\][\s\S]*\[Remarque 4\]/);
  const checked = Critique.checkRemarks(extracted.remarks, { sources, intentions });
  const [naive, wrong, pref, question] = checked;
  // Preuve retrouvée (guillemets ajoutés par le modèle tolérés), mais passage marqué ambiguïté volontaire
  assert.equal(naive.passages[0].found, true);
  assert.equal(naive.passages[0].where, 'Section active — Séquence 3');
  assert.ok(naive.onAmbiguity);
  assert.ok(naive.notes.some(n => /ambiguïté volontaire/.test(n)));
  // Citation inventée : remarque non étayée
  assert.equal(wrong.unsupported, true);
  assert.ok(wrong.notes.some(n => /non étayée/.test(n)));
  // Une preuve sur deux : signalé sans tout rejeter
  assert.equal(pref.unsupported, false);
  assert.ok(pref.notes.some(n => /1 passage\(s\) cité\(s\) introuvable/.test(n)));
  // Une question n'a pas besoin de preuve : s'abstenir de conclure est valable
  assert.equal(question.unsupported, false);
  assert.equal(question.notes.length, 0);
  // Une réponse sans remarque (abstention) est acceptée telle quelle
  const none = Critique.extractRemarks('Les sources consultées ne permettent pas de dire qui veut quoi. Que cherche Marc ?');
  assert.equal(none.remarks.length, 0);
  assert.equal(none.problems.length, 0);
});

test('décisions sur les remarques : mémorisées, envoyées, sans toucher au texte', () => {
  const store = PS.createStore();
  const remark = Critique.checkRemarks(Critique.extractRemarks('<remarque nature="lisibilite"><constat>Trop elliptique.</constat><passage>La porte claque.</passage></remarque>').remarks,
    { sources: [{ label: 's', text: 'La porte claque.' }] })[0];
  assert.ok(!PS.addDecision(store, { remarkId: remark.id, verdict: 'peut-être', text: 'x' }).ok);
  const r = PS.addDecision(store, { remarkId: remark.id, verdict: 'maintenu', text: Critique.decisionText(remark, 'maintenu') });
  assert.ok(r.ok);
  assert.match(r.decision.text, /^Choix maintenu par l'auteur — Lisibilité probable : Trop elliptique\. \(passage : « La porte claque\. »\)/);
  // Changer d'avis met à jour la même décision
  PS.addDecision(store, { remarkId: remark.id, verdict: 'retenu', text: Critique.decisionText(remark, 'retenu') });
  assert.equal(store.decisions.length, 1);
  assert.equal(store.decisions[0].verdict, 'retenu');
  const reloaded = PS.normalizeStore(JSON.parse(PS.serialize(store))).store;
  assert.equal(reloaded.decisions.length, 1);
  const { items } = Recall.contextItems({ store: U.createStore(), decisions: reloaded.decisions });
  assert.match(items.find(i => i.id === 'decisions').text, /Remarque retenue par l'auteur/);
  assert.ok(PS.removeDecision(store, store.decisions[0].id));
});

test('unités du document ouvert remplacées par son texte actuel, ordre renuméroté', () => {
  const docs = [{ path: '_NOTES.md', content: SCRIPT }, { path: 'monde.md', content: '# Monde\n\nLe phare est vieux.' }];
  const units = U.buildUnits(docs).units;
  const edited = SCRIPT.replace('## Séquence 4', '## Séquence 3 bis\n\n### Page 3 bis\nUne page ajoutée.\n\n## Séquence 4');
  const fresh = U.segment({ path: '_NOTES.md', content: edited }).units;
  const merged = Recall.withCurrentDocument(units, '_NOTES.md', fresh);
  assert.equal(merged.length, units.length + 1);
  assert.deepEqual(merged.map(u => u.order), merged.map((_, i) => i + 1));
  assert.equal(merged[merged.length - 1].document, 'monde.md');
  assert.equal(Recall.withCurrentDocument(units, 'autre.md', []), units);
});

test('fiche de la Bible : lectures retrouvées par identifiant (alias compris), rejetées exclues', () => {
  const reading = { 'Sans toi': [{ subject: { kind: 'personnage', name: 'La gardienne' }, nature: 'parole', aspect: 'relation', speaker: 'Lina',
    content: 'Lina dit qu\'elle doit le phare à Marc.', quote: 'Sans toi, je n\'aurais jamais tenu ce phare.' }] };
  let { store } = readScript(reading);
  assert.equal(Recall.claimsForEntry(store, PROJECT, PROJECT.characters[0]).length, 1);
  assert.equal(Recall.claimsForEntry(store, PROJECT, PROJECT.characters[2]).length, 0);
  store = { ...store, claims: Claims.setStatus(store.claims, store.claims[0].id, 'rejeté') };
  assert.equal(Recall.claimsForEntry(store, PROJECT, PROJECT.characters[0]).length, 0);
});
