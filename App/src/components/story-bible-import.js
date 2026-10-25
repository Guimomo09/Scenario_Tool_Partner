// === Import d'une Story Bible (.md) ===
// Méthodes de WritingPartnerApp, sorties d'app.js : le résultat passe par la fusion non destructive.

class StoryBibleImport {
  // === Import Story Bible ===
  async importStoryBible() {
    if (!this.currentProject) {
      this.addChatMessage('⚠️ Sélectionne d\'abord un projet.', 'assistant');
      return;
    }
    if (this.projectLoadError) {
      this.addChatMessage(`❌ Import impossible : ${this.projectLoadError}`, 'assistant');
      return;
    }
    if (!(await this.ensureMigrated())) return;

    const project = this.currentProject;

    // Créer un input file invisible
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt,.markdown';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      this.addChatMessage(`📥 Import de "${file.name}" en cours...`, 'user');

      try {
        const content = await file.text();
        if (this.currentProject?.path !== project.path) {
          this.addChatMessage(`⚠️ Import de "${file.name}" annulé : le projet a changé pendant la lecture.`, 'assistant');
          return;
        }
        const extracted = this.parseStoryBible(content);

        // Fusionner sans rien remplacer
        const { summary, notes } = this.mergeStoryBibleData(extracted);
        const saved = await this.saveProject();

        this.refreshViews();

        const changes = this.describeChanges(summary) || 'Aucun élément nouveau : le projet contenait déjà tout.';
        const extra = notes.length ? `\n\n${notes.join('\n')}` : '';
        this.addChatMessage(saved
          ? `✅ Import terminé (rien n'a été supprimé ni remplacé).\n\n${changes}${extra}`
          : `⚠️ Import appliqué à l'écran mais NON enregistré.\n\n${changes}${extra}`, 'assistant');

      } catch (error) {
        this.addChatMessage(`❌ Erreur d'import: ${error.message}`, 'assistant');
      }
    };
    
