// === Mémoire narrative consultée par le partenaire et les fiches ===
// À partir de la lecture du projet (_COMPREHENSION.json : unités, affirmations, intentions), retrouve
// selon la demande : les personnages et lieux en jeu (nom, alias confirmé, fiche liée à la scène),
// leurs lectures sourcées (validées d'abord, « à vérifier » signalées comme telles), ce que chacun sait
// au point du récit consulté (et ce qu'il ne sait pas encore), l'évolution des relations dans l'ordre
// du récit, et les unités pertinentes au-delà de la section active. Le périmètre consulté est décrit
// pour que le partenaire n'affirme rien sur ce qu'il n'a pas vu. Recherche locale, sans service externe.
// Sans DOM : chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./claims'), require('./understanding'), require('./partner-context'));
  } else {
    root.Recall = factory(root.Claims, root.Understanding, root.PartnerContext);
  }
})(typeof self !== 'undefined' ? self : this, function (Claims, Understanding, PartnerContext) {

  const LIMITS = { intentions: 4000, lectures: 9000, knowledge: 5000, unit: 6000, units: 30000, decisions: 3000 };
  // Nombre d'unités jointes selon l'intention : une critique globale consulte plus large
  const UNIT_COUNT = { structurer: 8, coherence: 8, reviser: 3, explorer: 2, ecrire: 1 };
  const CRITIQUE_INTENTS = new Set(['structurer', 'reviser', 'coherence']);
  const KNOW_ASPECTS = new Set(['connaissance', 'revelation']);
  const ENTITY_SUBJECTS = new Set(['personnage', 'lieu', 'groupe', 'objet', 'systeme']);
  const STOP = new Set(('alors aussi autre avant avec avoir cette celle celui comme comment dans depuis donc elle elles encore entre être fait faire leur leurs mais même moins notre nous parce pour pourquoi quand quel quelle quelles quels sans selon sera sont sous suis tout toute toutes tous très vers votre vous était quoi cela scène scènes passage texte histoire personnage personnages chapitre page pages séquence est-ce penses trouve semble trop peux veux faut').split(' '));

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const LIVE = (c) => c && (c.status === 'accepté' || c.status === 'à vérifier');
  const byOrder = (a, b) => (a.period?.order ?? 0) - (b.period?.order ?? 0) || (a.source?.lines?.[0] ?? 0) - (b.source?.lines?.[0] ?? 0);

  // === Identités ===
  // Clé stable d'un nom : fiche de la Bible (nom ou alias confirmé d'une seule fiche), sinon le nom lui-même.
  // Un alias porté par plusieurs fiches reste un nom à part (jamais fusionné).
  function identities(projectData = {}) {
    const chars = Understanding.resolver(projectData.characters || []);
    const places = Understanding.resolver(projectData.places || []);
    const resolve = (name, kind = 'personnage') => {
      const r = (kind === 'lieu' ? places(name) : chars(name)) || (kind === 'lieu' ? null : places(name));
      return r?.id ? { key: `id:${r.id}`, id: r.id, name: r.name } : { key: `nom:${norm(name)}`, name: String(name ?? '').trim(), ...(r?.ambiguous ? { ambiguous: r.ambiguous } : {}) };
    };
    return { resolve, keyOf: (name, kind) => resolve(name, kind).key };
  }

  const subjectKey = (ids, c) => ids.keyOf(c.subject.name, c.subject.kind === 'lieu' ? 'lieu' : 'personnage');

  // Affirmations vivantes (validées ou à vérifier) qui portent sur une des clés
  function claimsAbout(claims, ids, keys) {
    return (claims || []).filter(LIVE).filter(c => {
      if (c.subject.kind === 'relation') return keys.has(ids.keyOf(c.subject.name)) || keys.has(ids.keyOf(c.object?.name));
      if (ENTITY_SUBJECTS.has(c.subject.kind) && keys.has(subjectKey(ids, c))) return true;
      // Une parole ou une pensée renseigne aussi sur celui qui la porte
      return (c.nature === 'parole' || c.nature === 'croyance') && c.speaker && keys.has(ids.keyOf(c.speaker));
    }).sort(byOrder);
  }

  // Lectures d'une fiche de la Bible (personnage ou lieu)
  function claimsForEntry(store, projectData, entry) {
    if (!entry?.id) return [];
    return claimsAbout(store?.claims, identities(projectData), new Set([`id:${entry.id}`]));
  }

  // Noms connus : fiches (nom + alias) et entités relevées par la lecture
  function knownNames(store, projectData = {}) {
    const list = [];
    [['characters', 'personnage'], ['places', 'lieu']].forEach(([k, kind]) => (projectData[k] || []).forEach(e => {
      if (!isObject(e) || !e.name) return;
      [e.name, ...(Array.isArray(e.aliases) ? e.aliases : [])].forEach(n => list.push({ name: n, kind }));
    }));
    Object.values(store?.units || {}).forEach(rec => (rec.entities || []).forEach(e => {
      list.push({ name: e.name, kind: e.kind === 'lieu' ? 'lieu' : 'personnage' });
      (e.aliases || []).forEach(a => list.push({ name: a, kind: e.kind === 'lieu' ? 'lieu' : 'personnage' }));
    }));
    (store?.claims || []).filter(LIVE).forEach(c => { if (ENTITY_SUBJECTS.has(c.subject.kind)) list.push({ name: c.subject.name, kind: c.subject.kind }); });
    const seen = new Set();
    return list.filter(n => { const k = `${n.kind}|${norm(n.name)}`; if (!n.name || seen.has(k)) return false; seen.add(k); return true; });
  }

  // Personnages et lieux en jeu : nommés dans le texte consulté ou la demande, ou liés à la scène active
  function focusEntities({ text = '', store, projectData = {}, sceneCharacterIds = [] }) {
    const ids = identities(projectData);
    const found = new Map();
    knownNames(store, projectData).forEach(n => {
      if (!PartnerContext.mentions(text, n.name)) return;
      const r = ids.resolve(n.name, n.kind);
      if (!found.has(r.key)) found.set(r.key, { key: r.key, id: r.id || null, name: r.name, kind: n.kind, via: 'nommé' });
    });
    (sceneCharacterIds || []).forEach(id => {
      const c = (projectData.characters || []).find(x => x && x.id === id);
      if (c && !found.has(`id:${id}`)) found.set(`id:${id}`, { key: `id:${id}`, id, name: c.name, kind: 'personnage', via: 'scène' });
    });
    return [...found.values()];
  }

  // === Point du récit ===
  // Unité (ordre de lecture) qui contient une ligne du document ; null si le document n'est pas une source lue
  function pointOf(units, docName, line) {
    const u = (units || []).find(x => x.document === docName && x.startLine <= line && line <= x.endLine);
    return u ? { unitId: u.id, order: u.order, label: u.label } : null;
  }

  // Ce qu'un personnage sait ou croit jusqu'au point donné, et ce qui ne sera établi que plus tard.
  // order null : point inconnu, tout est rangé dans « sans point du récit ».
  function knowledgeAt(claims, ids, key, order) {
    const mine = (claims || []).filter(LIVE).filter(c =>
      (ENTITY_SUBJECTS.has(c.subject.kind) && subjectKey(ids, c) === key && KNOW_ASPECTS.has(c.aspect)) ||
      (c.nature === 'croyance' && c.speaker && ids.keyOf(c.speaker) === key)).sort(byOrder);
    if (order === null || order === undefined) return { known: [], later: [], unplaced: mine };
    return {
      known: mine.filter(c => (c.period?.order ?? 0) <= order),
      later: mine.filter(c => (c.period?.order ?? 0) > order),
      unplaced: []
    };
  }

  // Révélations établies pour le lecteur jusqu'au point donné, et celles qui viennent après
  function readerKnowledge(claims, order) {
    const rev = (claims || []).filter(LIVE).filter(c => c.aspect === 'revelation').sort(byOrder);
    if (order === null || order === undefined) return { known: [], later: [], unplaced: rev };
    return { known: rev.filter(c => (c.period?.order ?? 0) <= order), later: rev.filter(c => (c.period?.order ?? 0) > order), unplaced: [] };
  }

  // Évolution d'un lien entre deux personnages, dans l'ordre du récit : des étapes successives,
  // pas une contradiction. Les deux sens (A → B, B → A) sont gardés distincts.
  function relationTimeline(claims, ids, keyA, keyB) {
    const steps = (claims || []).filter(LIVE).filter(c => c.subject.kind === 'relation').filter(c => {
      const a = ids.keyOf(c.subject.name);
      const b = ids.keyOf(c.object?.name);
      return (a === keyA && b === keyB) || (a === keyB && b === keyA);
    }).sort(byOrder);
    const points = new Set(steps.map(c => c.period?.order ?? 0));
    return { steps, changes: points.size > 1 };
  }

  // === Unités pertinentes ===
  function keywords(message) {
    return [...new Set(Claims.normText(message).split(/[^a-zà-ÿ0-9'-]+/).map(w => w.replace(/^[ldjmnst]'/, '')).filter(w => w.length >= 5 && !STOP.has(w)))].slice(0, 12);
  }

  // Unités classées selon la demande : personnages en jeu présents (répliques, entités relevées),
  // lectures qui en parlent, mots de la question. L'unité de la section active est exclue (déjà jointe).
  function relevantUnits({ units = [], store, projectData = {}, focus = [], message = '', excludeUnitIds = [], intent = 'reviser' }) {
    const ids = identities(projectData);
    const keys = new Set(focus.map(f => f.key));
    const words = keywords(message);
    const skip = new Set(excludeUnitIds);
    const claimsByUnit = new Map();
    claimsAbout(store?.claims, ids, keys).forEach(c => {
      const id = c.source?.unitId;
      if (id) claimsByUnit.set(id, (claimsByUnit.get(id) || 0) + (c.status === 'accepté' ? 3 : 2));
    });
    const scored = units.filter(u => !skip.has(u.id)).map(u => {
      let score = 0;
      const why = [];
      const present = new Set();
      Object.values(u.lineInfo || {}).forEach(i => { if (i.speaker && keys.has(ids.keyOf(i.speaker))) present.add(ids.resolve(i.speaker).name); });
      const rec = store?.units?.[u.id];
      if (rec && rec.version === u.version) (rec.entities || []).forEach(e => { const k = ids.keyOf(e.name, e.kind); if (keys.has(k)) present.add(ids.resolve(e.name, e.kind).name); });
      focus.forEach(f => { if (!present.has(f.name) && PartnerContext.mentions(u.text, f.name)) present.add(f.name); });
      if (present.size) { score += 3 * present.size; why.push([...present].join(', ')); }
      if (claimsByUnit.get(u.id)) { score += claimsByUnit.get(u.id); why.push('lectures liées'); }
      const text = Claims.normText(u.text);
      const hits = words.filter(w => text.includes(w));
      if (hits.length) { score += Math.min(hits.length, 5); why.push(`mots de la demande : ${hits.slice(0, 4).join(', ')}`); }
      return { unit: u, score, why };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score || a.unit.order - b.unit.order);
    const max = UNIT_COUNT[intent] ?? 2;
    let budget = LIMITS.units;
    const chosen = [];
    const left = [];
    scored.forEach(s => {
      const size = Math.min(s.unit.chars, LIMITS.unit);
      if (chosen.length < max && size <= budget) { chosen.push(s); budget -= size; } else left.push(s);
    });
    chosen.sort((a, b) => a.unit.order - b.unit.order);
    return { chosen, left };
  }

  // === Éléments de contexte ===
  const sourceRef = (c) => (c.source ? ` (${c.source.unitLabel || c.source.document}, l. ${c.source.lines[0]} — « ${String(c.source.quote).slice(0, 160)} »)` : '');
  const statusTag = (c) => (c.status === 'accepté'
    ? (c.origin === 'auteur' ? 'validé par l\'auteur' : 'lecture validée par l\'auteur')
    : 'à vérifier — lecture non validée');
  const claimLine = (c) => `- [${statusTag(c)} · ${Claims.NATURES[c.nature]}${c.aspect && c.aspect !== 'autre' ? ` · ${Claims.ASPECTS[c.aspect]}` : ''}] ${Claims.describe(c)}${sourceRef(c)}${c.alternative ? ` — autre lecture : ${c.alternative}` : ''}${c.sourceChanged ? ' — texte source modifié depuis la validation' : ''}`;

  function intentionsText(intentions) {
    const groups = new Map();
    (intentions || []).forEach(i => {
      const label = Understanding.INTENTION_KINDS[i.kind] || i.kind;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(`- ${i.text}${i.about ? ` (concerne : ${i.about})` : ''}${i.quote ? ` [passage : « ${i.quote.slice(0, 200)} »]` : ''}`);
    });
    return [...groups.entries()].map(([label, lines]) => `${label} :\n${lines.join('\n')}`).join('\n');
  }

  function knowledgeText(store, ids, focus, point) {
    const people = focus.filter(f => f.kind === 'personnage');
    const order = point ? point.order : null;
    const parts = [point ? `Point du récit consulté : ${point.label} (unité ${point.order} dans l'ordre de lecture).` : 'Point du récit inconnu : le passage n\'appartient pas à une source lue. Les connaissances ci-dessous ne sont pas situées.'];
    people.forEach(p => {
      const k = knowledgeAt(store.claims, ids, p.key, order);
      if (!k.known.length && !k.later.length && !k.unplaced.length) return;
      parts.push(`${p.name} :`);
      if (k.known.length) parts.push(`  sait ou croit à ce point :\n${k.known.map(c => `  ${claimLine(c)}`).join('\n')}`);
      if (k.unplaced.length) parts.push(`  sait ou croit (point non situé) :\n${k.unplaced.map(c => `  ${claimLine(c)}`).join('\n')}`);
      if (k.later.length) parts.push(`  NE SAIT PAS ENCORE (établi plus tard dans le récit) :\n${k.later.map(c => `  ${claimLine(c)} — à partir de ${c.period?.label || '?'}`).join('\n')}`);
    });
    const r = readerKnowledge(store.claims, order);
    if (r.known.length) parts.push(`Le lecteur a appris à ce point :\n${r.known.map(claimLine).join('\n')}`);
    if (r.later.length) parts.push(`Révélé plus tard (l'auteur le sait, ni le lecteur ni les personnages à ce point) :\n${r.later.map(c => `${claimLine(c)} — à partir de ${c.period?.label || '?'}`).join('\n')}`);
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const t = relationTimeline(store.claims, ids, people[i].key, people[j].key);
        if (!t.steps.length) continue;
        parts.push(`Relation ${people[i].name} / ${people[j].name}, dans l'ordre du récit${t.changes ? ' (le lien évolue : une étape nouvelle n\'est pas une incohérence)' : ''} :\n${t.steps.map(c => `${claimLine(c)} — ${c.period?.label || '?'}`).join('\n')}`);
      }
    }
    return parts.length > 1 ? parts.join('\n') : '';
  }

  function scopeText({ coverage, units, included, left, focus, point, intent, insufficient }) {
    const lines = [];
    if (!coverage || !coverage.total) lines.push('Lecture du projet : aucune source lue (espace Lecture). Seuls les éléments joints ici sont connus.');
    else lines.push(`Lecture du projet : ${coverage.fait}/${coverage.total} unités lues${coverage.partial ? ' — compréhension PARTIELLE, rien ne vaut pour les unités non lues' : ''}.`);
    lines.push(`Point du récit : ${point ? point.label : 'inconnu (document non retenu comme source, ou hors des unités)'}.`);
    if (focus.length) lines.push(`Personnages et lieux en jeu : ${focus.map(f => `${f.name}${f.via === 'scène' ? ' (fiche de la scène)' : ''}`).join(', ')}.`);
    lines.push(included.length ? `Passages joints au-delà de la section active : ${included.join(' ; ')}.` : 'Aucun passage joint au-delà de la section active.');
    if (left.length) lines.push(`Aussi pertinents mais non joints (limite) : ${left.slice(0, 8).join(' ; ')}${left.length > 8 ? ` … (+${left.length - 8})` : ''}.`);
    const rest = (units || []).length - included.length;
    if (rest > 0) lines.push(`Non consulté : ${rest} autre(s) unité(s) du projet, et tout document non retenu comme source.`);
    if (insufficient && CRITIQUE_INTENTS.has(intent)) lines.push(`SOURCES INSUFFISANTES pour une critique globale : ${insufficient} Dis-le, limite ta réponse au passage fourni et pose une question précise plutôt que de conclure.`);
    return lines.join('\n');
  }

  // Éléments ajoutés au contexte du partenaire. `excluded` : identifiants décochés par l'auteur.
  function contextItems({ store, units = [], projectData = {}, intent = 'reviser', docName = '', cursorLine = 1, focusText = '', message = '', sceneCharacterIds = [], currentUnitIds = [], decisions = [], excluded = [] }) {
    const skip = new Set(excluded);
    const items = [];
    const s = store || Understanding.createStore();
    const ids = identities(projectData);
    const add = (item, limit) => {
      const clipped = PartnerContext.clip(item.text, limit);
      items.push({ ...item, text: clipped.text, chars: item.text.length, truncated: clipped.truncated, included: !skip.has(item.id) });
    };

    const intentions = s.intentions || [];
    if (intentions.length) add({ id: 'intentions', kind: 'intentions', label: `Intentions de l'auteur (${intentions.length})`, text: intentionsText(intentions) }, LIMITS.intentions);

    const decided = (decisions || []).filter(d => d && d.text);
    if (decided.length) add({ id: 'decisions', kind: 'decisions', label: `Décisions sur des remarques (${decided.length})`, text: decided.map(d => `- ${d.text}`).join('\n') }, LIMITS.decisions);

    const focus = focusEntities({ text: `${focusText}\n${message}`, store: s, projectData, sceneCharacterIds });
    const point = pointOf(units, docName, cursorLine);
    const keys = new Set(focus.map(f => f.key));
    const about = claimsAbout(s.claims, ids, keys);
    if (about.length) {
      // Validées d'abord, puis à vérifier ; regroupées par personnage ou lieu
      const groups = new Map();
      [...about.filter(c => c.status === 'accepté'), ...about.filter(c => c.status !== 'accepté')].forEach(c => {
        const owner = c.subject.kind === 'relation' ? `${ids.resolve(c.subject.name).name} → ${ids.resolve(c.object?.name).name}` : ids.resolve(c.subject.name, c.subject.kind).name;
        if (!groups.has(owner)) groups.set(owner, []);
        groups.get(owner).push(claimLine(c));
      });
      const accepted = about.filter(c => c.status === 'accepté').length;
      add({
        id: 'lectures', kind: 'lectures',
        label: `Lectures du projet — ${focus.map(f => f.name).slice(0, 4).join(', ')}${focus.length > 4 ? '…' : ''} (${accepted} validée${accepted > 1 ? 's' : ''}, ${about.length - accepted} à vérifier)`,
        text: [...groups.entries()].map(([owner, lines]) => `${owner} :\n${lines.join('\n')}`).join('\n')
      }, LIMITS.lectures);
    }

    const know = knowledgeText(s, ids, focus, point);
    if (know) add({ id: 'connaissances', kind: 'connaissances', label: `Connaissances au point du récit${point ? ` — ${point.label}` : ''}`, text: know }, LIMITS.knowledge);

    const { chosen, left } = relevantUnits({ units, store: s, projectData, focus, message, excludeUnitIds: currentUnitIds, intent });
    const joined = [];
    chosen.forEach(({ unit, why }) => {
      const id = `unit:${unit.id}`;
      add({ id, kind: 'unit', label: `Passage — ${unit.label} (${unit.document}, l. ${unit.startLine}-${unit.endLine})`, text: unit.text, why: why.join(' · ') }, LIMITS.unit);
      if (!skip.has(id)) joined.push(`${unit.label} (${why.join(' · ')})`);
    });

    const coverage = units.length ? Understanding.coverage(s, units) : null;
    const nothingRead = !coverage || coverage.fait === 0;
    const insufficient = nothingRead && !joined.length
      ? 'le projet n\'a pas été lu (espace Lecture) et aucun autre passage n\'a été retrouvé.'
      : !joined.length && !about.length ? 'aucun autre passage ni aucune lecture ne concerne ce qui est demandé.' : '';
    const scope = scopeText({
      coverage, units, included: joined, left: [...left.map(l => l.unit.label), ...chosen.filter(c => skip.has(`unit:${c.unit.id}`)).map(c => `${c.unit.label} (décoché)`)],
      focus, point, intent, insufficient
    });
    items.push({ id: 'perimetre', kind: 'perimetre', label: 'Périmètre consulté', text: scope, chars: scope.length, truncated: false, included: true, fixed: true });
    return { items, focus, point, insufficient: !!insufficient };
  }

  // Remplace les unités d'un document par celles de son texte actuel (éditeur non enregistré), puis renumérote
  function withCurrentDocument(units, docName, freshUnits) {
    if (!(units || []).some(u => u.document === docName)) return units || [];
    const out = [];
    let inserted = false;
    units.forEach(u => {
      if (u.document !== docName) { out.push(u); return; }
      if (!inserted) { out.push(...freshUnits); inserted = true; }
    });
    return out.map((u, i) => ({ ...u, order: i + 1 }));
  }

  return {
    LIMITS, UNIT_COUNT, identities, claimsAbout, claimsForEntry, knownNames, focusEntities, pointOf,
    knowledgeAt, readerKnowledge, relationTimeline, keywords, relevantUnits, contextItems, withCurrentDocument, claimLine
  };
});
