// Import, statistics and settings. None of these exist on Adressa, so they use
// the landing page's (ntnu.1024.no) visual language: serif section titles with
// a rule, the yellow box for input, plain tables and pastel bars.

import { h, icons, fmt, formatTime, formatDuration, formatDate, download } from './dom.js';
import { DIFFICULTIES, DIFFICULTY_LABELS, parseImport } from './engine.js';
import { summarize, solvedPuzzles, LEVELS } from './stats.js';
import { barList } from './landing.js';

const label = (d) => DIFFICULTY_LABELS[d] || DIFFICULTY_LABELS.unknown;

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
  const preview = h('p', { class: 'flash-msg', role: 'status' });
  const result = h('div', { role: 'status' });
  const button = h('button', { class: 'go', type: 'submit' }, 'Importer', icons.arrow());

  // Quick local count while typing; the server does the real validation.
  let timer;
  textarea.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { entries, errors } = parseImport(textarea.value);
      preview.className = 'flash-msg';
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
      class: 'note-box',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!textarea.value.trim()) return;
        button.disabled = true;
        result.replaceChildren();
        try {
          const r = await ctx.importPuzzles(textarea.value, collection.value.trim() || 'Importert');
          const lines = [
            h('p', { class: 'flash-msg' }, `La til ${fmt(r.added.length)} brett.${r.duplicates ? ` ${fmt(r.duplicates)} fantes fra før.` : ''}${r.invalid.length ? ` ${fmt(r.invalid.length)} ble avvist:` : ''}`),
          ];
          if (r.invalid.length) {
            lines.push(h('ul', { class: 'flash-msg' }, r.invalid.slice(0, 50).map((x) => h('li', {}, `Linje ${x.line}: ${x.error}`))));
          }
          result.replaceChildren(...lines);
          if (r.added.length) {
            textarea.value = '';
            preview.textContent = '';
          }
          renderList();
        } catch (err) {
          result.replaceChildren(h('p', { class: 'flash-msg error' }, err.message));
        } finally {
          button.disabled = false;
        }
      },
    },
    h('p', {}, 'Lim inn brett, ett per linje, eller velg filer. Tomme ruter skrives som . eller 0.'),
    textarea,
    h('div', { class: 'row' },
      h('label', { class: 'go secondary', for: 'import-file', style: { cursor: 'pointer' } }, 'Velg filer …'),
      file,
      collection,
      button),
  );

  return h(
    'div',
    {},
    h('div', { class: 'columns' },
      h('section', {},
        h('h2', { class: 'section-title' }, 'Importer brett'),
        h('div', { class: 'section-body' }, form, preview, result)),
      h('section', {},
        h('h2', { class: 'section-title' }, 'Formater'),
        h('div', { class: 'section-body' },
          h('table', { class: 'plain' },
            h('tbody', {},
              formatRow('Ett brett per linje', '81 tegn'),
              formatRow('Brett og løsning', 'brett,løsning'),
              formatRow('CSV med overskrift', 'puzzle,solution,difficulty,id'),
              formatRow('JSON-linjer', '{"puzzle": "...", "solution": "..."}'),
              formatRow('9×9-rutenett', '9 linjer, | + - ignoreres'),
            )),
          h('p', { class: 'below-note' }, 'Hvert brett må ha nøyaktig én løsning. Vanskelighetsgraden beregnes hvis den mangler.'))),
    ),
    h('section', { class: 'full' }, h('h2', { class: 'section-title' }, 'Mine brett'), list),
  );
}

function formatRow(name, example) {
  return h('tr', {}, h('td', {}, name), h('td', {}, h('code', {}, example)));
}

