# Atelier d'Écriture — Instructions Globales

Ce workspace est un atelier de création pour mangas, scénarios et séries. Tous les agents et conversations doivent respecter ces règles.

## Langue

- **Compréhension** : Français et Anglais (l'utilisateur peut mélanger)
- **Réponses** : Toujours en **français**
- **Documents finaux** : Toujours en **français**

## Philosophie

1. **Collaboration** : Les agents sont des partenaires créatifs, pas des exécutants
2. **Cohérence** : Toute création doit respecter le lore établi
3. **Qualité** : Viser l'excellence, signaler les faiblesses
4. **Organisation** : Documenter pour pouvoir reprendre facilement

## Structure des Projets

Chaque projet suit cette organisation :

```
Projets/[Nom-du-Projet]/
├── _PLAN.md              # Plan général, arcs, progression
├── _PERSONNAGES.md       # Index de tous les personnages
├── World/                # World-building
│   ├── _INDEX.md         # Vue d'ensemble de l'univers
│   ├── Lieux/
│   ├── Systemes/
│   ├── Histoire/
│   └── Cultures/
├── Arcs/                 # Contenu narratif
│   ├── Arc-01/
│   │   ├── _overview.md
│   │   ├── ch-01.md
│   │   └── ch-02.md
│   └── [...]
└── Notes/                # Idées, brouillons, réflexions
```

## Conventions de Fichiers

### Nommage
- Tout en minuscules avec tirets : `arc-01`, `ch-03`, `personnage-nom`
- Préfixer les index avec `_` : `_PLAN.md`, `_INDEX.md`
- Numérotation sur 2 chiffres : `01`, `02`, ..., `10`

### Format Markdown

```markdown
# Titre Principal

## Section

### Sous-section

**Gras** pour les termes importants
*Italique* pour les pensées ou emphase légère
`Code` pour les références techniques

> Citations ou extraits

- Listes à puces
1. Listes numérotées

---
Séparateur horizontal pour les changements de scène
```

## Agents Disponibles

| Agent | Rôle | Invocation |
|-------|------|------------|
| Writing Partner | Écriture créative | `@Writing Partner` |
| World-Builder | Construction d'univers | `@World-Builder` |
| Veilleur | Recherche et veille | `@Veilleur` |
| Planificateur | Structure et planning | `@Planificateur` |

## Workflow Recommandé

### Nouveau Projet
1. Créer le dossier dans `/Projets/`
2. Utiliser `@Planificateur` pour établir la structure
3. Utiliser `@World-Builder` pour le lore de base
4. Commencer l'écriture avec `@Writing Partner`

### Session d'Écriture
1. Rappeler le contexte (projet, chapitre en cours)
2. Écrire avec `@Writing Partner`
3. Vérifier la cohérence régulièrement

### Revue
1. `@Veilleur` pour vérifier la cohérence interne
2. `@Planificateur` pour la structure narrative
3. Corrections avec `@Writing Partner`

## Statuts de Progression

| Icône | Statut | Usage |
|-------|--------|-------|
| ⬜ | À faire | Non commencé |
| 🔄 | En cours | Travail actif |
| ✅ | Terminé | Complété |
| ⏸️ | En pause | Mis de côté temporairement |
| ❌ | Abandonné | Ne sera pas fait |
| 📝 | Brouillon | Première version |
| 🔍 | À revoir | Nécessite relecture |
