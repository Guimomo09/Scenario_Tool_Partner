// Compréhension, incrément 2 : sources, unités, couverture, versions, affirmations — données fictives uniquement
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../src/core/understanding');
const Claims = require('../src/core/claims');

// Script fictif : 3 séquences, la dernière très longue (au-delà de 8 000 caractères)
function longScript() {
  const lines = ['# Le Phare — script', '', 'Note : version de travail.', '', '## Séquence 1', '', '### Page 1',
    'Lina monte l\'escalier du phare.', '', '**Lina:**', '- Je ne veux pas sauver le roi.', '',
    '### Page 2', 'Marc et Noé attendent sur le quai.', '', '**Marc:**', '- Il faut tuer le gardien, demain.', '',
    '## Séquence 2', '', '### Page 3', '**Noé (pensée):**', '- Marc ment, il n\'a jamais vu le gardien.', ''];
  lines.push('## Séquence 3', '');
  for (let p = 4; p <= 70; p++) {
    lines.push(`### Page ${p}`, `Les vagues frappent la digue, page ${p}. Le vent tourne autour de la lanterne éteinte.`,
      '**Lina:**', `- Réplique numéro ${p}, assez longue pour remplir la page et dépasser la limite de lecture.`, '');
  }
  lines.push('### Page 71', 'Lina découvre la lettre cachée sous la lanterne : le gardien est son père.', '');
  return lines.join('\n');
}

const SECOND = ['# Notes de monde', '', '## La digue', 'La digue protège le village depuis la grande marée.', '',
  '## Le gardien', 'Le gardien a disparu il y a dix ans.'].join('\n');

const unitsOf = (docs, opts) => U.buildUnits(docs, opts).units;
const unitFor = (units, needle) => units.find(u => u.text.includes(needle));

test('empreinte : toute modification change la version', () => {
  assert.equal(U.fingerprint('abc'), U.fingerprint('abc'));
  assert.notEqual(U.fingerprint('abc'), U.fingerprint('abd'));
});

test('découpage : chaque ligne non vide dans une seule unité, préambule et ordre conservés', () => {
  const content = longScript();
  const { units, notices } = U.segment({ path: '_NOTES.md', content });
  const check = U.checkCoverage(units, content);
  assert.ok(check.ok, JSON.stringify(check));
  assert.equal(units[0].label, 'Préambule');
  assert.ok(units[0].text.includes('version de travail'));
  // Séquence trop longue coupée aux pages, sans perte
  assert.ok(units.filter(u => u.label.startsWith('Séquence 3')).length > 1);
  assert.ok(units.every(u => u.chars <= U.MAX_UNIT_CHARS));
  for (let i = 1; i < units.length; i++) assert.ok(units[i].startLine > units[i - 1].endLine);
  assert.equal(notices.length, 0);
  // Locuteurs et pensées connus ligne à ligne (contrôle des citations)
  const seq2 = units.find(u => u.label === 'Séquence 2');
  assert.ok(Object.values(seq2.lineInfo).some(i => i.type === 'thought' && i.speaker === 'Noé'));
});

test('découpage : texte Markdown ordinaire et bloc trop long coupé par lignes', () => {
  const doc = { path: 'monde/notes.md', content: SECOND };
  const { units } = U.segment(doc);
  assert.ok(U.checkCoverage(units, SECOND).ok);
  const long = Array.from({ length: 300 }, (_, i) => `Ligne ${i} sans paragraphe ni titre, mais du texte quand même.`).join('\n');
  const split = U.segment({ path: 'x.md', content: long }, { maxChars: 2000 }).units;
  assert.ok(split.length > 1);
  assert.ok(U.checkCoverage(split, long).ok);
  assert.ok(split.every(u => u.chars <= 2000));
});

test('découpage : modifier une séquence ne change pas l\'identifiant ni la version des autres', () => {
  const content = longScript();
  const before = U.segment({ path: '_NOTES.md', content }).units;
  const after = U.segment({ path: '_NOTES.md', content: content.replace('Marc ment', 'Marc se trompe') }).units;
  assert.deepEqual(before.map(u => u.id), after.map(u => u.id));
  const changed = after.filter((u, i) => u.version !== before[i].version).map(u => u.label);
  assert.deepEqual(changed, ['Séquence 2']);
});

