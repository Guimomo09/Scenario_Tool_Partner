// === Parseur de script manga sans perte ===
// Le résultat est un index dérivé du texte (_NOTES.md), jamais une nouvelle source de vérité :
// chaque ligne non vide est conservée (champ `raw`, numéro de ligne), dans son ordre d'origine.
// Les lignes non reconnues deviennent des blocs « unknown » au lieu d'être ignorées.
// Aucun alias n'est fusionné ("Ari" ≠ "Ari Rutoru") et les rôles ne sont que des suggestions.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MangaParser = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const SEQUENCE_RE = /^s[ée]quence\s*(\d+)\b\s*[:.\-–—]?\s*(.*)$/i;
  // "Page 3", "Pages 12-13", "Double page 40-41", "Page/double page 68-69", "Page 3 : titre"
  const PAGE_RE = /^(double\s+)?(?:pages?\s*\/\s*)?(double\s+)?pages?\s*(\d+)(?:\s*[-–]\s*(\d+))?\b\s*[:.\-–—]?\s*(.*)$/i;
  const NAME = "[A-ZÀ-Ÿ][a-zà-ÿ'’-]*(?:\\s+[A-ZÀ-Ÿa-zà-ÿ'’-]+){0,2}";
  const SPEAKER_RE = new RegExp(`^(${NAME})(?:\\s*\\(([^)]+)\\))?\\s*[:：]\\s*(.*)$`);
  // Nom seul sur sa ligne ("Ari", "Ari (pensée)"), reconnu seulement si une réplique à tiret suit
  const BARE_SPEAKER_RE = new RegExp(`^(${NAME})(?:\\s*\\(([^)]+)\\))?$`);
  const PHRASE_WORDS = /\b(et|ou|dans|sur|pour|avec|est|sont|ont|fait|va|vont|se|ils|elles|il|elle|un|une|le|la|les)\b/i;
  const THOUGHT_MODIFIER = /pens[ée]e|voix[\s-]?off|\boff\b/i;
  const DASH_RE = /^[-–—]\s*(.+)$/;
  const QUOTED_RE = /^["«“](.+?)["»”]$/;
  const FIGURANTS = ['présentateur', 'technicien', 'majordome', 'serveur', 'garde', 'soldat'];

  const cleanName = (name) => name.trim().replace(/\s+/g, ' ');

  function isMangaScript(content) {
    const hasPages = /^\s*(?:double\s+)?pages?\s*\d+/im.test(content);
    const hasSequences = /^\s*s[ée]quence\s*\d+/im.test(content);
    const hasDialogues = new RegExp(`^\\s*${NAME}\\s*(?:\\([^)]*\\))?\\s*[:：]`, 'm').test(content) || /^\s*[-–—][^-]/m.test(content);
    return hasPages && (hasSequences || hasDialogues);
  }

  function parse(content) {
    const result = { preamble: [], sequences: [], pages: [], characters: new Map(), warnings: [] };
    const lines = String(content ?? '').split(/\r?\n/);
    const pagesByNumber = new Map();
    // Ligne non vide suivante de chaque ligne (pour reconnaître un nom seul suivi d'une réplique)
    const nextNonEmpty = new Array(lines.length).fill(null);
    for (let i = lines.length - 2, next = null; i >= 0; i--) {
      if (lines[i + 1].trim()) next = lines[i + 1].trim();
      nextNonEmpty[i] = next;
    }

    let sequence = null;
    let page = null;
    let speaker = null;      // { name, thought }
    let pendingSpeaker = null; // ligne "Nom :" seule, en attente de sa réplique

    // Les blocs vont dans la page ouverte, sinon dans l'introduction de la séquence, sinon en préambule
    const target = () => (page ? page.blocks : sequence ? sequence.intro : result.preamble);

    const flushPendingSpeaker = () => {
      if (!pendingSpeaker) return;
      target().push({ type: 'unknown', text: pendingSpeaker.raw, raw: pendingSpeaker.raw, line: pendingSpeaker.line });
      pendingSpeaker = null;
    };

    const registerCharacter = (name, thought) => {
      if (!result.characters.has(name)) {
        result.characters.set(name, { name, dialogueCount: 0, thoughtCount: 0, firstAppearance: page ? page.number : null });
      }
      const character = result.characters.get(name);
      if (thought) character.thoughtCount++; else character.dialogueCount++;
    };

    const pushLine = (type, text, raw, lineNumber, who = null) => {
      const block = { type, text, raw, line: lineNumber };
      if (who) {
        block.speaker = who.name;
        registerCharacter(who.name, who.thought);
      }
      if (pendingSpeaker && who) {
        block.raw = `${pendingSpeaker.raw}\n${raw}`;
        block.line = pendingSpeaker.line;
        pendingSpeaker = null;
      }
      target().push(block);
    };

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const trimmed = line.trim();
      if (!trimmed) return;

      const seqMatch = trimmed.match(SEQUENCE_RE);
      if (seqMatch) {
        flushPendingSpeaker();
        // Une nouvelle séquence ferme la page en cours : elle reste dans sa séquence d'origine
        page = null;
        speaker = null;
        sequence = { number: parseInt(seqMatch[1], 10), title: trimmed, label: seqMatch[2].trim(), line: lineNumber, pages: [], intro: [] };
        result.sequences.push(sequence);
        return;
      }

      const pageMatch = trimmed.match(PAGE_RE);
      if (pageMatch) {
        flushPendingSpeaker();
        speaker = null;
        const start = parseInt(pageMatch[3], 10);
        const end = pageMatch[4] ? parseInt(pageMatch[4], 10) : null;
        const isDouble = !!(pageMatch[1] || pageMatch[2]) || (end !== null && end > start);
        const header = { type: 'header', text: pageMatch[5].trim(), raw: trimmed, line: lineNumber };

        if (pagesByNumber.has(start)) {
          // Page répétée : la suite est ajoutée à la page existante, rien n'est écrasé
          page = pagesByNumber.get(start);
          result.warnings.push(`La page ${start} apparaît plusieurs fois (lignes ${page.line} et ${lineNumber}) : contenus réunis dans l'ordre.`);
          page.blocks.push(header);
        } else {
          page = {
            number: start,
            endNumber: end !== null && end > start ? end : null,
            isDoublePage: isDouble,
            sequence: sequence ? sequence.number : null,
            heading: header.text,
            line: lineNumber,
            blocks: [header]
          };
          pagesByNumber.set(start, page);
          result.pages.push(page);
          if (sequence) sequence.pages.push(start);
        }
        return;
      }

      let speakerMatch = trimmed.match(SPEAKER_RE);
      if (!speakerMatch) {
        const bare = trimmed.match(BARE_SPEAKER_RE);
        const next = nextNonEmpty[index];
        if (bare && next && DASH_RE.test(next)) speakerMatch = [trimmed, bare[1], bare[2], ''];
      }
      if (speakerMatch) {
        const name = cleanName(speakerMatch[1]);
        const isPhrase = name.split(' ').length > 3 || PHRASE_WORDS.test(name);
        if (!isPhrase) {
          flushPendingSpeaker();
          speaker = { name, thought: THOUGHT_MODIFIER.test(speakerMatch[2] || '') };
          const text = speakerMatch[3].trim();
          if (text) {
            pushLine(speaker.thought ? 'thought' : 'dialogue', text, trimmed, lineNumber, speaker);
          } else {
            pendingSpeaker = { raw: trimmed, line: lineNumber };
          }
          return;
        }
      }

      const dashMatch = trimmed.match(DASH_RE);
      const quotedMatch = trimmed.match(QUOTED_RE);
      if ((dashMatch || quotedMatch) && speaker) {
        const text = (dashMatch ? dashMatch[1] : quotedMatch[1]).trim();
        pushLine(speaker.thought ? 'thought' : 'dialogue', text, trimmed, lineNumber, speaker);
        return;
      }

      flushPendingSpeaker();
      // Indication scénique entre parenthèses : ne coupe pas la réplique en cours
      if (/^\(.+\)$/.test(trimmed)) {
        pushLine('indication', trimmed.slice(1, -1).trim(), trimmed, lineNumber);
        return;
      }
      // Réplique sans locuteur identifiable, parenthèse ouverte… : conservée telle quelle
      if (dashMatch || quotedMatch || trimmed.startsWith('(')) {
        pushLine('unknown', trimmed, trimmed, lineNumber);
        return;
      }
      pushLine('action', trimmed, trimmed, lineNumber);
      speaker = null;
    });
    flushPendingSpeaker();

    // Vues dérivées pour les analyses existantes (l'ordre commun reste dans `blocks`)
    for (const p of result.pages) {
      p.actions = p.blocks.filter(b => b.type === 'action' || b.type === 'indication')
        .map(b => ({ type: b.type, text: b.text }));
      p.dialogues = p.blocks.filter(b => b.type === 'dialogue').map(b => ({ speaker: b.speaker, text: b.text }));
      p.thoughts = p.blocks.filter(b => b.type === 'thought').map(b => ({ speaker: b.speaker, text: b.text }));
    }
    for (const character of result.characters.values()) {
      character.suggestion = suggestRole(character);
    }
    return result;
  }

  // Suggestion de rôle fondée uniquement sur les répliques du personnage lui-même
  function suggestRole(character) {
    if (FIGURANTS.includes(character.name.toLowerCase())) {
      return { role: 'Figurant', evidence: 'nom de fonction générique' };
    }
    if (character.thoughtCount >= 2) {
      return { role: 'Point de vue', evidence: `${character.thoughtCount} pensées intérieures` };
    }
    return null;
  }

  // Noms dont l'un prolonge l'autre ("Ari" / "Ari Rutoru") : à confirmer par l'auteur
  function aliasCandidates(names) {
    const list = [...names];
    const pairs = [];
    for (const short of list) {
      for (const long of list) {
        if (long !== short && long.toLowerCase().startsWith(short.toLowerCase() + ' ')) pairs.push({ short, long });
      }
    }
    return pairs;
  }

  // Reconstitue les lignes non vides du texte à partir du résultat (contrôle de non-perte)
  function sourceLines(result) {
    const all = [
      ...result.preamble,
      ...result.sequences.flatMap(s => [{ raw: s.title, line: s.line }, ...s.intro]),
      ...result.pages.flatMap(p => p.blocks)
    ];
    return all.sort((a, b) => a.line - b.line).flatMap(b => b.raw.split('\n'));
  }

  return { isMangaScript, parse, suggestRole, aliasCandidates, sourceLines };
});
