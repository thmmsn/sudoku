// The game, laid out after the Adressa screenshots:
//
//   [0:07 (II)]   [Veldig lett | Lett | Middels | Vanskelig | Ekspert]   [restart] [trash]
//   9x9 board: checkerboard cells, thick box lines, bold navy givens,
//              regular-weight player digits, selected cell navy with white
//              digit, other cells with the same digit blue-grey
//   [1][2][3][4][5][6][7][8][9] [pencil]
//
// From the screenshots: notes in a 3x3 layout; number keys dark, except light
// with a navy outline while the selected cell already holds a digit.
// Not in the screenshots yet (placeholders): how note mode, mistakes, pause and
// a solved board look. The line under the pad is a temporary stand-in.

import { h, icons, formatTime } from './dom.js';
import { GameState } from './game-state.js';
import { ROW, COL, DIFFICULTIES, DIFFICULTY_LABELS } from './engine.js';

export class BoardView {
  /**
   * ctx: { settings, onSave(snapshot, { now }), onFinish(game), onLevel(level) }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.game = null;
    this.selected = -1;
    this.noteMode = false;
    this.paused = false;
    this.finished = false;
    this.elapsed = 0;
    this.runningSince = null;
    this.saveTimer = null;
    this.cellKeys = new Array(81).fill('');

    this.onKey = (e) => this.handleKey(e);
    this.onVisibility = () => {
      if (document.hidden) {
        this.stopClock();
        this.save(true);
      } else this.startClock();
    };
    this.onHide = () => this.save(true);
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onHide);
    this.ticker = setInterval(() => this.renderTimer(), 500);
    this.build();
  }

  destroy() {
    this.save(true);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onHide);
    clearInterval(this.ticker);
  }

  // -------------------------------------------------------------------------
  // Game lifecycle

  load(current) {
    this.game = new GameState(current, { autoRemoveNotes: this.ctx.settings.autoRemoveNotes });
    this.elapsed = current.elapsed || 0;
    this.runningSince = null;
    this.selected = -1;
    this.noteMode = false;
    this.paused = false;
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
    if (!this.game || this.runningSince || this.paused || this.finished || document.hidden) return;
    this.runningSince = performance.now();
  }

  stopClock() {
    if (!this.runningSince) return;
    this.elapsed = this.currentElapsed();
    this.runningSince = null;
  }

  togglePause(force) {
    if (!this.game || this.finished) return;
    this.paused = force ?? !this.paused;
    if (this.paused) this.stopClock();
    else this.startClock();
    this.render();
    this.save();
  }

  save(now = false) {
    if (!this.game || this.finished) return;
    clearTimeout(this.saveTimer);
    const run = () => this.ctx.onSave(this.snapshot(), { now });
    if (now) run();
    else this.saveTimer = setTimeout(run, 700);
  }

  complete() {
    if (this.finished) return;
    this.stopClock();
    this.finished = true;
    this.selected = -1;
    clearTimeout(this.saveTimer);
    this.render();
    this.ctx.onFinish({ ...this.game.snapshot(this.elapsed), status: 'solved', seconds: Math.floor(this.elapsed) }); // same as the timer showed
  }

  // -------------------------------------------------------------------------
  // Input

  /** Any edit resumes a paused clock. */
  edit(fn) {
    if (!this.game || this.finished) return;
    if (this.paused) this.togglePause(false);
    const result = fn();
    this.render();
    this.save();
    if (result?.completed || this.game.isComplete()) this.complete();
  }

  digit(d, asNote = false) {
    if (this.selected < 0) return;
    const i = this.selected;
    this.edit(() => (asNote || this.noteMode ? this.game.toggleNote(i, d) : this.game.setValue(i, d)));
  }

  erase() {
    if (this.selected < 0) return;
    const i = this.selected;
    this.edit(() => this.game.erase(i));
  }

  select(i) {
    if (!this.game || this.finished) return;
    if (this.paused) this.togglePause(false);
    this.selected = i;
    this.render();
  }

  handleKey(e) {
    if (!this.game || !this.root.isConnected) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      return this.edit(() => (e.shiftKey ? this.game.redo() : this.game.undo()));
    }
    if (mod && key === 'y') {
      e.preventDefault();
      return this.edit(() => this.game.redo());
    }
    if (mod || e.altKey) return;

    // e.code, because Shift+1 gives "!" as e.key.
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (m) {
      e.preventDefault();
      const d = Number(m[1]);
      if (this.selected < 0) this.select(0);
      return d === 0 ? this.erase() : this.digit(d, e.shiftKey);
    }

