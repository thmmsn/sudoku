// Landing page: one field. Type a name and you are on that profile; if it
// exists you get it, otherwise it is created. No passwords (the mechanism from
// ntnu.1024.no).

import { h, icons, normalizeUsername } from './dom.js';

export function renderLanding(app) {
  document.title = 'Sudoku';
  const params = new URLSearchParams(location.search);

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
    autofocus: true,
  });
  const error = h('p', { class: 'hint', role: 'alert', hidden: true }, 'a–z 0–9 æ ø å - _ · 2–30 tegn');
  input.addEventListener('input', () => (error.hidden = true));

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
      error));
}
