// === Mémoire du partenaire par projet (_PARTNER.json) ===
// Conversations, propositions, canon validé, décisions sur les remarques et dernier document ouvert.
// Les champs inconnus sont conservés ; rien n'est supprimé sans action explicite de l'auteur.
// Sans DOM : chargé dans le renderer via <script> et dans les tests via require().

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PartnerStore = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const FILE_NAME = '_PARTNER.json';
  const STORE_VERSION = 1;

  const randomPart = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const newId = (prefix) => `${prefix}_${randomPart()}`;
  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const normalizeText = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function newConversation(now = new Date().toISOString()) {
    return { id: newId('cv'), title: '', createdAt: now, messages: [] };
  }

  function createStore() {
    const conversation = newConversation();
    return {
      kind: 'partner',
      version: STORE_VERSION,
      workspace: { lastDocument: '', cursors: {}, intent: '' },
      conversations: [conversation],
      activeConversationId: conversation.id,
      proposals: [],
      canon: [],
      decisions: []
    };
  }

  // Lecture tolérante : complète ce qui manque, refuse un format inconnu ou plus récent
  function normalizeStore(raw) {
    if (!isObject(raw)) return { error: `${FILE_NAME} n'a pas le format attendu.` };
    if (typeof raw.version === 'number' && raw.version > STORE_VERSION) {
      return { error: `${FILE_NAME} vient d'une version plus récente de l'app (v${raw.version}).` };
    }
    for (const key of ['conversations', 'proposals', 'canon', 'decisions']) {
      if (key in raw && !Array.isArray(raw[key])) return { error: `${FILE_NAME} : « ${key} » n'est pas une liste.` };
    }
    const store = { ...raw, kind: 'partner', version: STORE_VERSION };
    store.workspace = isObject(raw.workspace) ? { ...raw.workspace } : {};
    if (!isObject(store.workspace.cursors)) store.workspace.cursors = {};
    store.conversations = (raw.conversations || []).filter(isObject).map(c => ({
      ...c,
      id: c.id || newId('cv'),
      messages: Array.isArray(c.messages) ? c.messages.filter(isObject) : []
    }));
    store.proposals = (raw.proposals || []).filter(isObject);
    store.canon = (raw.canon || []).filter(isObject);
    store.decisions = (raw.decisions || []).filter(d => isObject(d) && typeof d.text === 'string');
    if (!store.conversations.length) store.conversations.push(newConversation());
    if (!store.conversations.some(c => c.id === store.activeConversationId)) {
      store.activeConversationId = store.conversations[store.conversations.length - 1].id;
    }
    return { store };
  }

  const serialize = (store) => JSON.stringify(store, null, 2);

  function activeConversation(store) {
    return store.conversations.find(c => c.id === store.activeConversationId) || store.conversations[0];
  }

  // Nouvelle conversation : l'ancienne est conservée dans la liste
  function startConversation(store) {
    const current = activeConversation(store);
    if (current && !current.messages.length) return current;
    const conversation = newConversation();
    store.conversations.push(conversation);
    store.activeConversationId = conversation.id;
    return conversation;
  }

  function addMessage(store, conversationId, message) {
    const conversation = store.conversations.find(c => c.id === conversationId);
    if (!conversation) return null;
    const entry = { id: newId('ms'), createdAt: new Date().toISOString(), ...message };
    conversation.messages.push(entry);
    if (!conversation.title && message.role === 'user') conversation.title = message.content.slice(0, 60);
    return entry;
  }

  function addProposals(store, proposals) {
    proposals.forEach(p => {
      if (!store.proposals.some(existing => existing.id === p.id)) store.proposals.push(p);
    });
  }

  const findProposal = (store, id) => store.proposals.find(p => p.id === id) || null;

  // Une proposition appliquée ou rejetée ne change plus d'état (pas de double application)
  function setProposalStatus(store, id, status, extra = {}) {
    const proposal = findProposal(store, id);
    if (!proposal) return { ok: false, reason: 'Proposition introuvable.' };
    if (!['accepted', 'rejected', 'variant', 'pending'].includes(status)) return { ok: false, reason: 'Statut inconnu.' };
    if (proposal.status === 'accepted' || proposal.status === 'rejected') {
      return { ok: false, reason: proposal.status === 'accepted' ? 'Proposition déjà appliquée.' : 'Proposition déjà rejetée.' };
    }
    proposal.status = status;
    proposal.decidedAt = new Date().toISOString();
    Object.assign(proposal, extra);
    return { ok: true, proposal };
  }

  // Ajout au canon : un même fait n'est jamais ajouté deux fois
  function addCanon(store, text, source = {}) {
    const clean = String(text || '').trim();
    if (!clean) return { ok: false, reason: 'Fait vide.' };
    const existing = store.canon.find(f => normalizeText(f.text) === normalizeText(clean));
    if (existing) return { ok: true, fact: existing, duplicate: true };
    const fact = { id: newId('cn'), text: clean, source, addedAt: new Date().toISOString() };
    store.canon.push(fact);
    return { ok: true, fact };
  }

  // Retrait demandé par l'auteur
  function removeCanon(store, id) {
    const index = store.canon.findIndex(f => f.id === id);
    if (index === -1) return false;
    store.canon.splice(index, 1);
    return true;
  }

  // Décision de l'auteur sur une remarque du partenaire : « retenue » (à traiter) ou « maintenu »
  // (désaccord : le choix est gardé). Le texte du manuscrit n'est jamais modifié ici.
  function addDecision(store, { remarkId, messageId = '', verdict, text }) {
    if (!['retenu', 'maintenu'].includes(verdict)) return { ok: false, reason: 'Décision inconnue.' };
    const clean = String(text || '').trim();
    if (!clean || !remarkId) return { ok: false, reason: 'Remarque introuvable.' };
    if (!Array.isArray(store.decisions)) store.decisions = [];
    const existing = store.decisions.find(d => d.remarkId === remarkId);
    if (existing) {
      Object.assign(existing, { verdict, text: clean, decidedAt: new Date().toISOString() });
      return { ok: true, decision: existing };
    }
    const decision = { id: newId('dc'), remarkId, messageId, verdict, text: clean, decidedAt: new Date().toISOString() };
    store.decisions.push(decision);
    return { ok: true, decision };
  }

  function removeDecision(store, id) {
    const index = (store.decisions || []).findIndex(d => d.id === id);
    if (index === -1) return false;
    store.decisions.splice(index, 1);
    return true;
  }

  // Demandes en cours : une seule par conversation, rattachée à son projet.
  // Une réponse arrivée après annulation est ignorée ; après changement de projet,
  // elle est rangée dans le projet d'origine.
  class RequestTracker {
    constructor() { this.pending = new Map(); }

    start(projectPath, conversationId) {
      for (const entry of this.pending.values()) {
        if (entry.projectPath === projectPath && entry.conversationId === conversationId) return null;
      }
      const id = newId('rq');
      this.pending.set(id, { id, projectPath, conversationId, startedAt: Date.now() });
      return this.pending.get(id);
    }

    finish(id) {
      const entry = this.pending.get(id) || null;
      this.pending.delete(id);
      return entry;
    }

    cancel(id) { return this.pending.delete(id); }

    pendingFor(projectPath, conversationId) {
      return [...this.pending.values()].find(e => e.projectPath === projectPath &&
        (!conversationId || e.conversationId === conversationId)) || null;
    }
  }

  return {
    FILE_NAME, STORE_VERSION, newId, createStore, normalizeStore, serialize,
    activeConversation, startConversation, addMessage, addProposals, findProposal,
    setProposalStatus, addCanon, removeCanon, addDecision, removeDecision, RequestTracker
  };
});
