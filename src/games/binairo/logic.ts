import { mulberry32, shuffle } from '../../core/rng';

/** Cell values. Givens and grids use -1 for an empty cell. */
export const EMPTY = -1;

export interface BinairoPuzzle {
  size: number;
  /** Row-major, EMPTY or 0/1. */
  givens: number[];
  /** Row-major 0/1. */
  solution: number[];
  variant: string;
  seed: number;
}

export const VARIANTS = [
  { id: '6', label: '6×6' },
  { id: '8', label: '8×8' },
  { id: '10', label: '10×10' },
];
export const DEFAULT_VARIANT = '6';

const patternCache = new Map<number, number[]>();

/**
 * Every valid line of length n as a bitmask (bit i = value of cell i): equal
 * numbers of 0s and 1s and never three equal values in a row.
 */
export function linePatterns(n: number): number[] {
  let out = patternCache.get(n);
  if (out) return out;
  out = [];
  for (let p = 0; p < 1 << n; p++) {
    let ones = 0;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const b = (p >> i) & 1;
      ones += b;
      if (i >= 2 && b === ((p >> (i - 1)) & 1) && b === ((p >> (i - 2)) & 1)) ok = false;
    }
    if (ok && ones * 2 === n) out.push(p);
  }
  patternCache.set(n, out);
  return out;
}

/** Lines 0..n-1 are rows, n..2n-1 are columns. */
const lineIndex = (n: number, line: number, k: number) => (line < n ? line * n + k : k * n + (line - n));

/**
 * Line-by-line deduction: for every row and column, keep the valid patterns
 * that agree with the known cells and differ from every completed line in the
 * same direction, then fix the cells on which all of them agree. Mutates
 * `grid`; returns false on a contradiction.
 */
function propagate(n: number, grid: Int8Array): boolean {
  const patterns = linePatterns(n);
  const lines = 2 * n;
  const full = (1 << n) - 1;
  const known = new Int32Array(lines);
  const vals = new Int32Array(lines);
  const readLine = (l: number) => {
    let k = 0;
    let v = 0;
    for (let i = 0; i < n; i++) {
      const x = grid[lineIndex(n, l, i)];
      if (x !== EMPTY) {
        k |= 1 << i;
        if (x === 1) v |= 1 << i;
      }
    }
    known[l] = k;
    vals[l] = v;
  };
  for (let l = 0; l < lines; l++) readLine(l);

  for (let changed = true; changed; ) {
    changed = false;
    for (let l = 0; l < lines; l++) {
      if (known[l] === full) continue;
      const base = l < n ? 0 : n;
      let and = full;
      let or = 0;
      let count = 0;
      for (const p of patterns) {
        if ((p & known[l]) !== vals[l]) continue;
        let dup = false;
        for (let o = base; o < base + n && !dup; o++) dup = known[o] === full && vals[o] === p;
        if (dup) continue;
        and &= p;
        or |= p;
        count++;
      }
      if (count === 0) return false;
      // Cells that are 1 in every candidate, or 0 in every candidate.
      const fixed = (and | ~or) & full & ~known[l];
      if (!fixed) continue;
      changed = true;
      for (let i = 0; i < n; i++) {
        if (!((fixed >> i) & 1)) continue;
        grid[lineIndex(n, l, i)] = (and >> i) & 1;
        readLine(l < n ? n + i : i);
      }
      readLine(l);
    }
  }
  return true;
}

/** Solves by line logic only (no guessing). */
export function solveLogic(puzzle: Pick<BinairoPuzzle, 'size' | 'givens'>): { solved: boolean; grid: number[] } {
  const grid = Int8Array.from(puzzle.givens);
  const ok = propagate(puzzle.size, grid);
  return { solved: ok && !grid.includes(EMPTY), grid: [...grid] };
}

