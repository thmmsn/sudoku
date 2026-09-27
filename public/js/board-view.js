// The game screen, made for a phone in a dark room: the board, a row of
// digits and three small icons (notes, undo, menu). No clock, no level, no
// text. Time is still measured for the statistics.
//
// Rules for input (same digit clears, notes stay under a digit, a note clears
// the digit, digits are removed from the notes of their row, column and box)
// live in game-state.js.

import { h, icons } from './dom.js';
import { GameState } from './game-state.js';
import { ROW, COL } from './engine.js';

export class BoardView {
  /**
   * ctx: { settings, onSave(snapshot, { now }), onFinish(game),
   *        onNext(level), onMenu() }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.game = null;
    this.selected = -1;
    this.noteMode = false;
    this.finished = false;
    this.held = false; // clock held while the menu is open
    this.elapsed = 0;
    this.runningSince = null;
    this.cellKeys = new Array(81).fill('');
    this.flashed = new Set(); // cells changed by the last hint
    this.focusDigit = 0; // digit picked on the pad with no cell selected

    this.onKey = (e) => this.handleKey(e);
    this.onVisibility = () => {
      if (document.hidden) {
        this.stopClock();
        this.save(true);
      } else this.startClock();
    };
    this.onHide = () => {
      this.stopClock();
      this.save(true);
    };
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onHide);
    this.build();
  }

  destroy() {
    this.save(true);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onHide);
  }

  // -------------------------------------------------------------------------
  // Game lifecycle

  load(current) {
    this.game = new GameState(current, { autoRemoveNotes: this.ctx.settings.autoRemoveNotes });
    this.elapsed = current.elapsed || 0;
    this.runningSince = null;
    this.selected = -1;
    this.finished = false;
    this.cellKeys.fill('');
    this.startClock();
    this.render();
    if (this.game.isComplete()) this.complete();
  }

  hasProgress() {
    return !!this.game && !this.finished && this.game.hasProgress();
  }

  snapshot() {
    return this.game.snapshot(this.currentElapsed());
  }

  currentElapsed() {
    return this.elapsed + (this.runningSince ? (performance.now() - this.runningSince) / 1000 : 0);
  }

  startClock() {
    if (!this.game || this.runningSince || this.finished || this.held || document.hidden) return;
    this.runningSince = performance.now();
  }

  stopClock() {
    if (!this.runningSince) return;
    this.elapsed = this.currentElapsed();
    this.runningSince = null;
  }

  /** The menu holds the clock while it is open. */
  hold(on) {
    this.held = on;
    if (on) {
      this.stopClock();
      this.save();
    } else this.startClock();
  }

  /** Every change is handed over at once; the profile decides when to send it. */
  save(now = false) {
    if (!this.game || this.finished) return;
    this.ctx.onSave(this.snapshot(), { now });
  }

  complete() {
    if (this.finished) return;
    this.stopClock();
    this.finished = true;
    this.selected = -1;
    this.render();
    this.ctx.onFinish({ ...this.game.snapshot(this.elapsed), status: 'solved', seconds: Math.floor(this.elapsed) });
  }

  // -------------------------------------------------------------------------
  // Input

  edit(fn) {
    if (!this.game || this.finished || this.held) return;
    fn();
    this.render();
    this.save();
    if (this.game.isComplete()) this.complete();
  }

  digit(d) {
    // No cell selected: the digit is marked on the whole board instead
    // (tap it again to clear).
    if (this.selected < 0) {
      this.focusDigit = this.focusDigit === d ? 0 : d;
      return this.render();
    }
    const i = this.selected;
    this.edit(() => (this.noteMode ? this.game.toggleNote(i, d) : this.game.setValue(i, d)));
  }

  erase() {
    if (this.selected < 0) return;
    const i = this.selected;
    this.edit(() => this.game.erase(i));
  }

  select(i) {
    if (!this.game || this.finished || this.held) return;
    this.selected = i;
    this.focusDigit = 0;
    this.render();
  }

  toggleNoteMode() {
    this.noteMode = !this.noteMode;
    this.render();
  }

