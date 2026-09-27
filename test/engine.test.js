import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../public/js/engine.js';

const P = '.4....79..7..94....8.........57.6.....3...6...9......1..18...2.....1...38...2.4..';
const S = '142368795576294138389571246415736982723189654698452371961843527254917863837625419';

test('geometry: 27 units of 9 and 20 peers per cell', () => {
  assert.equal(E.UNITS.length, 27);
  for (const u of E.UNITS) assert.equal(new Set(u).size, 9);
  for (let i = 0; i < 81; i++) assert.equal(E.PEERS[i].length, 20);
});

test('normalizeGrid accepts . 0 _ * as empty and rejects bad input', () => {
  assert.equal(E.normalizeGrid(P.replaceAll('.', '0')), P);
  assert.equal(E.normalizeGrid(P.replaceAll('.', '_')), P);
  assert.equal(E.normalizeGrid(P.slice(1)), null);
  assert.equal(E.normalizeGrid(`${P.slice(1)}x`), null);
  assert.equal(E.normalizeGrid(null), null);
});

test('solve finds the unique solution', () => {
  const r = E.solve(P, 2);
  assert.equal(r.count, 1);
  assert.equal(r.solution, S);
});

test('solve detects multiple and zero solutions', () => {
  assert.equal(E.solve('.'.repeat(81), 2).count, 2);
  const broken = `11${'.'.repeat(79)}`;
  assert.equal(E.solve(broken, 2).count, 0);
});

test('validatePuzzle explains every kind of rejection', () => {
  assert.equal(E.validatePuzzle(P, S).ok, true);
  assert.match(E.validatePuzzle('123').error, /81 tegn/);
  assert.match(E.validatePuzzle(`1${'.'.repeat(80)}`).error, /minst 17/);
  const clash = `11${S.slice(2, 30)}${'.'.repeat(51)}`;
  assert.match(E.validatePuzzle(clash).error, /bryter reglene/);
  const many = S.slice(0, 17) + '.'.repeat(64);
  assert.match(E.validatePuzzle(many).error, /flere løsninger/);
  const badSol = S.replace('1', '2');
  assert.match(E.validatePuzzle(P, badSol).error, /stemmer ikke/);
});

test('grade matches the labels in 1.csv for labelled puzzles', () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, '..', 'puzzles', '1.csv'), 'utf8');
  const { entries } = E.parseImport(text);
  let checked = 0;
  for (const e of entries) {
    if (!E.DIFFICULTIES.includes(e.difficulty)) continue;
    assert.equal(E.grade(e.puzzle).difficulty, e.difficulty, `puzzle on line ${e.line}`);
    checked++;
  }
  assert.ok(checked > 50);
});

test('findSingle returns a correct digit with a reason', () => {
  const s = E.findSingle(E.toArray(P));
  assert.ok(s);
  assert.equal(String(s.digit), S[s.index]);
  assert.ok(['hiddenSingle', 'nakedSingle'].includes(s.technique));
});

test('parseImport: every notation used in /puzzles', () => {
  const cases = {
    single: P,
    pair: `${P},${S}`,
    csv: `puzzle,solution,difficulty,id\n${P},${S},easy,e94c059b`,
    json: JSON.stringify({ id: 'e94c059b', puzzle: P, solution: S, difficulty: 'easy' }),
    array: JSON.stringify([{ puzzle: P }, P]),
    zeros: P.replaceAll('.', '0'),
    grid: P.match(/.{9}/g).map((r) => `${r.slice(0, 3)} | ${r.slice(3, 6)} | ${r.slice(6)}`).join('\n'),
  };
  for (const [name, text] of Object.entries(cases)) {
    const { entries, errors } = E.parseImport(text);
    assert.equal(errors.length, 0, name);
    assert.ok(entries.length >= 1, name);
    assert.equal(E.normalizeGrid(entries[0].puzzle), P, name);
  }
  const csv = E.parseImport(cases.csv).entries[0];
  assert.equal(csv.difficulty, 'easy');
  assert.equal(csv.id, 'e94c059b');
  assert.equal(E.parseImport(cases.pair).entries[0].solution, S);
});

test('parseImport reports junk lines by line number', () => {
  const { entries, errors } = E.parseImport(`${P}\nhello\n${P}`);
  assert.equal(entries.length, 2);
  assert.deepEqual(errors.map((e) => e.line), [2]);
});

test('all puzzle files parse and validate', () => {
  const dir = path.join(import.meta.dirname, '..', 'puzzles');
  for (const f of fs.readdirSync(dir)) {
    const { entries, errors } = E.parseImport(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(errors.length, 0, f);
    for (const e of entries) assert.ok(E.validatePuzzle(e.puzzle, e.solution).ok, `${f}:${e.line}`);
  }
});

test('generate returns unique puzzles of the requested difficulty', () => {
  const random = E.mulberry32(42);
  for (const d of ['very-easy', 'medium', 'very-hard']) {
    const g = E.generate(d, { random });
    assert.equal(E.solve(g.puzzle, 2).count, 1);
    assert.equal(E.solve(g.puzzle, 1).solution, g.solution);
    assert.equal(g.difficulty, d);
    assert.equal(E.grade(g.puzzle).difficulty, d);
  }
});

test('puzzleId is stable 8 hex chars', () => {
  assert.equal(E.puzzleId(P), E.puzzleId(P));
  assert.match(E.puzzleId(P), /^[0-9a-f]{8}$/);
  assert.notEqual(E.puzzleId(P), E.puzzleId(S));
});