/** Counts solutions (up to `limit`) with line propagation plus backtracking. */
export function countSolutions(puzzle: Pick<BinairoPuzzle, 'size' | 'givens'>, limit = 2): number {
  const n = puzzle.size;
  let count = 0;
  const search = (grid: Int8Array) => {
    if (count >= limit || !propagate(n, grid)) return;
    const i = grid.indexOf(EMPTY);
    if (i < 0) {
      if (validate(puzzle, [...grid])) count++;
      return;
    }
    for (const v of [0, 1]) {
      const next = grid.slice();
      next[i] = v;
      search(next);
      if (count >= limit) return;
    }
  };
  search(Int8Array.from(puzzle.givens));
  return count;
}

/** Whether a complete grid follows all the rules and matches the givens. */
export function validate(puzzle: Pick<BinairoPuzzle, 'size' | 'givens'>, grid: number[]): boolean {
  const n = puzzle.size;
  if (grid.length !== n * n || grid.some((v) => v !== 0 && v !== 1)) return false;
  if (puzzle.givens.some((g, i) => g !== EMPTY && g !== grid[i])) return false;
  const rows: string[] = [];
  const cols: string[] = [];
  for (let a = 0; a < n; a++) {
    const row: number[] = [];
    const col: number[] = [];
    for (let b = 0; b < n; b++) {
      row.push(grid[a * n + b]);
      col.push(grid[b * n + a]);
    }
    for (const line of [row, col]) {
      if (line.filter((v) => v === 1).length * 2 !== n) return false;
      if (/000|111/.test(line.join(''))) return false;
    }
    rows.push(row.join(''));
    cols.push(col.join(''));
  }
  return new Set(rows).size === n && new Set(cols).size === n;
}

/** A random complete grid, built row by row from valid line patterns. */
function randomSolution(n: number, rng: () => number): number[] {
  const patterns = linePatterns(n);
  const rows: number[] = [];
  const columnsOk = () => {
    const depth = rows.length;
    for (let c = 0; c < n; c++) {
      let ones = 0;
      for (const row of rows) ones += (row >> c) & 1;
      if (ones * 2 > n || (depth - ones) * 2 > n) return false;
      if (depth >= 3) {
        const a = (rows[depth - 1] >> c) & 1;
        if (a === ((rows[depth - 2] >> c) & 1) && a === ((rows[depth - 3] >> c) & 1)) return false;
      }
    }
    return true;
  };
  const columnsUnique = () => {
    const seen = new Set<number>();
    for (let c = 0; c < n; c++) {
      let v = 0;
      for (let r = 0; r < n; r++) v |= ((rows[r] >> c) & 1) << r;
      seen.add(v);
    }
    return seen.size === n;
  };
  const fill = (): boolean => {
    if (rows.length === n) return columnsUnique();
    for (const p of shuffle(rng, [...patterns])) {
      if (rows.includes(p)) continue;
      rows.push(p);
      if (columnsOk() && fill()) return true;
      rows.pop();
    }
    return false;
  };
  fill();
  return rows.flatMap((p) => Array.from({ length: n }, (_, c) => (p >> c) & 1));
}

/** Stop removing givens at this share of the board: sparser puzzles get grindy. */
const MIN_GIVENS = 0.3;

/**
 * Generates a puzzle with a unique solution reachable by line logic. Starting
 * from a full random grid, givens are removed in random order as long as the
 * logic solver still solves it, down to about 30% of the cells.
 */
export function generate(variant: string, seed: number): BinairoPuzzle {
  const size = VARIANTS.some((v) => v.id === variant) ? Number(variant) : Number(DEFAULT_VARIANT);
  const rng = mulberry32(seed);
  const solution = randomSolution(size, rng);
  const givens = [...solution];
  let left = givens.length;
  const floor = Math.round(givens.length * MIN_GIVENS);
  for (const i of shuffle(rng, [...givens.keys()])) {
    if (left <= floor) break;
    givens[i] = EMPTY;
    left--;
    if (!solveLogic({ size, givens }).solved) {
      givens[i] = solution[i];
      left++;
    }
  }
  return { size, givens, solution, variant: String(size), seed };
}
