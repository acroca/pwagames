import { cellAt } from '../../core/pointer';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, counts, floodOpen, neighbors, type MinesweeperPuzzle } from './logic';
import { t as tr } from '../../core/i18n';

/** Hold this long (ms) to use the other tool. */
const LONG_PRESS = 400;
/** A finger that drifts further than this (px) cancels the press. */
const SLOP = 12;

export interface MinesweeperState {
  open: boolean[];
  flags: boolean[];
  /** The mine that went off, or -1. */
  boom: number;
}

type Tool = 'open' | 'flag';

const variantOf = (id: string) => VARIANTS.find((v) => v.id === id) ?? VARIANTS[0];

const blankState = (p: MinesweeperPuzzle): MinesweeperState => ({
  open: new Array(p.width * p.height).fill(false),
  flags: new Array(p.width * p.height).fill(false),
  boom: -1,
});

/** State with only the first tap's area opened. */
function startState(p: MinesweeperPuzzle): MinesweeperState {
  const s = blankState(p);
  if (p.start >= 0) floodOpen(p, s.open, p.start);
  return s;
}

const mineTotal = (p: MinesweeperPuzzle) => variantOf(p.variant).mines;

export const minesweeper: GameModule<MinesweeperPuzzle, MinesweeperState> = {
  id: 'minesweeper',
  title: 'Minesweeper',
  blurb: 'Clear the field without guessing — every board can be solved by logic.',
  icon: `<svg viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="16" r="6" fill="currentColor"/><path d="M15 6v4M15 22v4M5 16h4M21 16h4M8 9l3 3M19 20l3 3M22 9l-3 3M11 20l-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="14" r="1.6" fill="#fff"/></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  noCheck: true,
  noUndo: true,
  initialPuzzle: (variant, seed) => {
    const v = variantOf(variant);
    return { width: v.width, height: v.height, mines: new Array(v.width * v.height).fill(false), start: -1, variant: v.id, seed };
  },
  newState: startState,
  isSolved: (p, s) => p.start >= 0 && s.boom < 0 && p.mines.every((m, i) => m || s.open[i]),
  isLost: (_, s) => s.boom >= 0,
  retryState: startState,
  isStarted: (p) => p.start >= 0,
  mistakes: () => [],
  hasProgress: (p, s) => p.start >= 0 && (s.flags.some(Boolean) || s.open.filter(Boolean).length > startState(p).open.filter(Boolean).length),
  isValidSave: (p, s) => {
    const n = p.width * p.height;
    return p.mines.length === n && s.open.length === n && s.flags.length === n;
  },

  mount(ctx) {
    const { board } = ctx;
    const { width: w, height: h } = ctx.puzzle;
    board.classList.add('grid-board');
    board.style.setProperty('--n', String(w));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', tr('Minefield'));
    const cells = Array.from({ length: w * h }, (_, i) => {
      const cell = el('div', 'cell');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      board.append(cell);
      return cell;
    });
    ctx.fit(w, h);

    let tool: Tool = 'open';
    const info = el('p', 'hint');
    const toolBtns = (['open', 'flag'] as Tool[]).map((t) => {
      const btn = el('button', 'tool', tr(t === 'open' ? 'Open' : 'Flag'));
      btn.type = 'button';
      btn.prepend(el('span', `tool-icon ${t}-icon`));
      btn.querySelector('span')!.setAttribute('aria-hidden', 'true');
      btn.addEventListener('click', () => {
        tool = t;
        renderTools();
      });
      return { t, btn };
    });
    const bar = el('div', 'tools');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', tr('Tool'));
    bar.append(...toolBtns.map((b) => b.btn));
    ctx.toolbar.append(info, bar);
    const renderTools = () => toolBtns.forEach(({ t, btn }) => btn.setAttribute('aria-pressed', String(t === tool)));

    const render = () => {
      const p = ctx.puzzle;
      const s = ctx.state;
      const started = p.start >= 0;
      const num = started ? counts(p) : [];
      const won = ctx.finished && s.boom < 0;
      const lost = s.boom >= 0;
      cells.forEach((cell, i) => {
        let cls = 'cell';
        let text = '';
        let label = 'hidden';
        if (s.open[i]) {
          cls += ' open';
          if (num[i] > 0) [text, cls] = [String(num[i]), `${cls} n${num[i]}`];
          label = num[i] > 0 ? String(num[i]) : 'empty';
        } else if (lost && p.mines[i]) {
          cls += i === s.boom ? ' mine boom' : s.flags[i] ? ' flag' : ' mine';
          label = 'mine';
        } else if (s.flags[i] || (won && p.mines[i])) {
          cls += lost && !p.mines[i] ? ' flag misflag' : ' flag';
          label = 'flagged';
        }
        if (cell.className !== cls) cell.className = cls;
        if (cell.textContent !== text) cell.textContent = text;
        cell.setAttribute('aria-label', `${tr('Row {r}, column {c}', { r: Math.floor(i / w) + 1, c: (i % w) + 1 })}: ${tr(label)}`);
      });
      const flags = s.flags.filter(Boolean).length;
      info.textContent = started
        ? tr('💣 {n} left · long-press for the other tool', { n: mineTotal(p) - flags })
        : tr('Tap any cell to start — the first tap is always safe.');
      renderTools();
    };

    let starting = false;
    const begin = async (i: number) => {
      starting = true;
      try {
        const p = await ctx.generate(ctx.puzzle.variant, ctx.puzzle.seed, i);
        ctx.replacePuzzle(p, startState(p));
      } catch {
        // A newer puzzle replaced this one while generating.
      } finally {
        starting = false;
      }
    };

    /** Opens cells (mutating state); returns false if one of them was a mine. */
    const reveal = (targets: number[]): boolean => {
      const p = ctx.puzzle;
      const s = ctx.state;
      for (const i of targets) {
        if (s.open[i] || s.flags[i]) continue;
        if (p.mines[i]) {
          s.boom = i;
          return false;
        }
        floodOpen(p, s.open, i);
      }
      return true;
    };

    const act = (i: number, t: Tool) => {
      if (ctx.finished || starting) return;
      const p = ctx.puzzle;
      const s = ctx.state;
      if (p.start < 0) {
        if (t === 'open') void begin(i);
        return;
      }
      if (s.open[i]) {
        // Chord: a number whose flags are complete opens its other neighbours.
        const around = neighbors(w, h, i);
        const flagged = around.filter((j) => s.flags[j]).length;
        const hidden = around.filter((j) => !s.open[j] && !s.flags[j]);
        if (flagged === 0 || flagged !== counts(p)[i] || hidden.length === 0) return;
        reveal(hidden);
      } else if (t === 'flag') {
        s.flags[i] = !s.flags[i];
      } else {
        if (s.flags[i]) return;
        reveal([i]);
      }
      ctx.commit();
    };

    let press: { id: number; cell: number; x: number; y: number; timer: number; long: boolean } | null = null;
    const cancel = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    const down = (e: PointerEvent) => {
      if (press || !e.isPrimary) return;
      const cell = cellAt(board, e.clientX, e.clientY);
      if (cell === null) return;
      e.preventDefault();
      const timer = window.setTimeout(() => {
        if (!press) return;
        press.long = true;
        // Hold on a hidden cell uses the other tool; on a number it chords like a tap.
        act(press.cell, ctx.state.open[press.cell] || tool === 'flag' ? 'open' : 'flag');
      }, LONG_PRESS);
      press = { id: e.pointerId, cell, x: e.clientX, y: e.clientY, timer, long: false };
    };
    const move = (e: PointerEvent) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) cancel();
    };
    const up = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const { cell, long } = press;
      cancel();
      if (!long && e.type === 'pointerup') act(cell, tool);
    };
    board.addEventListener('pointerdown', down);
    board.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    return {
      render,
      showMistakes: () => {},
      destroy() {
        cancel();
        board.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      },
    };
  },
};
