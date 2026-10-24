# CLAUDE.md — Partner (atelier d'écriture)

## Project
Atelier d'écriture créative (manga, scénarios, séries) : projets d'histoires en Markdown
+ une app de bureau "Writing Partner" (Electron) qui les gère avec des agents IA.
Répondre et rédiger **en français** (l'utilisateur mélange FR/EN).

## Stack
- Contenu : Markdown + `_PROJECT.json` (généré par l'app) dans `Projets/<Nom>/`
- App : Electron 28, JS vanilla (pas de framework, pas de build front), `marked`, `highlight.js`
- IA dans l'app : appels OpenAI / Anthropic faits dans le main process (IPC `ai-chat`) ;
  clé chiffrée via `safeStorage`, jamais envoyée au renderer (qui ne voit que `hasApiKey`)

## Environments
- Local uniquement. Pas de staging, pas de prod, pas de déploiement.
- Les "données de prod" = les textes de l'utilisateur dans `Projets/` et `../Scenario_Manga/`.
  Ne jamais écraser ou réécrire un texte d'histoire sans demande explicite.

## Important paths
- `App/main.js` — process Electron, IPC fichiers/settings (chemins relatifs à `Partner/`)
- `App/src/components/app.js` — logique UI (~4000 lignes, un seul fichier) :
  lire par plage/Grep sur le nom de méthode, jamais en entier
- `App/src/core/project-model.js` — fusion non destructive des extractions (testée, sans DOM)
- `App/lib/safe-fs.js` — écriture atomique + `.bak`, périmètre des chemins IPC (Projets/, Inbox/)
- `App/settings.json` — contient la clé API chiffrée (`apiKeyEnc`), non lisible par Claude,
  voir `settings.example.json`. Ne jamais réintroduire de clé en clair.
- `Projets/<Nom>/` — un dossier par histoire (`_PLAN.md`, `_PERSONNAGES.md`, `_NOTES.md`, `_PROJECT.json`)
- `../Scenario_Manga/` — scripts complets hors workspace (référencés dans `LIENS.md`).
  **Source de vérité du script Origin Zero** : `../Scenario_Manga/Origin_Zero.docx/.txt`
  (la copie dans `Projets/Origin Zero/_NOTES.md` s'arrête à la page 28)
- `Templates/` — modèles de fichiers de projet
- `.github/` — agents & instructions **GitHub Copilot** (pas Claude). Conventions d'écriture,
  structure de projet et statuts : `.github/copilot-instructions.md` (source canonique)

## Core rules
- Ne jamais lire, afficher ou copier la valeur d'un secret (settings.json, .env).
- `_PROJECT.json` est écrit par l'app : ne pas l'éditer à la main sauf demande (risque de doublons).
- Aucune extraction (parsing, IA, import) ne supprime, remplace ou fusionne implicitement des
  données existantes : passer par `ProjectModel.applyUpdates`. Échec IA = aucune modification.
- Toute écriture vérifie son résultat ; « Enregistré » seulement après confirmation.
- Ne pas modifier le code de l'app pendant une tâche d'écriture, et inversement.
- Suivre la nomenclature de `.github/copilot-instructions.md` pour tout nouveau fichier de projet.

## Workflow
- Installer : `cd App && npm install` (ou `App/Installer.bat`)
- Lancer : `cd App && npm start` — dev avec DevTools : `npm run dev`
- Build : `npm run build:win`
- Tests : `cd App && npm test` (`node:test`, fixtures fictives seulement, jamais les manuscrits)
- Lancer Electron depuis le terminal VS Code : `env -u ELECTRON_RUN_AS_NODE npm start`
  (VS Code définit cette variable, sinon `app` est undefined)

## Claude efficiency rules
- Ordre : demande → CLAUDE.md → PROJECT_STATUS.md si besoin → fichiers ciblés → Grep ciblé.
- Ne pas scanner tout le repo, les dossiers parents, ni `App/node_modules/`.
- Pas de subagent (Explore/Plan/general-purpose) pour une tâche locale : Grep/Glob/Read direct.
  Subagents réservés aux analyses réellement larges ou parallèles.
- Pas de `/run`, de lancement de l'app ni d'automation navigateur sauf demande explicite
  ou bug runtime impossible à vérifier statiquement. L'utilisateur teste lui-même l'UI.
- Ne pas charger de gros fichiers "au cas où" (`app.js`, `_PROJECT.json`, scripts complets).
- Tâche longue : proposer `/compact`. Fin d'étape : mettre à jour PROJECT_STATUS.md,
  puis `/clear` possible. CLAUDE.md seulement si une règle permanente change.
- Tâches simples : modèle standard, effort moyen. Raisonnement poussé seulement si nécessaire.

## Git
Remote : https://github.com/Guimomo09/Scenario_Tool_Partner (**public**), branche `main`.
Jamais versionnés : `Projets/*`, `Inbox/NOTES.md` (manuscrits), `settings.json`, `.bak`.
Commit/push uniquement sur demande, après vérif `git status`/`git diff` et absence de secret.
