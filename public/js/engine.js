// Sudoku engine shared by the browser and the Node server.
//
// Grid notation (same as the files in /puzzles): an 81 character string read
// row by row, digits 1-9 for givens and '.' (or '0') for empty cells.
//
// Internally a grid is an array of 81 numbers where 0 means empty, and a set of
// candidate digits is a 9 bit mask where bit (d - 1) represents digit d.

export const DIFFICULTIES = ['very-easy', 'easy', 'medium', 'hard', 'very-hard'];

// Adressa's four labels (Lett, Middels, Vanskelig, Ekspert) plus "Veldig lett"
// in front, since the puzzle files use five levels.
export const DIFFICULTY_LABELS = {
  'very-easy': 'Veldig lett',
  easy: 'Lett',
  medium: 'Middels',
  hard: 'Vanskelig',
  'very-hard': 'Ekspert',
  unknown: 'Ukjent',
};

export const ALL = 0x1ff;

// ---------------------------------------------------------------------------
// Geometry

export const ROW = new Array(81);
export const COL = new Array(81);
export const BOX = new Array(81);
export const UNITS = []; // 27 units: 9 rows, 9 columns, 9 boxes
export const PEERS = new Array(81);

for (let i = 0; i < 81; i++) {
  ROW[i] = Math.floor(i / 9);
  COL[i] = i % 9;
  BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
}
for (let r = 0; r < 9; r++) UNITS.push([...Array(9)].map((_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push([...Array(9)].map((_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const r0 = Math.floor(b / 3) * 3;
  const c0 = (b % 3) * 3;
  UNITS.push([...Array(9)].map((_, k) => (r0 + Math.floor(k / 3)) * 9 + c0 + (k % 3)));
}
for (let i = 0; i < 81; i++) {
  const set = new Set();
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) set.add(j);
  }
  PEERS[i] = [...set];
}

// ---------------------------------------------------------------------------
// Bit helpers

export function popcount(m) {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

export function bitToDigit(bit) {
  return 31 - Math.clz32(bit) + 1;
}

export function maskDigits(m) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Conversion

/** Returns a normalized 81 char string ('.' for empty) or null if invalid. */
export function normalizeGrid(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  if (s.length !== 81) return null;
  let out = '';
  for (const ch of s) {
    if (ch >= '1' && ch <= '9') out += ch;
    else if (ch === '.' || ch === '0' || ch === '_' || ch === '*') out += '.';
    else return null;
  }
  return out;
}

export function toArray(str) {
  const a = new Array(81);
  for (let i = 0; i < 81; i++) {
    const ch = str[i];
    a[i] = ch >= '1' && ch <= '9' ? ch.charCodeAt(0) - 48 : 0;
  }
  return a;
}

export function toString(arr) {
  let s = '';
  for (let i = 0; i < 81; i++) s += arr[i] ? String(arr[i]) : '.';
  return s;
}

export function countGivens(str) {
  let n = 0;
  for (let i = 0; i < 81; i++) if (str[i] !== '.') n++;
  return n;
}

/** Short stable id (FNV-1a, 32 bit, hex) for puzzles that come without one. */
export function puzzleId(puzzle) {
  let h = 0x811c9dc5;
  for (let i = 0; i < puzzle.length; i++) {
    h ^= puzzle.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Indices of givens that clash with another given in a row, column or box. */
export function findConflicts(arr) {
  const bad = new Set();
  for (const unit of UNITS) {
    const seen = new Map();
    for (const i of unit) {
      const v = arr[i];
      if (!v) continue;
      if (seen.has(v)) {
        bad.add(i);
        bad.add(seen.get(v));
      } else seen.set(v, i);
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Brute force solver (bitmask backtracking, fewest candidates first)

/**
 * Counts solutions up to `limit`. Returns { count, solution } where solution is
 * the first solution found as an 81 char string (or null).
 */
export function solve(puzzle, limit = 2, random = null) {
  const g = typeof puzzle === 'string' ? toArray(puzzle) : puzzle.slice();
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const bit = 1 << (v - 1);
    if (rows[ROW[i]] & bit || cols[COL[i]] & bit || boxes[BOX[i]] & bit) {
      return { count: 0, solution: null };
    }
    rows[ROW[i]] |= bit;
    cols[COL[i]] |= bit;
    boxes[BOX[i]] |= bit;
  }

  let count = 0;
  let first = null;

  const dfs = () => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]);
      const c = popcount(m);
      if (c === 0) return; // dead end
      if (c < bestCount) {
        best = i;
        bestMask = m;
        bestCount = c;
        if (c === 1) break;
      }
    }
    if (best === -1) {
      count++;
      if (!first) first = toString(g);
      return;
    }
    let digits = maskDigits(bestMask);
    if (random) shuffle(digits, random);
    const r = ROW[best];
    const c = COL[best];
    const b = BOX[best];
    for (const d of digits) {
      const bit = 1 << (d - 1);
      g[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      dfs();
      g[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      if (count >= limit) return;
    }
  };

  dfs();
  return { count, solution: first };
}

// ---------------------------------------------------------------------------
// Human style solver used for grading
//
// The grader repeatedly applies the easiest technique that makes progress. The
// difficulty of the puzzle is the hardest technique it ever needed:
//
//   level 1  hidden single                         -> very-easy
//   level 2  naked single                          -> easy
//   level 3  locked candidates (pointing/claiming) -> medium
//   level 4  naked/hidden pairs and triples        -> hard
//   level 5  X-wing, swordfish, or stuck           -> very-hard

export const TECHNIQUES = {
  hiddenSingle: { level: 1, label: 'Skjult singel' },
  nakedSingle: { level: 2, label: 'Naken singel' },
  lockedCandidates: { level: 3, label: 'Låste kandidater' },
  nakedPair: { level: 4, label: 'Nakent par' },
  hiddenPair: { level: 4, label: 'Skjult par' },
  nakedTriple: { level: 4, label: 'Naken trippel' },
  hiddenTriple: { level: 4, label: 'Skjult trippel' },
  xWing: { level: 5, label: 'X-wing' },
  swordfish: { level: 5, label: 'Swordfish' },
  guess: { level: 5, label: 'Gjetting / avanserte teknikker' },
};

function combinations(arr, k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

class LogicState {
  constructor(arr) {
    this.g = arr.slice();
    this.cands = new Array(81).fill(0);
    for (let i = 0; i < 81; i++) {
      if (this.g[i]) continue;
      let m = ALL;
      for (const p of PEERS[i]) if (this.g[p]) m &= ~(1 << (this.g[p] - 1));
      this.cands[i] = m;
    }
  }

  place(i, d) {
    this.g[i] = d;
    this.cands[i] = 0;
    const bit = 1 << (d - 1);
    for (const p of PEERS[i]) this.cands[p] &= ~bit;
  }

  eliminate(i, mask) {
    if (this.g[i] || !(this.cands[i] & mask)) return false;
    this.cands[i] &= ~mask;
    return true;
  }

  solved() {
    for (let i = 0; i < 81; i++) if (!this.g[i]) return false;
    return true;
  }

  broken() {
    for (let i = 0; i < 81; i++) if (!this.g[i] && !this.cands[i]) return true;
    return false;
  }

  hiddenSingle() {
    for (const unit of UNITS) {
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        let pos = -1;
        let n = 0;
        for (const i of unit) {
          if (this.g[i] === d) {
            n = -1;
            break;
          }
          if (this.cands[i] & bit) {
            pos = i;
            n++;
          }
        }
        if (n === 1) {
          this.place(pos, d);
          return true;
        }
      }
    }
    return false;
  }

  nakedSingle() {
    for (let i = 0; i < 81; i++) {
      if (!this.g[i] && popcount(this.cands[i]) === 1) {
        this.place(i, bitToDigit(this.cands[i]));
        return true;
      }
    }
    return false;
  }

  lockedCandidates() {
    let progress = false;
    // Pointing: candidates in a box confined to one row/column.
    for (let b = 0; b < 9; b++) {
      const box = UNITS[18 + b];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        const cells = box.filter((i) => this.cands[i] & bit);
        if (cells.length < 2) continue;
        const r = ROW[cells[0]];
        const c = COL[cells[0]];
        if (cells.every((i) => ROW[i] === r)) {
          for (const i of UNITS[r]) if (BOX[i] !== b) progress = this.eliminate(i, bit) || progress;
        }
        if (cells.every((i) => COL[i] === c)) {
          for (const i of UNITS[9 + c]) if (BOX[i] !== b) progress = this.eliminate(i, bit) || progress;
        }
        if (progress) return true;
      }
    }
    // Claiming: candidates in a row/column confined to one box.
    for (let u = 0; u < 18; u++) {
      const unit = UNITS[u];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        const cells = unit.filter((i) => this.cands[i] & bit);
        if (cells.length < 2) continue;
        const b = BOX[cells[0]];
        if (cells.every((i) => BOX[i] === b)) {
          for (const i of UNITS[18 + b]) {
            if (!unit.includes(i)) progress = this.eliminate(i, bit) || progress;
          }
        }
        if (progress) return true;
      }
    }
    return false;
  }

  nakedSubset(n) {
    for (const unit of UNITS) {
      const cells = unit.filter((i) => !this.g[i] && popcount(this.cands[i]) >= 2 && popcount(this.cands[i]) <= n);
      if (cells.length < n) continue;
      for (const combo of combinations(cells, n)) {
        let union = 0;
        for (const i of combo) union |= this.cands[i];
        if (popcount(union) !== n) continue;
        let progress = false;
        for (const i of unit) if (!combo.includes(i)) progress = this.eliminate(i, union) || progress;
        if (progress) return true;
      }
    }
    return false;
  }

  hiddenSubset(n) {
    for (const unit of UNITS) {
      const placed = new Set(unit.map((i) => this.g[i]).filter(Boolean));
      const digits = [];
      for (let d = 1; d <= 9; d++) {
        if (placed.has(d)) continue;
        const bit = 1 << (d - 1);
        const k = unit.filter((i) => this.cands[i] & bit).length;
        if (k >= 2 && k <= n) digits.push(d);
      }
      if (digits.length < n) continue;
      for (const combo of combinations(digits, n)) {
        let mask = 0;
        for (const d of combo) mask |= 1 << (d - 1);
        const cells = unit.filter((i) => this.cands[i] & mask);
        if (cells.length !== n) continue;
        let progress = false;
        for (const i of cells) progress = this.eliminate(i, ALL & ~mask) || progress;
        if (progress) return true;
      }
    }
    return false;
  }

  fish(n) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      for (const byRow of [true, false]) {
        const base = [];
        for (let line = 0; line < 9; line++) {
          const unit = UNITS[byRow ? line : 9 + line];
          const pos = unit.filter((i) => this.cands[i] & bit).map((i) => (byRow ? COL[i] : ROW[i]));
          if (pos.length >= 2 && pos.length <= n) base.push({ line, pos });
        }
        if (base.length < n) continue;
        for (const combo of combinations(base, n)) {
          const cover = new Set();
          for (const b of combo) for (const p of b.pos) cover.add(p);
          if (cover.size !== n) continue;
          const lines = new Set(combo.map((b) => b.line));
          let progress = false;
          for (const cl of cover) {
            const unit = UNITS[byRow ? 9 + cl : cl];
            for (const i of unit) {
              const other = byRow ? ROW[i] : COL[i];
              if (!lines.has(other)) progress = this.eliminate(i, bit) || progress;
            }
          }
          if (progress) return true;
        }
      }
    }
    return false;
  }
}

const STEPS = [
  ['hiddenSingle', (s) => s.hiddenSingle()],
  ['nakedSingle', (s) => s.nakedSingle()],
  ['lockedCandidates', (s) => s.lockedCandidates()],
  ['nakedPair', (s) => s.nakedSubset(2)],
  ['hiddenPair', (s) => s.hiddenSubset(2)],
  ['nakedTriple', (s) => s.nakedSubset(3)],
  ['hiddenTriple', (s) => s.hiddenSubset(3)],
  ['xWing', (s) => s.fish(2)],
  ['swordfish', (s) => s.fish(3)],
];

/**
 * Grades a puzzle. Returns { level (1-5), difficulty, techniques: {name: count},
 * logicalSolve: boolean }. Assumes the puzzle is valid.
 */
export function grade(puzzle) {
  const state = new LogicState(typeof puzzle === 'string' ? toArray(puzzle) : puzzle);
  const used = {};
  let level = 1;
  while (!state.solved()) {
    if (state.broken()) break;
    let applied = null;
    for (const [name, fn] of STEPS) {
      if (fn(state)) {
        applied = name;
        break;
      }
    }
    if (!applied) break;
    used[applied] = (used[applied] || 0) + 1;
    level = Math.max(level, TECHNIQUES[applied].level);
  }
  const logicalSolve = state.solved();
  if (!logicalSolve) {
    used.guess = 1;
    level = 5;
  }
  return { level, difficulty: DIFFICULTIES[level - 1], techniques: used, logicalSolve };
}

/**
 * Finds a single for the hint system, preferring the easiest kind:
 *   { technique: 'hiddenSingle', index, digit, unit: 'box' | 'row' | 'col' }
 *   { technique: 'nakedSingle', index, digit }
 * `values` must only contain correct digits (0 for empty). Returns null when
 * the position needs harder techniques.
 */
export function findSingle(values) {
  const state = new LogicState(values);
  // Boxes first: that is how most people scan.
  const order = [[18, 'box'], [0, 'row'], [9, 'col']];
  for (const [offset, unit] of order) {
    for (let u = 0; u < 9; u++) {
      const cells = UNITS[offset + u];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        if (cells.some((i) => state.g[i] === d)) continue;
        const spots = cells.filter((i) => state.cands[i] & bit);
        if (spots.length === 1) return { technique: 'hiddenSingle', index: spots[0], digit: d, unit };
      }
    }
  }
  for (let i = 0; i < 81; i++) {
    if (!state.g[i] && popcount(state.cands[i]) === 1) {
      return { technique: 'nakedSingle', index: i, digit: bitToDigit(state.cands[i]) };
    }
  }
  return null;
}

/**
 * Hint for notes: the next logical step that removes something from the
 * player's own notes. Runs the same technique ladder as the grader on the
 * board's candidates and returns, after the first step whose result differs
 * from the notes, the digits that can go:
 *   { technique, cells: [{ index, mask }] }   or null.
 * Step 0 ('basic') is notes that clash with a digit already in the row,
 * column or box. `values` must only contain correct digits. Removals are
 * always safe: the logical candidates always contain the solution digit.
 */
export function noteEliminations(values, notes, maxSteps = 200) {
  const state = new LogicState(values);
  const removable = () => {
    const out = [];
    for (let i = 0; i < 81; i++) {
      if (values[i] || !notes[i]) continue;
      const allowed = state.g[i] ? 1 << (state.g[i] - 1) : state.cands[i];
      const mask = notes[i] & ~allowed;
      if (mask) out.push({ index: i, mask });
    }
    return out;
  };
  let cells = removable();
  if (cells.length) return { technique: 'basic', cells };
  for (let k = 0; k < maxSteps && !state.solved(); k++) {
    let applied = null;
    for (const [name, fn] of STEPS) {
      if (fn(state)) {
        applied = name;
        break;
      }
    }
    if (!applied) return null;
    cells = removable();
    if (cells.length) return { technique: applied, cells };
  }
  return null;
}

/** Candidate mask for every empty cell, based on the digits in `values`. */
export function candidates(values) {
  return new LogicState(values).cands;
}

// ---------------------------------------------------------------------------
// Validation of a single puzzle entry

/**
 * Validates { puzzle, solution? }. Returns { ok: true, puzzle, solution, givens }
 * or { ok: false, error }.
 */
export function validatePuzzle(rawPuzzle, rawSolution) {
  const puzzle = normalizeGrid(rawPuzzle);
  if (!puzzle) return { ok: false, error: 'Brettet må være 81 tegn med 1-9 og . eller 0 for tomme ruter.' };
  const givens = countGivens(puzzle);
  if (givens < 17) return { ok: false, error: `Bare ${givens} gitte tall. Et gyldig sudoku trenger minst 17.` };
  if (findConflicts(toArray(puzzle)).size) return { ok: false, error: 'De gitte tallene bryter reglene (samme tall to ganger i rad, kolonne eller boks).' };

  const { count, solution } = solve(puzzle, 2);
  if (count === 0) return { ok: false, error: 'Brettet har ingen løsning.' };
  if (count > 1) return { ok: false, error: 'Brettet har flere løsninger. Et ekte sudoku har nøyaktig én.' };

  if (rawSolution) {
    const given = normalizeGrid(rawSolution);
    if (!given || given.includes('.')) return { ok: false, error: 'Løsningen må være 81 sifre.' };
    if (given !== solution) return { ok: false, error: 'Oppgitt løsning stemmer ikke med brettet.' };
  }
  return { ok: true, puzzle, solution, givens };
}

// ---------------------------------------------------------------------------
// Import parser
//
// Accepts everything found in /puzzles:
//   * one puzzle per line (81 chars)                      single.txt, 2.csv
//   * "puzzle,solution" per line                          puso.txt
//   * CSV with a header (puzzle,solution,difficulty,...)  1.csv, 4.csv
//   * JSON lines {"id","puzzle","solution","difficulty"}  chunk_*.json
//   * a JSON array of such objects or strings
// plus a pasted 9x9 grid with any separators ("|", "+", "-", spaces).

const GRID_TOKEN = /^[0-9._*]{81}$/;

function pickDifficulty(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (DIFFICULTIES.includes(s) || s === 'unknown') return s;
  return undefined;
}

function fromObject(o) {
  if (typeof o === 'string') return { puzzle: o };
  if (!o || typeof o !== 'object') return null;
  const puzzle = o.puzzle ?? o.quiz ?? o.grid ?? o.board;
  if (typeof puzzle !== 'string') return null;
  return {
    puzzle,
    solution: typeof o.solution === 'string' ? o.solution : undefined,
    difficulty: pickDifficulty(o.difficulty),
    id: typeof o.id === 'string' ? o.id : undefined,
    name: typeof o.name === 'string' ? o.name : undefined,
  };
}

export function parseImport(text) {
  const entries = [];
  const errors = [];
  const src = String(text || '').replace(/^﻿/, '');
  const trimmed = src.trim();
  if (!trimmed) return { entries, errors };

  // Whole-document JSON (array or single object).
  if (trimmed[0] === '[' || (trimmed[0] === '{' && !trimmed.includes('\n'))) {
    try {
      const data = JSON.parse(trimmed);
      const list = Array.isArray(data) ? data : [data];
      list.forEach((o, k) => {
        const e = fromObject(o);
        if (e) entries.push({ ...e, line: k + 1 });
        else errors.push({ line: k + 1, message: 'Fant ikke noe "puzzle"-felt.' });
      });
      return { entries, errors };
    } catch {
      // fall through to line based parsing
    }
  }

  const lines = src.split(/\r?\n/);
  let header = null;
  let lineGrid = '';
  let lineGridStart = 0;

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;

    if (line[0] === '{') {
      try {
        const e = fromObject(JSON.parse(line));
        if (e) entries.push({ ...e, line: lineNo });
        else errors.push({ line: lineNo, message: 'Fant ikke noe "puzzle"-felt.' });
      } catch {
        errors.push({ line: lineNo, message: 'Ugyldig JSON.' });
      }
      return;
    }

    const cells = line.split(/[,;\t]/).map((s) => s.trim().replace(/^"|"$/g, ''));
    const lower = cells.map((s) => s.toLowerCase());
    if (lower.includes('puzzle') || lower.includes('quiz')) {
      header = lower;
      return;
    }

    if (header) {
      const o = {};
      header.forEach((h, k) => (o[h === 'quiz' ? 'puzzle' : h] = cells[k]));
      const e = fromObject(o);
      if (e && GRID_TOKEN.test(e.puzzle)) {
        entries.push({ ...e, line: lineNo });
        return;
      }
    }

    const tokens = line.split(/[\s,;\t]+/).map((s) => s.replace(/^"|"$/g, ''));
    const grids = tokens.filter((t) => GRID_TOKEN.test(t));
    if (grids.length) {
      const e = { puzzle: grids[0], line: lineNo };
      if (grids[1]) e.solution = grids[1];
      const diff = tokens.map(pickDifficulty).find(Boolean);
      if (diff) e.difficulty = diff;
      entries.push(e);
      return;
    }

    // Possibly one row of a pasted 9x9 grid.
    const digits = line.replace(/[^0-9._*]/g, '');
    if (digits.length === 9) {
      if (!lineGrid) lineGridStart = lineNo;
      lineGrid += digits;
      if (lineGrid.length === 81) {
        entries.push({ puzzle: lineGrid, line: lineGridStart });
        lineGrid = '';
      }
      return;
    }
    if (/^[-+=|\s]+$/.test(line)) return; // grid separator line
    errors.push({ line: lineNo, message: 'Fant ikke et brett på 81 tegn.' });
  });

  if (lineGrid) errors.push({ line: lineGridStart, message: 'Ufullstendig 9x9-rutenett.' });
  return { entries, errors };
}

