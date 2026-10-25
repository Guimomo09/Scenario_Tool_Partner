// === Analyse heuristique des scripts manga ===
// Méthodes de WritingPartnerApp, sorties d'app.js. Elles produisent des propositions d'extraction
// (script, personnages, lieux, contexte) appliquées ensuite par ProjectModel.applyUpdates.

class MangaAnalysis {
  // Convertir le parsing manga en format standard pour l'application.
  // known : fiches existantes { characters, places } (alias confirmés, personnages muets, lieux)
  convertMangaToUpdates(parsed, known = {}, documentName = '_NOTES.md') {
    const updates = {
      script_updates: [],
      character_updates: [],
      place_updates: [],
      system_updates: [],
      timeline_updates: [],
      todos: [],
      // Séquences : index dérivé (pages rattachées, lignes d'introduction conservées)
      sequences: parsed.sequences.map(s => ({
        number: s.number, title: s.title, label: s.label, pages: s.pages,
        _intro: s.intro, sourceLine: s.line
      }))
    };

    // Convertir les pages : `_blocks` garde l'ordre exact action / dialogue / pensée et le texte source
    parsed.pages.forEach(page => {
      const actionText = page.actions.map(a => a.text).join(' ');
      const dialogueText = page.dialogues.map(d => `${d.speaker}: "${d.text}"`).join('\n');
      const thoughtText = page.thoughts.map(t => `${t.speaker} (pensée): ${t.text}`).join('\n');
      const mainCharacter = page.dialogues[0]?.speaker || page.thoughts[0]?.speaker || null;
      const lastBlock = page.blocks[page.blocks.length - 1];

      updates.script_updates.push({
        page: page.number,
        endNumber: page.endNumber || null,
        isDoublePage: page.isDoublePage || false,
        sequence: page.sequence,
        heading: page.heading || '',
        action: actionText,
        dialogue: dialogueText || null,
        thoughts: thoughtText || null,
        character: mainCharacter,
        source: documentName,
        sourceLines: [page.line, lastBlock.line + lastBlock.raw.split('\n').length - 1],
        _blocks: page.blocks,
        // Vues séparées conservées pour la compatibilité (l'ordre commun est dans _blocks)
        _dialogues: page.dialogues,
        _thoughts: page.thoughts,
        _actions: page.actions
      });
    });
    
    // Personnages, lieux, chronologie : observations sourcées uniquement (qui parle, où il apparaît,
    // extraits exacts). Aucun trait, objectif ou relation n'est déduit de la présence d'un mot :
    // ces lectures relèvent de l'auteur ou d'une analyse sémantique présentée comme proposition.
    const content = parsed.pages.flatMap(p => p.blocks.map(b => b.raw)).join('\n');

    // Indices lexicaux sur le monde : hypothèses affichées à part (Bible › Analyse automatique),
    // jamais écrites dans les fiches
    const worldContext = this.analyzeWorldContext(content, parsed.pages);
    updates.worldContext = worldContext;
    updates.narrativeClues = worldContext.narrativeClues;

    // Chronologie : une durée explicite du texte (« 20 ans après la chute »), avec son extrait
    updates.timeline_updates.push(...this.detectExplicitEvents(parsed.pages, documentName));

    const knownCharacters = (known.characters || []).filter(c => c && typeof c === 'object' && c.name);
    const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    // Alias confirmés (fiche de la bible) → fiche ; un alias porté par plusieurs fiches reste ambigu
    const aliasOwners = new Map();
    knownCharacters.forEach(c => (Array.isArray(c.aliases) ? c.aliases : []).forEach(a => {
      const key = norm(a);
      if (!key) return;
      aliasOwners.set(key, [...(aliasOwners.get(key) || []), c]);
    }));
    const byName = new Map(knownCharacters.map(c => [norm(c.name), c]));
    // Un alias ambigu ne sert jamais à rattacher une réplique ou une présence à une fiche
    const usableAliases = (c) => (Array.isArray(c.aliases) ? c.aliases : []).filter(a => (aliasOwners.get(norm(a)) || []).length === 1);
    updates._notices = [];
    const covered = new Set();

    const minDialogueForGeneric = 3;
    const genericRoles = ['présentateur', 'technicien', 'majordome', 'garde', 'soldat', 'voix'];
    parsed.characters.forEach((char, name) => {
      const isGeneric = genericRoles.some(r => name.toLowerCase().includes(r));
      if (isGeneric && char.dialogueCount < minDialogueForGeneric) return;

      let sheet = byName.get(norm(name)) || null;
      if (!sheet) {
        const owners = aliasOwners.get(norm(name)) || [];
        if (owners.length === 1) sheet = owners[0];
        else if (owners.length > 1) {
          updates._notices.push(`« ${name} » est un alias de plusieurs fiches (${owners.map(o => o.name).join(', ')}) : gardé séparé.`);
        }
      }
      const names = sheet ? [sheet.name, ...usableAliases(sheet), name] : [name];
      if (sheet) covered.add(norm(sheet.name));
      const obs = this.observeCharacter(names, parsed.pages, documentName);
      // Le rôle n'est jamais attribué par l'analyse : seulement suggéré, avec sa justification
      updates.character_updates.push({
        name: sheet ? sheet.name : char.name,
        ...(char.suggestion ? {
          suggestedRole: char.suggestion.role,
          suggestionSource: `analyse locale : ${char.suggestion.evidence}`
        } : {}),
        firstAppearance: char.firstAppearance,
        dialogueCount: char.dialogueCount,
        thoughtCount: char.thoughtCount || 0,
        ...obs
      });
    });

    // Personnages de la bible qui ne parlent pas ici (muets, absents des répliques) : présence relevée
    knownCharacters.filter(c => !covered.has(norm(c.name)) && !parsed.characters.has(c.name)).forEach(c => {
      const obs = this.observeCharacter([c.name, ...usableAliases(c)], parsed.pages, documentName);
      if (!obs.appearances.length) return;
      updates.character_updates.push({ name: c.name, firstAppearance: obs.appearances[0], ...obs });
    });

    // Lieux de la bible : phrases d'action qui les nomment (et atmosphère lue dans ces phrases seulement)
    (known.places || []).filter(p => p && typeof p === 'object' && p.name).forEach(place => {
      const update = this.observePlace(place, parsed.pages, documentName);
      if (update) updates.place_updates.push(update);
    });

    return updates;
  }

