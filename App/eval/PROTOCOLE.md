# Protocole d'évaluation de lecture

But : mesurer si un modèle, lu à travers la validation de Partner, évite les erreurs de lecture
qui faussent les fiches et la critique. Ce n'est pas une note de « compréhension littéraire ».

## Ce qui est évalué

Quatre scénarios fictifs (`scenarios.js`), courts, écrits au format des scripts Markdown du projet :

| Scénario | Ce qu'il éprouve |
|---|---|
| `capitaine-gare` | biographie d'un personnage prêtée à un autre ; motivation inventée ; lien déduit d'une page partagée |
| `mensonge-negation` | parole prise pour un fait ; négation inversée ; projet annoncé pris pour un événement |
| `lettre-revelation` | révélation prêtée trop tôt ; relation qui évolue déclarée incohérente |
| `silence` | motivation non écrite tranchée sans autre lecture ; personnage muet non repéré |

Chaque attente est écrite par un humain et porte sa raison (`why`). Cinq types :

- **attendu** — une lecture minimale qui devrait apparaître (des mots possibles, pas une formulation imposée) ;
- **interdit** — une erreur à éviter ;
- **indéterminé** — le texte ne tranche pas : toute lecture doit rester ouverte (autre lecture, question) ; ne rien affirmer est acceptable ;
- **pas-avant** — une connaissance qui ne doit pas être prêtée avant une unité donnée ;
- **entité** — une présence à repérer, même muette.

## Déroulé (aucun appel automatique)

1. `npm run eval:lecture -- prompts eval/out` : écrit la consigne réelle de chaque unité
   (même texte système et même encadrement que l'espace Lecture) et un modèle `reponses.json`.
2. Envoyer chaque consigne au modèle choisi, hors de l'app ou depuis un outil autorisé, et coller
   la réponse brute dans `reponses.json`. **Chaque envoi est un appel payant : à décider par l'auteur.**
3. `npm run eval:lecture -- score eval/out/reponses.json` : les réponses passent par la validation de
   l'app (citations retrouvées, répliques requalifiées, intentions refusées), puis sont confrontées aux attentes.
4. Relire le rapport **et** les lectures retenues : une attente respectée ne prouve pas que la lecture soit juste,
   un échec peut venir d'une formulation inattendue mais correcte.

`npm run eval:lecture -- demo` montre le format du rapport sur deux jeux de réponses écrites à la main
(un lecteur prudent, un lecteur qui reproduit les anciennes contaminations). Ce ne sont pas des résultats de modèle.

## Limites

- Les mots attendus sont une approximation : ils repèrent une lecture, ils ne la jugent pas.
- Quatre scénarios ne couvrent pas un manuscrit réel ; ils vérifient des garde-fous précis.
- Les tests `npm test` valident le logiciel de notation, pas la qualité d'un modèle.
- Ajouter un scénario : un texte fictif court, des attentes avec raison, et au moins une attente
  « indéterminé » ou « interdit » quand le texte laisse plusieurs lectures possibles.