// ---------------------------------------------------------------------------
// Generator

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A random complete, valid grid. */
export function randomSolution(random = Math.random) {
  return solve('.'.repeat(81), 1, random).solution;
}

/**
 * Generates a puzzle with a unique solution whose grade is as close as possible
 * to `target` (a DIFFICULTIES entry).
 *
 * 1. Start from a random full grid.
 * 2. Visit cells in random order (in 180° symmetric pairs) and blank them.
 * 3. Undo a removal if the puzzle gets more than one solution, or if it would
 *    require a harder technique than the target level.
 * Repeat a few times and keep the attempt that lands closest to the target.
 */
export function generate(target = 'medium', { random = Math.random, attempts = 400 } = {}) {
  const targetLevel = Math.max(1, DIFFICULTIES.indexOf(target) + 1);
  let best = null;
  for (let a = 0; a < attempts; a++) {
    const solution = randomSolution(random);
    const g = toArray(solution);
    const order = shuffle([...Array(41).keys()], random);
    for (const i of order) {
      const j = 80 - i;
      const saved = [g[i], g[j]];
      g[i] = 0;
      g[j] = 0;
      if (solve(g, 2).count !== 1 || grade(g).level > targetLevel) {
        g[i] = saved[0];
        g[j] = saved[1];
      }
    }
    const puzzle = toString(g);
    const level = grade(puzzle).level;
    const candidate = { puzzle, solution, level, difficulty: DIFFICULTIES[level - 1] };
    if (!best || Math.abs(level - targetLevel) < Math.abs(best.level - targetLevel)) best = candidate;
    if (level === targetLevel) break;
  }
  return best;
}
