// === Fournisseurs IA (main process) ===
// Construction des requêtes, lecture des réponses et liste des modèles disponibles.
// La clé n'est passée qu'ici et n'apparaît jamais dans un message d'erreur renvoyé au renderer.
// `fetchImpl` est injectable : les tests simulent le fournisseur, sans appel réseau réel.

const ANTHROPIC_VERSION = '2026-10-21';
const MAX_OUTPUT_TOKENS = 16000;

// Modèle proposé par défaut. OpenAI n'en a pas : le modèle est choisi dans la liste
// renvoyée par le service (aucun identifiant deviné).
const PROVIDERS = {
  openai: { label: 'OpenAI', defaultModel: '' },
  anthropic: { label: 'Anthropic (Claude)', defaultModel: 'claude-opus-5-5' }
};

const isProvider = (p) => Object.prototype.hasOwnProperty.call(PROVIDERS, p);

// Modèles Anthropic qui acceptent la relance automatique sur un autre modèle en cas de refus
const FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

// Un échange valide : texte système + messages user/assistant alternés, commençant par user
function validateChatPayload(payload, maxChars = 600000) {
  if (!payload || typeof payload !== 'object') return 'Requête invalide.';
  if (typeof payload.system !== 'string') return 'Instructions système manquantes.';
  const { messages } = payload;
  if (!Array.isArray(messages) || !messages.length) return 'Aucun message à envoyer.';
  let total = payload.system.length;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return `Message ${i + 1} invalide.`;
    }
    if (!m.content.trim()) return `Message ${i + 1} vide.`;
    const expected = i % 2 === 0 ? 'user' : 'assistant';
    if (m.role !== expected) return 'Les messages doivent alterner, en commençant par l\'auteur.';
    total += m.content.length;
  }
  if (messages[messages.length - 1].role !== 'user') return 'Le dernier message doit venir de l\'auteur.';
  if (total > maxChars) return `Requête trop longue (${total} caractères, limite ${maxChars}).`;
  return null;
}

function buildChatRequest(provider, { apiKey, model, system, messages }) {
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, ...messages],
          max_completion_tokens: MAX_OUTPUT_TOKENS
        })
      }
    };
  }
  if (provider === 'anthropic') {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION
    };
    const body = { model, max_tokens: MAX_OUTPUT_TOKENS, system, messages };
    // Si un filtre de sécurité décline la demande, le service la relance sur un autre modèle
    if (FALLBACK_MODELS.includes(model)) {
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }
    return {
      url: 'https://api.anthropic.com/v1/messages',
      init: { method: 'POST', headers, body: JSON.stringify(body) }
    };
  }
  throw new Error(`Fournisseur inconnu : ${provider}`);
}

function errorMessageFrom(status, bodyText) {
  let message = '';
  try {
    message = JSON.parse(bodyText).error?.message || '';
  } catch (e) {}
  const hints = {
    401: 'clé refusée par le service',
    403: 'accès refusé',
    404: 'modèle ou service introuvable',
    429: 'limite d\'utilisation atteinte, réessaie plus tard'
  };
  const hint = hints[status] || (status >= 500 ? 'service indisponible' : 'erreur du service');
  return `${hint} (HTTP ${status})${message ? ` : ${message}` : ''}`;
}

// Réponse → { success, text, stopReason, model } ; un texte vide ou tronqué est signalé
function parseChatResponse(provider, status, bodyText) {
  if (status < 200 || status >= 300) return { success: false, error: errorMessageFrom(status, bodyText) };
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (e) {
    return { success: false, error: 'Réponse illisible du service.' };
  }
  let text = '';
  let stopReason = '';
  if (provider === 'openai') {
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    stopReason = choice?.finish_reason || '';
    if (stopReason === 'length') stopReason = 'max_tokens';
  } else {
    stopReason = data.stop_reason || '';
    if (stopReason === 'refusal') {
      const why = data.stop_details?.explanation;
      return { success: false, error: `Le modèle a décliné la demande${why ? ` : ${why}` : '.'}` };
    }
    text = (Array.isArray(data.content) ? data.content : [])
      .filter(block => block && block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text)
      .join('');
  }
  if (!text.trim()) return { success: false, error: 'Le service a renvoyé une réponse vide.' };
  return { success: true, text, stopReason, truncated: stopReason === 'max_tokens', model: data.model || '' };
}

async function chat(provider, { apiKey, model, system, messages, signal, fetchImpl = fetch }) {
  if (!isProvider(provider)) return { success: false, error: `Fournisseur inconnu : ${provider}` };
  if (!apiKey) return { success: false, error: `Aucune clé ${PROVIDERS[provider].label} enregistrée.` };
  if (!model) return { success: false, error: `Aucun modèle choisi pour ${PROVIDERS[provider].label} (Paramètres).` };
  const invalid = validateChatPayload({ system, messages });
  if (invalid) return { success: false, error: invalid };
  try {
    const { url, init } = buildChatRequest(provider, { apiKey, model, system, messages });
    const response = await fetchImpl(url, { ...init, signal });
    return parseChatResponse(provider, response.status, await response.text());
  } catch (error) {
    if (error && error.name === 'AbortError') return { success: false, cancelled: true, error: 'Demande annulée.' };
    return { success: false, error: `Service injoignable (${error.message}).` };
  }
}

// Liste des modèles proposés par le compte (lecture seule, sans coût)
async function listModels(provider, { apiKey, fetchImpl = fetch }) {
  if (!isProvider(provider)) return { success: false, error: `Fournisseur inconnu : ${provider}` };
  if (!apiKey) return { success: false, error: `Aucune clé ${PROVIDERS[provider].label} enregistrée.` };
  try {
    if (provider === 'openai') {
      const response = await fetchImpl('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const body = await response.text();
      if (!response.ok) return { success: false, error: errorMessageFrom(response.status, body) };
      const data = JSON.parse(body);
      const models = (data.data || []).map(m => ({ id: m.id, label: m.id })).filter(m => typeof m.id === 'string');
      models.sort((a, b) => a.id.localeCompare(b.id));
      return { success: true, models };
    }
    const models = [];
    let afterId = '';
    for (let page = 0; page < 20; page++) {
      const query = `?limit=100${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}`;
      const response = await fetchImpl(`https://api.anthropic.com/v1/models${query}`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
      });
      const body = await response.text();
      if (!response.ok) return { success: false, error: errorMessageFrom(response.status, body) };
      const data = JSON.parse(body);
      (data.data || []).forEach(m => {
        if (typeof m.id === 'string') models.push({ id: m.id, label: m.display_name ? `${m.display_name} (${m.id})` : m.id });
      });
      if (!data.has_more || !data.last_id) break;
      afterId = data.last_id;
    }
    return { success: true, models };
  } catch (error) {
    return { success: false, error: `Liste des modèles indisponible (${error.message}).` };
  }
}

module.exports = {
  PROVIDERS, ANTHROPIC_VERSION, MAX_OUTPUT_TOKENS, isProvider,
  validateChatPayload, buildChatRequest, parseChatResponse, chat, listModels
};
