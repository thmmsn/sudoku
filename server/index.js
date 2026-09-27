// sudoku.eipi.dev - zero dependency Node server.
//
//   GET    /                          landing page (pick a username)
//   GET    /<username>                the game for that profile
//   GET    /api/library               built-in puzzles from /puzzles
//   GET    /api/overview              global stats and public best times
//   GET    /api/check/<username>      { valid, exists, summary }
//   GET    /api/users/<username>      full profile (404 if it does not exist)
//   PUT    /api/users/<username>/settings
//   PUT    /api/users/<username>/current
//   POST   /api/users/<username>/games
//   POST   /api/users/<username>/puzzles         import { text, collection }
//   DELETE /api/users/<username>/puzzles/<id>
//   DELETE /api/users/<username>              wipe the profile ("take it over")

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from './library.js';
import { Store, normalizeUsername, summarize, LIMITS } from './store.js';
import { parseImport, validatePuzzle, grade, puzzleId, normalizeGrid, DIFFICULTIES } from '../public/js/engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000; // 0 = any free port
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PUZZLE_DIR = path.resolve(process.env.PUZZLE_DIR || path.join(ROOT, 'puzzles'));
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY = 2 * 1024 * 1024;

// Flood protection. No accounts, so the limits are per IP address and for the
// data folder as a whole. Behind a reverse proxy, set TRUST_PROXY=1 so the
// address is read from X-Forwarded-For.
const DATA_MAX_BYTES = Number(process.env.DATA_MAX_BYTES) || 1024 ** 3; // 1 GB
const RATE_NEW_PROFILES = Number(process.env.RATE_NEW_PROFILES) || 20; // per IP per hour
const RATE_IMPORTS = Number(process.env.RATE_IMPORTS) || 30; // per IP per hour
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const SOURCES = new Set(['library', 'import', 'generated', 'link']);
const LEVELS = new Set([...DIFFICULTIES, 'unknown']);

// ---------------------------------------------------------------------------
// Startup

const started = Date.now();
const library = loadLibrary(PUZZLE_DIR);
const libraryIds = new Map(library.puzzles.map((p) => [p.puzzle, p.id]));
const libraryJson = JSON.stringify({
  puzzles: library.puzzles.map((p) => ({ id: p.id, p: p.puzzle, s: p.solution, d: p.difficulty, g: p.grade, n: p.givens, f: p.source })),
});
const libraryGzip = zlib.gzipSync(libraryJson);
const libraryEtag = `"${crypto.createHash('sha1').update(libraryJson).digest('hex').slice(0, 16)}"`;
console.log(`Bibliotek: ${library.puzzles.length} brett fra ${library.report.length} filer (${Date.now() - started} ms)`);
for (const r of library.report) console.log('  ', r);

const store = new Store(DATA_DIR);
console.log(`Profiler: ${store.cache.size} i ${DATA_DIR}`);

// ---------------------------------------------------------------------------
// Helpers

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(req, res, status, body, headers = {}) {
  const json = typeof body === 'string' ? body : JSON.stringify(body);
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers };
  if (json.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(status, { ...h, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    res.end(zlib.gzipSync(json));
  } else {
    res.writeHead(status, h);
    res.end(json);
  }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'For stor forespørsel (maks 2 MB).');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Ugyldig JSON.');
  }
}

const int = (v, min, max, def = 0) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString());

function isCompleteGrid(s) {
  return typeof s === 'string' && /^[1-9]{81}$/.test(s);
}

/** A solution must be complete, obey the rules and agree with the givens. */
function checkSolution(puzzle, solution) {
  if (!isCompleteGrid(solution)) return false;
  for (let i = 0; i < 81; i++) if (puzzle[i] !== '.' && puzzle[i] !== solution[i]) return false;
  for (let u = 0; u < 9; u++) {
    const r = new Set();
    const c = new Set();
    const b = new Set();
    for (let k = 0; k < 9; k++) {
      r.add(solution[u * 9 + k]);
      c.add(solution[k * 9 + u]);
      b.add(solution[(Math.floor(u / 3) * 3 + Math.floor(k / 3)) * 9 + (u % 3) * 3 + (k % 3)]);
    }
    if (r.size !== 9 || c.size !== 9 || b.size !== 9) return false;
  }
  return true;
}

function sanitizeSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Innstillinger må være et objekt.');
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (!/^[a-zA-Z][\w]{0,40}$/.test(k)) continue;
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 100);
  }
  if (JSON.stringify(out).length > LIMITS.settingsBytes) throw new HttpError(413, 'For mange innstillinger.');
  return out;
}

