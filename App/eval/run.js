// Protocole d'évaluation de lecture (voir eval/PROTOCOLE.md). Aucun appel à une IA.
//   node eval/run.js prompts <dossier>   écrit la consigne de chaque unité des scénarios (à envoyer soi-même)
//   node eval/run.js score <réponses.json>  note des réponses enregistrées : { scénario: { "Séquence 1": "texte brut" } }
//   node eval/run.js demo                 rapport sur des réponses simulées (format du rapport, pas un modèle)

const fs = require('fs');
const path = require('path');
const U = require('../src/core/understanding');
const scenarios = require('./scenarios');
const { unitsOf, evaluate, formatReport } = require('./reading-eval');

const [command, arg] = process.argv.slice(2);

if (command === 'prompts') {
  if (!arg) { console.error('Indique un dossier de sortie : node eval/run.js prompts <dossier>'); process.exit(1); }
  const dir = path.resolve(arg);
  fs.mkdirSync(dir, { recursive: true });
  const template = {};
  scenarios.forEach(s => {
    template[s.id] = {};
    unitsOf(s).forEach(unit => {
      const p = U.buildUnitPrompt(unit, []);
      const file = path.join(dir, `${s.id}--${unit.label.replace(/[^\w-]+/g, '_')}.txt`);
      fs.writeFileSync(file, `=== SYSTÈME ===\n${p.system}\n\n=== MESSAGE ===\n${p.user}\n`, 'utf8');
      template[s.id][unit.label] = '';
    });
  });
  fs.writeFileSync(path.join(dir, 'reponses.json'), JSON.stringify(template, null, 2), 'utf8');
  console.log(`Consignes écrites dans ${dir}. Colle chaque réponse brute dans reponses.json, puis : node eval/run.js score ${path.join(arg, 'reponses.json')}`);
} else if (command === 'score') {
  if (!arg) { console.error('Indique le fichier de réponses : node eval/run.js score <réponses.json>'); process.exit(1); }
  const responses = JSON.parse(fs.readFileSync(path.resolve(arg), 'utf8'));
  const reports = scenarios.filter(s => responses[s.id]).map(s => evaluate(s, Object.fromEntries(Object.entries(responses[s.id]).filter(([, v]) => v))));
  if (!reports.length) { console.error('Aucun scénario connu dans ce fichier.'); process.exit(1); }
  console.log(formatReport(reports));
} else if (command === 'demo') {
  const { prudent, contamine } = require('./simulated');
  console.log('RÉPONSES SIMULÉES « prudentes » (écrites à la main) :');
  console.log(formatReport(scenarios.map(s => evaluate(s, prudent[s.id]))));
  console.log('\nRÉPONSES SIMULÉES « contaminées » (erreurs connues des anciennes heuristiques) :');
  console.log(formatReport(scenarios.map(s => evaluate(s, contamine[s.id]))));
} else {
  console.log('Usage : node eval/run.js prompts <dossier> | score <réponses.json> | demo');
}
