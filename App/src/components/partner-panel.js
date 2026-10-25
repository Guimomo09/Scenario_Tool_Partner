// === Panneau du partenaire d'écriture ===
// Un partenaire unique avec des intentions de travail. Conversations, propositions et canon
// sont rangés par projet dans _PARTNER.json. Le contexte envoyé est visible et ajustable.
// Une proposition ne modifie le manuscrit que sur action de l'auteur, et seulement si le
// passage visé n'a pas changé.

class PartnerPanel {
  constructor(app) {
    this.app = app;
    // projectPath → { project, store, error, writeChain, saveTimer }
    this.stores = new Map();
    this.tracker = new window.PartnerStore.RequestTracker();
    this.intent = window.PartnerContext.DEFAULT_INTENT;
    this.excluded = new Set();
    this.busyProposals = new Set();
    this.contextTimer = null;
    this.setup();
  }

  get el() {
    return {
      panel: document.getElementById('sidebarRight'),
      status: document.getElementById('partnerStatus'),
      messages: document.getElementById('chatMessages'),
      input: document.getElementById('chatInput'),
      send: document.getElementById('btnSendChat'),
      cancel: document.getElementById('btnCancelChat'),
      contextSummary: document.getElementById('contextSummary'),
      contextList: document.getElementById('contextList'),
      canonCount: document.getElementById('canonCount'),
      canonList: document.getElementById('canonList'),
      variantsCount: document.getElementById('variantsCount'),
      variantsList: document.getElementById('variantsList')
    };
  }

  // État du projet ouvert
  get current() {
    const path = this.app.currentProject?.path;
    return path ? this.stores.get(path) || null : null;
  }

