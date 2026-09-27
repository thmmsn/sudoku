// Import, statistics and settings. None of these exist on Adressa; they reuse
// the game's tokens (navy, light grey, serif, navy buttons, segmented controls).

import { h, fmt, formatTime, formatDuration, formatDate, download } from './dom.js';
import { DIFFICULTIES, DIFFICULTY_LABELS, parseImport } from './engine.js';
import { summarize, solvedPuzzles, LEVELS } from './stats.js';
import { bars } from './landing.js';

const label = (d) => DIFFICULTY_LABELS[d] || DIFFICULTY_LABELS.unknown;
const dash = '–';

/** "Spill"-style link that runs fn instead of navigating. */
const action = (text, fn) =>
  h('a', { href: '#', onclick: (e) => { e.preventDefault(); fn(); } }, text);

// ---------------------------------------------------------------------------
// Import

export function renderImport(ctx) {
  const textarea = h('textarea', {
    'aria-label': 'Brett som skal importeres',
    spellcheck: 'false',
    placeholder: [
      '.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..',
      '7.....8...2.4.5....5....32......1.7...8....59........49...42..73..9.......63.....,769123845823465791154879326492581673618734259537296184981642537375918462246357918',
    ].join('\n'),
  });
  const file = h('input', { type: 'file', accept: '.csv,.txt,.json,.jsonl', multiple: true, class: 'visually-hidden', id: 'import-file' });
  const collection = h('input', { type: 'text', 'aria-label': 'Navn på samlingen', placeholder: 'Samling', maxlength: 60 });
  const preview = h('p', { class: 'msg muted', role: 'status' });
  const result = h('div', { role: 'status' });
  const button = h('button', { class: 'btn', type: 'submit' }, 'Importer');

  // Quick local count while typing; the server does the real validation.
  let timer;
  textarea.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { entries, errors } = parseImport(textarea.value);
      preview.textContent = textarea.value.trim()
        ? `Fant ${fmt(entries.length)} brett${errors.length ? `, og ${fmt(errors.length)} linjer som ikke er brett` : ''}.`
        : '';
    }, 250);
  });

  file.addEventListener('change', async () => {
    const texts = await Promise.all([...file.files].map((f) => f.text()));
    textarea.value = [textarea.value.trim(), ...texts].filter(Boolean).join('\n');
    if (!collection.value && file.files.length === 1) collection.value = file.files[0].name.replace(/\.[^.]+$/, '');
    textarea.dispatchEvent(new Event('input'));
    file.value = '';
  });

  const list = h('div');
  const renderList = () => list.replaceChildren(puzzleTable(ctx, renderList));
  renderList();

  const form = h(
    'form',
    {
      class: 'panel',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!textarea.value.trim()) return;
        button.disabled = true;
        result.replaceChildren();
        try {
          const r = await ctx.importPuzzles(textarea.value, collection.value.trim() || 'Importert');
          const text = `La til ${fmt(r.added.length)} brett.${r.duplicates ? ` ${fmt(r.duplicates)} fantes fra før.` : ''}${r.invalid.length ? ` ${fmt(r.invalid.length)} ble avvist:` : ''}`;
          result.replaceChildren(
            h('div', { class: 'msg' }, text,
              r.invalid.length ? h('ul', {}, r.invalid.slice(0, 50).map((x) => h('li', {}, `Linje ${x.line}: ${x.error}`))) : null),
          );
          if (r.added.length) {
            textarea.value = '';
            preview.textContent = '';
          }
          renderList();
        } catch (err) {
          result.replaceChildren(h('p', { class: 'msg error' }, err.message));
        } finally {
          button.disabled = false;
        }
      },
    },
    h('p', {}, 'Lim inn brett, ett per linje, eller velg filer. Tomme ruter skrives som . eller 0.'),
    textarea,
    h('div', { class: 'row', style: { marginTop: '10px' } },
      h('label', { class: 'btn secondary', for: 'import-file' }, 'Velg filer …'),
      file,
      collection,
      button),
    preview,
    result,
  );

  return h('div', {},
    h('h2', {}, 'Importer brett'),
    form,
    h('h2', {}, 'Formater som støttes'),
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('tbody', {},
          formatRow('Ett brett per linje', '81 tegn, . eller 0 for tom rute'),
          formatRow('Brett og løsning', 'brett,løsning'),
          formatRow('CSV med overskrift', 'puzzle,solution,difficulty,id'),
          formatRow('JSON-linjer', '{"puzzle": "...", "solution": "..."}'),
          formatRow('9×9-rutenett', '9 linjer, | + - ignoreres')))),
    h('p', { class: 'muted', style: { marginTop: '10px' } }, 'Hvert brett må ha nøyaktig én løsning. Vanskelighetsgraden beregnes hvis den mangler.'),
    h('h2', {}, 'Mine brett'),
    list,
  );
}

