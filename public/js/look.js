// Appearance the player can change without touching code: sizes, line
// widths, how bold the digits are, colours and effects.
//
// Every setting becomes a CSS custom property on <html>, and style.css reads
// them all with a fallback. Colours left empty follow the palette. The values
// are stored in the profile like the other settings, and boot.js applies them
// before the first paint so the screen never flashes.

import { h } from './dom.js';
import { action, twoTap } from './pages.js';

/** Sliders. `css` is the custom property, `unit` is appended to the value. */
export const LOOK_NUMBERS = [
  { group: 'tall', key: 'uiDigit', label: 'størrelse', css: '--digit-scale', min: 0.35, max: 0.9, step: 0.01, def: 0.62, show: (v) => `${Math.round(v * 100)} %` },
  { group: 'tall', key: 'uiGivenWeight', label: 'gitte tall, tykkelse', css: '--given-w', min: 100, max: 900, step: 100, def: 600 },
  { group: 'tall', key: 'uiUserWeight', label: 'dine tall, tykkelse', css: '--user-w', min: 100, max: 900, step: 100, def: 300 },
  { group: 'tall', key: 'uiNote', label: 'notater, størrelse', css: '--note-scale', min: 0.15, max: 0.4, step: 0.01, def: 0.25, show: (v) => `${Math.round(v * 100)} %` },
  { group: 'tall', key: 'uiNoteWeight', label: 'notater, tykkelse', css: '--note-w', min: 100, max: 900, step: 100, def: 400 },
  { group: 'tall', key: 'uiPad', label: 'tallknapper', css: '--pad-size', min: 16, max: 48, step: 1, def: 30, unit: 'px' },

  { group: 'linjer', key: 'uiLine', label: 'rutelinjer', css: '--line-w', min: 0, max: 3, step: 0.5, def: 1, unit: 'px' },
  { group: 'linjer', key: 'uiBoxLine', label: 'bokslinjer', css: '--box-w', min: 0.5, max: 6, step: 0.5, def: 1.5, unit: 'px' },
  { group: 'linjer', key: 'uiFrame', label: 'ramme', css: '--frame-w', min: 0, max: 6, step: 0.5, def: 1, unit: 'px' },
  { group: 'linjer', key: 'uiRadius', label: 'runde hjørner', css: '--radius', min: 0, max: 24, step: 1, def: 12, unit: 'px' },

  { group: 'markering', key: 'uiWash', label: 'like tall, bakgrunn', css: '--wash', min: 0, max: 60, step: 1, def: 26, show: (v) => `${v} %` },
  { group: 'markering', key: 'uiDimOthers', label: 'demp andre tall', css: '--dim-others', min: 0, max: 85, step: 5, def: 45, show: (v) => `${v} %` },
  { group: 'markering', key: 'uiSel', label: 'valgt rute, bakgrunn', css: '--sel-wash', min: 0, max: 60, step: 1, def: 30, show: (v) => `${v} %` },

  { group: 'glans', key: 'uiGlow', label: 'glød', css: '--glow', min: 0, max: 100, step: 5, def: 50, show: (v) => `${v} %` },
  { group: 'glans', key: 'uiSheen', label: 'glans i tallene', css: '--sheen', min: 0, max: 100, step: 5, def: 25, show: (v) => `${v} %` },
];

/** Colours. Empty = follow the palette. */
export const LOOK_COLORS = [
  { group: 'farger', key: 'uiGiven', label: 'gitte tall', css: '--given' },
  { group: 'farger', key: 'uiUser', label: 'dine tall', css: '--user' },
  { group: 'farger', key: 'uiNoteColor', label: 'notater', css: '--note' },
  { group: 'farger', key: 'uiSame', label: 'like tall', css: '--hi' },
  { group: 'farger', key: 'uiAccent', label: 'markering og glød', css: '--accent' },
  { group: 'farger', key: 'uiErr', label: 'feil', css: '--err' },
  { group: 'farger', key: 'uiLineColor', label: 'rutelinjer', css: '--line' },
  { group: 'farger', key: 'uiBoxColor', label: 'bokslinjer', css: '--box' },
  { group: 'farger', key: 'uiBg', label: 'bakgrunn', css: '--bg' },
];

