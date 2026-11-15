import { t } from '../../core/i18n';
import { mountPad, newPadState, padMistakes, padProgress, padSolved, padValidSave, type PadState } from '../../core/numpad';
import { REGION_HUES, regionWalls, tintRegions } from '../../core/regions';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, peersOf, VARIANTS, type JigsawPuzzle } from './logic';

export const jigsaw: GameModule<JigsawPuzzle, PadState> = {
  id: 'jigsaw',
  title: 'Jigsaw Sudoku',
  blurb: 'Sudoku with irregular, jigsaw-shaped regions instead of boxes.',
  icon: `<svg viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v7h6v7h-5v6h-7v6M20 28v-8h8M2 14h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><g fill="currentColor" font-family="system-ui,sans-serif" font-weight="700" font-size="7.500" text-anchor="middle"><text x="6" y="10">4</text><text x="22" y="10">2</text><text x="15" y="20">3</text><text x="24" y="25.500">1</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => newPadState(p.givens),
  isSolved: (p, s) => padSolved(p.solution, s),
  mistakes: (p, s) => padMistakes(p.givens, p.solution, s),
  hasProgress: (p, s) => padProgress(p.givens, s),
  isValidSave: (p, s) => padValidSave(p.size * p.size, s),

  mount(ctx) {
    const p = ctx.puzzle;
    const n = p.size;
    const { board } = ctx;
    board.classList.add('num-board', 'grid-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Jigsaw Sudoku board'));
    const tint = tintRegions(n, p.regions);
    const cells = p.regions.map((g, i) => {
      const cell = el('div', 'cell');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      cell.style.setProperty('--tint', `color-mix(in srgb, hsl(${REGION_HUES[tint[i]]} 75% 55%) 16%, var(--surface))`);
      cell.setAttribute('aria-label', `${t('Row {r}, column {c}', { r: Math.floor(i / n) + 1, c: (i % n) + 1 })}, ${t('region {n}', { n: g + 1 })}`);
      board.append(cell);
      return cell;
    });
    board.append(regionWalls(n, p.regions));
    ctx.fit(n, n);
    return mountPad({
      ctx,
      cells,
      max: n,
      locked: (i) => p.givens[i] !== 0,
      peers: peersOf(n, p.regions),
      digitTotal: n,
    });
  },
};
