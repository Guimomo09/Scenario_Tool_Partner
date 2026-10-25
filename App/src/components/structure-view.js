// === Espace Structure : conducteur des scènes ===
// Liste ordonnée et numérotée des scènes, fiche de la scène choisie à droite.
// Les modifications passent par Structure (copies, identifiants stables) puis app.mutateProject,
// qui refuse toute écriture si le projet est illisible ou attend sa migration.

(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size) => window.Icons.svg(name, { size });
  const num = (i) => String(i + 1).padStart(2, '0');

  // Champs de texte de la fiche de scène, dans l'ordre d'affichage
  const TEXT_FIELDS = [
    { key: 'summary', label: 'Résumé', rows: 3, hint: 'Ce qui se passe, en quelques lignes.' },
    { key: 'goal', label: 'Objectif dramatique', rows: 2, hint: 'Ce que veut le personnage principal de la scène.' },
    { key: 'conflict', label: 'Conflit', rows: 2, hint: 'Ce qui s\'y oppose.' },
    { key: 'change', label: 'Changement produit', rows: 2, hint: 'Ce qui n\'est plus pareil à la fin.' },
    { key: 'notes', label: 'Notes', rows: 3, hint: '' }
  ];

  class StructureView {
    constructor(app) {
      this.app = app;
      this.root = document.getElementById('workspaceStructure');
      this.selectedId = null;
      this.filter = '';
      this.dragId = null;
      this.headingCache = new Map();
      this.root.addEventListener('click', (e) => this.onClick(e));
      this.root.addEventListener('input', (e) => this.onInput(e));
      this.root.addEventListener('change', (e) => this.onChange(e));
      this.root.addEventListener('keydown', (e) => this.onKeydown(e));
      this.setupDrag();
      document.getElementById('sceneNavList').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-scene]');
        if (btn) this.app.goToScene(btn.dataset.scene);
      });
    }

    get data() { return this.app.projectData; }
    get scenes() { return Array.isArray(this.data.scenes) ? this.data.scenes : []; }
    get selected() { return this.scenes.find(s => s.id === this.selectedId) || null; }
    get isManga() { return (this.data.script || []).some(p => p && p.sequence !== undefined && p.sequence !== null); }

    select(id, { focusTitle = false } = {}) {
      this.selectedId = id;
      this.render();
      this.app.partner.refreshContext();
      if (focusTitle) this.root.querySelector('[data-field="title"]')?.focus();
      else this.root.querySelector(`.scene-row[data-id="${CSS.escape(id)}"]`)?.focus();
    }

    // --- Rendu ---

    render() {
      this.renderNav();
      if (this.app.workspace !== 'structure') return;
      if (!this.app.currentProject) {
        this.root.innerHTML = '<div class="view-empty"><h2>Structure</h2><p>Choisissez un projet pour voir ses scènes.</p></div>';
        return;
      }
      if (this.selectedId && !this.selected) this.selectedId = null;
      if (!this.selectedId && this.scenes.length) this.selectedId = this.scenes[0].id;
      const readOnly = this.app.readOnlyReason();
      const headings = this.app.currentDoc ? window.Structure.proposeScenesFromHeadings(this.data, this.app.currentDoc.name, this.app.editor.value) : [];
      const fromSequences = this.isManga ? window.Structure.proposeScenesFromSequences(this.data) : [];

      this.root.innerHTML = `
        <div class="view-layout structure-layout">
          <div class="view-main">
            <header class="view-header">
              <div>
                <h1 class="view-title">Structure</h1>
                <p class="view-sub">${this.scenes.length} scène${this.scenes.length > 1 ? 's' : ''} · conducteur narratif</p>
              </div>
              <div class="view-actions">
                <label class="visually-hidden" for="sceneFilter">Filtrer par statut</label>
                <select id="sceneFilter" class="select-compact">
                  <option value="">Tous les statuts</option>
                  ${window.Structure.STATUSES.map(s => `<option value="${s.id}"${this.filter === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}
                </select>
                ${fromSequences.length ? `<button class="btn-secondary" data-action="from-sequences"${readOnly ? ' disabled' : ''} title="Une scène par séquence du script, pages et personnages rattachés">Créer depuis les séquences (${fromSequences.length})</button>` : ''}
                ${headings.length ? `<button class="btn-secondary" data-action="from-headings"${readOnly ? ' disabled' : ''} title="Une scène par titre de section de « ${esc(this.app.currentDoc.name)} »">Créer depuis les titres (${headings.length})</button>` : ''}
                <button class="btn-primary" data-action="add"${readOnly ? ' disabled' : ''}>${icon('plus')}Ajouter une scène</button>
              </div>
            </header>
            ${readOnly ? this.readOnlyBanner(readOnly) : ''}
            ${this.renderConductorHtml()}
          </div>
          <aside class="view-detail scene-editor" aria-label="Fiche de la scène">
            ${this.renderEditorHtml(readOnly)}
          </aside>
        </div>`;
      this.fillHeadings();
    }

    readOnlyBanner(reason) {
      return `<div class="notice notice-warning" role="note">
        <span>${esc(reason)}</span>
        ${this.app.pendingMigration ? '<button class="btn-link" data-action="migrate">Examiner la mise à jour du format</button>' : ''}
      </div>`;
    }

    renderConductorHtml() {
      if (!this.scenes.length) {
        return `<div class="view-empty-inline">
          <p>Aucune scène pour l'instant. Une scène peut rester vide : un titre suffit pour commencer, et l'écriture n'attend pas la structure.</p>
          <p class="muted">Depuis Écrire, « Créer une scène ici » lie une scène à la section où se trouve le curseur.</p>
        </div>`;
      }
      const rows = this.scenes.map((scene, index) => ({ scene, index }))
        .filter(({ scene }) => !this.filter || (scene.status || 'idea') === this.filter);
      if (!rows.length) return '<p class="view-empty-inline">Aucune scène avec ce statut.</p>';
      return `<ol class="conductor" aria-label="Scènes dans l'ordre du récit">
        ${rows.map(({ scene, index }) => this.renderRowHtml(scene, index)).join('')}
      </ol>
      <p class="conductor-hint muted">Réordonner : glisser une scène, ou Alt+↑ / Alt+↓ sur la scène sélectionnée.</p>`;
    }

    renderRowHtml(scene, index) {
      const S = window.Structure;
      const active = scene.id === this.selectedId;
      const chars = S.charactersOf(this.data, scene);
      const meta = [];
      if (chars.length) {
        meta.push(`${icon('person', 13)}${chars.map(c => c.missing ? '<span class="missing">fiche supprimée</span>' : esc(c.name)).join(', ')}`);
      }
      const { pages, missing } = S.pagesOfScene(this.data, scene);
      if (pages.length || missing.length) meta.push(`${icon('document', 13)}${esc(this.pagesLabel(pages))}${missing.length ? ' <span class="missing">pages introuvables</span>' : ''}`);
      if (scene.doc) meta.push(`${icon('link', 13)}${esc(scene.doc.replace(/\.md$/i, ''))}${scene.heading ? ` › ${esc(scene.heading)}` : ''}`);
      const status = scene.status || 'idea';
      return `<li class="scene-row${active ? ' active' : ''}" data-id="${esc(scene.id)}" tabindex="0" draggable="true" aria-current="${active}">
        <span class="scene-num" aria-hidden="true">${num(index)}</span>
        <div class="scene-main">
          <div class="scene-line">
            <h3 class="scene-title">${scene.title ? esc(scene.title) : '<span class="muted">Sans titre</span>'}</h3>
            <span class="status-chip status-${esc(status)}">${esc(S.statusLabel(status))}</span>
          </div>
          ${scene.summary ? `<p class="scene-summary">${esc(scene.summary)}</p>` : ''}
          ${meta.length ? `<div class="scene-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
        </div>
        <div class="scene-move">
          <button class="btn-icon" data-action="up" data-id="${esc(scene.id)}" aria-label="Monter la scène ${num(index)}"${index === 0 ? ' disabled' : ''}>${icon('up')}</button>
          <button class="btn-icon" data-action="down" data-id="${esc(scene.id)}" aria-label="Descendre la scène ${num(index)}"${index === this.scenes.length - 1 ? ' disabled' : ''}>${icon('down')}</button>
        </div>
      </li>`;
    }

    pagesLabel(pages) {
      if (!pages.length) return '';
      const numbers = pages.flatMap(p => (p.endNumber ? [Number(p.page), Number(p.endNumber)] : [Number(p.page)]));
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      const spreads = window.Structure.groupSpreads(pages).filter(u => u.spread).length;
      return `${min === max ? `p. ${min}` : `p. ${min}–${max}`}${spreads ? ` · ${spreads} double${spreads > 1 ? 's' : ''} page${spreads > 1 ? 's' : ''}` : ''}`;
    }

    renderEditorHtml(readOnly) {
      const scene = this.selected;
      if (!scene) return '<div class="view-empty-inline"><p>Sélectionnez une scène pour la décrire.</p></div>';
      const S = window.Structure;
      const index = this.scenes.indexOf(scene);
      const dis = readOnly ? ' disabled' : '';
      const docs = this.app.documents || [];
      const characters = (this.data.characters || []).filter(c => c && typeof c === 'object' && c.id);
      const linked = new Set((scene.characters || []).map(String));
      const missingChars = S.charactersOf(this.data, scene).filter(c => c.missing);
      const canWrite = scene.doc && docs.some(d => d.name === scene.doc);

      return `
        <div class="detail-head">
          <span class="scene-num large" aria-hidden="true">${num(index)}</span>
          <label class="visually-hidden" for="sceneTitle">Titre de la scène</label>
          <input id="sceneTitle" class="detail-title-input" data-field="title" value="${esc(scene.title)}" placeholder="Titre de la scène"${dis}>
        </div>
        <div class="detail-actions">
          <button class="btn-primary" data-action="write"${canWrite ? '' : ' disabled title="Liez d\'abord un document à la scène"'}>${icon('pen')}Écrire cette scène</button>
          <button class="btn-secondary" data-action="ask" title="Ouvre le partenaire avec l'intention Structurer ; la fiche de la scène fait partie du contexte">Demander au partenaire</button>
        </div>
        <div class="field">
          <label for="sceneStatus">Statut</label>
          <select id="sceneStatus" data-field="status"${dis}>
            ${S.STATUSES.map(s => `<option value="${s.id}"${(scene.status || 'idea') === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>
        ${TEXT_FIELDS.map(f => `
          <div class="field">
            <label for="scene-${f.key}">${f.label}</label>
            <textarea id="scene-${f.key}" data-field="${f.key}" rows="${f.rows}" placeholder="${esc(f.hint)}"${dis}>${esc(scene[f.key] || '')}</textarea>
          </div>`).join('')}
        <fieldset class="field">
          <legend>Personnages</legend>
          ${characters.length ? `<div class="check-list">
            ${characters.map(c => `<label class="check"><input type="checkbox" data-character="${esc(c.id)}"${linked.has(String(c.id)) ? ' checked' : ''}${dis}> ${esc(c.name)}</label>`).join('')}
          </div>` : '<p class="muted">Aucune fiche personnage : ajoutez-en dans la Bible.</p>'}
          ${missingChars.length ? `<p class="missing">${missingChars.length} lien(s) vers une fiche supprimée, conservé(s) : <button class="btn-link" data-action="drop-missing"${dis}>retirer ces liens</button></p>` : ''}
        </fieldset>
        <fieldset class="field">
          <legend>Document</legend>
          <label class="visually-hidden" for="sceneDoc">Document lié</label>
          <select id="sceneDoc" data-field="doc"${dis}>
            <option value="">— Aucun document —</option>
            ${docs.map(d => `<option value="${esc(d.name)}"${scene.doc === d.name ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
            ${scene.doc && !docs.some(d => d.name === scene.doc) ? `<option value="${esc(scene.doc)}" selected>${esc(scene.doc)} (introuvable)</option>` : ''}
          </select>
          <label for="sceneHeading" class="sub-label">Section (titre ## dans le document)</label>
          <input id="sceneHeading" data-field="heading" list="sceneHeadings" value="${esc(scene.heading || '')}" placeholder="Titre de section"${dis}>
          <datalist id="sceneHeadings"></datalist>
        </fieldset>
        ${this.isManga ? this.renderPagesHtml(scene, dis) : ''}
        <div class="detail-danger">
          <button class="btn-link danger" data-action="delete"${dis}>${icon('trash', 14)}Supprimer la scène</button>
        </div>`;
    }

    // Pages du script, par séquence ; une page peut ouvrir une double page avec la suivante
    renderPagesHtml(scene, dis) {
      const S = window.Structure;
      const linked = new Set((scene.pages || []).map(String));
      const pages = (this.data.script || []).filter(p => p && p.id);
      const bySeq = new Map();
      pages.forEach(p => {
        const key = p.sequence ?? '—';
        if (!bySeq.has(key)) bySeq.set(key, []);
        bySeq.get(key).push(p);
      });
      return `<fieldset class="field">
        <legend>Pages</legend>
        <p class="muted small">Cochez les pages de la scène. « Double » associe une page à la suivante.</p>
        ${[...bySeq.entries()].map(([seq, list]) => `
          <div class="page-group">
            <div class="page-group-title">Séquence ${esc(seq)}</div>
            ${S.groupSpreads(list).map(unit => `
              <div class="page-unit${unit.spread ? ' spread' : ''}">
                ${unit.pages.map(p => `<label class="check"><input type="checkbox" data-page="${esc(p.id)}"${linked.has(String(p.id)) ? ' checked' : ''}${dis}> p. ${esc(p.page)}${p.endNumber ? `–${esc(p.endNumber)}` : ''}</label>`).join('')}
                ${unit.pages[0].isDoublePage ? `<span class="spread-tag" title="Double page détectée dans le script">${icon('spread', 13)}double</span>`
                  : `<button class="btn-link spread-toggle${unit.spread ? ' on' : ''}" data-action="spread" data-page="${esc(unit.pages[0].id)}" aria-pressed="${unit.spread}"${dis}>${icon('spread', 13)}double</button>`}
              </div>`).join('')}
          </div>`).join('')}
      </fieldset>`;
    }

    // Titres de section du document lié, proposés pour le champ « Section »
    async fillHeadings() {
      const scene = this.selected;
      const list = this.root.querySelector('#sceneHeadings');
      if (!scene || !scene.doc || !list) return;
      let text = null;
      if (this.app.currentDoc?.name === scene.doc) text = this.app.editor.value;
      else {
        const doc = (this.app.documents || []).find(d => d.name === scene.doc);
        if (!doc) return;
        const result = await window.api.readFile(doc.path);
        if (!result.success) return;
        text = result.content;
      }
      const titles = window.PartnerContext.listSections(text).map(s => s.title);
      if (this.root.querySelector('#sceneHeadings') !== list) return;
      list.innerHTML = titles.map(t => `<option value="${esc(t)}"></option>`).join('');
    }

    renderNav() {
      const nav = document.getElementById('scenesNav');
      const list = document.getElementById('sceneNavList');
      nav.classList.toggle('hidden', !this.app.currentProject);
      document.getElementById('scenesCount').textContent = this.scenes.length || '';
      if (!this.scenes.length) {
        list.innerHTML = '<li class="nav-empty">Aucune scène</li>';
        return;
      }
      const activeId = this.app.activeSceneId();
      list.innerHTML = this.scenes.map((s, i) => `<li><button class="scene-nav-link${s.id === activeId ? ' active' : ''}" data-scene="${esc(s.id)}"${s.id === activeId ? ' aria-current="true"' : ''}>
        <span class="scene-num">${num(i)}</span><span class="scene-nav-title">${s.title ? esc(s.title) : '<span class="muted">Sans titre</span>'}</span>
        <span class="status-dot status-${esc(s.status || 'idea')}" title="${esc(window.Structure.statusLabel(s.status))}"></span>
      </button></li>`).join('');
    }

    // --- Actions ---

    async mutate(fn, { render = true } = {}) {
      const ok = await this.app.mutateProject(fn);
      if (ok && render) this.render();
      return ok;
    }

    async onClick(e) {
      const btn = e.target.closest('[data-action]');
      if (btn && !btn.disabled) {
        const S = window.Structure;
        const id = btn.dataset.id;
        switch (btn.dataset.action) {
          case 'add': {
            let created = null;
            if (await this.mutate(d => { const r = S.addScene(d, {}, { after: this.selectedId }); created = r.scene; return r.data; }, { render: false })) {
              this.select(created.id, { focusTitle: true });
            }
            return;
          }
          case 'up': case 'down':
            await this.move(id, btn.dataset.action === 'up' ? -1 : 1);
            return;
          case 'delete': return this.deleteSelected();
          case 'write': return this.app.openScene(this.selected);
          case 'ask':
            this.app.setPanelVisible('partner', true);
            this.app.partner.focus('structurer');
            return;
          case 'spread': {
            const on = btn.getAttribute('aria-pressed') !== 'true';
            await this.mutate(d => S.setPageSpread(d, btn.dataset.page, on).data);
            return;
          }
          case 'drop-missing': {
            const scene = this.selected;
            const keep = S.charactersOf(this.data, scene).filter(c => !c.missing).map(c => c.id);
            await this.mutate(d => S.updateScene(d, scene.id, { characters: keep }).data);
            return;
          }
          case 'from-sequences': return this.createFrom(S.proposeScenesFromSequences(this.data), 'séquences du script');
          case 'from-headings':
            return this.createFrom(S.proposeScenesFromHeadings(this.data, this.app.currentDoc.name, this.app.editor.value), `titres de « ${this.app.currentDoc.name} »`);
          case 'migrate': return this.app.offerMigration().then(() => this.render());
        }
        return;
      }
      const row = e.target.closest('.scene-row');
      if (row && row.dataset.id !== this.selectedId) this.select(row.dataset.id);
    }

    async move(id, delta) {
      await this.mutate(d => window.Structure.moveSceneBy(d, id, delta).data);
      this.root.querySelector(`.scene-row[data-id="${CSS.escape(id)}"]`)?.focus();
    }

    async deleteSelected() {
      const scene = this.selected;
      if (!scene) return;
      const { confirmed } = await this.app.showConfirmDialog({
        title: 'Supprimer la scène',
        message: `« ${scene.title || 'Sans titre'} » sera retirée de la structure. Le texte des documents, les pages et les fiches ne sont pas touchés.`,
        confirmLabel: 'Supprimer', cancelLabel: 'Garder'
      });
      if (!confirmed) return;
      const index = this.scenes.indexOf(scene);
      if (await this.mutate(d => window.Structure.removeScene(d, scene.id).data, { render: false })) {
        this.selectedId = this.scenes[Math.min(index, this.scenes.length - 1)]?.id || null;
        this.render();
      }
    }

    async createFrom(proposals, source) {
      if (!proposals.length) return;
      const preview = proposals.slice(0, 12).map((p, i) => `${num(this.scenes.length + i)}  ${p.title}`).join('\n');
      const { confirmed } = await this.app.showConfirmDialog({
        title: `Créer ${proposals.length} scène(s)`,
        message: `À partir des ${source}, ajoutées à la fin de la structure :\n\n${preview}${proposals.length > 12 ? `\n… et ${proposals.length - 12} autre(s)` : ''}\n\nLes scènes existantes ne sont pas modifiées.`,
        confirmLabel: 'Créer les scènes'
      });
      if (!confirmed) return;
      await this.mutate(d => proposals.reduce((acc, p) => window.Structure.addScene(acc, p).data, d));
    }

    onInput(e) {
      const field = e.target.dataset.field;
      if (!field || field === 'status' || field === 'doc' || !this.selected) return;
      const id = this.selected.id;
      const value = e.target.value;
      // La saisie met à jour le modèle tout de suite (enregistrement différé) sans redessiner la fiche
      this.app.mutateProject(d => window.Structure.updateScene(d, id, { [field]: value }).data).then(ok => {
        if (!ok) return;
        const row = this.root.querySelector(`.scene-row[data-id="${CSS.escape(id)}"]`);
        const index = this.scenes.findIndex(s => s.id === id);
        if (row && index >= 0) row.outerHTML = this.renderRowHtml(this.scenes[index], index);
        this.renderNav();
        if (field === 'heading') this.app.updatePosition();
      });
    }

    async onChange(e) {
      const scene = this.selected;
      if (!scene) return;
      const t = e.target;
      const S = window.Structure;
      if (t.id === 'sceneFilter') {
        this.filter = t.value;
        this.render();
      } else if (t.dataset.field === 'status' || t.dataset.field === 'doc') {
        await this.mutate(d => S.updateScene(d, scene.id, { [t.dataset.field]: t.value }).data);
      } else if (t.dataset.character !== undefined) {
        const set = new Set((scene.characters || []).map(String));
        if (t.checked) set.add(t.dataset.character); else set.delete(t.dataset.character);
        await this.mutate(d => S.updateScene(d, scene.id, { characters: [...set] }).data);
      } else if (t.dataset.page !== undefined) {
        const set = new Set((scene.pages || []).map(String));
        if (t.checked) set.add(t.dataset.page); else set.delete(t.dataset.page);
        await this.mutate(d => S.updateScene(d, scene.id, { pages: [...set] }).data);
      }
    }

    onKeydown(e) {
      const row = e.target.closest?.('.scene-row');
      if (!row || e.target !== row) return;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (this.app.readOnlyReason()) return;
        this.move(row.dataset.id, e.key === 'ArrowUp' ? -1 : 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const sibling = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
        if (sibling) this.select(sibling.dataset.id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.select(row.dataset.id, { focusTitle: true });
      }
    }

    // Glisser-déposer : la scène est placée à la position de la scène survolée
    setupDrag() {
      this.root.addEventListener('dragstart', (e) => {
        const row = e.target.closest?.('.scene-row');
        if (!row || this.app.readOnlyReason()) { e.preventDefault(); return; }
        this.dragId = row.dataset.id;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.id);
      });
      this.root.addEventListener('dragover', (e) => {
        const row = e.target.closest?.('.scene-row');
        if (!row || !this.dragId) return;
        e.preventDefault();
        this.root.querySelectorAll('.drop-target').forEach(r => r.classList.remove('drop-target'));
        if (row.dataset.id !== this.dragId) row.classList.add('drop-target');
      });
      this.root.addEventListener('dragend', () => {
        this.dragId = null;
        this.root.querySelectorAll('.dragging, .drop-target').forEach(r => r.classList.remove('dragging', 'drop-target'));
      });
      this.root.addEventListener('drop', async (e) => {
        const row = e.target.closest?.('.scene-row');
        const id = this.dragId;
        if (!row || !id) return;
        e.preventDefault();
        const to = this.scenes.findIndex(s => s.id === row.dataset.id);
        this.dragId = null;
        await this.mutate(d => window.Structure.moveScene(d, id, to).data);
      });
    }
  }

  window.StructureView = StructureView;
})();
