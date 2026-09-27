// The game. Behaviour follows Adressa's sudoku.js (static.polarismedia.no/
// hjernetrim/sudoku/prod/sudoku.js, read as a reference, not copied). The look
// follows screenshots of the same game; its CSS is not in that file.
//
//   [0:07 (II)]   [Veldig lett | Lett | Middels | Vanskelig | Ekspert]   [angre] [fjern] [?]
//   9x9 board
//   [1][2][3][4][5][6][7][8][9] [notater]
//
// From sudoku.js:
//   - selected cell, bold givens, cells holding the selected cell's digit marked
//   - number mode: the same digit again clears the cell; a digit is removed from
//     the notes in its row, column and box; a full board is checked
//   - notes mode: clears the cell's digit and toggles the note; notes stay
//     underneath a digit and show again when it is cleared
//   - number keys: a digit that is on the board 9 times is marked (numbers mode
//     only); the whole pad changes look in notes mode
//   - tools: undo, and clear everything (undoable)
//   - keys: arrows or WASD move (left/right wrap within the row, up/down within
//     the column), 1-9 enter, Backspace clears, Shift switches numbers/notes
//   - pause overlay ("Sudoku", "PAUSE", "Fortsett"); pauses on window blur, on
//     a hidden tab and when leaving the page
//   - a full but wrong board pauses and says "Noe er feil i løsningen din"
//   - solved: confetti for 5 s and a modal with the time and the 4 best times
//     on the level, "Ny runde" and a close button; play then starts a new game
//   - clicking a level, also the current one, starts a new game
//   - help modal with two pages, "Start" on the first visit, "Lukk" later
//
// My own additions (not in sudoku.js): a fifth level, redo (Ctrl+Y), Ctrl+Z,
// Delete, Backspace on an empty cell clears its notes, no input while paused,
// a confirmation before leaving a started game (it is saved as not finished in
// the statistics), and the settings for same-digit marking, the timer and the
// automatic note removal.

import { h, icons, formatClock } from './dom.js';
import { GameState } from './game-state.js';
import { ROW, COL, DIFFICULTIES, DIFFICULTY_LABELS } from './engine.js';
import { local } from './api.js';

// Confetti colours from sudoku.js.
const CONFETTI = ['#04547c', '#6694AC', '#E0287E', '#FFB134', '#37C410'];

export class BoardView {
  /**
   * ctx: { settings, onSave(snapshot, { now }), onFinish(game) -> Promise,
   *        onLevel(level), bestTimes(level) -> seconds[] (ascending) }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.game = null;
    this.selected = -1;
    this.noteMode = false;
    this.paused = false;
    this.wrong = false;
    this.finished = false;
    this.modal = null; // 'info' | 'result' | null
    this.elapsed = 0;
    this.runningSince = null;
    this.saveTimer = null;
    this.cellKeys = new Array(81).fill('');

    this.onKey = (e) => this.handleKey(e);
    this.onBlur = () => {
      if (!this.modal) this.pause();
    };
    this.onVisibility = () => {
      if (document.hidden) {
        this.pause();
        this.save(true);
      }
    };
    this.onHide = () => {
      this.pause();
      this.save(true);
    };
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pagehide', this.onHide);
    this.ticker = setInterval(() => this.renderTimer(), 500);
    this.build();
  }

  destroy() {
    this.save(true);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pagehide', this.onHide);
    clearInterval(this.ticker);
    this.stopConfetti?.();
  }

  // -------------------------------------------------------------------------
  // Game lifecycle

  /**
   * resume: true when continuing a saved game. As in sudoku.js, leaving the
   * page pauses, so a game that has been played comes back paused.
   */
  load(current, { resume = false } = {}) {
    this.game = new GameState(current, { autoRemoveNotes: this.ctx.settings.autoRemoveNotes });
    this.elapsed = current.elapsed || 0;
    this.runningSince = null;
    this.selected = -1;
    this.paused = resume && this.elapsed > 0;
    this.wrong = false;
    this.finished = false;
    this.stopConfetti?.();
    this.closeModal();
    this.cellKeys.fill('');
    this.startClock();
    this.render();
    if (this.game.isComplete()) this.complete();
    else if (!local.get('infoSeen')) this.openInfo(true);
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
    if (!this.game || this.runningSince || this.paused || this.finished || this.modal || document.hidden) return;
    this.runningSince = performance.now();
  }

  stopClock() {
    if (!this.runningSince) return;
    this.elapsed = this.currentElapsed();
    this.runningSince = null;
  }

