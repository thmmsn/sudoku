// The service worker must cache every file the app needs, or the app breaks
// offline the first time a new file is added and forgotten here.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pub = path.join(import.meta.dirname, '..', 'public');
const sw = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');
const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

test('every script, style and icon is precached', () => {
  const files = [
    ...fs.readdirSync(path.join(pub, 'js')).map((f) => `/js/${f}`),
    ...fs.readdirSync(path.join(pub, 'icons')).map((f) => `/icons/${f}`),
    '/css/style.css',
    '/favicon.svg',
    '/manifest.webmanifest',
  ];
  for (const f of files) assert.ok(list.includes(f), `${f} missing from PRECACHE in sw.js`);
  for (const f of list) {
    if (f === '/' || f.startsWith('/api/')) continue;
    assert.ok(fs.existsSync(path.join(pub, f)), `${f} in PRECACHE does not exist`);
  }
  assert.ok(list.includes('/api/library'), 'the puzzle library is needed offline');
});

test('manifest: standalone, portrait, black, with icons that exist', () => {
  const m = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'portrait');
  assert.equal(m.background_color, '#000000');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(pub, i.src)), i.src);
});
