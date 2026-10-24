// === Modèle de projet : fusion non destructive ===
// Une extraction (parsing local, IA, import) n'est jamais une nouvelle source de vérité :
// elle complète les données existantes sans rien supprimer ni fusionner implicitement.
// Chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ProjectModel = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const COLLECTIONS = ['script', 'sequences', 'characters', 'places', 'systems', 'timeline', 'refs', 'todos'];

  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  const isEmpty = (value) =>
    value === undefined || value === null || value === '' ||
    (Array.isArray(value) && value.length === 0);

  // Éléments narratifs qui ne sont jamais des personnages (filtre appliqué aux extractions uniquement)
  const NARRATIVE_ELEMENTS = /^(voix|voix[\s-]?off|narrateur|narrator|narration|texte|intertitre|carton|(sur|sous)[\s-]?titre)$/i;
  const STRUCTURE_WORDS = /^(page|séquence|sequence|arc|chapitre|scène|scene)\b/i;

  // Champs existants non vides conservés (saisie manuelle), champs vides complétés, tableaux unis
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

  // Fusion par clé exacte (nom complet normalisé) : "Jean Martin" ≠ "Jean Dupont"
  function mergeByKey(existing, incoming, keyOf, mergeItem = mergeFields) {
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
        const merged = mergeItem(list[i], item);
        if (JSON.stringify(merged) !== JSON.stringify(list[i])) {
          list[i] = merged;
          updated++;
        }
      } else {
        index.set(key, list.length);
        list.push(item);
        added++;
      }
    }
    return { list, added, updated };
  }

  // Une page re-extraite des notes remplace son contenu dérivé, les autres pages restent intactes
  const mergeDerivedPage = (existing, incoming) => ({ ...existing, ...incoming });

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

  // Applique des mises à jour à une copie du projet. Ne supprime jamais un élément existant.
  function applyUpdates(projectData, updates) {
    const data = { ...projectData };
    COLLECTIONS.forEach(c => { data[c] = Array.isArray(data[c]) ? data[c] : []; });
    const summary = {};
    const record = (name, result) => {
      data[name] = result.list;
      if (result.added || result.updated) summary[name] = { added: result.added, updated: result.updated };
    };

    if (updates.script_updates?.length) {
      const result = mergeByKey(data.script, updates.script_updates, p => String(p.page), mergeDerivedPage);
      result.list.sort((a, b) => a.page - b.page);
      record('script', result);
    }
    if (updates.sequences?.length) {
      record('sequences', mergeByKey(data.sequences, updates.sequences, s => String(s.number), mergeDerivedPage));
    }
    if (updates.character_updates?.length) {
      const incoming = updates.character_updates.map(sanitizeCharacter).filter(Boolean);
      record('characters', mergeByKey(data.characters, incoming, c => normalize(c.name)));
    }
    if (updates.place_updates?.length) {
      record('places', mergeByKey(data.places, updates.place_updates, p => normalize(p.name)));
    }
    if (updates.system_updates?.length) {
      record('systems', mergeByKey(data.systems, updates.system_updates, s => normalize(s.name)));
    }
    if (updates.timeline_updates?.length) {
      record('timeline', mergeByKey(data.timeline, updates.timeline_updates,
        t => `${normalize(t.period)}|${normalize(t.event)}`));
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

    return { data, summary };
  }

  return { applyUpdates, validateUpdates, mergeByKey, mergeFields, normalize };
});
