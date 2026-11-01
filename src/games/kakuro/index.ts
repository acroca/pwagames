import { mountPad, newPadState, padMistakes, padProgress, padSolved, padValidSave, type PadState } from '../../core/numpad';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, combinations, runs, type KakuroPuzzle, type Run } from './logic';
import { t } from '../../core/i18n';

export const kakuro: GameModule<KakuroPuzzle, PadState> = {
  id: 'kakuro',
  title: 'Kakuro',
  blurb: 'A crossword of sums: each run of white cells adds up to its clue.',
  icon: `<svg viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 2h13v13H2z" fill="currentColor"/><path d="M3 3l11 11" stroke="#fff" stroke-width="1"/><path d="M15 2v26M2 15h26" stroke="currentColor" stroke-width="1.2"/><g font-family="system-ui,sans-serif" font-weight="700" text-anchor="middle"><text x="11" y="7.8" font-size="5" fill="#fff">9</text><text x="6" y="13" font-size="5" fill="#fff">4</text><text x="21.5" y="11.5" font-size="8" fill="currentColor">8</text><text x="8.5" y="24.5" font-size="8" fill="currentColor">3</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  settings: [{ id: 'combos', label: 'Show combinations for the selected runs', default: true }],
  newState: (p) => newPadState(new Array(p.size * p.size).fill(0)),
  isSolved: (p, s) => padSolved(p.solution, s),
  mistakes: (p, s) => padMistakes(p.blocks.map(() => 0), p.solution, s),
  hasProgress: (p, s) => padProgress(p.blocks.map(() => 0), s),
  isValidSave: (p, s) => padValidSave(p.size * p.size, s),

  mount(ctx) {
    const p = ctx.puzzle;
    const n = p.size;
    const { board } = ctx;
    board.classList.add('grid-board', 'num-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Kakuro board'));

    const allRuns = runs(p);
    const runsOf: Run[][] = p.blocks.map(() => []);
    for (const run of allRuns) for (const i of run.cells) runsOf[i].push(run);

    const cells = p.blocks.map((block, i) => {
      const r = Math.floor(i / n) + 1;
      const c = (i % n) + 1;
      const cell = el('div', block ? 'cell block' : 'cell');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      if (block) {
        const across = p.across[i];
        const down = p.down[i];
        if (across || down) {
          cell.classList.add('clue');
          if (across) cell.append(el('span', 'clue-across', String(across)));
          if (down) cell.append(el('span', 'clue-down', String(down)));
          const parts = [across && t('across sum {n}', { n: across }), down && t('down sum {n}', { n: down })].filter(Boolean);
          cell.setAttribute('aria-label', `${t('Row {r}, column {c}', { r, c })}${t(': clue, {parts}', { parts: parts.join(', ') })}`);
        } else {
          cell.setAttribute('aria-label', `${t('Row {r}, column {c}', { r, c })}${t(': blank')}`);
        }
      } else {
        cell.setAttribute('aria-label', t('Row {r}, column {c}', { r, c }));
      }
      board.append(cell);
      return block ? null : cell;
    });
    ctx.fit(n, n);

    const combos = el('div', 'combos');
    combos.setAttribute('aria-live', 'polite');
    ctx.toolbar.append(combos);

    const describe = (run: Run): HTMLElement => {
      const row = el('div', 'combo-row');
      const placed = new Set(run.cells.map((i) => ctx.state.values[i]).filter(Boolean));
      row.append(el('span', 'combo-head', `${run.dir === 'across' ? '→' : '↓'} ${run.sum} in ${run.cells.length}`));
      const list = el('span', 'combo-list');
      for (const set of combinations(run.sum, run.cells.length)) {
        const fits = [...placed].every((d) => set.includes(d));
        list.append(el('span', fits ? 'combo' : 'combo out', set.join('')));
      }
      row.append(list);
      return row;
    };

    const peerCache: number[][] = [];
    const peers = (i: number) =>
      (peerCache[i] ??= [...new Set(runsOf[i].flatMap((run) => run.cells))].filter((j) => j !== i));

    return mountPad({
      ctx,
      cells,
      max: 9,
      locked: () => false,
      peers,
      onChange(selected) {
        combos.hidden = !ctx.setting('combos');
        combos.replaceChildren();
        if (selected === null || combos.hidden) return;
        const mine = [...runsOf[selected]].sort((a, b) => a.dir.localeCompare(b.dir));
        combos.append(...mine.map(describe));
      },
    });
  },
};
