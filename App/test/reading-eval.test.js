// Protocole d'évaluation de lecture : le logiciel de notation, sur réponses simulées (aucun modèle réel)
const test = require('node:test');
const assert = require('node:assert/strict');
const scenarios = require('../eval/scenarios');
const { prudent, contamine } = require('../eval/simulated');
const { evaluate, unitsOf } = require('../eval/reading-eval');

test('scénarios : découpés sans perte, chaque attente a un type connu et une raison', () => {
  const types = new Set(['attendu', 'interdit', 'indetermine', 'pas-avant', 'entite']);
  scenarios.forEach(s => {
    assert.ok(unitsOf(s).length >= 1, s.id);
    s.expectations.forEach(e => {
      assert.ok(types.has(e.type), `${s.id}/${e.id}`);
      assert.ok(e.why, `${s.id}/${e.id} sans raison`);
    });
  });
});

test('lecteur prudent simulé : toutes les attentes respectées', () => {
  scenarios.forEach(s => {
    const r = evaluate(s, prudent[s.id]);
    assert.equal(r.passed, r.total, `${s.id} : ${JSON.stringify(r.results.filter(x => !x.ok))}`);
  });
});

test('lecteur contaminé simulé : chaque défaut connu est relevé', () => {
  const failed = new Set(scenarios.flatMap(s => evaluate(s, contamine[s.id]).results.filter(x => !x.ok).map(x => x.id)));
  ['noe-pas-orphelin', 'noe-pas-rebelle', 'pas-de-lien', 'paul-parole', 'lina-negation', 'pas-avant', 'pas-incoherence', 'ines-motif']
    .forEach(id => assert.ok(failed.has(id), `${id} non relevé`));
});

test('unité sans réponse ou réponse illisible : comptée, jamais tenue pour lue', () => {
  const s = scenarios.find(x => x.id === 'lettre-revelation');
  const r = evaluate(s, { 'Séquence 1': 'je ne sais pas', 'Séquence 3': prudent[s.id]['Séquence 3'] });
  assert.equal(r.read, 1);
  assert.equal(r.failed, 1);
  assert.deepEqual(r.missing, ['Séquence 2']);
});