  setup() {
    const { input, send, cancel } = this.el;
    document.querySelectorAll('.intent-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setIntent(btn.dataset.intent));
    });
    send.addEventListener('click', () => this.send());
    cancel.addEventListener('click', () => this.cancel());
    // La demande en cours de saisie oriente les passages joints (aperçu du contexte)
    input.addEventListener('input', () => this.refreshContext(600));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.send();
      }
    });
    document.getElementById('btnNewConversation').addEventListener('click', () => this.newConversation());
    document.getElementById('btnAddCanon').addEventListener('click', () => this.addCanonFromInput());
    document.getElementById('canonInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.addCanonFromInput(); }
    });

    // Actions des cartes (délégation : les cartes sont recréées à chaque rendu)
    this.el.panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-proposal-action]');
      if (btn) this.onProposalAction(btn.dataset.proposalAction, btn.dataset.id);
      const remove = e.target.closest('[data-canon-remove]');
      if (remove) this.removeCanon(remove.dataset.canonRemove);
      const remark = e.target.closest('[data-remark-action]');
      if (remark) this.onRemarkAction(remark.dataset.remarkAction, remark.dataset.message, remark.dataset.id);
      const decision = e.target.closest('[data-decision-remove]');
      if (decision) this.removeDecision(decision.dataset.decisionRemove);
      const open = e.target.closest('[data-open-settings]');
      if (open) this.app.openSettings();
    });
    this.el.contextList.addEventListener('change', (e) => {
      const box = e.target.closest('input[data-context-id]');
      if (!box) return;
      if (box.checked) this.excluded.delete(box.dataset.contextId); else this.excluded.add(box.dataset.contextId);
      this.refreshContext();
    });
    this.setIntent(this.intent);
    this.render();
  }

  // === Chargement / enregistrement de _PARTNER.json ===
  async load(project) {
    const filePath = `${project.path}/${window.PartnerStore.FILE_NAME}`;
    const result = await window.api.readFile(filePath);
    let entry;
    if (result.success) {
      let parsed = null;
      let error = null;
      try {
        parsed = window.PartnerStore.normalizeStore(JSON.parse(result.content));
      } catch (e) {
        error = `${window.PartnerStore.FILE_NAME} est illisible (${e.message}).`;
      }
      error = error || parsed.error || null;
      entry = error
        ? { project, store: window.PartnerStore.createStore(), error: `${error} Il ne sera pas réécrit : conversations non enregistrées pour ce projet.` }
        : { project, store: parsed.store, error: null };
    } else if (result.code === 'ENOENT') {
      entry = { project, store: window.PartnerStore.createStore(), error: null, fresh: true };
    } else {
      entry = { project, store: window.PartnerStore.createStore(), error: `${window.PartnerStore.FILE_NAME} n'a pas pu être lu (${result.error}). Il ne sera pas réécrit.` };
    }
    // Une demande encore en cours pour ce projet garde l'état déjà en mémoire
    const previous = this.stores.get(project.path);
    if (previous && this.tracker.pendingFor(project.path)) entry = previous;
    this.stores.set(project.path, entry);
    this.excluded.clear();
    if (entry.store.workspace?.intent && window.PartnerContext.INTENTS[entry.store.workspace.intent]) {
      this.setIntent(entry.store.workspace.intent, { save: false });
    }
    return entry;
  }

  // Écritures enchaînées par projet ; renvoie false si l'écriture a échoué
  save(projectPath) {
    const entry = this.stores.get(projectPath);
    if (!entry) return Promise.resolve(true);
    clearTimeout(entry.saveTimer);
    if (entry.error) return Promise.resolve(false);
    const write = async () => {
      let result;
      try {
        result = await window.api.writeFile(`${projectPath}/${window.PartnerStore.FILE_NAME}`, window.PartnerStore.serialize(entry.store));
      } catch (error) {
        result = { success: false, error: error.message };
      }
      if (!result.success) {
        this.app.addChatMessage(`Conversation de « ${entry.project.name} » non enregistrée : ${result.error}`, 'error');
        return false;
      }
      entry.fresh = false;
      entry.dirty = false;
      return true;
    };
    entry.writeChain = (entry.writeChain || Promise.resolve(true)).then(write, write);
    return entry.writeChain;
  }

  scheduleSave(projectPath, delay = 1500) {
    const entry = this.stores.get(projectPath);
    if (!entry || entry.error) return;
    entry.dirty = true;
    clearTimeout(entry.saveTimer);
    entry.saveTimer = setTimeout(() => this.save(projectPath), delay);
  }

  // Enregistre ce qui est en attente (fermeture, changement de projet)
  async flush() {
    const results = await Promise.all([...this.stores.entries()]
      .filter(([, entry]) => entry.dirty && !entry.error)
      .map(([path]) => this.save(path)));
    return results.every(Boolean);
  }

  // Dernier document et position, mémorisés pour la réouverture
  // Un projet sans _PARTNER.json n'en reçoit un qu'après un vrai choix de l'auteur
  // (changement de document, conversation), pas à la simple ouverture.
  rememberDocument(docName, cursor, { persist = true } = {}) {
    const entry = this.current;
    if (!entry || !docName) return;
    const ws = entry.store.workspace;
    if (ws.lastDocument === docName && ws.cursors[docName] === cursor) return;
    const docChanged = ws.lastDocument !== docName;
    ws.lastDocument = docName;
    if (Number.isInteger(cursor)) ws.cursors[docName] = cursor;
    if (!persist || (entry.fresh && !docChanged)) return;
    this.scheduleSave(this.app.currentProject.path);
  }

  // === Intentions ===
  setIntent(intent, { save = true } = {}) {
    if (!window.PartnerContext.INTENTS[intent]) return;
    this.intent = intent;
    document.querySelectorAll('.intent-btn').forEach(btn => {
      const active = btn.dataset.intent === intent;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    });
    const info = window.PartnerContext.INTENTS[intent];
    this.el.input.placeholder = `${info.label} — ${info.hint}. Surligne un passage dans le texte pour le cibler.`;
    const entry = this.current;
    if (save && entry && entry.store.workspace.intent !== intent) {
      entry.store.workspace.intent = intent;
      this.scheduleSave(this.app.currentProject.path, 4000);
    }
  }

  focus(intent) {
    this.app.setPanelVisible('partner', true);
    if (intent) this.setIntent(intent);
    this.el.input.focus();
  }

  // === Disponibilité ===
  availability() {
    const s = this.app.settings || {};
    if (!this.app.currentProject) return { ok: false, message: 'Ouvre un projet pour travailler avec le partenaire.' };
    const entry = this.current;
    if (entry?.error) return { ok: false, message: entry.error };
    if (!s.apiProvider || s.apiProvider === 'none') return { ok: false, message: 'Aucun fournisseur IA choisi. L\'écriture reste disponible.', settings: true };
    const provider = s.providers?.[s.apiProvider];
    if (!provider?.hasApiKey) return { ok: false, message: `Aucune clé ${provider?.label || s.apiProvider} enregistrée. L'écriture reste disponible.`, settings: true };
    if (!provider.model) return { ok: false, message: `Choisis un modèle ${provider.label} dans les paramètres.`, settings: true };
    return { ok: true, message: `${provider.label} · ${provider.model}` };
  }

  renderStatus() {
    const { status, send, cancel } = this.el;
    const state = this.availability();
    const pending = this.app.currentProject && this.tracker.pendingFor(this.app.currentProject.path, this.conversationId());
    status.dataset.state = pending ? 'pending' : (state.ok ? 'ok' : 'unavailable');
    status.innerHTML = pending
      ? 'Le partenaire rédige sa réponse…'
      : `${this.app.escapeHtml(state.message)}${state.settings ? ' <button class="btn-link" data-open-settings>Paramètres</button>' : ''}`;
    send.disabled = !state.ok || Boolean(pending);
    cancel.classList.toggle('hidden', !pending);
  }

  conversationId() {
    const entry = this.current;
    return entry ? window.PartnerStore.activeConversation(entry.store).id : null;
  }

  // === Contexte ===
  // Contexte calculé à partir de l'éditeur (document, sélection, position), complété par la mémoire
  // narrative du projet (core/recall.js) : intentions, lectures, connaissances, passages pertinents.
  // `message` : la demande (ou le brouillon en cours), qui oriente la recherche des passages.
  buildContext(message = '') {
    const editor = this.app.editor;
    const entry = this.current;
    // Passage ciblé (garde la sélection même après un clic ailleurs), sinon sélection en cours
    const selection = this.app.targetRange();
    const scene = this.app.activeSceneContext();
    const docName = this.app.currentDoc?.name || '';
    const docText = this.app.currentDoc ? editor.value : '';
    const items = window.PartnerContext.buildContextItems({
      docName, docText, selection,
      cursor: editor.selectionStart,
      projectData: this.app.projectData,
      canon: entry?.store.canon || [],
      excluded: [...this.excluded],
      scene
    });
    const recall = this.recallItems({ docName, docText, selection, scene, message, items });
    return { items: [...items, ...recall.items], selection, recall };
  }

  recallItems({ docName, docText, selection, scene, message, items }) {
    const lecture = this.app.lecture;
    const project = this.app.currentProject;
    if (!project) return { items: [] };
    const scan = lecture.scanResult?.projectPath === project.path ? lecture.scanResult : null;
    // Unités pas encore calculées : recherche en arrière-plan, le contexte se met à jour ensuite
    if (!scan) lecture.ensureScan().then(found => { if (found) this.refreshContext(); });
    const U = window.Understanding;
    let units = scan ? scan.units : [];
    // Le document ouvert est relu depuis l'éditeur (modifications non enregistrées comprises)
    if (docName && units.some(u => u.document === docName)) {
      units = window.Recall.withCurrentDocument(units, docName, U.segment({ path: docName, content: docText, role: U.roleOf(lecture.store, docName) }).units);
    }
    const lineAt = (offset) => docText.slice(0, Math.max(0, offset)).split('\n').length;
    const anchor = selection ? selection.start : this.app.editor.selectionStart;
    const section = window.PartnerContext.findSection(docText, anchor);
    const [from, to] = [lineAt(section.start), lineAt(Math.max(section.start, section.end - 1))];
    const currentUnitIds = units.filter(u => u.document === docName && u.startLine <= to && u.endLine >= from).map(u => u.id);
    const sent = items.filter(i => i.kind === 'selection' || i.kind === 'section').map(i => i.text).join('\n');
    return window.Recall.contextItems({
      store: lecture.store, units, projectData: this.app.projectData, intent: this.intent, docName,
      cursorLine: lineAt(anchor), focusText: sent, message, sceneCharacterIds: scene?.characters || [],
      currentUnitIds, decisions: this.current?.store.decisions || [], excluded: [...this.excluded]
    });
  }

  refreshContext(delay = 250) {
    clearTimeout(this.contextTimer);
    this.contextTimer = setTimeout(() => this.renderContext(), delay);
  }

  renderContext() {
    const { contextSummary, contextList } = this.el;
    if (!this.app.currentProject) {
      contextSummary.textContent = '';
      contextList.innerHTML = '<p class="empty-state">Aucun projet ouvert.</p>';
      return;
    }
    const { items } = this.buildContext(this.el.input.value);
    const conversation = window.PartnerStore.activeConversation(this.current.store);
    const preview = window.PartnerContext.assembleRequest({
      intent: this.intent, items, history: conversation.messages, userMessage: '…', projectData: this.app.projectData
    }).report;
    const esc = (s) => this.app.escapeHtml(s);
    const sent = items.filter(i => i.included).length;
    contextSummary.textContent = `${sent} élément${sent > 1 ? 's' : ''} · ${preview.totalChars.toLocaleString('fr-FR')} car.`;

    const rows = items.map(item => `
      <li class="context-item${item.included ? '' : ' excluded'}">
        <label>
          <input type="checkbox" data-context-id="${esc(item.id)}" ${item.included ? 'checked' : ''} ${(item.omitted && !this.excluded.has(item.id)) || item.fixed ? 'disabled' : ''}${item.fixed ? ' title="Toujours envoyé : décrit ce que le partenaire a consulté"' : ''}>
          <span class="context-label">${esc(item.label)}</span>
        </label>
        <span class="context-meta">${item.chars.toLocaleString('fr-FR')} car.${item.why ? ` · ${esc(item.why)}` : ''}${item.truncated ? ' · coupé à la limite' : ''}${item.omitted ? ` · non envoyé (${esc(item.omitted)})` : ''}</span>
        <details><summary>Voir</summary><pre class="context-preview">${esc(item.text.slice(0, 1200))}${item.text.length > 1200 ? '\n[…]' : ''}</pre></details>
      </li>`).join('');
    const history = preview.history;
    contextList.innerHTML = `
      <ul class="context-items">${rows || '<li class="empty-state">Aucun passage : place le curseur dans le document ou sélectionne un extrait.</li>'}</ul>
      <p class="context-note">Historique : ${history.keptPairs} échange${history.keptPairs > 1 ? 's' : ''} envoyé${history.keptPairs > 1 ? 's' : ''}${history.omittedPairs ? `, ${history.omittedPairs} plus ancien${history.omittedPairs > 1 ? 's' : ''} non envoyé${history.omittedPairs > 1 ? 's' : ''} (limite ${window.PartnerContext.LIMITS.history.toLocaleString('fr-FR')} car.)` : ''}.</p>
      <p class="context-note">Le partenaire ne voit que ces éléments : pas le reste du projet, ni Internet. Lectures et passages viennent de l'espace Lecture ; la demande en cours oriente les passages joints.${preview.overLimit ? ` <strong>Total au-delà de la limite (${preview.limit.toLocaleString('fr-FR')} car.) : décoche des éléments.</strong>` : ''}</p>`;
  }

  // === Envoi ===
  async send() {
    const { input } = this.el;
    const text = input.value.trim();
    if (!text) return;
    const state = this.availability();
    if (!state.ok) {
      this.renderStatus();
      return;
    }
    const project = this.app.currentProject;
    const entry = this.current;
    const conversation = window.PartnerStore.activeConversation(entry.store);
    const request = this.tracker.start(project.path, conversation.id);
    if (!request) return; // une demande est déjà en cours dans cette conversation

    // Instantané au moment de l'envoi : les propositions sont ancrées sur ce texte
    const { items, selection } = this.buildContext(text);
    const snapshot = { docName: this.app.currentDoc?.name || '', docText: this.app.currentDoc ? this.app.editor.value : '', selection, docVersion: this.app.docVersion };
    const history = conversation.messages.slice();
    const req = window.PartnerContext.assembleRequest({ intent: this.intent, items, history, userMessage: text, projectData: this.app.projectData });
    if (req.report.overLimit) {
      this.tracker.cancel(request.id);
      this.app.addChatMessage(`Contexte trop long (${req.report.totalChars.toLocaleString('fr-FR')} car., limite ${req.report.limit.toLocaleString('fr-FR')}). Décoche des éléments dans « Contexte envoyé ».`, 'error');
      return;
    }

    const userMessage = window.PartnerStore.addMessage(entry.store, conversation.id, {
      role: 'user', content: text, intent: this.intent, docName: snapshot.docName, context: req.report
    });
    input.value = '';
    this.save(project.path);
    this.renderConversation();
    this.renderStatus();
    this.showTyping(true);

    let result;
    try {
      result = await window.api.aiChat(request.id, { system: req.system, messages: req.messages });
    } catch (error) {
      result = { success: false, error: error.message };
    }

    const finished = this.tracker.finish(request.id);
    const origin = this.stores.get(project.path);
    if (!finished || !origin) {
      // Annulée entre-temps : la demande reste visible, marquée comme annulée
      if (origin) {
        window.PartnerStore.addMessage(origin.store, conversation.id, { role: 'assistant', content: '', error: 'Demande annulée.', replyTo: userMessage.id });
        this.save(project.path);
      }
    } else if (result.success) {
      const extracted = window.Proposals.extractProposals(result.text);
      // Remarques critiques : chaque passage cité est recherché dans le contexte réellement envoyé
      const critique = window.Critique.extractRemarks(extracted.text);
      const sources = items.filter(i => i.included && !['perimetre', 'intentions', 'decisions'].includes(i.kind));
      const remarks = window.Critique.checkRemarks(critique.remarks, { sources, intentions: this.app.lecture.store.intentions || [] });
      const message = window.PartnerStore.addMessage(origin.store, conversation.id, {
        role: 'assistant', content: result.text, display: critique.text, intent: userMessage.intent,
        model: result.model || '', truncated: !!result.truncated, problems: [...extracted.problems, ...critique.problems], replyTo: userMessage.id,
        ...(remarks.length ? { remarks } : {})
      });
      const proposals = window.Proposals.createProposals(extracted.proposals, { ...snapshot, messageId: message.id, intent: userMessage.intent });
      window.PartnerStore.addProposals(origin.store, proposals);
      message.proposalIds = proposals.map(p => p.id);
      this.save(project.path);
    } else {
      window.PartnerStore.addMessage(origin.store, conversation.id, {
        role: 'assistant', content: '', error: result.cancelled ? 'Demande annulée.' : result.error || 'Erreur inconnue.', replyTo: userMessage.id
      });
      this.save(project.path);
    }

    const stillHere = this.app.currentProject?.path === project.path;
    if (stillHere) {
      this.showTyping(false);
      this.render();
    } else if (finished && result.success) {
      this.app.addChatMessage(`Réponse du partenaire rangée dans la conversation de « ${project.name} ».`, 'info');
    }
  }

  async cancel() {
    const project = this.app.currentProject;
    if (!project) return;
    const pending = this.tracker.pendingFor(project.path, this.conversationId());
    if (!pending) return;
    await window.api.aiCancel(pending.id);
  }

  newConversation() {
    const entry = this.current;
    if (!entry || entry.error) return;
    if (this.tracker.pendingFor(this.app.currentProject.path, this.conversationId())) return;
    window.PartnerStore.startConversation(entry.store);
    this.save(this.app.currentProject.path);
    this.render();
    this.el.input.focus();
  }

  // === Rendu ===
  render() {
    this.renderStatus();
    this.renderConversation();
    this.renderContext();
    this.renderCanon();
    this.renderVariants();
  }

  showTyping(show) {
    const container = this.el.messages;
    container.querySelector('.typing')?.remove();
    if (!show) return;
    const div = document.createElement('div');
    div.className = 'chat-message assistant typing';
    div.setAttribute('aria-label', 'Réponse en cours');
    div.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  renderConversation() {
    const container = this.el.messages;
    const entry = this.current;
    if (!entry) {
      container.innerHTML = '<div class="partner-empty"><p>Ouvre un projet : le partenaire travaille sur le document ouvert, le passage sélectionné et les faits que tu as validés.</p></div>';
      return;
    }
    const conversation = window.PartnerStore.activeConversation(entry.store);
    const count = entry.store.conversations.length;
    const header = count > 1 ? `<p class="conversation-meta">Conversation ${entry.store.conversations.indexOf(conversation) + 1}/${count} — les précédentes sont conservées dans _PARTNER.json.</p>` : '';
    if (!conversation.messages.length) {
      container.innerHTML = `${header}<div class="partner-empty">
        <p>Surligne un passage dans le texte : il reste ciblé (barre « Passage ciblé » en bas) même si tu cliques ailleurs, jusqu'à ce que tu le retires avec × ou Échap. Choisis une intention, puis pose ta question.</p>
        <p>Les propositions de modification apparaissent à part : tu les acceptes, les rejettes ou les gardes comme variantes.</p>
      </div>`;
      return;
    }
    container.innerHTML = header + conversation.messages.map(m => this.renderMessage(m, entry.store)).join('');
    if (this.app.currentProject && this.tracker.pendingFor(this.app.currentProject.path, conversation.id)) this.showTyping(true);
    container.scrollTop = container.scrollHeight;
  }

  renderMessage(message, store) {
    const esc = (s) => this.app.escapeHtml(s);
    const time = message.createdAt ? new Date(message.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const intent = window.PartnerContext.INTENTS[message.intent]?.label || '';
    if (message.role === 'user') {
      const ctx = message.context;
      const sent = ctx ? ctx.items.filter(i => i.included).map(i => i.label) : [];
      return `<div class="chat-message user">
        <div class="message-meta">${esc(intent)} · ${esc(time)}</div>
        <div class="message-content">${esc(message.content)}</div>
        ${ctx ? `<div class="message-context" title="${esc(sent.join('\n'))}">Contexte : ${sent.length ? esc(sent.join(' · ')) : 'aucun extrait'} · ${ctx.totalChars.toLocaleString('fr-FR')} car.</div>` : ''}
      </div>`;
    }
    if (message.error) {
      return `<div class="chat-message assistant failed"><div class="message-meta">${esc(time)}</div><div class="message-content">Pas de réponse : ${esc(message.error)} Rien n'a été modifié.</div></div>`;
    }
    const proposals = (message.proposalIds || []).map(id => window.PartnerStore.findProposal(store, id)).filter(Boolean);
    const notes = [
      message.truncated ? 'Réponse coupée par la limite de longueur.' : '',
      ...(message.problems || [])
    ].filter(Boolean);
    return `<div class="chat-message assistant">
      <div class="message-meta">Partenaire${message.model ? ` · ${esc(message.model)}` : ''} · ${esc(time)}</div>
      <div class="message-content">${esc(message.display ?? message.content)}</div>
      ${notes.length ? `<div class="message-warning">${notes.map(esc).join('<br>')}</div>` : ''}
      ${(message.remarks || []).map(r => this.renderRemark(r, message.id)).join('')}
      ${proposals.map(p => this.renderProposal(p)).join('')}
    </div>`;
  }

  // Remarque critique : nature, constat, passages (retrouvés ou non dans le contexte envoyé),
  // raisonnement, effet, pistes ; l'auteur la retient ou maintient son choix (le texte n'est pas modifié)
  renderRemark(r, messageId) {
    const esc = (s) => this.app.escapeHtml(s);
    const C = window.Critique;
    const row = (label, value) => (value ? `<p class="remark-row"><span class="proposal-label">${label}</span>${esc(value)}</p>` : '');
    const passages = r.passages.map(p => `<li class="${p.found ? 'found' : 'missing'}">« ${esc(p.text)} »
      <span class="small muted">${p.found ? esc(p.where || 'contexte envoyé') : 'introuvable dans le contexte envoyé'}</span></li>`).join('');
    const verdicts = { retenu: 'Retenue', maintenu: 'Choix maintenu' };
    return `<div class="proposal remark" data-nature="${esc(r.nature)}"${r.unsupported ? ' data-unsupported="true"' : ''}>
      <div class="proposal-head"><span class="proposal-mark">Remarque ${r.index} · ${esc(C.NATURES[r.nature] || r.nature)}</span>
        ${r.decision ? `<span class="proposal-status" data-status="${r.decision === 'retenu' ? 'accepted' : 'variant'}">${verdicts[r.decision]}</span>` : ''}</div>
      <p class="remark-constat">${esc(r.constat)}</p>
      ${passages ? `<ul class="remark-passages">${passages}</ul>` : ''}
      ${r.notes?.length ? `<p class="proposal-warning">${r.notes.map(esc).join('<br>')}</p>` : ''}
      ${row('Raisonnement', r.raisonnement)}${row('Effet probable', r.effet)}${row('Pistes', r.pistes)}${row('Question', r.question)}
      <div class="proposal-actions">
        <button class="btn-secondary btn-small" data-remark-action="retenu" data-message="${esc(messageId)}" data-id="${esc(r.id)}"${r.decision === 'retenu' ? ' disabled' : ''} title="Je retiens ce point (à traiter ; le texte n'est pas modifié)">Retenir</button>
        <button class="btn-secondary btn-small" data-remark-action="maintenu" data-message="${esc(messageId)}" data-id="${esc(r.id)}"${r.decision === 'maintenu' ? ' disabled' : ''} title="Je garde mon choix : le partenaire ne le reproposera pas comme un défaut">Je maintiens mon choix</button>
      </div>
    </div>`;
  }

  async onRemarkAction(verdict, messageId, remarkId) {
    const entry = this.current;
    if (!entry || entry.error) return;
    const message = entry.store.conversations.flatMap(c => c.messages).find(m => m.id === messageId);
    const remark = message?.remarks?.find(r => r.id === remarkId);
    if (!remark) return;
    const result = window.PartnerStore.addDecision(entry.store, { remarkId, messageId, verdict, text: window.Critique.decisionText(remark, verdict) });
    if (!result.ok) { this.app.addChatMessage(result.reason, 'error'); return; }
    remark.decision = verdict;
    const saved = await this.save(this.app.currentProject.path);
    if (!saved) this.app.addChatMessage('Décision non enregistrée.', 'error');
    this.render();
  }

  renderProposal(p) {
    const esc = (s) => this.app.escapeHtml(s);
    const labels = { pending: 'En attente', accepted: 'Appliquée', rejected: 'Rejetée', variant: 'Variante gardée' };
    const status = `<span class="proposal-status" data-status="${esc(p.status)}">${labels[p.status] || esc(p.status)}</span>`;
    const head = `<div class="proposal-head"><span class="proposal-mark">Proposition ${p.source?.index || ''}</span>${status}</div>`;
    const explanation = p.explanation ? `<p class="proposal-why">${esc(p.explanation)}</p>` : '';
    const open = p.status === 'pending' || p.status === 'variant';
    if (p.type === 'fact') {
      return `<div class="proposal" data-type="fact">${head}
        <p class="proposal-fact"><span class="proposal-label">Fait à valider</span>${esc(p.fact)}</p>${explanation}
        ${p.status === 'pending' ? `<div class="proposal-actions">
          <button class="btn-primary btn-small" data-proposal-action="accept-fact" data-id="${esc(p.id)}">Ajouter au canon</button>
          <button class="btn-secondary btn-small" data-proposal-action="reject" data-id="${esc(p.id)}">Rejeter</button>
        </div>` : ''}
      </div>`;
    }
    const where = p.target?.unanchored
      ? `<p class="proposal-warning">${esc(p.target.unanchored)} Elle ne peut pas être appliquée automatiquement.</p>`
      : `<p class="proposal-target">${esc(p.target?.docName || '')}</p>`;
    return `<div class="proposal" data-type="replace">${head}${where}
      <div class="proposal-diff">
        <div class="proposal-before"><span class="proposal-label">Avant</span>${esc(p.before)}</div>
        <div class="proposal-after"><span class="proposal-label">Proposé</span>${esc(p.after)}</div>
      </div>${explanation}
      ${p.lastCheck ? `<p class="proposal-warning">${esc(p.lastCheck)}</p>` : ''}
      ${open ? `<div class="proposal-actions">
        ${p.target?.unanchored ? '' : `<button class="btn-primary btn-small" data-proposal-action="accept" data-id="${esc(p.id)}">Appliquer</button>`}
        ${p.status === 'pending' ? `<button class="btn-secondary btn-small" data-proposal-action="variant" data-id="${esc(p.id)}">Garder en variante</button>` : ''}
        <button class="btn-secondary btn-small" data-proposal-action="copy" data-id="${esc(p.id)}">Copier</button>
        <button class="btn-secondary btn-small" data-proposal-action="reject" data-id="${esc(p.id)}">Rejeter</button>
      </div>` : ''}
    </div>`;
  }

  renderCanon() {
    const { canonCount, canonList } = this.el;
    const canon = this.current?.store.canon || [];
    const decisions = this.current?.store.decisions || [];
    const esc = (s) => this.app.escapeHtml(s);
    canonCount.textContent = canon.length || decisions.length ? `(${canon.length}${decisions.length ? ` · ${decisions.length} décision${decisions.length > 1 ? 's' : ''}` : ''})` : '';
    canonList.innerHTML = (canon.length
      ? `<ul class="canon-list">${canon.map(f => `<li><span>${esc(f.text)}</span>
          <button class="btn-link" data-canon-remove="${esc(f.id)}" aria-label="Retirer ce fait du canon">Retirer</button></li>`).join('')}</ul>`
      : '<p class="empty-state">Aucun fait validé. Les faits que tu ajoutes ici sont envoyés au partenaire comme canon.</p>') +
      (decisions.length
        ? `<p class="sub-label decisions-label">Décisions sur les remarques</p><ul class="canon-list">${decisions.map(d => `<li><span>${esc(d.text)}</span>
            <button class="btn-link" data-decision-remove="${esc(d.id)}" aria-label="Oublier cette décision">Oublier</button></li>`).join('')}</ul>`
        : '');
    const disabled = !this.current || Boolean(this.current.error);
    document.getElementById('canonInput').disabled = disabled;
    document.getElementById('btnAddCanon').disabled = disabled;
  }

  renderVariants() {
    const { variantsCount, variantsList } = this.el;
    const variants = (this.current?.store.proposals || []).filter(p => p.status === 'variant');
    variantsCount.textContent = variants.length ? `(${variants.length})` : '';
    variantsList.innerHTML = variants.length
      ? variants.map(p => this.renderProposal(p)).join('')
      : '<p class="empty-state">Aucune variante gardée.</p>';
  }

  // === Décisions de l'auteur ===
  async onProposalAction(action, id) {
    const entry = this.current;
    if (!entry || entry.error || this.busyProposals.has(id)) return;
    const proposal = window.PartnerStore.findProposal(entry.store, id);
    if (!proposal) return;
    const projectPath = this.app.currentProject.path;
    this.busyProposals.add(id);
    try {
      if (action === 'accept') await this.applyProposal(entry, proposal);
      else if (action === 'accept-fact') {
        const added = window.PartnerStore.addCanon(entry.store, proposal.fact, { proposalId: proposal.id });
        if (added.ok) window.PartnerStore.setProposalStatus(entry.store, id, 'accepted');
        if (!(await this.save(projectPath))) return;
      } else if (action === 'variant' || action === 'reject') {
        const result = window.PartnerStore.setProposalStatus(entry.store, id, action === 'variant' ? 'variant' : 'rejected');
        if (!result.ok) this.app.addChatMessage(result.reason, 'error');
        await this.save(projectPath);
      } else if (action === 'copy') {
        await navigator.clipboard.writeText(proposal.type === 'fact' ? proposal.fact : proposal.after);
        this.app.addChatMessage('Version proposée copiée dans le presse-papiers.', 'info');
        return;
      }
    } finally {
      this.busyProposals.delete(id);
    }
    if (this.app.currentProject?.path === projectPath) this.render();
  }

  async applyProposal(entry, proposal) {
    const projectPath = this.app.currentProject.path;
    if (proposal.target?.docName && proposal.target.docName !== this.app.currentDoc?.name) {
      const opened = await this.app.openDocument(proposal.target.docName);
      if (!opened || this.app.currentProject?.path !== projectPath) return;
    }
    if (this.app.editor.readOnly) {
      this.app.addChatMessage('Le document est en lecture seule : proposition non appliquée.', 'error');
      return;
    }
    const check = window.Proposals.checkApplicable(proposal, { docName: this.app.currentDoc?.name, text: this.app.editor.value });
    if (!check.ok) {
      if (proposal.status !== 'pending' && proposal.status !== 'variant') return;
      proposal.lastCheck = check.reason;
      await this.save(projectPath);
      return;
    }
    if (!this.app.replaceRange(check.start, check.end, proposal.after)) {
      this.app.addChatMessage('La modification n\'a pas pu être insérée dans le document. Rien n\'a été changé.', 'error');
      return;
    }
    delete proposal.lastCheck;
    window.PartnerStore.setProposalStatus(entry.store, proposal.id, 'accepted', {
      appliedAt: new Date().toISOString(),
      appliedRange: { start: check.start, end: check.start + proposal.after.length },
      appliedBefore: proposal.before
    });
    const [docSaved] = await Promise.all([this.app.flushNotes(), this.save(projectPath)]);
    this.app.addChatMessage(docSaved
      ? `Modification appliquée${check.moved ? ' (le passage avait été déplacé, il a été retrouvé à l\'identique)' : ''} et document enregistré. Ctrl+Z dans le document pour revenir en arrière.`
      : 'Modification appliquée dans l\'éditeur, mais le document n\'a PAS été enregistré.', docSaved ? 'info' : 'error');
  }

  async addCanonFromInput() {
    const input = document.getElementById('canonInput');
    const entry = this.current;
    if (!entry || entry.error || !input.value.trim()) return;
    const result = window.PartnerStore.addCanon(entry.store, input.value, { manual: true });
    if (result.duplicate) this.app.addChatMessage('Ce fait est déjà dans le canon.', 'info');
    if (await this.save(this.app.currentProject.path)) input.value = '';
    this.renderCanon();
    this.refreshContext();
  }

  async removeDecision(id) {
    const entry = this.current;
    if (!entry || entry.error) return;
    if (!window.PartnerStore.removeDecision(entry.store, id)) return;
    await this.save(this.app.currentProject.path);
    this.renderCanon();
    this.refreshContext();
  }

  async removeCanon(id) {
    const entry = this.current;
    if (!entry || entry.error) return;
    const fact = entry.store.canon.find(f => f.id === id);
    if (!fact || !confirm(`Retirer ce fait du canon ?\n\n« ${fact.text} »`)) return;
    window.PartnerStore.removeCanon(entry.store, id);
    await this.save(this.app.currentProject.path);
    this.renderCanon();
    this.refreshContext();
  }
}

window.PartnerPanel = PartnerPanel;