test('page absente signalée, jamais inventée', () => {
  const content = longScript().replace(/### Page 20[\s\S]*?(?=### Page 21)/, '');
  const { units, notices } = U.segment({ path: '_NOTES.md', content });
  assert.ok(notices.some(n => /Pages absentes du script : 20/.test(n)));
  assert.ok(!units.some(u => u.pages.includes(20)));
});

test('sources : rôles par défaut, doublon exact, versions candidates bloquantes seulement si deux autorités', () => {
  const v1 = longScript();
  const v2 = v1.replace('Page 71', 'Page 71 bis');
  const docs = [{ path: '_NOTES.md', content: v1 }, { path: 'brouillons/v2.md', content: v2 }, { path: 'copie.md', content: v1 }, { path: 'monde.md', content: SECOND }];
  let store = U.createStore();
  let described = U.describeSources(docs, store);
  // Rien d'autre que _NOTES.md n'est retenu sans choix de l'auteur
  assert.deepEqual(described.map(d => d.role), ['autorite', 'ignore', 'ignore', 'ignore']);
  assert.equal(described[2].duplicateOf, '_NOTES.md');
  assert.ok(described[1].similar.some(s => s.path === '_NOTES.md'));
  assert.ok(!described[3].similar.length, 'des notes de monde ne sont pas une version du script');

  store = U.setRole(store, 'brouillons/v2.md', 'autorite');
  let problems = U.sourceProblems(U.describeSources(docs, store));
  assert.equal(problems.blocking.length, 1);
  store = U.setRole(store, 'brouillons/v2.md', 'brouillon');
  store = U.setRole(store, 'copie.md', 'reference');
  problems = U.sourceProblems(U.describeSources(docs, store));
  assert.equal(problems.blocking.length, 0);
  assert.ok(problems.skipped.has('copie.md'), 'un doublon exact n\'est lu qu\'une fois');
});

// Lecteur simulé : renvoie pour chaque unité les affirmations qui la concernent
function fakeReader(byNeedle) {
  return (unit) => {
    const claims = [];
    const entities = [];
    for (const [needle, list] of Object.entries(byNeedle)) {
      if (unit.text.includes(needle)) list.forEach(c => claims.push(c));
    }
    Object.values(unit.lineInfo).forEach(i => { if (i.speaker && !entities.some(e => e.name === i.speaker)) entities.push({ name: i.speaker, kind: 'personnage' }); });
    return JSON.stringify({ entities, claims });
  };
}

const REVEAL = {
  subject: { kind: 'personnage', name: 'Lina' }, nature: 'montre', aspect: 'revelation',
  content: 'Lina découvre que le gardien est son père.', quote: 'le gardien est son père'
};
const DIGUE = {
  subject: { kind: 'lieu', name: 'La digue' }, nature: 'montre', aspect: 'autre',
  content: 'La digue protège le village.', quote: 'La digue protège le village depuis la grande marée.'
};

function readAll(store, units, reader, { fail = () => false, model = 'simulé' } = {}) {
  for (const unit of U.planRun(store, units, { model }).todo) {
    if (fail(unit)) { store = U.recordFailure(store, unit, 'erreur simulée', { currentVersion: unit.version, model }).store; continue; }
    const parsed = U.parseUnitResponse(reader(unit));
    store = U.applyUnitResult(store, unit, parsed.data, { model, currentVersion: unit.version }).store;
  }
  return store;
}

test('7. une information après le 8 000e caractère et un second document sont lus ; un échec réduit la couverture', () => {
  const notes = longScript();
  assert.ok(notes.indexOf('son père') > 8000);
  let store = U.setRole(U.createStore(), 'monde.md', 'reference');
  const units = unitsOf([{ path: '_NOTES.md', content: notes, role: 'autorite' }, { path: 'monde.md', content: SECOND, role: 'reference' }]);
  const reader = fakeReader({ 'son père': [REVEAL], 'grande marée': [DIGUE] });

  // Une unité du milieu échoue : lecture partielle annoncée comme telle
  const failing = unitFor(units, 'Page 10');
  store = readAll(store, units, reader, { fail: (u) => u.id === failing.id });
  let cov = U.coverage(store, units);
  assert.equal(cov.echec, 1);
  assert.equal(cov.fait, units.length - 1);
  assert.ok(cov.partial);
  assert.equal(cov.byDocument['_NOTES.md'].complete, false);
  assert.equal(cov.byDocument['monde.md'].complete, true);

  const reveal = store.claims.find(c => c.aspect === 'revelation');
  assert.ok(reveal, 'la révélation de la fin du texte est lue');
  assert.ok(reveal.source.lines[0] > 150);
  const digue = store.claims.find(c => c.subject.name === 'La digue');
  assert.equal(digue.source.document, 'monde.md');
  assert.equal(digue.source.role, 'reference');

  // Reprise : seule l'unité en échec est relue
  const plan = U.planRun(store, units, { model: 'simulé' });
  assert.deepEqual(plan.todo.map(u => u.id), [failing.id]);
  store = readAll(store, units, reader);
  cov = U.coverage(store, units);
  assert.ok(cov.complete);
  const synth = U.consolidate(store, units, {});
  assert.ok(!synth.coverage.partial);
});

test('cache : même texte, même traitement, même modèle → aucun nouvel appel', () => {
  const units = unitsOf([{ path: '_NOTES.md', content: longScript() }]);
  let store = readAll(U.createStore(), units, fakeReader({ 'son père': [REVEAL] }));
  // Unités oubliées (ex. mémoire réinitialisée) mais cache présent
  store = { ...store, units: {} };
  const plan = U.planRun(store, units, { model: 'simulé' });
  assert.equal(plan.todo.length, units.length);
  assert.equal(plan.calls, 0);
  assert.equal(U.planRun(store, units, { model: 'autre-modèle' }).calls, units.length);
});

test('8. une modification rend les lectures dépendantes obsolètes ; une décision de l\'auteur n\'est pas annulée', () => {
  const notes = longScript();
  let units = unitsOf([{ path: '_NOTES.md', content: notes }]);
  const reader = fakeReader({ 'son père': [REVEAL], 'Marc ment': [{
    subject: { kind: 'personnage', name: 'Noé' }, nature: 'croyance', aspect: 'connaissance', speaker: 'Noé',
    content: 'Marc ment au sujet du gardien.', quote: 'Marc ment, il n\'a jamais vu le gardien.'
  }] });
  let store = readAll(U.createStore(), units, reader);
  const belief = store.claims.find(c => c.nature === 'croyance');
  const reveal = store.claims.find(c => c.aspect === 'revelation');
  store = { ...store, claims: Claims.setStatus(store.claims, reveal.id, 'accepté') };

  // L'auteur modifie les deux passages
  const edited = notes.replace('Marc ment', 'Marc exagère').replace('est son père', 'est son oncle');
  const newUnits = unitsOf([{ path: '_NOTES.md', content: edited }]);
  const refreshed = U.refresh(store, newUnits);
  store = refreshed.store;
  assert.equal(store.claims.find(c => c.id === belief.id).status, 'obsolète');
  const kept = store.claims.find(c => c.id === reveal.id);
  assert.equal(kept.status, 'accepté', 'la décision de l\'auteur est gardée');
  assert.ok(kept.sourceChanged, 'mais signalée : le texte a changé');
  assert.equal(U.coverage(store, newUnits).perime, 2);

  // Réponse tardive calculée sur l'ancienne version : ignorée, elle ne restaure rien
  const oldUnit = unitFor(units, 'Marc ment');
  const late = U.applyUnitResult(store, oldUnit, U.parseUnitResponse(reader(oldUnit)).data,
    { model: 'simulé', currentVersion: unitFor(newUnits, 'Marc exagère').version });
  assert.ok(late.ignored);
  assert.equal(late.store.claims.find(c => c.id === belief.id).status, 'obsolète');
});

test('8. une lecture rejetée ou corrigée ne revient pas avec une nouvelle analyse identique', () => {
  const units = unitsOf([{ path: '_NOTES.md', content: longScript() }]);
  const reader = fakeReader({ 'son père': [REVEAL] });
  let store = readAll(U.createStore(), units, reader);
  const reveal = store.claims.find(c => c.aspect === 'revelation');
  const fixed = Claims.correct(store.claims, reveal.id, 'Lina croit que le gardien est son père (la lettre peut mentir).', 'interpretation');
  store = { ...store, claims: fixed.list };
  // Nouvelle lecture complète, même résultat
  store = readAll({ ...store, units: {} }, units, reader, { model: 'autre' });
  const same = store.claims.filter(c => c.aspect === 'revelation');
  assert.equal(same.length, 2);
  assert.equal(same.find(c => c.id === reveal.id).status, 'rejeté');
  const author = same.find(c => c.origin === 'auteur');
  assert.equal(author.status, 'accepté');
  assert.equal(author.correctionOf, reveal.id);
});

test('3. parole, négation, pensée, projet : jamais des faits établis ; citations contrôlées', () => {
  const units = unitsOf([{ path: '_NOTES.md', content: longScript() }]);
  const seq1 = unitFor(units, 'sauver le roi');
  const seq2 = unitFor(units, 'Marc ment');
  const v = (raw, unit) => Claims.validateClaim(raw, { unit, origin: 'ia' });

  // « Il faut tuer le gardien » présenté comme un événement : requalifié en parole de Marc
  const plan = v({ subject: { kind: 'personnage', name: 'Marc' }, nature: 'montre', aspect: 'evenement',
    content: 'Marc tue le gardien.', quote: 'Il faut tuer le gardien, demain.' }, seq1);
  assert.equal(plan.claim.nature, 'parole');
  assert.equal(plan.claim.speaker, 'Marc');
  assert.match(Claims.describe(plan.claim), /^Marc dit :/);
  assert.equal(plan.claim.status, 'à vérifier');

  // La négation est citée telle quelle ; la parole reste rattachée à Lina
  const neg = v({ subject: { kind: 'personnage', name: 'Lina' }, nature: 'parole', aspect: 'objectif', speaker: 'Lina',
    content: 'Lina refuse de sauver le roi.', quote: 'Je ne veux pas sauver le roi.' }, seq1);
  assert.equal(neg.claim.source.quote, 'Je ne veux pas sauver le roi.');

  // Pensée attribuée au mauvais personnage : refusée
  assert.match(v({ subject: { kind: 'personnage', name: 'Marc' }, nature: 'croyance', speaker: 'Marc',
    content: 'Marc ment.', quote: 'Marc ment, il n\'a jamais vu le gardien.' }, seq2).error, /dite par Noé/);
  // Pensée correctement attribuée : croyance, pas fait
  const belief = v({ subject: { kind: 'personnage', name: 'Noé' }, nature: 'montre',
    content: 'Marc n\'a jamais vu le gardien.', quote: 'Marc ment, il n\'a jamais vu le gardien.' }, seq2);
  assert.equal(belief.claim.nature, 'croyance');
  assert.equal(belief.claim.speaker, 'Noé');

  // Citation inventée, intention d'auteur venant de l'IA, sujet absent : écartés
  assert.match(v({ subject: { kind: 'personnage', name: 'Lina' }, nature: 'interpretation', content: 'x', quote: 'Lina hait la mer depuis toujours.' }, seq1).error, /introuvable/);
  assert.match(v({ subject: { kind: 'recit', name: '' }, nature: 'intention', content: 'L\'auteur veut un drame.', quote: 'Je ne veux pas sauver le roi.' }, seq1).error, /auteur/);
  assert.match(v({ nature: 'montre', content: 'x', quote: 'Lina monte l\'escalier du phare.' , subject: { kind: 'personnage' } }, seq1).error, /sujet/);
});

test('4-5. relation qui évolue et coprésence : aucune incohérence ni relation déduite', () => {
  const units = unitsOf([{ path: '_NOTES.md', content: longScript() }]);
  const reader = fakeReader({
    'Il faut tuer le gardien': [{ subject: { kind: 'relation', name: 'Noé' }, object: { name: 'Marc' }, nature: 'interpretation', aspect: 'relation',
      content: 'Noé suit Marc.', quote: 'Marc et Noé attendent sur le quai.', justification: 'Ils attendent ensemble.' }],
    'Marc ment': [{ subject: { kind: 'relation', name: 'Noé' }, object: { name: 'Marc' }, nature: 'croyance', aspect: 'opposition', speaker: 'Noé',
      content: 'Noé ne croit plus Marc.', quote: 'Marc ment, il n\'a jamais vu le gardien.' }]
  });
  const store = readAll(U.createStore(), units, reader);
  const synth = U.consolidate(store, units, {});
  assert.equal(synth.oppositions.length, 2);
  assert.ok(synth.oppositions[0].period.order < synth.oppositions[1].period.order, 'dans l\'ordre du récit');
  assert.ok(!synth.unresolved.some(u => /incohéren|contradic/i.test(u)));
  // Lina et le vent partagent des pages : aucune relation sans lecture explicite
  assert.ok(!synth.oppositions.some(c => c.subject.name === 'Lina' || c.object?.name === 'Lina'));
});

test('6. alias confirmé → même personnage ; alias ambigu → question, pas de fusion', () => {
  const units = unitsOf([{ path: '_NOTES.md', content: longScript() }]);
  const reader = fakeReader({ 'sauver le roi': [{ subject: { kind: 'personnage', name: 'La gardienne' }, nature: 'parole', aspect: 'objectif', speaker: 'Lina',
    content: 'Lina dit qu\'elle ne veut pas sauver le roi.', quote: 'Je ne veux pas sauver le roi.' }],
  'Marc ment': [{ subject: { kind: 'personnage', name: 'Le capitaine' }, nature: 'interpretation', aspect: 'objectif',
    content: 'Le capitaine cache quelque chose.', quote: 'il n\'a jamais vu le gardien' }] });
  const store = readAll(U.createStore(), units, reader);
  const project = { characters: [
    { id: 'ch_lina', name: 'Lina', aliases: ['La gardienne'] },
    { id: 'ch_marc', name: 'Marc', aliases: ['Le capitaine'] },
    { id: 'ch_paul', name: 'Paul', aliases: ['Le capitaine'] }
  ] };
  const synth = U.consolidate(store, units, project);
  const lina = synth.central.find(p => p.id === 'ch_lina');
  assert.ok(lina.objectifs.some(c => c.subject.name === 'La gardienne'));
  assert.ok(!synth.central.some(p => p.name === 'La gardienne'));
  assert.ok(synth.questions.some(q => /Le capitaine.*Marc ou Paul/.test(q.text)));
  assert.ok(synth.entities.some(e => e.name === 'Le capitaine' && !e.id));
});

test('synthèse partielle et questions : objectif non établi signalé plutôt qu\'inventé', () => {
  const units = unitsOf([{ path: '_NOTES.md', content: longScript() }]);
  const store = readAll(U.createStore(), units.slice(0, 2), fakeReader({}));
  const synth = U.consolidate(store, units, {});
  assert.ok(synth.coverage.partial);
  assert.ok(synth.unresolved.some(u => /pas encore lue/.test(u)));
  assert.ok(synth.questions.some(q => /^Que veut Lina \?/.test(q.text)));
  assert.ok(synth.central.every(p => p.objectifs.length === 0));
});

test('mémoire : format plus récent refusé, réponse non structurée = échec', () => {
  assert.ok(U.normalizeStore({ version: 99 }).error);
  assert.ok(U.normalizeStore({ claims: {} }).error);
  const ok = U.normalizeStore({ version: 1, claims: [{ subject: { kind: 'recit', name: 'Récit' } }, 'x'], extra: 1 });
  assert.equal(ok.store.claims.length, 1);
  assert.equal(ok.store.extra, 1, 'champs inconnus conservés');
  assert.ok(U.parseUnitResponse('désolé, je ne peux pas').error);
  assert.deepEqual(U.parseUnitResponse('voici : {"claims": []}').data, { entities: [], claims: [] });
});

test('consigne : manuscrit encadré, règles de prudence présentes', () => {
  const unit = unitsOf([{ path: '_NOTES.md', content: longScript() }])[1];
  const p = U.buildUnitPrompt(unit, [{ name: 'Lina', aliases: ['La gardienne'] }]);
  assert.match(p.user, /<manuscrit>[\s\S]*<\/manuscrit>/);
  assert.match(p.user, /Lina \(aussi : La gardienne\)/);
  assert.match(p.system, /négation/);
  assert.match(p.system, /N'invente pas d'intention d'auteur/);
});

test('formulation : parole déjà attribuée non préfixée deux fois, fait commençant par le nom préfixé', () => {
  assert.equal(Claims.describe({ nature: 'parole', speaker: 'Lina', content: 'Lina dit qu\'elle part.' }), 'Lina dit qu\'elle part.');
  assert.equal(Claims.describe({ nature: 'parole', speaker: 'Marc', content: 'Marc tue le gardien.' }), 'Marc dit : Marc tue le gardien.');
  assert.equal(Claims.describe({ nature: 'croyance', speaker: 'Noé', content: 'Marc ment.' }), 'Noé pense : Marc ment.');
});