    input.click();
  }
  
  parseStoryBible(content) {
    const result = {
      synopsis: '',
      detailedSynopsis: '',
      characters: [],
      places: [],
      systems: [],
      arcs: [],
      timeline: [],
      todos: [],
      notes: []
    };
    
    const lines = content.split('\n');
    let currentSection = null;
    let currentSubsection = null;
    let currentCharacter = null;
    let currentArc = null;
    let currentPlace = null;
    let buffer = [];
    
    const flushBuffer = () => {
      if (buffer.length === 0) return '';
      const text = buffer.join('\n').trim();
      buffer = [];
      return text;
    };
    
    // Sauvegarder l'arc en cours
    const saveCurrentArc = () => {
      if (currentArc) {
        currentArc.description = flushBuffer();
        result.arcs.push(currentArc);
        currentArc = null;
      }
    };
    
    // Sauvegarder le lieu en cours
    const saveCurrentPlace = () => {
      if (currentPlace) {
        currentPlace.description = flushBuffer();
        result.places.push(currentPlace);
        currentPlace = null;
      }
    };
    
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      
      // Détecter les sections principales (## 1. SYNOPSIS, ## 3. CHARACTERS, etc.)
      const mainSectionMatch = trimmed.match(/^##\s*(?:📘|📖|👥|🌐|📚|💡)?\s*(\d+)\.\s*(.+)/i);
      if (mainSectionMatch) {
        saveCurrentArc();
        saveCurrentPlace();
        flushBuffer();
        const sectionName = mainSectionMatch[2].toUpperCase();
        
        if (sectionName.includes('SYNOPSIS') && sectionName.includes('GLOBAL')) {
          currentSection = 'synopsis';
        } else if (sectionName.includes('SYNOPSIS') && (sectionName.includes('DETAILED') || sectionName.includes('DÉTAILLÉ'))) {
          currentSection = 'detailed-synopsis';
        } else if (sectionName.includes('CHARACTER') || sectionName.includes('PERSONNAGE')) {
          currentSection = 'characters';
        } else if (sectionName.includes('WORLD') || sectionName.includes('RULES') || sectionName.includes('RÈGLES')) {
          currentSection = 'world';
        } else if (sectionName.includes('ARC') || sectionName.includes('STORY')) {
          currentSection = 'arcs';
        } else if (sectionName.includes('IDEAS') || sectionName.includes('NOTES') || sectionName.includes('IDÉES')) {
          currentSection = 'notes';
        }
        currentSubsection = null;
        currentCharacter = null;
        return;
      }
      
      // Détecter les sous-sections (### )
      const subSectionMatch = trimmed.match(/^###\s*(?:🔷|👥|🔴|🟢|🟡|🟠|⚫|🌍|💀|🚀|🦖|🔭|⚡|🔄|🔬|🎭|🧩|🧬|🔧|🚫)?\s*(.+)/);
      if (subSectionMatch) {
        saveCurrentArc();
        saveCurrentPlace();
        
        // Si on était dans un personnage, le sauvegarder
        if (currentCharacter && currentSection === 'characters') {
          result.characters.push(currentCharacter);
          currentCharacter = null;
        }
        
        currentSubsection = subSectionMatch[1].trim();
        
        // Détecter si c'est un arc (ARC 1, ARC 2, etc.)
        const arcMatch = currentSubsection.match(/^ARC\s*(\d+)[:\s]*(.+)?/i);
        if (currentSection === 'arcs' || arcMatch) {
          currentArc = {
            name: currentSubsection,
            description: '',
            number: arcMatch ? parseInt(arcMatch[1]) : result.arcs.length + 1,
            status: 'planned'
          };
        }
        
        // Détecter si c'est un lieu dans la section world
        if (currentSection === 'world') {
          const placePatterns = [
            /^(Mars|Terre|Earth|Moon|Lune)/i,
            /Mars\s*[—–-]\s*(Passé|Présent|Futur)/i,
            /Terre\s*[—–-]\s*(Passé|Présent|Futur)/i
          ];
          
          for (const pattern of placePatterns) {
            if (pattern.test(currentSubsection)) {
              currentPlace = {
                name: currentSubsection,
                description: ''
              };
              break;
            }
          }
        }
        
        // Détecter si c'est un personnage
        if (currentSection === 'characters' && 
            (currentSubsection.includes('PROTAGONISTE') || 
             currentSubsection.includes('ANTAGONISTE') ||
             currentSubsection.includes('PRINCIPAL'))) {
          currentCharacter = {
            name: '',
            role: currentSubsection,
            description: '',
            traits: []
          };
        }
        
        return;
      }
      
      // Détecter les tableaux markdown (| ... |)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed.split('|').map(c => c.trim()).filter(c => c && !c.match(/^[-:]+$/));
        
        if (cells.length >= 2) {
          // Tables de personnages ou propriétés
          if (currentCharacter && cells[0].toLowerCase().includes('nom')) {
            // Ne rien faire, c'est l'en-tête
          } else if (currentCharacter) {
            const key = cells[0].toLowerCase().replace(/\*\*/g, '');
            const value = cells[1];
            
            if (key.includes('nom')) currentCharacter.name = value;
            else if (key.includes('rôle') || key.includes('role')) currentCharacter.role = value;
            else if (key.includes('objectif')) currentCharacter.objective = value;
            else if (key.includes('conflit')) currentCharacter.conflict = value;
            else currentCharacter.description += `${key}: ${value}. `;
          }
          
          // Tables d'archétypes de personnages - SEULEMENT si c'est clairement un nom de personnage
          if (currentSection === 'characters' && !currentCharacter) {
            const cellName = cells[0].replace(/\*\*/g, '').trim();
            // Ignorer les en-têtes et les archétypes génériques
            const isHeader = /^(archétype|description|attribut|nom|rôle|role|objectif|conflit)/i.test(cellName);
            const isGenericArchetype = /^(le |la |l'|un |une )/i.test(cellName); // "Le Découvreur", "L'Autorité"
            const isSeparator = /^[-:=]+$/.test(cellName);
            
            if (!isHeader && !isGenericArchetype && !isSeparator && cellName.length > 1) {
              // Vérifier que ça ressemble à un vrai nom (pas juste un mot descriptif)
              const looksLikeName = /^[A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ]?[a-zà-ÿ]+)*$/.test(cellName);
              if (looksLikeName) {
                result.characters.push({
                  name: cellName,
                  role: 'Suggéré',
                  description: cells[1] || ''
                });
              }
            }
          }
          
          // Tables de systèmes/technologies dans la section world
          if (currentSection === 'world' && currentSubsection?.toLowerCase().includes('technologie')) {
            if (!cells[0].match(/^[-]+$/) && cells[0] !== 'Type') {
              result.systems.push({
                name: cells[0].replace(/\*\*/g, ''),
                type: 'Technologie',
                description: cells[1] || ''
              });
            }
          }
        }
        return;
      }
      
      // Détecter les points à traiter [À définir], [?], etc.
      const todoMatches = trimmed.matchAll(/\[À\s*(définir|développer|traiter|préciser)[^\]]*\]/gi);
      for (const match of todoMatches) {
        // Extraire le contexte
        let context = currentSubsection || currentSection || '';
        
        // Chercher ce qui précède le [À ...]
        const beforeTodo = trimmed.split(match[0])[0].trim();
        if (beforeTodo) {
          context = beforeTodo.replace(/\*\*/g, '').replace(/[|:]/g, '').trim();
        }
        
        result.todos.push({
          title: context ? `Définir ${context}` : match[0],
          context: currentSubsection || currentSection || '',
          section: currentSection
        });
      }
      
      // Questions ouvertes (lignes commençant par - [ ] ou checkbox)
      const questionMatch = trimmed.match(/^-\s*\[\s*\]\s*(.+)/);
      if (questionMatch) {
        result.todos.push({
          title: questionMatch[1],
          context: currentSubsection || currentSection || '',
          section: currentSection
        });
        return;
      }
      
      // Ajouter au buffer pour capturer le contenu des arcs/lieux
      if (trimmed && !trimmed.match(/^[━─═]+$/) && !trimmed.match(/^\*Dernière/) && !trimmed.startsWith('---')) {
        // Pour les arcs, capturer les bullet points
        if (currentArc && trimmed.startsWith('-')) {
          buffer.push(trimmed.substring(1).trim());
        } 
        // Pour les lieux, capturer aussi les bullet points
        else if (currentPlace && trimmed.startsWith('-')) {
          buffer.push(trimmed.substring(1).trim());
        }
        // Synopsis
        else if (currentSection === 'synopsis' && !trimmed.startsWith('>')) {
          result.synopsis += trimmed + ' ';
        }
      }
    });
    
    // Sauvegarder les derniers éléments en cours
    if (currentArc) {
      currentArc.description = buffer.join(' • ');
      result.arcs.push(currentArc);
    }
    
    if (currentPlace) {
      currentPlace.description = buffer.join(' • ');
      result.places.push(currentPlace);
    }
    
    if (currentCharacter) {
      result.characters.push(currentCharacter);
    }
    
    // Nettoyer le synopsis
    result.synopsis = result.synopsis.trim();
    
    // Déduplication
    result.characters = result.characters.filter(c => c.name && c.name !== '[À définir]');
    result.todos = result.todos.filter((t, i, arr) => 
      arr.findIndex(x => x.title === t.title) === i
    );
    result.arcs = result.arcs.filter((a, i, arr) =>
      arr.findIndex(x => x.name === a.name) === i
    );
    
    return result;
  }
  
  // Fusion non destructive d'un import : rien d'existant n'est remplacé
  mergeStoryBibleData(extracted) {
    const notes = [];

    if (extracted.synopsis) {
      if (!this.projectData.synopsis) {
        this.projectData.synopsis = extracted.synopsis;
      } else if (this.projectData.synopsis.trim() !== extracted.synopsis.trim()) {
        notes.push('Synopsis différent de l\'existant : conservé tel quel, non remplacé.');
      }
    }

    const summary = this.applyUpdates({
      character_updates: (extracted.characters || []).filter(c => c.name),
      place_updates: extracted.places || [],
      system_updates: extracted.systems || [],
      timeline_updates: extracted.timeline || [],
      todos: extracted.todos || []
    });

    if (extracted.arcs?.length) {
      const result = window.ProjectModel.mergeByKey(
        this.projectData.arcs || [], extracted.arcs, a => window.ProjectModel.normalize(a.name)
      );
      this.projectData.arcs = result.list;
      if (result.added || result.updated) summary.arcs = { added: result.added, updated: result.updated };
    }

    return { summary, notes };
  }
}

window.StoryBibleImport = StoryBibleImport;
