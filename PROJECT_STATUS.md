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
| L'ABRI | Projet créé le 2026-10-26 : `_NOTES.md` = copie exacte de `../Scenario-main/L'ABRI_dialogues_complets.md` (p.1-70, pages 30-34 absentes du texte). Pas encore analysé. Lien avec Origin Zero (mêmes personnages) à trancher par l'auteur |
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
- Format Markdown des scripts (2026-10-26) : le parseur reconnaît `## Séquence`, `### Page`, `### Double page 40-41`,
  noms en gras (`**Ari (pensée):**`) suivis de répliques en liste ou sur la même ligne, séparateurs `---`, emphase
  (`**FIN**`). Texte d'origine gardé ligne à ligne. Voix off = réplique hors champ (plus une pensée). Pages manquantes
  signalées. « Côte à côte : … » n'est plus pris pour un locuteur. Contrôle lecture seule sur L'ABRI : 6 séquences,
  60 pages, 197 répliques, 17 pensées, 0 ligne non classée, sans perte. 108 tests.
- Passage ciblé (2026-10-26) : une sélection dans le document reste ciblée pour le partenaire après un clic ailleurs
  (surlignage brique sous le texte, barre « Passage ciblé » avec Voir / ×) ; retirée par ×, Échap dans le texte,
  changement de document ou si le passage lui-même est modifié (avis) ; suit les modifications faites autour.
  109 tests ; banc Electron 35 + 9 contrôles OK.
- Sélection groupée (2026-10-26) : cases à cocher sur les scènes (Structure) et les fiches (Bible), « Tout
  sélectionner », Maj+clic pour une plage, bouton « Supprimer (N) » à côté d'« Ajouter » (sans case cochée : la
  scène / fiche ouverte), Suppr sur une scène ; une confirmation, une seule étape Ctrl+Z. 111 tests ; banc 35 + 9 OK.
- Lanceur (2026-10-26) : nouvelle icône (ivoire, « P » Source Serif, marge et repère brique) en `assets/icon.svg/.png/.ico` ;
  raccourcis Bureau + menu Démarrer qui lancent `electron.exe` sur le dossier `App` (pas de console), créés par
  `App/Creer-Raccourcis.ps1` (ou `CreerRaccourciBureau.bat`) ; fenêtre « Partner », identité Windows
  `com.partner.writing`, une seule instance (relancer ramène la fenêtre). Vérifié : ouverture par l'Explorateur OK.
- Correctif clé API (2026-10-26) : le renommage `app.setName('Partner')` du lanceur avait déplacé le dossier de
  données (`%APPDATA%\Partner`), rendant la clé enregistrée indéchiffrable (« Aucune clé OpenAI enregistrée »).
  Dossier fixé à `%APPDATA%\writing-partner` ; une clé illisible est désormais signalée comme telle.