/** On/off. uiGlowStyle off = traditional flat CSS: no gradients, glow, glass or rounded corners. */
export const LOOK_SWITCHES = [{ group: 'stil', key: 'uiGlowStyle', label: 'glød og glans', def: true }];

const HEX = /^#[0-9a-f]{6}$/i;

export function lookDefaults() {
  const out = {};
  for (const n of LOOK_NUMBERS) out[n.key] = n.def;
  for (const c of LOOK_COLORS) out[c.key] = '';
  for (const w of LOOK_SWITCHES) out[w.key] = w.def;
  return out;
}

/** 'glow' or 'flat', set as data-style on <html>. */
export function lookStyle(settings) {
  return settings.uiGlowStyle === false ? 'flat' : 'glow';
}

/** The colour keys, emptied: a new palette starts from its own colours. */
export function colorResets() {
  return Object.fromEntries(LOOK_COLORS.map((c) => [c.key, '']));
}

/** Clamps numbers to their range (snapped to the step) and drops invalid colours. */
export function clampLook(saved = {}) {
  const out = {};
  for (const n of LOOK_NUMBERS) {
    const v = saved[n.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) out[n.key] = n.def;
    else {
      const snapped = Math.round((Math.min(n.max, Math.max(n.min, v)) - n.min) / n.step) * n.step + n.min;
      out[n.key] = Number(snapped.toFixed(4));
    }
  }
  for (const c of LOOK_COLORS) out[c.key] = typeof saved[c.key] === 'string' && HEX.test(saved[c.key]) ? saved[c.key].toLowerCase() : '';
  for (const w of LOOK_SWITCHES) out[w.key] = typeof saved[w.key] === 'boolean' ? saved[w.key] : w.def;
  return out;
}

/** { '--digit-scale': '0.62', '--line-w': '1px', '--given': '#aabbcc', ... } */
export function lookVars(settings) {
  const vars = {};
  for (const n of LOOK_NUMBERS) vars[n.css] = `${settings[n.key]}${n.unit || ''}`;
  for (const c of LOOK_COLORS) if (settings[c.key]) vars[c.css] = settings[c.key];
  return vars;
}

/** Puts the variables on <html>; colours that follow the palette are removed. */
export function applyLook(settings, root = document.documentElement) {
  root.setAttribute('data-style', lookStyle(settings));
  const vars = lookVars(settings);
  for (const n of LOOK_NUMBERS) root.style.setProperty(n.css, vars[n.css]);
  for (const c of LOOK_COLORS) {
    if (vars[c.css]) root.style.setProperty(c.css, vars[c.css]);
    else root.style.removeProperty(c.css);
  }
  return vars;
}

/** The palette's own colour for a token, as #rrggbb (for the colour picker). */
function paletteColor(css) {
  const root = document.documentElement;
  const inline = root.style.getPropertyValue(css);
  root.style.removeProperty(css);
  let v = getComputedStyle(root).getPropertyValue(css).trim();
  if (inline) root.style.setProperty(css, inline);
  if (/^#[0-9a-f]{3}$/i.test(v)) v = `#${[...v.slice(1)].map((x) => x + x).join('')}`;
  return HEX.test(v) ? v.toLowerCase() : '#808080';
}

// ---------------------------------------------------------------------------
// The page (#utseende)

// A sample position for the preview: givens, your digits, notes, a selected
// cell, the digit it marks, and one wrong digit.
const P = '.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..';
const S = '142368795576294138389571246415736982723189654698452371961843527254917863837625419';
const WRONG = 58;
const NOTES = { 2: 0b100000100, 5: 0b000001100, 11: 0b010000001, 27: 0b010101000, 36: 0b000110010, 45: 0b100010000, 70: 0b010100010 };
const SELECTED = 40; // an empty cell you filled in with 8; it marks the other 8s
const USER = [...P].map((c, i) => (c === '.' && i % 4 === 0 && !(i in NOTES) && i !== WRONG ? i : -1)).filter((i) => i >= 0);

function previewBoard() {
  const values = [...P].map((c) => (c === '.' ? 0 : Number(c)));
  for (const i of USER) values[i] = Number(S[i]);
  values[WRONG] = (Number(S[WRONG]) % 9) + 1;
  const mark = values[SELECTED];
  const board = h('div', { class: 'board marking', 'aria-hidden': 'true' });
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const cls = ['cell'];
    if (c === 2 || c === 5) cls.push('box-right');
    if (r === 2 || r === 5) cls.push('box-bottom');
    if (c === 8) cls.push('last-col');
    if (r === 8) cls.push('last-row');
    if (P[i] !== '.') cls.push('given');
    if (i === SELECTED) cls.push('selected');
    if (values[i] && values[i] === mark) cls.push('same');
    if (i === WRONG) cls.push('wrong');
    const cell = h('div', { class: cls.join(' ') });
    if (values[i]) cell.append(h('span', { class: 'd' }, String(values[i])));
    else if (NOTES[i]) {
      const notes = h('div', { class: 'notes' });
      for (let d = 1; d <= 9; d++) {
        const on = NOTES[i] & (1 << (d - 1));
        notes.append(h('span', { class: on && d === mark ? 'hit' : undefined }, on ? String(d) : ''));
      }
      cell.append(notes);
    }
    board.append(cell);
  }
  const pad = h('div', { class: 'pad', 'aria-hidden': 'true' },
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => h('span', { class: `key${d === mark ? ' focus' : ''}` }, String(d))));
  return h('div', { class: 'look-preview' }, board, pad);
}

