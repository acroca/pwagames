import { gridPeers, mountPad, newPadState, padMistakes, padProgress, padSolved, padValidSave, type PadState } from '../../core/numpad';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, type FutoshikiPuzzle } from './logic';
import { t } from '../../core/i18n';

/** Width of the sign gutters between cells, in cell units. */
const GAP = 0.42;

export const futoshiki: GameModule<FutoshikiPuzzle, PadState> = {
  id: 'futoshiki',
  title: 'Futoshiki',
  blurb: 'A Latin square with greater-than and less-than signs between cells.',
  icon: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor"><rect x="2" y="2" width="10" height="10" rx="2" stroke-width="1.6"/><rect x="18" y="2" width="10" height="10" rx="2" stroke-width="1.6"/><rect x="2" y="18" width="10" height="10" rx="2" stroke-width="1.6"/><rect x="18" y="18" width="10" height="10" rx="2" stroke-width="1.6"/><path d="M16.8 5l-3.6 2 3.6 2M5 13.4l2 3.2 2-3.2" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor" stroke="none" font-family="system-ui,sans-serif" font-weight="700" font-size="7" text-anchor="middle"><text x="7" y="9.5">1</text><text x="23" y="25.5">3</text></g></svg>`,
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
    board.classList.add('num-board');
    board.style.setProperty('--n', String(n));
    const tracks = `repeat(${n - 1}, var(--cell) calc(var(--cell) * ${GAP})) var(--cell)`;
    board.style.gridTemplateColumns = tracks;
    board.style.gridTemplateRows = tracks;
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Futoshiki board'));
    const cells = Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      const cell = el('div', 'cell');
      cell.dataset.i = String(i);
      cell.style.gridArea = `${2 * r + 1} / ${2 * c + 1}`;
      cell.setAttribute('role', 'gridcell');
      board.append(cell);
      return cell;
    });

    // One sign per inequality, placed in the gutter between its two cells.
    const signs = p.ineqs.map(({ a, b }) => {
      const lo = Math.min(a, b);
      const horizontal = Math.abs(a - b) === 1;
      const r = Math.floor(lo / n);
      const c = lo % n;
      // The sign's point faces the smaller digit: "<" when the left/top cell is smaller.
      const firstSmaller = lo === a;
      const sign = el('div', `sign ${horizontal ? 'h' : 'v'} ${firstSmaller ? 'lt' : 'gt'}`, firstSmaller ? '<' : '>');
      sign.setAttribute('aria-hidden', 'true');
      sign.style.gridArea = horizontal ? `${2 * r + 1} / ${2 * c + 2}` : `${2 * r + 2} / ${2 * c + 1}`;
      board.append(sign);
      return { a, b, sign };
    });
    cells.forEach((cell, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      const facts = signs
        .filter(({ a, b }) => a === i || b === i)
        .map(({ a, b }) => {
          const other = a === i ? b : a;
          const dir = other === i - 1 ? 'left' : other === i + 1 ? 'right' : other < i ? 'above' : 'below';
          return t(a === i ? 'smaller than the cell {dir}' : 'larger than the cell {dir}', { dir: t(dir) });
        });
      cell.setAttribute('aria-label', [t('Row {r}, column {c}', { r: r + 1, c: c + 1 }), ...facts].join(', '));
    });
    ctx.fit(n + (n - 1) * GAP, n + (n - 1) * GAP);

    return mountPad({
      ctx,
      cells,
      max: n,
      locked: (i) => p.givens[i] !== 0,
      peers: gridPeers(n),
      digitTotal: n,
      onChange() {
        const v = ctx.state.values;
        for (const { a, b, sign } of signs) sign.classList.toggle('broken', !!v[a] && !!v[b] && v[a] >= v[b]);
      },
    });
  },
};
