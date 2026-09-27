import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../public/js/game-state.js';
import { PEERS } from '../public/js/engine.js';

const P = '.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..';
const S = '142368795576294138389571246415736982723189654698452371961843527254917863837625419';
const firstEmpty = P.indexOf('.');
const digit = (i) => Number(S[i]);
const wrongDigit = (i) => (digit(i) % 9) + 1;

const fresh = (opts) => new GameState({ puzzle: P, solution: S }, opts);

test('givens cannot be edited', () => {
  const g = fresh();
  const given = P.search(/[1-9]/);
  assert.equal(g.setValue(given, 1).changed, false);
  assert.equal(g.toggleNote(given, 1).changed, false);
  assert.equal(g.erase(given).changed, false);
});

test('correct and wrong digits, with mistake counting', () => {
  const g = fresh();
  assert.deepEqual(g.setValue(firstEmpty, digit(firstEmpty)), { changed: true, wrong: false, completed: false });
  assert.equal(g.mistakes, 0);
  const other = P.indexOf('.', firstEmpty + 1);
  assert.equal(g.setValue(other, wrongDigit(other)).wrong, true);
  assert.equal(g.mistakes, 1);
  assert.deepEqual(g.wrongCells(), [other]);
});

test('countMistakes: false never counts', () => {
  const g = fresh({ countMistakes: false });
  g.setValue(firstEmpty, wrongDigit(firstEmpty));
  assert.equal(g.mistakes, 0);
});

test('placing the same digit again clears the cell', () => {
  const g = fresh();
  g.setValue(firstEmpty, 5);
  g.setValue(firstEmpty, 5);
  assert.equal(g.values[firstEmpty], 0);
});

test('notes toggle, stay under a digit and come back when it is cleared', () => {
  const g = fresh();
  const d = digit(firstEmpty);
  const other = (d % 9) + 1;
  g.toggleNote(firstEmpty, d);
  g.toggleNote(firstEmpty, other);
  assert.equal(g.notes[firstEmpty], (1 << (d - 1)) | (1 << (other - 1)));
  g.toggleNote(firstEmpty, other);
  assert.equal(g.notes[firstEmpty], 1 << (d - 1));
  g.toggleNote(firstEmpty, other);

  // Placing d removes d from the cell's own notes, the rest stays underneath.
  g.setValue(firstEmpty, d);
  assert.equal(g.notes[firstEmpty], 1 << (other - 1));
  g.erase(firstEmpty);
  assert.equal(g.values[firstEmpty], 0);
  assert.equal(g.notes[firstEmpty], 1 << (other - 1));

  // Erasing an empty cell clears its notes.
  g.erase(firstEmpty);
  assert.equal(g.notes[firstEmpty], 0);
});

test('a note clears the digit in the cell', () => {
  const g = fresh();
  g.setValue(firstEmpty, digit(firstEmpty));
  assert.equal(g.toggleNote(firstEmpty, 2).changed, true);
  assert.equal(g.values[firstEmpty], 0);
  assert.equal(g.notes[firstEmpty], 1 << 1);
});

test('isFull is true for a full board even if it is wrong', () => {
  const g = fresh();
  for (let i = 0; i < 81; i++) if (P[i] === '.') g.setValue(i, digit(i));
  assert.equal(g.isComplete(), true);
  const last = P.lastIndexOf('.');
  g.setValue(last, wrongDigit(last));
  assert.equal(g.isFull(), true);
  assert.equal(g.isComplete(), false);
});

test('auto-remove notes clears the digit from peers, in one undo step', () => {
  const g = fresh();
  const d = digit(firstEmpty);
  const peer = PEERS[firstEmpty].find((p) => P[p] === '.');
  const outsider = [...Array(81).keys()].find((i) => P[i] === '.' && i !== firstEmpty && !PEERS[firstEmpty].includes(i));
  g.toggleNote(peer, d);
  g.toggleNote(outsider, d);
  g.setValue(firstEmpty, d);
  assert.equal(g.notes[peer] & (1 << (d - 1)), 0);
  assert.notEqual(g.notes[outsider] & (1 << (d - 1)), 0);
  g.undo();
  assert.equal(g.values[firstEmpty], 0);
  assert.notEqual(g.notes[peer] & (1 << (d - 1)), 0);
});

test('auto-remove notes can be turned off', () => {
  const g = fresh({ autoRemoveNotes: false });
  const d = digit(firstEmpty);
  const peer = PEERS[firstEmpty].find((p) => P[p] === '.');
  g.toggleNote(peer, d);
  g.setValue(firstEmpty, d);
  assert.notEqual(g.notes[peer] & (1 << (d - 1)), 0);
});

test('undo and redo walk the history; a new edit clears redo', () => {
  const g = fresh();
  g.setValue(firstEmpty, 1);
  g.setValue(firstEmpty, 2);
  assert.equal(g.undo(), firstEmpty);
  assert.equal(g.values[firstEmpty], 1);
  g.redo();
  assert.equal(g.values[firstEmpty], 2);
  g.undo();
  g.setValue(firstEmpty, 3);
  assert.equal(g.redo(), null);
  assert.equal(g.values[firstEmpty], 3);
});

test('conflicts finds duplicates in a unit', () => {
  const g = fresh();
  const given = P.search(/[1-9]/); // index 1, digit 4, row 0
  const sameRow = P.indexOf('.', 0);
  g.setValue(sameRow, Number(P[given]));
  const c = g.conflicts();
  assert.ok(c.has(given) && c.has(sameRow));
});

test('fillAllNotes writes legal candidates, restart wipes everything', () => {
  const g = fresh();
  g.fillAllNotes();
  for (let i = 0; i < 81; i++) {
    if (P[i] !== '.') continue;
    assert.ok(g.notes[i] & (1 << (digit(i) - 1)), `solution digit must be a candidate at ${i}`);
  }
  g.setValue(firstEmpty, digit(firstEmpty));
  g.restart();
  assert.equal(g.hasProgress(), false);
  assert.ok(g.notes.every((n) => n === 0));
});

test('hints: wrong digit first, then selected cell, then a logical single', () => {
  const g = fresh();
  g.setValue(firstEmpty, wrongDigit(firstEmpty));
  const h1 = g.hint();
  assert.equal(h1.type, 'wrong');
  assert.equal(g.values[firstEmpty], 0);

  const h2 = g.hint(firstEmpty);
  assert.equal(h2.type, 'selected');
  assert.equal(g.values[firstEmpty], digit(firstEmpty));

  const h3 = g.hint();
  assert.ok(['hiddenSingle', 'nakedSingle'].includes(h3.type));
  assert.equal(g.values[h3.index], digit(h3.index));
  assert.equal(g.hints, 3);
  assert.equal(g.mistakes, 1); // only the real mistake; hints never count
});

test('solving by hints only completes the game', () => {
  const g = fresh();
  let last;
  for (let k = 0; k < 81 && !g.isComplete(); k++) last = g.hint();
  assert.equal(g.isComplete(), true);
  assert.equal(last.completed, true);
  assert.equal(g.hint(), null);
});

test('snapshot round-trips', () => {
  const g = fresh();
  g.setValue(firstEmpty, digit(firstEmpty));
  g.toggleNote(P.indexOf('.', firstEmpty + 1), 4);
  const snap = g.snapshot(42.4);
  const g2 = new GameState(snap);
  assert.deepEqual(g2.values, g.values);
  assert.deepEqual(g2.notes, g.notes);
  assert.equal(g2.elapsed, 42);
});