function sanitizeCurrent(body) {
  if (body === null) return null;
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Ugyldig spilltilstand.');
  const puzzle = normalizeGrid(body.puzzle);
  if (!puzzle) throw new HttpError(400, 'Ugyldig brett.');
  if (!checkSolution(puzzle, body.solution)) throw new HttpError(400, 'Løsningen passer ikke til brettet.');
  const values = typeof body.values === 'string' && /^[1-9.]{81}$/.test(body.values) ? body.values : puzzle;
  for (let i = 0; i < 81; i++) {
    if (puzzle[i] !== '.' && values[i] !== puzzle[i]) throw new HttpError(400, 'Gitte tall kan ikke endres.');
  }
  const notes = Array.isArray(body.notes) && body.notes.length === 81 ? body.notes.map((n) => int(n, 0, 511)) : new Array(81).fill(0);
  return {
    puzzleId: str(body.puzzleId, 40) || puzzleId(puzzle),
    source: SOURCES.has(body.source) ? body.source : 'link',
    difficulty: LEVELS.has(body.difficulty) ? body.difficulty : 'unknown',
    puzzle,
    solution: body.solution,
    values,
    notes,
    elapsed: int(body.elapsed, 0, 10 * 24 * 3600),
    mistakes: int(body.mistakes, 0, 10000),
    hints: int(body.hints, 0, 81),
    startedAt: iso(body.startedAt),
    savedAt: int(body.savedAt, 0, 8.64e15, Date.now()), // the browser's clock; newest copy wins
  };
}

function sanitizeGame(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Ugyldig spill.');
  const puzzle = normalizeGrid(body.puzzle);
  if (!puzzle) throw new HttpError(400, 'Ugyldig brett.');
  const status = body.status === 'solved' ? 'solved' : 'abandoned';
  if (status === 'solved' && !checkSolution(puzzle, body.solution)) throw new HttpError(400, 'Løsningen er ikke gyldig.');
  return {
    id: crypto.randomUUID().slice(0, 8),
    puzzleId: str(body.puzzleId, 40) || puzzleId(puzzle),
    source: SOURCES.has(body.source) ? body.source : 'link',
    difficulty: LEVELS.has(body.difficulty) ? body.difficulty : 'unknown',
    puzzle,
    givens: puzzle.replace(/\./g, '').length,
    status,
    seconds: int(body.seconds, 0, 10 * 24 * 3600),
    mistakes: int(body.mistakes, 0, 10000),
    hints: int(body.hints, 0, 81),
    startedAt: iso(body.startedAt),
    finishedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Rate limits and disk budget

class RateLimit {
  constructor(limit, windowMs = 3600 * 1000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map(); // key -> timestamps
  }

  /** Records a hit; false if the key is over its limit. */
  take(key) {
    const now = Date.now();
    const recent = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10000) {
      for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    }
    return true;
  }
}

const newProfileLimit = new RateLimit(RATE_NEW_PROFILES);
const importLimit = new RateLimit(RATE_IMPORTS);

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '?';
}

function checkBudget() {
  if (store.totalBytes >= DATA_MAX_BYTES) throw new HttpError(507, 'Serveren er full. Prøv igjen senere.');
}

// ---------------------------------------------------------------------------
// API