function puzzleTable(ctx, rerender) {
  const puzzles = ctx.profile.puzzles;
  if (!puzzles.length) return h('p', { class: 'empty-note' }, 'Du har ikke importert noen brett ennå.');
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
        h('a', { href: '#spill', onclick: (e) => {
          e.preventDefault();
          ctx.play({ puzzle: p.puzzle, solution: p.solution, difficulty: p.difficulty, puzzleId: p.id, source: 'import' });
        } }, 'Spill'),
        ' · ',
        h('a', { href: '#', onclick: async (e) => {
          e.preventDefault();
          if (!confirm(`Slette brett ${p.id}?`)) return;
          await ctx.deletePuzzle(p.id);
          rerender();
        } }, 'Slett'))));
  return h('div', { class: 'section-body' },
    h('div', { class: 'table-scroll' },
      h('table', { class: 'plain' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Id'), h('th', {}, 'Nivå'), h('th', { class: 'n' }, 'Gitte'), h('th', {}, 'Samling'), h('th', {}, 'Status'), h('th', {}, ''))),
        h('tbody', {}, rows))),
    puzzles.length > 500 ? h('p', { class: 'below-note' }, `Viser 500 av ${fmt(puzzles.length)}.`) : null,
    h('p', { class: 'below-note' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); csv(); } }, 'Last ned som CSV')));
}

// ---------------------------------------------------------------------------
// Statistics

export function renderStats(ctx) {
  const s = summarize(ctx.profile.games);
  const dash = '–';
  const t = (sec) => (sec === null ? dash : formatTime(sec));

  const overview = h('table', { class: 'plain' },
    h('tbody', {},
      row('Løste brett', fmt(s.solved)),
      row('Ikke fullført', fmt(s.abandoned)),
      row('Fullføringsgrad', s.winRate === null ? dash : `${Math.round(s.winRate * 100)} %`),
      row('Samlet tid på løste brett', formatDuration(s.totalSeconds)),
      row('Dager på rad nå', fmt(s.streak.current)),
      row('Flest dager på rad', fmt(s.streak.longest)),
    ));

  const levels = LEVELS.filter((l) => s.byDifficulty[l]);
  const perLevel = levels.length
    ? h('div', { class: 'table-scroll' },
        h('table', { class: 'plain' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Nivå'), h('th', { class: 'n' }, 'Løst'), h('th', { class: 'n' }, 'Beste'),
            h('th', { class: 'n' }, 'Beste uten hint'), h('th', { class: 'n' }, 'Snitt'), h('th', { class: 'n' }, 'Median'), h('th', { class: 'n' }, 'Feil i snitt'))),
          h('tbody', {}, levels.map((l) => {
            const x = s.byDifficulty[l];
            return h('tr', {},
              h('td', {}, label(l)), h('td', { class: 'n' }, fmt(x.solved)), h('td', { class: 'n' }, t(x.best)),
              h('td', { class: 'n' }, t(x.bestClean)), h('td', { class: 'n' }, t(x.average)), h('td', { class: 'n' }, t(x.median)),
              h('td', { class: 'n' }, x.averageMistakes === null ? dash : x.averageMistakes.toFixed(1)));
          }))))
    : h('p', { class: 'empty-note' }, 'Ingen spill ennå.');

  const bars = DIFFICULTIES.filter((d) => s.byDifficulty[d]?.solved).map((d) => ({
    label: label(d),
    value: s.byDifficulty[d].solved,
    title: `${label(d)}: ${s.byDifficulty[d].solved} løste brett`,
  }));

  const recent = s.recent.slice(0, 25);
  const history = recent.length
    ? h('div', { class: 'table-scroll' },
        h('table', { class: 'plain' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Dato'), h('th', {}, 'Nivå'), h('th', { class: 'n' }, 'Tid'), h('th', { class: 'n' }, 'Feil'), h('th', { class: 'n' }, 'Hint'), h('th', {}, 'Status'), h('th', {}, ''))),
          h('tbody', {}, recent.map((g) =>
            h('tr', { class: g.status === 'solved' ? '' : 'muted' },
              h('td', {}, formatDate(g.finishedAt)), h('td', {}, label(g.difficulty)),
              h('td', { class: 'n' }, formatTime(g.seconds)), h('td', { class: 'n' }, String(g.mistakes ?? 0)), h('td', { class: 'n' }, String(g.hints ?? 0)),
              h('td', {}, g.status === 'solved' ? 'Løst' : 'Ikke fullført'),
              h('td', {}, h('a', { href: '#spill', onclick: (e) => {
                e.preventDefault();
                const known = ctx.library.find((p) => p.p === g.puzzle) || ctx.profile.puzzles.find((p) => p.puzzle === g.puzzle);
                const solution = known?.s || known?.solution;
                if (solution) ctx.play({ puzzle: g.puzzle, solution, difficulty: g.difficulty, puzzleId: g.puzzleId, source: g.source });
                else location.href = `?p=${g.puzzle}#spill`;
              } }, 'Spill igjen')))))))
    : h('p', { class: 'empty-note' }, 'Ingen spill ennå.');

  return h('div', {},
    h('div', { class: 'columns' },
      h('section', {}, h('h2', { class: 'section-title' }, 'Statistikk'), overview),
      h('section', {}, h('h2', { class: 'section-title' }, 'Løste brett per nivå'),
        bars.length ? barList(bars) : h('p', { class: 'empty-note' }, 'Ingen løste brett ennå.'))),
    h('section', { class: 'full' }, h('h2', { class: 'section-title' }, 'Per nivå'), h('div', { class: 'section-body' }, perLevel)),
    h('section', { class: 'full' }, h('h2', { class: 'section-title' }, 'Siste spill'), h('div', { class: 'section-body' }, history)));
}

