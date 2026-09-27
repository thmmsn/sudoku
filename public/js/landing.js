// Landing page. The mechanism comes from ntnu.1024.no: type a username and you
// are on that profile. If it exists you get that profile, otherwise it is
// created. There are no passwords. The look follows the Adressa game.

import { h, fmt, formatDuration, normalizeUsername } from './dom.js';
import { api } from './api.js';

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
    placeholder: 'Brukernavn',
    'aria-label': 'Brukernavn',
    autofocus: true,
  });
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const form = h(
    'form',
    {
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
    h('div', { class: 'row' }, input, h('button', { class: 'btn', type: 'submit' }, 'Start')),
    error,
  );

  const stats = h('div');

  app.replaceChildren(
    h(
      'main',
      { class: 'landing' },
      h('h1', {}, 'Sudoku'),
      h('p', { class: 'lead' }, 'Skriv inn et brukernavn for å gå til profilen din.'),
      form,
      h('p', { class: 'explain' },
        'Finnes navnet, kommer du til den profilen. Finnes det ikke, blir det ditt. Det er ingen passord, så alle som skriver inn samme navn, kommer til samme profil. Velg et annet navn om det er tatt.'),
      stats,
    ),
  );

  try {
    const o = await api.overview();
    stats.replaceChildren(
      h('h2', {}, 'Statistikk'),
      h('table', { class: 'data' },
        h('tbody', {},
          h('tr', {}, h('td', {}, 'Profiler'), h('td', { class: 'n' }, fmt(o.players))),
          h('tr', {}, h('td', {}, 'Løste brett'), h('td', { class: 'n' }, fmt(o.solved))),
          h('tr', {}, h('td', {}, 'Samlet spilletid'), h('td', { class: 'n' }, formatDuration(o.seconds))),
          h('tr', {}, h('td', {}, 'Brett i biblioteket'), h('td', { class: 'n' }, fmt(o.library))),
        )),
      o.top.length
        ? [
            h('h2', {}, 'Flest løste brett'),
            bars(o.top.map((t) => ({ label: t.name, value: t.solved, href: `/${encodeURIComponent(t.name)}` }))),
          ]
        : null,
    );
  } catch {
    // Stats are optional; the name field works without them.
  }
}

/** Single-series horizontal bars: label, navy bar, value. */
export function bars(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return h(
    'ul',
    { class: 'bars' },
    items.map((i) =>
      h('li', { title: `${i.label}: ${fmt(i.value)}` },
        i.href ? h('a', { href: i.href }, i.label) : h('span', {}, i.label),
        h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${(i.value / max) * 100}%` } })),
        h('span', { class: 'value' }, fmt(i.value)))),
  );
}
