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
  puzzles: 500, // imported puzzles per profile, about 150 kB
  settingsBytes: 16 * 1024,
};

/**
 * A solve time counts for the public best times only if it is at least half
 * a second per empty cell. Times come from the browser and cannot be proven;
 * this only filters out the obviously impossible ones.
 */
export function plausibleTime(game) {
  return game.seconds >= Math.ceil((81 - (game.givens || 0)) / 2);
}

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
    this.bytes = new Map(); // name -> file size, for the disk budget
    this.totalBytes = 0;
    this.bestCache = null;
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const text = fs.readFileSync(path.join(this.dir, f), 'utf8');
        const profile = JSON.parse(text);
        this.cache.set(profile.name, profile);
        this.setBytes(profile.name, Buffer.byteLength(text));
        this.summaries.set(profile.name, summarize(profile));
      } catch (err) {
        console.error(`Kunne ikke lese ${f}:`, err.message);
      }
    }
  }

  setBytes(name, n) {
    this.totalBytes += n - (this.bytes.get(name) || 0);
    if (n) this.bytes.set(name, n);
    else this.bytes.delete(name);
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
      const json = JSON.stringify(profile);
      await fsp.writeFile(tmp, json);
      await fsp.rename(tmp, this.file(name));
      this.cache.set(name, profile);
      this.summaries.set(name, summarize(profile));
      this.setBytes(name, Buffer.byteLength(json));
      this.bestCache = null;
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
      this.setBytes(name, 0);
      this.bestCache = null;
    });
    this.queues.set(name, next.catch(() => {}));
    return next;
  }

  /**
   * Public best times: per level, each player's best solve of a library
   * puzzle without hints, top `n` players. Cached until the next write.
   */
  best(n = 5) {
    if (this.bestCache) return this.bestCache;
    const perLevel = {};
    for (const profile of this.cache.values()) {
      const mine = {};
      for (const g of profile.games) {
        if (g.status !== 'solved' || g.source !== 'library' || g.hints || !plausibleTime(g)) continue;
        if (!(g.difficulty in mine) || g.seconds < mine[g.difficulty]) mine[g.difficulty] = g.seconds;
      }
      for (const [level, seconds] of Object.entries(mine)) (perLevel[level] ||= []).push({ name: profile.name, seconds });
    }
    for (const level of Object.keys(perLevel)) {
      perLevel[level] = perLevel[level].sort((a, b) => a.seconds - b.seconds || a.name.localeCompare(b.name)).slice(0, n);
    }
    this.bestCache = perLevel;
    return perLevel;
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
