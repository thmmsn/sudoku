// Starts the real server on a random port with a temporary data folder and
// walks through the API the way the frontend will use it.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const P = '.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..';
const S = '142368795576294138389571246415736982723189654698452371961843527254917863837625419';
const P2 = '7.....8...2.4.5....5....32......1.7...8....59........49...42..73..9.......63.....';

let proc;
let base;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-test-'));
  proc = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir },
  });
  base = await new Promise((resolve, reject) => {
    let out = '';
    proc.stdout.on('data', (d) => {
      out += d;
      const m = /Lytter på (http:\/\/[\d.]+:\d+)/.exec(out);
      if (m) resolve(m[1]);
    });
    proc.stderr.on('data', (d) => (out += d));
    proc.on('exit', () => reject(new Error(`server exited:\n${out}`)));
  });
});

after(() => {
  proc?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

test('library loads every unique puzzle from /puzzles, not the examples', async () => {
  const r = await call('GET', '/api/library');
  assert.equal(r.status, 200);
  assert.equal(r.json.puzzles.length, 1187); // bibliotek.jsonl 1077 + ekstra.csv 110
  assert.ok(r.json.puzzles.every((p) => p.n < 80), 'the nearly finished example boards are not playable puzzles');
  const first = r.json.puzzles.find((p) => p.p === P);
  assert.equal(first.s, S);
  assert.equal(first.d, 'easy');
  assert.ok(r.headers.get('etag'));
  const again = await fetch(`${base}/api/library`, { headers: { 'If-None-Match': r.headers.get('etag') } });
  assert.equal(again.status, 304);
});

test('username check: invalid, free, reserved', async () => {
  assert.equal((await call('GET', '/api/check/a')).json.valid, false);
  assert.equal((await call('GET', '/api/check/api')).json.valid, false);
  assert.equal((await call('GET', '/api/check/..%2Fetc')).json.valid, false);
  const free = await call('GET', '/api/check/Ola');
  assert.deepEqual([free.json.valid, free.json.exists, free.json.name], [true, false, 'ola']);
  assert.equal((await call('GET', '/api/users/ola')).status, 404);
});

test('profile lifecycle: settings, current game, finished game, overview', async () => {
  assert.equal((await call('PUT', '/api/users/ola/settings', { theme: 'dark', boardMax: 600, 'bad key': 1, nested: { x: 1 } })).status, 200);
  let p = (await call('GET', '/api/users/ola')).json;
  assert.deepEqual(p.settings, { theme: 'dark', boardMax: 600 });
  assert.equal((await call('GET', '/api/check/ola')).json.exists, true);

  const values = S.slice(0, 1) + P.slice(1);
  const cur = { puzzle: P, solution: S, values, notes: new Array(81).fill(3), elapsed: 12, source: 'library', difficulty: 'easy' };
  assert.equal((await call('PUT', '/api/users/ola/current', cur)).status, 200);
  p = (await call('GET', '/api/users/ola')).json;
  assert.equal(p.current.values, values);
  assert.equal(p.current.elapsed, 12);

  const game = { puzzle: P, solution: S, status: 'solved', seconds: 321, mistakes: 1, hints: 0, difficulty: 'easy', source: 'library' };
  const rec = await call('POST', '/api/users/ola/games', game);
  assert.equal(rec.status, 200);
  assert.equal(rec.json.givens, 22);
  p = (await call('GET', '/api/users/ola')).json;
  assert.equal(p.games.length, 1);
  assert.equal(p.current, null, 'finishing the current puzzle clears it');

  const o = (await call('GET', '/api/overview')).json;
  assert.equal(o.players, 1);
  assert.equal(o.solved, 1);
  assert.equal(o.top[0].name, 'ola');
  assert.deepEqual(o.best.easy, [{ name: 'ola', seconds: 321 }], 'library solve without hints is a public best time');
  assert.equal(fs.existsSync(path.join(dataDir, 'users', 'ola.json')), true);
});

test('server rejects tampered game state', async () => {
  const ownDigit = `9${P.slice(1)}`; // index 0 is empty in P, so the player may write there
  const givenChanged = P.slice(0, 1) + '5' + P.slice(2); // index 1 is a given (4)
  assert.equal((await call('PUT', '/api/users/kari/current', { puzzle: P, solution: S, values: givenChanged })).status, 400);
  assert.equal((await call('PUT', '/api/users/kari/current', { puzzle: P, solution: S.replace('1', '9') })).status, 400);
  assert.equal((await call('PUT', '/api/users/kari/current', { puzzle: 'x', solution: S })).status, 400);
  assert.equal((await call('POST', '/api/users/kari/games', { puzzle: P, solution: P, status: 'solved' })).status, 400);
  assert.equal((await call('PUT', '/api/users/kari/current', { puzzle: P, solution: S, values: ownDigit })).status, 200);
  assert.equal((await call('PUT', '/api/users/kari/settings', '[1]')).status, 400);
});

test('import: all repo notations, duplicates and errors are reported', async () => {
  const text = [
    'puzzle,solution,difficulty,id',
    `${P},${S},easy,e94c059b`,
    `${P2}`,
    `${P}`, // duplicate
    'not a puzzle',
    `1${'.'.repeat(80)}`, // too few givens
  ].join('\n');
  const r = await call('POST', '/api/users/per/puzzles', { text, collection: 'Test' });
  assert.equal(r.status, 200);
  assert.equal(r.json.added.length, 2);
  assert.equal(r.json.duplicates, 1);
  assert.equal(r.json.invalid.length, 2);
  assert.deepEqual(r.json.invalid.map((e) => e.line).sort(), [5, 6]);
  const added = r.json.added.find((x) => x.puzzle === P2);
  assert.equal(added.solution.length, 81);
  assert.equal(added.inLibrary, true);
  assert.equal(added.collection, 'Test');

  const del = await call('DELETE', `/api/users/per/puzzles/${added.id}`);
  assert.equal(del.status, 200);
  const p = (await call('GET', '/api/users/per')).json;
  assert.equal(p.puzzles.length, 1);
  assert.equal(p.puzzles[0].solution, undefined, 'solutions are not stored');

  await call('DELETE', '/api/users/per/puzzles?collection=Test');
  assert.equal((await call('GET', '/api/users/per')).json.puzzles.length, 0);
});

test('concurrent writes to one profile are serialized, none lost', async () => {
  const game = { puzzle: P, solution: S, status: 'solved', seconds: 1, difficulty: 'easy' };
  await Promise.all([...Array(25)].map(() => call('POST', '/api/users/mange/games', game)));
  assert.equal((await call('GET', '/api/users/mange')).json.games.length, 25);
});

test('deleting a profile frees the username', async () => {
  await call('PUT', '/api/users/borte/settings', { a: 1 });
  assert.equal((await call('DELETE', '/api/users/borte')).status, 200);
  assert.equal((await call('GET', '/api/check/borte')).json.exists, false);
});

test('the app shell has absolute link-preview URLs', async () => {
  for (const url of ['/', '/ola', '/index.html']) {
    const r = await call('GET', url);
    assert.equal(r.status, 200, url);
    assert.ok(!r.text.includes('%PUBLIC_URL%'), url);
    assert.match(r.text, /og:image" content="https:\/\/sudoku\.eipi\.dev\/og-image\.png"/, url);
  }
  assert.equal((await fetch(`${base}/favicon.ico`)).headers.get('content-type'), 'image/x-icon');
});

test('only profile pages are installable, each as its own app', async () => {
  const landing = await call('GET', '/');
  assert.ok(!landing.text.includes('rel="manifest"'), 'the name screen has no manifest');
  assert.ok(!landing.text.includes('%MANIFEST%'));
  const prof = await call('GET', '/ola');
  assert.match(prof.text, /<link rel="manifest" href="\/manifest\.webmanifest\?u=ola" \/>/);
  const m = await call('GET', '/manifest.webmanifest?u=ola');
  assert.equal(m.status, 200);
  assert.equal(m.json.start_url, '/ola?app');
  assert.equal(m.json.id, '/ola');
  assert.equal(m.json.display, 'standalone');
  assert.ok(m.json.icons.length >= 3);
  assert.equal((await call('GET', '/manifest.webmanifest?u=..')).json.start_url, '/?app', 'bad names get the plain manifest');
});

test('routing: uppercase usernames redirect, bad paths are refused', async () => {
  const r = await fetch(`${base}/Ola?p=1`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/ola?p=1');
  assert.equal((await call('GET', '/js/engine.js')).status, 200);
  assert.notEqual((await call('GET', '/..%2Fpackage.json')).status, 200);
  assert.equal((await call('POST', '/api/overview')).status, 404);
  assert.equal((await call('PATCH', '/api/users/ola')).status, 405);
});
