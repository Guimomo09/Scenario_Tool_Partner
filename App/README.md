# Writing Partner — Application

Application de bureau pour écriture créative avec agents IA intégrés.

## 🚀 Installation

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou plus récente)

### Installation

1. **Ouvre un terminal dans ce dossier** (`App/`)

2. **Installe les dépendances** :
   ```bash
   npm install
   ```

3. **Lance l'application** :
   ```bash
   npm start
   ```

### Créer un installateur

Pour créer un `.exe` (Windows), `.dmg` (Mac) ou `.AppImage` (Linux) :

```bash
# Windows
npm run build:win

# Mac
npm run build:mac

# Linux
npm run build:linux
```

L'installateur sera dans le dossier `dist/`.

---

## 📖 Utilisation

### Interface

```
┌────────────────────────────────────────────────────────────┐
│                    Writing Partner                          │
├──────┬───────────────────────────────────────┬─────────────┤
│      │                                       │             │
│  📁  │                                       │   Agents    │
│Files │         Zone d'écriture              │  ✍️ Partner │
│      │                                       │  🌍 World   │
│  👤  │                                       │  🔍 Veilleur│
│Perso │                                       │  📋 Planner │
│      │                                       │             │
│  🌍  │                                       │ ─────────── │
│World │                                       │             │
│      │                                       │    Chat     │
│  📅  │                                       │             │
│Time  │                                       │             │
│      │                                       │             │
│  📝  │                                       │             │
│Notes │                                       │             │
├──────┴───────────────────────────────────────┴─────────────┤
│ Ligne 1, Col 1                                          ● │
└────────────────────────────────────────────────────────────┘
```

### Raccourcis Clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl+S` | Sauvegarder |
| `Ctrl+N` | Nouveau fichier |
| `Ctrl+O` | Ouvrir |
| `Ctrl+B` | Gras |
| `Ctrl+I` | Italique |
| `Ctrl+1` | Writing Partner |
| `Ctrl+2` | World-Builder |
| `Ctrl+3` | Veilleur |
| `Ctrl+4` | Planificateur |
| `F11` | Mode Focus |
| `Ctrl+/` | Aide |

### Modes IA

1. **API Directe** (recommandé)
   - Va dans ⚙️ Paramètres
   - Choisis OpenAI ou Anthropic
   - Colle ta clé API
   - Les agents répondent directement dans l'app

2. **Mode Manuel** (gratuit)
   - Choisis "Manuel" dans les paramètres
   - L'app génère un prompt à copier
   - Colle dans ChatGPT/Claude et récupère la réponse

### Obtenir une Clé API

- **OpenAI** : [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Anthropic** : [console.anthropic.com](https://console.anthropic.com)

Coût estimé : ~5€/mois pour une utilisation normale.

---

## 🔧 Structure

```
App/
├── main.js          # Processus Electron principal
├── preload.js       # Bridge sécurisé
├── package.json     # Dépendances
├── src/
│   ├── index.html   # Interface
│   ├── components/
│   │   └── app.js   # Logique principale
│   └── styles/
│       ├── main.css
│       ├── editor.css
│       └── agents.css
└── assets/          # Icônes etc.
```

---

## 🐛 Problèmes Courants

### "npm not found"
→ Installe Node.js depuis [nodejs.org](https://nodejs.org)

### Erreur API
→ Vérifie ta clé API dans les paramètres

### L'app ne se lance pas
→ Supprime `node_modules/` et refais `npm install`

---

## 📝 Développement

```bash
# Lancer en mode développement (avec DevTools)
npm run dev
```
