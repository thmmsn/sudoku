// Landing page: one field, and below it the public best times. Type a name
// and you are on that profile; if it exists you get it, otherwise it is
// created. No passwords (the mechanism from ntnu.1024.no).
//
// Opened as an installed app (start_url /?app), it goes straight to the last
// profile used on this device. "/?ny" always shows the field.

import { h, icons, formatTime, normalizeUsername } from './dom.js';
import { api, local } from './api.js';
import { DIFFICULTIES } from './engine.js';

export function renderLanding(app) {
  document.title = 'Sudoku';
  const params = new URLSearchParams(location.search);
  const last = normalizeUsername(local.get('lastProfile'));
  const standalone = params.has('app') || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (last && standalone && !params.has('ny') && !params.has('p')) {
    location.replace(`/${encodeURIComponent(last)}`);
    return;
  }

  const input = h('input', {
    type: 'text',
    name: 'username',
    autocomplete: 'username',
    autocapitalize: 'none',
    spellcheck: 'false',
    enterkeyhint: 'go',
    maxlength: 30,
    placeholder: 'navn',
    'aria-label': 'Brukernavn',
    value: last || undefined,
  });
  const error = h('p', { class: 'hint', role: 'alert', hidden: true }, 'a–z 0–9 æ ø å - _ · 2–30 tegn');
  input.addEventListener('input', () => (error.hidden = true));
  const best = h('div', { class: 'best' });

  app.replaceChildren(
    h('main', { class: 'landing' },
      h('form', {
        onsubmit: (e) => {
          e.preventDefault();
          const name = normalizeUsername(input.value);
          if (!name) {
            error.hidden = false;
            return;
          }
          const p = params.get('p'); // keep a shared puzzle link
          location.href = `/${encodeURIComponent(name)}${p ? `?p=${encodeURIComponent(p)}` : ''}`;
        },
      },
      input,
      h('button', { class: 'tool', type: 'submit', 'aria-label': 'Gå' }, icons.next())),
      error,
      best));

  // Public best times: per level 1-5, the three fastest players (library
  // puzzles, no hints). Hidden when there are none or the server is away.
  api.overview().then((o) => {
    const rows = DIFFICULTIES.map((d, k) => [k + 1, o.best?.[d] || []]).filter(([, list]) => list.length);
    if (!rows.length) return;
    best.replaceChildren(
      h('table', { 'aria-label': 'Beste tider' },
        h('tbody', {}, rows.map(([level, list]) =>
          h('tr', {},
            h('td', { class: 'lvl' }, String(level)),
            h('td', {}, list.slice(0, 3).map((x, k) => [k ? h('span', { class: 'sep' }, ' · ') : null, h('span', { class: 't' }, formatTime(x.seconds)), ' ', x.name])))))));
  }).catch(() => {});
}
