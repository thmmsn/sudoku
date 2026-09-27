// Flood protection: per-IP limits on new profiles and imports, the import cap
// per profile, the disk budget and the plausibility filter for best times.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { plausibleTime, LIMITS } from '../server/store.js';

const P = '.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..';
const S = '142368795576294138389571246415736982723189654698452371961843527254917863837625419';

const procs = [];
const dirs = [];
after(() => {
  for (const p of procs) p.kill();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

async function server(env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-limits-'));
  dirs.push(dataDir);
  const proc = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir, ...env },
  });
  procs.push(proc);
  const base = await new Promise((resolve, reject) => {
    let out = '';
    proc.stdout.on('data', (d) => {
      out += d;
      const m = /Lytter på (http:\/\/[\d.]+:\d+)/.exec(out);
      if (m) resolve(m[1]);
    });
    proc.stderr.on('data', (d) => (out += d));
    proc.on('exit', () => reject(new Error(out)));
  });
  return (method, url, body) =>
    fetch(base + url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => r.status);
}

test('new profiles and imports are limited per address', async () => {
  const call = await server({ RATE_NEW_PROFILES: '2', RATE_IMPORTS: '2' });
  assert.equal(await call('PUT', '/api/users/en/settings', {}), 200);
  assert.equal(await call('PUT', '/api/users/to/settings', {}), 200);
  assert.equal(await call('PUT', '/api/users/tre/settings', {}), 429);
  assert.equal(await call('PUT', '/api/users/en/settings', { a: 1 }), 200, 'existing profiles are not limited');
  assert.equal(await call('POST', '/api/users/en/puzzles', { text: P }), 200);
  assert.equal(await call('POST', '/api/users/en/puzzles', { text: P }), 200);
  assert.equal(await call('POST', '/api/users/en/puzzles', { text: P }), 429);
});

test('a full disk budget refuses new profiles but not existing ones', async () => {
  const call = await server({ DATA_MAX_BYTES: '400' });
  assert.equal(await call('PUT', '/api/users/forst/settings', {}), 200); // ~200 bytes
  const game = { puzzle: P, solution: S, status: 'solved', seconds: 100, difficulty: 'easy', source: 'library' };
  assert.equal(await call('POST', '/api/users/forst/games', game), 200); // now over 400
  assert.equal(await call('PUT', '/api/users/sist/settings', {}), 507);
  assert.equal(await call('POST', '/api/users/forst/puzzles', { text: P }), 507);
  assert.equal(await call('PUT', '/api/users/forst/settings', { a: 1 }), 200);
});

test('import cap and time plausibility', () => {
  assert.equal(LIMITS.puzzles, 500);
  assert.equal(plausibleTime({ givens: 21, seconds: 30 }), true); // 60 empty cells
  assert.equal(plausibleTime({ givens: 21, seconds: 29 }), false);
});
