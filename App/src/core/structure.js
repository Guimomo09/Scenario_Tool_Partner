// === Structure : scènes du projet ===
// Une scène porte un titre, un résumé, des personnages (par identifiant), un objectif dramatique,
// un conflit, un changement produit et un statut. Tous les champs peuvent rester vides.
// L'ordre des scènes est l'ordre de la liste ; un déplacement ne change aucun identifiant,
// donc aucun lien (personnages, pages, document) n'est cassé.
// Les fonctions ne modifient jamais le projet reçu : elles renvoient une copie.
// Sans DOM : chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schema'));
  } else {
    root.Structure = factory(root.ProjectSchema);
  }
})(typeof self !== 'undefined' ? self : this, function (Schema) {

  const STATUSES = [
    { id: 'idea', label: 'Idée' },
    { id: 'draft', label: 'Brouillon' },
    { id: 'revised', label: 'Révisée' },
    { id: 'final', label: 'Finale' }
  ];
  const STATUS_IDS = STATUSES.map(s => s.id);
  const TEXT_FIELDS = ['title', 'summary', 'goal', 'conflict', 'change', 'doc', 'heading', 'notes'];
  const LIST_FIELDS = ['characters', 'pages'];

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const scenesOf = (data) => (Array.isArray(data?.scenes) ? data.scenes : []);

  const statusLabel = (id) => (STATUSES.find(s => s.id === id) || STATUSES[0]).label;

  // Garde seulement les champs connus, dans leur forme attendue ; un statut inconnu est ignoré
  function cleanFields(fields) {
    const clean = {};
    if (!isObject(fields)) return clean;
    for (const key of TEXT_FIELDS) {
      if (fields[key] !== undefined) clean[key] = String(fields[key] ?? '');
    }
    for (const key of LIST_FIELDS) {
      if (Array.isArray(fields[key])) {
        clean[key] = [...new Set(fields[key].filter(v => v !== null && v !== undefined && v !== '').map(String))];
      }
    }
    if (STATUS_IDS.includes(fields.status)) clean.status = fields.status;
    return clean;
  }

  function createScene(fields = {}) {
    return {
      id: Schema.newId(Schema.ID_PREFIXES.scenes),
      title: '', summary: '', characters: [], goal: '', conflict: '', change: '', status: 'idea',
      ...cleanFields(fields)
    };
  }

  const withScenes = (data, scenes) => ({ ...data, scenes });

  // Ajoute une scène, à la fin ou après la scène `after`
  function addScene(data, fields = {}, { after = null } = {}) {
    const scene = createScene(fields);
    const list = [...scenesOf(data)];
    const index = after ? list.findIndex(s => s.id === after) : -1;
    list.splice(index >= 0 ? index + 1 : list.length, 0, scene);
    return { data: withScenes(data, list), scene };
  }

  // Modifie les champs connus d'une scène ; ses autres champs sont conservés tels quels
  function updateScene(data, id, fields) {
    const list = [...scenesOf(data)];
    const index = list.findIndex(s => s.id === id);
    if (index < 0) return { data, scene: null, error: 'Scène introuvable' };
    const scene = { ...list[index], ...cleanFields(fields), id };
    list[index] = scene;
    return { data: withScenes(data, list), scene, error: null };
  }

  // Place la scène à la position `toIndex` (bornée) ; les identifiants ne changent pas
  function moveScene(data, id, toIndex) {
    const list = [...scenesOf(data)];
    const from = list.findIndex(s => s.id === id);
    if (from < 0) return { data, moved: false };
    const to = Math.max(0, Math.min(list.length - 1, Number(toIndex) || 0));
    if (to === from) return { data, moved: false };
    const [scene] = list.splice(from, 1);
    list.splice(to, 0, scene);
    return { data: withScenes(data, list), moved: true };
  }

  const moveSceneBy = (data, id, delta) => {
    const from = scenesOf(data).findIndex(s => s.id === id);
    return from < 0 ? { data, moved: false } : moveScene(data, id, from + delta);
  };

  // Suppression demandée par l'auteur : seule cette scène disparaît, rien d'autre n'est touché
  function removeScene(data, id) {
    const list = scenesOf(data);
    if (!list.some(s => s.id === id)) return { data, removed: false };
    return { data: withScenes(data, list.filter(s => s.id !== id)), removed: true };
  }

  // Personnages liés ; un identifiant qui ne correspond plus à aucune fiche est signalé, pas retiré
  function charactersOf(data, scene) {
    const byId = new Map((data.characters || []).filter(isObject).map(c => [String(c.id), c]));
    return (scene.characters || []).map(id => (byId.has(String(id))
      ? { id, name: byId.get(String(id)).name, missing: false }
      : { id, name: null, missing: true }));
  }

  const scenesForCharacter = (data, characterId) =>
    scenesOf(data).filter(s => (s.characters || []).map(String).includes(String(characterId)));

  // Scène liée à une section de document (même document et même titre de section)
  function sceneAt(data, docName, sectionTitle) {
    const heading = normalize(sectionTitle);
    if (!docName || !heading) return null;
    return scenesOf(data).find(s => s.doc === docName && normalize(s.heading) === heading) || null;
  }

  // --- Manga : scène / page / double page ---

  const pagesOf = (data) => (Array.isArray(data?.script) ? data.script.filter(isObject) : []);

  // Regroupe des pages en unités d'affichage. Double page : soit détectée par le parseur
  // (« PAGE 12-13 », une seule entrée), soit marquée par l'auteur (`spread`) sur une page qui
  // s'associe alors à la page suivante (numéro suivant).
  function groupSpreads(pages) {
    const units = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const next = pages[i + 1];
      if (page.isDoublePage) {
        units.push({ spread: true, pages: [page] });
      } else if (page.spread && next && !next.isDoublePage && Number(next.page) === Number(page.page) + 1) {
        units.push({ spread: true, pages: [page, next] });
        i++;
      } else {
        units.push({ spread: false, pages: [page] });
      }
    }
    return units;
  }

  // Marque (ou démarque) une page comme début de double page ; champ d'auteur, gardé par la synchro
  function setPageSpread(data, pageId, spread) {
    const script = pagesOf(data);
    const index = script.findIndex(p => p.id === pageId);
    if (index < 0) return { data, changed: false };
    const list = [...data.script];
    const page = { ...list[index] };
    if (spread) page.spread = true; else delete page.spread;
    list[index] = page;
    return { data: { ...data, script: list }, changed: true };
  }

  // Pages liées à une scène, dans l'ordre du script ; un identifiant inconnu est signalé
  function pagesOfScene(data, scene) {
    const ids = (scene.pages || []).map(String);
    const pages = pagesOf(data).filter(p => ids.includes(String(p.id)));
    const missing = ids.filter(id => !pages.some(p => String(p.id) === id));
    return { pages, missing };
  }

  // Noms des personnages qui parlent ou pensent dans une page (blocs ordonnés du parseur)
  const speakersOfPage = (page) => [...new Set((page._blocks || [])
    .filter(b => b && (b.type === 'dialogue' || b.type === 'thought') && b.speaker)
    .map(b => b.speaker))];

  // Propose une scène par séquence du script dont aucune page n'est déjà rattachée à une scène.
  // Rien n'est ajouté ici : l'auteur confirme, puis chaque proposition passe par addScene.
  function proposeScenesFromSequences(data) {
    const linked = new Set(scenesOf(data).flatMap(s => (s.pages || []).map(String)));
    const characters = (data.characters || []).filter(isObject);
    const bySequence = new Map();
    for (const page of pagesOf(data)) {
      if (page.sequence === undefined || page.sequence === null || !page.id) continue;
      if (!bySequence.has(page.sequence)) bySequence.set(page.sequence, []);
      bySequence.get(page.sequence).push(page);
    }
    const sequences = new Map((data.sequences || []).filter(isObject).map(s => [String(s.number), s]));
    const proposals = [];
    for (const [number, pages] of bySequence) {
      if (pages.some(p => linked.has(String(p.id)))) continue;
      const seq = sequences.get(String(number));
      const names = new Set(pages.flatMap(speakersOfPage).map(normalize));
      proposals.push({
        title: seq?.title ? String(seq.title) : `Séquence ${number}`,
        summary: Array.isArray(seq?._intro) ? seq._intro.map(b => b?.text || '').filter(Boolean).join(' ') : '',
        pages: pages.map(p => p.id),
        characters: characters.filter(c => c.id && names.has(normalize(c.name))).map(c => c.id)
      });
    }
    return proposals;
  }

  // Propose une scène par titre de section (#, ##, ###) d'un document, sauf celles déjà liées
  function proposeScenesFromHeadings(data, docName, text) {
    const existing = new Set(scenesOf(data).filter(s => s.doc === docName).map(s => normalize(s.heading)));
    const proposals = [];
    const seen = new Set();
    for (const line of String(text || '').split(/\r?\n/)) {
      const m = line.match(/^#{1,3}\s+(.+?)\s*#*\s*$/);
      if (!m) continue;
      const key = normalize(m[1]);
      if (!key || existing.has(key) || seen.has(key)) continue;
      seen.add(key);
      proposals.push({ title: m[1], doc: docName, heading: m[1] });
    }
    return proposals;
  }

  return {
    STATUSES, statusLabel, cleanFields, createScene,
    addScene, updateScene, moveScene, moveSceneBy, removeScene,
    charactersOf, scenesForCharacter, sceneAt,
    groupSpreads, setPageSpread, pagesOfScene, speakersOfPage,
    proposeScenesFromSequences, proposeScenesFromHeadings
  };
});
