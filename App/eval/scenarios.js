// Scénarios fictifs pour évaluer la lecture d'un modèle (protocole : eval/PROTOCOLE.md).
// Chaque attente est écrite par un humain. Elle vérifie une lecture minimale ou une erreur à éviter ;
// elle n'impose pas une interprétation littéraire unique : « indéterminé » est souvent la bonne réponse.
//
// Types d'attente :
//   attendu        une lecture qui devrait apparaître (sujet, aspect, mots possibles ; `in` : dans cette unité)
//   interdit       une lecture fausse (contamination, négation inversée, parole prise pour un fait)
//   indetermine    le texte ne tranche pas : pas d'affirmation montrée ou interprétée sans autre lecture
//   pas-avant      une connaissance qui ne doit pas être prêtée au personnage avant une unité donnée
//   entite         une entité qui doit être repérée (même muette)

module.exports = [
  {
    id: 'capitaine-gare',
    title: 'Biographie d\'un personnage, objectif d\'un autre (contamination)',
    text: [
      '## Séquence 1', '', '### Page 1',
      'Le capitaine Marc, orphelin élevé à l\'école navale, inspecte le pont avec une rigueur exemplaire.', '',
      '**Marc:**', '- Personne ne quitte le navire avant l\'aube.', '',
      '### Page 2', 'Noé descend la passerelle, un plan froissé à la main.', '',
      '**Noé:**', '- Excusez-moi, où est la gare ? Mon train part à six heures.', ''
    ].join('\n'),
    expectations: [
      { id: 'noe-gare', type: 'attendu', subject: 'Noé', aspect: ['objectif', 'motivation', 'autre'], any: ['gare', 'train'], why: 'Noé cherche la gare.' },
      { id: 'noe-pas-orphelin', type: 'interdit', subject: 'Noé', any: ['orphelin', 'école navale', 'capitaine', 'exemplaire'], why: 'La biographie de Marc ne concerne pas Noé.' },
      { id: 'noe-pas-rebelle', type: 'interdit', subject: 'Noé', any: ['rébellion', 'rebelle', 'libérer', 'opprim'], why: 'Rien ne parle de rébellion.' },
      { id: 'marc-orphelin', type: 'attendu', subject: 'Marc', any: ['orphelin', 'capitaine', 'rigueur', 'exemplaire'], why: 'L\'action décrit Marc.' },
      { id: 'pas-de-lien', type: 'interdit', subject: ['Marc', 'Noé'], relation: true, any: ['ami', 'confiance', 'allié', 'proche'], why: 'Partager une page ne crée pas un lien.' }
    ]
  },
  {
    id: 'mensonge-negation',
    title: 'Négation, mensonge, projet non réalisé',
    text: [
      '## Séquence 1', '', '### Page 1',
      'Paul sort du château par la poterne, de la suie sur les mains.', '',
      '### Page 2', 'À la forge, Lina l\'attend.', '',
      '**Paul:**', '- J\'étais à la forge toute la nuit.', '',
      '**Lina:**', '- Je ne veux pas sauver le roi.', '- Demain, on brûle les registres.', ''
    ].join('\n'),
    expectations: [
      { id: 'paul-parole', type: 'interdit', subject: 'Paul', natures: ['montre', 'interpretation'], any: ['forge toute la nuit', 'était à la forge'], why: 'Ce que Paul dit n\'est pas un fait ; l\'action le montre ailleurs.' },
      { id: 'paul-chateau', type: 'attendu', subject: 'Paul', natures: ['montre', 'interpretation'], any: ['château', 'poterne', 'ment'], why: 'L\'action le montre sortir du château.' },
      { id: 'lina-negation', type: 'interdit', subject: 'Lina', any: ['veut sauver le roi', 'souhaite sauver le roi', 'cherche à sauver le roi'], why: '« Je ne veux pas » n\'est pas « veut ».' },
      { id: 'registres-projet', type: 'interdit', subject: ['Lina', 'Récit'], natures: ['montre'], any: ['brûle les registres', 'registres brûlés', 'brûlent les registres'], why: 'Un projet annoncé n\'est pas réalisé.' }
    ]
  },
  {
    id: 'lettre-revelation',
    title: 'Révélation tardive et relation qui évolue',
    text: [
      '## Séquence 1', '', '### Page 1', 'Lina et Marc réparent la lanterne du phare.', '',
      '**Lina:**', '- Sans toi, je n\'aurais jamais tenu ce phare.', '',
      '## Séquence 2', '', '### Page 2', 'Lina confie la clé de la lanterne à Marc.', '',
      '**Lina:**', '- Garde-la, j\'ai confiance en toi.', '',
      '## Séquence 3', '', '### Page 3', 'Lina trouve la lettre de la Compagnie signée par Marc.', '',
      '**Lina:**', '- Tu m\'as menti depuis le début.', ''
    ].join('\n'),
    expectations: [
      { id: 'pas-avant', type: 'pas-avant', subject: 'Lina', unit: 'Séquence 3', aspect: ['connaissance', 'revelation'], any: ['compagnie', 'trahi', 'menti', 'lettre'], why: 'Lina ne sait rien avant la séquence 3.' },
      { id: 'revelation', type: 'attendu', subject: 'Lina', in: 'Séquence 3', aspect: ['revelation', 'connaissance', 'evenement'], any: ['lettre', 'compagnie', 'signée'], why: 'La découverte est montrée.' },
      { id: 'pas-incoherence', type: 'interdit', subject: ['Lina', 'Marc', 'Récit'], any: ['incohéren', 'contradiction'], why: 'Une confiance trahie n\'est pas une incohérence.' }
    ]
  },
  {
    id: 'silence',
    title: 'Silence et personnage muet',
    text: [
      '## Séquence 1', '', '### Page 1',
      'Inès regarde la porte sans répondre. Le Guetteur, immobile sur le toit, observe la place.', '',
      '**Hugo:**', '- Tu viens avec nous, oui ou non ?', '',
      '### Page 2', 'Inès pose la clé sur la table et sort. Le Guetteur ne bouge pas.', ''
    ].join('\n'),
    expectations: [
      { id: 'ines-motif', type: 'indetermine', subject: 'Inès', aspect: ['motivation', 'objectif', 'peur', 'valeur'], why: 'Le texte ne dit pas pourquoi Inès part : une lecture doit rester ouverte (autre lecture ou question).' },
      { id: 'guetteur', type: 'entite', subject: 'Le Guetteur', why: 'Muet mais présent : à repérer.' },
      { id: 'pas-amis', type: 'interdit', subject: ['Inès', 'Le Guetteur', 'Hugo'], relation: true, any: ['ami', 'complice', 'allié'], why: 'Présents ensemble, sans lien établi.' }
    ]
  }
];
