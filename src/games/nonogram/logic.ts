import { mulberry32, randomSeed } from '../../core/rng';

/** Solver knowledge about a cell: unknown, known empty, or known filled. */
export const UNKNOWN = -1;
export const EMPTY = 0;
export const FILLED = 1;
export type Knowledge = typeof UNKNOWN | typeof EMPTY | typeof FILLED;

export type Clue = number[];

export interface Puzzle {
  size: number;
  rows: Clue[];
  cols: Clue[];
  /** Row-major solution, 1 = filled, 0 = empty. */
  solution: number[];
  variant: string;
  seed: number;
}

/** Lengths of consecutive filled runs. An empty line yields `[]`. */
export function lineClue(line: ArrayLike<number>): Clue {
  const clue: Clue = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === FILLED) {
      run++;
    } else if (run > 0) {
      clue.push(run);
      run = 0;
    }
  }
  if (run > 0) clue.push(run);
  return clue;
}

export function row<T>(grid: T[], size: number, r: number): T[] {
  return grid.slice(r * size, r * size + size);
}

export function col<T>(grid: T[], size: number, c: number): T[] {
  const out: T[] = [];
  for (let r = 0; r < size; r++) out.push(grid[r * size + c]);
  return out;
}

export function cluesFor(solution: number[], size: number): { rows: Clue[]; cols: Clue[] } {
  const rows: Clue[] = [];
  const cols: Clue[] = [];
  for (let i = 0; i < size; i++) {
    rows.push(lineClue(row(solution, size, i)));
    cols.push(lineClue(col(solution, size, i)));
  }
  return { rows, cols };
}

/**
 * Deduces everything that can be known about a single line given its clue and
 * the current knowledge. Returns `null` if the line is contradictory.
 *
 * Considers every valid placement of the clue's blocks (memoized, so it runs in
 * polynomial time) and keeps the cells that agree across all of them.
 */
export function solveLine(clue: Clue, line: Knowledge[]): Knowledge[] | null {
  const n = line.length;
  const blocks = clue.filter((b) => b > 0);
  const canFill = new Array<boolean>(n).fill(false);
  const canEmpty = new Array<boolean>(n).fill(false);
  const memo = new Map<number, boolean>();

  const mark = (arr: boolean[], from: number, to: number) => {
    for (let i = from; i < to; i++) arr[i] = true;
  };

  // Whether blocks[bi..] can be placed starting at or after `pos`. Every call
  // is reached through a consistent prefix, so when a placement has a feasible
  // suffix the cells it covers can be marked as possible.
  const place = (bi: number, pos: number): boolean => {
    const key = bi * (n + 2) + pos;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let ok = false;
    if (bi === blocks.length) {
      ok = true;
      for (let i = pos; i < n; i++) {
        if (line[i] === FILLED) {
          ok = false;
          break;
        }
      }
      if (ok) mark(canEmpty, pos, n);
    } else {
      const len = blocks[bi];
      for (let start = pos; start + len <= n; start++) {
        // The gap before this block must be empty; once it hits a filled
        // cell, no later start can work either.
        if (start > pos && line[start - 1] === FILLED) break;
        let fits = true;
        for (let i = start; i < start + len; i++) {
          if (line[i] === EMPTY) {
            fits = false;
            break;
          }
        }
        if (!fits) continue;
        const end = start + len;
        if (end < n && line[end] === FILLED) continue;
        if (place(bi + 1, end < n ? end + 1 : n)) {
          ok = true;
          mark(canEmpty, pos, start);
          mark(canFill, start, end);
          if (end < n) canEmpty[end] = true;
        }
      }
    }

    memo.set(key, ok);
    return ok;
  };

  if (!place(0, 0)) return null;

  return line.map((_, i) => {
    if (canFill[i] && !canEmpty[i]) return FILLED;
    if (canEmpty[i] && !canFill[i]) return EMPTY;
    return UNKNOWN;
  });
}

export interface SolveResult {
  grid: Knowledge[];
  /** Every cell was determined by line logic alone. */
  solved: boolean;
  contradiction: boolean;
}

/**
 * Solves a puzzle using only line-by-line logical deduction (no guessing or
 * backtracking). If this fully solves a puzzle, its solution is unique and can
 * be reached by a human reasoning one row/column at a time.
 */
export function solveLogically(rows: Clue[], cols: Clue[]): SolveResult {
  const size = rows.length;
  const grid: Knowledge[] = new Array(size * size).fill(UNKNOWN);
  const dirtyRows = new Set<number>(rows.keys());
  const dirtyCols = new Set<number>(cols.keys());

  while (dirtyRows.size > 0 || dirtyCols.size > 0) {
    for (const r of [...dirtyRows]) {
      dirtyRows.delete(r);
      const next = solveLine(rows[r], row(grid, size, r));
      if (!next) return { grid, solved: false, contradiction: true };
      for (let c = 0; c < size; c++) {
        const i = r * size + c;
        if (grid[i] !== next[c]) {
          grid[i] = next[c];
          dirtyCols.add(c);
        }
      }
    }
    for (const c of [...dirtyCols]) {
      dirtyCols.delete(c);
      const next = solveLine(cols[c], col(grid, size, c));
      if (!next) return { grid, solved: false, contradiction: true };
      for (let r = 0; r < size; r++) {
        const i = r * size + c;
        if (grid[i] !== next[r]) {
          grid[i] = next[r];
          dirtyRows.add(r);
        }
      }
    }
  }

  return { grid, solved: !grid.includes(UNKNOWN), contradiction: false };
}

/**
 * Generates a puzzle whose unique solution can be reached purely by logic.
 * Random grids are drawn until one is fully solvable by the line solver.
 * The same seed always produces the same puzzle.
 */
export function generatePuzzle(size = 10, seed = randomSeed()): Puzzle {
  const rng = mulberry32(seed);
  for (;;) {
    const density = 0.5 + rng() * 0.15;
    const solution = Array.from({ length: size * size }, () => (rng() < density ? FILLED : EMPTY));
    const { rows, cols } = cluesFor(solution, size);
    // Fully blank lines make for dull puzzles.
    if (rows.some((c) => c.length === 0) || cols.some((c) => c.length === 0)) continue;
    const result = solveLogically(rows, cols);
    if (result.solved && result.grid.every((v, i) => v === solution[i])) {
      return { size, rows, cols, solution, variant: String(size), seed };
    }
  }
}
