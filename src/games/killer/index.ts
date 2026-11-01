import { gridPeers, mountPad, newPadState, padMistakes, padProgress, padSolved, padValidSave, type PadState } from '../../core/numpad';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { sudokuCells } from '../sudoku';
import { DEFAULT_VARIANT, VARIANTS, cageOf, type KillerPuzzle } from './logic';
import { t } from '../../core/i18n';

const housePeers = gridPeers(9, 3);
const INSET = 0.09;

/**
 * SVG path (in cell units) tracing every cage just inside its border. Each
 * boundary side of a cell becomes one segment whose ends are pulled in at
 * convex corners and pushed out at concave ones, so the segments join up.
 */
export function cagePath(n: number, cage: number[]): string {
  const same = (r: number, c: number, r2: number, c2: number) =>
    r2 >= 0 && r2 < n && c2 >= 0 && c2 < n && cage[r2 * n + c2] === cage[r * n + c];
  const parts: string[] = [];
  const d = INSET;
  // For each side: outward normal (dr, dc) and the direction along it (ar, ac).
  const sides = [
    { dr: -1, dc: 0, ar: 0, ac: 1 },
    { dr: 1, dc: 0, ar: 0, ac: 1 },
    { dr: 0, dc: -1, ar: 1, ac: 0 },
    { dr: 0, dc: 1, ar: 1, ac: 0 },
  ];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      for (const { dr, dc, ar, ac } of sides) {
        if (same(r, c, r + dr, c + dc)) continue;
        // End offset along the side: -1 = start end, +1 = finish end.
        const end = (k: -1 | 1) => {
          const nr = r + ar * k;
          const nc = c + ac * k;
          if (!same(r, c, nr, nc)) return d;
          return same(r, c, nr + dr, nc + dc) ? -d : 0;
        };
        // Line position across the side, inset towards the cell centre.
        const fixed = (dr || dc) < 0 ? d : 1 - d;
        const a = end(-1);
        const b = 1 - end(1);
        const [x1, y1, x2, y2] = ar ? [c + fixed, r + a, c + fixed, r + b] : [c + a, r + fixed, c + b, r + fixed];
        parts.push(`M${+x1.toFixed(3)} ${+y1.toFixed(3)}L${+x2.toFixed(3)} ${+y2.toFixed(3)}`);
      }
    }
  }
  return parts.join('');
}

export const killer: GameModule<KillerPuzzle, PadState> = {
  id: 'killer',
  title: 'Killer Sudoku',
  blurb: 'Sudoku with no clues — just cages whose digits add up to a sum.',
  icon: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor"><rect x="2" y="2" width="26" height="26" rx="2" stroke-width="2"/><path d="M15 2v26M2 15h26" stroke-width="1.2"/><path d="M4.5 4.5h8v21h-8z M17.5 4.5h8v8h-8z" stroke-width="1.3" stroke-dasharray="2 1.6"/><g fill="currentColor" stroke="none" font-family="system-ui,sans-serif" font-weight="700" font-size="6"><text x="5.5" y="10">17</text><text x="18.5" y="10">8</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => newPadState(p.givens),
  isSolved: (p, s) => padSolved(p.solution, s),
  mistakes: (p, s) => padMistakes(p.givens, p.solution, s),
  hasProgress: (p, s) => padProgress(p.givens, s),
  isValidSave: (_, s) => padValidSave(81, s),

  mount(ctx) {
    const p = ctx.puzzle;
    const cells = sudokuCells(ctx.board, t('Killer Sudoku board'));
    const cage = cageOf(p);
    p.cages.forEach((k, idx) => {
      const first = cells[k.cells[0]];
      first.classList.add('has-sum');
      first.append(el('span', 'cage-sum', String(k.sum)));
      for (const i of k.cells) cells[i].dataset.cage = String(idx);
    });
    cells.forEach((cell, i) => {
      const k = p.cages[cage[i]];
      cell.setAttribute('aria-label', `${cell.getAttribute('aria-label')}${t(', cage of {n} summing to {sum}', { n: k.cells.length, sum: k.sum })}`);
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cage-lines');
    svg.setAttribute('viewBox', '0 0 9 9');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', cagePath(9, cage));
    svg.append(path);
    ctx.board.append(svg);
    ctx.fit(9, 9);

    const peerCache: number[][] = [];
    const peers = (i: number) =>
      (peerCache[i] ??= [...new Set([...housePeers(i), ...p.cages[cage[i]].cells.filter((j) => j !== i)])]);
    return mountPad({
      ctx,
      cells,
      max: 9,
      locked: (i) => p.givens[i] !== 0,
      peers,
      related: housePeers,
      digitTotal: 9,
    });
  },
};