  pause() {
    if (!this.game || this.finished || this.paused) return;
    this.paused = true;
    this.stopClock();
    this.render();
    this.save();
  }

  resume() {
    if (!this.game || this.finished) return;
    this.paused = false;
    this.wrong = false;
    this.startClock();
    this.render();
  }

  /** The play/pause button. After a win, play starts a new game (sudoku.js). */
  playPause() {
    if (!this.game) return;
    if (this.finished) return this.ctx.onLevel(this.game.meta.difficulty);
    if (this.paused) this.resume();
    else this.pause();
  }

  save(now = false) {
    if (!this.game || this.finished) return;
    clearTimeout(this.saveTimer);
    const run = () => this.ctx.onSave(this.snapshot(), { now });
    if (now) run();
    else this.saveTimer = setTimeout(run, 700);
  }

  async complete() {
    if (this.finished) return;
    this.stopClock();
    this.finished = true;
    this.paused = false;
    clearTimeout(this.saveTimer);
    this.render();
    const seconds = Math.floor(this.elapsed); // same as the timer showed
    await this.ctx.onFinish({ ...this.game.snapshot(this.elapsed), status: 'solved', seconds });
    if (!this.root.isConnected || !this.finished) return;
    this.openResult(seconds);
    this.confetti();
  }

  // -------------------------------------------------------------------------
  // Input

  /** Runs one change to the game. Blocked while paused, finished or a modal is open. */
  edit(fn) {
    if (!this.game || this.finished || this.paused || this.modal) return false;
    fn();
    this.render();
    this.save();
    if (this.game.isComplete()) this.complete();
    return true;
  }

  digit(d) {
    if (this.selected < 0) return;
    const i = this.selected;
    if (this.noteMode) return this.edit(() => this.game.toggleNote(i, d));
    // sudoku.js checks the board when a digit makes it full; a wrong board
    // pauses the game and says so in the pause overlay.
    if (this.edit(() => this.game.setValue(i, d)) && !this.finished && this.game.isFull()) {
      this.wrong = true;
      this.pause();
    }
  }

  erase() {
    if (this.selected < 0) return;
    const i = this.selected;
    this.edit(() => this.game.erase(i));
  }

  select(i) {
    if (!this.game || this.finished || this.paused || this.modal) return;
    this.selected = i;
    this.render();
  }

  toggleNoteMode() {
    this.noteMode = !this.noteMode;
    this.announce(this.noteMode ? 'Notater' : 'Tall');
    this.render();
  }

  handleKey(e) {
    if (!this.game || !this.root.isConnected || this.modal) return;
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

    const dir = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' }[key];
    if (dir) {
      e.preventDefault();
      if (this.selected < 0) return; // sudoku.js only moves an existing selection
      const i = this.selected;
      const r = ROW[i];
      const c = COL[i];
      const next = {
        up: ((r + 8) % 9) * 9 + c,
        down: ((r + 1) % 9) * 9 + c,
        left: r * 9 + ((c + 8) % 9),
        right: r * 9 + ((c + 1) % 9),
      }[dir];
      this.select(next);
    }
  }

  // -------------------------------------------------------------------------
  // DOM

