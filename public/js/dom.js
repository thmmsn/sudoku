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

// Thin line icons, drawn for this app.
const line = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

export const icons = {
  pencil: () => svg([['path', { d: 'M4 20l1-4.5L15.5 5a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19z', ...line }], ['path', { d: 'M13.5 7l3.5 3.5', ...line }]]),
  undo: () => svg([['path', { d: 'M9 14L4 9l5-5', ...line }], ['path', { d: 'M4 9h10a6 6 0 0 1 0 12h-3', ...line }]]),
  menu: () =>
    svg([
      ['circle', { cx: 5, cy: 12, r: 1.4, fill: 'currentColor' }],
      ['circle', { cx: 12, cy: 12, r: 1.4, fill: 'currentColor' }],
      ['circle', { cx: 19, cy: 12, r: 1.4, fill: 'currentColor' }],
    ]),
  next: () => svg([['path', { d: 'M4 12h16M14 6l6 6-6 6', ...line }]]),
  check: () => svg([['path', { d: 'M4 12.5l5 5L20 6.5', ...line }]]),
  clear: () => svg([['path', { d: 'M6 6l12 12M18 6L6 18', ...line }]]),
  back: () => svg([['path', { d: 'M20 12H4M10 6l-6 6 6 6', ...line }]]),
  sun: () =>
    svg([
      ['circle', { cx: 12, cy: 12, r: 4, ...line }],
      ['path', { d: 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4', ...line }],
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
