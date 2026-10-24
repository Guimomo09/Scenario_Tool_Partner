// === Propositions éditoriales du partenaire ===
// Une proposition est distincte du texte de l'auteur : cible stable (document + position + texte
// d'origine exact), source, état avant, version proposée, explication, statut.
// Elle ne s'applique que si le texte d'origine est toujours là, et une seule fois.
// Sans DOM : chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Proposals = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const STATUSES = ['pending', 'accepted', 'rejected', 'variant'];
  const BLOCK_RE = /<proposition(?:\s+type\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/proposition>/gi;

  const randomPart = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const newId = (prefix) => `${prefix}_${randomPart()}`;

  // Retire les retours à la ligne d'encadrement ajoutés autour du contenu d'une balise
  const tagContent = (inner, tag) => {
    const m = inner.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '') : null;
  };

  // Sépare le texte de la réponse et les blocs de proposition ; un bloc incomplet est signalé
  function extractProposals(reply) {
    const proposals = [];
    const problems = [];
    let n = 0;
    const text = String(reply || '').replace(BLOCK_RE, (match, type, inner) => {
      n++;
      const kind = String(type || '').trim().toLowerCase() === 'fait' ? 'fact' : 'replace';
      const explanation = (tagContent(inner, 'explication') || '').trim();
      if (kind === 'fact') {
        const fact = (tagContent(inner, 'fait') || '').trim();
        if (!fact) { problems.push(`Proposition ${n} : fait vide, ignorée.`); return match; }
        proposals.push({ type: 'fact', fact, explanation, index: n });
      } else {
        const before = tagContent(inner, 'avant');
        const after = tagContent(inner, 'apres') ?? tagContent(inner, 'après');
        if (before === null || after === null || !before.trim()) {
          problems.push(`Proposition ${n} : texte d'origine ou nouvelle version manquant, laissée dans la réponse.`);
          return match;
        }
        proposals.push({ type: 'replace', before, after, explanation, index: n });
      }
      return `[Proposition ${n}]`;
    });
    return { text: text.trim(), proposals, problems };
  }

  function occurrences(text, needle) {
    const found = [];
    if (!needle) return found;
    let i = text.indexOf(needle);
    while (i !== -1) {
      found.push(i);
      i = text.indexOf(needle, i + 1);
    }
    return found;
  }

  // Position du texte d'origine : dans la sélection envoyée si possible, sinon occurrence unique
  function locate(text, before, preferred) {
    const value = String(text || '');
    let candidates = occurrences(value, before);
    let needle = before;
    if (!candidates.length && before.trim() !== before) {
      needle = before.trim();
      candidates = occurrences(value, needle);
    }
    if (!candidates.length) return { found: false, reason: 'Le texte d\'origine cité par le partenaire est introuvable dans le document.' };
    if (preferred) {
      const inside = candidates.filter(i => i >= preferred.start && i + needle.length <= preferred.end);
      if (inside.length === 1) return { found: true, start: inside[0], end: inside[0] + needle.length, before: needle };
    }
    if (candidates.length === 1) return { found: true, start: candidates[0], end: candidates[0] + needle.length, before: needle };
    return { found: false, reason: `Le texte d'origine apparaît ${candidates.length} fois dans le document : cible ambiguë.` };
  }

  // Transforme les blocs extraits en propositions ancrées sur le document de la demande
  function createProposals(extracted, { docName, docText, selection, docVersion, messageId, intent, now = new Date().toISOString() }) {
    return extracted.map(p => {
      const base = { id: newId('pr'), type: p.type, explanation: p.explanation, status: 'pending', createdAt: now, source: { messageId, intent, index: p.index } };
      if (p.type === 'fact') return { ...base, fact: p.fact };
      const where = locate(docText, p.before, selection);
      return {
        ...base,
        before: where.found ? where.before : p.before,
        after: p.after,
        target: where.found
          ? { docName, start: where.start, end: where.end, docVersion }
          : { docName, start: null, end: null, docVersion, unanchored: where.reason }
      };
    });
  }

  // Peut-on appliquer maintenant ? Le texte d'origine doit être intact à sa place,
  // ou présent une seule fois ailleurs (il a été déplacé par une modification de l'auteur).
  function checkApplicable(proposal, { docName, text }) {
    if (!proposal || proposal.type !== 'replace') return { ok: false, reason: 'Cette proposition ne modifie pas le texte.' };
    if (proposal.status === 'accepted') return { ok: false, reason: 'Proposition déjà appliquée.' };
    if (proposal.status === 'rejected') return { ok: false, reason: 'Proposition rejetée.' };
    if (proposal.target?.docName !== docName) {
      return { ok: false, reason: `Cette proposition porte sur « ${proposal.target?.docName} », pas sur le document ouvert.`, otherDocument: proposal.target?.docName };
    }
    const value = String(text || '');
    const { start, end } = proposal.target;
    if (Number.isInteger(start) && value.slice(start, end) === proposal.before) {
      return { ok: true, start, end, moved: false };
    }
    const where = locate(value, proposal.before, null);
    if (where.found && where.before === proposal.before) return { ok: true, start: where.start, end: where.end, moved: true };
    return {
      ok: false,
      reason: where.reason && where.reason.includes('fois')
        ? where.reason
        : 'Le passage visé a changé depuis la proposition : elle n\'est pas appliquée. Tu peux la garder comme variante.'
    };
  }

  function applyToText(text, check, after) {
    return text.slice(0, check.start) + after + text.slice(check.end);
  }

  return { STATUSES, newId, extractProposals, locate, createProposals, checkApplicable, applyToText };
});
