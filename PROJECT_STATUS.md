# Project Status

## Current state
Refonte en cours selon le prompt validé
(`C:\Users\charl\Documents\Codex\2026-10-25\je-x20\outputs\Prompt-Claude-Refonte-Partner.md`, audit à côté).
**Incrément 1/4 (fiabilité des données) terminé.** Prochain : incrément 2 (modèle de données).

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

## Next
- **Utilisateur** : révoquer l'ancienne clé OpenAI ; tester à la main l'incrément 1.
- Incrément 2 : identifiants stables, version de schéma, migration réversible avec sauvegarde,
  texte source conservé, parseur sans perte (ordre des blocs, séquences), rôles = suggestions.
- Incrément 3 : parcours Écrire + partenaire unique contextualisé (conversations persistées,
  contexte visible, propositions accepter/rejeter/variante), modèles configurables, clé par fournisseur.
- Incrément 4 : Structure + Bible, refonte graphique (palette ivoire/encre/brique, Source Serif/Sans).
- Origin Zero : choisir la source de vérité (Scenario_Manga vs Projets) avant toute migration.

## Known issues
- Ancienne clé OpenAI exposée (7 mois en clair) : à révoquer.
- `_PROJECT.json` existants : doublons (Origin Mars 106 todos dont 32 titres répétés), non nettoyés
  volontairement → à exposer comme candidats dans l'incrément 2.
- Parseur manga (`parseMangaScript`) : lignes perdues, ordre action/dialogue perdu, page mal
  rattachée au changement de séquence, rôles devinés.
- Propriétés d'entités injectées sans échappement dans `innerHTML` (vues Bible/scénario).
- CSP large (`unsafe-inline`, `connect-src https://*` pour le Veilleur).
- Veilleur : lit une URL depuis le renderer, pas de vraie recherche web.
- Chat sans historique ni contexte narratif ; modèles codés en dur dans `main.js`
  (`claude-3-sonnet-20240229` retiré) ; une seule clé pour tous les fournisseurs.
- Projets/config dépendent du dossier d'installation ; `assets/icon.png` absent (build).
- `app.js` monolithique.

## Important decisions
- Ordre de travail : celui du prompt (fiabilité → modèle → Écrire/partenaire → Structure/Bible/visuel).
- Stack conservée (Electron + JS vanilla), pas de framework.
- Tests via `node:test` (aucune dépendance).
- `.github/copilot-instructions.md` reste la source canonique des conventions d'écriture.
- Sauvegarde pré-refonte (code + Projets/) dans le scratchpad de la session du 2026-10-25 (temporaire).
