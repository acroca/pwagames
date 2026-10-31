import { cyclePaint } from '../../core/pointer';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, type HitoriPuzzle } from './logic';

const NORMAL = 0;
const SHADED = 1;
const CIRCLED = 2;
const NAMES = ['plain', 'shaded', 'circled'];

export interface HitoriState {
  /** Per cell: NORMAL, SHADED or CIRCLED (marked safe). */
  cells: number[];
}

/** Shaded cells that touch another shaded cell orthogonally. */
function touching(n: number, cells: number[]): Set<number> {
  const out = new Set<number>();
  cells.forEach((v, i) => {
    if (v !== SHADED) return;
    if (i % n < n - 1 && cells[i + 1] === SHADED) out.add(i).add(i + 1);
    if (i + n < cells.length && cells[i + n] === SHADED) out.add(i).add(i + n);
  });
  return out;
}

export const hitori: GameModule<HitoriPuzzle, HitoriState> = {
  id: 'hitori',
  title: 'Hitori',
  blurb: 'Shade out repeated numbers while keeping the rest connected.',
  rules: [
    'Shade cells so no number appears more than once in any row or column among the unshaded cells.',
    'Only shade a cell to remove a repeated number.',
    'Shaded cells may not touch each other side by side (diagonally is fine).',
    'All unshaded cells must stay connected in one area.',
    'Tap to cycle plain → shaded → circled (known to stay unshaded). Drag to apply the same mark to several cells.',
  ],
  icon: `<svg viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="15" y="2" width="13" height="13" fill="currentColor"/><circle cx="8.5" cy="21.5" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/><g font-family="system-ui,sans-serif" font-weight="700" font-size="8" text-anchor="middle" fill="currentColor"><text x="8.5" y="11.5">3</text><text x="8.5" y="24.3">3</text><text x="21.5" y="24.5">1</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => ({ cells: new Array(p.size * p.size).fill(NORMAL) }),
  isSolved: (p, s) => s.cells.every((v, i) => (v === SHADED) === p.solution[i]),
  mistakes: (p, s) =>
    s.cells.flatMap((v, i) => ((v === SHADED && !p.solution[i]) || (v === CIRCLED && p.solution[i]) ? [i] : [])),
  hasProgress: (_, s) => s.cells.some((v) => v !== NORMAL),
  isValidSave: (p, s) => s.cells.length === p.size * p.size,

  mount(ctx) {
    const { board } = ctx;
    const { size: n, numbers } = ctx.puzzle;
    board.classList.add('grid-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', 'Hitori board');
    const cells = numbers.map((num, i) => {
      const cell = el('div', 'cell');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      cell.append(el('span', 'num', String(num)));
      board.append(cell);
      return cell;
    });
    ctx.fit(n, n);
    ctx.toolbar.append(el('p', 'hint', 'Tap: shade → circle → clear. Drag to paint.'));

    const render = () => {
      const clash = touching(n, ctx.state.cells);
      cells.forEach((cell, i) => {
        const v = ctx.state.cells[i];
        cell.classList.toggle('shaded', v === SHADED);
        cell.classList.toggle('circled', v === CIRCLED);
        cell.classList.toggle('clash', clash.has(i));
        cell.classList.remove('wrong');
        cell.setAttribute('aria-label', `Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}: ${numbers[i]}, ${NAMES[v]}`);
      });
    };

    const stop = cyclePaint({
      board,
      canEdit: () => !ctx.finished,
      locked: () => false,
      get: (i) => ctx.state.cells[i],
      set: (i, v) => (ctx.state.cells[i] = v),
      next: (v) => (v + 1) % 3,
      checkpoint: ctx.checkpoint,
      changed: render,
      commit: ctx.commit,
    });

    return {
      render,
      showMistakes: (wrong) => wrong.forEach((i) => cells[i].classList.add('wrong')),
      destroy: stop,
    };
  },
};
