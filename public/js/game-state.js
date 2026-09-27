// Game model without any DOM: values, notes, undo/redo, mistakes, hints and
// completion. The (not yet designed) view only reads this state and calls these
// methods, so all rules live here and are covered by tests.
//
// Notes are 9 bit masks per cell, bit (d - 1) meaning "d is pencilled in".

import { PEERS, UNITS, toArray, candidates, findSingle } from './engine.js';

export class GameState {
  /**
   * current: { puzzle, solution, values?, notes?, elapsed?, mistakes?, hints?,
   *            puzzleId?, source?, difficulty?, startedAt? }
   * options: { autoRemoveNotes = true, countMistakes = true }
   */
  constructor(current, options = {}) {
    this.options = { autoRemoveNotes: true, countMistakes: true, ...options };
    this.meta = {
      puzzleId: current.puzzleId,
      source: current.source,
      difficulty: current.difficulty,
      puzzle: current.puzzle,
      solution: current.solution,
      startedAt: current.startedAt || new Date().toISOString(),
    };
    this.givens = toArray(current.puzzle).map(Boolean);
    this.sol = toArray(current.solution);
    this.values = toArray(current.values || current.puzzle);
    this.notes = Array.isArray(current.notes) && current.notes.length === 81 ? current.notes.slice() : new Array(81).fill(0);
    this.elapsed = current.elapsed || 0;
    this.mistakes = current.mistakes || 0;
    this.hints = current.hints || 0;
    this.undoStack = [];
    this.redoStack = [];
  }

  // -------------------------------------------------------------------------
  // Queries

  canEdit(i) {
    return Number.isInteger(i) && i >= 0 && i < 81 && !this.givens[i];
  }

  isComplete() {
    return this.values.every((v, i) => v === this.sol[i]);
  }

  hasProgress() {
    return this.values.some((v, i) => v && !this.givens[i]);
  }

  /** Cells whose digit also appears elsewhere in the same row, column or box. */
  conflicts() {
    const out = new Set();
    for (const unit of UNITS) {
      const seen = new Map();
      for (const i of unit) {
        const v = this.values[i];
        if (!v) continue;
        if (seen.has(v)) {
          out.add(i);
          out.add(seen.get(v));
        } else seen.set(v, i);
      }
    }
    return out;
  }

  /** Cells holding a digit that differs from the solution. */
  wrongCells() {
    const out = [];
    for (let i = 0; i < 81; i++) if (this.values[i] && this.values[i] !== this.sol[i]) out.push(i);
    return out;
  }

  /** How many of each digit 1-9 are still missing (index 0 unused). */
  remaining() {
    const r = new Array(10).fill(9);
    r[0] = 0;
    for (const v of this.values) if (v) r[v]--;
    return r.map((n) => Math.max(0, n));
  }

  snapshot(elapsed = this.elapsed) {
    return {
      ...this.meta,
      values: this.values.map((v) => (v ? String(v) : '.')).join(''),
      notes: this.notes.slice(),
      elapsed: Math.round(elapsed),
      mistakes: this.mistakes,
      hints: this.hints,
    };
  }

  // -------------------------------------------------------------------------
  // Changes. Every edit is one undo step, even when it touches many cells
  // (placing a digit also clears that digit from the peers' notes).

  commit(changes) {
    const record = [];
    for (const c of changes) {
      const pv = this.values[c.i];
      const pn = this.notes[c.i];
      if (pv === c.v && pn === c.n) continue;
      record.push({ i: c.i, pv, pn, v: c.v, n: c.n });
      this.values[c.i] = c.v;
      this.notes[c.i] = c.n;
    }
    if (!record.length) return false;
    this.undoStack.push(record);
    if (this.undoStack.length > 500) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }

  /**
   * Places digit d in cell i. Placing the digit that is already there clears
   * the cell. Returns { changed, wrong, completed }.
   */
  setValue(i, d) {
    if (!this.canEdit(i) || !(d >= 1 && d <= 9)) return { changed: false, wrong: false, completed: false };
    if (this.values[i] === d) return { ...this.erase(i), wrong: false };
    const bit = 1 << (d - 1);
    const changes = [{ i, v: d, n: 0 }];
    if (this.options.autoRemoveNotes) {
      for (const p of PEERS[i]) {
        if (this.notes[p] & bit) changes.push({ i: p, v: this.values[p], n: this.notes[p] & ~bit });
      }
    }
    const changed = this.commit(changes);
    const wrong = d !== this.sol[i];
    if (wrong && this.options.countMistakes) this.mistakes++;
    return { changed, wrong, completed: this.isComplete() };
  }

