// Import and statistics, reached from the menu. Kept short: little text,
// no native dialogs (deleting asks for a second tap instead).

import { h, fmt, formatTime, formatDuration, formatDate, download } from './dom.js';
import { DIFFICULTY_LABELS, parseImport } from './engine.js';
import { summarize, solvedPuzzles, LEVELS } from './stats.js';
import { entryEditor } from './entry.js';

const label = (d) => (DIFFICULTY_LABELS[d] || DIFFICULTY_LABELS.unknown).toLowerCase();
const dash = '–';

export const action = (text, fn) =>
  h('button', { type: 'button', class: 'link', onclick: fn }, text);

/** A button that runs fn on the second tap within 3 s. */
export function twoTap(text, fn) {
  let armed = null;
  const b = action(text, async () => {
    if (!armed) {
      b.textContent = 'sikker?';
      b.classList.add('armed');
      armed = setTimeout(() => {
        armed = null;
        b.textContent = text;
        b.classList.remove('armed');
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    await fn();
  });
  return b;
}

// ---------------------------------------------------------------------------
// Import

export function renderImport(ctx) {
  const textarea = h('textarea', {
    'aria-label': 'Brett',
    spellcheck: 'false',
    autocapitalize: 'none',
    autocomplete: 'off',
    placeholder: '.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..',
  });
  const file = h('input', { type: 'file', accept: '.csv,.txt,.json,.jsonl', multiple: true, class: 'visually-hidden', id: 'import-file' });
  const status = h('p', { class: 'status', role: 'status' });
  const button = h('button', { class: 'btn', type: 'submit' }, 'importer');

  let timer;
  textarea.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const { entries, errors } = parseImport(textarea.value);
      status.textContent = textarea.value.trim() ? `${fmt(entries.length)} brett${errors.length ? ` · ${fmt(errors.length)} ugyldige linjer` : ''}` : '';
    }, 250);
  });

  let collection = '';
  file.addEventListener('change', async () => {
    const texts = await Promise.all([...file.files].map((f) => f.text()));
    textarea.value = [textarea.value.trim(), ...texts].filter(Boolean).join('\n');
    if (file.files.length === 1) collection = file.files[0].name.replace(/\.[^.]+$/, '');
    textarea.dispatchEvent(new Event('input'));
    file.value = '';
  });

  const list = h('div');
  const renderList = () => list.replaceChildren(...[puzzleList(ctx, renderList)].filter(Boolean));
  renderList();

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (!textarea.value.trim()) return;
      clearTimeout(timer); // the live count must not overwrite the result
      button.disabled = true;
      try {
        const r = await ctx.importPuzzles(textarea.value, collection || 'importert');
        const parts = [`${fmt(r.added.length)} lagt til`];
        if (r.duplicates) parts.push(`${fmt(r.duplicates)} fantes`);
        if (r.invalid.length) parts.push(`${fmt(r.invalid.length)} avvist`);
        status.replaceChildren(parts.join(' · '));
        if (r.invalid.length) status.append(h('ul', { class: 'errors' }, r.invalid.slice(0, 30).map((x) => h('li', {}, `${x.line}: ${x.error}`))));
        if (r.added.length) {
          textarea.value = '';
          collection = '';
        }
        renderList();
      } catch (err) {
        status.textContent = err.message;
      } finally {
        button.disabled = false;
      }
    },
  },
  textarea,
  h('div', { class: 'row' }, h('label', { class: 'btn quiet', for: 'import-file' }, 'fil'), file, button),
  status);

  // Typing a puzzle in comes first; pasting text or picking files is folded
  // away under a link.
  const editor = entryEditor({
    draftKey: `draft:${ctx.name}`,
    onSave: async (puzzle) => {
      const r = await ctx.importPuzzles(puzzle, 'skrevet inn');
      const p = r.added[0] || ctx.profile.puzzles.find((x) => x.puzzle === puzzle);
      if (!p) throw new Error(r.invalid[0]?.error || 'Kunne ikke lagre brettet.');
      ctx.play({ puzzle: p.puzzle, solution: ctx.solutionOf(p), difficulty: p.difficulty, puzzleId: p.id, source: 'import' });
    },
  });
  const pasteBox = h('div', { hidden: true },
    form,
    h('p', { class: 'hint' }, '81 tegn per brett, . eller 0 for tom rute. Også brett,løsning, CSV og JSON. Hvert brett må ha én løsning.'));
  const toggle = action('lim inn tekst eller fil', () => {
    pasteBox.hidden = !pasteBox.hidden;
    toggle.hidden = true;
  });

  return h('div', {},
    h('h1', {}, 'nytt brett'),
    editor,
    h('p', {}, toggle),
    pasteBox,
    list);
}

