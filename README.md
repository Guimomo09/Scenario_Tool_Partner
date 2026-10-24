# Atelier d'Écriture — Guide de Démarrage

Bienvenue dans ton atelier d'écriture créative ! Ce workspace est configuré pour t'accompagner dans tes projets de mangas, scénarios et séries.

## 🚀 Démarrage Rapide

### Créer un Nouveau Projet

1. **Invoque le Planificateur** : `@Planificateur`
2. **Dis-lui** : "Nouveau projet : [nom du projet]"
3. Il créera automatiquement la structure de dossiers

Ou manuellement :
```
Projets/Mon-Projet/
├── _PLAN.md           ← Copier depuis Templates/PLAN.md
├── _PERSONNAGES.md    ← Copier depuis Templates/PERSONNAGES.md
├── World/
│   └── _INDEX.md      ← Copier depuis Templates/WORLD-INDEX.md
├── Arcs/
│   └── Arc-01/
│       ├── _overview.md
│       └── ch-01.md
└── Notes/
```

---

## 🤖 Tes Agents

### @Writing Partner
Ton partenaire d'écriture principal — **créatif ET critique**.

**Mode Créatif** :
- Rédige des chapitres, scènes, dialogues
- Propose des alternatives stylistiques

**Mode Critique** (nouveau!) :
- Analyse avec un œil de lecteur neuf
- Pointe les incohérences et zones d'ombre  
- Questionne pour renforcer la qualité

**Commandes** :
| Commande | Action |
|----------|--------|
| `Continue` | Reprend l'écriture |
| `Alternative` | Autre version |
| `Feedback` | Analyse complète |
| `Questions` | Pose toutes ses questions |
| `Incohérences` | Cherche les contradictions |
| `Inbox` | Traite les notes rapides |

### @World-Builder
L'architecte de ton univers.
- Crée lieux, systèmes, cultures, créatures
- Développe le lore en détail
- Vérifie la cohérence du world-building

### @Veilleur
L'agent de recherche et veille.
- Recherche dans tes fichiers
- Vérifie les incohérences
- Fait de la recherche externe

### @Planificateur
L'architecte narratif.
- Planifie arcs et chapitres
- Organise la structure du projet
- Suit la progression

---

## 📥 Inbox — Notes Rapides

Note des idées depuis **n'importe où** (Word, Bloc-notes, téléphone) :

1. Ouvre `Inbox/NOTES.md`
2. Note ton idée
3. Dis `@Writing Partner inbox` quand tu reviens sur VS Code

Voir [Inbox/_LISEZ-MOI.md](Inbox/_LISEZ-MOI.md) pour les détails.

---

## 🌐 Usage Hors VS Code

### Prompts Portables
Des prompts prêts à copier dans ChatGPT/Claude :
- `Portable/PROMPT-CHATGPT.md` — Writing Partner
- `Portable/PROMPT-WORLDBUILDER.md` — World-Builder

### Synchronisation OneDrive
Pour accéder à tout depuis partout :
1. Déplace le dossier `Partner` dans `OneDrive`
2. Accède à `Inbox/NOTES.md` depuis ton téléphone
3. Utilise les prompts portables dans n'importe quelle IA

---

## 🔗 Fichiers Externes

Tes scénarios ailleurs sont référencés dans [LIENS.md](LIENS.md).

Le Writing Partner peut y accéder directement :
```
@Writing Partner Analyse Origine Martienne
```

---

## 📁 Structure des Fichiers

### Conventions de Nommage
- Minuscules avec tirets : `arc-01`, `ch-03`
- Index préfixés par `_` : `_PLAN.md`
- Numérotation sur 2 chiffres : `01`, `02`

### Dossiers
```
Partner/
├── Inbox/          ← Notes rapides (accessible partout)
├── Portable/       ← Prompts pour ChatGPT/Claude
├── Projets/        ← Tes projets organisés
├── Templates/      ← Modèles de fichiers
├── Veille/         ← Recherches et références
└── LIENS.md        ← Références aux fichiers externes
```

### Templates Disponibles
- `Templates/PLAN.md` — Plan de projet
- `Templates/PERSONNAGES.md` — Fiches personnages
- `Templates/WORLD-INDEX.md` — Index d'univers
- `Templates/ARC-OVERVIEW.md` — Vue d'ensemble d'arc
- `Templates/CHAPITRE.md` — Structure de chapitre

---

## 💡 Conseils

### Session d'Écriture Type
1. Rappelle le contexte : "Je travaille sur [Projet], [Arc], [Chapitre]"
2. Invoque `@Writing Partner`
3. Écris !

### Pour un Feedback
```
@Writing Partner feedback [colle ton texte ou nom du fichier]
```

### Statuts de Progression
| Icône | Signification |
|-------|---------------|
| ⬜ | À faire |
| 🔄 | En cours |
| ✅ | Terminé |
| 📝 | Brouillon |
| 🔍 | À revoir |
| ⏸️ | En pause |

---

## 🎯 Premiers Pas

1. **Déplace ce dossier sur OneDrive** pour l'accès universel
2. **Lance** : `@Planificateur Nouveau projet : [Ton Idée]`
3. **Ou importe un existant** : `@Writing Partner analyse [fichier]`

Bonne création ! ✨
