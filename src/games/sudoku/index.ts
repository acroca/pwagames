import { gridPeers, mountPad, newPadState, padMistakes, padProgress, padSolved, padValidSave, type PadState } from '../../core/numpad';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, type SudokuPuzzle } from './logic';
import { t } from '../../core/i18n';

const peers = gridPeers(9, 3);

/** Square 9×9 board with thick 3×3 box lines; returns the cell elements. */
export function sudokuCells(board: HTMLElement, label: string): HTMLElement[] {
  board.classList.add('grid-board', 'num-board');
  board.style.setProperty('--n', '9');
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', label);
  return Array.from({ length: 81 }, (_, i) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const cell = el('div', 'cell');
    if (c % 3 === 2 && c < 8) cell.classList.add('wall-r');
    if (r % 3 === 2 && r < 8) cell.classList.add('wall-b');
    cell.dataset.i = String(i);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', t('Row {r}, column {c}', { r: r + 1, c: c + 1 }));
    board.append(cell);
    return cell;
  });
}

export const sudoku: GameModule<SudokuPuzzle, PadState> = {
  id: 'sudoku',
  title: 'Sudoku',
  blurb: 'The classic: every row, column and 3×3 box holds 1 to 9.',
  icon: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor"><rect x="2" y="2" width="26" height="26" rx="2" stroke-width="2"/><path d="M11 2v26M19 2v26M2 11h26M2 19h26" stroke-width="1.2"/><g fill="currentColor" stroke="none" font-family="system-ui,sans-serif" font-weight="700" font-size="7" text-anchor="middle"><text x="6.5" y="9.3">5</text><text x="15" y="17.3">3</text><text x="23.5" y="25.3">9</text><text x="23.5" y="9.3" fill="#2563eb">7</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => newPadState(p.givens),
  isSolved: (p, s) => padSolved(p.solution, s),
  mistakes: (p, s) => padMistakes(p.givens, p.solution, s),
  hasProgress: (p, s) => padProgress(p.givens, s),
  isValidSave: (_, s) => padValidSave(81, s),

  mount(ctx) {
    const cells = sudokuCells(ctx.board, t('Sudoku board'));
    ctx.fit(9, 9);
    return mountPad({
      ctx,
      cells,
      max: 9,
      locked: (i) => ctx.puzzle.givens[i] !== 0,
      peers,
      digitTotal: 9,
    });
  },
};
