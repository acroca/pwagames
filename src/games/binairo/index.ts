import { cyclePaint } from '../../core/pointer';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, EMPTY, VARIANTS, type BinairoPuzzle } from './logic';

export interface BinairoState {
  /** Player entries: EMPTY, 0 or 1 (givens are read from the puzzle). */
  cells: number[];
}

const NEXT: Record<number, number> = { [EMPTY]: 0, 0: 1, 1: EMPTY };

export const binairo: GameModule<BinairoPuzzle, BinairoState> = {
  id: 'binairo',
  title: 'Binairo',
  blurb: 'Fill the grid with 0s and 1s, balanced and never three in a row.',
  rules: [
    'Fill every cell with 0 (orange) or 1 (blue).',
    'No more than two equal values next to each other in a row or column.',
    'Each row and column has as many 0s as 1s.',
    'No two rows are the same, and no two columns are the same.',
    'Tap a cell to cycle empty → 0 → 1. Drag to copy the first cell’s new value along your path.',
    'Square tiles are given and can’t be changed.',
  ],
  icon: `<svg viewBox="0 0 30 30"><g font-family="system-ui,sans-serif" font-weight="700" font-size="11" text-anchor="middle"><circle cx="8" cy="8" r="6.5" fill="#f59e0b"/><circle cx="22" cy="8" r="6.5" fill="currentColor"/><circle cx="8" cy="22" r="6.5" fill="currentColor"/><circle cx="22" cy="22" r="6.5" fill="#f59e0b"/><text x="8" y="12" fill="#fff">0</text><text x="22" y="12" fill="#fff">1</text><text x="8" y="26" fill="#fff">1</text><text x="22" y="26" fill="#fff">0</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => ({ cells: [...p.givens] }),
  isSolved: (p, s) => s.cells.every((v, i) => v === p.solution[i]),
  mistakes: (p, s) => s.cells.flatMap((v, i) => (v !== EMPTY && p.givens[i] === EMPTY && v !== p.solution[i] ? [i] : [])),
  hasProgress: (p, s) => s.cells.some((v, i) => p.givens[i] === EMPTY && v !== EMPTY),
  isValidSave: (p, s) => s.cells.length === p.size * p.size,

  mount(ctx) {
    const { board } = ctx;
    const { size, givens } = ctx.puzzle;
    board.classList.add('grid-board');
    board.style.setProperty('--n', String(size));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', 'Binairo board');
    const cells = givens.map((g, i) => {
      const cell = el('div', g === EMPTY ? 'cell' : 'cell given');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      cell.append(el('span', 'bit'));
      board.append(cell);
      return cell;
    });
    ctx.fit(size, size);

    const hint = el('p', 'hint', 'Tap: empty → 0 → 1. Drag to paint.');
    ctx.toolbar.append(hint);

    const renderCell = (i: number) => {
      const v = ctx.state.cells[i];
      const cell = cells[i];
      cell.classList.remove('wrong');
      cell.classList.toggle('v0', v === 0);
      cell.classList.toggle('v1', v === 1);
      cell.firstElementChild!.textContent = v === EMPTY ? '' : String(v);
      const r = Math.floor(i / size) + 1;
      const c = (i % size) + 1;
      cell.setAttribute('aria-label', `Row ${r}, column ${c}: ${v === EMPTY ? 'empty' : v}${givens[i] !== EMPTY ? ', given' : ''}`);
    };

    const stop = cyclePaint({
      board,
      canEdit: () => !ctx.finished,
      locked: (i) => givens[i] !== EMPTY,
      get: (i) => ctx.state.cells[i],
      set: (i, v) => (ctx.state.cells[i] = v),
      next: (v) => NEXT[v],
      checkpoint: ctx.checkpoint,
      changed: renderCell,
      commit: ctx.commit,
    });

    return {
      render: () => cells.forEach((_, i) => renderCell(i)),
      showMistakes: (wrong) => wrong.forEach((i) => cells[i].classList.add('wrong')),
      destroy: stop,
    };
  },
};
