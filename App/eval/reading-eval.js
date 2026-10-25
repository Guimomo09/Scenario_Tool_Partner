// === Évaluation d'une lecture de modèle sur les scénarios fictifs ===
// Passe les réponses (texte brut, une par unité) par la même validation que l'app (citations contrôlées,
// paroles requalifiées, intentions refusées), puis confronte les lectures retenues aux attentes humaines.
// Le résultat aide une relecture humaine ; il ne prouve pas qu'un modèle « comprend ».

const U = require('../src/core/understanding');
const Claims = require('../src/core/claims');

const norm = (s) => Claims.normText(s);
const listOf = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function unitsOf(scenario) {
  return U.buildUnits([{ path: `${scenario.id}.md`, content: scenario.text, role: 'autorite' }]).units;
}

// Une lecture correspond-elle à l'attente ? (sujet, nature, aspect, mots possibles)
function matches(claim, exp) {
  const subjects = listOf(exp.subject).map(norm);
  const names = [claim.subject.name, claim.object?.name, claim.speaker].filter(Boolean).map(norm);
  if (exp.relation) {
    if (claim.subject.kind !== 'relation' && claim.aspect !== 'relation') return false;
    if (!names.some(n => subjects.includes(n))) return false;
  } else if (!subjects.includes(norm(claim.subject.name)) && !(subjects.includes('récit') && claim.subject.kind === 'recit')) {
    return false;
  }
  if (exp.natures && !exp.natures.includes(claim.nature)) return false;
  if (exp.in && claim.period?.label !== exp.in) return false;
  if (exp.aspect && !listOf(exp.aspect).includes(claim.aspect)) return false;
  if (exp.any) {
    const text = norm(claim.content);
    if (!exp.any.some(k => text.includes(norm(k)))) return false;
  }
  return true;
}

// responses : { [libellé ou identifiant d'unité]: texte brut de la réponse }
function evaluate(scenario, responses = {}) {
  const units = unitsOf(scenario);
  let store = U.createStore();
  const missing = [];
  let rejected = 0;
  let requalified = 0;
  units.forEach(unit => {
    const raw = responses[unit.label] ?? responses[unit.id];
    if (raw === undefined) { missing.push(unit.label); return; }
    const parsed = U.parseUnitResponse(raw);
    if (parsed.error) { store = U.recordFailure(store, unit, parsed.error, { currentVersion: unit.version }).store; return; }
    const r = U.applyUnitResult(store, unit, parsed.data, { model: 'évaluation', currentVersion: unit.version });
    store = r.store;
    rejected += r.rejected.length;
    requalified += r.notices.length;
  });
  const claims = store.claims;
  const entities = Object.values(store.units).flatMap(u => u.entities || []);
  const orderOf = (label) => units.find(u => u.label === label)?.order ?? Infinity;

  const results = scenario.expectations.map(exp => {
    const hits = claims.filter(c => matches(c, exp));
    let ok;
    let detail = '';
    switch (exp.type) {
      case 'attendu':
        ok = hits.length > 0;
        detail = ok ? `trouvé : ${Claims.describe(hits[0])}` : 'aucune lecture correspondante';
        break;
      case 'interdit':
        ok = hits.length === 0;
        detail = ok ? '' : `lecture à éviter : ${Claims.describe(hits[0])}`;
        break;
      case 'indetermine': {
        const closed = hits.filter(c => (c.nature === 'montre' || c.nature === 'interpretation') && !c.alternative);
        ok = closed.length === 0;
        detail = ok ? (hits.length ? 'lecture laissée ouverte' : 'aucune affirmation (acceptable)') : `tranché sans autre lecture : ${Claims.describe(closed[0])}`;
        break;
      }
      case 'pas-avant': {
        const early = hits.filter(c => (c.period?.order ?? 0) < orderOf(exp.unit));
        ok = early.length === 0;
        detail = ok ? '' : `prêté trop tôt (${early[0].period?.label}) : ${Claims.describe(early[0])}`;
        break;
      }
      case 'entite': {
        const names = listOf(exp.subject).map(norm);
        ok = entities.some(e => names.includes(norm(e.name))) || claims.some(c => names.includes(norm(c.subject.name)));
        detail = ok ? '' : 'entité non repérée';
        break;
      }
      default:
        ok = false;
        detail = `type d'attente inconnu (${exp.type})`;
    }
    return { id: exp.id, type: exp.type, ok, why: exp.why, detail };
  });
  const coverage = U.coverage(store, units);
  return {
    scenario: scenario.id, title: scenario.title, units: units.length, read: coverage.fait, failed: coverage.echec, missing,
    claims: claims.length, rejected, requalified,
    passed: results.filter(r => r.ok).length, total: results.length, results
  };
}

function formatReport(reports) {
  const lines = [];
  reports.forEach(r => {
    lines.push(`\n■ ${r.title} (${r.scenario})`);
    lines.push(`  ${r.read}/${r.units} unité(s) lue(s)${r.failed ? `, ${r.failed} en échec` : ''}${r.missing.length ? `, sans réponse : ${r.missing.join(', ')}` : ''} · ${r.claims} lecture(s) retenue(s), ${r.rejected} écartée(s), ${r.requalified} requalifiée(s)`);
    r.results.forEach(x => lines.push(`  ${x.ok ? '✓' : '✗'} [${x.type}] ${x.why}${x.detail ? ` — ${x.detail}` : ''}`));
    lines.push(`  ${r.passed}/${r.total} attente(s) respectée(s)`);
  });
  lines.push('\nCes contrôles valident des garde-fous de lecture, pas une interprétation : relire chaque lecture retenue.');
  return lines.join('\n');
}

module.exports = { unitsOf, matches, evaluate, formatReport };
