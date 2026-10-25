// === Paramètres de l'app (main process) ===
// Une clé chiffrée et un modèle par fournisseur. Le renderer ne reçoit que `hasApiKey`.
// `encrypt` est injecté (safeStorage dans l'app, fonction factice dans les tests).

const { PROVIDERS, isProvider } = require('./ai-providers');

const PROVIDER_IDS = Object.keys(PROVIDERS);

// Ancien format : une seule `apiKeyEnc` (ou `apiKey` en clair) pour tous les fournisseurs.
// Elle est rattachée au fournisseur alors sélectionné ; rien n'est supprimé avant d'être recopié.
function migrateSettings(stored, encrypt) {
  const next = { ...stored, providers: { ...(stored.providers || {}) } };
  PROVIDER_IDS.forEach(id => { next.providers[id] = { ...(next.providers[id] || {}) }; });
  let changed = !stored.providers;

  const legacyOwner = isProvider(stored.apiProvider) ? stored.apiProvider : 'openai';
  if (stored.apiKey) {
    if (!next.providers[legacyOwner].apiKeyEnc) {
      next.providers[legacyOwner].apiKeyEnc = encrypt(stored.apiKey);
    }
    delete next.apiKey;
    changed = true;
  }
  if (stored.apiKeyEnc) {
    if (!next.providers[legacyOwner].apiKeyEnc) next.providers[legacyOwner].apiKeyEnc = stored.apiKeyEnc;
    delete next.apiKeyEnc;
    changed = true;
  }
  return { settings: next, changed };
}

function activeProvider(stored) {
  if (stored.apiProvider === 'manual') return 'none';
  return stored.apiProvider === 'none' || isProvider(stored.apiProvider) ? stored.apiProvider : 'openai';
}

function modelFor(stored, provider) {
  return stored.providers?.[provider]?.model || PROVIDERS[provider]?.defaultModel || '';
}

// Vue envoyée au renderer : jamais de clé, seulement sa présence
function publicSettings(stored) {
  const provider = activeProvider(stored);
  const providers = {};
  PROVIDER_IDS.forEach(id => {
    providers[id] = {
      label: PROVIDERS[id].label,
      hasApiKey: Boolean(stored.providers?.[id]?.apiKeyEnc),
      model: modelFor(stored, id),
      defaultModel: PROVIDERS[id].defaultModel
    };
  });
  return {
    theme: stored.theme === 'dark' ? 'dark' : 'light',
    apiProvider: provider,
    providers,
    hasApiKey: provider !== 'none' && Boolean(providers[provider]?.hasApiKey),
    model: provider !== 'none' ? modelFor(stored, provider) : ''
  };
}

// Mise à jour partielle : seuls les champs fournis changent ; une clé vide garde l'existante
function applySettingsUpdate(stored, update, encrypt) {
  const next = { ...stored, providers: { ...(stored.providers || {}) } };
  if (update.theme === 'light' || update.theme === 'dark') next.theme = update.theme;
  if (update.apiProvider === 'none' || isProvider(update.apiProvider)) next.apiProvider = update.apiProvider;

  const changes = update.providers && typeof update.providers === 'object' ? update.providers : {};
  for (const [id, change] of Object.entries(changes)) {
    if (!isProvider(id) || !change || typeof change !== 'object') continue;
    const entry = { ...(next.providers[id] || {}) };
    if (typeof change.model === 'string') {
      const model = change.model.trim();
      if (model.length > 200 || /\s/.test(model)) throw new Error(`Identifiant de modèle invalide pour ${PROVIDERS[id].label}.`);
      entry.model = model;
    }
    if (change.clearApiKey) {
      delete entry.apiKeyEnc;
    } else if (typeof change.apiKey === 'string' && change.apiKey.trim()) {
      entry.apiKeyEnc = encrypt(change.apiKey.trim());
    }
    next.providers[id] = entry;
  }
  delete next.apiKey;
  return next;
}

module.exports = { PROVIDER_IDS, migrateSettings, activeProvider, modelFor, publicSettings, applySettingsUpdate };
