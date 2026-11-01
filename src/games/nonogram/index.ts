import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { BLANK, CROSS, FILL, Stroke, isSolved, lineSatisfied, mistakes, type Mark, type Tool } from './game';
import { col, row, type Puzzle } from './logic';
import { t as tr } from '../../core/i18n';

export interface NonogramState {
  cells: Mark[];
}

const MARK_CLASS: Record<Mark, string> = { [BLANK]: '', [FILL]: 'filled', [CROSS]: 'crossed' };
const MARK_LABEL: Record<Mark, string> = { [BLANK]: 'empty', [FILL]: 'filled', [CROSS]: 'marked blocked' };

export const nonogram: GameModule<Puzzle, NonogramState> = {
  id: 'nonogram',
  title: 'Nonogram',
  blurb: 'Paint the hidden picture from the row and column clues.',
  icon: `<svg viewBox="0 0 5 5"><path d="M0 1h1v1H0zM1 0h1v3H1zM3 0h1v3H3zM4 1h1v1H4zM2 2h1v3H2zM0 3h1v1H0zM4 3h1v1H4z" fill="currentColor"/></svg>`,
  variants: [{ id: '10', label: '10×10' }],
  defaultVariant: '10',
  newState: (puzzle) => ({ cells: new Array(puzzle.size * puzzle.size).fill(BLANK) }),
  isSolved: (puzzle, state) => isSolved({ puzzle, cells: state.cells }),
  mistakes: (puzzle, state) => mistakes(puzzle, state.cells),
  hasProgress: (_, state) => state.cells.some((m) => m !== BLANK),
  isValidSave: (puzzle, state) => state.cells.length === puzzle.size * puzzle.size,

  mount(ctx) {
    const { board, toolbar } = ctx;
    const { size, rows, cols } = ctx.puzzle;
    let tool: Tool = FILL;
    let stroke: { stroke: Stroke; pointerId: number; changed: boolean } | null = null;
    const cellEls: HTMLDivElement[] = [];
    const rowClueEls: HTMLDivElement[] = [];
    const colClueEls: HTMLDivElement[] = [];

    const clueEl = (className: string, clue: number[]) => {
      const node = el('div', className);
      for (const n of clue.length ? clue : [0]) node.append(el('span', '', String(n)));
      return node;
    };

    board.style.setProperty('--size', String(size));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', tr('Nonogram board'));
    board.append(el('div', 'corner'));
    cols.forEach((clue) => {
      const node = clueEl('clue col-clue', clue);
      colClueEls.push(node);
      board.append(node);
    });
    for (let r = 0; r < size; r++) {
      const node = clueEl('clue row-clue', rows[r]);
      rowClueEls.push(node);
      board.append(node);
      for (let c = 0; c < size; c++) {
        const cell = el('div', 'cell');
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.setAttribute('role', 'gridcell');
        if (r === 0) cell.classList.add('edge-top');
        if (c === 0) cell.classList.add('edge-left');
        if (c % 5 === 4 || c === size - 1) cell.classList.add('sep-right');
        if (r % 5 === 4 || r === size - 1) cell.classList.add('sep-bottom');
        cellEls.push(cell);
        board.append(cell);
      }
    }
    ctx.fit(size + 2.6, size + 3);

    const toolBtns = [
      { t: FILL as Tool, label: 'Fill', icon: 'fill-icon' },
      { t: CROSS as Tool, label: 'Block', icon: 'cross-icon' },
    ].map(({ t, label, icon }) => {
      const btn = el('button', 'tool');
      btn.type = 'button';
      btn.append(el('span', `tool-icon ${icon}`), tr(label));
      btn.querySelector('span')!.setAttribute('aria-hidden', 'true');
      btn.addEventListener('click', () => {
        tool = t;
        renderTools();
      });
      return { t, btn };
    });
    const bar = el('div', 'tools');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', tr('Tool'));
    bar.append(...toolBtns.map((b) => b.btn));
    toolbar.append(bar);
    const renderTools = () => toolBtns.forEach(({ t, btn }) => btn.setAttribute('aria-pressed', String(t === tool)));

    const renderCell = (i: number) => {
      const node = cellEls[i];
      const mark = ctx.state.cells[i];
      node.classList.remove('filled', 'crossed', 'wrong');
      if (mark !== BLANK) node.classList.add(MARK_CLASS[mark]);
      node.setAttribute('aria-label', `${tr('Row {r}, column {c}', { r: Math.floor(i / size) + 1, c: (i % size) + 1 })}: ${tr(MARK_LABEL[mark])}`);
    };

    const renderClues = () => {
      const { cells } = ctx.state;
      for (let i = 0; i < size; i++) {
        rowClueEls[i].classList.toggle('done', lineSatisfied(row(cells, size, i), rows[i]));
        colClueEls[i].classList.toggle('done', lineSatisfied(col(cells, size, i), cols[i]));
      }
    };

    const highlightLines = (r: number | null, c: number | null) => {
      rowClueEls.forEach((x, i) => x.classList.toggle('active', i === r));
      colClueEls.forEach((x, i) => x.classList.toggle('active', i === c));
    };

    const cellAt = (x: number, y: number): { row: number; col: number } | null => {
      const node = document.elementFromPoint(x, y);
      if (!(node instanceof HTMLElement) || !node.classList.contains('cell') || !board.contains(node)) return null;
      return { row: Number(node.dataset.row), col: Number(node.dataset.col) };
    };

    const applyStroke = (r: number, c: number) => {
      if (!stroke) return;
      const before = [...ctx.state.cells];
      const changed = stroke.stroke.apply(ctx.state.cells, r, c);
      if (changed.length) {
        if (!stroke.changed) {
          // Record the pre-stroke board once, then keep mutating in place.
          const after = ctx.state.cells;
          ctx.state.cells = before;
          ctx.checkpoint();
          ctx.state.cells = after;
        }
        stroke.changed = true;
        changed.forEach(renderCell);
        renderClues();
      }
    };

    // Touch drawing: one finger paints; extra fingers are ignored. The finger
    // hides the cell, so the touched row/column clues are highlighted instead.
    const down = (e: PointerEvent) => {
      if (ctx.finished || stroke || !e.isPrimary) return;
      const target = cellAt(e.clientX, e.clientY);
      if (!target) return;
      e.preventDefault();
      stroke = {
        stroke: new Stroke(size, target.row, target.col, ctx.state.cells, tool),
        pointerId: e.pointerId,
        changed: false,
      };
      highlightLines(target.row, target.col);
      applyStroke(target.row, target.col);
    };
    const move = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.pointerId) return;
      const target = cellAt(e.clientX, e.clientY);
      if (!target) return;
      highlightLines(target.row, target.col);
      applyStroke(target.row, target.col);
    };
    const end = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.pointerId) return;
      const { changed } = stroke;
      stroke = null;
      highlightLines(null, null);
      if (changed) ctx.commit();
    };
    board.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    return {
      render() {
        ctx.state.cells.forEach((_, i) => renderCell(i));
        renderClues();
        renderTools();
      },
      showMistakes(cells) {
        cells.forEach((i) => cellEls[i].classList.add('wrong'));
      },
      destroy() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      },
    };
  },
};
