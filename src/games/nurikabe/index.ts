import { cyclePaint } from '../../core/pointer';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, type NurikabePuzzle } from './logic';
import { t } from '../../core/i18n';

const EMPTY = 0;
const SEA = 1;
const DOT = 2;
const NAMES = ['empty', 'sea', 'island'];

export interface NurikabeState {
  /** Per cell: EMPTY, SEA or DOT (marked as island). Numbered cells stay EMPTY. */
  cells: number[];
}

/** Sea cells that form a 2×2 pool. */
function pools(n: number, cells: number[]): Set<number> {
  const out = new Set<number>();
  for (let r = 0; r + 1 < n; r++) {
    for (let c = 0; c + 1 < n; c++) {
      const block = [r * n + c, r * n + c + 1, (r + 1) * n + c, (r + 1) * n + c + 1];
      if (block.every((i) => cells[i] === SEA)) block.forEach((i) => out.add(i));
    }
  }
  return out;
}

export const nurikabe: GameModule<NurikabePuzzle, NurikabeState> = {
  id: 'nurikabe',
  title: 'Nurikabe',
  blurb: 'Flood the grid with sea, leaving islands of the right size.',
  icon: `<svg viewBox="0 0 30 30"><path fill="currentColor" fill-rule="evenodd" d="M2 2h26v26H2zM4 4h10v15H4zM18 16h8v10h-8z"/><g font-family="system-ui,sans-serif" font-weight="700" font-size="8" text-anchor="middle" fill="currentColor"><text x="9" y="12">3</text><text x="22" y="24">2</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => ({ cells: new Array(p.size * p.size).fill(EMPTY) }),
  isSolved: (p, s) => s.cells.every((v, i) => (v === SEA) === p.solution[i]),
  mistakes: (p, s) =>
    s.cells.flatMap((v, i) => ((v === SEA && !p.solution[i]) || (v === DOT && p.solution[i]) ? [i] : [])),
  hasProgress: (_, s) => s.cells.some((v) => v !== EMPTY),
  isValidSave: (p, s) => s.cells.length === p.size * p.size,

  mount(ctx) {
    const { board } = ctx;
    const { size: n, clues } = ctx.puzzle;
    board.classList.add('grid-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Nurikabe board'));
    const cells = clues.map((clue, i) => {
      const cell = el('div', clue ? 'cell clue' : 'cell');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      if (clue) cell.textContent = String(clue);
      board.append(cell);
      return cell;
    });
    ctx.fit(n, n);
    ctx.toolbar.append(el('p', 'hint', t('Tap: sea → dot → empty. Drag to paint.')));

    const render = () => {
      const pool = pools(n, ctx.state.cells);
      cells.forEach((cell, i) => {
        const v = ctx.state.cells[i];
        cell.classList.toggle('sea', v === SEA);
        cell.classList.toggle('dot', v === DOT);
        cell.classList.toggle('clash', pool.has(i));
        cell.classList.remove('wrong');
        const what = clues[i] ? t('number {n}', { n: clues[i] }) : t(NAMES[v]);
        cell.setAttribute('aria-label', `${t('Row {r}, column {c}', { r: Math.floor(i / n) + 1, c: (i % n) + 1 })}: ${what}`);
      });
    };

    const stop = cyclePaint({
      board,
      canEdit: () => !ctx.finished,
      locked: (i) => clues[i] > 0,
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
