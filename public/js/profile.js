// /<username>: loads the profile and shows the game full screen. A small icon
// opens the menu (new board, palette, brightness, a few switches, links to
// #importer and #statistikk). No native dialogs: confirm() and alert() would
// light up a dark room.

import { h, icons, normalizeUsername } from './dom.js';
import { api, mirrorProfile, mirroredProfile, queueGame, flushQueue, local } from './api.js';
import { BoardView } from './board-view.js';
import { renderImport, renderStats } from './pages.js';
import { validatePuzzle, grade, puzzleId, DIFFICULTIES, DIFFICULTY_LABELS } from './engine.js';
import { solvedPuzzles } from './stats.js';

/** Palettes. The colours live in style.css under [data-palette]. */
export const PALETTES = [
  ['natt', 'Svart'],
  ['rod', 'Rødt nattlys'],
  ['rav', 'Rav'],
  ['bla', 'Blå'],
  ['lys', 'Lys'],
];

export const DEFAULT_SETTINGS = {
  palette: 'natt',
  brightness: 1,
  highlightSame: true,
  autoRemoveNotes: true,
};

export function withDefaults(saved = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (typeof saved[k] === typeof def) out[k] = saved[k];
  }
  if (!PALETTES.some(([id]) => id === out.palette)) out.palette = DEFAULT_SETTINGS.palette;
  out.brightness = Math.min(1, Math.max(0.2, out.brightness));
  return out;
}

export function applySettings(s) {
  const root = document.documentElement;
  root.setAttribute('data-palette', s.palette);
  root.style.setProperty('--brightness', s.brightness);
  local.set('look', { palette: s.palette, brightness: s.brightness });
}

function emptyProfile(name) {
  const now = new Date().toISOString();
  return { version: 1, name, createdAt: now, updatedAt: now, settings: {}, current: null, games: [], puzzles: [] };
}

