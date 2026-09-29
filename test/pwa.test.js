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

/** Width and height from a PNG header. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', file);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

test('manifest: standalone, portrait, black; icons and screenshots exist with the stated sizes', () => {
  const m = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'portrait');
  assert.equal(m.background_color, '#000000');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'a maskable icon');
  for (const i of m.icons) {
    assert.ok(fs.existsSync(path.join(pub, i.src)), i.src);
    if (i.type === 'image/png') assert.equal(pngSize(path.join(pub, i.src)), i.sizes, i.src);
  }
  assert.ok(m.screenshots.length >= 1);
  for (const sc of m.screenshots) assert.equal(pngSize(path.join(pub, sc.src)), sc.sizes, sc.src);
});

test('icons: apple-touch 180, favicons, .ico and the share image', () => {
  assert.equal(pngSize(path.join(pub, 'icons', 'apple-touch-icon.png')), '180x180');
  assert.equal(pngSize(path.join(pub, 'icons', 'favicon-32.png')), '32x32');
  assert.equal(pngSize(path.join(pub, 'og-image.png')), '1200x630');
  const ico = fs.readFileSync(path.join(pub, 'favicon.ico'));
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1], 'ico header');
  assert.ok(ico.readUInt16LE(4) >= 2, 'several sizes in the .ico');
  const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  for (const tag of ['og:image', 'og:title', 'twitter:card', 'apple-touch-icon', 'manifest', 'favicon.ico']) assert.ok(html.includes(tag), tag);
});

test('the app icon shows a valid sudoku box: no digit twice', () => {
  const svg = fs.readFileSync(path.join(pub, 'icons', 'icon.svg'), 'utf8');
  const digits = [...svg.matchAll(/data-digit="(\d)"/g)].map((m) => m[1]);
  assert.ok(digits.length >= 2, 'the icon marks its digits with data-digit');
  assert.equal(new Set(digits).size, digits.length, `digits in the box: ${digits.join(', ')}`);
  assert.equal((svg.match(/<use /g) || []).length, digits.length, 'every drawn digit has data-digit');
});
