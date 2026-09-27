// /<username>: loads the profile and switches between the game and the pages
// (#importer, #statistikk, #innstillinger).

import { h, normalizeUsername } from './dom.js';
import { api, mirrorProfile, mirroredProfile, queueGame, flushQueue, local } from './api.js';
import { BoardView } from './board-view.js';
import { renderImport, renderStats, renderSettings } from './pages.js';
import { validatePuzzle, grade, puzzleId, DIFFICULTIES } from './engine.js';
import { solvedPuzzles } from './stats.js';

export const DEFAULT_SETTINGS = {
  theme: 'system',
  boardMax: 540,
  highlightSame: true,
  showTimer: true,
  autoRemoveNotes: true,
};

export function withDefaults(saved = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (typeof saved[k] === typeof def) out[k] = saved[k];
  }
  if (!['system', 'light', 'dark'].includes(out.theme)) out.theme = 'system';
  out.boardMax = Math.min(760, Math.max(320, out.boardMax));
  return out;
}

export function applySettings(s) {
  const root = document.documentElement;
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
  root.style.setProperty('--board-max', `${s.boardMax}px`);
  local.set('theme', s.theme);
}

const PAGES = [
  ['spill', 'Spill'],
  ['importer', 'Importer'],
  ['statistikk', 'Statistikk'],
  ['innstillinger', 'Innstillinger'],
];

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
  document.title = `Sudoku – ${name}`;
  app.replaceChildren(h('main', { class: 'page' }, h('p', { class: 'muted' }, 'Henter profilen …')));

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
    // Without the library only imported puzzles and generated ones are available.
  }

  const ctx = {
    name,
    profile,
    library,
    offline,
    settings: withDefaults(profile.settings),
    message: '',
  };
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
    try {
      await api.saveSettings(name, ctx.settings);
    } catch {
      // kept locally; sent with the next successful save
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

  /** Solve times on a level, fastest first (the result modal shows 4). */
  ctx.bestTimes = (level) =>
    profile.games
      .filter((g) => g.status === 'solved' && g.difficulty === level)
      .map((g) => g.seconds)
      .sort((a, b) => a - b);

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
  ctx.play = async (entry) => {
    pendingStart = entry;
    if (location.hash && location.hash !== '#spill') location.hash = '#spill';
    else show();
  };

  // ---------------------------------------------------------------------------
  // Game

  let board = null;
  let pendingStart = null;

  const pick = (level) => {
    const solved = solvedPuzzles(profile.games);
    const pool = [
      ...library.map((p) => ({ puzzle: p.p, solution: p.s, difficulty: p.d, puzzleId: p.id, source: 'library' })),
      ...profile.puzzles.map((p) => ({ puzzle: p.puzzle, solution: p.solution, difficulty: p.difficulty, puzzleId: p.id, source: 'import' })),
    ].filter((p) => p.difficulty === level && p.puzzle !== profile.current?.puzzle);
    const fresh = pool.filter((p) => !solved.has(p.puzzle));
    const list = fresh.length ? fresh : pool;
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  };

  const generate = (level) =>
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
      worker.postMessage({ id: 1, difficulty: level });
    });

  const start = (entry) => {
    const current = {
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
    };
    board.load(current);
    ctx.saveCurrent(board.snapshot());
  };

  /** Leaving a started puzzle counts it as not finished. */
  const leaveCurrent = async () => {
    if (!board?.hasProgress()) return true;
    if (!confirm('Starte et nytt brett? Brettet du holder på med, lagres som ikke fullført.')) return false;
    const snap = board.snapshot();
    await ctx.recordGame({ ...snap, status: 'abandoned', seconds: snap.elapsed });
    return true;
  };

  const newGame = async (level) => {
    if (!(await leaveCurrent())) return;
    let entry = pick(level);
    if (!entry) {
      try {
        entry = await generate(level);
      } catch {
        alert('Kunne ikke lage et brett på dette nivået.');
        return;
      }
    }
    start(entry);
  };

  const mountGame = async () => {
    board = new BoardView({
      get settings() {
        return ctx.settings; // always the latest, so settings changes apply live
      },
      onSave: (snap) => ctx.saveCurrent(snap),
      onFinish: (game) => ctx.recordGame(game),
      onLevel: (level) => newGame(level),
      bestTimes: (level) => ctx.bestTimes(level),
    });

    const wrap = h('main', { class: 'game-page' }, board.root);
    main.replaceChildren(wrap);

    if (pendingStart) {
      const entry = pendingStart;
      pendingStart = null;
      if (profile.current && profile.current.puzzle !== entry.puzzle) {
        board.load(profile.current, { resume: true });
        if (!(await leaveCurrent())) return;
      }
      start(entry);
    } else if (profile.current) board.load(profile.current, { resume: true });
    else await newGame('easy');
  };

  // A shared link: /<name>?p=<81 chars>
  const shared = new URLSearchParams(location.search).get('p');
  if (shared) {
    history.replaceState(null, '', location.pathname + location.hash);
    const v = validatePuzzle(shared);
    if (v.ok) {
      const d = grade(v.puzzle).difficulty;
      pendingStart = { puzzle: v.puzzle, solution: v.solution, difficulty: DIFFICULTIES.includes(d) ? d : 'unknown', puzzleId: puzzleId(v.puzzle), source: 'link' };
    } else ctx.message = `Lenken inneholdt ikke et gyldig brett: ${v.error}`;
  }

  // ---------------------------------------------------------------------------
  // Shell

  const nav = h('nav', { class: 'seg', 'aria-label': 'Sider' });
  const main = h('div');
  const head = h(
    'header',
    { class: 'app-head' },
    h('h1', { class: 'title' }, h('a', { href: '/', title: 'Til forsiden' }, 'Sudoku'), h('span', { class: 'who' }, ` · ${name}`)),
    nav,
  );
  app.replaceChildren(head, main);

  function show() {
    const page = PAGES.some(([k]) => `#${k}` === location.hash) ? location.hash.slice(1) : 'spill';
    nav.replaceChildren(
      ...PAGES.map(([k, label]) => h('a', { href: `#${k}`, 'aria-current': k === page ? 'page' : undefined }, label)),
      h('a', { href: '/' }, 'Bytt profil'),
    );
    if (page !== 'spill' && board) {
      board.destroy();
      board = null;
    }
    const notice = [];
    if (ctx.offline) notice.push(h('p', { class: 'msg error' }, 'Får ikke kontakt med serveren. Du ser den lokale kopien, og endringer sendes når forbindelsen er tilbake.'));
    if (ctx.message) {
      notice.push(h('p', { class: 'msg error' }, ctx.message));
      ctx.message = '';
    }
    if (page === 'spill') {
      if (!board) mountGame();
      else if (pendingStart) {
        const entry = pendingStart;
        pendingStart = null;
        leaveCurrent().then((ok) => ok && start(entry));
      }
      if (notice.length) main.prepend(h('div', { class: 'page notice' }, notice));
      return;
    }
    const content = page === 'importer' ? renderImport(ctx) : page === 'statistikk' ? renderStats(ctx) : renderSettings(ctx);
    main.replaceChildren(h('main', { class: 'page' }, notice, content));
  }

  window.addEventListener('hashchange', show);
  show();
}
