// === Icônes de l'interface ===
// Pictogrammes au trait (24 × 24, currentColor), toujours accompagnés d'un label ou d'un aria-label.
// Dans le HTML : <span class="icon" data-icon="nom"></span>, rempli par Icons.hydrate().

(function () {
  const PATHS = {
    plus: 'M12 5v14M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M5 12.5l4.5 4.5L19 7',
    edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    up: 'M6 15l6-6 6 6',
    down: 'M6 9l6 6 6-6',
    right: 'M9 6l6 6-6 6',
    document: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
    scenes: 'M4 5h3M4 12h3M4 19h3M10 5h10M10 12h10M10 19h10',
    book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
    pen: 'M14 4l6 6-10 10H4v-6zM12 6l6 6',
    person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    place: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    system: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.5a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.5a7 7 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
    'panel-left': 'M4 4h16v16H4zM9 4v16',
    'panel-right': 'M4 4h16v16H4zM15 4v16',
    focus: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    import: 'M12 3v12M7 10l5 5 5-5M4 19h16',
    analyse: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5',
    spread: 'M3 5h8v14H3zM13 5h8v14h-8z'
  };

  function svg(name, { size = 16, label = '' } = {}) {
    const d = PATHS[name];
    if (!d) return '';
    const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
    return `<svg class="icon-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${a11y}><path d="${d}"/></svg>`;
  }

  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.iconDone) return;
      el.insertAdjacentHTML('afterbegin', svg(el.dataset.icon, { size: Number(el.dataset.iconSize) || 16 }));
      el.dataset.iconDone = '1';
    });
  }

  window.Icons = { svg, hydrate, names: Object.keys(PATHS) };
})();
