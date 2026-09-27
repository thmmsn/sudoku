// Appearance settings: defaults, clamping, the CSS variables they become, and
// that every variable is actually read by style.css and survives boot.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LOOK_NUMBERS, LOOK_COLORS, lookDefaults, clampLook, lookVars, colorResets } from '../public/js/look.js';

const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'css', 'style.css'), 'utf8');

test('defaults lie inside their ranges and colours follow the palette', () => {
  const d = lookDefaults();
  for (const n of LOOK_NUMBERS) assert.ok(d[n.key] >= n.min && d[n.key] <= n.max, n.key);
  for (const c of LOOK_COLORS) assert.equal(d[c.key], '', c.key);
  assert.deepEqual(clampLook(d), d);
});

test('clampLook clamps, snaps to the step and drops bad colours', () => {
  const out = clampLook({ uiDigit: 5, uiLine: 1.3, uiGivenWeight: 640, uiGiven: '#ABCDEF', uiUser: 'red', uiBg: '#12345' });
  assert.equal(out.uiDigit, 0.9);
  assert.equal(out.uiLine, 1.5);
  assert.equal(out.uiGivenWeight, 600);
  assert.equal(out.uiGiven, '#abcdef');
  assert.equal(out.uiUser, '');
  assert.equal(out.uiBg, '');
  assert.equal(clampLook({ uiPad: 'big' }).uiPad, 30);
});

test('lookVars: units on numbers, colours only when set', () => {
  const v = lookVars({ ...lookDefaults(), uiGiven: '#aabbcc' });
  assert.equal(v['--line-w'], '1px');
  assert.equal(v['--digit-scale'], '0.62');
  assert.equal(v['--given'], '#aabbcc');
  assert.equal('--user' in v, false);
  assert.deepEqual(Object.values(colorResets()), LOOK_COLORS.map(() => ''));
});

test('style.css reads every variable, and boot.js accepts every value', () => {
  const boot = /\^\[#\\w\.%-\]\{1,24\}\$/;
  assert.match(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', 'js', 'boot.js'), 'utf8'), boot);
  const extremes = [lookDefaults(), clampLook(Object.fromEntries(LOOK_NUMBERS.map((n) => [n.key, n.max]))), { ...lookDefaults(), uiGiven: '#abcdef' }];
  for (const s of extremes) {
    for (const [k, v] of Object.entries(lookVars(s))) {
      assert.match(k, /^--[a-z-]+$/);
      assert.match(String(v), /^[#\w.%-]{1,24}$/, `${k}: ${v}`);
    }
  }
  for (const n of LOOK_NUMBERS) assert.ok(css.includes(`var(${n.css}`), `${n.css} is not used in style.css`);
  for (const c of LOOK_COLORS) assert.ok(css.includes(`var(${c.css})`), `${c.css} is not used in style.css`);
});

test('the glow switch: on by default, off gives the flat style', async () => {
  const { lookStyle, LOOK_SWITCHES } = await import('../public/js/look.js');
  assert.equal(lookDefaults().uiGlowStyle, true);
  assert.equal(lookStyle(lookDefaults()), 'glow');
  assert.equal(lookStyle(clampLook({ uiGlowStyle: false })), 'flat');
  assert.equal(clampLook({ uiGlowStyle: 'no' }).uiGlowStyle, true);
  assert.equal(LOOK_SWITCHES.length, 1);
  assert.ok(css.includes(":root[data-style='flat'] .cell .d"), 'style.css has the flat overrides');
});
