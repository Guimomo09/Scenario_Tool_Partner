// === Espace Bible : fiches de référence ===
// Index des fiches à gauche, fiche composée à droite, formulaire pour l'ajout et la modification.
// Toute modification passe par Bible (champs décrits seulement) puis app.mutateProject.
// Les champs venant des extractions restent visibles en lecture seule, échappés.

(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size) => window.Icons.svg(name, { size });
  const KIND_ICONS = { characters: 'person', places: 'place', systems: 'system', timeline: 'clock', refs: 'book' };

  // Libellés des champs produits par les extractions (sinon le nom brut du champ)
  const FIELD_LABELS = {
    dialogueCount: 'Répliques', thoughtCount: 'Pensées', firstAppearance: 'Première apparition',
    relationships: 'Relations', keyQuotes: 'Citations', type: 'Type', details: 'Détails', category: 'Catégorie',
    evidence: 'Indice', implication: 'Implication', leader: 'Dirigeant', hierarchy: 'Hiérarchie',
    propaganda: 'Propagande', control: 'Contrôle', scarce: 'Ressources rares', groups: 'Groupes',
    dynamics: 'Dynamiques', implications: 'Implications', character: 'Personnage', text: 'Texte', page: 'Page',
    title: 'Titre', description: 'Description', name: 'Nom', source: 'Source', pages: 'Pages',
    events: 'Événements', significance: 'Portée', mentions: 'Mentions', url: 'Adresse'
  };

  // Rendu générique et échappé d'une valeur quelconque (chaîne, liste, objet)
  function renderValue(value, depth = 0) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value !== 'object') return esc(value);
    if (depth > 3) return esc(JSON.stringify(value));
    if (Array.isArray(value)) {
      return `<ul class="value-list">${value.map(v => `<li>${renderValue(v, depth + 1)}</li>`).join('')}</ul>`;
    }
    const entries = Object.entries(value).filter(([, v]) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && !v.length));
    return `<dl class="value-dl">${entries.map(([k, v]) => `<dt>${esc(FIELD_LABELS[k] || k)}</dt><dd>${renderValue(v, depth + 1)}</dd>`).join('')}</dl>`;
  }

  class BibleView {
    constructor(app) {
      this.app = app;
      this.root = document.getElementById('workspaceBible');
      this.kind = 'characters';
      this.selectedId = null;
      this.query = '';
      this.mode = 'view'; // view, edit, add
      // Fiches cochées (onglet courant) pour une suppression groupée
      this.checked = new Set();
      this.lastCheckedId = null;
      this.formError = null;
      this.root.addEventListener('click', (e) => this.onClick(e));
      this.root.addEventListener('input', (e) => {
        if (e.target.id === 'bibleSearch') {
          this.query = e.target.value;
          this.renderIndex();
        }
      });
      this.root.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitForm(e.target);
      });
      this.root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.mode !== 'view' && e.target.closest('.bible-form')) {
          e.preventDefault();
          this.cancelForm();
        }
      });
    }

    get data() { return this.app.projectData; }
    get spec() { return window.Bible.KINDS[this.kind]; }
    get entries() { return Array.isArray(this.data[this.kind]) ? this.data[this.kind] : []; }
    get selected() { return this.entries.find(e => e && e.id === this.selectedId) || null; }
    get hasAnalysis() { return !!(this.data.worldContext || (this.data.narrativeClues || []).length); }

    // Ouvre une fiche donnée (depuis la Structure, par exemple)
    show(kind, id) {
      this.kind = kind;
      this.selectedId = id;
      this.mode = 'view';
      this.render();
    }

    render() {
      if (this.app.workspace !== 'bible') return;
      if (!this.app.currentProject) {
        this.root.innerHTML = '<div class="view-empty"><h2>Bible</h2><p>Choisissez un projet pour voir ses fiches.</p></div>';
        return;
      }
      if (this.kind !== 'analysis' && this.selectedId && !this.selected) this.selectedId = null;
      const readOnly = this.app.readOnlyReason();
      const tabs = Object.entries(window.Bible.KINDS).map(([k, s]) => {
        const count = (this.data[k] || []).length;
        const active = k === this.kind;
        return `<button class="bible-tab${active ? ' active' : ''}" role="tab" aria-selected="${active}" data-kind="${k}">${icon(KIND_ICONS[k], 14)}${s.label}<span class="tab-count">${count}</span></button>`;
      });
      if (this.hasAnalysis) {
        tabs.push(`<button class="bible-tab${this.kind === 'analysis' ? ' active' : ''}" role="tab" aria-selected="${this.kind === 'analysis'}" data-kind="analysis">${icon('analyse', 14)}Analyse automatique</button>`);
      }
      this.root.innerHTML = `
        <div class="view-layout bible-layout">
          <div class="view-main">
            <header class="view-header">
              <div>
                <h1 class="view-title">Bible</h1>
                <p class="view-sub">Fiches de référence du projet</p>
              </div>
              ${this.kind !== 'analysis' ? `<div class="view-actions">
                <button class="btn-primary" data-action="add"${readOnly ? ' disabled' : ''}>${icon('plus')}Ajouter un ${esc(this.spec.singular)}</button>
                <span id="bibleDeleteSlot"></span>
              </div>` : ''}
            </header>
            <div class="bible-tabs" role="tablist" aria-label="Types de fiches">${tabs.join('')}</div>
            ${readOnly ? `<div class="notice notice-warning" role="note"><span>${esc(readOnly)}</span>${this.app.pendingMigration ? '<button class="btn-link" data-action="migrate">Examiner la mise à jour du format</button>' : ''}</div>` : ''}
            ${this.kind === 'analysis' ? '' : `<div class="bible-search">
              <span class="search-icon">${icon('search', 14)}</span>
              <label class="visually-hidden" for="bibleSearch">Rechercher dans les fiches</label>
              <input id="bibleSearch" type="search" placeholder="Rechercher…" value="${esc(this.query)}">
            </div>
            <div class="batch-bar" id="bibleBatchBar"></div>
            <ul class="bible-index" id="bibleIndex" aria-label="${esc(this.spec.label)}"></ul>`}
          </div>
          <article class="view-detail bible-sheet" id="bibleSheet" aria-live="polite"></article>
        </div>`;
      if (this.kind === 'analysis') {
        this.root.querySelector('.bible-layout').classList.add('single');
        this.root.querySelector('#bibleSheet').innerHTML = this.renderAnalysisHtml();
        return;
      }
      this.renderIndex();
      this.renderSheet();
    }

    renderIndex() {
      const list = this.root.querySelector('#bibleIndex');
      if (!list) return;
      const B = window.Bible;
      const items = B.search(this.data, this.kind, this.query);
      const loose = this.entries.filter(e => !e || typeof e !== 'object');
      const existing = new Set(this.entries.filter(e => e && typeof e === 'object').map(e => e.id));
      [...this.checked].forEach(id => { if (!existing.has(id)) this.checked.delete(id); });
      this.visibleIds = items.map(e => e.id);
      this.renderBatchUi();
      if (!items.length && !loose.length) {
        list.innerHTML = `<li class="nav-empty">${this.query ? 'Aucune fiche ne correspond.' : `Aucun ${esc(this.spec.singular)} pour l'instant.`}</li>`;
        return;
      }
      list.innerHTML = items.map(e => {
        const active = e.id === this.selectedId;
        const sub = this.kind === 'characters' ? (e.role || (e.suggestedRole ? `${e.suggestedRole} ?` : '')) : (e.type || e.category || e.source || '');
        const checked = this.checked.has(e.id);
        return `<li class="index-row${checked ? ' checked' : ''}"><input type="checkbox" class="row-check" data-check="${esc(e.id)}" aria-label="Cocher « ${esc(B.titleOf(this.kind, e))} »"${checked ? ' checked' : ''}${this.app.readOnlyReason() ? ' disabled' : ''}><button class="bible-index-item${active ? ' active' : ''}" data-id="${esc(e.id)}"${active ? ' aria-current="true"' : ''}>
          <span class="index-title">${esc(B.titleOf(this.kind, e)) || '<span class="muted">Sans nom</span>'}</span>
          ${sub ? `<span class="index-sub">${esc(sub)}</span>` : ''}
        </button></li>`;
      }).join('') + loose.map(v => `<li class="index-loose" title="Entrée non structurée, conservée telle quelle">${esc(v)}</li>`).join('');
    }

    // Case « Tout sélectionner » et bouton Supprimer (fiches cochées, sinon la fiche ouverte)
    renderBatchUi() {
      const bar = this.root.querySelector('#bibleBatchBar');
      const slot = this.root.querySelector('#bibleDeleteSlot');
      const readOnly = !!this.app.readOnlyReason();
      const n = this.checked.size;
      const visible = this.visibleIds || [];
      if (bar) {
        const all = visible.length > 0 && visible.every(id => this.checked.has(id));
        bar.innerHTML = visible.length
          ? `<label class="check"><input type="checkbox" id="bibleCheckAll"${all ? ' checked' : ''}${readOnly ? ' disabled' : ''}> Tout sélectionner${this.query ? ' (résultats affichés)' : ''}</label>
             ${n ? `<span class="muted">${n} cochée${n > 1 ? 's' : ''}</span> <button class="btn-link" data-action="uncheck-all">Tout décocher</button>` : ''}`
          : '';
      }
      if (slot) {
        const disabled = readOnly || (!n && !this.selected);
        slot.innerHTML = `<button class="btn-secondary btn-danger" data-action="delete-checked"${disabled ? ' disabled' : ''} title="${n ? `Supprimer les ${n} fiche(s) cochée(s)` : 'Supprimer la fiche ouverte'} (Ctrl+Z pour annuler)">${icon('trash', 14)}${n ? `Supprimer (${n})` : 'Supprimer'}</button>`;
      }
    }

    toggleCheck(id, on, range) {
      const visible = this.visibleIds || [];
      let ids = [id];
      if (range && this.lastCheckedId && visible.includes(this.lastCheckedId)) {
        const [a, b] = [visible.indexOf(this.lastCheckedId), visible.indexOf(id)].sort((x, y) => x - y);
        ids = visible.slice(a, b + 1);
      }
      ids.forEach(x => (on ? this.checked.add(x) : this.checked.delete(x)));
      this.lastCheckedId = id;
      this.renderIndex();
      this.root.querySelector(`.row-check[data-check="${CSS.escape(id)}"]`)?.focus();
    }

    async deleteMany(ids) {
      const B = window.Bible;
      const entries = this.entries.filter(e => e && typeof e === 'object' && ids.includes(e.id));
      if (!entries.length) return;
      const linked = this.kind === 'characters'
        ? entries.reduce((n, e) => n + window.Structure.scenesForCharacter(this.data, e.id).length, 0) : 0;
      const list = entries.slice(0, 12).map(e => `• ${B.titleOf(this.kind, e) || 'Sans nom'}`).join('\n');
      const { confirmed } = await this.app.showConfirmDialog({
        title: `Supprimer ${entries.length} fiche${entries.length > 1 ? 's' : ''}`,
        message: `${list}${entries.length > 12 ? `\n… et ${entries.length - 12} autre(s)` : ''}\n\nLes documents ne sont pas modifiés. Ctrl+Z (hors d'un champ) annule la suppression.` +
          (linked ? `\n\nDes scènes citent ces fiches : leurs liens restent, signalés comme « fiche supprimée ».` : ''),
        confirmLabel: 'Supprimer', cancelLabel: 'Garder'
      });
      if (!confirmed) return;
      const kind = this.kind;
      const n = entries.length;
      if (await this.app.mutateProject(d => B.removeEntries(d, kind, ids).data, { label: `suppression de ${n} fiche${n > 1 ? 's' : ''}` })) {
        this.checked.clear();
        if (ids.includes(this.selectedId)) this.selectedId = null;
        this.mode = 'view';
        this.render();
      }
    }

    renderSheet() {
      const sheet = this.root.querySelector('#bibleSheet');
      if (!sheet) return;
      if (this.mode === 'add') { sheet.innerHTML = this.renderFormHtml(null); this.focusForm(); return; }
      const entry = this.selected;
      if (!entry) {
        sheet.innerHTML = `<div class="view-empty-inline"><p>Choisissez une fiche dans la liste${this.app.readOnlyReason() ? '' : `, ou ajoutez un ${esc(this.spec.singular)}`}.</p></div>`;
        return;
      }
      if (this.mode === 'edit') { sheet.innerHTML = this.renderFormHtml(entry); this.focusForm(); return; }
      sheet.innerHTML = this.renderEntryHtml(entry);
    }

    focusForm() {
      this.root.querySelector('.bible-form input, .bible-form textarea')?.focus();
    }

    renderEntryHtml(entry) {
      const B = window.Bible;
      const readOnly = this.app.readOnlyReason();
      const fields = this.spec.fields.filter(f => f.key !== this.spec.key && !(this.kind === 'timeline' && f.key === 'period'));
      const body = fields.map(f => {
        const value = entry[f.key];
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return '';
        if (f.type === 'list') return `<section class="sheet-field"><h3>${esc(f.label)}</h3>${renderValue(Array.isArray(value) ? value : [value])}</section>`;
        if (f.key === 'role') return '';
        return `<section class="sheet-field"><h3>${esc(f.label)}</h3><p class="sheet-prose">${esc(value)}</p></section>`;
      }).join('');
      const extra = B.extraFields(this.kind, entry);
      const scenes = this.kind === 'characters' ? window.Structure.scenesForCharacter(this.data, entry.id) : [];
      const allScenes = this.data.scenes || [];
      const role = entry.role
        ? `<p class="sheet-role">${esc(entry.role)}</p>`
        : entry.suggestedRole
          ? `<p class="sheet-role suggestion">Rôle suggéré : ${esc(entry.suggestedRole)} <span class="muted">(${esc(entry.suggestionSource || 'extraction')}, à confirmer)</span>
              <button class="btn-link" data-action="confirm-role"${readOnly ? ' disabled' : ''}>Confirmer ce rôle</button></p>`
          : '';
      return `
        <header class="sheet-head">
          <span class="sheet-kind">${icon(KIND_ICONS[this.kind], 14)}${esc(this.spec.singular)}${entry.origin === 'auteur' ? ' · saisi à la main' : ''}</span>
          <h2 class="sheet-title">${esc(this.kind === 'timeline' ? entry.event : B.titleOf(this.kind, entry))}</h2>
          ${this.kind === 'timeline' && entry.period ? `<p class="sheet-role">${esc(entry.period)}</p>` : ''}
          ${role}
          <div class="sheet-actions">
            <button class="btn-secondary" data-action="edit"${readOnly ? ' disabled' : ''}>${icon('edit', 14)}Modifier</button>
            <button class="btn-link danger" data-action="delete"${readOnly ? ' disabled' : ''}>${icon('trash', 14)}Supprimer</button>
          </div>
        </header>
        ${body || '<p class="muted">Fiche vide pour l\'instant : « Modifier » pour la compléter.</p>'}
        ${scenes.length ? `<section class="sheet-field"><h3>Scènes</h3><ul class="sheet-scenes">${scenes.map(s => `<li><button class="btn-link" data-action="open-scene" data-scene="${esc(s.id)}"><span class="scene-num">${String(allScenes.indexOf(s) + 1).padStart(2, '0')}</span> ${esc(s.title || 'Sans titre')}</button></li>`).join('')}</ul></section>` : ''}
        ${extra.length ? `<section class="sheet-extra">
          <h3>Informations extraites <span class="muted">(analyse ou import, lecture seule)</span></h3>
          ${renderValue(Object.fromEntries(extra))}
        </section>` : ''}`;
    }

    renderFormHtml(entry) {
      const B = window.Bible;
      const isNew = !entry;
      return `<form class="bible-form" novalidate>
        <h2 class="sheet-title">${isNew ? `Nouveau ${esc(this.spec.singular)}` : esc(B.titleOf(this.kind, entry))}</h2>
        ${this.formError ? `<div class="notice notice-error" role="alert"><span>${esc(this.formError.message)}</span>${this.formError.duplicateId ? `<button type="button" class="btn-link" data-action="open-duplicate" data-id="${esc(this.formError.duplicateId)}">Ouvrir la fiche existante</button>` : ''}</div>` : ''}
        ${this.spec.fields.map(f => {
          const value = entry ? entry[f.key] : '';
          const id = `bf-${f.key}`;
          if (entry && !B.isEditable(f, value)) {
            return `<div class="field"><span class="field-label">${esc(f.label)}</span><p class="muted small">Contient des données structurées issues d'une extraction : affichées en lecture seule dans la fiche.</p></div>`;
          }
          const text = B.formatValue(f, value);
          const req = f.required ? ' required aria-required="true"' : '';
          const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}${f.type === 'list' ? ' <span class="muted small">(une par ligne)</span>' : ''}</label>`;
          if (f.type === 'text') return `<div class="field">${label}<input id="${id}" name="${f.key}" value="${esc(text)}"${req}></div>`;
          return `<div class="field">${label}<textarea id="${id}" name="${f.key}" rows="${f.type === 'list' ? 3 : 4}"${req}>${esc(text)}</textarea></div>`;
        }).join('')}
        <div class="form-actions">
          <button type="button" class="btn-secondary" data-action="cancel">Annuler</button>
          <button type="submit" class="btn-primary">${isNew ? 'Créer la fiche' : 'Enregistrer la fiche'}</button>
        </div>
      </form>`;
    }

    renderAnalysisHtml() {
      const wc = this.data.worldContext;
      const clues = this.data.narrativeClues || [];
      return `<header class="sheet-head">
          <span class="sheet-kind">${icon('analyse', 14)}dérivé des notes</span>
          <h2 class="sheet-title">Analyse automatique</h2>
          <p class="muted">Produite par « Analyser les notes » à partir d'indices du texte. Ce sont des hypothèses, pas du canon : rien ici n'est ajouté aux fiches sans votre décision.</p>
        </header>
        ${wc ? `<section class="sheet-field"><h3>Contexte du monde</h3>${renderValue(wc)}</section>` : ''}
        ${clues.length ? `<section class="sheet-field"><h3>Indices narratifs</h3>${renderValue(clues)}</section>` : ''}`;
    }

    // --- Actions ---

    async onClick(e) {
      const tab = e.target.closest('[data-kind]');
      if (tab) {
        this.kind = tab.dataset.kind;
        this.selectedId = null;
        this.checked.clear();
        this.mode = 'view';
        this.formError = null;
        this.query = '';
        this.render();
        this.root.querySelector('.bible-tab.active')?.focus();
        return;
      }
      const box = e.target.closest('.row-check');
      if (box) {
        this.toggleCheck(box.dataset.check, box.checked, e.shiftKey);
        return;
      }
      if (e.target.id === 'bibleCheckAll') {
        (this.visibleIds || []).forEach(id => (e.target.checked ? this.checked.add(id) : this.checked.delete(id)));
        this.renderIndex();
        this.root.querySelector('#bibleCheckAll')?.focus();
        return;
      }
      const item = e.target.closest('.bible-index-item');
      if (item) {
        if (this.mode !== 'view' && !(await this.confirmDiscard())) return;
        this.selectedId = item.dataset.id;
        this.mode = 'view';
        this.formError = null;
        this.renderIndex();
        this.renderSheet();
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const B = window.Bible;
      switch (btn.dataset.action) {
        case 'add':
          this.mode = 'add'; this.formError = null; this.renderSheet(); return;
        case 'edit':
          this.mode = 'edit'; this.formError = null; this.renderSheet(); return;
        case 'cancel':
          return this.cancelForm();
        case 'open-duplicate':
          this.selectedId = btn.dataset.id; this.mode = 'view'; this.formError = null; this.query = '';
          this.render(); return;
        case 'confirm-role': {
          const id = this.selectedId;
          if (await this.app.mutateProject(d => B.confirmSuggestedRole(d, id).data, { label: 'confirmation du rôle' })) { this.renderIndex(); this.renderSheet(); }
          return;
        }
        case 'delete': return this.deleteSelected();
        case 'delete-checked':
          return this.checked.size ? this.deleteMany([...this.checked]) : this.deleteSelected();
        case 'uncheck-all':
          this.checked.clear(); this.renderIndex(); return;
        case 'open-scene': return this.app.goToScene(btn.dataset.scene, { workspace: 'structure' });
        case 'migrate': return this.app.offerMigration().then(() => this.render());
      }
    }

    async confirmDiscard() {
      const { confirmed } = await this.app.showConfirmDialog({
        title: 'Abandonner la saisie ?', message: 'Les modifications de cette fiche ne sont pas enregistrées.',
        confirmLabel: 'Abandonner', cancelLabel: 'Continuer la saisie'
      });
      return confirmed;
    }

    cancelForm() {
      this.mode = 'view';
      this.formError = null;
      this.renderSheet();
    }

    async submitForm(form) {
      const B = window.Bible;
      const fields = {};
      this.spec.fields.forEach(f => { if (form.elements[f.key]) fields[f.key] = form.elements[f.key].value; });
      const kind = this.kind;
      let result = null;
      const ok = await this.app.mutateProject(d => {
        result = this.mode === 'add' ? B.addEntry(d, kind, fields) : B.updateEntry(d, kind, this.selectedId, fields);
        return result.error ? null : result.data;
      }, { label: this.mode === 'add' ? `ajout de ${this.spec.singular}` : 'modification de fiche' });
      if (result?.error) {
        this.formError = { message: result.error, duplicateId: result.duplicate?.id || null };
        const sheet = this.root.querySelector('#bibleSheet');
        // Conserver la saisie : on réaffiche le formulaire avec les valeurs tapées
        sheet.innerHTML = this.renderFormHtml(this.mode === 'add' ? null : { ...this.selected });
        Object.entries(fields).forEach(([k, v]) => { const el = sheet.querySelector(`[name="${k}"]`); if (el) el.value = v; });
        sheet.querySelector('[role="alert"]')?.focus?.();
        return;
      }
      if (!ok) return;
      this.selectedId = result.entry.id;
      this.mode = 'view';
      this.formError = null;
      this.render();
    }

    async deleteSelected() {
      const entry = this.selected;
      if (!entry) return;
      const B = window.Bible;
      const linked = this.kind === 'characters' ? window.Structure.scenesForCharacter(this.data, entry.id).length : 0;
      const { confirmed } = await this.app.showConfirmDialog({
        title: `Supprimer « ${B.titleOf(this.kind, entry)} »`,
        message: `La fiche sera retirée de la Bible (Ctrl+Z pour annuler). Les documents ne sont pas modifiés.` +
          (linked ? `\n\n${linked} scène(s) la citent : leurs liens restent, signalés comme « fiche supprimée ».` : '') +
          '',
        confirmLabel: 'Supprimer', cancelLabel: 'Garder'
      });
      if (!confirmed) return;
      const kind = this.kind;
      if (await this.app.mutateProject(d => B.removeEntry(d, kind, entry.id).data, { label: 'suppression de fiche' })) {
        this.selectedId = null;
        this.render();
      }
    }
  }

  window.BibleView = BibleView;
})();
