// === Modèle de projet : fusion non destructive ===
// Une extraction (parsing local, IA, import) n'est jamais une nouvelle source de vérité :
// elle complète les données existantes sans rien supprimer ni fusionner implicitement.
// Chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schema'), require('./provenance'));
  } else {
    root.ProjectModel = factory(root.ProjectSchema, root.Provenance);
  }
})(typeof self !== 'undefined' ? self : this, function (Schema, Provenance) {

  const COLLECTIONS = Schema.COLLECTIONS;

  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  const isEmpty = (value) =>
    value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);

  // Éléments narratifs qui ne sont jamais des personnages (filtre appliqué aux extractions uniquement)
  const NARRATIVE_ELEMENTS = /^(voix|voix[\s-]?off|narrateur|narrator|narration|texte|intertitre|carton|(sur|sous)[\s-]?titre)$/i;
  const STRUCTURE_WORDS = /^(page|séquence|sequence|arc|chapitre|scène|scene)\b/i;

  // Fusion simple pour les éléments sans fiche (points à traiter, références) :
  // champs existants non vides conservés, champs vides complétés, tableaux unis
  function mergeFields(existing, incoming) {
    const merged = { ...existing };
    for (const [field, value] of Object.entries(incoming)) {
      if (isEmpty(value)) continue;
      const current = merged[field];
      if (Array.isArray(current) && Array.isArray(value)) {
        const seen = new Set(current.map(v => JSON.stringify(v)));
        merged[field] = [...current, ...value.filter(v => !seen.has(JSON.stringify(v)))];
      } else if (isEmpty(current)) {
        merged[field] = value;
      }
    }
    return merged;
  }

  // Métadonnées de transport d'une extraction (origine, preuves par champ), jamais stockées telles quelles.
  // `origin` et `_prov` reçus sont aussi écartés : une extraction ne peut pas se déclarer validée.
  const stripMeta = (item) => {
    const { _origin, _evidence, _prov, origin, ...rest } = item;
    return rest;
  };

  // Fusion d'une fiche de la bible avec provenance : un champ vide est complété (à vérifier),
  // une valeur différente devient une proposition (`reviews`), jamais un remplacement ni un cumul.
  // Une extraction n'est jamais une saisie de l'auteur, quelle que soit l'étiquette reçue
  const extractionOrigin = (origin) => (origin && origin !== 'auteur' ? origin : 'extraction');

  function fieldMerger(collection, defaultOrigin, reviews) {
    const originOf = (item) => extractionOrigin(item._origin || defaultOrigin);
    const evidenceOf = (item) => (isObject(item._evidence) ? item._evidence : {});
    const ctxOf = (item) => ({ collection, origin: originOf(item), evidence: evidenceOf(item), reviews });
    const prefix = Schema.ID_PREFIXES[collection];
    return {
      // Nouvel élément : identifiant immédiat (une proposition du même lot peut le viser)
      create(item) {
        const entry = Provenance.initProv(stripMeta(item), originOf(item), evidenceOf(item));
        return isEmpty(entry.id) ? { ...entry, id: Schema.newId(prefix) } : entry;
      },
      merge(existing, item) {
        const ctx = ctxOf(item);
        let entry = isEmpty(existing.id) ? { ...existing, id: Schema.newId(prefix) } : existing;
        for (const [field, value] of Object.entries(stripMeta(item))) {
          if (field === 'id') continue;
          entry = Provenance.mergeField(entry, field, value, ctx);
        }
        return entry;
      }
    };
  }

  // Fusion par clé exacte (nom complet normalisé) : "Jean Martin" ≠ "Jean Dupont"
  function mergeByKey(existing, incoming, keyOf, mergeItem = mergeFields, createItem = stripMeta) {
    const list = [...(existing || [])];
    const index = new Map();
    list.forEach((item, i) => {
      const key = keyOf(item);
      if (key && !index.has(key)) index.set(key, i);
    });

    let added = 0;
    let updated = 0;
    for (const item of incoming || []) {
      const key = keyOf(item);
      if (!key) continue;
      if (index.has(key)) {
        const i = index.get(key);
        const merged = mergeItem(list[i], mergeItem === mergeFields ? stripMeta(item) : item);
        if (JSON.stringify(merged) !== JSON.stringify(list[i])) {
          list[i] = merged;
          updated++;
        }
      } else {
        index.set(key, list.length);
        list.push(createItem(item));
        added++;
      }
    }
    return { list, added, updated };
  }

  // Une page re-extraite des notes remplace son contenu dérivé, les autres pages restent intactes.
  // Son identifiant stable est conservé.
  const mergeDerivedPage = (existing, incoming) => ({ ...existing, ...incoming, id: existing.id ?? incoming.id });

  // Une séquence re-extraite garde aussi les pages qu'elle avait déjà
  const mergeDerivedSequence = (existing, incoming) => {
    const merged = mergeDerivedPage(existing, incoming);
    if (Array.isArray(existing.pages) || Array.isArray(incoming.pages)) {
      merged.pages = [...new Set([...(existing.pages || []), ...(incoming.pages || [])])].sort((a, b) => a - b);
    }
    return merged;
  };

  // Les rôles proposés par une extraction (IA, parseur) restent des suggestions à confirmer
  function rolesAsSuggestions(updates, source) {
    if (!updates.character_updates?.length) return updates;
    return {
      ...updates,
      character_updates: updates.character_updates.map(c => {
        if (isEmpty(c.role)) return c;
        const { role, ...rest } = c;
        return { ...rest, suggestedRole: role, suggestionSource: source };
      })
    };
  }

  function sanitizeCharacter(u) {
    const name = String(u.name || '').trim();
    if (name.length < 2 || NARRATIVE_ELEMENTS.test(name) || STRUCTURE_WORDS.test(name)) return null;
    const character = { ...u, name };
    if (u.trait && !u.traits) character.traits = [u.trait];
    if (u.trait && !u.description) character.description = u.trait;
    delete character.trait;
    return character;
  }

  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const objectsWith = (array, field) =>
    Array.isArray(array) ? array.filter(item => isObject(item) && !isEmpty(item[field])) : [];

  // Valide la forme d'un résultat d'extraction (IA ou local) avant application
  function validateUpdates(raw) {
    if (!isObject(raw)) return { valid: false, error: 'Réponse non structurée', updates: null };
    const updates = {
      script_updates: objectsWith(raw.script_updates, 'page')
        .filter(p => Number.isFinite(Number(p.page)))
        .map(p => ({ ...p, page: Number(p.page) })),
      character_updates: objectsWith(raw.character_updates, 'name'),
      place_updates: objectsWith(raw.place_updates, 'name'),
      system_updates: objectsWith(raw.system_updates, 'name'),
      timeline_updates: objectsWith(raw.timeline_updates, 'event').filter(t => !isEmpty(t.period)),
      todos: objectsWith(raw.todos, 'title'),
      refs: Array.isArray(raw.refs) ? raw.refs.filter(isObject) : []
    };
    if (Array.isArray(raw.sequences)) updates.sequences = objectsWith(raw.sequences, 'number');
    if (isObject(raw.worldContext)) updates.worldContext = raw.worldContext;
    if (Array.isArray(raw.narrativeClues)) updates.narrativeClues = raw.narrativeClues;
    return { valid: true, error: null, updates };
  }

  // Réunit l'analyse locale et la réponse de l'IA sans choisir de vérité par ordre d'arrivée :
  // chaque élément garde son origine ; deux valeurs différentes pour une même fiche deviendront
  // une proposition à examiner lors de l'application. Toutes les catégories sont conservées.
  // Les pages du script viennent du parseur (texte réel) : une page résumée par l'IA ne les remplace pas.
  const LIST_KEYS = ['character_updates', 'place_updates', 'system_updates', 'timeline_updates', 'todos', 'refs'];
  function combineExtractions(local = {}, ai = {}) {
    // L'origine « ia » est imposée : une réponse ne peut pas se déclarer saisie de l'auteur
    const tag = (list, origin, force) => (Array.isArray(list) ? list : [])
      .map(i => ({ ...i, _origin: force ? origin : (i._origin || origin) }));
    const combined = {};
    LIST_KEYS.forEach(k => { combined[k] = [...tag(local[k], 'parseur'), ...tag(ai[k], 'ia', true)]; });
    const localPages = new Set((local.script_updates || []).map(p => String(p.page)));
    const aiPages = (ai.script_updates || []).filter(p => !localPages.has(String(p.page)));
    combined.script_updates = [...(local.script_updates || []), ...aiPages];
    for (const k of ['sequences', 'worldContext', 'narrativeClues']) {
      const value = local[k] !== undefined ? local[k] : ai[k];
      if (value !== undefined) combined[k] = value;
    }
    const ignoredPages = (ai.script_updates || []).length - aiPages.length;
    combined._notices = [
      ...(local._notices || []),
      ...(ignoredPages ? [`${ignoredPages} page(s) résumée(s) par l'IA non appliquée(s) : le texte du parseur fait foi.`] : [])
    ];
    return combined;
  }

  // Applique des mises à jour à une copie du projet. Ne supprime jamais un élément existant.
  // options.origin : origine des éléments non étiquetés (parseur, ia, import…)
  function applyUpdates(projectData, updates, options = {}) {
    const data = { ...projectData };
    COLLECTIONS.forEach(c => { data[c] = Array.isArray(data[c]) ? data[c] : []; });
    const summary = {};
    const reviews = [];
    const origin = options.origin || 'extraction';
    const record = (name, result) => {
      data[name] = result.list;
      if (result.added || result.updated) summary[name] = { added: result.added, updated: result.updated };
    };
    const mergeSheets = (collection, incoming, keyOf) => {
      const merger = fieldMerger(collection, origin, reviews);
      record(collection, mergeByKey(data[collection], incoming, keyOf, merger.merge, merger.create));
    };

    if (updates.script_updates?.length) {
      const result = mergeByKey(data.script, updates.script_updates, p => String(p.page), mergeDerivedPage);
      result.list.sort((a, b) => a.page - b.page);
      record('script', result);
    }
    if (updates.sequences?.length) {
      record('sequences', mergeByKey(data.sequences, updates.sequences, s => String(s.number), mergeDerivedSequence));
    }
    if (updates.character_updates?.length) {
      const incoming = updates.character_updates.map(sanitizeCharacter).filter(Boolean);
      mergeSheets('characters', incoming, c => normalize(c.name));
    }
    if (updates.place_updates?.length) {
      mergeSheets('places', updates.place_updates, p => normalize(p.name));
    }
    if (updates.system_updates?.length) {
      mergeSheets('systems', updates.system_updates, s => normalize(s.name));
    }
    if (updates.timeline_updates?.length) {
      mergeSheets('timeline', updates.timeline_updates, t => `${normalize(t.period)}|${normalize(t.event)}`);
    }
    if (updates.todos?.length) {
      record('todos', mergeByKey(data.todos, updates.todos, t => normalize(t.title)));
    }
    if (updates.refs?.length) {
      record('refs', mergeByKey(data.refs, updates.refs, r => normalize(r.url || r.source || r.title)));
    }
    // Index d'analyse dérivés (non rédigés par l'auteur) : remplacés par la dernière analyse
    if (updates.worldContext) data.worldContext = updates.worldContext;
    if (updates.narrativeClues) data.narrativeClues = updates.narrativeClues;

    // Désaccords avec les fiches existantes : propositions à examiner (jamais recréées une fois tranchées)
    if (reviews.length) {
      const result = Provenance.appendReviews(data.reviews, reviews);
      data.reviews = result.list;
      if (result.added) summary.reviews = { added: result.added, updated: 0 };
    }

    // Les nouveaux éléments reçoivent un identifiant stable ; les existants gardent le leur
    // (copie des éléments sans id : le projet d'origine n'est jamais modifié)
    COLLECTIONS.forEach(c => {
      data[c] = data[c].map(item => (isObject(item) && (item.id === undefined || item.id === null) ? { ...item } : item));
    });
    Schema.ensureIds(data);
    return { data, summary };
  }

  return { applyUpdates, validateUpdates, combineExtractions, rolesAsSuggestions, mergeByKey, mergeFields, normalize };
});