  /**
   * Hints from the menu: 'notes' fills in candidates, 'eliminate' removes
   * notes, 'digit' places one digit. The cells that changed light up briefly.
   * Returns null when the hint had nothing to do.
   */
  hint(kind) {
    if (!this.game || this.finished) return null;
    const g = this.game;
    const sel = this.selected;
    const r = kind === 'notes' ? g.hintNotes() : kind === 'eliminate' ? g.hintEliminate(sel) : g.hint(sel);
    if (!r) return null;
    this.flashed = new Set(r.cells || (r.index >= 0 ? [r.index] : []));
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashed = new Set();
      this.render();
    }, 1500);
    this.render();
    this.save(true);
    if (g.isComplete()) this.complete();
    return r;
  }

  // Keyboard, for completeness: 1-9, Backspace, arrows/WASD, Shift for notes,
  // Ctrl+Z / Ctrl+Y.
  handleKey(e) {
    if (!this.game || !this.root.isConnected || this.held) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && !e.altKey && (key === 'z' || key === 'y')) {
      e.preventDefault();
      return this.edit(() => (key === 'z' && !e.shiftKey ? this.game.undo() : this.game.redo()));
    }
    if (mod || e.altKey) return;
    if (key === 'Shift') {
      if (!e.repeat) this.toggleNoteMode();
      return;
    }
    if (/^[1-9]$/.test(key)) {
      e.preventDefault();
      return this.digit(Number(key));
    }
    if (key === 'Backspace' || key === 'Delete') {
      e.preventDefault();
      return this.erase();
    }
    const dir = { ArrowUp: [-1, 0], w: [-1, 0], ArrowDown: [1, 0], s: [1, 0], ArrowLeft: [0, -1], a: [0, -1], ArrowRight: [0, 1], d: [0, 1] }[key];
    if (dir) {
      e.preventDefault();
      const i = this.selected < 0 ? 40 : this.selected;
      this.select(((ROW[i] + dir[0] + 9) % 9) * 9 + ((COL[i] + dir[1] + 9) % 9));
    }
  }

  // -------------------------------------------------------------------------
  // DOM

  build() {
    this.cells = [];
    this.boardEl = h('div', { class: 'board', role: 'grid', 'aria-label': 'Sudokubrett' });
    for (let i = 0; i < 81; i++) {
      const cell = h('div', { class: 'cell', role: 'gridcell', dataset: { i } });
      this.cells.push(cell);
      this.boardEl.append(cell);
    }
    this.boardEl.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell');
      if (cell && !this.finished) this.select(Number(cell.dataset.i));
    });

    this.keys = [];
    this.padEl = h('div', { class: 'pad' });
    for (let d = 1; d <= 9; d++) {
      const key = h('button', { class: 'key', type: 'button', 'aria-label': String(d) }, String(d));
      key.addEventListener('click', () => this.digit(d));
      this.keys.push(key);
      this.padEl.append(key);
    }

    const tool = (label, icon, onclick, extra = {}) =>
      h('button', { class: 'tool', type: 'button', 'aria-label': label, title: label, onclick, ...extra }, icon);
    this.pencilBtn = tool('Notater', icons.pencil(), () => this.toggleNoteMode(), { 'aria-pressed': 'false' });
    this.undoBtn = tool('Angre', icons.undo(), () => this.edit(() => this.game.undo()));
    this.nextBtn = tool('Neste brett', icons.next(), () => this.ctx.onNext(this.game.meta.difficulty), { hidden: true });
    const menuBtn = tool('Meny', icons.menu(), () => this.ctx.onMenu());

    this.root = h('div', { class: 'game' },
      h('div', { class: 'board-area' }, this.boardEl),
      this.padEl,
      h('div', { class: 'tools' }, this.pencilBtn, this.undoBtn, this.nextBtn, menuBtn));
  }

  render() {
    if (!this.game) return;
    const st = this.ctx.settings;
    const g = this.game;
    const sel = this.selected;
    const selValue = sel >= 0 ? g.values[sel] : 0;
    // The digit to mark: the selected cell's digit, or one picked on the pad.
    const mark = st.highlightSame && !this.finished ? selValue || this.focusDigit : 0;
    // A full board that is wrong shows which cells are wrong.
    const wrong = g.isFull() && !this.finished ? new Set(g.wrongCells()) : null;

    this.boardEl.classList.toggle('solved', this.finished);
    for (let i = 0; i < 81; i++) {
      const c = COL[i];
      const r = ROW[i];
      const v = g.values[i];
      const cls = ['cell'];
      if (c === 2 || c === 5) cls.push('box-right');
      if (r === 2 || r === 5) cls.push('box-bottom');
      if (c === 8) cls.push('last-col');
      if (r === 8) cls.push('last-row');
      if (g.givens[i]) cls.push('given');
      if (i === sel) cls.push('selected');
      if (mark && v === mark) cls.push('same');
      if (wrong?.has(i)) cls.push('wrong');
      if (this.flashed.has(i)) cls.push('hinted');
      const className = cls.join(' ');
      const el = this.cells[i];
      if (el.className !== className) el.className = className;

      const hit = mark && g.notes[i] & (1 << (mark - 1)) ? mark : 0;
      const key = v ? `v${v}` : `n${g.notes[i]}:${hit}`;
      if (this.cellKeys[i] === key) continue;
      this.cellKeys[i] = key;
      const where = `Rad ${r + 1}, kolonne ${c + 1}`;
      if (v) {
        el.replaceChildren(h('span', { class: 'd' }, String(v)));
        el.setAttribute('aria-label', `${where}: ${v}`);
      } else if (g.notes[i]) {
        const notes = h('div', { class: 'notes' });
        for (let d = 1; d <= 9; d++) {
          const on = g.notes[i] & (1 << (d - 1));
          notes.append(h('span', { class: d === hit ? 'hit' : undefined }, on ? String(d) : ''));
        }
        el.replaceChildren(notes);
        el.setAttribute('aria-label', `${where}: notater`);
      } else {
        el.textContent = '';
        el.setAttribute('aria-label', `${where}: tom`);
      }
    }

    // A digit that is on the board 9 times fades on the pad.
    const remaining = g.remaining();
    this.keys.forEach((k, idx) => {
      k.classList.toggle('done', remaining[idx + 1] === 0);
      k.classList.toggle('focus', mark === idx + 1);
    });
    this.padEl.classList.toggle('notes-mode', this.noteMode);
    this.padEl.classList.toggle('gone', this.finished);
    this.pencilBtn.setAttribute('aria-pressed', String(this.noteMode));
    this.pencilBtn.hidden = this.finished;
    this.undoBtn.hidden = this.finished;
    this.nextBtn.hidden = !this.finished;
  }
}
