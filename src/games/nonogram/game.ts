import { FILLED, generatePuzzle, lineClue, type Clue, type Puzzle } from './logic';

/** Player marks on the board. */
export const BLANK = 0;
export const FILL = 1;
export const CROSS = 2;
export type Mark = typeof BLANK | typeof FILL | typeof CROSS;
export type Tool = typeof FILL | typeof CROSS;

export interface GameState {
  puzzle: Puzzle;
  cells: Mark[];
}

export function newGame(size = 10, seed?: number): GameState {
  const puzzle = generatePuzzle(size, seed);
  return { puzzle, cells: new Array(size * size).fill(BLANK) };
}

/** Cells that contradict the solution: fills on empty cells and crosses on filled ones. */
export function mistakes(puzzle: Puzzle, cells: Mark[]): number[] {
  const out: number[] = [];
  cells.forEach((m, i) => {
    if ((m === FILL && puzzle.solution[i] !== FILLED) || (m === CROSS && puzzle.solution[i] === FILLED)) out.push(i);
  });
  return out;
}

/** A filled region matches the solution exactly (crosses are just notes). */
export function isSolved(state: GameState): boolean {
  return state.puzzle.solution.every((v, i) => (v === FILLED) === (state.cells[i] === FILL));
}

/** Whether the filled cells of a line already match its clue. */
export function lineSatisfied(marks: Mark[], clue: Clue): boolean {
  const filled = marks.map((m) => (m === FILL ? FILLED : 0));
  const actual = lineClue(filled);
  return actual.length === clue.length && actual.every((v, i) => v === clue[i]);
}

/**
 * A stroke is one press-drag-release gesture. Its effect is decided by the
 * first cell: pressing a cell that already has the tool's mark clears it,
 * otherwise it applies the mark. While dragging, only cells that were in the
 * same state as the first cell are changed, so existing work isn't clobbered.
 */
export class Stroke {
  readonly from: Mark;
  readonly to: Mark;
  private axis: 'row' | 'col' | null = null;

  constructor(
    private readonly size: number,
    readonly startRow: number,
    readonly startCol: number,
    cells: Mark[],
    tool: Tool,
  ) {
    this.from = cells[startRow * size + startCol];
    this.to = this.from === tool ? BLANK : tool;
  }

  /** Indices to update when the pointer is over (row, col). */
  cellsTo(row: number, col: number): number[] {
    if (this.axis === null && (row !== this.startRow || col !== this.startCol)) {
      this.axis = Math.abs(row - this.startRow) >= Math.abs(col - this.startCol) ? 'col' : 'row';
    }
    const out: number[] = [];
    if (this.axis === 'row') {
      const [a, b] = [this.startCol, col].sort((x, y) => x - y);
      for (let c = a; c <= b; c++) out.push(this.startRow * this.size + c);
    } else if (this.axis === 'col') {
      const [a, b] = [this.startRow, row].sort((x, y) => x - y);
      for (let r = a; r <= b; r++) out.push(r * this.size + this.startCol);
    } else {
      out.push(this.startRow * this.size + this.startCol);
    }
    return out;
  }

  /** Applies the stroke to the cells under (row, col); returns changed indices. */
  apply(cells: Mark[], row: number, col: number): number[] {
    const changed: number[] = [];
    for (const i of this.cellsTo(row, col)) {
      if (cells[i] === this.from && cells[i] !== this.to) {
        cells[i] = this.to;
        changed.push(i);
      }
    }
    return changed;
  }
}
