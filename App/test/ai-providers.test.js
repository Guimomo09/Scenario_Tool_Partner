// Contrat des fournisseurs IA — fournisseur simulé, aucun appel réseau réel
const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('../lib/ai-providers');
const Settings = require('../lib/settings');

const fakeFetch = (status, body, calls = []) => async (url, init) => {
  calls.push({ url, init });
  return { status, ok: status >= 200 && status < 300, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
};
const conversation = [
  { role: 'user', content: 'Bonjour' },
  { role: 'assistant', content: 'Bonjour.' },
  { role: 'user', content: 'Relis ce passage.' }
];

test('Anthropic : historique transmis, version d\'API actuelle, sans paramètre d\'échantillonnage', async () => {
  const calls = [];
  const result = await AI.chat('anthropic', {
    apiKey: 'cle-factice', model: 'claude-opus-5-5', system: 'Système', messages: conversation,
    fetchImpl: fakeFetch(200, { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Réponse' }] }, calls)
  });
  assert.equal(result.success, true);
  assert.equal(result.text, 'Réponse', 'seuls les blocs texte sont gardés');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].init.headers['anthropic-version'], AI.ANTHROPIC_VERSION);
  assert.equal(body.system, 'Système');
  assert.deepEqual(body.messages, conversation);
  assert.equal('temperature' in body, false);
});

test('OpenAI : le message système précède l\'historique', async () => {
  const calls = [];
  const result = await AI.chat('openai', {
    apiKey: 'cle-factice', model: 'modele-choisi', system: 'Système', messages: conversation,
    fetchImpl: fakeFetch(200, { choices: [{ message: { content: 'Ok' }, finish_reason: 'stop' }] }, calls)
  });
  assert.equal(result.success, true);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'modele-choisi');
  assert.deepEqual(body.messages[0], { role: 'system', content: 'Système' });
  assert.equal(body.messages.length, 4);
});

test('erreurs : HTTP, refus, réponse vide, absence de clé ou de modèle — la clé n\'apparaît jamais', async () => {
  const key = 'sk-secret-factice';
  const base = { apiKey: key, model: 'm', system: 's', messages: [{ role: 'user', content: 'x' }] };
  const http = await AI.chat('anthropic', { ...base, fetchImpl: fakeFetch(401, { error: { message: 'invalid x-api-key' } }) });
  assert.equal(http.success, false);
  assert.match(http.error, /401/);
  assert.equal(http.error.includes(key), false);

  const refusal = await AI.chat('anthropic', { ...base, fetchImpl: fakeFetch(200, { stop_reason: 'refusal', content: [] }) });
  assert.equal(refusal.success, false);
  assert.match(refusal.error, /décliné/);

  const empty = await AI.chat('openai', { ...base, fetchImpl: fakeFetch(200, { choices: [{ message: { content: '' } }] }) });
  assert.equal(empty.success, false);

  assert.equal((await AI.chat('openai', { ...base, apiKey: '' })).success, false);
  assert.match((await AI.chat('openai', { ...base, model: '' })).error, /modèle/);
});

test('réponse tronquée signalée', async () => {
  const result = await AI.chat('anthropic', {
    apiKey: 'k', model: 'm', system: 's', messages: [{ role: 'user', content: 'x' }],
    fetchImpl: fakeFetch(200, { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'début' }] })
  });
  assert.equal(result.truncated, true);
});

test('annulation : une demande interrompue est signalée comme annulée', async () => {
  const controller = new AbortController();
  const hanging = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const pending = AI.chat('openai', { apiKey: 'k', model: 'm', system: 's', messages: [{ role: 'user', content: 'x' }], signal: controller.signal, fetchImpl: hanging });
  controller.abort();
  const result = await pending;
  assert.equal(result.cancelled, true);
});

test('messages invalides refusés avant tout envoi', () => {
  assert.ok(AI.validateChatPayload({ system: 's', messages: [] }));
  assert.ok(AI.validateChatPayload({ system: 's', messages: [{ role: 'assistant', content: 'x' }] }));
  assert.ok(AI.validateChatPayload({ system: 's', messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }] }));
  assert.ok(AI.validateChatPayload({ system: 's', messages: [{ role: 'system', content: 'a' }] }));
  assert.equal(AI.validateChatPayload({ system: 's', messages: conversation }), null);
});

test('liste des modèles Anthropic paginée', async () => {
  const pages = [
    { data: [{ id: 'modele-a', display_name: 'A' }], has_more: true, last_id: 'modele-a' },
    { data: [{ id: 'modele-b' }], has_more: false, last_id: 'modele-b' }
  ];
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const body = pages[urls.length - 1];
    return { status: 200, ok: true, text: async () => JSON.stringify(body) };
  };
  const result = await AI.listModels('anthropic', { apiKey: 'k', fetchImpl });
  assert.deepEqual(result.models.map(m => m.id), ['modele-a', 'modele-b']);
  assert.match(urls[1], /after_id=modele-a/);
});

// === Paramètres : une clé par fournisseur ===
const fakeEncrypt = (plain) => `enc(${plain})`;

test('ancienne clé unique rattachée au fournisseur sélectionné, sans perte', () => {
  const { settings, changed } = Settings.migrateSettings({ theme: 'dark', apiProvider: 'anthropic', apiKeyEnc: 'ANCIENNE' }, fakeEncrypt);
  assert.equal(changed, true);
  assert.equal(settings.providers.anthropic.apiKeyEnc, 'ANCIENNE');
  assert.equal(settings.providers.openai.apiKeyEnc, undefined);
  assert.equal('apiKeyEnc' in settings, false);

  const plain = Settings.migrateSettings({ apiProvider: 'openai', apiKey: 'en-clair' }, fakeEncrypt).settings;
  assert.equal(plain.providers.openai.apiKeyEnc, 'enc(en-clair)');
  assert.equal('apiKey' in plain, false);

  const again = Settings.migrateSettings(settings, fakeEncrypt);
  assert.equal(again.changed, false, 'migration répétée sans effet');
});

test('mise à jour d\'un fournisseur sans toucher à la clé de l\'autre ; jamais de clé exposée', () => {
  let stored = { apiProvider: 'openai', providers: { openai: { apiKeyEnc: 'A' }, anthropic: { apiKeyEnc: 'B' } } };
  stored = Settings.applySettingsUpdate(stored, { apiProvider: 'anthropic', providers: { anthropic: { apiKey: '', model: 'claude-opus-5-5' }, openai: { clearApiKey: true } } }, fakeEncrypt);
  assert.equal(stored.providers.anthropic.apiKeyEnc, 'B', 'clé vide = clé conservée');
  assert.equal(stored.providers.openai.apiKeyEnc, undefined);
  const pub = Settings.publicSettings(stored);
  assert.equal(pub.apiProvider, 'anthropic');
  assert.equal(pub.hasApiKey, true);
  assert.equal(pub.model, 'claude-opus-5-5');
  assert.equal(JSON.stringify(pub).includes('"B"'), false);
  assert.throws(() => Settings.applySettingsUpdate(stored, { providers: { openai: { model: 'avec espace' } } }, fakeEncrypt));
});

test('ancien mode « manuel » = aucun fournisseur', () => {
  assert.equal(Settings.publicSettings({ apiProvider: 'manual' }).apiProvider, 'none');
});
