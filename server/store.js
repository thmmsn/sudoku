// File based profile storage: one JSON file per username in DATA_DIR/users.
//
// There are no passwords. Whoever knows a username can open and change that
// profile, exactly like the username calendar the app is modelled on.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const USERNAME = /^[a-z0-9æøå][a-z0-9æøå_-]{1,29}$/;

export const RESERVED = new Set([
  'api', 'js', 'css', 'img', 'assets', 'static', 'public', 'admin', 'index.html',
  'favicon.ico', 'favicon.svg', 'robots.txt', 'manifest.webmanifest', 'sw.js',
]);

export function normalizeUsername(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().toLowerCase();
  if (!USERNAME.test(name) || RESERVED.has(name)) return null;
  return name;
}

export const LIMITS = {
  games: 5000,
  puzzles: 5000,
  settingsBytes: 16 * 1024,
};

export function emptyProfile(name) {
  const now = new Date().toISOString();
  return { version: 1, name, createdAt: now, updatedAt: now, settings: {}, current: null, games: [], puzzles: [] };
}

export function summarize(profile) {
  const solved = profile.games.filter((g) => g.status === 'solved');
  return {
    name: profile.name,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    solved: solved.length,
    played: profile.games.length,
    seconds: solved.reduce((s, g) => s + (g.seconds || 0), 0),
    imported: profile.puzzles.length,
  };
}

export class Store {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'users');
    fs.mkdirSync(this.dir, { recursive: true });
    this.cache = new Map(); // name -> profile
    this.queues = new Map(); // name -> promise chain, serializes writes
    this.summaries = new Map();
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const profile = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'));
        this.cache.set(profile.name, profile);
        this.summaries.set(profile.name, summarize(profile));
      } catch (err) {
        console.error(`Kunne ikke lese ${f}:`, err.message);
      }
    }
  }

  file(name) {
    // name is validated by normalizeUsername, so it cannot contain path separators.
    return path.join(this.dir, `${encodeURIComponent(name)}.json`);
  }

  get(name) {
    return this.cache.get(name) || null;
  }

  /** Runs `fn(profile)` and persists the result. Creates the profile if needed. */
  update(name, fn) {
    const prev = this.queues.get(name) || Promise.resolve();
    const next = prev.then(async () => {
      const profile = structuredClone(this.cache.get(name) || emptyProfile(name));
      const result = await fn(profile);
      profile.updatedAt = new Date().toISOString();
      const tmp = `${this.file(name)}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(profile));
      await fsp.rename(tmp, this.file(name));
      this.cache.set(name, profile);
      this.summaries.set(name, summarize(profile));
      return { profile, result };
    });
    this.queues.set(name, next.catch(() => {}));
    return next;
  }

  async remove(name) {
    const prev = this.queues.get(name) || Promise.resolve();
    const next = prev.then(async () => {
      await fsp.rm(this.file(name), { force: true });
      this.cache.delete(name);
      this.summaries.delete(name);
    });
    this.queues.set(name, next.catch(() => {}));
    return next;
  }

  overview() {
    const all = [...this.summaries.values()];
    const byUpdated = [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const bySolved = all.filter((s) => s.solved > 0).sort((a, b) => b.solved - a.solved || a.seconds - b.seconds);
    return {
      players: all.length,
      solved: all.reduce((s, x) => s + x.solved, 0),
      seconds: all.reduce((s, x) => s + x.seconds, 0),
      recent: byUpdated.slice(0, 8).map(({ name, solved, updatedAt }) => ({ name, solved, updatedAt })),
      top: bySolved.slice(0, 8).map(({ name, solved, seconds }) => ({ name, solved, seconds })),
    };
  }
}