const GROUPS = [
  ['stil', 'stil'],
  ['tall', 'tall'],
  ['linjer', 'linjer'],
  ['markering', 'markering'],
  ['glans', 'glans og glød'],
  ['farger', 'farger'],
];

export function renderLookPage(ctx) {
  const rows = {};
  for (const [id] of GROUPS) rows[id] = [];

  for (const w of LOOK_SWITCHES) {
    const input = h('input', { type: 'checkbox', role: 'switch' });
    input.checked = ctx.settings[w.key];
    input.addEventListener('change', () => ctx.updateSettings({ [w.key]: input.checked }));
    rows[w.group].push(
      h('li', {}, h('label', { class: 'switch' }, h('span', {}, w.label), input, h('span', { class: 'track', 'aria-hidden': 'true' }))),
      h('li', { class: 'hint' }, 'Av: vanlig, flat stil uten gradienter, glød, glass og runde hjørner. Størrelser, linjer og farger under gjelder fortsatt.'));
  }

  for (const n of LOOK_NUMBERS) {
    const out = h('output', {});
    const input = h('input', { type: 'range', min: n.min, max: n.max, step: n.step, 'aria-label': n.label });
    const show = (v) => (out.textContent = n.show ? n.show(v) : `${v}${n.unit ? ` ${n.unit}` : ''}`);
    input.value = ctx.settings[n.key];
    show(ctx.settings[n.key]);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      show(v);
      ctx.updateSettings({ [n.key]: v });
    });
    rows[n.group].push(h('li', { class: 'look-num' }, h('span', {}, n.label), out, input));
  }

  for (const c of LOOK_COLORS) {
    const input = h('input', { type: 'color', 'aria-label': c.label });
    const reset = h('button', { type: 'button', class: 'link', title: 'Tilbake til palettens farge' }, 'palett');
    const sync = () => {
      input.value = ctx.settings[c.key] || paletteColor(c.css);
      reset.hidden = !ctx.settings[c.key];
    };
    input.addEventListener('input', () => {
      ctx.updateSettings({ [c.key]: input.value.toLowerCase() });
      reset.hidden = false;
    });
    reset.addEventListener('click', () => {
      ctx.updateSettings({ [c.key]: '' });
      sync();
    });
    sync();
    rows.farger.push(h('li', { class: 'look-color' }, h('span', {}, c.label), reset, input));
  }

  return h('div', { class: 'look' },
    h('h1', {}, 'utseende'),
    previewBoard(),
    GROUPS.map(([id, title]) => [h('h2', {}, title), h('ul', { class: 'look-list' }, rows[id])]),
    h('p', { class: 'hint' }, 'Fargene følger paletten til du endrer dem. Velger du en ny palett i menyen, starter fargene fra den paletten igjen.'),
    h('p', { class: 'row' },
      twoTap('tilbakestill alt', () => {
        ctx.updateSettings(lookDefaults(), { now: true });
        dispatchEvent(new HashChangeEvent('hashchange')); // draw the page again with the defaults
      }),
      action('tilbake til brettet', () => (location.hash = '#spill'))));
}