async function api(req, res, parts) {
  const [resource, rawName, sub, subId] = parts;

  if (req.method === 'GET' && resource === 'library' && !rawName) {
    if (req.headers['if-none-match'] === libraryEtag) {
      res.writeHead(304, { ETag: libraryEtag });
      return res.end();
    }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      ETag: libraryEtag,
      Vary: 'Accept-Encoding',
      ...(gz ? { 'Content-Encoding': 'gzip' } : {}),
    });
    return res.end(gz ? libraryGzip : libraryJson);
  }

  if (req.method === 'GET' && resource === 'overview' && !rawName) {
    return send(req, res, 200, { ...store.overview(), best: store.best(), library: library.puzzles.length });
  }

  const name = normalizeUsername(decodeURIComponent(rawName || ''));

  if (req.method === 'GET' && resource === 'check') {
    if (!name) return send(req, res, 200, { valid: false, exists: false });
    const profile = store.get(name);
    return send(req, res, 200, { valid: true, name, exists: !!profile, summary: profile ? summarize(profile) : null });
  }

  if (resource !== 'users') throw new HttpError(404, 'Ukjent API-rute.');
  if (!name) throw new HttpError(400, 'Ugyldig brukernavn. Bruk 2-30 tegn: a-z, 0-9, æøå, - og _.');

  // Any write to a name that does not exist yet creates the profile.
  if ((req.method === 'PUT' || req.method === 'POST') && !store.get(name)) {
    checkBudget();
    if (!newProfileLimit.take(clientIp(req))) throw new HttpError(429, 'For mange nye profiler fra denne adressen. Prøv igjen om en time.');
  }

  if (!sub) {
    if (req.method === 'GET') {
      const profile = store.get(name);
      if (!profile) throw new HttpError(404, 'Profilen finnes ikke ennå.');
      return send(req, res, 200, profile);
    }
    if (req.method === 'PUT') {
      const { profile } = await store.update(name, () => {});
      return send(req, res, 200, profile);
    }
    if (req.method === 'DELETE') {
      await store.remove(name);
      return send(req, res, 200, { ok: true });
    }
  }

  if (sub === 'settings' && req.method === 'PUT') {
    const settings = sanitizeSettings(await readJson(req));
    await store.update(name, (p) => {
      p.settings = settings;
    });
    return send(req, res, 200, { ok: true });
  }

  if (sub === 'current' && req.method === 'PUT') {
    const current = sanitizeCurrent(await readJson(req));
    await store.update(name, (p) => {
      p.current = current;
    });
    return send(req, res, 200, { ok: true });
  }

  if (sub === 'games' && req.method === 'POST') {
    const game = sanitizeGame(await readJson(req));
    await store.update(name, (p) => {
      p.games.push(game);
      if (p.games.length > LIMITS.games) p.games.splice(0, p.games.length - LIMITS.games);
      if (p.current && p.current.puzzle === game.puzzle) p.current = null;
    });
    return send(req, res, 200, game);
  }

  if (sub === 'puzzles' && req.method === 'POST' && !subId) {
    checkBudget();
    if (!importLimit.take(clientIp(req))) throw new HttpError(429, 'For mange importer fra denne adressen. Prøv igjen om en time.');
    const body = await readJson(req);
    if (typeof body.text !== 'string') throw new HttpError(400, 'Mangler "text".');
    const collection = str(body.collection, 60)?.trim() || 'Importert';
    const { entries, errors } = parseImport(body.text);
    if (entries.length > 2000) throw new HttpError(413, 'Maks 2000 brett per import.');

    const { result } = await store.update(name, (p) => {
      const existing = new Set(p.puzzles.map((x) => x.puzzle));
      const added = [];
      const invalid = errors.map((e) => ({ line: e.line, error: e.message }));
      let duplicates = 0;
      for (const e of entries) {
        const v = validatePuzzle(e.puzzle, e.solution);
        if (!v.ok) {
          invalid.push({ line: e.line, error: v.error });
          continue;
        }
        if (existing.has(v.puzzle)) {
          duplicates++;
          continue;
        }
        if (p.puzzles.length >= LIMITS.puzzles) {
          invalid.push({ line: e.line, error: `Maks ${LIMITS.puzzles} importerte brett per profil.` });
          continue;
        }
        existing.add(v.puzzle);
        const g = grade(v.puzzle);
        // The solution is not stored: the solver finds it in milliseconds,
        // and leaving it out halves the size of every imported puzzle.
        const item = {
          id: puzzleId(v.puzzle),
          puzzle: v.puzzle,
          difficulty: DIFFICULTIES.includes(e.difficulty) ? e.difficulty : g.difficulty,
          grade: g.difficulty,
          givens: v.givens,
          name: str(e.name, 60),
          collection,
          inLibrary: libraryIds.has(v.puzzle),
          addedAt: new Date().toISOString(),
        };
        p.puzzles.push(item);
        added.push({ ...item, solution: v.solution });
      }
      return { added, duplicates, invalid, total: entries.length };
    });
    return send(req, res, 200, result);
  }

  if (sub === 'puzzles' && req.method === 'DELETE') {
    const ids = subId ? [subId] : [];
    const collection = new URL(req.url, 'http://x').searchParams.get('collection');
    await store.update(name, (p) => {
      p.puzzles = p.puzzles.filter((x) => !ids.includes(x.id) && (collection === null || x.collection !== collection));
    });
    return send(req, res, 200, { ok: true });
  }

  throw new HttpError(405, 'Metoden støttes ikke her.');
}

// ---------------------------------------------------------------------------
// Static files

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

function serveFile(req, res, file, status = 200) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Ikke funnet');
    }
    const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag, ...SECURITY_HEADERS };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);

  try {
    if (segments[0] === 'api') return await api(req, res, segments.slice(1));

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metoden støttes ikke.');

    // "/" and "/<username>" both load the app shell; the client decides what to show.
    if (segments.length === 0) return serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
    if (segments.length === 1 && !segments[0].includes('.')) {
      const name = normalizeUsername(decodeURIComponent(segments[0]));
      if (name) {
        if (decodeURIComponent(segments[0]) !== name) {
          res.writeHead(301, { Location: `/${encodeURIComponent(name)}${url.search}` });
          return res.end();
        }
        return serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
      }
    }

    const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Nei.');
    return serveFile(req, res, file);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(req, res, status, { error: status === 500 ? 'Noe gikk galt på serveren.' : err.message });
  }
});

server.listen(PORT, HOST, () => console.log(`Lytter på http://${HOST}:${server.address().port}`));
