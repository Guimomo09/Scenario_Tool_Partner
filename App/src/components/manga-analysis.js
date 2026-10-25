// === Analyse heuristique des scripts manga ===
// Méthodes de WritingPartnerApp, sorties d'app.js. Elles produisent des propositions d'extraction
// (script, personnages, lieux, contexte) appliquées ensuite par ProjectModel.applyUpdates.

class MangaAnalysis {
  // Convertir le parsing manga en format standard pour l'application
  convertMangaToUpdates(parsed) {
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
        source: '_NOTES.md',
        sourceLines: [page.line, lastBlock.line + lastBlock.raw.split('\n').length - 1],
        _blocks: page.blocks,
        // Vues séparées conservées pour la compatibilité (l'ordre commun est dans _blocks)
        _dialogues: page.dialogues,
        _thoughts: page.thoughts,
        _actions: page.actions
      });
    });
    
    // Convertir les personnages avec analyse approfondie
    const minDialogueForGeneric = 3;
    const genericRoles = ['présentateur', 'technicien', 'majordome', 'garde', 'soldat', 'voix'];
    const content = parsed.pages.flatMap(p => p.blocks.map(b => b.raw)).join('\n');
    
    // === ANALYSE DU CONTEXTE DU MONDE ===
    const worldContext = this.analyzeWorldContext(content, parsed.pages);
    
    // Stocker le contexte mondial dans les updates
    updates.worldContext = worldContext;
    
    // === GÉNÉRER LES LIEUX ENRICHIS ===
    const placesMap = new Map();
    parsed.pages.forEach(page => {
      if (page.location && page.location.trim()) {
        const locName = page.location.trim();
        if (!placesMap.has(locName)) {
          placesMap.set(locName, {
            name: locName,
            firstMention: page.number,
            sceneCount: 1
          });
        } else {
          placesMap.get(locName).sceneCount++;
        }
      }
    });
    
    // Enrichir chaque lieu avec analyse profonde
    placesMap.forEach((placeData, placeName) => {
      const enriched = this.enrichPlaceUpdate(placeData, worldContext, parsed.pages);
      updates.place_updates.push(enriched);
    });
    
    // === GÉNÉRER LES SYSTÈMES DU MONDE ===
    // Système politique
    if (worldContext.politics.type !== 'indéterminé') {
      updates.system_updates.push({
        name: worldContext.politics.type,
        category: 'Politique',
        description: this.generatePoliticsDescription(worldContext.politics),
        details: {
          leader: worldContext.politics.leader,
          hierarchy: worldContext.politics.hierarchy,
          propaganda: worldContext.politics.propaganda,
          control: worldContext.politics.control
        }
      });
    }
    
    // Système de ressources
    if (worldContext.resources.scarce.length > 0 || worldContext.resources.controlled.length > 0) {
      updates.system_updates.push({
        name: 'Économie de pénurie',
        category: 'Ressources',
        description: this.generateResourcesDescription(worldContext.resources),
        details: {
          scarce: worldContext.resources.scarce,
          controlled: worldContext.resources.controlled,
          implications: worldContext.resources.implications
        }
      });
    }
    
    // Structure sociale
    if (worldContext.society.groups.length > 0) {
      updates.system_updates.push({
        name: 'Structure sociale',
        category: 'Société',
        description: this.generateSocietyDescription(worldContext.society),
        details: {
          groups: worldContext.society.groups,
          dynamics: worldContext.society.dynamics,
          tensions: worldContext.society.tensions
        }
      });
    }
    
    // Niveau technologique
    if (worldContext.technology.working.length > 0) {
      updates.system_updates.push({
        name: 'Niveau technologique',
        category: 'Technologie',
        description: `Technologies fonctionnelles: ${worldContext.technology.working.join(', ')}`,
        details: worldContext.technology
      });
    }
    
    // === TIMELINE DU MONDE ===
    if (worldContext.timeline.events.length > 0) {
      worldContext.timeline.events.forEach(event => {
        updates.timeline_updates.push({
          event: event.name,
          when: event.when,
          significance: event.significance
        });
      });
    }
    
    // === INDICES NARRATIFS ===
    updates.narrativeClues = worldContext.narrativeClues;
    
    parsed.characters.forEach((char, name) => {
      const isGeneric = genericRoles.some(r => name.toLowerCase().includes(r));
      
      // Garder seulement si : pas générique OU a assez de dialogues
      if (!isGeneric || char.dialogueCount >= minDialogueForGeneric) {
        // Analyse approfondie du personnage
        const analysis = this.analyzeCharacter(name, char, parsed.pages, content);
        
        // Le rôle n'est jamais attribué par l'analyse : seulement suggéré, avec sa justification
        updates.character_updates.push({
          name: char.name,
          ...(char.suggestion ? {
            suggestedRole: char.suggestion.role,
            suggestionSource: `analyse locale : ${char.suggestion.evidence}`
          } : {}),
          type: analysis.type,
          description: analysis.description,
          traits: analysis.traits,
          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses,
          goals: analysis.goals,
          motivations: analysis.motivations,
          relationships: analysis.relationships,
          arc: analysis.arc,
          keyQuotes: analysis.keyQuotes,
          firstAppearance: char.firstAppearance,
          dialogueCount: char.dialogueCount
        });
      }
    });
    
    return updates;
  }
  
  // === GÉNÉRATEURS DE DESCRIPTIONS POUR LES SYSTÈMES ===
  
  generatePoliticsDescription(politics) {
    let desc = `${politics.type}`;
    if (politics.leader) {
      desc += ` dirigé par ${politics.leader.title}. `;
    }
    if (politics.propaganda.length > 0) {
      desc += `Propagande: ${politics.propaganda.join(', ')}. `;
    }
    if (politics.control.length > 0) {
      desc += `Contrôle via: ${politics.control.join(', ')}.`;
    }
    return desc;
  }
  
  generateResourcesDescription(resources) {
    let desc = 'Économie de rareté. ';
    if (resources.scarce.length > 0) {
      desc += `Ressources rares: ${resources.scarce.map(r => r.item).join(', ')}. `;
    }
    if (resources.implications.length > 0) {
      desc += resources.implications[0];
    }
    return desc;
  }
  
  generateSocietyDescription(society) {
    let desc = '';
    if (society.groups.length > 0) {
      desc += `Groupes: ${society.groups.map(g => g.name).join(', ')}. `;
    }
    if (society.dynamics.length > 0) {
      desc += `Dynamiques: ${society.dynamics.join(', ')}.`;
    }
    return desc;
  }
  
  // === ANALYSE APPROFONDIE DES PERSONNAGES ===
  analyzeCharacter(name, charData, pages, fullContent) {
    const lowName = name.toLowerCase();
    const lowContent = fullContent.toLowerCase();
    
    // Collecter tous les éléments liés au personnage
    const dialogues = [];
    const thoughts = [];
    const actions = [];
    const mentionedWith = new Map(); // Autres personnages mentionnés avec lui
    
    pages.forEach(page => {
      // Dialogues du personnage
      page.dialogues.filter(d => d.speaker.toLowerCase() === lowName).forEach(d => {
        dialogues.push({ page: page.number, text: d.text });
      });
      
      // Pensées du personnage
      page.thoughts.filter(t => t.speaker.toLowerCase() === lowName).forEach(t => {
        thoughts.push({ page: page.number, text: t.text });
      });
      
      // Actions qui le mentionnent
      page.actions.filter(a => a.text.toLowerCase().includes(lowName)).forEach(a => {
        actions.push({ page: page.number, text: a.text });
      });
      
      // Relations - qui parle à qui dans la même page
      const speakers = new Set([...page.dialogues.map(d => d.speaker), ...page.thoughts.map(t => t.speaker)]);
      if (speakers.has(name)) {
        speakers.forEach(s => {
          if (s !== name) {
            mentionedWith.set(s, (mentionedWith.get(s) || 0) + 1);
          }
        });
      }
    });
    
    // === ANALYSE DU RÔLE NARRATIF ===
    const role = charData.suggestion?.role || '';
    const type = this.determineCharacterType(name, role, dialogues, thoughts, actions, lowContent);
    
    // === ANALYSE DES TRAITS DE CARACTÈRE ===
    const traits = this.extractTraits(dialogues, thoughts, actions, lowContent, lowName);
    
    // === FORCES ET FAIBLESSES ===
    const { strengths, weaknesses } = this.extractStrengthsWeaknesses(name, dialogues, thoughts, actions, lowContent);
    
    // === OBJECTIFS ET MOTIVATIONS ===
    const { goals, motivations } = this.extractGoalsMotivations(name, dialogues, thoughts, lowContent);
    
    // === RELATIONS ===
    const relationships = [];
    mentionedWith.forEach((count, otherChar) => {
      const relationshipType = this.guessRelationship(name, otherChar, lowContent);
      if (relationshipType) {
        relationships.push({ character: otherChar, type: relationshipType, interactions: count });
      }
    });
    
    // === ARC DE DÉVELOPPEMENT ===
    const arc = this.detectCharacterArc(name, dialogues, thoughts, actions, pages);
    
    // === CITATIONS CLÉS ===
    const keyQuotes = this.extractKeyQuotes(dialogues, thoughts);
    
    // === DESCRIPTION SYNTHÉTIQUE ===
    const description = this.generateCharacterDescription(name, role, type, traits, goals);
    
    return {
      role, type, description, traits, strengths, weaknesses,
      goals, motivations, relationships, arc, keyQuotes
    };
  }
  
  determineCharacterType(name, role, dialogues, thoughts, actions, lowContent) {
    const lowName = name.toLowerCase();
    
    // Basé sur le rôle et le comportement
    if (role === 'Protagoniste') return 'Héros / Personnage principal';
    if (role === 'Antagoniste') {
      if (lowContent.includes('père') && lowContent.includes(lowName)) return 'Tyran bienveillant';
      return 'Antagoniste principal';
    }
    if (role === 'Traître') return 'Faux allié / Traître';
    if (role === 'Rebelle') return 'Allié rebelle';
    if (role === 'Figurant') return 'Personnage secondaire';
    
    // Si beaucoup de pensées mais peu de dialogues → personnage introspectif
    if (thoughts.length > dialogues.length) return 'Personnage conflictuel';
    
    return 'Personnage de soutien';
  }
  
  extractTraits(dialogues, thoughts, actions, lowContent, lowName) {
    const traits = [];
    
    // Analyse des patterns dans les dialogues et pensées
    const allText = [...dialogues.map(d => d.text), ...thoughts.map(t => t.text)].join(' ').toLowerCase();
    
    // Traits positifs
    if (allText.match(/merci|reconnaissance|gratitude/)) traits.push('Reconnaissant(e)');
    if (allText.match(/je.*protéger|sauver|aider/)) traits.push('Protecteur/trice');
    if (allText.match(/devoir|honneur|mission/)) traits.push('Dévoué(e)');
    if (allText.match(/je dois|il faut que|pas le choix/)) traits.push('Déterminé(e)');
    if (allText.match(/perspicace|remarqu|observ/)) traits.push('Observateur/trice');
    if (lowContent.includes(`${lowName} réfléchi`) || thoughts.length > 5) traits.push('Réfléchi(e)');
    
    // Traits négatifs ou complexes
    if (allText.match(/impossible|je.*croire|choqué/)) traits.push('Idéaliste');
    if (allText.match(/anxieu|inqui[eè]t|peur|crainte/)) traits.push('Anxieux/se');
    if (allText.match(/confiance|croire en/i) && allText.match(/père|supérieur/)) traits.push('Loyal(e)');
    if (allText.match(/sacrifice|nécessaire|pour.*bien/)) traits.push('Pragmatique');
    if (allText.match(/pouvoir|contrôle|domin/)) traits.push('Autoritaire');
    if (allText.match(/mentir|cacher|secret/)) traits.push('Dissimulateur/trice');
    
    // Traits militaires
    if (lowContent.includes('salut militaire') || lowContent.includes('capitaine') || lowContent.includes('lieutenant')) {
      traits.push('Discipliné(e)');
    }
    
    return [...new Set(traits)].slice(0, 6); // Max 6 traits
  }
  
  extractStrengthsWeaknesses(name, dialogues, thoughts, actions, lowContent) {
    const lowName = name.toLowerCase();
    const strengths = [];
    const weaknesses = [];
    
    const allText = [...dialogues.map(d => d.text), ...thoughts.map(t => t.text)].join(' ').toLowerCase();
    
    // Forces
    if (lowContent.includes('meilleurs résultats') || lowContent.includes('exemplaire')) {
      strengths.push('Excellence académique/professionnelle');
    }
    if (lowContent.includes(`${lowName}.*compétent`) || lowContent.includes('plus jeune')) {
      strengths.push('Talent exceptionnel');
    }
    if (allText.match(/je.*trouver.*moyen|solution/)) strengths.push('Résolution de problèmes');
    if (thoughts.length > 3) strengths.push('Introspection');
    if (lowContent.includes('expérience') && lowContent.includes(lowName)) strengths.push('Expérience');
    if (lowContent.includes('confiance') && !allText.includes('confiance aveugle')) {
      strengths.push('Inspire confiance');
    }
    
    // Faiblesses
    if (allText.match(/je ne.*croire|impossible/)) weaknesses.push('Difficulté à accepter la réalité');
    if (allText.match(/confiance.*père|loyal.*père/)) weaknesses.push('Loyauté aveugle (initialement)');
    if (allText.match(/je ne peux pas|tuer/)) weaknesses.push('Conflits moraux');
    if (lowContent.includes('surprise') && lowContent.includes(lowName)) weaknesses.push('Naïveté');
    if (allText.match(/seul|isolé/)) weaknesses.push('Isolement');
    
    return { 
      strengths: [...new Set(strengths)].slice(0, 4), 
      weaknesses: [...new Set(weaknesses)].slice(0, 4) 
    };
  }
  
  extractGoalsMotivations(name, dialogues, thoughts, lowContent) {
    const goals = [];
    const motivations = [];
    const lowName = name.toLowerCase();
    
    const allThoughts = thoughts.map(t => t.text).join(' ').toLowerCase();
    const allDialogues = dialogues.map(d => d.text).join(' ').toLowerCase();
    
    // Objectifs explicites dans les pensées
    if (allThoughts.match(/je dois.*sauver|protéger/)) goals.push('Sauver/protéger quelqu\'un');
    if (allThoughts.match(/trouver.*moyen|solution/)) goals.push('Trouver une alternative');
    if (allThoughts.match(/éliminer|débarrasser|mettre.*terme/)) goals.push('Éliminer une menace');
    if (allThoughts.match(/comprendre|découvrir.*vérité/)) goals.push('Découvrir la vérité');
    
    // Objectifs dans les dialogues
    if (allDialogues.match(/pour.*bien.*peuple|abri|humanité/)) goals.push('Servir le bien commun');
    if (allDialogues.match(/mission|devoir/)) goals.push('Accomplir sa mission');
    
    // Motivations (pourquoi)
    if (lowContent.includes('orphelin') && lowContent.includes(lowName)) {
      motivations.push('Prouver sa valeur (orphelin)');
    }
    if (allThoughts.match(/père.*fait.*pour/)) motivations.push('Gratitude envers une figure d\'autorité');
    if (allThoughts.match(/ami|even|ensemble/)) motivations.push('Loyauté envers ses amis');
    if (lowContent.includes('régime') || lowContent.includes('règne')) {
      motivations.push('Libérer les opprimés');
    }
    if (allDialogues.match(/confiance|fiert[ée]/)) motivations.push('Maintenir sa réputation');
    
    return {
      goals: [...new Set(goals)].slice(0, 3),
      motivations: [...new Set(motivations)].slice(0, 3)
    };
  }
  
  guessRelationship(char1, char2, lowContent) {
    const pair = `${char1.toLowerCase()}.*${char2.toLowerCase()}`;
    const pairReverse = `${char2.toLowerCase()}.*${char1.toLowerCase()}`;
    
    // Patterns de relation
    if (lowContent.match(new RegExp(`${pair}.*ami|${pairReverse}.*ami`, 'i'))) return 'Ami(e)';
    if (lowContent.match(new RegExp(`${pair}.*ennemi|${pairReverse}.*ennemi`, 'i'))) return 'Ennemi';
    if (lowContent.match(/père/) && (char1.toLowerCase() === 'keyn' || char2.toLowerCase() === 'keyn')) return 'Supérieur/Figure paternelle';
    if (lowContent.match(new RegExp(`${char1.toLowerCase()}.*sous.*ordres`))) return 'Subordonné';
    if (lowContent.match(new RegExp(`ensemble|côte à côte|équipe`))) return 'Coéquipier';
    
    return 'Connaît';
  }
  
  detectCharacterArc(name, dialogues, thoughts, actions, pages) {
    const lowName = name.toLowerCase();
    
    // Analyser l'évolution entre le début et la fin
    const totalPages = pages.length;
    const firstThird = Math.floor(totalPages / 3);
    const lastThird = totalPages - firstThird;
    
    const earlyThoughts = thoughts.filter(t => t.page <= firstThird).map(t => t.text).join(' ').toLowerCase();
    const lateThoughts = thoughts.filter(t => t.page >= lastThird).map(t => t.text).join(' ').toLowerCase();
    
    // Détecter le changement
    if (earlyThoughts.includes('confiance') && lateThoughts.includes('impossible')) {
      return 'De la confiance aveugle au doute';
    }
    if (earlyThoughts.includes('devoir') && lateThoughts.includes('choix')) {
      return 'Du devoir au libre arbitre';
    }
    if (lateThoughts.includes('sauver') || lateThoughts.includes('trouver.*moyen')) {
      return 'Prise de conscience et rébellion';
    }
    if (lateThoughts.includes('détermin')) {
      return 'Vers la détermination';
    }
    
    return null;
  }
  
  extractKeyQuotes(dialogues, thoughts) {
    const quotes = [];
    
    // Prioritiser les pensées (plus révélatrices)
    thoughts.slice(0, 3).forEach(t => {
      if (t.text.length > 20 && t.text.length < 150) {
        quotes.push({ type: 'pensée', text: t.text, page: t.page });
      }
    });
    
    // Ajouter quelques dialogues significatifs
    dialogues.filter(d => d.text.length > 30 && d.text.length < 150).slice(0, 2).forEach(d => {
      quotes.push({ type: 'dialogue', text: d.text, page: d.page });
    });
    
    return quotes.slice(0, 4);
  }
  
  generateCharacterDescription(name, role, type, traits, goals) {
    let desc = `${name} est `;
    
    if (role === 'Protagoniste') {
      desc += 'le personnage principal de l\'histoire. ';
    } else if (role === 'Antagoniste') {
      desc += 'l\'antagoniste principal. ';
    } else {
      desc += `un personnage ${type.toLowerCase()}. `;
    }
    
    if (traits.length > 0) {
      desc += `${traits.slice(0, 3).join(', ')}. `;
    }
    
    if (goals.length > 0) {
      desc += `Son objectif : ${goals[0].toLowerCase()}.`;
    }
    
    return desc;
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
    
    // Fondation de l'abri
    const shelterMatch = content.match(/(?:le père|keyn).*(?:fond|créé|constru).*abri/i);
    if (shelterMatch) {
      timeline.events.push({
        name: 'Fondation de l\'Abri',
        when: 'Peu après l\'Effondrement',
        significance: 'Création du refuge, naissance du régime'
      });
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
  
  // === ANALYSE APPROFONDIE DES LIEUX ===
  
  analyzePlaceDeep(placeName, pages, worldContext) {
    const analysis = {
      atmosphere: [],
      access: 'indéterminé',
      significance: [],
      dangerLevel: 'inconnu',
      whoGoesHere: [],
      secrets: []
    };
    
    const low = placeName.toLowerCase();
    let placeContent = '';
    
    // Collecter tout ce qui mentionne ce lieu
    pages.forEach(page => {
      if (page.location && page.location.toLowerCase().includes(low)) {
        // Tout le contenu de cette scène
        page.dialogues.forEach(d => {
          placeContent += d.text + ' ';
        });
        page.actions.forEach(a => {
          placeContent += a + ' ';
        });
        
        // Qui apparaît ici ?
        page.dialogues.forEach(d => {
          if (!analysis.whoGoesHere.includes(d.speaker)) {
            analysis.whoGoesHere.push(d.speaker);
          }
        });
      }
    });
    
    // Analyser l'atmosphère
    if (/sombre|noir|obscur|ténèbres/i.test(placeContent)) analysis.atmosphere.push('Sombre');
    if (/froid|glacial|gelé/i.test(placeContent)) analysis.atmosphere.push('Froid');
    if (/oppressant|étouff|claustro/i.test(placeContent)) analysis.atmosphere.push('Oppressant');
    if (/danger|menace|risqu/i.test(placeContent)) analysis.atmosphere.push('Dangereux');
    if (/calme|paisible|tranquil/i.test(placeContent)) analysis.atmosphere.push('Calme');
    if (/secret|cach|interdit/i.test(placeContent)) analysis.atmosphere.push('Mystérieux');
    
    // Déterminer l'accès
    if (/interdit|défendu|autoris.*seul|accès.*restreint/i.test(placeContent)) {
      analysis.access = 'Restreint';
    } else if (/public|tout le monde|commun/i.test(placeContent)) {
      analysis.access = 'Public';
    } else if (/secret|cach|personne ne sait/i.test(placeContent)) {
      analysis.access = 'Secret';
    }
    
    // Signification narrative
    if (/réuni|rassembl|cérémonie/i.test(placeContent)) {
      analysis.significance.push('Lieu de rassemblement');
    }
    if (/découvr|révél|vérité/i.test(placeContent)) {
      analysis.significance.push('Lieu de révélation');
    }
    if (/combat|affrontement|bataille/i.test(placeContent)) {
      analysis.significance.push('Lieu de confrontation');
    }
    if (/décision|choix|tournant/i.test(placeContent)) {
      analysis.significance.push('Lieu de décision cruciale');
    }
    
    return analysis;
  }
  
  // === ENRICHIR LES UPDATES AVEC LE CONTEXTE MONDE ===
  
  enrichPlaceUpdate(place, worldContext, pages) {
    const deepAnalysis = this.analyzePlaceDeep(place.name, pages, worldContext);
    
    return {
      ...place,
      atmosphere: deepAnalysis.atmosphere,
      access: deepAnalysis.access,
      significance: deepAnalysis.significance,
      frequentedBy: deepAnalysis.whoGoesHere,
      worldConnection: this.connectPlaceToWorld(place.name, worldContext)
    };
  }
  
  connectPlaceToWorld(placeName, worldContext) {
    const connections = [];
    const low = placeName.toLowerCase();
    
    // Connexion avec le système politique
    if (worldContext.politics.type !== 'indéterminé') {
      if (/salle.*commande|bureau.*père|centre.*contrôle/i.test(low)) {
        connections.push({
          aspect: 'Politique',
          connection: 'Centre du pouvoir',
          implication: 'Lieu stratégique du régime'
        });
      }
    }
    
    // Connexion avec les ressources
    if (/réserve|stockage|entrepôt|cuisine/i.test(low)) {
      connections.push({
        aspect: 'Ressources',
        connection: 'Stockage/Distribution',
        implication: 'Accès contrôlé aux ressources'
      });
    }
    
    // Connexion avec la surface/extérieur
    if (/ascenseur|sas|sortie|surface|extérieur/i.test(low)) {
      connections.push({
        aspect: 'Frontière',
        connection: 'Lien avec l\'extérieur',
        implication: 'Zone de transition, danger potentiel'
      });
    }
    
    return connections;
  }
  
  // Parsing local sans API - détection de patterns
  parseNotesLocally(notes) {
    // Détecter si c'est un script manga
    if (window.MangaParser.isMangaScript(notes)) {
      const mangaParsed = window.MangaParser.parse(notes);
      const updates = this.convertMangaToUpdates(mangaParsed);
      const aliases = window.MangaParser.aliasCandidates(mangaParsed.characters.keys());
      updates._notices = [
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
