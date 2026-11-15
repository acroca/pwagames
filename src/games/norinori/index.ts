import { t } from '../../core/i18n';
import { cyclePaint } from '../../core/pointer';
import { REGION_HUES, regionWalls, tintRegions } from '../../core/regions';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, type NorinoriPuzzle } from './logic';

const EMPTY = 0;
const SHADED = 1;
const DOT = 2;
const NAMES = ['empty', 'shaded', 'unshaded'];

export interface NorinoriState {
  /** Per cell: EMPTY, SHADED or DOT (marked as unshaded). */
  cells: number[];
}

export const norinori: GameModule<NorinoriPuzzle, NorinoriState> = {
  id: 'norinori',
  title: 'Norinori',
  blurb: 'Shade two cells in every region, in dominoes that never touch.',
  icon: `<svg viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 2v13H2M15 15v13" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="5" width="7" height="3.5" rx="1" fill="currentColor"/><rect x="19" y="5" width="3.5" height="7" rx="1" fill="currentColor"/><rect x="5" y="19.5" width="3.5" height="7" rx="1" fill="currentColor"/><rect x="18" y="22" width="7" height="3.5" rx="1" fill="currentColor"/></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => ({ cells: new Array(p.size * p.size).fill(EMPTY) }),
  isSolved: (p, s) => s.cells.every((v, i) => (v === SHADED) === p.solution[i]),
  mistakes: (p, s) =>
    s.cells.flatMap((v, i) => ((v === SHADED && !p.solution[i]) || (v === DOT && p.solution[i]) ? [i] : [])),
  hasProgress: (_, s) => s.cells.some((v) => v !== EMPTY),
  isValidSave: (p, s) => Array.isArray(s?.cells) && s.cells.length === p.size * p.size,

  mount(ctx) {
    const { board } = ctx;
    const { size: n, regions } = ctx.puzzle;
    board.classList.add('grid-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Norinori board'));
    const tint = tintRegions(n, regions);
    const cells = regions.map((_, i) => {
      const cell = el('div', 'cell');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      cell.style.setProperty('--tint', `color-mix(in srgb, hsl(${REGION_HUES[tint[i]]} 75% 55%) 20%, var(--surface))`);
      board.append(cell);
      return cell;
    });
    board.append(regionWalls(n, regions));
    ctx.fit(n, n);
    ctx.toolbar.append(el('p', 'hint', t('Tap: shade → dot → clear. Drag to paint.')));

    const render = () => {
      const s = ctx.state.cells;
      const perRegion = new Map<number, number>();
      s.forEach((v, i) => v === SHADED && perRegion.set(regions[i], (perRegion.get(regions[i]) ?? 0) + 1));
      cells.forEach((cell, i) => {
        const v = s[i];
        const r = Math.floor(i / n);
        const c = i % n;
        const nb = [r > 0 && s[i - n], r < n - 1 && s[i + n], c > 0 && s[i - 1], c < n - 1 && s[i + 1]].filter((x) => x === SHADED).length;
        cell.classList.toggle('shaded', v === SHADED);
        cell.classList.toggle('dot', v === DOT);
        cell.classList.toggle('clash', v === SHADED && (nb > 1 || (perRegion.get(regions[i]) ?? 0) > 2));
        cell.classList.remove('wrong');
        cell.setAttribute('aria-label', `${t('Row {r}, column {c}', { r: r + 1, c: c + 1 })}: ${t(NAMES[v])}`);
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