function formatRow(name, example) {
  return h('tr', {}, h('td', {}, name), h('td', {}, h('code', {}, example)));
}

function puzzleTable(ctx, rerender) {
  const puzzles = ctx.profile.puzzles;
  if (!puzzles.length) return h('p', { class: 'muted' }, 'Du har ikke importert noen brett ennå.');
  const solved = solvedPuzzles(ctx.profile.games);
  const csv = () =>
    download(
      `sudoku-${ctx.name}.csv`,
      ['puzzle,solution,difficulty,id', ...puzzles.map((p) => `${p.puzzle},${p.solution},${p.difficulty},${p.id}`)].join('\n') + '\n',
      'text/csv',
    );
  const rows = puzzles.slice(0, 500).map((p) =>
    h('tr', {},
      h('td', {}, h('code', {}, p.id)),
      h('td', {}, label(p.difficulty)),
      h('td', { class: 'n' }, String(p.givens)),
      h('td', {}, p.collection || ''),
      h('td', {}, solved.has(p.puzzle) ? 'Løst' : ''),
      h('td', {},
        action('Spill', () => ctx.play({ puzzle: p.puzzle, solution: p.solution, difficulty: p.difficulty, puzzleId: p.id, source: 'import' })),
        ' · ',
        action('Slett', async () => {
          if (!confirm(`Slette brett ${p.id}?`)) return;
          await ctx.deletePuzzle(p.id);
          rerender();
        }))));
  return h('div', {},
    h('div', { class: 'table-scroll' },
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Id'), h('th', {}, 'Nivå'), h('th', { class: 'n' }, 'Gitte'), h('th', {}, 'Samling'), h('th', {}, 'Status'), h('th', {}, ''))),
        h('tbody', {}, rows))),
    puzzles.length > 500 ? h('p', { class: 'muted', style: { marginTop: '10px' } }, `Viser 500 av ${fmt(puzzles.length)}.`) : null,
    h('p', { style: { marginTop: '10px' } }, action('Last ned som CSV', csv)));
}

// ---------------------------------------------------------------------------
// Statistics

export function renderStats(ctx) {
  const s = summarize(ctx.profile.games);
  const t = (sec) => (sec === null ? dash : formatTime(sec));

  const overview = h('table', { class: 'data' },
    h('tbody', {},
      row('Løste brett', fmt(s.solved)),
      row('Ikke fullført', fmt(s.abandoned)),
      row('Fullføringsgrad', s.winRate === null ? dash : `${Math.round(s.winRate * 100)} %`),
      row('Samlet tid på løste brett', formatDuration(s.totalSeconds)),
      row('Dager på rad nå', fmt(s.streak.current)),
      row('Flest dager på rad', fmt(s.streak.longest)),
    ));

  const solvedBars = DIFFICULTIES.filter((d) => s.byDifficulty[d]?.solved).map((d) => ({
    label: label(d),
    value: s.byDifficulty[d].solved,
  }));

  const levels = LEVELS.filter((l) => s.byDifficulty[l]);
  const perLevel = levels.length
    ? h('div', { class: 'table-scroll' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Nivå'), h('th', { class: 'n' }, 'Løst'), h('th', { class: 'n' }, 'Beste'),
            h('th', { class: 'n' }, 'Beste uten hint'), h('th', { class: 'n' }, 'Snitt'), h('th', { class: 'n' }, 'Median'))),
          h('tbody', {}, levels.map((l) => {
            const x = s.byDifficulty[l];
            return h('tr', {},
              h('td', {}, label(l)), h('td', { class: 'n' }, fmt(x.solved)), h('td', { class: 'n' }, t(x.best)),
              h('td', { class: 'n' }, t(x.bestClean)), h('td', { class: 'n' }, t(x.average)), h('td', { class: 'n' }, t(x.median)));
          }))))
    : h('p', { class: 'muted' }, 'Ingen spill ennå.');

  const recent = s.recent.slice(0, 25);
  const history = recent.length
    ? h('div', { class: 'table-scroll' },
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Dato'), h('th', {}, 'Nivå'), h('th', { class: 'n' }, 'Tid'), h('th', {}, 'Status'), h('th', {}, ''))),
          h('tbody', {}, recent.map((g) =>
            h('tr', { class: g.status === 'solved' ? undefined : 'dim' },
              h('td', {}, formatDate(g.finishedAt)), h('td', {}, label(g.difficulty)),
              h('td', { class: 'n' }, formatTime(g.seconds)),
              h('td', {}, g.status === 'solved' ? 'Løst' : 'Ikke fullført'),
              h('td', {}, action('Spill igjen', () => {
                const known = ctx.library.find((p) => p.p === g.puzzle) || ctx.profile.puzzles.find((p) => p.puzzle === g.puzzle);
                const solution = known?.s || known?.solution;
                if (solution) ctx.play({ puzzle: g.puzzle, solution, difficulty: g.difficulty, puzzleId: g.puzzleId, source: g.source });
                else location.href = `?p=${g.puzzle}#spill`;
              })))))))
    : h('p', { class: 'muted' }, 'Ingen spill ennå.');

  return h('div', {},
    h('h2', {}, 'Oversikt'), overview,
    h('h2', {}, 'Løste brett per nivå'),
    solvedBars.length ? bars(solvedBars) : h('p', { class: 'muted' }, 'Ingen løste brett ennå.'),
    h('h2', {}, 'Tider per nivå'), perLevel,
    h('h2', {}, 'Siste spill'), history);
}