  build() {
    this.timerEl = h('span', { class: 'timer', 'aria-label': 'Tid' });
    this.pauseBtn = h('button', { class: 'icon-btn', type: 'button', onclick: () => this.playPause() });

    this.levelBtns = DIFFICULTIES.map((d) =>
      h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => this.ctx.onLevel(d) }, DIFFICULTY_LABELS[d]),
    );

    const undo = h('button', {
      class: 'icon-btn',
      type: 'button',
      title: 'Angre',
      'aria-label': 'Angre',
      onclick: () => this.edit(() => this.game.undo()),
    }, icons.undo());
    const clear = h('button', {
      class: 'icon-btn',
      type: 'button',
      title: 'Fjern alt du har lagt inn av tall og notater. Kan angres.',
      'aria-label': 'Fjern alle tall og notater',
      onclick: () => this.edit(() => this.game.restart()),
    }, icons.trash());
    const help = h('button', {
      class: 'icon-btn',
      type: 'button',
      title: 'Hjelp',
      'aria-label': 'Hjelp',
      onclick: () => this.openInfo(false),
    }, icons.question());

    const bar = h(
      'div',
      { class: 'game-bar' },
      h('div', { class: 'levels', role: 'group', 'aria-label': 'Nytt spill, vanskelighetsgrad' }, this.levelBtns),
      h('div', { class: 'left' }, this.timerEl, this.pauseBtn),
      h('div', { class: 'right' }, undo, clear, help),
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

    this.wrongEl = h('p', { class: 'wrong' }, 'Noe er feil i løsningen din');
    this.overlay = h('div', { class: 'pause-overlay', hidden: true },
      h('p', { class: 'name' }, 'Sudoku'),
      h('p', { class: 'subtitle' }, 'PAUSE'),
      this.wrongEl,
      h('button', { class: 'btn', type: 'button', onclick: () => this.resume() }, 'Fortsett'));

    this.keys = [];
    this.padEl = h('div', { class: 'pad' });
    for (let d = 1; d <= 9; d++) {
      const key = h('button', { class: 'key', type: 'button', 'aria-label': `Skriv ${d}` }, String(d));
      key.addEventListener('click', () => this.digit(d));
      this.keys.push(key);
      this.padEl.append(key);
    }
    this.pencilBtn = h('button', {
      class: 'icon-btn pencil',
      type: 'button',
      'aria-label': 'Notater',
      'aria-pressed': 'false',
      title: 'Bytt mellom tall og notater (Shift)',
      onclick: () => this.toggleNoteMode(),
    }, icons.pencil());
    this.padEl.append(this.pencilBtn);

    this.liveEl = h('p', { class: 'visually-hidden', role: 'status' });
    this.dialog = h('dialog', { class: 'modal' });
    this.dialog.addEventListener('cancel', (e) => {
      e.preventDefault(); // Esc
      if (this.modal === 'info') this.closeInfo();
      else this.closeModal();
    });

    this.root = h('div', { class: 'game' },
      bar,
      h('div', { class: 'board-wrap' }, this.boardEl, this.overlay),
      this.padEl,
      this.liveEl,
      this.dialog);
  }

  announce(text) {
    this.liveEl.textContent = text;
  }

  renderTimer() {
    if (this.game) this.timerEl.textContent = formatClock(this.currentElapsed());
  }

  render() {
    if (!this.game) return;
    const st = this.ctx.settings;
    const g = this.game;
    const sel = this.selected;
    const selValue = sel >= 0 ? g.values[sel] : 0;

    this.renderTimer();
    this.timerEl.hidden = !st.showTimer;
    const showPlay = this.paused || this.finished;
    this.pauseBtn.replaceChildren(showPlay ? icons.play() : icons.pause());
    this.pauseBtn.setAttribute('aria-label', this.finished ? 'Nytt spill' : this.paused ? 'Fortsett' : 'Pause');
    this.levelBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(DIFFICULTIES[k] === g.meta.difficulty)));

    const covered = this.paused && !this.finished;
    this.boardEl.classList.toggle('paused', covered);
    this.overlay.hidden = !covered;
    this.wrongEl.hidden = !this.wrong;

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

      // Notes are only drawn while the cell has no digit (sudoku.js).
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

    // A digit that is on the board 9 times is marked, in numbers mode only.
    const remaining = g.remaining();
    this.keys.forEach((k, idx) => k.classList.toggle('full', !this.noteMode && remaining[idx + 1] === 0));
    this.padEl.classList.toggle('notes-mode', this.noteMode);
    this.pencilBtn.setAttribute('aria-pressed', String(this.noteMode));
  }

  // -------------------------------------------------------------------------
  // Modals

  showDialog(...children) {
    this.dialog.replaceChildren(...children);
    if (!this.dialog.open) this.dialog.showModal();
  }

  closeModal() {
    this.modal = null;
    if (this.dialog?.open) this.dialog.close();
  }

  /** Help. Opening it pauses; closing it resumes (sudoku.js). */
  openInfo(first) {
    this.pause();
    this.modal = 'info';
    let page = 1;
    const body = h('div', { class: 'info-page' });
    const draw = () => body.replaceChildren(...(page === 1 ? rulesPage() : shortcutsPage()));
    const flip = () => {
      page = page === 1 ? 2 : 1;
      draw();
    };
    draw();
    const arrow = (dir) =>
      h('button', { class: 'icon-btn arrow', type: 'button', 'aria-label': dir === 'l' ? 'Forrige side' : 'Neste side', onclick: flip }, dir === 'l' ? '‹' : '›');
    this.showDialog(
      h('div', { class: 'info' },
        arrow('l'),
        h('div', {},
          h('h2', {}, 'Sudoku'),
          body,
          h('button', { class: 'btn', type: 'button', autofocus: true, onclick: () => this.closeInfo() }, first ? 'Start' : 'Lukk')),
        arrow('r')),
    );
  }

  closeInfo() {
    local.set('infoSeen', true);
    this.closeModal();
    this.resume();
  }

  openResult(seconds) {
    this.modal = 'result';
    const level = this.game.meta.difficulty;
    const best = this.ctx.bestTimes(level).slice(0, 4);
    this.showDialog(
      h('div', { class: 'result' },
        h('button', { class: 'close', type: 'button', 'aria-label': 'Lukk', onclick: () => this.closeModal() }, '×'),
        h('h2', {}, 'GRATULERER'),
        h('p', { class: 'time' }, `Du klarte det på ${formatClock(seconds)} minutter!`),
        h('h3', {}, 'Dine beste tider for'),
        h('p', { class: 'level' }, DIFFICULTY_LABELS[level] || DIFFICULTY_LABELS.unknown),
        h('ol', {}, best.map((s) => h('li', {}, `${formatClock(s)} min`))),
        h('button', { class: 'btn', type: 'button', autofocus: true, onclick: () => {
          this.closeModal();
          this.ctx.onLevel(level);
        } }, 'Ny runde')),
    );
  }

  /**
   * Confetti for 5 seconds from both sides, in the colours from sudoku.js. My
   * own small canvas animation, not their library. Skipped with reduced motion.
   */
  confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.stopConfetti?.();
    const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
    this.dialog.append(canvas);
    const ctx2d = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const parts = [];
    const end = performance.now() + 5000;
    const burst = () => {
      const left = end - performance.now();
      if (left <= 0) return;
      const n = Math.round(50 * (left / 5000));
      for (const [x0, x1] of [[0.1, 0.3], [0.7, 0.9]]) {
        const x = (x0 + Math.random() * (x1 - x0)) * canvas.width;
        const y = (Math.random() - 0.2) * canvas.height;
        for (let k = 0; k < n; k++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (15 + Math.random() * 15) * dpr;
          parts.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 60,
            size: (5 + Math.random() * 4) * dpr,
            color: CONFETTI[(Math.random() * CONFETTI.length) | 0],
            round: Math.random() < 0.5,
          });
        }
      }
    };
    burst();
    const interval = setInterval(burst, 250);

    let frame;
    const tick = () => {
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.9;
        p.vy = p.vy * 0.9 + 3 * dpr;
        if (--p.life <= 0) {
          parts.splice(k, 1);
          continue;
        }
        ctx2d.globalAlpha = Math.min(1, p.life / 20);
        ctx2d.fillStyle = p.color;
        if (p.round) {
          ctx2d.beginPath();
          ctx2d.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          ctx2d.fill();
        } else ctx2d.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      if (parts.length || performance.now() < end) frame = requestAnimationFrame(tick);
      else this.stopConfetti();
    };
    frame = requestAnimationFrame(tick);

    this.stopConfetti = () => {
      clearInterval(interval);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      canvas.remove();
      this.stopConfetti = null;
    };
  }
}