  // Expression régulière d'un nom entier (« Ari » ne trouve pas « Arianne »)
  nameRegex(names) {
    const parts = [...new Set(names.map(n => String(n || '').trim()).filter(n => n.length >= 2))]
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!parts.length) return null;
    return new RegExp(`(^|[^\\p{L}\\p{N}])(${parts.join('|')})(?=[^\\p{L}\\p{N}]|$)`, 'iu');
  }

  // Observations d'un personnage : pages où il parle, pense ou est nommé dans une action ;
  // extraits exacts localisés ; personnes présentes sur les mêmes pages (ce n'est pas une relation)
  observeCharacter(names, pages, documentName = '_NOTES.md') {
    const speakers = new Set(names.map(n => String(n).toLowerCase()));
    const re = this.nameRegex(names);
    const appearances = new Set();
    const quotes = { thought: [], dialogue: [] };
    const together = new Map();

    pages.forEach(page => {
      let present = false;
      page.blocks.forEach(b => {
        if ((b.type === 'dialogue' || b.type === 'thought') && speakers.has(String(b.speaker || '').toLowerCase())) {
          present = true;
          if (b.text.length > 20 && b.text.length < 150) {
            quotes[b.type].push({ type: b.type === 'thought' ? 'pensée' : 'réplique', text: b.text, page: page.number, line: b.line, document: documentName });
          }
        } else if (b.type === 'action' && re && re.test(b.text)) {
          present = true;
        }
      });
      if (!present) return;
      appearances.add(page.number);
      page.blocks
        .filter(b => (b.type === 'dialogue' || b.type === 'thought') && b.speaker && !speakers.has(b.speaker.toLowerCase()))
        .forEach(b => {
          const pagesWith = together.get(b.speaker) || new Set();
          pagesWith.add(page.number);
          together.set(b.speaker, pagesWith);
        });
    });

    return {
      appearances: [...appearances].sort((a, b) => a - b),
      keyQuotes: [...quotes.thought.slice(0, 3), ...quotes.dialogue.slice(0, 2)].slice(0, 4),
      coPresence: [...together.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 6)
        .map(([character, set]) => ({ character, pages: [...set].sort((a, b) => a - b) }))
    };
  }

  // Phrases d'action qui nomment un lieu connu. L'atmosphère n'est lue que dans ces phrases :
  // « La gare est sombre. Le port est calme. » ne rend pas le port sombre.
  observePlace(place, pages, documentName = '_NOTES.md') {
    const re = this.nameRegex([place.name, ...(Array.isArray(place.aliases) ? place.aliases : [])]);
    if (!re) return null;
    const mentions = [];
    pages.forEach(page => page.blocks.filter(b => b.type === 'action').forEach(b => {
      b.text.split(/(?<=[.!?…])\s+/).filter(s => re.test(s)).forEach(sentence => {
        mentions.push({ page: page.number, line: b.line, text: sentence.trim(), document: documentName });
      });
    }));
    if (!mentions.length) return null;
    const update = { name: place.name, mentions: mentions.slice(0, 12) };
    const moods = [];
    const described = [];
    mentions.forEach(m => {
      const found = this.detectMoods(m.text);
      if (found.length) described.push(m);
      found.forEach(f => { if (!moods.includes(f)) moods.push(f); });
    });
    if (moods.length) {
      const first = described[0];
      update.atmosphere = moods.join(', ');
      update._evidence = { atmosphere: { document: documentName, page: first.page, line: first.line, quote: described.map(m => m.text).join(' ') } };
    }
    return update;
  }

  detectMoods(text) {
    const moods = [];
    if (/sombre|noir|obscur|ténèbres/i.test(text)) moods.push('sombre');
    if (/froid|glacia|gelé/i.test(text)) moods.push('froid');
    if (/oppressant|étouff|claustro/i.test(text)) moods.push('oppressant');
    if (/calme|paisible|tranquil/i.test(text)) moods.push('calme');
    if (/lumineu|ensoleill|éclatant/i.test(text)) moods.push('lumineux');
    if (/bruyant|vacarme|brouhaha/i.test(text)) moods.push('bruyant');
    return moods;
  }

  // Événement daté explicitement dans le texte, avec l'extrait et sa page
  detectExplicitEvents(pages, documentName = '_NOTES.md') {
    const events = [];
    const re = /(\d+)\s*ans?\s*(?:après|depuis)\s*(l'effondrement|la chute|la catastrophe|l'apocalypse|la guerre)/i;
    pages.forEach(page => page.blocks.forEach(b => {
      const m = b.text && b.text.match(re);
      if (!m || events.some(e => e.period === `Il y a ${m[1]} ans`)) return;
      const label = m[2].replace(/^(l'|la )/i, '');
      events.push({
        period: `Il y a ${m[1]} ans`,
        event: label.charAt(0).toUpperCase() + label.slice(1),
        // Où le texte l'affirme (une réplique peut se tromper : l'événement reste à vérifier)
        evidence: { document: documentName, page: page.number, line: b.line, quote: b.text, ...(b.speaker ? { speaker: b.speaker } : {}) }
      });
    }));
    return events;
  }

  // === ANALYSE APPROFONDIE DU MONDE ===
  
  analyzeWorldContext(fullContent, pages) {
    const context = {
      setting: this.detectSetting(fullContent),
      politics: this.detectPoliticalSystem(fullContent, pages),
      resources: this.detectResources(fullContent, pages),
      society: this.detectSocialStructure(fullContent, pages),
      technology: this.detectTechnologyLevel(fullContent, pages),
      timeline: this.detectWorldTimeline(fullContent),
      atmosphere: this.detectAtmosphere(fullContent, pages),
      narrativeClues: this.extractNarrativeClues(fullContent, pages)
    };
    return context;
  }
  
  detectSetting(content) {
    const low = content.toLowerCase();
    const settings = [];
    
    // Détection d'environnement
    const envPatterns = {
      'souterrain': /abri|bunker|souterrain|sous\s*terre|tunnel|cave/i,
      'post-apocalyptique': /effondrement|apocal|ruines|surviv|fin du monde|après la chute/i,
      'dystopie': /dictateur|régime|contrôle|surveillance|père.*dirige|oppression/i,
      'isolé': /isolé|coupé du monde|seuls.*survivants|dernier.*refuge/i,
      'militarisé': /soldats?|garde|patrouill|rang|capitaine|lieutenant|mission/i,
      'urbain-dévasté': /ville.*détruite|ruines.*urbain|immeubles.*effondr/i,
      'nature-hostile': /toxique|air.*mortel|radiation|contamin/i
    };
    
    Object.entries(envPatterns).forEach(([type, pattern]) => {
      if (pattern.test(content)) {
        settings.push(type);
      }
    });
    
    // Détection temporelle
    const timeMatch = content.match(/(\d+)\s*ans?\s*(?:après|depuis|plus tard)/);
    const timeInfo = timeMatch ? `${timeMatch[1]} ans après un événement majeur` : null;
    
    return {
      types: settings,
      timespan: timeInfo,
      primarySetting: settings[0] || 'indéterminé'
    };
  }
  
  detectPoliticalSystem(content, pages) {
    const low = content.toLowerCase();
    const politics = {
      type: 'indéterminé',
      leader: null,
      hierarchy: [],
      propaganda: [],
      control: []
    };
    
    // Détecter le type de régime
    if (/père.*fonda|le père.*dirige|père.*commande|le père.*décid/i.test(content)) {
      politics.type = 'Autocratie patriarcale';
      politics.leader = { title: 'Le Père', description: 'Figure fondatrice et autoritaire' };
    } else if (/conseil|assemblée|vote/i.test(content)) {
      politics.type = 'Conseil';
    } else if (/roi|reine|royaume/i.test(content)) {
      politics.type = 'Monarchie';
    } else if (/dictateur|tyran/i.test(content)) {
      politics.type = 'Dictature';
    }
    
    // Détecter les rangs/hiérarchie
    const ranks = [];
    const rankPatterns = [
      /capitaine/gi, /lieutenant/gi, /général/gi, /commandant/gi,
      /garde/gi, /soldat/gi, /héros/gi, /élu/gi, /conseiller/gi
    ];
    rankPatterns.forEach(p => {
      const match = content.match(p);
      if (match) ranks.push(match[0]);
    });
    politics.hierarchy = [...new Set(ranks)];
    
    // Détecter la propagande
    const propagandaPatterns = [
      { pattern: /héros.*honneur|sacrifice.*gloire/i, theme: 'Glorification du sacrifice' },
      { pattern: /pour (?:le |l\')abri|sauver.*communauté|protéger.*nôtres/i, theme: 'Collectivisme forcé' },
      { pattern: /mission.*noble|devoir.*sacré/i, theme: 'Sacralisation du devoir' },
      { pattern: /ennemi.*dehors|danger.*extérieur|menace.*surface/i, theme: 'Peur de l\'extérieur' }
    ];
    propagandaPatterns.forEach(({ pattern, theme }) => {
      if (pattern.test(content)) politics.propaganda.push(theme);
    });
    
    // Mécanismes de contrôle
    const controlPatterns = [
      { pattern: /caméra|surveillance|observ|espionn/i, control: 'Surveillance' },
      { pattern: /interdit|défendu|puni|châtiment/i, control: 'Punition' },
      { pattern: /sélection|choisir.*envoy|désign/i, control: 'Sélection forcée' },
      { pattern: /secret|cach|dissimul|vérité.*tu/i, control: 'Information contrôlée' }
    ];
    controlPatterns.forEach(({ pattern, control }) => {
      if (pattern.test(content)) politics.control.push(control);
    });
    
    return politics;
  }
  
  detectResources(content, pages) {
    const resources = {
      scarce: [],
      valuable: [],
      controlled: [],
      implications: []
    };
    
    // Ressources rares (réactions émotionnelles = rareté)
    const scarcityPatterns = [
      { pattern: /(?:jamais vu|première fois.*vo|n'avai[st] jamais|incroyable.*c'est un).*?([\wéèêàâùûîïôç]+)/i, extract: true },
      { pattern: /(?:poisson|viande|fruit|légume).*(?:rare|précieux|luxe)/i, item: 'nourriture fraîche' },
      { pattern: /eau.*(?:rationn|compt|précieu)/i, item: 'eau' },
      { pattern: /(?:médicament|médecine|soin).*(?:manqu|rare)/i, item: 'médicaments' }
    ];
    
    // Analyser les dialogues pour réactions de surprise/émerveillement
    pages.forEach(page => {
      page.dialogues.forEach(d => {
        const text = d.text.toLowerCase();
        // Si quelqu'un s'émerveille devant quelque chose de banal = c'est rare
        if (/c'est.*incroyable|jamais vu|première fois|magnifique|extraordinaire/i.test(d.text)) {
          const objectMatch = d.text.match(/(?:un |une |le |la |des |les )([\wéèêàâùûîïôç]+)/i);
          if (objectMatch) {
            const item = objectMatch[1].toLowerCase();
            // Filtrer les mots trop génériques
            if (!['chose', 'truc', 'ça', 'cela', 'ce'].includes(item)) {
              resources.scarce.push({
                item: item,
                evidence: `Réaction d'émerveillement : "${d.text.substring(0, 60)}..."`,
                implication: `${item} est rare/précieux dans ce monde`
              });
            }
          }
        }
      });
    });
    
    // Ressources contrôlées
    if (/ration|distribu|allou|quotas?/i.test(content)) {
      resources.controlled.push({ type: 'Système de rationnement', implication: 'Ressources limitées, contrôle étatique' });
    }
    if (/mission.*récupér|expédition.*chercher|sortie.*trouver/i.test(content)) {
      resources.controlled.push({ type: 'Expéditions de récupération', implication: 'Dépendance à l\'extérieur hostile' });
    }
    
    // Déduire les implications
    if (resources.scarce.length > 0) {
      resources.implications.push('Société de pénurie - chaque ressource compte');
    }
    if (resources.controlled.length > 0) {
      resources.implications.push('Le pouvoir contrôle la distribution - dépendance forcée');
    }
    
    return resources;
  }
  
  detectSocialStructure(content, pages) {
    const society = {
      groups: [],
      dynamics: [],
      tensions: [],
      customs: []
    };
    
    // Groupes sociaux
    const groupPatterns = [
      { pattern: /enfants? de l'abri|né.*dans l'abri|génération.*abri/i, group: 'Enfants de l\'abri', desc: 'Nés après l\'effondrement, n\'ont jamais connu l\'ancien monde' },
      { pattern: /anciens?|vétérans?|ceux d'avant|génération.*surface/i, group: 'Les Anciens', desc: 'Survivants de l\'ancien monde, porteurs de mémoire' },
      { pattern: /orphelin/i, group: 'Orphelins', desc: 'Sans parents, vulnérables mais potentiellement libres' },
      { pattern: /soldat|garde|militaire/i, group: 'Forces armées', desc: 'Bras armé du pouvoir' },
      { pattern: /héros|élu|choisi/i, group: 'Les Héros/Élus', desc: 'Statut spécial, possiblement sacrificiel' }
    ];
    
    groupPatterns.forEach(({ pattern, group, desc }) => {
      if (pattern.test(content)) {
        society.groups.push({ name: group, description: desc });
      }
    });
    
    // Dynamiques sociales
    if (/jeunes?.*vieux|anciens?.*nouvell|génération.*conflit/i.test(content)) {
      society.dynamics.push('Fossé générationnel');
    }
    if (/loyal|fidèle|dévoué.*père|obéi/i.test(content)) {
      society.dynamics.push('Culture de loyauté/obéissance');
    }
    if (/secret|cach|conspir|vérité.*découvr/i.test(content)) {
      society.dynamics.push('Secrets et révélations');
    }
    
    // Tensions
    const tensionSigns = [];
    pages.forEach(page => {
      page.dialogues.forEach(d => {
        if (/mensonge|menteur|trahi|trahison|vérité|cach/i.test(d.text)) {
          tensionSigns.push(d.text.substring(0, 50));
        }
      });
    });
    if (tensionSigns.length > 0) {
      society.tensions.push({ type: 'Méfiance croissante', evidence: tensionSigns.slice(0, 3) });
    }
    
    return society;
  }
  
  detectTechnologyLevel(content, pages) {
    const tech = {
      level: 'post-industriel dégradé',
      working: [],
      lost: [],
      restricted: []
    };
    
    // Technologies fonctionnelles
    const workingTech = [
      { pattern: /ascenseur/i, tech: 'Ascenseur (mécanique)' },
      { pattern: /caméra|surveillance/i, tech: 'Système de surveillance' },
      { pattern: /générateur|électric/i, tech: 'Électricité (limitée)' },
      { pattern: /radio|communic/i, tech: 'Communications' },
      { pattern: /arme|fusil|pistolet/i, tech: 'Armes à feu' },
      { pattern: /masque.*(?:gaz|filtr|respirat)/i, tech: 'Équipement de protection' }
    ];
    
    workingTech.forEach(({ pattern, tech: techName }) => {
      if (pattern.test(content)) tech.working.push(techName);
    });
    
    // Technologies perdues/mentionnées avec nostalgie
    if (/avant.*(?:avion|voiture|internet|téléphone)/i.test(content)) {
      tech.lost.push('Technologies de communication/transport avancées');
    }
    
    return tech;
  }
  
  detectWorldTimeline(content) {
    const timeline = {
      events: [],
      currentEra: 'indéterminé'
    };
    
    // Événement majeur
    const collapseMatch = content.match(/(\d+)\s*ans?\s*(?:après|depuis)\s*(?:l'effondrement|la chute|le début|la catastrophe|l'apocalypse)/i);
    if (collapseMatch) {
      timeline.events.push({
        name: 'L\'Effondrement',
        when: `Il y a ${collapseMatch[1]} ans`,
        significance: 'Événement fondateur du monde actuel'
      });
      timeline.currentEra = `${collapseMatch[1]} ans après l'Effondrement`;
    }
    
    return timeline;
  }
  
  detectAtmosphere(content, pages) {
    const atmosphere = {
      dominant: [],
      recurring: []
    };
    
    // Émotions dominantes dans les dialogues
    const emotionCounts = {
      peur: 0, espoir: 0, colère: 0, tristesse: 0,
      tension: 0, désespoir: 0, détermination: 0
    };
    
    pages.forEach(page => {
      page.dialogues.forEach(d => {
        const text = d.text.toLowerCase();
        if (/peur|terrif|effray|craind/i.test(text)) emotionCounts.peur++;
        if (/espoir|espèr|rêve|un jour/i.test(text)) emotionCounts.espoir++;
        if (/colère|furieu|rage|énervé/i.test(text)) emotionCounts.colère++;
        if (/triste|pleure|larme|deuil/i.test(text)) emotionCounts.tristesse++;
        if (/danger|menace|attention|prudent/i.test(text)) emotionCounts.tension++;
        if (/fin|tout est perdu|plus d'espoir/i.test(text)) emotionCounts.désespoir++;
        if (/doit|faut|va.*réussir|n'abandonn/i.test(text)) emotionCounts.détermination++;
      });
    });
    
    // Trier par fréquence
    const sorted = Object.entries(emotionCounts)
      .filter(([_, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    
    atmosphere.dominant = sorted.slice(0, 3).map(([emotion]) => emotion);
    
    return atmosphere;
  }
  
  extractNarrativeClues(content, pages) {
    const clues = [];
    
    // Pattern 1: Réaction disproportionnée = indice sur le monde
    pages.forEach(page => {
      page.dialogues.forEach(d => {
        // Émerveillement devant le banal
        if (/(?:c'est|regarde|wow|incroyable|magnifique).*(?:un |une )([\wéèêàâùûîïôç]+)/i.test(d.text)) {
          const match = d.text.match(/(?:un |une )([\wéèêàâùûîïôç]+)/i);
          if (match && !['truc', 'chose', 'idée'].includes(match[1].toLowerCase())) {
            clues.push({
              type: 'Rareté implicite',
              observation: `Réaction forte devant "${match[1]}"`,
              implication: `${match[1]} est rare/inconnu dans ce monde`,
              characterInsight: `Le personnage n'a probablement jamais vu/connu cela`,
              worldInsight: `Indique une pénurie ou disparition de ${match[1]}`
            });
          }
        }
        
        // Questions naïves = ignorance générationnelle
        if (/c'est quoi|qu'est-ce que c'est|ça veut dire quoi/i.test(d.text)) {
          const aboutMatch = d.text.match(/(?:c'est quoi|qu'est-ce que c'est)(?: que)?\s*(?:un |une |le |la )?([\wéèêàâùûîïôç]+)/i);
          if (aboutMatch) {
            clues.push({
              type: 'Ignorance générationnelle',
              observation: `Question sur "${aboutMatch[1]}"`,
              implication: `Cette connaissance a été perdue`,
              characterInsight: `Né après l'effondrement, éducation limitée`,
              worldInsight: `Rupture avec l'ancien monde`
            });
          }
        }
      });
    });
    
    // Pattern 2: Dialogue contenant "avant" ou "autrefois"
    pages.forEach(page => {
      page.dialogues.forEach(d => {
        if (/avant.*(?:on pouvait|il y avait|les gens)|autrefois/i.test(d.text)) {
          clues.push({
            type: 'Mémoire de l\'ancien monde',
            observation: d.text.substring(0, 80) + '...',
            implication: 'Contraste ancien/nouveau monde',
            worldInsight: 'Le personnage qui parle a connu l\'avant'
          });
        }
      });
    });
    
    // Pattern 3: Vérités cachées révélées
    pages.forEach(page => {
      page.dialogues.forEach(d => {
        if (/(?:la vérité|en réalité|ce qu'on ne dit pas|le secret|ils ne savent pas)/i.test(d.text)) {
          clues.push({
            type: 'Vérité cachée',
            observation: d.text.substring(0, 80) + '...',
            implication: 'Le régime dissimule des informations',
            worldInsight: 'Système basé sur le mensonge'
          });
        }
      });
    });
    
    return clues;
  }
  
  // Parsing local sans API - détection de patterns
  // known : fiches existantes du projet (alias, personnages muets, lieux nommés dans les actions)
  parseNotesLocally(notes, known = {}) {
    // Détecter si c'est un script manga
    if (window.MangaParser.isMangaScript(notes)) {
      const mangaParsed = window.MangaParser.parse(notes);
      const updates = this.convertMangaToUpdates(mangaParsed, known);
      const aliases = window.MangaParser.aliasCandidates(mangaParsed.characters.keys());
      updates._notices = [
        ...updates._notices,
        ...mangaParsed.warnings,
        ...aliases.map(a => `Noms proches gardés séparés (à fusionner vous-même si c'est la même personne) : « ${a.short} » / « ${a.long} »`)
      ];
      return updates;
    }
    
    // Parser standard pour story bibles et notes génériques
    const updates = {
      script_updates: [],
      character_updates: [],
      place_updates: [],
      system_updates: [],
      timeline_updates: [],
      todos: []
    };
    
    const lines = notes.split('\n');
    let currentSection = null;
    
    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // Détecter les sections markdown
      const sectionMatch = trimmed.match(/^#+\s*(\d+\.)?\s*(.+)/);
      if (sectionMatch) {
        currentSection = sectionMatch[2].trim();
      }
      
      // Pattern 1: Pages de scénario (p45, page 45, p.45)
      const pageMatch = trimmed.match(/^(?:p\.?|page\s*)(\d+)[:\s-]+(.+)/i);
      if (pageMatch) {
        const page = parseInt(pageMatch[1]);
        let content = pageMatch[2];
        let dialogue = null;
        let character = null;
        
        // Extraire dialogue entre guillemets
        const dialogueMatch = content.match(/"([^"]+)"/);
        if (dialogueMatch) {
          dialogue = dialogueMatch[1];
        }
        
        // Détecter personnage (mot en majuscules au début)
        const charMatch = content.match(/^([A-Z][A-Za-zÀ-ÿ]+)\s+/);
        if (charMatch) {
          character = charMatch[1];
        }
        
        updates.script_updates.push({ page, action: content, dialogue, character });
      }
      
      // Pattern 2: TODOs et points à traiter
      // IMPORTANT: Ne PAS capturer les dialogues qui finissent par "?"
      // Un vrai todo est explicitement marqué avec des tags spécifiques
      const todoPatterns = [
        /\[À\s*(définir|développer|traiter|faire|préciser)[^\]]*\]/gi,  // [À définir], [À développer ...]
        /\bTODO:?\s*(.+)/i,                                             // TODO: quelque chose
        /\bFIXME:?\s*(.+)/i,                                            // FIXME: quelque chose
        /\bÀ\s*FAIRE:?\s*(.+)/i,                                        // À FAIRE: quelque chose
        /\bÀ\s*TRAITER:?\s*(.+)/i,                                      // À TRAITER: quelque chose
        /^\s*-\s*\[\s*\]\s*(.+)/                                        // - [ ] checkbox non cochée
      ];
      
      todoPatterns.forEach(pattern => {
        const match = trimmed.match(pattern);
        if (match) {
          // Extraire le contenu significatif
          const content = match[1] || trimmed;
          // Éviter les faux positifs très courts ou les simples "définir"
          if (content && content.length > 3 && !/^(définir|traiter|faire)$/i.test(content)) {
            updates.todos.push({
              title: content.substring(0, 80),
              context: currentSection || '',
              section: currentSection,
              line: lineIdx + 1
            });
          }
        }
      });
      
      // Pattern 3: Personnages - SEULEMENT avec des marqueurs explicites
      // Éviter les faux positifs comme "Mars — Passé" ou "Présent"
      const invalidNames = /^(mars|terre|earth|moon|lune|présent|passé|futur|avant|après|page|séquence|chapitre|arc|acte|scène)/i;
      
      const charMatch = trimmed.match(/^(?:personnage|character):?\s*(.+)/i);
      if (charMatch && !invalidNames.test(charMatch[1])) {
        updates.character_updates.push({
          name: charMatch[1].trim(),
          trait: ''
        });
      }
      
      // Pattern 4: Lieux
      const placeMatch = trimmed.match(/^(?:lieu|place|endroit):?\s*(.+)/i);
      if (placeMatch) {
        const parts = placeMatch[1].split(/[—–-]/);
        updates.place_updates.push({
          name: parts[0].trim(),
          description: parts[1] ? parts[1].trim() : ''
        });
      }
      
      // Pattern 5: Timeline (dates, périodes)
      const timelineMatch = trimmed.match(/^(?:il y a|avant|après|passé|présent|futur|\d+\s*(?:ans?|années?))/i);
      if (timelineMatch) {
        updates.timeline_updates.push({
          period: trimmed.split(/[:\-–—]/)[0].trim(),
          event: trimmed
        });
      }
    });
    
    return updates;
  }
}

window.MangaAnalysis = MangaAnalysis;
// Tests (node) : `window` est fourni par le test, avec MangaParser
if (typeof module === 'object' && module.exports) module.exports = MangaAnalysis;
