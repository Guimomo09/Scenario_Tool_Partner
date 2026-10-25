# Project Status

## Current state
Refonte en cours selon le prompt validé
(`C:\Users\charl\Documents\Codex\2026-10-25\je-x20\outputs\Prompt-Claude-Refonte-Partner.md`, audit à côté).
**Les 4 incréments du prompt sont livrés** (fiabilité, modèle de données, Écrire + partenaire, Structure/Bible/refonte graphique).
Les projets réels sont encore au format v1 : la migration est proposée à leur ouverture (non faite).

### Histoires
| Projet | État |
|---|---|
| Origin Zero | Script jusqu'à ~p.70 dans `../Scenario_Manga/Origin_Zero.*` ; `Projets/` n'a que p.1-28 |
| Origin Mars | Story bible complète (`_PLAN.md`), protagoniste non défini (piste : héroïne) |
| Rocket League IRL | Story bible seule dans `../Scenario_Manga/`, pas de dossier `Projets/` |

## Recently completed
- Clé API chiffrée (`safeStorage`), appels IA dans le main process. Testé : l'IA répond.
- Incrément 1 :
  - Synchro/import = fusion non destructive (`src/core/project-model.js`), plus de nettoyage
    automatique au chargement/sauvegarde (`clean*` supprimés). Échec IA = rien appliqué.
  - Réponses IA validées (`validateUpdates`), limite des 8000 caractères affichée.
  - Écritures atomiques + `.bak`, résultats vérifiés, état d'enregistrement réel.
  - Notes rattachées à leur projet, vidées avant changement de projet / création / fermeture.
  - `_PROJECT.json` illisible → jamais écrasé (synchro/import bloqués, message).
  - Création de projet : nom validé, refus d'un nom existant (IPC `create-project`).
  - IPC : émetteur vérifié, chemins limités à `Projets/` et `Inbox/`.
  - Menu branché (Nouveau projet, Enregistrer, Focus, Thème, Agents, Aide) ; Ouvrir /
    Enregistrer sous / Export PDF retirés ; boutons « + » non reliés désactivés ; compteur de mots.
  - 16 tests `node:test` (fusion, homonymes, notes courtes, doublons, chemins, écriture atomique).