export async function renderProfile(app, rawName) {
  const name = normalizeUsername(rawName);
  if (!name) {
    location.replace('/');
    return;
  }
  document.title = `Sudoku · ${name}`;

  let profile;
  let offline = false;
  try {
    profile = await api.profile(name);
  } catch (err) {
    if (err.status === 404) profile = emptyProfile(name);
    else {
      profile = mirroredProfile(name) || emptyProfile(name);
      offline = true;
    }
  }
  if (!offline) profile.games.push(...(await flushQueue(name)));

  let library = [];
  try {
    library = (await api.library()).puzzles;
  } catch {
    // Without the library only imported and generated puzzles are available.
  }

  const ctx = { name, profile, library, offline, settings: withDefaults(profile.settings), message: '' };
  applySettings(ctx.settings);
  mirrorProfile(profile);

  // ---------------------------------------------------------------------------
  // Actions used by the views

  ctx.updateSettings = async (patch) => {
    ctx.settings = withDefaults({ ...ctx.settings, ...patch });
    profile.settings = ctx.settings;
    applySettings(ctx.settings);
    mirrorProfile(profile);
    board?.render();
    if (board?.game) board.game.options.autoRemoveNotes = ctx.settings.autoRemoveNotes;
    try {
      await api.saveSettings(name, ctx.settings);
    } catch {
      // kept locally
    }
  };

  ctx.saveCurrent = async (snapshot) => {
    profile.current = snapshot;
    mirrorProfile(profile);
    try {
      await api.saveCurrent(name, snapshot);
    } catch {
      // offline: the local mirror has it
    }
  };

  ctx.recordGame = async (game) => {
    const { puzzle, solution, status, seconds, mistakes, hints, difficulty, source, puzzleId: id, startedAt } = game;
    const body = { puzzle, solution, status, seconds, mistakes, hints, difficulty, source, puzzleId: id, startedAt };
    if (profile.current?.puzzle === puzzle) profile.current = null;
    try {
      profile.games.push(await api.recordGame(name, body));
    } catch {
      queueGame(name, body);
      profile.games.push({ ...body, finishedAt: new Date().toISOString() });
    }
    mirrorProfile(profile);
  };

  ctx.importPuzzles = async (text, collection) => {
    const result = await api.importPuzzles(name, text, collection);
    profile.puzzles.push(...result.added);
    mirrorProfile(profile);
    return result;
  };

  ctx.deletePuzzle = async (id) => {
    await api.deletePuzzle(name, id);
    profile.puzzles = profile.puzzles.filter((p) => p.id !== id);
    mirrorProfile(profile);
  };

  ctx.resetProfile = async () => {
    await api.deleteProfile(name);
    local.set(`profile:${name}`, null);
    local.set(`pending:${name}`, null);
    location.reload();
  };

  /** Starts a specific puzzle and switches to the game. */
  ctx.play = (entry) => {
    pendingStart = entry;
    if (location.hash && location.hash !== '#spill') location.hash = '#spill';
    else show();
  };

  // ---------------------------------------------------------------------------
  // Game

  let board = null;
  let pendingStart = null;
  let level = profile.current?.difficulty || local.get('level') || 'easy';

  const pick = (lvl) => {
    const solved = solvedPuzzles(profile.games);
    const pool = [
      ...library.map((p) => ({ puzzle: p.p, solution: p.s, difficulty: p.d, puzzleId: p.id, source: 'library' })),
      ...profile.puzzles.map((p) => ({ puzzle: p.puzzle, solution: p.solution, difficulty: p.difficulty, puzzleId: p.id, source: 'import' })),
    ].filter((p) => p.difficulty === lvl && p.puzzle !== profile.current?.puzzle);
    const fresh = pool.filter((p) => !solved.has(p.puzzle));
    const list = fresh.length ? fresh : pool;
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  };

  const generate = (lvl) =>
    new Promise((resolve, reject) => {
      const worker = new Worker('/js/generator-worker.js', { type: 'module' });
      worker.onmessage = (e) => {
        worker.terminate();
        if (e.data.error) reject(new Error(e.data.error));
        else resolve({ ...e.data.result, puzzleId: puzzleId(e.data.result.puzzle), source: 'generated' });
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage({ id: 1, difficulty: lvl });
    });

  const start = (entry) => {
    board.load({
      puzzleId: entry.puzzleId,
      source: entry.source,
      difficulty: entry.difficulty,
      puzzle: entry.puzzle,
      solution: entry.solution,
      values: entry.puzzle,
      notes: new Array(81).fill(0),
      elapsed: 0,
      mistakes: 0,
      hints: 0,
      startedAt: new Date().toISOString(),
    });
    ctx.saveCurrent(board.snapshot());
  };

  /** A started puzzle that is left counts as not finished in the statistics. */
  const leaveCurrent = async () => {
    if (!board?.hasProgress()) return;
    const snap = board.snapshot();
    await ctx.recordGame({ ...snap, status: 'abandoned', seconds: snap.elapsed });
  };

  const newGame = async (lvl) => {
    level = lvl;
    local.set('level', lvl);
    await leaveCurrent();
    let entry = pick(lvl);
    if (!entry) {
      try {
        entry = await generate(lvl);
      } catch {
        return;
      }
    }
    start(entry);
  };

  const mountGame = async () => {
    board = new BoardView({
      get settings() {
        return ctx.settings;
      },
      onSave: (snap) => ctx.saveCurrent(snap),
      onFinish: (game) => ctx.recordGame(game),
      onNext: (lvl) => newGame(lvl),
      onMenu: () => openMenu(),
    });
    main.replaceChildren(h('main', { class: 'game-page' }, board.root));

    if (pendingStart) {
      const entry = pendingStart;
      pendingStart = null;
      if (profile.current && profile.current.puzzle !== entry.puzzle) {
        board.load(profile.current);
        await leaveCurrent();
      }
      start(entry);
    } else if (profile.current) board.load(profile.current);
    else await newGame(level);
  };

  // A shared link: /<name>?p=<81 chars>
  const shared = new URLSearchParams(location.search).get('p');
  if (shared) {
    history.replaceState(null, '', location.pathname + location.hash);
    const v = validatePuzzle(shared);
    if (v.ok) {
      const d = grade(v.puzzle).difficulty;
      pendingStart = { puzzle: v.puzzle, solution: v.solution, difficulty: DIFFICULTIES.includes(d) ? d : 'unknown', puzzleId: puzzleId(v.puzzle), source: 'link' };
    } else ctx.message = `Ugyldig brett i lenken: ${v.error}`;
  }

  // ---------------------------------------------------------------------------
  // Menu: a sheet from the bottom, closed by tapping outside it.

  const backdrop = h('div', { class: 'backdrop', hidden: true, onclick: () => closeMenu() });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Meny', hidden: true });

  function openMenu() {
    board?.hold(true);
    const current = board?.game?.meta.difficulty;

    const levels = h('div', { class: 'levels', role: 'group', 'aria-label': 'Nytt brett' },
      DIFFICULTIES.map((d, k) =>
        h('button', {
          type: 'button',
          'aria-label': `Nytt brett, ${DIFFICULTY_LABELS[d].toLowerCase()}`,
          'aria-pressed': String(d === current),
          onclick: () => {
            closeMenu();
            newGame(d);
          },
        }, String(k + 1))));

    const swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Farger' },
      PALETTES.map(([id, label]) =>
        h('button', {
          type: 'button',
          class: 'swatch',
          'data-palette': id,
          'aria-label': label,
          'aria-pressed': String(ctx.settings.palette === id),
          onclick: (e) => {
            ctx.updateSettings({ palette: id });
            for (const b of swatches.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          },
        }, '5')));

    const bright = h('input', { type: 'range', min: 0.2, max: 1, step: 0.05, value: ctx.settings.brightness, 'aria-label': 'Lysstyrke' });
    bright.addEventListener('input', () => ctx.updateSettings({ brightness: Number(bright.value) }));

    const toggle = (key, text) => {
      const input = h('input', { type: 'checkbox' });
      input.checked = ctx.settings[key];
      input.addEventListener('change', () => ctx.updateSettings({ [key]: input.checked }));
      return h('label', { class: 'switch' }, input, h('span', {}, text));
    };

    const link = (href, text) => h('a', { href, onclick: () => closeMenu() }, text);

    sheet.replaceChildren(
      levels,
      swatches,
      h('div', { class: 'bright' }, icons.sun(), bright),
      toggle('highlightSame', 'marker like tall'),
      toggle('autoRemoveNotes', 'rydd notater'),
      h('nav', { class: 'links' },
        link('#importer', 'importer'),
        link('#statistikk', 'statistikk'),
        h('a', { href: '/' }, name)),
    );
    backdrop.hidden = false;
    sheet.hidden = false;
  }

  function closeMenu() {
    if (sheet.hidden) return;
    backdrop.hidden = true;
    sheet.hidden = true;
    board?.hold(false);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  // ---------------------------------------------------------------------------
  // Shell

  const main = h('div');
  app.replaceChildren(main, backdrop, sheet);

  function show() {
    closeMenu();
    const hash = location.hash.slice(1);
    const page = hash === 'importer' || hash === 'statistikk' ? hash : 'spill';
    if (page !== 'spill' && board) {
      board.destroy();
      board = null;
    }
    const notice = [];
    if (ctx.offline) notice.push(h('p', { class: 'notice' }, 'frakoblet · lagres lokalt'));
    if (ctx.message) {
      notice.push(h('p', { class: 'notice' }, ctx.message));
      ctx.message = '';
    }
    if (page === 'spill') {
      if (!board) mountGame();
      else if (pendingStart) {
        const entry = pendingStart;
        pendingStart = null;
        leaveCurrent().then(() => start(entry));
      }
      if (notice.length) {
        main.querySelector('.notice-wrap')?.remove();
        main.prepend(h('div', { class: 'notice-wrap' }, notice));
        setTimeout(() => main.querySelector('.notice-wrap')?.remove(), 4000);
      }
      return;
    }
    const content = page === 'importer' ? renderImport(ctx) : renderStats(ctx);
    main.replaceChildren(
      h('main', { class: 'page' },
        h('a', { class: 'back', href: '#spill', 'aria-label': 'Tilbake til brettet' }, icons.back()),
        notice,
        content));
  }

  window.addEventListener('hashchange', show);
  show();
}
