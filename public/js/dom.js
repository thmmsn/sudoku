// Tiny DOM helpers. Text is always set as text nodes, never innerHTML, so
// usernames and imported collection names cannot inject markup.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  appendAll(el, children);
  return el;
}

function appendAll(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) appendAll(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const NS = 'http://www.w3.org/2000/svg';

function svg(inner, attrs = {}) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const [tag, a] of inner) {
    const child = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) child.setAttribute(k, v);
    el.append(child);
  }
  return el;
}

// Icons drawn after the shapes in the Adressa screenshots. Adressa uses the
// Font Awesome icons circle-pause, circle-play, rotate-left (undo), trash-can
// (clear the board), pen-to-square (notes) and circle-question (help); these
// are my own drawings of the same ideas, not Font Awesome's paths.
export const icons = {
  pause: () =>
    svg([
      ['circle', { cx: 12, cy: 12, r: 12, fill: 'currentColor' }],
      ['rect', { x: 8, y: 7, width: 2.8, height: 10, rx: 1.4, fill: 'var(--game-bg)' }],
      ['rect', { x: 13.2, y: 7, width: 2.8, height: 10, rx: 1.4, fill: 'var(--game-bg)' }],
    ]),
  play: () =>
    svg([
      ['circle', { cx: 12, cy: 12, r: 12, fill: 'currentColor' }],
      ['path', { d: 'M9.5 7.2v9.6l7.6-4.8z', fill: 'var(--game-bg)' }],
    ]),
  undo: () =>
    svg([
      ['path', { d: 'M5.2 9.2A7.6 7.6 0 1 1 7.4 18', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.8, 'stroke-linecap': 'round' }],
      ['path', { d: 'M3.2 3.8v6.6h6.6', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ]),
  trash: () =>
    svg([
      ['path', { d: 'M9 2.5h6l.8 1.7H20a1 1 0 0 1 1 1v1.3H3V5.2a1 1 0 0 1 1-1h4.2z', fill: 'currentColor' }],
      [
        'path',
        {
          d: 'M4.3 7.8h15.4l-1.1 13a1.8 1.8 0 0 1-1.8 1.7H7.2a1.8 1.8 0 0 1-1.8-1.7zM8.2 10.3v9h1.8v-9zm3 0v9h1.8v-9zm3 0v9h1.8v-9z',
          fill: 'currentColor',
          'fill-rule': 'evenodd',
        },
      ],
    ]),
  pencil: () =>
    svg([
      ['path', { d: 'M12 4.5H6a2.5 2.5 0 0 0-2.5 2.5v11A2.5 2.5 0 0 0 6 20.5h11a2.5 2.5 0 0 0 2.5-2.5v-6', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.8, 'stroke-linecap': 'round' }],
      ['path', { d: 'M18.6 2.6a2 2 0 0 1 2.8 0l.9.9a2 2 0 0 1 0 2.8l-8.8 8.8-4.4 1.2 1.2-4.4z', fill: 'currentColor' }],
    ]),
  question: () =>
    svg([
      ['circle', { cx: 12, cy: 12, r: 12, fill: 'currentColor' }],
      ['path', { d: 'M8.9 9.3a3.1 3.1 0 1 1 4.6 2.7c-.9.5-1.5 1.1-1.5 2.1v.6', fill: 'none', stroke: 'var(--game-bg)', 'stroke-width': 2.4, 'stroke-linecap': 'round' }],
      ['circle', { cx: 12, cy: 18.2, r: 1.5, fill: 'var(--game-bg)' }],
    ]),
};

export function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

/** Game clock as Adressa shows it: minutes and seconds, minutes unbounded. */
export function formatClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Long durations: "3 t 12 min", "12 min", "45 s". */
export function formatDuration(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec} s`;
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return hh ? `${hh} t ${mm} min` : `${mm} min`;
}

const nf = new Intl.NumberFormat('nb-NO');
export const fmt = (n) => nf.format(n);

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Same rules as the server (server/store.js). */
export const USERNAME = /^[a-z0-9æøå][a-z0-9æøå_-]{1,29}$/;
export const RESERVED = new Set(['api', 'js', 'css', 'img', 'assets', 'static', 'public', 'admin']);

export function normalizeUsername(raw) {
  const name = String(raw || '').trim().toLowerCase();
  return USERNAME.test(name) && !RESERVED.has(name) ? name : null;
}