  /** Toggles pencil mark d in cell i. Not allowed while the cell holds a digit. */
  toggleNote(i, d) {
    if (!this.canEdit(i) || this.values[i] || !(d >= 1 && d <= 9)) return { changed: false };
    return { changed: this.commit([{ i, v: 0, n: this.notes[i] ^ (1 << (d - 1)) }]) };
  }

  /** Clears the digit, or if there is none, the notes of cell i. */
  erase(i) {
    if (!this.canEdit(i)) return { changed: false, completed: false };
    return { changed: this.commit([{ i, v: 0, n: 0 }]), completed: false };
  }

  undo() {
    const rec = this.undoStack.pop();
    if (!rec) return null;
    for (const c of rec) {
      this.values[c.i] = c.pv;
      this.notes[c.i] = c.pn;
    }
    this.redoStack.push(rec);
    return rec[0].i;
  }

  redo() {
    const rec = this.redoStack.pop();
    if (!rec) return null;
    for (const c of rec) {
      this.values[c.i] = c.v;
      this.notes[c.i] = c.n;
    }
    this.undoStack.push(rec);
    return rec[0].i;
  }

  /** Writes every legal candidate into every empty cell. */
  fillAllNotes() {
    const masks = candidates(this.values);
    const changes = [];
    for (let i = 0; i < 81; i++) if (!this.values[i]) changes.push({ i, v: 0, n: masks[i] });
    return this.commit(changes);
  }

  clearAllNotes() {
    const changes = [];
    for (let i = 0; i < 81; i++) if (this.notes[i]) changes.push({ i, v: this.values[i], n: 0 });
    return this.commit(changes);
  }

  /** Removes everything the player wrote. One undo step. */
  restart() {
    const changes = [];
    for (let i = 0; i < 81; i++) if (!this.givens[i]) changes.push({ i, v: 0, n: 0 });
    return this.commit(changes);
  }

  // -------------------------------------------------------------------------
  // Hints
  //
  // In order of usefulness:
  //  1. a wrong digit on the board is removed (you can't progress past it),
  //  2. the selected empty cell gets its digit,
  //  3. otherwise the easiest single on the board is placed, with the reason,
  //  4. if no single exists, the first empty cell is filled.
  // Every call counts as one hint.

  hint(selected = -1) {
    if (this.isComplete()) return null;
    this.hints++;

    const wrong = this.wrongCells();
    if (wrong.length) {
      const i = wrong.includes(selected) ? selected : wrong[0];
      this.commit([{ i, v: 0, n: 0 }]);
      return {
        type: 'wrong',
        index: i,
        wrongCount: wrong.length,
        message: wrong.length === 1 ? 'Denne ruten var feil, så tallet er fjernet.' : `${wrong.length} ruter er feil. Denne er fjernet.`,
      };
    }

    const place = (type, i, d, message, extra = {}) => {
      const counted = this.options.countMistakes;
      this.options.countMistakes = false; // a hint is never a mistake
      const r = this.setValue(i, d);
      this.options.countMistakes = counted;
      return { type, index: i, digit: d, message, completed: r.completed, ...extra };
    };

    if (this.canEdit(selected) && !this.values[selected]) {
      return place('selected', selected, this.sol[selected], `Riktig tall her er ${this.sol[selected]}.`);
    }

    const single = findSingle(this.values);
    if (single) {
      const where = { box: 'i denne boksen', row: 'i denne raden', col: 'i denne kolonnen' }[single.unit];
      const message =
        single.technique === 'hiddenSingle'
          ? `${single.digit} kan bare stå her ${where}.`
          : `Denne ruten kan bare være ${single.digit}: alle andre tall finnes allerede i raden, kolonnen eller boksen.`;
      return place(single.technique, single.index, single.digit, message, { unit: single.unit });
    }

    const i = this.values.findIndex((v) => !v);
    return place('free', i, this.sol[i], 'Ingen enkel singel nå. Her er ett tall gratis.');
  }
}
