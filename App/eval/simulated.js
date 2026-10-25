// Réponses SIMULÉES (écrites à la main) pour montrer le format du rapport et tester le logiciel.
// « prudent » respecte les attentes ; « contaminé » reproduit les erreurs connues des anciennes heuristiques.
// Aucune ne vient d'un vrai modèle.

const json = (claims, entities = []) => JSON.stringify({ entities, claims });

const prudent = {
  'capitaine-gare': {
    'Séquence 1': json([
      { subject: { kind: 'personnage', name: 'Marc' }, nature: 'montre', aspect: 'autre', content: 'Marc est un capitaine orphelin, d\'une rigueur exemplaire.', quote: 'Le capitaine Marc, orphelin élevé à l\'école navale, inspecte le pont avec une rigueur exemplaire.' },
      { subject: { kind: 'personnage', name: 'Noé' }, nature: 'parole', aspect: 'objectif', speaker: 'Noé', content: 'Noé dit chercher la gare pour son train de six heures.', quote: 'Excusez-moi, où est la gare ? Mon train part à six heures.' }
    ], [{ name: 'Marc', kind: 'personnage' }, { name: 'Noé', kind: 'personnage' }])
  },
  'mensonge-negation': {
    'Séquence 1': json([
      { subject: { kind: 'personnage', name: 'Paul' }, nature: 'montre', aspect: 'evenement', content: 'Paul sort du château par la poterne.', quote: 'Paul sort du château par la poterne, de la suie sur les mains.' },
      { subject: { kind: 'personnage', name: 'Paul' }, nature: 'parole', aspect: 'autre', speaker: 'Paul', content: 'Paul dit avoir passé la nuit à la forge.', quote: 'J\'étais à la forge toute la nuit.', alternative: 'Il peut mentir : l\'action le montre au château.' },
      { subject: { kind: 'personnage', name: 'Lina' }, nature: 'parole', aspect: 'objectif', speaker: 'Lina', content: 'Lina dit qu\'elle ne veut pas sauver le roi.', quote: 'Je ne veux pas sauver le roi.' },
      { subject: { kind: 'personnage', name: 'Lina' }, nature: 'parole', aspect: 'objectif', speaker: 'Lina', content: 'Lina annonce qu\'ils brûleront les registres demain.', quote: 'Demain, on brûle les registres.' }
    ])
  },
  'lettre-revelation': {
    'Séquence 1': json([{ subject: { kind: 'relation', name: 'Lina' }, object: { name: 'Marc' }, nature: 'parole', aspect: 'relation', speaker: 'Lina', content: 'Lina dit qu\'elle doit beaucoup à Marc.', quote: 'Sans toi, je n\'aurais jamais tenu ce phare.' }]),
    'Séquence 2': json([{ subject: { kind: 'relation', name: 'Lina' }, object: { name: 'Marc' }, nature: 'parole', aspect: 'relation', speaker: 'Lina', content: 'Lina dit avoir confiance en Marc.', quote: 'Garde-la, j\'ai confiance en toi.' }]),
    'Séquence 3': json([{ subject: { kind: 'personnage', name: 'Lina' }, nature: 'montre', aspect: 'revelation', content: 'Lina découvre la lettre de la Compagnie signée par Marc.', quote: 'Lina trouve la lettre de la Compagnie signée par Marc.' }])
  },
  silence: {
    'Séquence 1': json([
      { subject: { kind: 'personnage', name: 'Inès' }, nature: 'interpretation', aspect: 'motivation', content: 'Inès refuse de suivre Hugo.', quote: 'Inès pose la clé sur la table et sort.', alternative: 'Elle peut aussi partir pour les protéger ; le texte ne tranche pas.' }
    ], [{ name: 'Inès', kind: 'personnage' }, { name: 'Le Guetteur', kind: 'personnage' }, { name: 'Hugo', kind: 'personnage' }])
  }
};

const contamine = {
  'capitaine-gare': {
    'Séquence 1': json([
      { subject: { kind: 'personnage', name: 'Noé' }, nature: 'interpretation', aspect: 'valeur', content: 'Noé est un orphelin exemplaire.', quote: 'orphelin élevé à l\'école navale' },
      { subject: { kind: 'personnage', name: 'Noé' }, nature: 'interpretation', aspect: 'motivation', content: 'Noé veut libérer les opprimés.', quote: 'Mon train part à six heures.' },
      { subject: { kind: 'relation', name: 'Marc' }, object: { name: 'Noé' }, nature: 'interpretation', aspect: 'relation', content: 'Marc et Noé sont amis.', quote: 'Noé descend la passerelle' }
    ])
  },
  'mensonge-negation': {
    'Séquence 1': json([
      { subject: { kind: 'personnage', name: 'Paul' }, nature: 'interpretation', aspect: 'evenement', content: 'Paul était à la forge toute la nuit.', quote: 'J\'étais à la forge toute la nuit.' },
      { subject: { kind: 'personnage', name: 'Lina' }, nature: 'interpretation', aspect: 'objectif', content: 'Lina veut sauver le roi.', quote: 'Je ne veux pas sauver le roi.' }
    ])
  },
  'lettre-revelation': {
    'Séquence 1': json([{ subject: { kind: 'personnage', name: 'Lina' }, nature: 'interpretation', aspect: 'connaissance', content: 'Lina sait déjà que Marc travaille pour la Compagnie.', quote: 'Lina et Marc réparent la lanterne du phare.' }]),
    'Séquence 3': json([{ subject: { kind: 'recit', name: 'Récit' }, nature: 'interpretation', aspect: 'autre', content: 'Incohérence : Lina faisait confiance à Marc.', quote: 'Tu m\'as menti depuis le début.' }])
  },
  silence: {
    'Séquence 1': json([{ subject: { kind: 'personnage', name: 'Inès' }, nature: 'interpretation', aspect: 'motivation', content: 'Inès part parce qu\'elle a peur de Hugo.', quote: 'Inès pose la clé sur la table et sort.' }])
  }
};

module.exports = { prudent, contamine };
