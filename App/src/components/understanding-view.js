// === Espace Lecture : ce que Partner comprend du projet ===
// Sources choisies par l'auteur, découpage en unités, lecture unité par unité (annulable, reprise
// là où elle s'est arrêtée), couverture affichée, synthèse « Voici ce que je comprends » et lectures
// à valider, rejeter ou corriger, intentions de l'auteur. Mémoire dans Projets/<Nom>/_COMPREHENSION.json
// (core/understanding.js) : illisible → jamais réécrite. Aucun texte du projet n'est modifié ici.
// Les unités et lectures servent aussi au partenaire et aux fiches (core/recall.js).

(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size) => window.Icons.svg(name, { size });
  const U = () => window.Understanding;
  const C = () => window.Claims;
  const FILTERS = { 'à vérifier': 'À vérifier', 'accepté': 'Validées', 'rejeté': 'Rejetées', 'obsolète': 'Obsolètes' };
  const SKIP_DIRS = /^(\.|node_modules$)/;

  class UnderstandingView {
    constructor(app) {
      this.app = app;
      this.root = document.getElementById('workspaceLecture');
      this.entries = new Map(); // project.path → { project, store, error, writeChain }
      this.scanResult = null;   // { projectPath, docs, described, problems, units, notices }
      this.running = null;      // { projectPath, cancelled, requestId, done, total, current }
      this.filter = 'à vérifier';
      this.editingId = null;
      this.message = null;
      this.root.addEventListener('click', (e) => this.onClick(e));
      this.root.addEventListener('change', (e) => this.onChange(e));
    }

    get project() { return this.app.currentProject; }
    get entry() { return this.project ? this.entries.get(this.project.path) : null; }
    get store() { return this.entry?.store || U().createStore(); }

    // === Mémoire ===
    async load(project) {
      const result = await window.api.readFile(`${project.path}/${U().FILE_NAME}`);
      let entry;
      if (result.success) {
        let parsed = null;
        try { parsed = U().normalizeStore(JSON.parse(result.content)); } catch (e) { parsed = { error: `${U().FILE_NAME} est illisible (${e.message}).` }; }
        entry = parsed.error
          ? { project, store: U().createStore(), error: `${parsed.error} Il ne sera pas réécrit : la lecture n'est pas enregistrée pour ce projet.` }
          : { project, store: parsed.store, error: null };
      } else if (result.code === 'ENOENT') {
        entry = { project, store: U().createStore(), error: null };
      } else {
        entry = { project, store: U().createStore(), error: `${U().FILE_NAME} n'a pas pu être lu (${result.error}). Il ne sera pas réécrit.` };
      }
      // Une lecture en cours pour ce projet garde l'état déjà en mémoire
      if (this.running?.projectPath === project.path && this.entries.has(project.path)) return this.entries.get(project.path);
      this.entries.set(project.path, entry);
      if (this.scanResult?.projectPath !== project.path) this.scanResult = null;
      this.editingId = null;
      this.intentionEdit = null;
      this.intentionError = null;
      this.message = null;
      return entry;
    }

    // Écritures enchaînées par projet ; « Enregistré » seulement après confirmation
    save(projectPath) {
      const entry = this.entries.get(projectPath);
      if (!entry || entry.error) return Promise.resolve(false);
      const write = async () => {
        let result;
        try {
          result = await window.api.writeFile(`${projectPath}/${U().FILE_NAME}`, U().serialize(entry.store));
        } catch (error) {
          result = { success: false, error: error.message };
        }
        if (!result.success) {
          this.app.addChatMessage(`Lecture de « ${entry.project.name} » non enregistrée : ${result.error}`, 'error');
          return false;
        }
        return true;
      };
      entry.writeChain = (entry.writeChain || Promise.resolve(true)).then(write, write);
      return entry.writeChain;
    }

    async update(projectPath, fn) {
      const entry = this.entries.get(projectPath);
      if (!entry) return false;
      entry.store = fn(entry.store);
      return this.save(projectPath);
    }

    // === Sources ===
    // Documents .md du projet, sous-dossiers compris (deux niveaux), jamais hors du projet
    async listDocuments(project) {
      const docs = [];
      const walk = async (dir, prefix, depth) => {
        const result = await window.api.listFiles(dir);
        if (!result.success) return;
        for (const f of result.files) {
          if (f.isDirectory) {
            if (depth < 2 && !SKIP_DIRS.test(f.name)) await walk(f.path, `${prefix}${f.name}/`, depth + 1);
          } else if (/\.md$/i.test(f.name) && !f.name.startsWith('.')) {
            docs.push({ path: `${prefix}${f.name}`, file: f.path });
          }
        }
      };
      await walk(project.path, '', 0);
      return docs.sort((a, b) => (a.path === '_NOTES.md' ? -1 : b.path === '_NOTES.md' ? 1 : a.path.localeCompare(b.path, 'fr')));
    }

    // Texte actuel d'un document : celui de l'éditeur s'il est ouvert (même non enregistré)
    async readDocument(project, doc) {
      if (this.app.currentProject?.path === project.path && this.app.currentDoc?.name === doc.path) {
        return { content: this.app.editor.value };
      }
      const result = await window.api.readFile(doc.file);
      return result.success ? { content: result.content } : { error: result.error };
    }

    async scan() {
      const project = this.project;
      if (!project) return null;
      const docs = await this.listDocuments(project);
      const read = await Promise.all(docs.map(d => this.readDocument(project, d)));
      if (this.project?.path !== project.path) return null;
      const unreadable = [];
      const withContent = docs.map((d, i) => {
        if (read[i].error) unreadable.push(`${d.path} : ${read[i].error}`);
        return { ...d, content: read[i].content ?? '' };
      });
      const store = this.store;
      const described = U().describeSources(withContent, store);
      const problems = U().sourceProblems(described);
      const selected = withContent
        .filter((d, i) => U().ANALYZED_ROLES.has(described[i].role) && !problems.skipped.has(d.path) && !read[i].error)
        .map(d => ({ path: d.path, content: d.content, role: U().roleOf(store, d.path) }));
      const { units, notices } = U().buildUnits(selected);
      this.scanResult = { projectPath: project.path, docs: withContent, described, problems, units, notices, unreadable };

      // Texte modifié ou source retirée : lectures dépendantes obsolètes (décisions de l'auteur signalées)
      const refreshed = U().refresh(store, units);
      if (refreshed.obsolete || refreshed.flagged) {
        await this.update(project.path, () => refreshed.store);
        this.message = `${refreshed.obsolete} lecture(s) devenue(s) obsolète(s), ${refreshed.flagged} lecture(s) validée(s) à revoir : leur texte source a changé.`;
      }
      return this.scanResult;
    }

    // Unités du projet ouvert, calculées une fois (le partenaire en a besoin hors de l'espace Lecture)
    ensureScan() {
      const path = this.project?.path;
      if (!path) return Promise.resolve(null);
      if (this.scanResult?.projectPath === path) return Promise.resolve(this.scanResult);
      if (this.scanning?.path !== path) {
        const promise = this.scan().finally(() => { if (this.scanning?.promise === promise) this.scanning = null; });
        this.scanning = { path, promise };
      }
      return this.scanning.promise;
    }

    // Version actuelle d'une unité (texte relu au moment où la réponse arrive)
    async currentVersionOf(project, unit) {
      const doc = this.scanResult?.docs.find(d => d.path === unit.document);
      if (!doc) return undefined;
      const read = await this.readDocument(project, doc);
      if (read.error) return undefined;
      const { units } = U().segment({ path: doc.path, content: read.content, role: unit.sourceRole });
      return units.find(u => u.id === unit.id)?.version;
    }

    knownNames() {
      const data = this.app.projectData;
      const list = [...(data.characters || []), ...(data.places || [])]
        .filter(e => e && e.name)
        .map(e => ({ name: e.name, aliases: Array.isArray(e.aliases) ? e.aliases : [] }));
      const seen = new Set(list.map(e => e.name.toLowerCase()));
      Object.values(this.store.units).forEach(rec => (rec.entities || []).forEach(e => {
        if (!seen.has(e.name.toLowerCase())) { seen.add(e.name.toLowerCase()); list.push({ name: e.name, aliases: e.aliases || [] }); }
      }));
      return list;
    }

    // === Lecture ===
    async run() {
      const project = this.project;
      if (!project || this.running) return;
      const entry = this.entry;
      if (entry?.error) { this.app.addChatMessage(entry.error, 'error'); return; }
      const settings = this.app.settings;
      if (!settings.hasApiKey || !settings.model) {
        this.message = 'La lecture sémantique demande un fournisseur IA (Paramètres). Sans IA, le découpage, la couverture et la présence des personnages restent disponibles.';
        this.render();
        return;
      }
      const scan = await this.scan();
      if (!scan) return;
      if (scan.problems.blocking.length) {
        this.message = scan.problems.blocking.join(' ');
        this.render();
        return;
      }
      const model = settings.model;
      const plan = U().planRun(this.store, scan.units, { model });
      if (!plan.todo.length) {
        this.message = scan.units.length ? 'Toutes les unités sont déjà lues dans leur version actuelle.' : 'Aucune source retenue : choisis au moins un document.';
        this.render();
        return;
      }
      if (plan.calls) {
        const { confirmed } = await this.app.showConfirmDialog({
          title: 'Lire le projet',
          message: `${plan.calls} unité(s) à envoyer à l'IA (${settings.providers?.[settings.apiProvider]?.label || settings.apiProvider} · ${model}), soit environ ${Math.round(plan.chars / 1000)} 000 caractères, une unité à la fois.` +
            `${plan.cached.length ? ` ${plan.cached.length} unité(s) déjà lues avec ce texte et ce modèle seront reprises sans appel.` : ''}` +
            ' Tu peux annuler à tout moment : ce qui est lu reste enregistré, la reprise repart de là.',
          confirmLabel: 'Lancer la lecture'
        });
        if (!confirmed || this.project?.path !== project.path) return;
      }

      const run = this.running = { projectPath: project.path, cancelled: false, requestId: null, done: 0, failed: 0, ignored: 0, total: plan.todo.length, current: '' };
      this.message = null;
      this.render();
      const known = this.knownNames();
      const cachedIds = new Set(plan.cached.map(u => u.id));
      for (const unit of plan.todo) {
        if (run.cancelled) break;
        run.current = unit.label;
        this.renderProgress();
        let outcome;
        if (cachedIds.has(unit.id)) {
          const cached = this.entries.get(project.path).store.cache[U().cacheKey(unit, model)];
          outcome = U().applyUnitResult(this.entries.get(project.path).store, unit, cached.data, { model, fromCache: true });
        } else {
          const prompt = U().buildUnitPrompt(unit, known);
          run.requestId = window.PartnerStore.newId('rq');
          let response;
          try {
            response = await window.api.aiChat(run.requestId, { system: prompt.system, messages: [{ role: 'user', content: prompt.user }] });
          } catch (error) {
            response = { success: false, error: error.message };
          }
          run.requestId = null;
          if (run.cancelled) break;
          // Le texte a pu changer pendant l'appel : une réponse sur une ancienne version est ignorée
          const currentVersion = await this.currentVersionOf(project, unit);
          const store = this.entries.get(project.path).store;
          if (!response.success) {
            outcome = U().recordFailure(store, unit, response.error || 'erreur inconnue', { currentVersion, model });
          } else if (response.truncated) {
            outcome = U().recordFailure(store, unit, 'réponse tronquée (unité trop riche)', { currentVersion, model });
          } else {
            const parsed = U().parseUnitResponse(response.text);
            outcome = parsed.error
              ? U().recordFailure(store, unit, parsed.error, { currentVersion, model })
              : U().applyUnitResult(store, unit, parsed.data, { model, currentVersion });
          }
        }
        if (outcome.ignored) { run.ignored++; continue; }
        if (outcome.store.units[unit.id]?.status === 'echec') run.failed++; else run.done++;
        await this.update(project.path, () => outcome.store);
        this.renderProgress();
      }
      await this.update(project.path, (s) => U().recordRun(s, {
        model, units: run.total, done: run.done, failed: run.failed, ignored: run.ignored, cancelled: run.cancelled
      }));
      this.running = null;
      const parts = [`${run.done} unité(s) lue(s)`];
      if (run.failed) parts.push(`${run.failed} en échec (relance possible)`);
      if (run.ignored) parts.push(`${run.ignored} réponse(s) ignorée(s) : texte modifié pendant la lecture`);
      this.message = `${run.cancelled ? 'Lecture annulée' : 'Lecture terminée'} : ${parts.join(', ')}.`;
      if (this.project?.path === project.path) { await this.scan(); this.render(); }
    }

    cancel() {
      if (!this.running) return;
      this.running.cancelled = true;
      if (this.running.requestId) window.api.aiCancel(this.running.requestId);
      this.renderProgress();
    }

    // === Décisions de l'auteur ===
    // Aussi appelées depuis la Bible : le partenaire et la fiche ouverte sont mis à jour
    async decide(id, status) {
      if (!this.project) return false;
      if (this.entry?.error) { this.app.addChatMessage(this.entry.error, 'error'); return false; }
      const ok = await this.update(this.project.path, (s) => ({ ...s, claims: C().setStatus(s.claims, id, status) }));
      this.afterChange();
      return ok;
    }

    afterChange() {
      this.render();
      this.app.partner.refreshContext();
      if (this.app.workspace === 'bible') this.app.bible.renderSheet();
    }

    // Ouvre la lecture dans l'espace Lecture, formulaire de correction ouvert
    async editClaim(id) {
      const claim = this.store.claims.find(c => c.id === id);
      if (!claim) return;
      this.app.setWorkspace('lecture');
      await this.show();
      this.filter = claim.status;
      this.editingId = id;
      this.renderClaims();
      const card = this.root.querySelector(`[data-claim="${CSS.escape(id)}"]`);
      card?.scrollIntoView({ block: 'center' });
      card?.querySelector('textarea')?.focus();
    }

    async openSource(doc, line) {
      if (!doc || doc.includes('/')) return;
      this.app.setWorkspace('write');
      if (!(await this.app.openDocument(doc))) return;
      const pos = this.app.editor.value.split('\n').slice(0, Math.max(0, line - 1)).join('\n').length + (line > 1 ? 1 : 0);
      this.app.editor.setSelectionRange(pos, pos);
      this.app.editor.focus();
    }

    // === Intentions de l'auteur ===
    async saveIntention(form) {
      if (!this.project) return;
      if (this.entry?.error) { this.app.addChatMessage(this.entry.error, 'error'); return; }
      const fields = {
        kind: form.querySelector('[name="kind"]').value,
        text: form.querySelector('[name="text"]').value,
        about: form.querySelector('[name="about"]').value,
        quote: form.querySelector('[name="quote"]').value,
        document: form.dataset.document || ''
      };
      const id = this.intentionEdit;
      const result = id === 'new' ? U().addIntention(this.store, fields) : U().updateIntention(this.store, id, fields);
      if (result.error) { this.intentionError = result.error; this.renderIntentions(fields); return; }
      this.intentionEdit = null;
      this.intentionError = null;
      const ok = await this.update(this.project.path, () => result.store);
      this.message = ok ? null : 'Intention non enregistrée.';
      this.afterChange();
    }

    async removeIntention(id) {
      const intention = (this.store.intentions || []).find(i => i.id === id);
      if (!intention || !this.project) return;
      const { confirmed } = await this.app.showConfirmDialog({
        title: 'Retirer cette intention ?', message: `« ${intention.text} »\n\nLe partenaire ne la recevra plus.`,
        confirmLabel: 'Retirer', cancelLabel: 'Garder'
      });
      if (!confirmed) return;
      await this.update(this.project.path, (s) => U().removeIntention(s, id));
      this.afterChange();
    }

    // Passage ciblé dans Écrire (ou sélection) recopié comme ancre de l'intention
    targetedPassage() {
      const range = this.app.targetRange?.();
      if (!range || !this.app.currentDoc) return null;
      return { text: this.app.editor.value.slice(range.start, range.end).trim(), document: this.app.currentDoc.name };
    }

    async saveCorrection(id) {
      const form = this.root.querySelector(`[data-correct-form="${CSS.escape(id)}"]`);
      if (!form || !this.project) return;
      const text = form.querySelector('textarea').value;
      const nature = form.querySelector('select').value;
      const store = this.store;
      const result = C().correct(store.claims, id, text, nature);
      if (result.error) { this.message = result.error; this.render(); return; }
      this.editingId = null;
      await this.update(this.project.path, (s) => ({ ...s, claims: result.list }));
      this.afterChange();
    }

    // === Événements ===
    async onClick(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      switch (btn.dataset.action) {
        case 'run': return this.run();
        case 'cancel': return this.cancel();
        case 'scan': await this.scan(); return this.render();
        case 'filter': this.filter = btn.dataset.filter; return this.renderClaims();
        case 'accept': return this.decide(id, 'accepté');
        case 'reject': return this.decide(id, 'rejeté');
        case 'reopen': return this.decide(id, 'à vérifier');
        case 'correct': this.editingId = id; this.renderClaims(); this.root.querySelector(`[data-correct-form="${CSS.escape(id)}"] textarea`)?.focus(); return;
        case 'correct-cancel': this.editingId = null; return this.renderClaims();
        case 'correct-save': return this.saveCorrection(id);
        case 'intention-add': this.intentionEdit = 'new'; this.intentionError = null; this.renderIntentions(); this.root.querySelector('#intentionText')?.focus(); return;
        case 'intention-edit': this.intentionEdit = id; this.intentionError = null; this.renderIntentions(); this.root.querySelector('#intentionText')?.focus(); return;
        case 'intention-cancel': this.intentionEdit = null; this.intentionError = null; return this.renderIntentions();
        case 'intention-save': return this.saveIntention(btn.closest('.intention-form'));
        case 'intention-remove': return this.removeIntention(id);
        case 'intention-use-target': {
          const form = btn.closest('.intention-form');
          const passage = this.targetedPassage();
          if (!form || !passage?.text) return;
          form.querySelector('[name="quote"]').value = passage.text.slice(0, 600);
          form.dataset.document = passage.document;
          return;
        }
        case 'show-claim': {
          const claim = this.store.claims.find(c => c.id === id);
          if (claim) { this.filter = claim.status; this.renderClaims(); this.root.querySelector(`[data-claim="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }); }
          return;
        }
        case 'open-source': return this.openSource(btn.dataset.doc, Number(btn.dataset.line));
      }
    }

    async onChange(e) {
      const select = e.target.closest('select[data-role-for]');
      if (!select || !this.project) return;
      if (this.running) { this.render(); return; }
      if (this.entry?.error) { this.app.addChatMessage(this.entry.error, 'error'); return; }
      await this.update(this.project.path, (s) => U().setRole(s, select.dataset.roleFor, select.value));
      await this.scan();
      this.render();
    }

    // === Rendu ===
    async show() {
      if (this.app.workspace !== 'lecture') return;
      if (this.project && this.scanResult?.projectPath !== this.project.path) await this.ensureScan();
      this.render();
    }

    render() {
      if (this.app.workspace !== 'lecture') return;
      if (!this.project) {
        this.root.innerHTML = '<div class="view-empty"><h2>Lecture</h2><p>Choisissez un projet pour voir ce que Partner en comprend.</p></div>';
        return;
      }
      const scan = this.scanResult?.projectPath === this.project.path ? this.scanResult : null;
      const running = this.running?.projectPath === this.project.path;
      const error = this.entry?.error;
      this.root.innerHTML = `
        <div class="view-layout lecture-layout">
          <div class="view-main">
            <header class="view-header">
              <div>
                <h1 class="view-title">Lecture</h1>
                <p class="view-sub">Ce que Partner comprend de ton histoire, et d'où il le tient</p>
              </div>
              <div class="view-actions">
                <button class="btn-secondary" data-action="scan"${running ? ' disabled' : ''}>Actualiser</button>
                ${running
                  ? '<button class="btn-secondary" data-action="cancel">Annuler la lecture</button>'
                  : `<button class="btn-primary" data-action="run"${error ? ' disabled' : ''}>${icon('analyse')}${this.hasProgress(scan) ? 'Reprendre la lecture' : 'Lire le projet'}</button>`}
              </div>
            </header>
            ${error ? `<div class="notice notice-error" role="alert">${esc(error)}</div>` : ''}
            <div id="lectureProgress" aria-live="polite"></div>
            ${this.message ? `<div class="notice notice-warning" role="status">${esc(this.message)}</div>` : ''}
            ${scan ? this.sourcesHtml(scan, running) + this.coverageHtml(scan) : '<p class="muted">Recherche des documents…</p>'}
            <section class="lecture-section" id="lectureIntentions" aria-labelledby="lectureIntentionsTitle"></section>
            ${scan ? this.synthesisHtml(scan) : ''}
          </div>
          <aside class="view-detail lecture-claims" id="lectureClaims" aria-label="Lectures"></aside>
        </div>`;
      this.renderProgress();
      this.renderIntentions();
      this.renderClaims();
    }

    // Intentions : saisies par l'auteur seulement, envoyées au partenaire, jamais déduites.
    // `typed` : valeurs à réafficher après une erreur de saisie.
    renderIntentions(typed = null) {
      const slot = this.root.querySelector('#lectureIntentions');
      if (!slot) return;
      const kinds = U().INTENTION_KINDS;
      const list = this.store.intentions || [];
      const readOnly = !!this.entry?.error;
      const form = (i) => {
        const v = typed || i || {};
        const options = Object.entries(kinds).map(([k, label]) => `<option value="${k}"${k === (v.kind || 'ton') ? ' selected' : ''}>${esc(label)}</option>`).join('');
        return `<div class="intention-form"${v.document ? ` data-document="${esc(v.document)}"` : ''}>
          ${this.intentionError ? `<div class="notice notice-error" role="alert">${esc(this.intentionError)}</div>` : ''}
          <div class="field"><label for="intentionKind">Type</label><select id="intentionKind" name="kind" class="select-compact">${options}</select></div>
          <div class="field"><label for="intentionText">Intention</label><textarea id="intentionText" name="text" rows="3">${esc(v.text || '')}</textarea></div>
          <div class="field"><label for="intentionAbout">Concerne <span class="muted small">(facultatif : personnage, relation, scène…)</span></label><input id="intentionAbout" name="about" value="${esc(v.about || '')}"></div>
          <div class="field"><label for="intentionQuote">Passage précis <span class="muted small">(facultatif, copie exacte du texte)</span></label>
            <textarea id="intentionQuote" name="quote" rows="2">${esc(v.quote || '')}</textarea>
            ${this.targetedPassage()?.text ? '<button type="button" class="btn-link small" data-action="intention-use-target">Utiliser le passage ciblé dans Écrire</button>' : ''}</div>
          <div class="form-actions">
            <button class="btn-primary" data-action="intention-save">Enregistrer</button>
            <button class="btn-secondary" data-action="intention-cancel">Annuler</button>
          </div>
        </div>`;
      };
      const groups = Object.entries(kinds).map(([k, label]) => {
        const items = list.filter(i => i.kind === k);
        if (!items.length) return '';
        return `<h3 class="synth-title intention-kind">${esc(label)}</h3><ul class="synth-list intention-list">${items.map(i => (this.intentionEdit === i.id ? `<li>${form(i)}</li>` : `<li>
          <span>${esc(i.text)}</span>${i.about ? ` <span class="small muted">· ${esc(i.about)}</span>` : ''}
          ${i.quote ? `<blockquote class="claim-quote">« ${esc(i.quote)} »${i.document ? ` <span class="small muted">${esc(i.document)}</span>` : ''}</blockquote>` : ''}
          ${readOnly ? '' : `<button class="btn-link small" data-action="intention-edit" data-id="${esc(i.id)}">Modifier</button>
          <button class="btn-link small danger" data-action="intention-remove" data-id="${esc(i.id)}">Retirer</button>`}
        </li>`)).join('')}</ul>`;
      }).join('');
      slot.innerHTML = `<h2 class="sub-label" id="lectureIntentionsTitle">Mes intentions</h2>
        <p class="small muted">Ton, thèmes, expérience recherchée, voix, ambiguïtés volontaires, éléments à préserver, pistes ouvertes. Le partenaire les reçoit et y confronte sa lecture ; il ne les invente jamais. Une ambiguïté liée à un passage précis n'est pas critiquée comme un défaut.</p>
        ${groups || (this.intentionEdit === 'new' ? '' : '<p class="small muted">Aucune intention pour l\'instant.</p>')}
        ${this.intentionEdit === 'new' ? form(null) : readOnly ? '' : `<button class="btn-secondary" data-action="intention-add">${icon('plus')}Ajouter une intention</button>`}`;
    }

    hasProgress(scan) {
      if (!scan) return false;
      const cov = U().coverage(this.store, scan.units);
      return cov.fait > 0 && !cov.complete;
    }

    renderProgress() {
      const slot = this.root.querySelector('#lectureProgress');
      if (!slot) return;
      const run = this.running?.projectPath === this.project?.path ? this.running : null;
      if (!run) { slot.innerHTML = ''; return; }
      const pct = Math.round(((run.done + run.failed + run.ignored) / run.total) * 100);
      slot.innerHTML = `<div class="lecture-progress">
        <div class="coverage-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
        <p class="small">${run.cancelled ? 'Annulation…' : `Lecture de « ${esc(run.current)} »`} — ${run.done} lue(s), ${run.failed} en échec, sur ${run.total}.</p>
      </div>`;
    }

    sourcesHtml(scan, running) {
      const cov = U().coverage(this.store, scan.units);
      const rows = scan.described.map(s => {
        const remarks = [];
        if (s.duplicateOf) remarks.push(`identique à « ${esc(s.duplicateOf)} »`);
        s.similar.forEach(o => remarks.push(`version proche de « ${esc(o.path)} » (${Math.round(o.ratio * 100)} % de lignes communes)`));
        if (scan.problems.skipped.has(s.path)) remarks.push('lu une seule fois (doublon)');
        const doc = cov.byDocument[s.path];
        const state = doc ? (doc.complete ? `entièrement lu (${doc.total} unité${doc.total > 1 ? 's' : ''})` : `${doc.fait}/${doc.total} unité(s) lue(s)`) : '—';
        const options = Object.entries(U().ROLES).map(([k, label]) => `<option value="${k}"${k === s.role ? ' selected' : ''}>${esc(label)}</option>`).join('');
        return `<tr>
          <td class="source-path">${esc(s.path)}<span class="small muted"> · ${Math.round(s.chars / 100) / 10} k car. · version ${esc(s.version.slice(0, 6))}</span>
            ${remarks.length ? `<div class="small source-remark">${remarks.join(' ; ')}</div>` : ''}</td>
          <td><label class="visually-hidden" for="role-${esc(s.path)}">Rôle de ${esc(s.path)}</label>
            <select class="select-compact" id="role-${esc(s.path)}" data-role-for="${esc(s.path)}"${running || this.entry?.error ? ' disabled' : ''}>${options}</select></td>
          <td class="small">${state}</td>
        </tr>`;
      }).join('');
      const notes = [...scan.problems.blocking.map(b => `<div class="notice notice-error" role="alert">${esc(b)}</div>`),
        ...scan.unreadable.map(u => `<div class="notice notice-error">Illisible : ${esc(u)}</div>`)];
      return `<section class="lecture-section" aria-labelledby="lectureSources">
        <h2 class="sub-label" id="lectureSources">Sources</h2>
        <p class="small muted">Seuls les documents retenus sont lus. « Fait autorité » : le texte de référence ; brouillons et références sont lus mais signalés comme tels. Aucun document n'est fusionné avec un autre.</p>
        ${notes.join('')}
        <table class="lecture-table"><thead><tr><th>Document</th><th>Rôle</th><th>État</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Aucun document .md dans ce projet.</td></tr>'}</tbody></table>
      </section>`;
    }

    coverageHtml(scan) {
      const cov = U().coverage(this.store, scan.units);
      if (!cov.total) return '';
      const pct = cov.chars ? Math.round((cov.charsDone / cov.chars) * 100) : 0;
      const rows = scan.units.map(u => {
        const state = U().unitState(this.store, u);
        const rec = this.store.units[u.id];
        const detail = [];
        if (state === 'fait') {
          detail.push(`${rec.claimCount} lecture(s)`);
          if (rec.rejected?.length) detail.push(`<details><summary>${rec.rejected.length} écartée(s)</summary><ul>${rec.rejected.map(r => `<li>${esc(r.content)} — <em>${esc(r.reason)}</em></li>`).join('')}</ul></details>`);
          if (rec.notices?.length) detail.push(`<details><summary>${rec.notices.length} requalifiée(s)</summary><ul>${rec.notices.map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>`);
        }
        if (state === 'echec') detail.push(`<span class="error-text">${esc(rec.error)}</span>`);
        return `<tr class="unit-${state}">
          <td>${u.order}</td>
          <td>${esc(u.label)}<div class="small muted">${esc(u.document)} · l. ${u.startLine}-${u.endLine}${u.pages.length ? ` · ${u.pages.length} page(s)` : ''}</div></td>
          <td><span class="status-chip">${esc(U().STATES[state])}</span></td>
          <td class="small">${detail.join(' ')}</td>
        </tr>`;
      }).join('');
      const summary = cov.complete
        ? `Toutes les unités retenues sont lues (${cov.total}).`
        : `Lecture partielle : ${cov.fait}/${cov.total} unités lues (${pct} % du texte retenu)${cov.echec ? `, ${cov.echec} en échec` : ''}${cov.perime ? `, ${cov.perime} à relire après modification` : ''}.`;
      return `<section class="lecture-section" aria-labelledby="lectureCoverage">
        <h2 class="sub-label" id="lectureCoverage">Couverture</h2>
        <div class="coverage-bar" role="img" aria-label="${pct} % du texte lu"><span style="width:${pct}%"></span></div>
        <p class="small">${esc(summary)}</p>
        ${scan.notices.map(n => `<p class="small muted">${esc(n)}</p>`).join('')}
        <details${cov.complete ? '' : ' open'}><summary>Unités (${cov.total})</summary>
          <table class="lecture-table"><thead><tr><th>#</th><th>Unité</th><th>État</th><th>Détail</th></tr></thead><tbody>${rows}</tbody></table>
        </details>
      </section>`;
    }

    claimLine(c) {
      const src = c.source;
      return `<li class="synth-claim">
        <button class="btn-link" data-action="show-claim" data-id="${esc(c.id)}">${esc(C().describe(c))}</button>
        <span class="small muted">${esc(C().NATURES[c.nature])}${c.status !== 'accepté' ? ` · ${esc(c.status)}` : ''}${src ? ` · ${esc(src.unitLabel || '')}` : ''}</span>
      </li>`;
    }

    synthesisHtml(scan) {
      const s = U().consolidate(this.store, scan.units, this.app.projectData);
      const list = (items) => (items.length ? `<ul class="synth-list">${items.map(c => this.claimLine(c)).join('')}</ul>` : '');
      const central = s.central.map(p => `
        <div class="synth-person">
          <h4>${esc(p.name)} <span class="small muted">· ${p.inBible ? 'fiche dans la Bible' : 'pas de fiche'} · présent dans ${p.presence} unité(s)${p.otherNames.length ? ` · aussi « ${esc(p.otherNames.join(' », « '))} »` : ''}</span></h4>
          ${p.objectifs.length ? `<p class="sub-label">Ce qu'il ou elle veut</p>${list(p.objectifs)}` : '<p class="small muted">Objectif non établi par les unités lues.</p>'}
          ${p.interieur.length ? `<p class="sub-label">Peurs, valeurs, connaissances</p>${list(p.interieur)}` : ''}
          ${p.autres.length ? `<details><summary>${p.autres.length} autre(s) lecture(s)</summary>${list(p.autres)}</details>` : ''}
        </div>`).join('');
      const block = (title, items, empty) => `<h3 class="synth-title">${title}</h3>${items.length ? list(items) : `<p class="small muted">${empty}</p>`}`;
      const cov = s.coverage;
      return `<section class="lecture-section synthesis" aria-labelledby="lectureSynthesis">
        <h2 class="sub-label" id="lectureSynthesis">Voici ce que je comprends de ton histoire</h2>
        ${cov.partial ? `<div class="notice notice-warning" role="note">Compréhension partielle : ${cov.fait}/${cov.total} unités lues. Rien de ce qui suit ne vaut pour les passages non lus.</div>` : ''}
        <p class="small muted">Construit uniquement à partir des lectures sourcées ci-contre : une parole reste une parole, une interprétation reste à vérifier tant que tu ne l'as pas validée.</p>
        <h3 class="synth-title">Personnages centraux</h3>
        ${central || '<p class="small muted">Aucun personnage identifié pour l\'instant.</p>'}
        ${block('Oppositions et relations', s.oppositions, 'Aucune opposition étayée.')}
        ${block('Causes et révélations', s.causalite, 'Aucun lien de cause établi : une suite d\'événements ne prouve pas leur causalité.')}
        ${s.evenements.length ? `<details><summary>Fil des événements montrés (${s.evenements.length})</summary>${list(s.evenements)}</details>` : ''}
        <h3 class="synth-title">Zones non résolues</h3>
        ${s.unresolved.length ? `<ul class="synth-list">${s.unresolved.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : '<p class="small muted">Rien à signaler.</p>'}
        <h3 class="synth-title">Questions décisives</h3>
        ${s.questions.length ? `<ul class="synth-list">${s.questions.slice(0, 12).map(q => `<li>${q.claimId ? `<button class="btn-link" data-action="show-claim" data-id="${esc(q.claimId)}">${esc(q.text)}</button>` : esc(q.text)}</li>`).join('')}</ul>` : '<p class="small muted">Aucune pour l\'instant.</p>'}
      </section>`;
    }

    claimCard(c) {
      const src = c.source;
      const actions = c.status === 'à vérifier'
        ? `<button class="btn-link" data-action="accept" data-id="${esc(c.id)}">Valider</button>
           <button class="btn-link" data-action="reject" data-id="${esc(c.id)}">Rejeter</button>
           <button class="btn-link" data-action="correct" data-id="${esc(c.id)}">Corriger</button>`
        : c.status === 'obsolète' ? ''
        : `<button class="btn-link" data-action="reopen" data-id="${esc(c.id)}">Remettre à vérifier</button>
           ${c.status === 'accepté' ? `<button class="btn-link" data-action="correct" data-id="${esc(c.id)}">Corriger</button>` : ''}`;
      const natures = Object.entries(C().NATURES).filter(([k]) => k !== 'proposition')
        .map(([k, label]) => `<option value="${k}"${k === c.nature ? ' selected' : ''}>${esc(label)}</option>`).join('');
      const editing = this.editingId === c.id ? `
        <div class="claim-correct" data-correct-form="${esc(c.id)}">
          <label class="visually-hidden" for="fix-${esc(c.id)}">Lecture corrigée</label>
          <textarea id="fix-${esc(c.id)}" rows="3">${esc(c.content)}</textarea>
          <label class="small">Nature <select class="select-compact">${natures}</select></label>
          <div class="form-actions">
            <button class="btn-primary" data-action="correct-save" data-id="${esc(c.id)}">Enregistrer ma correction</button>
            <button class="btn-secondary" data-action="correct-cancel">Annuler</button>
          </div>
        </div>` : '';
      return `<li class="claim-card" data-claim="${esc(c.id)}">
        <div class="claim-head small">
          <span>${esc(C().SUBJECT_KINDS[c.subject.kind] || '')} · ${esc(c.subject.name)}${c.object ? ` → ${esc(c.object.name)}` : ''}</span>
          <span class="muted">${esc(C().NATURES[c.nature])} · ${esc(C().ASPECTS[c.aspect] || '')}</span>
        </div>
        <p class="claim-content">${esc(C().describe(c))}</p>
        ${src ? `<blockquote class="claim-quote">« ${esc(src.quote)} »
          <button class="btn-link small" data-action="open-source" data-doc="${esc(src.document)}" data-line="${src.lines[0]}">${esc(src.document)} · ${esc(src.unitLabel || '')} · l. ${src.lines[0]}${src.lines[1] !== src.lines[0] ? `-${src.lines[1]}` : ''}${src.role && src.role !== 'autorite' ? ` (${esc(U().ROLES[src.role])})` : ''}</button></blockquote>` : ''}
        ${c.justification ? `<p class="small"><span class="muted">Pourquoi :</span> ${esc(c.justification)}</p>` : ''}
        ${c.alternative ? `<p class="small"><span class="muted">Autre lecture :</span> ${esc(c.alternative)}</p>` : ''}
        <div class="prov-line"><span class="prov-state">${esc(window.Provenance.ORIGIN_LABELS[c.origin] || c.origin)} · ${esc(c.status)}</span>
          ${c.sourceChanged ? `<span class="error-text">${esc(c.sourceChanged)} : à revoir</span>` : ''}
          ${c.obsoleteReason ? `<span>${esc(c.obsoleteReason)}</span>` : ''}
          ${actions}</div>
        ${editing}
      </li>`;
    }

    renderClaims() {
      const aside = this.root.querySelector('#lectureClaims');
      if (!aside) return;
      const claims = this.store.claims;
      const counts = {};
      claims.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
      const shown = claims.filter(c => c.status === this.filter)
        .sort((a, b) => (a.period?.order ?? 0) - (b.period?.order ?? 0) || (a.source?.lines?.[0] ?? 0) - (b.source?.lines?.[0] ?? 0));
      const tabs = Object.entries(FILTERS).map(([k, label]) =>
        `<button class="bible-tab${k === this.filter ? ' active' : ''}" data-action="filter" data-filter="${esc(k)}" aria-pressed="${k === this.filter}">${label}<span class="tab-count">${counts[k] || 0}</span></button>`).join('');
      aside.innerHTML = `
        <h2 class="sheet-title">Lectures</h2>
        <p class="small muted">Chaque lecture cite le texte. Une citation exacte ne garantit pas que la lecture soit juste : valide, rejette ou corrige. Une lecture rejetée ne reviendra pas.</p>
        <div class="bible-tabs lecture-filters">${tabs}</div>
        ${shown.length ? `<ul class="claim-list">${shown.map(c => this.claimCard(c)).join('')}</ul>` : '<p class="small muted">Aucune lecture dans cette catégorie.</p>'}`;
    }
  }

  window.UnderstandingView = UnderstandingView;
})();
