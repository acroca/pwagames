import { gridPeers, mountPad, newPadState, padMistakes, padProgress, padSolved, padValidSave, type PadState } from '../../core/numpad';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, cageOf, opSymbol, type KenKenPuzzle } from './logic';
import { t } from '../../core/i18n';

/** Single-cell cages are shown as given digits. */
const givensOf = (p: KenKenPuzzle): number[] => {
  const givens = new Array(p.size * p.size).fill(0);
  for (const k of p.cages) if (k.cells.length === 1) givens[k.cells[0]] = k.target;
  return givens;
};

const OP_NAME: Record<string, string> = { '+': 'sum', '-': 'difference', '*': 'product', '/': 'quotient', '=': 'given' };

export const kenken: GameModule<KenKenPuzzle, PadState> = {
  id: 'kenken',
  title: 'KenKen',
  blurb: 'A Latin square where every cage hits its target with +, −, × or ÷.',
  icon: `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor"><rect x="2" y="2" width="26" height="26" rx="2" stroke-width="2"/><path d="M15 2v13M2 15h26M21 15v13" stroke-width="2.2"/><path d="M8.5 2v26M2 21.5h13" stroke-width="0.8" opacity="0.5"/><g fill="currentColor" stroke="none" font-family="system-ui,sans-serif" font-weight="700" font-size="6.5"><text x="3.5" y="8.5">6×</text><text x="16.5" y="8.5">3−</text><text x="3.5" y="21.5">7+</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => newPadState(givensOf(p)),
  isSolved: (p, s) => padSolved(p.solution, s),
  mistakes: (p, s) => padMistakes(givensOf(p), p.solution, s),
  hasProgress: (p, s) => padProgress(givensOf(p), s),
  isValidSave: (p, s) => padValidSave(p.size * p.size, s),

  mount(ctx) {
    const p = ctx.puzzle;
    const n = p.size;
    const { board } = ctx;
    const cage = cageOf(p);
    const givens = givensOf(p);
    board.classList.add('grid-board', 'num-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('KenKen board'));
    const cells = Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n);
      const c = i % n;
      const cell = el('div', 'cell');
      if (c < n - 1 && cage[i + 1] !== cage[i]) cell.classList.add('wall-r');
      if (r < n - 1 && cage[i + n] !== cage[i]) cell.classList.add('wall-b');
      const k = p.cages[cage[i]];
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${t('Row {r}, column {c}', { r: r + 1, c: c + 1 })}, ${t(OP_NAME[k.op])} ${k.target}`);
      board.append(cell);
      return cell;
    });
    for (const k of p.cages) {
      if (k.cells.length === 1) continue;
      cells[k.cells[0]].classList.add('has-sum');
      cells[k.cells[0]].append(el('span', 'cage-sum', `${k.target}${opSymbol(k.op)}`));
    }
    ctx.fit(n, n);

    return mountPad({
      ctx,
      cells,
      max: n,
      locked: (i) => givens[i] !== 0,
      peers: gridPeers(n),
      digitTotal: n,
    });
  },
};
