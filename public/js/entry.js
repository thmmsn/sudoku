// Typing in a puzzle, for example one from the newspaper: an empty board,
// tap a cell and a digit, the same digit again clears it. The board is
// checked while you type (clashing digits, and whether there are 0, 1 or
// several solutions), and it can only be saved with exactly one solution.
// The draft is kept in the browser until it is saved or cleared.

import { h, icons } from './dom.js';
import { ROW, COL, PEERS, solve, toString, toArray } from './engine.js';
import { local } from './api.js';

const MIN_GIVENS = 17; // no sudoku with fewer has a unique solution

/**
 * opts: { draftKey, onSave(puzzle) -> Promise } Returns the element.
 */
export function entryEditor({ draftKey, onSave }) {
  const saved = local.get(draftKey);
  let values = typeof saved === 'string' && saved.length === 81 ? toArray(saved) : new Array(81).fill(0);
  let selected = -1;
  let checkTimer = null;
  let result = { count: 0 };

  const cells = [];
  const board = h('div', { class: 'board', role: 'grid', 'aria-label': 'Nytt brett' });
  for (let i = 0; i < 81; i++) {
    const cls = ['cell', 'given'];
    if (COL[i] === 2 || COL[i] === 5) cls.push('box-right');
    if (ROW[i] === 2 || ROW[i] === 5) cls.push('box-bottom');
    if (COL[i] === 8) cls.push('last-col');
    if (ROW[i] === 8) cls.push('last-row');
    const cell = h('div', { class: cls.join(' '), role: 'gridcell', dataset: { i, base: cls.join(' ') } });
    cells.push(cell);
    board.append(cell);
  }
  board.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    selected = Number(cell.dataset.i);
    render();
  });

  const pad = h('div', { class: 'pad' });
  for (let d = 1; d <= 9; d++) pad.append(h('button', { class: 'key', type: 'button', 'aria-label': String(d), onclick: () => put(d) }, String(d)));

  const status = h('p', { class: 'entry-status', role: 'status' });
  const saveBtn = h('button', { class: 'tool', type: 'button', 'aria-label': 'Lagre og spill', title: 'Lagre og spill', disabled: true, onclick: save }, icons.check());
  let armed = null;
  const clearBtn = h('button', {
    class: 'tool',
    type: 'button',
    'aria-label': 'Tøm brettet',
    title: 'Tøm brettet (trykk to ganger)',
    onclick: () => {
      if (!armed) {
        clearBtn.classList.add('armed');
        armed = setTimeout(() => {
          armed = null;
          clearBtn.classList.remove('armed');
        }, 3000);
        return;
      }
      clearTimeout(armed);
      armed = null;
      clearBtn.classList.remove('armed');
      values = new Array(81).fill(0);
      changed();
    },
  }, icons.clear());

  function put(d) {
    if (selected < 0) return;
    values[selected] = values[selected] === d ? 0 : d;
    changed();
  }

  function changed() {
    local.set(draftKey, values.some(Boolean) ? toString(values) : null);
    render();
    clearTimeout(checkTimer);
    checkTimer = setTimeout(check, 120);
  }

  function clashes() {
    const out = new Set();
    for (let i = 0; i < 81; i++) {
      if (values[i] && PEERS[i].some((p) => values[p] === values[i])) out.add(i);
    }
    return out;
  }

  function check() {
    const n = values.filter(Boolean).length;
    const bad = clashes();
    if (bad.size) result = { count: 0, text: 'to like tall i samme rad, kolonne eller boks' };
    else if (n < MIN_GIVENS) result = { count: -1, text: n ? `${n} tall · minst ${MIN_GIVENS}` : '' };
    else {
      const r = solve(values, 2);
      result = r.count === 1
        ? { count: 1, text: `${n} tall · én løsning` }
        : r.count === 0
          ? { count: 0, text: `${n} tall · ingen løsning` }
          : { count: 2, text: `${n} tall · flere løsninger` };
    }
    status.textContent = result.text;
    status.classList.toggle('bad', result.count === 0);
    saveBtn.disabled = result.count !== 1;
  }

  async function save() {
    if (result.count !== 1) return;
    saveBtn.disabled = true;
    try {
      await onSave(toString(values));
      local.set(draftKey, null);
    } catch (err) {
      status.textContent = err.message;
      status.classList.add('bad');
      saveBtn.disabled = false;
    }
  }

  function render() {
    const bad = clashes();
    for (let i = 0; i < 81; i++) {
      const el = cells[i];
      let cls = el.dataset.base;
      if (i === selected) cls += ' selected';
      if (bad.has(i)) cls += ' wrong';
      if (el.className !== cls) el.className = cls;
      const text = values[i] ? String(values[i]) : '';
      if (el.textContent !== text) el.textContent = text;
    }
  }

  // Keyboard: 1-9, 0/Backspace clears, arrows move.
  const onKey = (e) => {
    if (!root.isConnected) return document.removeEventListener('keydown', onKey);
    if (e.target.closest?.('input, textarea')) return;
    if (/^[1-9]$/.test(e.key)) put(Number(e.key));
    else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
      if (selected >= 0 && values[selected]) put(values[selected]);
    } else {
      const dir = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!dir) return;
      selected = selected < 0 ? 0 : (selected + dir + 81) % 81;
      render();
    }
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  const root = h('div', { class: 'entry' }, board, pad, h('div', { class: 'tools' }, clearBtn, status, saveBtn));
  render();
  check();
  return root;
}
