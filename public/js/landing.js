// Landing page, laid out after the ntnu.1024.no screenshot:
// title + rule, "getting started" yellow box with name field and Start button,
// statistics table, top 10 as horizontal pastel bars, two-column footer.

import { h, icons, fmt, formatDuration, normalizeUsername } from './dom.js';
import { api } from './api.js';

export function siteFoot() {
  return h(
    'footer',
    { class: 'site-foot' },
    h(
      'div',
      { class: 'columns' },
      h('p', {}, 'Brettene i biblioteket kommer fra filene i puzzles/. Vanskelighetsgraden er beregnet ut fra hvilke løsningsteknikker et brett krever.'),
      h('p', {}, 'Ingen passord: alle som skriver inn et brukernavn, kommer til den profilen og kan spille videre der.'),
    ),
    h('div', { class: 'center' }, 'Brettet er laget etter Adressas sudoku, forsiden etter ntnu.1024.no.'),
  );
}

export async function renderLanding(app) {
  document.title = 'Sudoku';
  const params = new URLSearchParams(location.search);

  const input = h('input', {
    type: 'text',
    name: 'username',
    autocomplete: 'username',
    autocapitalize: 'none',
    spellcheck: 'false',
    maxlength: 30,
    'aria-label': 'Brukernavn',
    autofocus: true,
  });
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const form = h(
    'form',
    {
      class: 'note-box',
      onsubmit: (e) => {
        e.preventDefault();
        const name = normalizeUsername(input.value);
        if (!name) {
          error.hidden = false;
          error.textContent = 'Bruk 2–30 tegn: a–z, 0–9, æ, ø, å, - og _. Må starte med en bokstav eller et tall.';
          return;
        }
        // Keep a shared puzzle link (?p=...) when choosing a name.
        const p = params.get('p');
        location.href = `/${encodeURIComponent(name)}${p ? `?p=${encodeURIComponent(p)}` : ''}`;
      },
    },
    h('p', {}, 'Skriv inn et kort navn som identifiserer profilen din, f.eks. brukernavn eller kallenavn. Hvis navnet du velger er tatt, velg et annet.'),
    h('div', { class: 'row' }, input, h('button', { class: 'go', type: 'submit' }, 'Start', icons.arrow())),
    error,
  );

  const statsBody = h('div', { class: 'section-body' }, h('p', { class: 'empty-note' }, 'Henter …'));
  const topBody = h('div', {}, h('p', { class: 'empty-note' }, 'Henter …'));

  app.replaceChildren(
    h(
      'div',
      { class: 'site' },
      h('header', { class: 'site-head' }, h('h1', {}, 'Sudoku')),
      h(
        'div',
        { class: 'columns' },
        h(
          'section',
          {},
          h('h2', { class: 'section-title' }, 'Kom i gang'),
          h('div', { class: 'section-body' }, form, h('p', { class: 'below-note' }, 'For å komme tilbake til profilen din skriver du bare inn det samme navnet som sist.')),
          h('h2', { class: 'section-title' }, 'Statistikk'),
          statsBody,
        ),
        h('section', {}, h('h2', { class: 'section-title' }, 'Topp 10 spillere'), topBody),
      ),
      siteFoot(),
    ),
  );

  try {
    const o = await api.overview();
    statsBody.replaceChildren(
      h(
        'table',
        { class: 'plain' },
        h('tbody', {},
          h('tr', {}, h('td', {}, 'Antall profiler'), h('td', { class: 'n' }, fmt(o.players))),
          h('tr', {}, h('td', {}, 'Antall løste brett'), h('td', { class: 'n' }, fmt(o.solved))),
          h('tr', {}, h('td', {}, 'Samlet spilletid'), h('td', { class: 'n' }, formatDuration(o.seconds))),
          h('tr', {}, h('td', {}, 'Brett i biblioteket'), h('td', { class: 'n' }, fmt(o.library))),
        ),
      ),
    );
    topBody.replaceChildren(
      o.top.length
        ? barList(o.top.map((t) => ({ label: t.name, value: t.solved, href: `/${encodeURIComponent(t.name)}`, title: `${t.name}: ${t.solved} løste brett` })))
        : h('p', { class: 'empty-note' }, 'Ingen har løst et brett ennå.'),
    );
  } catch (err) {
    statsBody.replaceChildren(h('p', { class: 'empty-note' }, err.message));
    topBody.replaceChildren();
  }
}

/**
 * Horizontal bars like the landing page screenshot: label inside at the left,
 * value inside at the end, width proportional to the value.
 */
export function barList(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return h(
    'ol',
    { class: 'hbars' },
    items.map((i) => {
      const attrs = { class: 'bar', style: { width: `${Math.max(8, (i.value / max) * 100)}%` }, title: i.title };
      const inner = [h('span', {}, i.label), h('span', { class: 'value' }, fmt(i.value))];
      return h('li', {}, i.href ? h('a', { ...attrs, href: i.href }, inner) : h('div', attrs, inner));
    }),
  );
}
