// === Schéma de _PROJECT.json : version, identifiants stables, migration ===
// Une migration ne fait qu'ajouter (version, identifiants) : aucun élément n'est supprimé,
// fusionné ou renommé. Toute conversion de valeur d'auteur est une option explicite.
// Chargé dans le renderer via <script> et dans le main process / les tests via require().

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.ProjectSchema = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const SCHEMA_VERSION = 2;

  // Collections dont chaque élément reçoit un identifiant stable
  const ID_PREFIXES = {
    script: 'pg', sequences: 'sq', characters: 'ch', places: 'pl', systems: 'sy',
    timeline: 'tl', refs: 'rf', todos: 'td', arcs: 'ar'
  };
  const COLLECTIONS = Object.keys(ID_PREFIXES);

  // Rôles produits par l'ancien parseur (v1), qui les devinait à partir de mots du texte
  const LEGACY_GUESSED_ROLES = ['Protagoniste', 'Antagoniste', 'Traître', 'Rebelle', 'Figurant',
    'Capitaine', 'Lieutenant', 'Personnage'];

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  function randomPart() {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 12);
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const newId = (prefix) => `${prefix}_${randomPart()}`;

  function createEmptyProject(title) {
    const data = { schemaVersion: SCHEMA_VERSION, title: String(title || 'Sans titre') };
    COLLECTIONS.forEach(c => { data[c] = []; });
    return data;
  }

  const schemaVersionOf = (data) =>
    isObject(data) && Number.isInteger(data.schemaVersion) ? data.schemaVersion : 1;

  // Donne un identifiant unique à chaque élément qui n'en a pas (modifie `data` en place).
  // Les identifiants existants sont conservés ; un identifiant répété est remplacé sur ses copies.
  function ensureIds(data) {
    const added = {};
    const reassigned = [];
    const seen = new Set();
    for (const c of COLLECTIONS) {
      if (!Array.isArray(data[c])) continue;
      for (const item of data[c]) {
        if (!isObject(item)) continue;
        const hasId = item.id !== undefined && item.id !== null && item.id !== '';
        if (hasId && !seen.has(String(item.id))) {
          seen.add(String(item.id));
          continue;
        }
        if (hasId) reassigned.push({ collection: c, id: item.id });
        let id;
        do { id = newId(ID_PREFIXES[c]); } while (seen.has(id));
        item.id = id;
        seen.add(id);
        added[c] = (added[c] || 0) + 1;
      }
    }
    return { added, reassigned };
  }

  // Personnages dont le rôle vient probablement de l'ancien parseur (champ dialogueCount = extraction)
  const legacyGuessedRoles = (data) =>
    (Array.isArray(data.characters) ? data.characters : [])
      .filter(c => isObject(c) && LEGACY_GUESSED_ROLES.includes(c.role) && c.dialogueCount !== undefined && !c.suggestedRole);

  // Prépare la migration vers la version courante, sans rien écrire.
  // status : 'current' (rien à faire), 'migrate' (à proposer), 'too-new' (version inconnue), 'invalid'
  function planMigration(raw, options = {}) {
    if (!isObject(raw)) return { status: 'invalid', error: 'Le fichier ne contient pas un objet JSON.' };
    const from = schemaVersionOf(raw);
    if (from > SCHEMA_VERSION) {
      return { status: 'too-new', from, error: `Ce projet utilise un format plus récent (v${from}) que cette version de l'app (v${SCHEMA_VERSION}).` };
    }
    for (const c of COLLECTIONS) {
      if (raw[c] !== undefined && !Array.isArray(raw[c])) {
        return { status: 'invalid', from, error: `Le champ « ${c} » n'est pas une liste : migration refusée pour ne rien perdre.` };
      }
    }
    if (from === SCHEMA_VERSION) return { status: 'current', from, data: raw };

    const data = clone(raw);
    const created = COLLECTIONS.filter(c => data[c] === undefined);
    created.forEach(c => { data[c] = []; });
    const ids = ensureIds(data);

    const guessed = legacyGuessedRoles(data);
    let rolesConverted = 0;
    if (options.rolesToSuggestions) {
      for (const c of guessed) {
        c.suggestedRole = c.role;
        c.suggestionSource = 'ancien parseur (v1)';
        delete c.role;
        rolesConverted++;
      }
    }

    data.schemaVersion = SCHEMA_VERSION;
    data._migrations = [...(Array.isArray(raw._migrations) ? raw._migrations : []),
      { from, to: SCHEMA_VERSION, at: new Date().toISOString(), rolesToSuggestions: !!options.rolesToSuggestions }];

    return {
      status: 'migrate',
      from,
      data,
      report: {
        from, to: SCHEMA_VERSION,
        idsAdded: ids.added,
        idsReassigned: ids.reassigned,
        collectionsCreated: created,
        guessedRoles: guessed.length,
        rolesConverted,
        duplicates: findDuplicateCandidates(data)
      }
    };
  }

  // Vérifie que la migration n'a rien perdu : chaque champ d'origine est retrouvé à l'identique,
  // sauf les conversions explicitement demandées (rôle → suggestion).
  function verifyMigration(before, after, options = {}) {
    const problems = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    // Seul changement d'identifiant autorisé : une copie d'un identifiant répété
    const idCounts = new Map();
    COLLECTIONS.forEach(c => (Array.isArray(before[c]) ? before[c] : []).forEach(item => {
      if (isObject(item) && item.id) idCounts.set(item.id, (idCounts.get(item.id) || 0) + 1);
    }));
    for (const [key, value] of Object.entries(before)) {
      if (key === '_migrations' || key === 'schemaVersion') continue;
      if (!COLLECTIONS.includes(key)) {
        if (!same(value, after[key])) problems.push(`Champ « ${key} » modifié`);
        continue;
      }
      const list = after[key];
      if (!Array.isArray(list) || list.length !== value.length) {
        problems.push(`Collection « ${key} » : ${value.length} élément(s) avant, ${Array.isArray(list) ? list.length : 0} après`);
        continue;
      }
      value.forEach((item, i) => {
        if (!isObject(item)) {
          if (!same(item, list[i])) problems.push(`${key}[${i}] modifié`);
          return;
        }
        for (const [field, fieldValue] of Object.entries(item)) {
          if (field === 'id' && list[i].id !== fieldValue && idCounts.get(fieldValue) > 1) continue;
          if (key === 'characters' && field === 'role' && options.rolesToSuggestions &&
              list[i].role === undefined && list[i].suggestedRole === fieldValue) continue;
          if (!same(fieldValue, list[i][field])) problems.push(`${key}[${i}].${field} modifié`);
        }
      });
    }
    if (after.schemaVersion !== SCHEMA_VERSION) problems.push('Version de schéma absente');
    return problems;
  }

  // Doublons possibles, exposés à l'auteur sans jamais être fusionnés automatiquement
  function findDuplicateCandidates(data) {
    const groupsBy = (list, keyOf) => {
      const groups = new Map();
      (Array.isArray(list) ? list : []).forEach((item, index) => {
        if (!isObject(item)) return;
        const key = keyOf(item);
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ index, id: item.id || null });
      });
      return [...groups.entries()]
        .filter(([, items]) => items.length > 1)
        .map(([key, items]) => ({ key, items }));
    };
    const characters = Array.isArray(data.characters) ? data.characters.filter(isObject) : [];
    const aliases = [];
    for (const a of characters) {
      for (const b of characters) {
        const short = normalize(a.name);
        const long = normalize(b.name);
        if (short && long !== short && long.startsWith(short + ' ')) aliases.push({ short: a.name, long: b.name });
      }
    }
    return {
      todos: groupsBy(data.todos, t => normalize(t.title)),
      characters: groupsBy(data.characters, c => normalize(c.name)),
      places: groupsBy(data.places, p => normalize(p.name)),
      aliases
    };
  }

  // Nombre d'éléments en trop (au-delà du premier de chaque groupe)
  const extraCount = (groups) => groups.reduce((n, g) => n + g.items.length - 1, 0);

  return {
    SCHEMA_VERSION, COLLECTIONS, ID_PREFIXES,
    newId, createEmptyProject, schemaVersionOf, ensureIds,
    planMigration, verifyMigration, findDuplicateCandidates, extraCount
  };
});
