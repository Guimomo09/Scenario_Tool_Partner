# 🔗 Liens — Ressources Externes

Ce fichier référence tous les emplacements de travail en dehors du dossier Partner.

## Scénarios Principaux

| Projet | Emplacement | Statut |
|--------|-------------|--------|
| Origine Martienne | `C:\Users\charl\Desktop\Scenario_Manga\StoryBible_OrigineMartienne.md` | 🔄 Actif |
| Rocket League IRL | `C:\Users\charl\Desktop\Scenario_Manga\StoryBible_RocketLeagueIRL.md` | 🔄 Actif |

## Comment Utiliser

### Dans VS Code
Le Writing Partner peut accéder à ces fichiers directement :
```
@Writing Partner Analyse le fichier Origine Martienne
```

### Pour Synchroniser
Si tu veux que les scénarios soient dans le même espace :

**Option 1 : Déplacer**
Déplace `Scenario_Manga` dans le dossier Partner (ou sur OneDrive)

**Option 2 : Symlink** (lien symbolique)
Dans PowerShell (admin) :
```powershell
New-Item -ItemType SymbolicLink -Path "C:\Users\charl\Desktop\Partner\Scenarios" -Target "C:\Users\charl\Desktop\Scenario_Manga"
```

## Autres Sources

<!-- Ajoute ici d'autres emplacements au fur et à mesure -->

| Source | Emplacement | Description |
|--------|-------------|-------------|
| | | |

---

## Notes

Pour que le Writing Partner puisse toujours accéder à tes fichiers :
1. **VS Code** : Il lit directement les chemins ci-dessus
2. **ChatGPT/Claude Web** : Tu dois copier-coller le contenu

Le plus pratique reste de tout centraliser dans le dossier Partner, sur OneDrive.
