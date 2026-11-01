import { trackStrokes } from '../../core/pointer';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, ruledOut, type QueensPuzzle } from './logic';
import { t } from '../../core/i18n';

const EMPTY = 0;
const MARK = 1;
const QUEEN = 2;

export interface QueensState {
  /** Per cell: EMPTY, MARK (✕) or QUEEN. Automatic ✕s are derived when drawing. */
  cells: number[];
}

const CROWN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 8l4.5 4L12 4l4.5 8L21 8l-2 11H5z"/><rect fill="currentColor" x="5" y="20" width="14" height="2" rx="1"/></svg>`;

/** Queens that share a row, column or region with another queen, or touch one. */
function clashes(p: QueensPuzzle, cells: number[]): Set<number> {
  const n = p.size;
  const queens = cells.flatMap((v, i) => (v === QUEEN ? [i] : []));
  const out = new Set<number>();
  for (let a = 0; a < queens.length; a++) {
    for (let b = a + 1; b < queens.length; b++) {
      const [i, j] = [queens[a], queens[b]];
      const [ri, ci, rj, cj] = [Math.floor(i / n), i % n, Math.floor(j / n), j % n];
      if (ri === rj || ci === cj || p.regions[i] === p.regions[j] || (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1)) {
        out.add(i).add(j);
      }
    }
  }
  return out;
}

export const queens: GameModule<QueensPuzzle, QueensState> = {
  id: 'queens',
  title: 'Queens',
  blurb: 'One queen in every row, column and colored region — and no two may touch.',
  icon: `<svg viewBox="0 0 30 30"><rect x="2" y="2" width="13" height="13" rx="2" fill="#f4a6a6"/><rect x="15" y="2" width="13" height="13" rx="2" fill="#9fd8e6"/><rect x="2" y="15" width="13" height="13" rx="2" fill="#b8e0a8"/><rect x="15" y="15" width="13" height="13" rx="2" fill="#f9d38c"/><path fill="#1e293b" d="M17 7l2.5 2.2L21.5 4.5l2 4.7L26 7l-1.2 6.5h-6.6z"/><path stroke="#1e293b" stroke-width="1.8" stroke-linecap="round" d="M5.5 18.5l6 6m0-6l-6 6"/></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  settings: [
    { id: 'autoMark', label: 'Auto-✕ cells ruled out by queens', default: true },
    { id: 'patterns', label: 'Region patterns (color-blind help)', default: false },
  ],
  newState: (p) => ({ cells: new Array(p.size * p.size).fill(EMPTY) }),
  isSolved: (p, s) => p.solution.every((c, r) => s.cells[r * p.size + c] === QUEEN) && s.cells.filter((v) => v === QUEEN).length === p.size,
  mistakes: (p, s) =>
    s.cells.flatMap((v, i) => {
      const isQueen = p.solution[Math.floor(i / p.size)] === i % p.size;
      return (v === QUEEN && !isQueen) || (v === MARK && isQueen) ? [i] : [];
    }),
  hasProgress: (_, s) => s.cells.some((v) => v !== EMPTY),
  isValidSave: (p, s) => s.cells.length === p.size * p.size,

  mount(ctx) {
    const { board } = ctx;
    const p = ctx.puzzle;
    const n = p.size;
    board.classList.add('grid-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Queens board'));
    const cells = p.regions.map((g, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      const cell = el('div', `cell rg-${g}`);
      if (c < n - 1 && p.regions[i + 1] !== g) cell.classList.add('wall-r');
      if (r < n - 1 && p.regions[i + n] !== g) cell.classList.add('wall-b');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      board.append(cell);
      return cell;
    });
    ctx.fit(n, n);
    ctx.toolbar.append(el('p', 'hint', t('Tap: ✕ → queen → empty. Drag to mark ✕.')));

    /** Cells shown with ✕: manual marks plus, if enabled, cells ruled out by queens. */
    const shownMarks = () => {
      const shown = new Set<number>();
      ctx.state.cells.forEach((v, i) => {
        if (v === MARK) shown.add(i);
        if (v === QUEEN && ctx.setting('autoMark')) for (const j of ruledOut(n, p.regions, i)) shown.add(j);
      });
      return shown;
    };

    const render = () => {
      const marks = shownMarks();
      const clash = clashes(p, ctx.state.cells);
      board.classList.toggle('patterns', ctx.setting('patterns'));
      cells.forEach((cell, i) => {
        const v = ctx.state.cells[i];
        const shown = v === QUEEN ? 'queen' : marks.has(i) ? 'mark' : '';
        if (cell.dataset.v !== shown) {
          cell.dataset.v = shown;
          cell.innerHTML = shown === 'queen' ? CROWN : '';
        }
        cell.classList.toggle('auto', shown === 'mark' && v !== MARK);
        cell.classList.toggle('clash', clash.has(i));
        cell.classList.remove('wrong');
        const r = Math.floor(i / n) + 1;
        const c = (i % n) + 1;
        cell.setAttribute('aria-label', t('Row {r}, column {c}, region {g}: {v}', { r, c, g: p.regions[i] + 1, v: t(shown || 'empty') }));
      });
    };

    // A tap cycles the cell; a drag paints ✕ (or erases ✕ when it starts on one) and never touches queens.
    let stroke: { start: number; erase: boolean; dirty: boolean } | null = null;
    const set = (i: number, v: number) => {
      if (ctx.state.cells[i] === v) return;
      if (!stroke!.dirty) ctx.checkpoint();
      stroke!.dirty = true;
      ctx.state.cells[i] = v;
    };
    const paint = (i: number) => {
      const v = ctx.state.cells[i];
      if (v === QUEEN) return;
      set(i, stroke!.erase ? EMPTY : MARK);
      render();
    };
    const stop = trackStrokes(board, {
      start(i) {
        if (ctx.finished) return false;
        const shown = ctx.state.cells[i] !== QUEEN && shownMarks().has(i);
        stroke = { start: i, erase: shown, dirty: false };
        if (ctx.state.cells[i] === EMPTY && !shown) paint(i);
        return true;
      },
      enter(i) {
        if (!stroke) return;
        paint(stroke.start);
        paint(i);
      },
      end(moved) {
        if (!stroke) return;
        if (!moved) {
          const i = stroke.start;
          const v = ctx.state.cells[i];
          const shown = shownMarks().has(i);
          if (!stroke.dirty) {
            if (v === QUEEN) set(i, EMPTY);
            else if (shown) set(i, QUEEN);
          }
        }
        const dirty = stroke.dirty;
        stroke = null;
        if (dirty) ctx.commit();
      },
    });

    return {
      render,
      showMistakes: (wrong) => wrong.forEach((i) => cells[i].classList.add('wrong')),
      destroy: stop,
    };
  },
};