function puzzleList(ctx, rerender) {
  const puzzles = ctx.profile.puzzles;
  if (!puzzles.length) return null;
  const solved = solvedPuzzles(ctx.profile.games);
  const csv = () =>
    download(
      `sudoku-${ctx.name}.csv`,
      ['puzzle,solution,difficulty,id', ...puzzles.map((p) => `${p.puzzle},${ctx.solutionOf(p)},${p.difficulty},${p.id}`)].join('\n') + '\n',
      'text/csv',
    );
  return h('div', {},
    h('h2', {}, `mine brett · ${fmt(puzzles.length)}`),
    h('table', {},
      h('tbody', {}, puzzles.slice(0, 300).map((p) =>
        h('tr', {},
          h('td', {}, label(p.difficulty)),
          h('td', { class: 'dim' }, p.collection || ''),
          h('td', {}, solved.has(p.puzzle) ? '✓' : ''),
          h('td', { class: 'n' },
            action('spill', () => ctx.play({ puzzle: p.puzzle, solution: ctx.solutionOf(p), difficulty: p.difficulty, puzzleId: p.id, source: 'import' })),
            twoTap('slett', async () => {
              await ctx.deletePuzzle(p.id);
              rerender();
            })))))),
    h('p', {}, action('last ned csv', csv)));
}

// ---------------------------------------------------------------------------
// Statistics

export function renderStats(ctx) {
  const s = summarize(ctx.profile.games);
  const t = (sec) => (sec === null ? dash : formatTime(sec));
  const levels = LEVELS.filter((l) => s.byDifficulty[l]?.solved);

  const replay = (g) => {
    const known = ctx.library.find((p) => p.p === g.puzzle) || ctx.profile.puzzles.find((p) => p.puzzle === g.puzzle);
    const solution = known?.s || (known && ctx.solutionOf(known));
    if (solution) ctx.play({ puzzle: g.puzzle, solution, difficulty: g.difficulty, puzzleId: g.puzzleId, source: g.source });
    else location.href = `?p=${g.puzzle}#spill`;
  };

  return h('div', {},
    h('h1', {}, 'statistikk'),
    h('dl', { class: 'figures' },
      h('div', {}, h('dt', {}, 'løst'), h('dd', {}, fmt(s.solved))),
      h('div', {}, h('dt', {}, 'på rad'), h('dd', {}, fmt(s.streak.current))),
      h('div', {}, h('dt', {}, 'tid'), h('dd', {}, formatDuration(s.totalSeconds)))),
    levels.length
      ? h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', { class: 'n' }, 'løst'), h('th', { class: 'n' }, 'beste'), h('th', { class: 'n' }, 'snitt'))),
          h('tbody', {}, levels.map((l) => {
            const x = s.byDifficulty[l];
            return h('tr', {}, h('td', {}, label(l)), h('td', { class: 'n' }, fmt(x.solved)), h('td', { class: 'n' }, t(x.best)), h('td', { class: 'n' }, t(x.average)));
          })))
      : null,
    s.recent.length
      ? [
          h('h2', {}, 'siste'),
          h('table', {},
            h('tbody', {}, s.recent.slice(0, 15).map((g) =>
              h('tr', { class: g.status === 'solved' ? undefined : 'dim' },
                h('td', {}, formatDate(g.finishedAt)),
                h('td', {}, label(g.difficulty)),
                h('td', { class: 'n' }, g.status === 'solved' ? formatTime(g.seconds) : dash),
                h('td', { class: 'n' }, action('spill', () => replay(g))))))),
        ]
      : null,
    h('h2', {}, ctx.name),
    h('p', { class: 'row' },
      action('last ned data', () => download(`sudoku-${ctx.name}.json`, JSON.stringify(ctx.profile, null, 2), 'application/json')),
      twoTap('slett profilen', () => ctx.resetProfile())));
}
