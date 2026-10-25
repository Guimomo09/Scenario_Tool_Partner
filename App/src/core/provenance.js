// === Provenance des informations des fiches et propositions à examiner ===
// Chaque champ interprétatif d'une fiche (description, traits, objectifs…) garde son origine
// (auteur, analyse locale, IA, import) et son statut (à vérifier, accepté, rejeté, obsolète) dans
// `entry._prov[champ]`. Un champ sans provenance est « provenance non renseignée / à vérifier » :
// ni validé, ni déclaré faux.
// Une extraction ne remplace jamais une valeur existante : elle crée une proposition (`reviews`)
// que l'auteur accepte ou rejette. Une proposition déjà tranchée n'est jamais recréée.
// Les fonctions ne modifient jamais le projet reçu : elles renvoient une copie.
// Sans DOM : chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schema'));
  } else {
    root.Provenance = factory(root.ProjectSchema);
  }
})(typeof self !== 'undefined' ? self : this, function (Schema) {

  const ORIGIN_LABELS = {
    auteur: 'saisie de l\'auteur',
    parseur: 'analyse locale',
    ia: 'IA',
    import: 'import',
    extraction: 'extraction',
    inconnu: 'provenance non renseignée'
  };
  const STATUS = { pending: 'à vérifier', accepted: 'accepté', rejected: 'rejeté', obsolete: 'obsolète' };
  const REVIEW_STATUS = { open: 'à examiner', accepted: 'accepté', rejected: 'rejeté', obsolete: 'obsolète' };

  // Observations recalculées à chaque analyse (comptes, pages, extraits) : pas des interprétations
  const DERIVED_FIELDS = new Set([
    'dialogueCount', 'thoughtCount', 'firstAppearance', 'appearances', 'keyQuotes', 'coPresence',
    'mentions', 'firstMention', 'sceneCount', 'sourceLine', 'line', 'evidence'
  ]);
  // Suggestions déjà signalées comme telles dans l'interface (complétées seulement si absentes)
  const SUGGESTION_FIELDS = new Set(['suggestedRole', 'suggestionSource']);
  // Identité de la fiche (clé de fusion) et métadonnées : jamais traitées comme des lectures
  const META_KEYS = new Set(['id', 'origin', '_prov', '_origin', '_evidence', 'name', 'title', 'period', 'event', 'page']);

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const listOf = (data, kind) => (Array.isArray(data?.[kind]) ? data[kind] : []);
  const now = () => new Date().toISOString();

  const isInterpretive = (field) =>
    !META_KEYS.has(field) && !DERIVED_FIELDS.has(field) && !SUGGESTION_FIELDS.has(field) && !field.startsWith('_');

  // État d'un champ : provenance enregistrée, sinon déduite de l'origine de la fiche
  function fieldState(entry, field) {
    const prov = isObject(entry?._prov) ? entry._prov[field] : null;
    if (isObject(prov)) return prov;
    if (entry?.origin === 'auteur') return { origin: 'auteur', status: STATUS.accepted };
    return { origin: 'inconnu', status: STATUS.pending, legacy: true };
  }

  // L'auteur a saisi ou validé cette valeur
  const isSettled = (state) => state.origin === 'auteur' || state.status === STATUS.accepted;

  const rejectedValues = (entry, field) => {
    const prov = isObject(entry?._prov) ? entry._prov[field] : null;
    return Array.isArray(prov?.rejected) ? prov.rejected : [];
  };
  const isRejected = (entry, field, value) => rejectedValues(entry, field).some(v => same(v, value));

  function setProv(entry, field, prov) {
    const previous = isObject(entry._prov?.[field]) ? entry._prov[field] : {};
    const next = { ...prov };
    if (previous.rejected?.length && !next.rejected) next.rejected = previous.rejected;
    return { ...entry, _prov: { ...(isObject(entry._prov) ? entry._prov : {}), [field]: next } };
  }

  // Provenance des champs interprétatifs d'un élément nouvellement extrait
  function initProv(item, origin, evidence = {}) {
    let entry = item;
    for (const [field, value] of Object.entries(item)) {
      if (!isInterpretive(field) || isEmpty(value)) continue;
      entry = setProv(entry, field, {
        origin, status: origin === 'auteur' ? STATUS.accepted : STATUS.pending,
        ...(evidence[field] ? { source: evidence[field] } : {})
      });
    }
    return entry;
  }

  // L'auteur vient de saisir ces champs (formulaire de fiche)
  function markAuthored(entry, fields) {
    let next = entry;
    fields.forEach(f => { next = setProv(next, f, { origin: 'auteur', status: STATUS.accepted, at: now() }); });
    return next;
  }

  const reviewKey = (r) => [r.collection, r.targetId, r.field, r.op, JSON.stringify(r.proposed)].join('|');

  // Fusion d'un champ entrant dans une fiche existante. Renvoie la fiche (copie) ; les désaccords
  // deviennent des propositions ajoutées à `ctx.reviews`.
  // ctx : { collection, origin, evidence, reviews }
  function mergeField(entry, field, value, ctx) {
    if (isEmpty(value)) return entry;
    const current = entry[field];

    if (DERIVED_FIELDS.has(field)) return same(current, value) ? entry : { ...entry, [field]: value };
    if (SUGGESTION_FIELDS.has(field)) return isEmpty(current) ? { ...entry, [field]: value } : entry;
    if (!isInterpretive(field)) return entry;

    const source = ctx.evidence?.[field];
    const prov = { origin: ctx.origin, status: STATUS.pending, ...(source ? { source } : {}) };
    const state = fieldState(entry, field);
    const propose = (op, proposed) => ctx.reviews.push({
      collection: ctx.collection, targetId: entry.id, targetName: entry.name || entry.title || entry.event || '',
      field, op, current: current ?? null, proposed, origin: ctx.origin,
      ...(source ? { source } : {}),
      currentOrigin: state.origin, againstAuthor: isSettled(state)
    });

    if (Array.isArray(value)) {
      const fresh = value.filter(v => !isEmpty(v) && !isRejected(entry, field, v));
      if (isEmpty(current)) {
        return fresh.length ? setProv({ ...entry, [field]: fresh }, field, prov) : entry;
      }
      const have = Array.isArray(current) ? current : [current];
      fresh.filter(v => !have.some(h => same(h, v))).forEach(v => propose('add', v));
      return entry;
    }

    if (isRejected(entry, field, value)) return entry;
    if (isEmpty(current)) return setProv({ ...entry, [field]: value }, field, prov);
    if (!same(current, value)) propose('replace', value);
    return entry;
  }

  // Ajoute les propositions nouvelles (une proposition déjà connue, même tranchée, n'est pas recréée)
  function appendReviews(existing, incoming) {
    const list = [...(existing || [])];
    const known = new Set(list.filter(isObject).map(reviewKey));
    let added = 0;
    for (const r of incoming) {
      const key = reviewKey(r);
      if (known.has(key)) continue;
      known.add(key);
      list.push({ id: Schema.newId('rv'), ...r, status: REVIEW_STATUS.open, createdAt: now() });
      added++;
    }
    return { list, added };
  }

  const openReviews = (data, collection = null, targetId = null) =>
    listOf(data, 'reviews').filter(r => isObject(r) && r.status === REVIEW_STATUS.open &&
      (!collection || r.collection === collection) && (!targetId || r.targetId === targetId));

  function updateTarget(data, collection, targetId, fn) {
    const list = [...listOf(data, collection)];
    const index = list.findIndex(e => isObject(e) && e.id === targetId);
    if (index < 0) return null;
    list[index] = fn(list[index]);
    return { ...data, [collection]: list };
  }

  function setReviewStatus(data, reviewId, status) {
    return {
      ...data,
      reviews: listOf(data, 'reviews').map(r => (isObject(r) && r.id === reviewId ? { ...r, status, decidedAt: now() } : r))
    };
  }

  // Accepter : la valeur proposée devient la valeur de la fiche, marquée acceptée
  function acceptReview(data, reviewId) {
    const review = listOf(data, 'reviews').find(r => isObject(r) && r.id === reviewId);
    if (!review || review.status !== REVIEW_STATUS.open) return { data, error: 'Proposition introuvable ou déjà traitée' };
    const target = listOf(data, review.collection).find(e => isObject(e) && e.id === review.targetId);
    if (!target) return { data, error: 'La fiche concernée n\'existe plus' };
    if (review.op === 'replace' && !same(target[review.field] ?? null, review.current)) {
      return { data: setReviewStatus(data, reviewId, REVIEW_STATUS.obsolete), error: 'La valeur a changé depuis la proposition : proposition marquée obsolète' };
    }
    const next = updateTarget(data, review.collection, review.targetId, (entry) => {
      const value = review.op === 'add'
        ? [...(Array.isArray(entry[review.field]) ? entry[review.field] : isEmpty(entry[review.field]) ? [] : [entry[review.field]]), review.proposed]
        : review.proposed;
      // La valeur remplacée est écartée : une analyse identique ne la reproposera pas
      const rejected = review.op === 'replace' && !isEmpty(review.current) && !isRejected(entry, review.field, review.current)
        ? [...rejectedValues(entry, review.field), review.current] : rejectedValues(entry, review.field);
      return setProv({ ...entry, [review.field]: value }, review.field, {
        origin: review.origin, status: STATUS.accepted, at: now(),
        ...(review.source ? { source: review.source } : {}), ...(rejected.length ? { rejected } : {})
      });
    });
    return { data: setReviewStatus(next, reviewId, REVIEW_STATUS.accepted), error: null };
  }

  // Rejeter : la fiche reste telle quelle et la valeur proposée ne sera plus reproposée
  function rejectReview(data, reviewId) {
    const review = listOf(data, 'reviews').find(r => isObject(r) && r.id === reviewId);
    if (!review || review.status !== REVIEW_STATUS.open) return { data, error: 'Proposition introuvable ou déjà traitée' };
    const next = updateTarget(data, review.collection, review.targetId, (entry) => {
      const state = fieldState(entry, review.field);
      const rejected = [...rejectedValues(entry, review.field), review.proposed];
      return { ...entry, _prov: { ...(isObject(entry._prov) ? entry._prov : {}), [review.field]: { ...state, legacy: undefined, rejected } } };
    }) || data;
    return { data: setReviewStatus(next, reviewId, REVIEW_STATUS.rejected), error: null };
  }

  // L'auteur valide la valeur actuelle d'un champ (sans la modifier)
  function validateField(data, collection, id, field) {
    const next = updateTarget(data, collection, id, (entry) => {
      const state = fieldState(entry, field);
      return setProv(entry, field, { origin: state.origin, status: STATUS.accepted, at: now(), ...(state.source ? { source: state.source } : {}) });
    });
    return next ? { data: next, error: null } : { data, error: 'Fiche introuvable' };
  }

  // L'auteur conteste la valeur actuelle : elle est retirée de la fiche et mémorisée comme rejetée,
  // pour qu'une prochaine analyse ne la réintroduise pas (Ctrl+Z la rétablit)
  function rejectField(data, collection, id, field) {
    const next = updateTarget(data, collection, id, (entry) => {
      if (isEmpty(entry[field])) return entry;
      const values = Array.isArray(entry[field]) ? entry[field] : [entry[field]];
      const rejected = [...rejectedValues(entry, field), ...values.filter(v => !isRejected(entry, field, v))];
      const { [field]: _removed, ...rest } = entry;
      return { ...rest, _prov: { ...(isObject(entry._prov) ? entry._prov : {}), [field]: { origin: 'auteur', status: STATUS.rejected, at: now(), rejected } } };
    });
    return next ? { data: next, error: null } : { data, error: 'Fiche introuvable' };
  }

  // Libellé court pour l'interface : null si rien à signaler (saisie ou validation de l'auteur)
  function describeState(state) {
    if (isSettled(state)) return null;
    const origin = ORIGIN_LABELS[state.origin] || state.origin;
    return state.legacy ? `${origin} · à vérifier` : `${origin} · ${state.status}`;
  }

  return {
    ORIGIN_LABELS, STATUS, REVIEW_STATUS, DERIVED_FIELDS,
    isInterpretive, fieldState, isSettled, isRejected, initProv, markAuthored, mergeField,
    appendReviews, openReviews, acceptReview, rejectReview, validateField, rejectField, describeState, reviewKey
  };
});