// Help texts: my own wording. The structure (two pages, "Spilleregler" and
// "Snarveier og knapper") is from sudoku.js.

function rulesPage() {
  return [
    h('h3', {}, 'Spilleregler'),
    h('p', {}, 'Fyll brettet slik at hver rad, hver kolonne og hver av de ni 3×3-boksene inneholder tallene 1 til 9 én gang hver.'),
    h('p', {}, 'Noen tall er gitt fra start og kan ikke endres. Resten finner du med logikk. Hvert brett har nøyaktig én løsning.'),
  ];
}

function shortcutsPage() {
  const row = (icon, name, text) => h('li', {}, icon ? h('span', { class: 'ico' }, icon) : null, h('b', {}, name), ' ', text);
  return [
    h('h3', {}, 'Snarveier og knapper'),
    h('ul', { class: 'shortcuts' },
      row(icons.play(), 'Play:', 'Start spillet. Etter et løst brett starter den et nytt.'),
      row(icons.pause(), 'Pause:', 'Pause spillet.'),
      row(icons.undo(), 'Angre:', 'Angre det siste du gjorde. Ctrl+Z gjør det samme, Ctrl+Y gjør om.'),
      row(icons.trash(), 'Fjerne:', 'Fjern alle tall og notater du har lagt inn. Kan angres.'),
      row(icons.pencil(), 'Notater:', 'Bytt mellom tall og notater. Shift på tastaturet gjør det samme.'),
      row(null, 'Navigasjon:', 'Mus, piltaster eller WASD. Tallene 1–9 skriver, Backspace sletter.'),
      row(null, 'Nytt spill:', 'Trykk på en vanskelighetsgrad.')),
  ];
}