    const step = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] }[key];
    if (step) {
      e.preventDefault();
      const i = this.selected < 0 ? 40 : this.selected;
      const r = (ROW[i] + step[0] + 9) % 9;
      const c = (COL[i] + step[1] + 9) % 9;
      return this.select(r * 9 + c);
    }

    if (key === 'backspace' || key === 'delete') {
      e.preventDefault();
      return this.erase();
    }
    if (key === 'n') {
      this.noteMode = !this.noteMode;
      return this.render();
    }
    if (key === 'escape') {
      this.selected = -1;
      return this.render();
    }
  }

  // -------------------------------------------------------------------------
  // DOM

  build() {
    this.timerEl = h('span', { class: 'timer', 'aria-label': 'Tid' });
    this.pauseBtn = h('button', { class: 'icon-btn', type: 'button', onclick: () => this.togglePause() });

    this.levelBtns = DIFFICULTIES.map((d) =>
      h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => this.ctx.onLevel(d) }, DIFFICULTY_LABELS[d]),
    );

    const restart = h('button', {
      class: 'icon-btn',
      type: 'button',
      title: 'Start brettet på nytt (kan angres med Ctrl+Z)',
      'aria-label': 'Start brettet på nytt',
      onclick: () => this.edit(() => this.game.restart()),
    }, icons.restart());
    const trash = h('button', {
      class: 'icon-btn',
      type: 'button',
      title: 'Slett tallet i valgt rute',
      'aria-label': 'Slett tallet i valgt rute',
      onclick: () => this.erase(),
    }, icons.trash());

    const bar = h(
      'div',
      { class: 'game-bar' },
      h('div', { class: 'left' }, this.timerEl, this.pauseBtn),
      h('div', { class: 'levels', role: 'group', 'aria-label': 'Vanskelighetsgrad' }, this.levelBtns),
      h('div', { class: 'right' }, restart, trash),
    );

    this.cells = [];
    this.boardEl = h('div', { class: 'board', role: 'grid', 'aria-label': 'Sudokubrett' });
    for (let i = 0; i < 81; i++) {
      const cell = h('div', { class: 'cell', role: 'gridcell', dataset: { i } });
      this.cells.push(cell);
      this.boardEl.append(cell);
    }
    this.boardEl.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell');
      if (cell) this.select(Number(cell.dataset.i));
    });

    this.padEl = h('div', { class: 'pad' });
    for (let d = 1; d <= 9; d++) {
      const key = h('button', { class: 'key', type: 'button', 'aria-label': `Skriv ${d}` }, String(d));
      key.addEventListener('click', () => this.digit(d));
      this.padEl.append(key);
    }
    this.pencilBtn = h('button', {
      class: 'icon-btn pencil',
      type: 'button',
      'aria-label': 'Notater',
      'aria-pressed': 'false',
      title: 'Notater av/på (N). Shift + tall skriver alltid notat.',
      onclick: () => {
        this.noteMode = !this.noteMode;
        this.render();
      },
    }, icons.pencil());
    this.padEl.append(this.pencilBtn);

    this.statusEl = h('p', { class: 'status-line', role: 'status' });

    this.root = h('div', { class: 'game' }, bar, this.boardEl, this.padEl, this.statusEl);
  }

  renderTimer() {
    if (this.game) this.timerEl.textContent = formatTime(this.currentElapsed());
  }

  render() {
    if (!this.game) return;
    const st = this.ctx.settings;
    const g = this.game;
    const sel = this.selected;
    const selValue = sel >= 0 ? g.values[sel] : 0;

    this.renderTimer();
    this.timerEl.hidden = !st.showTimer;
    this.pauseBtn.replaceChildren(this.paused ? icons.play() : icons.pause());
    this.pauseBtn.setAttribute('aria-label', this.paused ? 'Fortsett' : 'Pause');
    this.pauseBtn.setAttribute('aria-disabled', String(this.finished));
    this.levelBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(DIFFICULTIES[k] === g.meta.difficulty)));
    this.boardEl.classList.toggle('paused', this.paused);

    for (let i = 0; i < 81; i++) {
      const r = ROW[i];
      const c = COL[i];
      const v = g.values[i];
      const cls = ['cell'];
      if ((r + c) % 2 === 0) cls.push('a');
      if (c === 2 || c === 5) cls.push('box-right');
      if (r === 2 || r === 5) cls.push('box-bottom');
      if (g.givens[i]) cls.push('given');
      if (i === sel) cls.push('selected');
      else if (st.highlightSame && selValue && v === selValue) cls.push('same');
      const className = cls.join(' ');
      const el = this.cells[i];
      if (el.className !== className) el.className = className;

      const key = v ? `v${v}` : `n${g.notes[i]}`;
      if (this.cellKeys[i] === key) continue;
      this.cellKeys[i] = key;
      const where = `Rad ${r + 1}, kolonne ${c + 1}`;
      if (v) {
        el.textContent = String(v);
        el.setAttribute('aria-label', `${where}: ${v}`);
      } else if (g.notes[i]) {
        const notes = h('div', { class: 'notes' });
        for (let d = 1; d <= 9; d++) notes.append(h('span', {}, g.notes[i] & (1 << (d - 1)) ? String(d) : ''));
        el.replaceChildren(notes);
        el.setAttribute('aria-label', `${where}: notater`);
      } else {
        el.textContent = '';
        el.setAttribute('aria-label', `${where}: tom`);
      }
    }

    this.padEl.classList.toggle('light', sel >= 0 && selValue !== 0);
    this.pencilBtn.setAttribute('aria-pressed', String(this.noteMode));

    // Temporary text until there are screenshots of these states.
    let status = '';
    if (this.finished) status = `Løst på ${formatTime(this.elapsed)}.`;
    else if (this.paused) status = 'Pause.';
    else if (this.noteMode) status = 'Blyant: på';
    this.statusEl.textContent = status;
  }
}
