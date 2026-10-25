// === Affirmations sur le récit ===
// Une affirmation est une lecture rattachée à un sujet (personnage, lieu, relation, scène, récit),
// avec sa nature (événement montré, parole rapportée, croyance, interprétation, intention d'auteur,
// proposition nouvelle), son statut (à vérifier, accepté, rejeté, obsolète), son origine et sa source
// exacte (document, version, unité, lignes, extrait). Une citation doit exister dans le texte réel ;
// sa présence ne prouve pas que l'interprétation soit juste, d'où le statut « à vérifier ».
// Une parole ou une pensée n'est jamais un fait établi : un personnage peut mentir, se tromper,
// citer quelqu'un ou parler d'un projet qui ne se réalisera pas.
// Sans DOM : chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./schema'), require('./provenance'));
  } else {
    root.Claims = factory(root.ProjectSchema, root.Provenance);
  }
})(typeof self !== 'undefined' ? self : this, function (Schema, Provenance) {

  const NATURES = {
    montre: 'événement montré',
    parole: 'parole rapportée',
    croyance: 'croyance',
    interpretation: 'interprétation',
    intention: 'intention d\'auteur',
    proposition: 'proposition nouvelle'
  };
  const SUBJECT_KINDS = {
    personnage: 'Personnage', lieu: 'Lieu', groupe: 'Groupe', objet: 'Objet', systeme: 'Système',
    relation: 'Relation', scene: 'Scène', recit: 'Récit'
  };
  const ASPECTS = {
    objectif: 'objectif', motivation: 'motivation', peur: 'peur', valeur: 'valeur',
    connaissance: 'connaissance', relation: 'relation', opposition: 'opposition', evenement: 'événement',
    cause: 'cause', revelation: 'révélation', question: 'question ouverte', autre: 'autre'
  };
  const STATUS = Provenance.STATUS;
  const LIMITS = { content: 600, quote: 500, justification: 600, name: 80 };

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const normName = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const now = () => new Date().toISOString();

  // Forme comparable d'un texte : emphase, puces de réplique, guillemets et espaces neutralisés
  function normText(s) {
    return String(s ?? '')
      .replace(/\*+/g, '')
      .replace(/^\s*(?:[-–—]|#{1,6})\s+/gm, '')
      .replace(/[’‘`]/g, '\'')
      .replace(/[“”«»]/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Cherche un extrait dans une unité ; renvoie les lignes (numéros du document) qui le contiennent
  function locateQuote(unit, quote) {
    const wanted = normText(quote).replace(/^"+|"+$/g, '').trim();
    if (wanted.length < 4) return null;
    let joined = '';
    const starts = [];
    unit.lines.forEach((line) => {
      const n = normText(line);
      starts.push(joined.length + (joined ? 1 : 0));
      joined = joined ? `${joined} ${n}` : n;
    });
    const at = joined.indexOf(wanted);
    if (at < 0) return null;
    const lineAt = (offset) => {
      let i = 0;
      while (i + 1 < starts.length && starts[i + 1] <= offset) i++;
      return unit.startLine + i;
    };
    return { from: lineAt(at), to: lineAt(at + wanted.length - 1) };
  }

  const nameOf = (v) => str(isObject(v) ? v.name : v, LIMITS.name);
  const keyOf = (c) => [c.subject.kind, normName(c.subject.name), normName(c.object?.name), c.nature, normText(c.content)].join('|');

  // Valide une affirmation reçue (IA ou auteur) dans le contexte d'une unité.
  // ctx : { unit, origin, sourceRole }. Renvoie { claim, notice } ou { error }.
  function validateClaim(raw, ctx) {
    if (!isObject(raw)) return { error: 'affirmation non structurée' };
    const origin = ctx.origin || 'ia';
    const content = str(raw.content, LIMITS.content);
    if (!content) return { error: 'contenu vide' };
    let nature = str(raw.nature, 20).toLowerCase();
    if (!NATURES[nature]) return { error: `nature inconnue (${nature || 'absente'})`, content };
    // Les intentions de l'auteur ne sont jamais inventées par une analyse
    if (nature === 'intention' && origin !== 'auteur') return { error: 'une intention d\'auteur ne peut venir que de l\'auteur', content };
    const subjectRaw = isObject(raw.subject) ? raw.subject : { name: raw.subject };
    const kind = str(subjectRaw.kind, 20).toLowerCase();
    const subject = { kind: SUBJECT_KINDS[kind] ? kind : 'recit', name: nameOf(subjectRaw) };
    if (!subject.name && subject.kind !== 'recit') return { error: 'sujet absent', content };
    if (!subject.name) subject.name = 'Récit';
    const object = nameOf(raw.object) ? { name: nameOf(raw.object) } : null;
    if (subject.kind === 'relation' && !object) return { error: 'relation sans second personnage', content };
    const aspect = ASPECTS[str(raw.aspect, 20).toLowerCase()] ? str(raw.aspect, 20).toLowerCase() : 'autre';
    const speaker = nameOf(raw.speaker);
    let notice = null;

    const unit = ctx.unit;
    let source = null;
    const quote = str(raw.quote, LIMITS.quote);
    if (quote || origin !== 'auteur') {
      if (!quote) return { error: 'aucune citation du texte', content };
      const found = unit ? locateQuote(unit, quote) : null;
      if (!found) return { error: 'citation introuvable dans le texte', content };
      source = {
        document: unit.document, docVersion: unit.docVersion, unitId: unit.id, unitVersion: unit.version,
        unitLabel: unit.label, lines: [found.from, found.to], quote,
        ...(unit.sourceRole || ctx.sourceRole ? { role: unit.sourceRole || ctx.sourceRole } : {})
      };
      // Une réplique ou une pensée ne montre pas un événement : sa nature est imposée par le texte
      const said = [];
      for (let l = found.from; l <= found.to; l++) {
        const info = unit.lineInfo?.[l];
        if (info && (info.type === 'dialogue' || info.type === 'thought')) said.push(info);
      }
      if (said.length && said.length === found.to - found.from + 1) {
        const expected = said.every(i => i.type === 'thought') ? 'croyance' : 'parole';
        if (nature === 'montre') {
          notice = `requalifiée en ${NATURES[expected]} : la citation est ${expected === 'parole' ? 'une réplique' : 'une pensée'}, pas une action`;
          nature = expected;
        }
        const realSpeaker = said[0].speaker;
        if ((nature === 'parole' || nature === 'croyance') && speaker && realSpeaker &&
            normName(speaker) !== normName(realSpeaker) && !normName(realSpeaker).startsWith(normName(speaker))) {
          return { error: `citation attribuée à ${speaker}, mais dite par ${realSpeaker}`, content };
        }
      }
    }
    if ((nature === 'parole' || nature === 'croyance') && !speaker) {
      const guessed = source && unit?.lineInfo?.[source.lines[0]]?.speaker;
      if (!guessed) return { error: `${NATURES[nature]} sans personnage qui la porte`, content };
    }

    const claim = {
      id: Schema.newId('cl'),
      subject,
      ...(object ? { object } : {}),
      nature,
      aspect,
      content,
      ...(nature === 'parole' || nature === 'croyance'
        ? { speaker: speaker || unit.lineInfo[source.lines[0]].speaker } : {}),
      ...(str(raw.justification, LIMITS.justification) ? { justification: str(raw.justification, LIMITS.justification) } : {}),
      ...(str(raw.alternative, LIMITS.justification) ? { alternative: str(raw.alternative, LIMITS.justification) } : {}),
      origin,
      status: origin === 'auteur' ? STATUS.accepted : STATUS.pending,
      ...(source ? { source } : {}),
      // Point du récit à partir duquel l'affirmation vaut (ordre de lecture)
      ...(unit ? { period: { unitId: unit.id, order: unit.order, label: unit.label } } : {}),
      createdAt: now()
    };
    return { claim, notice };
  }

  // Ajoute des affirmations sans jamais recréer une affirmation rejetée ni toucher à une décision
  // de l'auteur. Une affirmation retrouvée dans une nouvelle version de sa source est réactivée.
  function mergeClaims(existing, incoming) {
    const list = [...(existing || [])];
    const index = new Map();
    list.forEach((c, i) => { if (isObject(c) && c.subject) index.set(keyOf(c), i); });
    let added = 0;
    let refreshed = 0;
    for (const claim of incoming) {
      const key = keyOf(claim);
      if (!index.has(key)) {
        index.set(key, list.length);
        list.push(claim);
        added++;
        continue;
      }
      const i = index.get(key);
      const current = list[i];
      if (current.status === STATUS.rejected) continue;
      if (current.status === STATUS.accepted) {
        // Décision gardée ; la source est mise à jour si elle avait changé
        if (current.sourceChanged && claim.source) {
          const { sourceChanged, ...rest } = current;
          list[i] = { ...rest, source: claim.source, period: claim.period };
          refreshed++;
        }
        continue;
      }
      if (current.status === STATUS.obsolete || current.source?.unitVersion !== claim.source?.unitVersion) {
        list[i] = { ...current, status: STATUS.pending, source: claim.source, period: claim.period, obsoleteReason: undefined };
        refreshed++;
      }
    }
    return { list, added, refreshed };
  }

  // Une source modifiée ou retirée : les lectures non tranchées deviennent obsolètes, les décisions
  // de l'auteur restent mais sont signalées (conflit possible avec le nouveau texte).
  // current : Map unitId → version actuelle (unités des sources retenues)
  function invalidate(list, current) {
    let obsolete = 0;
    let flagged = 0;
    const next = (list || []).map(c => {
      const unitId = c?.source?.unitId;
      if (!unitId) return c;
      const version = current.get(unitId);
      if (version === c.source.unitVersion) return c;
      const reason = version === undefined ? 'source retirée ou découpée autrement' : 'texte source modifié';
      if (c.status === STATUS.pending) {
        obsolete++;
        return { ...c, status: STATUS.obsolete, obsoleteReason: reason };
      }
      if (c.status === STATUS.accepted && !c.sourceChanged) {
        flagged++;
        return { ...c, sourceChanged: reason };
      }
      return c;
    });
    return { list: next, obsolete, flagged };
  }

  function setStatus(list, id, status) {
    return (list || []).map(c => (c?.id === id ? { ...c, status, decidedAt: now(), ...(status === STATUS.accepted ? { sourceChanged: undefined } : {}) } : c));
  }

  // Correction de l'auteur : l'ancienne lecture est rejetée (ne reviendra pas), la nouvelle est
  // une saisie de l'auteur qui garde la source consultée pour référence
  function correct(list, id, content, nature = null) {
    const old = (list || []).find(c => c?.id === id);
    const text = str(content, LIMITS.content);
    if (!old || !text) return { list, error: !old ? 'Affirmation introuvable' : 'Texte vide' };
    const fixed = {
      ...old, id: Schema.newId('cl'), content: text, nature: NATURES[nature] ? nature : old.nature,
      origin: 'auteur', status: STATUS.accepted, correctionOf: old.id, createdAt: now(),
      justification: undefined, alternative: undefined, sourceChanged: undefined, obsoleteReason: undefined
    };
    return { list: [...setStatus(list, id, STATUS.rejected), fixed], claim: fixed, error: null };
  }

  // Formulation prudente pour l'affichage et le contexte du partenaire
  function describe(c) {
    // Une lecture déjà formulée au nom du personnage (« Lina dit que… ») n'est pas préfixée deux fois
    const said = /^(dit|pense|croit|affirme|déclare|annonce|prétend|répond|explique|crie|murmure|demande|avoue|se dit)(?![a-zà-ÿ])/;
    const voiced = c.speaker && normText(c.content).startsWith(`${normText(c.speaker)} `) &&
      said.test(normText(c.content).slice(normText(c.speaker).length + 1));
    if (c.nature === 'parole') return voiced ? c.content : `${c.speaker} dit : ${c.content}`;
    if (c.nature === 'croyance') return voiced ? c.content : `${c.speaker} pense : ${c.content}`;
    if (c.nature === 'interpretation') return `Lecture possible : ${c.content}`;
    return c.content;
  }

  return { NATURES, SUBJECT_KINDS, ASPECTS, normText, locateQuote, validateClaim, mergeClaims, invalidate, setStatus, correct, describe, keyOf };
});
