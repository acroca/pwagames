import { t } from '../../core/i18n';
import { trackStrokes } from '../../core/pointer';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, type NumberlinkPuzzle } from './logic';

export interface NumberlinkState {
  /** Per cell: 0 or the pair number painted there (endpoints start filled in and stay locked). */
  cells: number[];
}

const hue = (k: number) => (k * 137 + 20) % 360;

export const numberlink: GameModule<NumberlinkPuzzle, NumberlinkState> = {
  id: 'numberlink',
  title: 'Numberlink',
  blurb: 'Join matching numbers with paths that fill the whole grid.',
  icon: `<svg viewBox="0 0 30 30"><path d="M7 7h9a4 4 0 014 4v10M7 23h6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/><g style="fill:var(--surface)" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="4.500"/><circle cx="20" cy="23" r="4.500"/><circle cx="7" cy="23" r="4.500"/><circle cx="13" cy="23" r="0.01"/></g><g fill="currentColor" font-family="system-ui,sans-serif" font-weight="700" font-size="7" text-anchor="middle"><text x="7" y="9.500">1</text><text x="20" y="25.500">1</text><text x="7" y="25.500">2</text></g></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => ({ cells: p.ends.slice() }),
  isSolved: (p, s) => s.cells.every((v, i) => v === p.solution[i]),
  mistakes: (p, s) => s.cells.flatMap((v, i) => (v !== 0 && v !== p.solution[i] ? [i] : [])),
  hasProgress: (p, s) => s.cells.some((v, i) => v !== p.ends[i]),
  isValidSave: (p, s) => Array.isArray(s?.cells) && s.cells.length === p.size * p.size,

  mount(ctx) {
    const { board } = ctx;
    const { size: n, ends, pairs } = ctx.puzzle;
    board.classList.add('grid-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Numberlink board'));
    const cells = ends.map((k, i) => {
      const cell = el('div', 'cell');
      cell.dataset.i = String(i);
      cell.setAttribute('role', 'gridcell');
      if (k) {
        cell.classList.add('end');
        cell.append(el('span', 'tag', String(k)));
      }
      board.append(cell);
      return cell;
    });
    ctx.fit(n, n);
    ctx.toolbar.append(el('p', 'hint', t('Drag from a number through the cells to draw its path. Tap a path cell to clear it.')));

    const near = (i: number) => [i >= n ? i - n : -1, i + n < n * n ? i + n : -1, i % n ? i - 1 : -1, i % n < n - 1 ? i + 1 : -1].filter((x) => x >= 0);

    const render = () => {
      const s = ctx.state.cells;
      const linked = new Set<number>();
      for (let k = 1; k <= pairs; k++) {
        const [a, b] = ends.flatMap((x, i) => (x === k ? [i] : []));
        const seen = new Set([a]);
        const stack = [a];
        while (stack.length > 0) for (const j of near(stack.pop()!)) if (s[j] === k && !seen.has(j)) (seen.add(j), stack.push(j));
        if (seen.has(b)) linked.add(k);
      }
      cells.forEach((cell, i) => {
        const k = s[i];
        cell.style.setProperty('--h', String(hue(k)));
        cell.classList.toggle('painted', k > 0);
        cell.classList.toggle('linked', ends[i] > 0 && linked.has(k));
        cell.classList.remove('wrong');
        cell.setAttribute('aria-label', `${t('Row {r}, column {c}', { r: Math.floor(i / n) + 1, c: (i % n) + 1 })}: ${k ? t('path {n}', { n: k }) : t('empty')}`);
      });
    };

    let mode: { colour: number; moved: boolean; start: number } | null = null;
    let dirty = false;
    const paint = (i: number, colour: number) => {
      if (ends[i] || ctx.state.cells[i] === colour) return;
      if (!dirty) ctx.checkpoint();
      dirty = true;
      ctx.state.cells[i] = colour;
      render();
    };
    const stop = trackStrokes(board, {
      start(i) {
        if (ctx.finished) return false;
        mode = { colour: ctx.state.cells[i], moved: false, start: i };
        dirty = false;
        return true;
      },
      enter(i) {
        if (!mode) return;
        mode.moved = true;
        paint(i, mode.colour);
      },
      end(moved) {
        if (mode && !moved && !ends[mode.start] && mode.colour) paint(mode.start, 0);
        mode = null;
        if (dirty) ctx.commit();
      },
    });

    return {
      render,
      showMistakes: (wrong) => wrong.forEach((i) => cells[i].classList.add('wrong')),
      destroy: stop,
    };
  },
};