- Compréhension narrative — incrément 1 (2026-10-26, prompt « compréhension narrative, critique et bible riche ») :
  constats de l'audit double-check vérifiés dans le code : contamination (`manga-analysis.js`), perte des corrections IA
  (`mergeUpdates`/`dedupeByKey`), catégories perdues, erreurs anciennes bloquées (`mergeFields`), lieux jamais détectés
  (`page.location` absent, objets concaténés) : **tous confirmés, corrigés**.
  - `core/provenance.js` : provenance par champ interprétatif (`_prov` : origine auteur/parseur/ia/import, statut
    à vérifier/accepté/rejeté/obsolète, source document/page/ligne/extrait). Champ ancien sans provenance =
    « provenance non renseignée · à vérifier » (ni validé, ni faux). Collection `reviews` (id `rv_`, liste absente = vide).
  - Fusion : un champ vide est complété (à vérifier) ; une valeur différente ou un élément de liste nouveau devient une
    proposition « À examiner », jamais un remplacement ni un cumul. Proposition tranchée jamais recréée ; accepter un
    remplacement écarte l'ancienne valeur ; « Retirer » mémorise la valeur rejetée (pas réintroduite) ; une proposition
    dont la valeur a changé devient obsolète. Une extraction ne peut pas se déclarer saisie de l'auteur (`origin`/`_prov` ignorés).
  - `ProjectModel.combineExtractions` remplace `mergeUpdates` : local et IA gardent leur origine, toutes les catégories
    (séquences, contexte, indices) passent ; une page résumée par l'IA ne remplace pas le texte du parseur.
  - Analyse locale : plus aucun trait/force/objectif/motivation/relation/arc/description/type déduit de mots, plus de
    fiches « Systèmes » créées par mots-clés, plus de règle sur un nom propre (`keyn`). Observations sourcées seulement :
    répliques, pensées, pages de présence (réplique ou nom dans une action), extraits avec page/ligne, « sur les mêmes pages
    (pas une relation) ». Personnages de la bible muets retrouvés par leur nom ; alias confirmé d'une seule fiche →
    cette fiche, alias ambigu → séparé et signalé. Lieux de la bible : phrases d'action qui les nomment, atmosphère lue
    dans ces phrases seulement, avec extrait. Chronologie : seulement une durée explicite, avec son extrait.
  - Bible : champ « Alias confirmés » (personnages) / « Autres noms » (lieux) ; saisie dans le formulaire = auteur/accepté ;
    sous chaque champ non validé, une ligne discrète (origine · statut · source) avec Valider / Retirer ; bloc « À examiner »
    (Remplacer/Ajouter, Rejeter) ; filtre « À examiner (N) » ; tout est annulable (Ctrl+Z).
  - Contexte du partenaire : chaque champ porte son statut (« IA · à vérifier — lecture non validée par l'auteur ») et sa
    source ; observations marquées comme telles ; fiches retrouvées aussi par alias.
  - 128 tests (+17 `test/understanding.test.js` : cas 1, 2, 3 partiel, 5, 6, 8, 9 du prompt + fusion/révision).
    Contrôle lecture seule sur L'ABRI `_NOTES.md` : 60 pages, 6 séquences, 7 locuteurs, 0 interprétation, 0 système.
    Rendu de la fiche contrôlé hors app (DOM simulé). Application non relancée, parcours UI non testés à la main.

- Compréhension narrative — incrément 2 (2026-10-26) : sources, unités, couverture, affirmations.
  - `core/claims.js` : affirmation = sujet (personnage/lieu/groupe/objet/système/relation/scène/récit, + second personnage
    pour une relation), nature (événement montré / parole rapportée / croyance / interprétation / intention d'auteur /
    proposition), aspect (objectif, peur, connaissance, opposition, cause, révélation, question…), statut, origine,
    source (document, version, unité, lignes, extrait), point du récit, justification, lecture concurrente.
    Citation obligatoire et retrouvée dans le texte réel (sinon écartée) ; une réplique ou une pensée citée comme
    « événement montré » est requalifiée en parole/croyance ; parole attribuée au mauvais locuteur refusée ;
    intention d'auteur venant de l'IA refusée. Rejetée = jamais recréée ; correction = ancienne rejetée + saisie auteur.
  - `core/understanding.js` + mémoire `Projets/<Nom>/_COMPREHENSION.json` (illisible → jamais réécrite) :
    sources du projet (sous-dossiers sur 2 niveaux) avec rôle choisi (fait autorité / brouillon / référence / non retenu ;
    par défaut seul `_NOTES.md` est retenu), version (empreinte), doublons exacts (lus une fois) et versions candidates
    (≥ 50 % de lignes communes ; deux autorités proches = lecture bloquée). Découpage complet : script = une unité par
    séquence (coupée aux pages au-delà de 9 000 car.), autre texte = sections `#`/`##` regroupées ; chaque ligne non vide
    dans une seule unité (contrôlé), préambule gardé, pages absentes signalées. Couverture par unité et document,
    « partielle » tant que tout n'est pas lu ; reprise = unités non lues / en échec / modifiées seulement ; cache par
    texte + traitement + modèle ; texte modifié → lectures non tranchées obsolètes, validées gardées mais signalées ;
    réponse arrivée après une modification ignorée. Consolidation : alias confirmé → fiche, alias ambigu → question.
  - Espace **Lecture** (4ᵉ onglet, Ctrl+Maj+4, `components/understanding-view.js`) : sources et rôles, « Lire le projet »
    (confirmation avec nombre d'unités et de caractères, une unité par appel, annulable), couverture et unités
    (écartées / requalifiées consultables), « Voici ce que je comprends de ton histoire » (personnages centraux et ce
    qu'ils veulent, oppositions, causes et révélations, événements montrés, zones non résolues, questions décisives)
    construit uniquement depuis les lectures sourcées, et liste des lectures à Valider / Rejeter / Corriger / remettre
    à vérifier, avec lien vers la ligne du document.
  - « Analyser les notes » : fin du préfixe de 8 000 caractères, l'IA lit tout `_NOTES.md` partie par partie ; une partie
    en échec = rien de l'IA appliqué (parties lues gardées en mémoire de session pour la relance).
  - 145 tests (+17 `test/comprehension.test.js` : cas 3, 4, 5, 6, 7, 8 du prompt). Banc Electron sur API simulée
    (projet fictif en mémoire, IA simulée, aucun fichier réel) : 18 contrôles OK, 0 erreur console, captures 1000 / 1400 px,
    clair et sombre. Découpage contrôlé en lecture seule sur les `_NOTES.md` réels (couverture complète, rien écrit).
    Aucun appel IA réel : la qualité de lecture d'un vrai modèle n'est pas évaluée.

- Compréhension narrative — incrément 3 (2026-10-26) : mémoire narrative → partenaire, fiches, intentions, critique.
  - `core/recall.js` : à chaque demande, retrouve les personnages/lieux en jeu (nom, alias confirmé, fiches liées à la
    scène active même non nommées), leurs lectures (validées d'abord, « à vérifier » marquées, rejetées/obsolètes jamais
    envoyées, source citée), les **connaissances au point du récit** (unité du curseur : ce que chaque personnage sait/croit,
    ce qu'il NE SAIT PAS ENCORE, ce que le lecteur a appris, ce qui est révélé plus tard), l'évolution des relations dans
    l'ordre du récit (« une étape nouvelle n'est pas une incohérence »), et les **unités pertinentes au-delà de la section
    active** (personnages présents, lectures liées, mots de la demande ; 8 unités en Structurer/Cohérence, 3 en Réviser,
    1 en Écrire, budget 30 000 car.). Le document ouvert est relu depuis l'éditeur. Bloc « Périmètre consulté » toujours
    envoyé (couverture, partielle ou non, passages joints et pourquoi, non consulté, « sources insuffisantes » le cas échéant).
  - Contexte du partenaire : nouveaux éléments visibles/décochables (Intentions, Décisions, Lectures, Connaissances,
    Passages), balises `<lectures>`, `<connaissances>`, `<intentions>`, `<decisions>`, `<perimetre>` traitées comme matériau ;
    la demande en cours de saisie oriente l'aperçu.
  - **Intentions de l'auteur** (Lecture › « Mes intentions », stockées dans `_COMPREHENSION.json`) : ton, thème, expérience,
    voix, ambiguïté volontaire, à préserver, piste ouverte ; facultatif « concerne » et passage exact (bouton « Utiliser le
    passage ciblé »). Saisie auteur seulement, modifiable, retirable avec confirmation.
  - **Critique** (`core/critique.js`) pour Structurer / Réviser / Cohérence : rappel de l'intention et du périmètre, blocs
    `<remarque nature="erreur|lisibilite|preference|ambiguite|question">` (constat, passages, raisonnement, effet, pistes,
    question), consignes anti-diagnostic générique, abstention permise. Chaque passage cité est cherché dans le contexte
    réellement envoyé : introuvable → « non étayée » ; passage marqué ambiguïté volontaire → « à lire comme une question ».
    Cartes de remarque dans la conversation : « Retenir » / « Je maintiens mon choix » → décision dans `_PARTNER.json`
    (`decisions`), renvoyée aux demandes suivantes, listée (et oubliable) dans le tiroir Canon. Le texte n'est jamais modifié.
  - **Bible** : fiche Personnage/Lieu › « Lectures du projet » (alias compris) : validées, « ce qu'il ou elle apprend, dans
    l'ordre du récit », à vérifier repliées ; Valider / Rejeter / Corriger (ouvre Lecture) / lien vers la ligne source.
    Même mémoire que l'espace Lecture.
  - **Protocole d'évaluation** : `App/eval/` (PROTOCOLE.md, 4 scénarios fictifs à attentes humaines : attendu, interdit,
    indéterminé, pas-avant, entité ; notation hors ligne `npm run eval:lecture -- prompts|score|demo`). Aucun appel IA ;
    `demo` = réponses simulées (prudente : 15/15 ; contaminée : défauts relevés). Sorties dans `App/eval/out/` (ignoré par git).
  - 161 tests (+12 `test/recall.test.js` : cas 4 et 10 du prompt, contexte, intentions, décisions ; +4 `test/reading-eval.test.js`).
    Banc Electron sur API simulée (projet fictif en mémoire, IA simulée) : 15 contrôles OK, 0 erreur console ; captures
    1000 / 1400 px, clair et sombre. Aucun appel IA réel, application non testée à la main.

## Next
- **Compréhension, incrément 4** : bible riche (sections dépliables personnages / lieux / systèmes, correction depuis la
  fiche des champs extraits) et images/références locales (`media/` du projet, index, galerie, inspiration vs design validé).
- **Utilisateur** : Lecture › « Mes intentions » sur L'ABRI (ton, ambiguïtés volontaires…), puis une question en
  Cohérence ou Structurer : vérifier le « Contexte envoyé » et les remarques (premier appel payant).
- **Utilisateur** (facultatif) : `npm run eval:lecture -- prompts eval/out`, envoyer les consignes au modèle choisi, puis `score`.
- **Utilisateur** : ouvrir L'ABRI › Lecture, choisir les sources, « Lire le projet » (premier appel payant : ~7 unités),
  puis valider / rejeter / corriger les lectures.
- **Utilisateur** : relancer « Analyser les notes » sur un projet, ouvrir Bible › « À examiner », essayer Valider / Retirer.
- **Utilisateur** : révoquer l'ancienne clé OpenAI ; tester à la main l'incrément 1.
- **Utilisateur** : ouvrir chaque projet, lire l'aperçu, accepter (ou non) la migration ; relancer
  « Synchroniser » sur Origin Zero pour obtenir les blocs ordonnés (les anciennes pages restent sinon en v1 d'affichage).
- **Utilisateur** : Paramètres › choisir le fournisseur, vérifier le modèle (bouton « Modèles disponibles »),
  puis un premier vrai échange sur un passage (premier appel payant, non fait ici).
- **Utilisateur** : ouvrir L'ABRI, « Analyser les notes », puis Structure › « Créer depuis les séquences ».
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
- Recherche des passages pertinents : locale et lexicale (noms, alias, mots de la demande), limitée aux sources
  retenues dans Lecture ; les autres documents ouverts ne sont relus qu'au rafraîchissement de Lecture (le document
  ouvert, lui, est toujours à jour). Pas de recherche sémantique.
- Remarques critiques : on vérifie que les passages cités existent, pas que le raisonnement est juste. Ambiguïté
  volontaire reconnue seulement si elle est ancrée sur un passage.
- Lectures validées visibles dans la fiche, mais pas encore recopiées dans ses champs (Objectifs, etc.) : incrément 4.
- Conversations précédentes conservées dans `_PARTNER.json` mais pas encore consultables dans l'interface.
- Fiches déjà enregistrées : les anciennes déductions du parseur restent affichées « provenance non renseignée · à vérifier »
  jusqu'à décision de l'auteur (Valider / Retirer) ; aucune n'a été supprimée.
- Bible › Analyse automatique (contexte du monde, indices) : toujours des indices lexicaux, présentés comme hypothèses.
- Lecture : la synthèse est structurée (pas de résumé rédigé par l'IA). Sources hors du dossier du projet
  (`../Scenario_Manga/`) non lisibles.
- Le parseur ne prend pas pour locuteur un nom commençant par un article (« Le Voyageur ») : garde-fou existant.
- Pas de fusion d'alias assistée (seulement signalée).
- Parcours de migration/restauration non testés à la main dans l'UI.
- CSP : `unsafe-inline` encore nécessaire (styles/handlers en ligne de l'ancien code).
- Projets/config dépendent du dossier d'installation : pas d'installeur (electron-builder) tant que l'espace de travail n'est pas séparé ; le raccourci pointe vers le dossier actuel (à recréer si déplacé).
- `app.js` encore gros (~1 900 lignes).
- Lien scène ↔ section : un renommage fait hors de l'app, ou plusieurs titres changés d'un coup, n'est pas suivi (signalé à l'ouverture de la scène).
- Annulation Structure/Bible en mémoire seulement : perdue à la fermeture ou au changement de projet.

## Important decisions
- Ordre de travail : celui du prompt (fiabilité → modèle → Écrire/partenaire → Structure/Bible/visuel).
- Stack conservée (Electron + JS vanilla), pas de framework.
- Tests via `node:test` (aucune dépendance).
- `.github/copilot-instructions.md` reste la source canonique des conventions d'écriture.
- Git public (GitHub) : l'outil seulement, manuscrits exclus. Projets/ n'a donc PAS d'historique
  git : sauvegarde à prévoir à part (OneDrive ou dépôt privé séparé).
