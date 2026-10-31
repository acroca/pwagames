import { generatePuzzle } from './generate';
import { randomSeed } from './rng';
import { load, save } from './storage';
import type { BasePuzzle, GameContext, GameModule, GameView } from './types';
import { el, formatTime, plural } from './util';

const MAX_HISTORY = 300;
/** Only show the spinner if generation is noticeably slow. */
const LOADING_DELAY = 150;

export interface Saved<P = BasePuzzle, S = unknown> {
  v: 1;
  variant: string;
  puzzle: P;
  state: S;
  /** Milliseconds played. */
  elapsed: number;
  solved: boolean;
  lost: boolean;
}

export const sessionKey = (id: string) => `game:${id}`;
const settingsKey = (id: string) => `settings:${id}`;
const BEST_KEY = 'best';

export function bestTimes(): Record<string, number> {
  return load<Record<string, number>>(BEST_KEY) ?? {};
}

export function loadSession(game: GameModule): Saved | null {
  const saved = load<Saved>(sessionKey(game.id));
  if (!saved || saved.v !== 1 || !saved.puzzle || saved.state === undefined) return null;
  if (!game.variants.some((v) => v.id === saved.variant)) return null;
  try {
    if (game.isValidSave && !game.isValidSave(saved.puzzle, saved.state)) return null;
  } catch {
    return null;
  }
  return saved;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/** Drives the game screen for one game at a time. */
export class GameScreen {
  private readonly screen = $('#game-screen');
  private readonly titleEl = $('#game-title');
  private readonly metaEl = $('#game-meta');
  private readonly timerEl = $('#timer');
  private readonly wrap = $('#board-wrap');
  private readonly loadingEl = $('#loading');
  private readonly statusEl = $('#status');
  private readonly toolbar = $('#toolbar');
  private readonly undoBtn = $<HTMLButtonElement>('#undo');
  private readonly checkBtn = $<HTMLButtonElement>('#check');
  private readonly sheet = $<HTMLDialogElement>('#sheet');

  private game: GameModule | null = null;
  private session: Saved<any, any> | null = null;
  private board: HTMLElement | null = null;
  private view: GameView | null = null;
  private history: string[] = [];
  private settings: Record<string, boolean> = {};
  private runningSince: number | null = null;
  private ticker = 0;
  private loadToken = 0;
  private fitSize: [number, number] = [1, 1];
  private statusTimer = 0;

  constructor(private readonly onBack: () => void) {
    $('#back').addEventListener('click', () => this.onBack());
    this.undoBtn.addEventListener('click', () => this.undo());
    this.checkBtn.addEventListener('click', () => this.check());
    $('#more').addEventListener('click', () => this.openSheet());
    new ResizeObserver(() => this.applyFit()).observe(this.wrap);
    document.addEventListener('visibilitychange', () => this.syncTimer());
    window.addEventListener('pagehide', () => this.persist());
  }

  open(game: GameModule) {
    this.close();
    this.game = game;
    this.screen.hidden = false;
    this.titleEl.textContent = game.title;
    document.title = game.title;
    this.undoBtn.hidden = !!game.noUndo;
    this.checkBtn.hidden = !!game.noCheck;
    this.settings = Object.fromEntries((game.settings ?? []).map((s) => [s.id, s.default]));
    Object.assign(this.settings, load<Record<string, boolean>>(settingsKey(game.id)) ?? {});
    const saved = loadSession(game);
    if (saved) this.start(saved);
    else void this.newPuzzle(game.defaultVariant);
  }

  close() {
    if (!this.game) return;
    this.persist();
    this.view?.destroy?.();
    this.view = null;
    this.game = null;
    this.session = null;
    this.loadToken++;
    this.screen.hidden = true;
    this.sheet.close();
    this.syncTimer();
  }

  private get finished() {
    return !!this.session && (this.session.solved || this.session.lost);
  }

  private async newPuzzle(variant: string) {
    const game = this.game!;
    const token = ++this.loadToken;
    this.persist();
    this.view?.destroy?.();
    this.view = null;
    this.session = null;
    this.syncTimer();
    this.wrap.querySelector('.board')?.remove();
    this.toolbar.replaceChildren();
    this.setStatus('');
    this.updateChrome();
    const seed = randomSeed();
    let puzzle: BasePuzzle;
    if (game.initialPuzzle) {
      puzzle = game.initialPuzzle(variant, seed);
    } else {
      const spinner = setTimeout(() => (this.loadingEl.hidden = false), LOADING_DELAY);
      try {
        puzzle = await generatePuzzle<BasePuzzle>(game.id, variant, seed);
      } catch (err) {
        if (token !== this.loadToken) return;
        console.error(err);
        this.setStatus("Couldn't create a puzzle.", 'bad');
        this.addStatusAction('Try again', () => void this.newPuzzle(variant), true);
        return;
      } finally {
        clearTimeout(spinner);
        if (token === this.loadToken) this.loadingEl.hidden = true;
      }
    }
    if (token !== this.loadToken) return;
    this.start({ v: 1, variant, puzzle, state: game.newState(puzzle), elapsed: 0, solved: false, lost: false });
    this.persist();
  }

  private start(session: Saved) {
    const game = this.game!;
    this.session = session;
    this.history = [];
    this.wrap.querySelector('.board')?.remove();
    this.toolbar.replaceChildren();
    this.board = el('div', `board board-${game.id}`);
    this.wrap.prepend(this.board);
    this.view = game.mount(this.context());
    this.view.render();
    this.applyFit();
    this.setStatus('');
    this.afterChange();
  }

  private context(): GameContext<any, any> {
    const shell = this;
    const board = this.board!;
    return {
      board,
      toolbar: this.toolbar,
      get puzzle() {
        return shell.session!.puzzle;
      },
      get state() {
        return shell.session!.state;
      },
      get finished() {
        return shell.finished;
      },
      checkpoint: () => {
        if (!this.session) return;
        this.history.push(JSON.stringify(this.session.state));
        if (this.history.length > MAX_HISTORY) this.history.shift();
      },
      commit: () => this.commit(),
      fit: (cols, rows) => {
        this.fitSize = [cols, rows];
        this.applyFit();
      },
      setting: (id) => !!this.settings[id],
      replacePuzzle: (puzzle, state) => {
        if (!this.session) return;
        this.session.puzzle = puzzle;
        this.session.state = state;
        this.history = [];
        this.commit();
      },
      generate: async (variant, seed, extra) => {
        const token = this.loadToken;
        const spinner = setTimeout(() => (this.loadingEl.hidden = false), LOADING_DELAY);
        try {
          const puzzle = await generatePuzzle<any>(this.game!.id, variant, seed, extra);
          if (token !== this.loadToken) throw new Error('stale');
          return puzzle;
        } finally {
          clearTimeout(spinner);
          if (token === this.loadToken) this.loadingEl.hidden = true;
        }
      },
    };
  }

  private applyFit() {
    if (!this.board) return;
    const [cols, rows] = this.fitSize;
    const w = this.wrap.clientWidth - 12;
    const h = this.wrap.clientHeight - 8;
    if (w <= 0 || h <= 0) return;
    const cell = Math.max(16, Math.min(72, Math.floor(Math.min(w / cols, h / rows))));
    this.board.style.setProperty('--cell', `${cell}px`);
  }

  private commit() {
    const { game, session } = this;
    if (!game || !session) return;
    if (!this.finished) {
      session.solved = game.isSolved(session.puzzle, session.state);
      session.lost = !session.solved && !!game.isLost?.(session.puzzle, session.state);
      if (session.solved) this.recordWin();
    }
    this.setStatus('');
    this.view?.render();
    this.afterChange();
    this.persist();
  }

  /** Refresh everything that depends on the session state. */
  private afterChange() {
    this.syncTimer();
    this.updateChrome();
    const { session } = this;
    if (!session) return;
    if (session.solved) this.showWin();
    if (session.lost) this.showLoss();
  }

  private updateChrome() {
    const { game, session } = this;
    if (!game) return;
    const variant = game.variants.find((v) => v.id === session?.variant);
    const id = session ? `#${session.puzzle.seed.toString(36).toUpperCase()}` : '';
    this.metaEl.textContent = [game.variants.length > 1 ? variant?.label : '', id].filter(Boolean).join(' · ');
    this.undoBtn.disabled = !session || this.finished || this.history.length === 0;
    this.checkBtn.disabled =
      !session || this.finished || !game.hasProgress(session.puzzle, session.state);
    this.board?.classList.toggle('solved', !!session?.solved);
    this.board?.classList.toggle('lost', !!session?.lost);
    this.renderTime();
  }

  private undo() {
    const prev = this.history.pop();
    if (prev === undefined || !this.session || this.finished) return;
    this.session.state = JSON.parse(prev);
    this.setStatus('');
    this.view?.render();
    this.afterChange();
    this.persist();
  }

  private check() {
    const { game, session, view } = this;
    if (!game || !session || !view || this.finished) return;
    const wrong = game.mistakes(session.puzzle, session.state);
    if (wrong.length) {
      view.showMistakes(wrong);
      this.setStatus(`${plural(wrong.length, 'mistake')} found`, 'bad', 3000);
    } else {
      this.setStatus('No mistakes so far ✓', 'good', 3000);
    }
  }

  private recordWin() {
    const { game, session } = this;
    if (!game || !session) return;
    this.syncTimer();
    const best = bestTimes();
    const key = `${game.id}:${session.variant}`;
    if (!(key in best) || session.elapsed < best[key]) {
      best[key] = session.elapsed;
      save(BEST_KEY, best);
    }
  }

  private showWin() {
    const { game, session } = this;
    if (!game || !session) return;
    const best = bestTimes()[`${game.id}:${session.variant}`];
    const suffix = best !== undefined && best >= session.elapsed ? ' · New best!' : best ? ` · Best ${formatTime(best)}` : '';
    this.setStatus(`Solved in ${formatTime(session.elapsed)} 🎉${suffix}`, 'win');
    this.addStatusAction('Next puzzle', () => void this.newPuzzle(session.variant), true);
  }

  private showLoss() {
    const { game, session } = this;
    if (!game || !session) return;
    this.setStatus('💥 Boom!', 'bad');
    if (game.retryState) {
      this.addStatusAction('Retry board', () => {
        if (!this.session || !game.retryState) return;
        this.session.state = game.retryState(this.session.puzzle, this.session.state);
        this.session.lost = false;
        this.resetClock();
        this.history = [];
        this.commit();
      });
    }
    this.addStatusAction('New puzzle', () => void this.newPuzzle(session.variant), true);
  }

  private setStatus(text: string, tone = '', clearAfter = 0) {
    clearTimeout(this.statusTimer);
    this.statusEl.replaceChildren();
    this.statusEl.className = `status ${tone}`;
    if (text) this.statusEl.append(el('span', '', text));
    if (clearAfter) this.statusTimer = window.setTimeout(() => this.setStatus(''), clearAfter);
  }

  private addStatusAction(label: string, onClick: () => void, primary = false) {
    const btn = el('button', primary ? 'primary' : '', label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    this.statusEl.append(btn);
  }

  private shouldRun(): boolean {
    const { game, session } = this;
    if (!game || !session || this.finished || document.visibilityState !== 'visible') return false;
    return game.isStarted ? game.isStarted(session.puzzle, session.state) : true;
  }

  private syncTimer() {
    const run = this.shouldRun();
    if (run && this.runningSince === null) {
      this.runningSince = performance.now();
      this.ticker = window.setInterval(() => this.renderTime(), 1000);
    } else if (!run && this.runningSince !== null) {
      if (this.session) this.session.elapsed += performance.now() - this.runningSince;
      this.runningSince = null;
      clearInterval(this.ticker);
      this.persist();
    }
    this.renderTime();
  }

  private resetClock() {
    if (this.session) this.session.elapsed = 0;
    if (this.runningSince !== null) this.runningSince = performance.now();
  }

  private elapsed(): number {
    if (!this.session) return 0;
    return this.session.elapsed + (this.runningSince === null ? 0 : performance.now() - this.runningSince);
  }

  private renderTime() {
    this.timerEl.textContent = this.session ? formatTime(this.elapsed()) : '';
  }

  private persist() {
    const { game, session } = this;
    if (!game || !session) return;
    save(sessionKey(game.id), { ...session, elapsed: this.elapsed() });
  }

  private openSheet() {
    const game = this.game;
    if (!game) return;
    const session = this.session;
    let variant = session?.variant ?? game.defaultVariant;
    const body = el('form', 'sheet-body');
    body.method = 'dialog';

    body.append(el('h2', '', game.title));
    if (game.variants.length > 1) {
      const chips = el('div', 'chips');
      chips.setAttribute('role', 'radiogroup');
      chips.setAttribute('aria-label', 'Puzzle type');
      for (const v of game.variants) {
        const chip = el('button', 'chip', v.label);
        chip.type = 'button';
        chip.setAttribute('role', 'radio');
        chip.setAttribute('aria-checked', String(v.id === variant));
        chip.addEventListener('click', () => {
          variant = v.id;
          chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', String(c === chip)));
        });
        chips.append(chip);
      }
      body.append(chips);
    }

    const newBtn = el('button', 'primary wide', 'New puzzle');
    newBtn.type = 'button';
    newBtn.addEventListener('click', () => {
      const s = this.session;
      if (s && !this.finished && game.hasProgress(s.puzzle, s.state) && !confirm('Abandon this puzzle and start a new one?'))
        return;
      this.sheet.close();
      void this.newPuzzle(variant);
    });
    body.append(newBtn);

    const restartBtn = el('button', 'wide', 'Restart this puzzle');
    restartBtn.type = 'button';
    restartBtn.disabled = !session || !game.hasProgress(session.puzzle, session.state) || session.lost;
    restartBtn.addEventListener('click', () => {
      const s = this.session;
      if (!s || !confirm('Clear the board and start this puzzle over?')) return;
      this.sheet.close();
      if (!this.finished) this.history.push(JSON.stringify(s.state));
      s.state = game.retryState ? game.retryState(s.puzzle, s.state) : game.newState(s.puzzle);
      s.solved = false;
      s.lost = false;
      this.resetClock();
      this.commit();
    });
    body.append(restartBtn);

    if (game.settings?.length) {
      const box = el('fieldset', 'settings');
      box.append(el('legend', '', 'Settings'));
      for (const s of game.settings) {
        const label = el('label', 'switch');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = !!this.settings[s.id];
        input.addEventListener('change', () => {
          this.settings[s.id] = input.checked;
          save(settingsKey(game.id), this.settings);
          this.view?.render();
        });
        label.append(el('span', '', s.label), input);
        box.append(label);
      }
      body.append(box);
    }

    const rules = el('details', 'rules');
    rules.append(el('summary', '', 'How to play'));
    const list = el('ul');
    game.rules.forEach((r) => list.append(el('li', '', r)));
    rules.append(list);
    body.append(rules);

    const closeBtn = el('button', 'wide', 'Close');
    closeBtn.type = 'submit';
    body.append(closeBtn);

    this.sheet.replaceChildren(body);
    this.sheet.showModal();
  }
}