- Démarrage Electron vérifié sans erreur JS. Parcours UI non testés à la main.
- Incrément 2 (2026-10-25) :
  - `src/core/schema.js` : `schemaVersion` 2, identifiants stables (`pg_`, `ch_`, `td_`…) par élément,
    `planMigration` (aperçu, n'écrit rien), `verifyMigration` (aucun champ perdu/modifié),
    `findDuplicateCandidates` (doublons + noms proches, jamais fusionnés).
  - Migration proposée à l'ouverture d'un projet v1 (dialogue d'aperçu) ; refus = lecture seule des données
    structurées (analyse, import, fiches bloquées, notes OK). Acceptée = sauvegarde datée
    `_PROJECT.backup-v1-AAAAMMJJ-HHMMSS.json` puis écriture, recontrôlée par le main process (IPC `migrate-project`).
    Option explicite : convertir les rôles devinés par l'ancien parseur en `suggestedRole`.
  - Fichier › Restaurer une sauvegarde du projet… (la version remplacée est elle-même sauvegardée).
  - Format plus récent / collection non-liste → lecture seule.
  - `src/core/manga-parser.js` remplace `parseMangaScript` : chaque ligne conservée (`raw` + n° de ligne) dans
    `_blocks` ordonnés (action/dialogue/pensée/indication/unknown), préambule et intro de séquence gardés,
    page rattachée à sa séquence, page répétée réunie (avertissement), nom seul + répliques à tiret reconnu,
    aucun alias fusionné (signalé), rôle = suggestion fondée sur les répliques du perso.
    Contrôle lecture seule sur Origin Zero `_NOTES.md` : sans perte, 105 répliques, 6 pensées, 1 ligne non classée.
  - Rôles venant de l'IA → `suggestedRole` (affichés « X ? »). Doublons signalés dans « À traiter ».
  - Rendu du script manga : blocs dans l'ordre, texte échappé.
  - 44 tests `node:test` (+ schéma/migration, parseur, sauvegarde/restauration).
  - Contrôle lecture seule de la migration sur les vrais JSON : Origin Mars 106 todos / 32 doublons,
    Origin Zero 2 rôles devinés ; `verifyMigration` = 0 problème. Rien n'a été écrit.

- Incrément 3 (2026-10-25) :
  - Écrire : tous les `.md` du dossier projet sont ouvrables (liste « Documents ») ; dernier document et position
    rouverts ; bandeau projet › document › section du curseur ; mode « Écrire » par défaut (document seul au centre,
    serif 18 px, ligne ~70 car.), « Écrire + aperçu », « Aperçu » ; navigation et partenaire repliables
    (alternance sous 1 180 px). L'analyse porte toujours sur `_NOTES.md`, quel que soit le document ouvert.
  - Partenaire unique (`components/partner-panel.js`) avec intentions Explorer / Structurer / Écrire / Réviser /
    Cohérence. Faux agents (World-Builder, Veilleur, Planificateur) et lecture d'URL retirés ; CSP `connect-src 'self'`.
  - Contexte (`core/partner-context.js`) : extrait sélectionné, section active, fiches de la bible nommées dans le passage,
    canon validé, historique récent ; chaque élément visible, décochable, avec ses limites et coupes affichées.
    Le manuscrit est encadré comme contenu à analyser (instructions internes ignorées).
  - Propositions (`core/proposals.js`) : blocs `<proposition>` séparés du texte ; cible = document + position + texte exact ;
    Appliquer (vérifie que le passage n'a pas changé, sinon refus ; Ctrl+Z possible), Rejeter, Garder en variante, Copier ;
    faits proposés → « Ajouter au canon ». Pas de double application.
  - Mémoire par projet `Projets/<Nom>/_PARTNER.json` (`core/partner-store.js`) : conversations (les anciennes gardées),
    propositions et statuts, canon, dernier document. Créé seulement au premier vrai usage ; illisible → jamais réécrit.
    Réponse tardive rangée dans son projet d'origine ; annulation ; un seul envoi à la fois par conversation.
  - Main process : `lib/ai-providers.js` (requêtes, erreurs, refus, réponses tronquées, liste des modèles, annulation),
    `lib/settings.js` (une clé chiffrée + un modèle par fournisseur ; l'ancienne clé unique est rattachée au fournisseur
    alors sélectionné). Anthropic : API `2026-10-21`, défaut `claude-opus-5-5`, relance automatique sur refus de
    sécurité (`fallbacks: "default"`) pour les modèles qui l'acceptent. OpenAI : pas de modèle par défaut, choix dans
    la liste renvoyée par le compte (« Modèles disponibles »). Aucun appel payant effectué.
  - 70 tests `node:test` (+ fournisseur simulé, paramètres, contexte, propositions, mémoire).
  - Parcours vérifié dans Electron sur API simulée (projets fictifs en mémoire, IA simulée, aucun fichier réel) :
    23 contrôles OK, 0 erreur console ; captures 1000 / 1400 / 1920 px, sombre et clair, panneaux ouverts/fermés.

- Incrément 4 (2026-10-25) :
  - Trois espaces : Écrire / Structure / Bible (barre d'outils, menu Affichage, Ctrl+Maj+1/2/3). Navigation gauche :
    Documents, Scènes (numérotées, statut), À traiter (repliable). Anciens onglets du panneau gauche retirés.
  - Structure (`core/structure.js`, `components/structure-view.js`) : collection `scenes` (id `sc_`, schéma v2 inchangé,
    liste absente = vide). Scène : titre, résumé, personnages (par id), objectif, conflit, changement, statut
    (Idée/Brouillon/Révisée/Finale), notes, document + section liés, pages. Tous les champs facultatifs.
    Conducteur numéroté, filtre par statut, réordonnancement (boutons, Alt+↑/↓, glisser) sans changer d'identifiant.
    Création proposée (avec confirmation) depuis les séquences du script ou les titres `##` du document ouvert ;
    « Créer une scène ici » depuis Écrire ; « Écrire cette scène » ouvre le document à la section.
    Manga : pages par séquence, double page détectée (« PAGE 12-13 ») ou marquée par l'auteur (`spread`, conservé
    par la synchro). Lien vers une fiche supprimée : signalé, jamais retiré en silence.
  - Bandeau : document › section › « Scène 03 — titre · statut ». Le partenaire reçoit la fiche de la scène active
    (élément « Scène » visible et décochable dans le contexte, balise `<scene>` traitée comme matériau).
  - Bible (`core/bible.js`, `components/bible-view.js`) : Personnages, Lieux, Systèmes, Chronologie, Références
    (+ « Analyse automatique » en lecture seule si présente). Ajout/modification manuels (champs décrits seulement,
    autres champs conservés, listes d'objets extraites non éditables), nom existant refusé avec lien vers la fiche,
    rôle suggéré confirmé sur demande, scènes où paraît le personnage, champs extraits en lecture seule. Rendu échappé.
  - Écritures de `_PROJECT.json` : différées (800 ms), liées au projet d'origine, enchaînées ; vidées au changement
    de projet, à Ctrl+S et à la fermeture (plus d'écriture inutile ni d'erreur à la fermeture d'un projet v1).
    Projet illisible / à migrer : Structure et Bible en lecture seule, bandeau « Examiner la mise à jour du format ».
  - Refonte graphique : palette ivoire/encre/brique/olive (contrastes vérifiés ≥ 4,5:1 pour le texte), thème sombre
    charbon chaud (thème clair par défaut si aucun choix enregistré), Source Serif 4 / Source Sans 3 embarquées
    (`src/fonts/`, OFL), icônes SVG (`components/icons.js`), plus d'emoji dans l'interface, coins 2–6 px, filets.
  - Mode focus revu : bandeau et panneaux masqués, barre d'outils estompée, Échap ou bouton du bas pour sortir
    (panneaux rétablis), Ctrl+Maj+P ouvre le partenaire par-dessus.
  - Dialogues : piège du focus (Tab), saisie de nom sans styles en ligne. Aperçu structuré : titre, synopsis, arcs,
    points à traiter désormais échappés.
  - `app.js` découpé : 3 878 → 1 815 lignes (`story-bible-import.js`, `manga-analysis.js` en mixins ; anciens rendus
    des fiches supprimés, remplacés par les vues).
  - 91 tests `node:test` (+ structure, bible). Banc Electron sur API simulée (fichiers en mémoire, aucun fichier réel,
    aucune IA) : 29 contrôles OK, 0 erreur console ; captures 1000 / 1400 / 1920 px, clair et sombre, focus,
    panneaux fermés, projet v1 en lecture seule.
- Consolidation (2026-10-25) :
  - Annuler / Rétablir pour Structure et Bible : Édition › Annuler (Ctrl+Z) annule le texte dans un champ de saisie,
    sinon la dernière modification du projet (100 étapes, saisies d'un même champ regroupées) ; bouton
    « Annuler : … » dans la barre d'état. Pile vidée au changement de projet et dès que le projet est remplacé
    ailleurs (analyse, import, migration, restauration).
  - Lien scène ↔ section : renommer un titre `##` dans l'éditeur fait suivre les scènes liées (et leur titre s'il
    était identique) ; cas ambigus (plusieurs titres changés, homonymes, section ajoutée) laissés tels quels.
  - Barre d'outils d'Écrire sur une ligne de 1 000 à 1 920 px : affichage du document en liste déroulante,
    Importer / Analyser en icônes sous 1 500 px, compteur de mots dans la barre d'état.
  - `manga-analysis.js` testé (9 tests) ; corrigé : les événements de chronologie détectés n'avaient pas de
    `period` et étaient tous écartés par la validation.
  - 102 tests `node:test` ; banc Electron : 35 contrôles OK, 0 erreur console.

## Next
- **Utilisateur** : révoquer l'ancienne clé OpenAI ; tester à la main l'incrément 1.
- **Utilisateur** : ouvrir chaque projet, lire l'aperçu, accepter (ou non) la migration ; relancer
  « Synchroniser » sur Origin Zero pour obtenir les blocs ordonnés (les anciennes pages restent sinon en v1 d'affichage).
- **Utilisateur** : Paramètres › choisir le fournisseur, vérifier le modèle (bouton « Modèles disponibles »),
  puis un premier vrai échange sur un passage (premier appel payant, non fait ici).
- **Utilisateur** : tester à la main Structure, Bible et le mode focus sur un vrai projet (après migration).
- Suite possible : diffusion des réponses IA en continu, historique des conversations consultable, création/renommage
  de documents, fusion d'alias assistée, retrait de `unsafe-inline` (CSP), espace de travail hors dossier d'installation.
- Origin Zero : choisir la source de vérité (Scenario_Manga vs Projets) avant toute migration.

## Known issues
- Ancienne clé OpenAI exposée (7 mois en clair) : à révoquer.
- `_PROJECT.json` existants : doublons (Origin Mars 32 todos en trop) signalés, non nettoyés (à l'auteur).
- Propositions ancrées sur le texte des documents `.md` (position + texte exact), pas sur les blocs de `_PROJECT.json`.
- Pas de création/renommage de document depuis l'app ; documents des sous-dossiers non listés.
- Réponses IA non diffusées en continu (attente de la réponse complète, annulable) ; Markdown des réponses affiché brut.
- Contexte limité au passage, à sa section et aux fiches nommées : pas de recherche dans tout le manuscrit.
- Conversations précédentes conservées dans `_PARTNER.json` mais pas encore consultables dans l'interface.
- Analyses heuristiques du parseur (type, description, forces…) toujours écrites comme champs, pas comme suggestions.
- Pas de fusion d'alias assistée (seulement signalée).
- Parcours de migration/restauration non testés à la main dans l'UI.
- CSP : `unsafe-inline` encore nécessaire (styles/handlers en ligne de l'ancien code).
- Projets/config dépendent du dossier d'installation ; `assets/icon.png` absent (build).
- `app.js` encore gros (~1 900 lignes) ; heuristiques de `manga-analysis.js` taillées pour les projets existants (noms en dur).
- Lien scène ↔ section : un renommage fait hors de l'app, ou plusieurs titres changés d'un coup, n'est pas suivi (signalé à l'ouverture de la scène).
- Annulation Structure/Bible en mémoire seulement : perdue à la fermeture ou au changement de projet.

## Important decisions
- Ordre de travail : celui du prompt (fiabilité → modèle → Écrire/partenaire → Structure/Bible/visuel).
- Stack conservée (Electron + JS vanilla), pas de framework.
- Tests via `node:test` (aucune dépendance).
- `.github/copilot-instructions.md` reste la source canonique des conventions d'écriture.
- Git public (GitHub) : l'outil seulement, manuscrits exclus. Projets/ n'a donc PAS d'historique
  git : sauvegarde à prévoir à part (OneDrive ou dépôt privé séparé).