function row(name, value) {
  return h('tr', {}, h('td', {}, name), h('td', { class: 'n' }, value));
}

// ---------------------------------------------------------------------------
// Settings

export function renderSettings(ctx) {
  const s = ctx.settings;
  const theme = h('select', { id: 'set-theme' },
    [['system', 'Følg systemet'], ['light', 'Lys'], ['dark', 'Mørk']].map(([v, t]) => h('option', { value: v, selected: s.theme === v }, t)));
  theme.addEventListener('change', () => ctx.updateSettings({ theme: theme.value }));

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

  const item = (id, title, help, control) =>
    h('li', {}, h('label', { for: id }, title, help ? h('span', { class: 'help' }, help) : null), control);

  return h('div', {},
    h('div', { class: 'columns' },
      h('section', {},
        h('h2', { class: 'section-title' }, 'Innstillinger'),
        h('ul', { class: 'settings-list' },
          item('set-theme', 'Tema', 'Mørk modus finnes ikke hos Adressa. Fargene er mine egne valg.', theme),
          item('set-size', 'Brettstørrelse', 'Største bredde. På mobil fyller brettet skjermen.', h('span', {}, size, ' ', sizeOut)),
          item('set-highlightSame', 'Marker like tall', 'Ruter med samme tall som valgt rute blir blågrå.', check('highlightSame')),
          item('set-showTimer', 'Vis tidtaker', 'Tiden måles uansett til statistikken.', check('showTimer')),
          item('set-autoRemoveNotes', 'Fjern notater automatisk', 'Når du skriver et tall, forsvinner det fra notatene i samme rad, kolonne og boks.', check('autoRemoveNotes')),
        )),
      h('section', {},
        h('h2', { class: 'section-title' }, 'Profil'),
        h('div', { class: 'section-body' },
          h('p', { class: 'below-note' }, 'Profilen har ikke passord. Alle som skriver inn ', h('strong', {}, ctx.name), ' på forsiden, kommer hit.'),
          h('p', { class: 'below-note' }, h('a', { href: '#', onclick: (e) => {
            e.preventDefault();
            download(`sudoku-${ctx.name}.json`, JSON.stringify(ctx.profile, null, 2), 'application/json');
          } }, 'Last ned alle data (JSON)')),
          h('p', { class: 'below-note' }, h('a', { href: '#', onclick: async (e) => {
            e.preventDefault();
            if (confirm(`Slette alt på «${ctx.name}»? Historikk, statistikk, importerte brett og innstillinger forsvinner. Det kan ikke angres.`)) await ctx.resetProfile();
          } }, `Slett alle data for ${ctx.name}`))))));
}
