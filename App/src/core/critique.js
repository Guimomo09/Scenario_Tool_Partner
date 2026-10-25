// === Critique fondée sur les sources ===
// Une remarque du partenaire est un bloc <remarque> séparé du texte : nature (erreur factuelle,
// lisibilité probable, préférence esthétique, ambiguïté, question), constat, passages cités,
// raisonnement, effet probable sur le lecteur, pistes compatibles avec l'intention, question.
// Chaque passage cité est recherché dans le contexte réellement envoyé : une remarque sans preuve
// retrouvée est signalée comme non étayée. Un passage que l'auteur a marqué comme ambiguïté
// volontaire n'est pas présenté comme un défaut. La critique peut s'abstenir : c'est une réponse valable.
// Sans DOM : chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./claims'));
  } else {
    root.Critique = factory(root.Claims);
  }
})(typeof self !== 'undefined' ? self : this, function (Claims) {

  const NATURES = {
    erreur: 'Erreur factuelle',
    lisibilite: 'Lisibilité probable',
    preference: 'Préférence esthétique',
    ambiguite: 'Ambiguïté (peut-être voulue)',
    question: 'Question'
  };
  // Intentions de travail qui demandent une critique structurée
  const CRITIQUE_INTENTS = new Set(['structurer', 'reviser', 'coherence']);
  const BLOCK_RE = /<remarque(?:\s+nature\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/remarque>/gi;
  const MAX_PASSAGES = 4;

  const randomPart = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const tag = (inner, name) => {
    const m = inner.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return m ? m[1].trim() : '';
  };
  const tags = (inner, name) => [...inner.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'gi'))]
    .map(m => m[1].trim()).filter(Boolean);
  // Passage comparable : guillemets d'encadrement et points de suspension de coupe retirés
  const comparable = (s) => Claims.normText(s).replace(/^["']+|["']+$/g, '').replace(/^(?:\[?…\]?|\.\.\.)\s*|\s*(?:\[?…\]?|\.\.\.)$/g, '').trim();

  const INSTRUCTIONS = [
    'Critique (structure, révision, cohérence) :',
    '- Commence par rappeler en une ou deux phrases l\'intention connue de l\'auteur (bloc <intentions>) et le périmètre réellement consulté (bloc <perimetre>). Ne prétends pas avoir lu ce qui n\'y figure pas.',
    '- Pour chaque point important, ajoute un bloc :',
    '<remarque nature="erreur|lisibilite|preference|ambiguite|question">',
    '<constat>ce que tu observes, en une phrase</constat>',
    '<passage>extrait copié mot pour mot du contexte fourni (1 à 3 blocs passage)</passage>',
    '<raisonnement>ce qui relie ces passages à ton constat</raisonnement>',
    '<effet>effet probable sur le lecteur, avec prudence</effet>',
    '<pistes>une ou deux corrections compatibles avec l\'intention, et leurs compromis</pistes>',
    '<question>question ciblée si plusieurs lectures restent plausibles</question>',
    '</remarque>',
    '- erreur = contradiction factuelle entre sources ; lisibilite = risque probable que le lecteur ne comprenne pas ; preference = goût, discutable ; ambiguite = lecture ouverte qui peut être voulue ; question = tu ne peux pas trancher.',
    '- Une ambiguïté déclarée volontaire par l\'auteur, un silence ou une scène calme ne sont pas des défauts. Une relation qui change au fil du récit n\'est pas une incohérence.',
    '- Juge une décision d\'un personnage avec ce qu\'il sait à ce point du récit (bloc <connaissances>), pas avec une révélation ultérieure.',
    '- Une lecture « à vérifier » n\'est pas un fait ; une parole ou une pensée n\'est pas un événement.',
    '- Pas de diagnostic générique (« manque de conflit », « enjeu insuffisant », « personnage inutile ») sans passage du projet qui le montre. Ne deviens pas négatif pour paraître critique : s\'il n\'y a rien d\'important, dis-le.',
    '- Si les sources ne permettent pas de répondre (qui veut quoi, ce qui précède), dis-le clairement et pose une question précise au lieu de conclure.',
    '- Les choix maintenus par l\'auteur (bloc <decisions>) ne sont pas à reproposer comme des défauts.'
  ].join('\n');

  // Sépare le texte de la réponse et les remarques ; un bloc sans constat est laissé dans le texte
  function extractRemarks(reply) {
    const remarks = [];
    const problems = [];
    let n = 0;
    const text = String(reply || '').replace(BLOCK_RE, (match, nature, inner) => {
      n++;
      const constat = tag(inner, 'constat');
      if (!constat) { problems.push(`Remarque ${n} : constat absent, laissée dans la réponse.`); return match; }
      const key = String(nature || '').trim().toLowerCase();
      remarks.push({
        id: `rm_${randomPart()}`, index: n,
        nature: NATURES[key] ? key : 'question',
        ...(NATURES[key] ? {} : { natureGiven: key || 'absente' }),
        constat,
        passages: tags(inner, 'passage').slice(0, MAX_PASSAGES).map(p => ({ text: p })),
        raisonnement: tag(inner, 'raisonnement'),
        effet: tag(inner, 'effet'),
        pistes: tag(inner, 'pistes'),
        question: tag(inner, 'question')
      });
      return `[Remarque ${n}]`;
    });
    return { text: text.trim(), remarks, problems };
  }

  // Passages vérifiés contre les éléments de contexte envoyés (label + texte) ; ambiguïtés
  // volontaires ancrées sur un passage repérées. Ne juge pas la justesse du raisonnement.
  function checkRemarks(remarks, { sources = [], intentions = [] } = {}) {
    const pool = sources.filter(s => s && s.text).map(s => ({ label: s.label, text: comparable(s.text) }));
    const anchored = intentions.filter(i => i && i.kind === 'ambiguite' && i.quote && comparable(i.quote).length >= 4);
    return remarks.map(r => {
      const passages = r.passages.map(p => {
        const wanted = comparable(p.text);
        const hit = wanted.length >= 4 ? pool.find(s => s.text.includes(wanted)) : null;
        return { ...p, found: !!hit, ...(hit ? { where: hit.label } : {}) };
      });
      const notes = [];
      const found = passages.filter(p => p.found).length;
      const unsupported = r.nature !== 'question' && found === 0;
      if (unsupported) notes.push(passages.length ? 'Passage cité introuvable dans le contexte envoyé : remarque non étayée.' : 'Aucun passage cité : remarque non étayée.');
      else if (found < passages.length) notes.push(`${passages.length - found} passage(s) cité(s) introuvable(s) dans le contexte envoyé.`);
      const overlapping = anchored.filter(i => {
        const q = comparable(i.quote);
        return passages.some(p => { const t = comparable(p.text); return t.length >= 4 && (q.includes(t) || t.includes(q)); });
      });
      const onAmbiguity = overlapping.length ? overlapping.map(i => i.text) : null;
      if (onAmbiguity && (r.nature === 'erreur' || r.nature === 'lisibilite')) {
        notes.push('Ce passage est marqué comme ambiguïté volontaire : à lire comme une question, pas comme un défaut.');
      }
      return { ...r, passages, unsupported, ...(onAmbiguity ? { onAmbiguity } : {}), notes };
    });
  }

  // Résumé d'une remarque tranchée par l'auteur, pour les demandes suivantes
  function decisionText(remark, verdict) {
    const where = remark.passages?.find(p => p.found)?.text;
    const base = `${NATURES[remark.nature] || 'Remarque'} : ${remark.constat}${where ? ` (passage : « ${where.slice(0, 160)} »)` : ''}`;
    return verdict === 'maintenu' ? `Choix maintenu par l'auteur — ${base}` : `Remarque retenue par l'auteur, pas encore traitée dans le texte — ${base}`;
  }

  return { NATURES, CRITIQUE_INTENTS, INSTRUCTIONS, extractRemarks, checkRemarks, decisionText };
});