function row(name, value) {
  return h('tr', {}, h('td', {}, name), h('td', { class: 'n' }, value));
}

// ---------------------------------------------------------------------------
// Settings

export function renderSettings(ctx) {
  const s = ctx.settings;

  const themes = [['system', 'System'], ['light', 'Lys'], ['dark', 'Mørk']];
  const themeBtns = themes.map(([v, text]) =>
    h('button', { type: 'button', 'aria-pressed': String(s.theme === v), onclick: () => {
      ctx.updateSettings({ theme: v });
      themeBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(themes[k][0] === v)));
    } }, text));
  const theme = h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'set-theme' }, themeBtns);

  const sizeOut = h('output', {}, `${s.boardMax} px`);
  const size = h('input', { type: 'range', id: 'set-size', min: 320, max: 760, step: 20, value: s.boardMax });
  size.addEventListener('input', () => {
    sizeOut.textContent = `${size.value} px`;
    ctx.updateSettings({ boardMax: Number(size.value) });
  });

  const check = (key) => {
    const input = h('input', { type: 'checkbox', id: `set-${key}` });
    input.checked = s[key];
    input.addEventListener('change', () => ctx.updateSettings({ [key]: input.checked }));
    return input;
  };

  const item = (id, title, help, control, labelTag = 'label') =>
    h('li', {},
      h(labelTag, labelTag === 'label' ? { for: id } : { id }, title, help ? h('span', { class: 'help' }, help) : null),
      control);

  return h('div', {},
    h('h2', {}, 'Innstillinger'),
    h('ul', { class: 'settings-list' },
      item('set-theme', 'Tema', 'Mørk modus finnes ikke hos Adressa. Fargene er mine egne valg.', theme, 'span'),
      item('set-size', 'Brettstørrelse', 'Største bredde. På mobil fyller brettet skjermen.', h('span', { class: 'row' }, size, sizeOut)),
      item('set-highlightSame', 'Marker like tall', 'Ruter med samme tall som valgt rute blir blågrå. Alltid på hos Adressa.', check('highlightSame')),
      item('set-showTimer', 'Vis tidtaker', 'Tiden måles uansett til statistikken. Alltid synlig hos Adressa.', check('showTimer')),
      item('set-autoRemoveNotes', 'Fjern notater automatisk', 'Når du skriver et tall, forsvinner det fra notatene i samme rad, kolonne og boks. Alltid på hos Adressa.', check('autoRemoveNotes')),
    ),
    h('h2', {}, 'Profil'),
    h('div', { class: 'panel' },
      h('p', {}, 'Profilen har ikke passord. Alle som skriver inn ', h('strong', {}, ctx.name), ' på forsiden, kommer hit.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn secondary', type: 'button', onclick: () =>
          download(`sudoku-${ctx.name}.json`, JSON.stringify(ctx.profile, null, 2), 'application/json') }, 'Last ned alle data'),
        h('button', { class: 'btn secondary', type: 'button', onclick: async () => {
          if (confirm(`Slette alt på «${ctx.name}»? Historikk, statistikk, importerte brett og innstillinger forsvinner. Det kan ikke angres.`)) await ctx.resetProfile();
        } }, `Slett ${ctx.name}`))));
}
