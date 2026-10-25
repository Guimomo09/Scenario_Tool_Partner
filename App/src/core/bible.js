// === Bible : fiches de référence (personnages, lieux, systèmes, chronologie, références) ===
// Ajout et modification manuels. Seuls les champs décrits ici sont modifiables depuis une fiche ;
// les autres champs (extractions, champs inconnus) sont conservés tels quels.
// Un nom déjà utilisé est refusé (jamais de fusion implicite) : l'auteur ouvre la fiche existante.
// Les fonctions ne modifient jamais le projet reçu : elles renvoient une copie.
// Sans DOM : chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schema'));
  } else {
    root.Bible = factory(root.ProjectSchema);
  }
})(typeof self !== 'undefined' ? self : this, function (Schema) {

  // type : text (une ligne), long (paragraphe), list (une valeur par ligne)
  const KINDS = {
    characters: {
      label: 'Personnages', singular: 'personnage', key: 'name',
      fields: [
        { key: 'name', label: 'Nom', type: 'text', required: true },
        { key: 'role', label: 'Rôle', type: 'text' },
        { key: 'description', label: 'Description', type: 'long' },
        { key: 'traits', label: 'Traits', type: 'list' },
        { key: 'goals', label: 'Objectifs', type: 'list' },
        { key: 'motivations', label: 'Motivations', type: 'list' },
        { key: 'strengths', label: 'Forces', type: 'list' },
        { key: 'weaknesses', label: 'Faiblesses', type: 'list' },
        { key: 'arc', label: 'Arc', type: 'long' },
        { key: 'notes', label: 'Notes', type: 'long' }
      ]
    },
    places: {
      label: 'Lieux', singular: 'lieu', key: 'name',
      fields: [
        { key: 'name', label: 'Nom', type: 'text', required: true },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'description', label: 'Description', type: 'long' },
        { key: 'atmosphere', label: 'Atmosphère', type: 'long' },
        { key: 'notes', label: 'Notes', type: 'long' }
      ]
    },
    systems: {
      label: 'Systèmes', singular: 'système', key: 'name',
      fields: [
        { key: 'name', label: 'Nom', type: 'text', required: true },
        { key: 'category', label: 'Catégorie', type: 'text' },
        { key: 'description', label: 'Description', type: 'long' },
        { key: 'rules', label: 'Règles', type: 'list' },
        { key: 'notes', label: 'Notes', type: 'long' }
      ]
    },
    timeline: {
      label: 'Chronologie', singular: 'événement', key: 'event',
      fields: [
        { key: 'period', label: 'Période', type: 'text', required: true },
        { key: 'event', label: 'Événement', type: 'text', required: true },
        { key: 'notes', label: 'Notes', type: 'long' }
      ]
    },
    refs: {
      label: 'Références', singular: 'référence', key: 'title',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true },
        { key: 'source', label: 'Source', type: 'text' },
        { key: 'content', label: 'Contenu', type: 'long' }
      ]
    }
  };

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const listOf = (data, kind) => (Array.isArray(data?.[kind]) ? data[kind] : []);

  // Clé d'identité d'une fiche (celle qu'utilise la fusion des extractions)
  function identity(kind, entry) {
    if (!isObject(entry)) return '';
    if (kind === 'timeline') return `${normalize(entry.period)}|${normalize(entry.event)}`;
    if (kind === 'refs') return normalize(entry.url || entry.source || entry.title);
    return normalize(entry[KINDS[kind].key]);
  }

  const titleOf = (kind, entry) => {
    if (!isObject(entry)) return String(entry ?? '');
    if (kind === 'timeline') return [entry.period, entry.event].filter(Boolean).join(' — ');
    return String(entry[KINDS[kind].key] ?? '');
  };

  // Valeur saisie → valeur stockée. Liste : une valeur par ligne, lignes vides ignorées.
  function parseValue(field, value) {
    if (field.type === 'list') {
      const lines = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/);
      return lines.map(v => (typeof v === 'string' ? v.trim() : v)).filter(v => v !== '' && v !== null && v !== undefined);
    }
    return String(value ?? '').trim();
  }

  // Valeur stockée → texte du formulaire. Un élément de liste non textuel est signalé (non éditable).
  function formatValue(field, value) {
    if (field.type !== 'list') return value === undefined || value === null ? '' : String(value);
    const items = Array.isArray(value) ? value : value ? [value] : [];
    return items.filter(v => typeof v === 'string' || typeof v === 'number').join('\n');
  }

  // Une liste contenant des objets (extraction) n'est pas éditable ligne à ligne sans perte
  const isEditable = (field, value) =>
    field.type !== 'list' || !Array.isArray(value) || value.every(v => typeof v === 'string' || typeof v === 'number');

  function cleanFields(kind, fields, current = {}) {
    const clean = {};
    for (const field of KINDS[kind].fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, field.key)) continue;
      if (!isEditable(field, current[field.key])) continue;
      clean[field.key] = parseValue(field, fields[field.key]);
    }
    return clean;
  }

  function missingRequired(kind, entry) {
    return KINDS[kind].fields.filter(f => f.required && !normalize(entry[f.key])).map(f => f.label);
  }

  // Une autre fiche porte-t-elle déjà cette identité ?
  function findDuplicate(data, kind, entry, exceptId = null) {
    const key = identity(kind, entry);
    if (!key) return null;
    return listOf(data, kind).find(e => isObject(e) && e.id !== exceptId && identity(kind, e) === key) || null;
  }

  function addEntry(data, kind, fields) {
    if (!KINDS[kind]) return { data, entry: null, error: 'Type de fiche inconnu' };
    const values = cleanFields(kind, fields || {});
    const missing = missingRequired(kind, values);
    if (missing.length) return { data, entry: null, error: `Champ obligatoire : ${missing.join(', ')}` };
    const duplicate = findDuplicate(data, kind, values);
    if (duplicate) {
      return { data, entry: null, duplicate, error: `« ${titleOf(kind, duplicate)} » existe déjà : ouvrez sa fiche plutôt que d'en créer une seconde.` };
    }
    const entry = { id: Schema.newId(Schema.ID_PREFIXES[kind]), ...values, origin: 'auteur' };
    return { data: { ...data, [kind]: [...listOf(data, kind), entry] }, entry, error: null };
  }

  // Modifie les champs décrits ; tout autre champ de la fiche est conservé
  function updateEntry(data, kind, id, fields) {
    if (!KINDS[kind]) return { data, entry: null, error: 'Type de fiche inconnu' };
    const list = [...listOf(data, kind)];
    const index = list.findIndex(e => isObject(e) && e.id === id);
    if (index < 0) return { data, entry: null, error: 'Fiche introuvable' };
    const entry = { ...list[index], ...cleanFields(kind, fields || {}, list[index]), id };
    const missing = missingRequired(kind, entry);
    if (missing.length) return { data, entry: null, error: `Champ obligatoire : ${missing.join(', ')}` };
    const duplicate = findDuplicate(data, kind, entry, id);
    if (duplicate) {
      return { data, entry: null, duplicate, error: `Une autre fiche s'appelle déjà « ${titleOf(kind, duplicate)} ».` };
    }
    list[index] = entry;
    return { data: { ...data, [kind]: list }, entry, error: null };
  }

  // Suppression demandée par l'auteur ; les liens des scènes vers ce personnage restent (signalés)
  function removeEntry(data, kind, id) {
    const list = listOf(data, kind);
    if (!list.some(e => isObject(e) && e.id === id)) return { data, removed: false };
    return { data: { ...data, [kind]: list.filter(e => !(isObject(e) && e.id === id)) }, removed: true };
  }

  // Le rôle suggéré (IA, parseur) devient le rôle, sur décision de l'auteur
  function confirmSuggestedRole(data, id) {
    const list = [...listOf(data, 'characters')];
    const index = list.findIndex(c => isObject(c) && c.id === id);
    if (index < 0 || !list[index].suggestedRole) return { data, changed: false };
    const { suggestedRole, suggestionSource, ...rest } = list[index];
    list[index] = { ...rest, role: suggestedRole };
    return { data: { ...data, characters: list }, changed: true };
  }

  // Champs de la fiche non couverts par le formulaire (affichés en lecture seule)
  const META_FIELDS = new Set(['id', 'origin', 'suggestedRole', 'suggestionSource']);
  function extraFields(kind, entry) {
    if (!isObject(entry)) return [];
    const known = new Set(KINDS[kind].fields.filter(f => isEditable(f, entry[f.key])).map(f => f.key));
    return Object.entries(entry)
      .filter(([key, value]) => !known.has(key) && !META_FIELDS.has(key) &&
        value !== '' && value !== null && value !== undefined && !(Array.isArray(value) && !value.length));
  }

  function search(data, kind, query) {
    const q = normalize(query);
    const list = listOf(data, kind).filter(isObject);
    if (!q) return list;
    return list.filter(e => normalize(JSON.stringify(e)).includes(q));
  }

  return {
    KINDS, identity, titleOf, parseValue, formatValue, isEditable,
    addEntry, updateEntry, removeEntry, confirmSuggestedRole, findDuplicate, extraFields, search
  };
});
