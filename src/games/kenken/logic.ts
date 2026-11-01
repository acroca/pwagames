import { mulberry32, pick, shuffle, type Rng } from '../../core/rng';

export type CageOp = '+' | '-' | '*' | '/' | '=';

export interface Cage {
  /** Sorted row-major cell indices, orthogonally connected. */
  cells: number[];
  op: CageOp;
  target: number;
}

export interface KenKenPuzzle {
  size: number;
  cages: Cage[];
  /** Row-major solution, values 1..size. */
  solution: number[];
  variant: string;
  seed: number;
}

export const VARIANTS: { id: string; label: string }[] = [
  { id: '4', label: '4×4' },
  { id: '5', label: '5×5' },
  { id: '6', label: '6×6' },
];

export const DEFAULT_VARIANT = '5';

/** Index of the cage containing each cell. */
export function cageOf(puzzle: KenKenPuzzle): number[] {
  const out = new Array<number>(puzzle.size * puzzle.size).fill(-1);
  puzzle.cages.forEach((cage, ci) => {
    for (const i of cage.cells) out[i] = ci;
  });
  return out;
}

/** Display symbol for a cage operation ('' for single-cell givens). */
export function opSymbol(op: CageOp): string {
  switch (op) {
    case '+':
      return '+';
    case '-':
      return '−';
    case '*':
      return '×';
    case '/':
      return '÷';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Solver: candidates are bitmasks per cell, bit (d - 1) set when digit d is possible.

const POP = new Uint8Array(1 << 9).map((_, m) => {
  let c = 0;
  for (let x = m; x; x &= x - 1) c++;
  return c;
});

const bit = (d: number) => 1 << (d - 1);
/** Highest digit in a mask (the digit, for a single-bit mask). */
const digitOf = (m: number) => 32 - Math.clz32(m);

interface CageInfo extends Cage {
  /** Per position, bitmask of earlier positions sharing a row or column. */
  conflicts: number[];
  rows: number[];
  cols: number[];
  rowSlot: number[];
  colSlot: number[];
}

export interface SolverContext {
  n: number;
  full: number;
  /** Rows 0..n-1 followed by columns. */
  lines: number[][];
  peers: number[][];
  cages: CageInfo[];
  cellCage: number[];
}

/** Precomputes the lookup tables used by the solver techniques. Exposed for tests. */
export function createContext(puzzle: KenKenPuzzle): SolverContext {
  const n = puzzle.size;
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  const peers = Array.from({ length: n * n }, (_, i) =>
    [...lines[Math.floor(i / n)], ...lines[n + (i % n)]].filter((j) => j !== i),
  );
  const cages = puzzle.cages.map((cage): CageInfo => {
    const rs = cage.cells.map((i) => Math.floor(i / n));
    const cs = cage.cells.map((i) => i % n);
    const rows = [...new Set(rs)];
    const cols = [...new Set(cs)];
    const conflicts = cage.cells.map((_, k) => {
      let m = 0;
      for (let j = 0; j < k; j++) if (rs[j] === rs[k] || cs[j] === cs[k]) m |= 1 << j;
      return m;
    });
    return {
      ...cage,
      conflicts,
      rows,
      cols,
      rowSlot: rs.map((r) => rows.indexOf(r)),
      colSlot: cs.map((c) => cols.indexOf(c)),
    };
  });
  return { n, full: (1 << n) - 1, lines, peers, cages, cellCage: cageOf(puzzle) };
}

/** Result codes of a technique pass. */
export const CONTRADICTION = -1;
export const NO_CHANGE = 0;
export const CHANGED = 1;
export type PassResult = typeof CONTRADICTION | typeof NO_CHANGE | typeof CHANGED;

/** Removes the digits of solved cells from their row/column peers. */
export function nakedSingles(ctx: SolverContext, cand: Uint16Array): PassResult {
  let result: PassResult = NO_CHANGE;
  for (let i = 0; i < cand.length; i++) {
    const m = cand[i];
    if (POP[m] !== 1) continue;
    for (const j of ctx.peers[i]) {
      if (!(cand[j] & m)) continue;
      cand[j] &= ~m;
      if (!cand[j]) return CONTRADICTION;
      result = CHANGED;
    }
  }
  return result;
}

/** Places a digit that has a single possible cell in a row/column. */
export function hiddenSingles(ctx: SolverContext, cand: Uint16Array): PassResult {
  let result: PassResult = NO_CHANGE;
  for (const line of ctx.lines) {
    for (let d = 1; d <= ctx.n; d++) {
      const b = bit(d);
      let where = -1;
      let count = 0;
      for (const i of line) {
        if (cand[i] & b) {
          where = i;
          count++;
        }
      }
      if (count === 0) return CONTRADICTION;
      if (count === 1 && cand[where] !== b) {
        cand[where] = b;
        result = CHANGED;
      }
    }
  }
  return result;
}

/**
 * Naked pairs/triples: when k unsolved cells of a row/column share only k candidates
 * between them, those digits are removed from the rest of the line.
 */
export function nakedSubsets(ctx: SolverContext, cand: Uint16Array, maxK = 3): PassResult {
  let result: PassResult = NO_CHANGE;
  for (const line of ctx.lines) {
    const open = line.filter((i) => POP[cand[i]] > 1);
    // Finds one subset that eliminates something, applies it and reports.
    const tryFrom = (start: number, chosen: number[], union: number): PassResult => {
      if (chosen.length >= 2 && POP[union] === chosen.length) {
        let r: PassResult = NO_CHANGE;
        for (const i of open) {
          if (chosen.includes(i) || !(cand[i] & union)) continue;
          cand[i] &= ~union;
          if (!cand[i]) return CONTRADICTION;
          r = CHANGED;
        }
        return r;
      }
      if (chosen.length === maxK) return NO_CHANGE;
      for (let s = start; s < open.length; s++) {
        const u = union | cand[open[s]];
        if (POP[u] > maxK) continue;
        chosen.push(open[s]);
        const r = tryFrom(s + 1, chosen, u);
        chosen.pop();
        if (r !== NO_CHANGE) return r;
      }
      return NO_CHANGE;
    };
    for (;;) {
      const r = open.length > 2 ? tryFrom(0, [], 0) : NO_CHANGE;
      if (r === CONTRADICTION) return r;
      if (r === NO_CHANGE) break;
      result = CHANGED;
    }
  }
  return result;
}

interface CageScan {
  /** Digits used per cage cell by some valid assignment. */
  support: number[];
  /** Per cage row/column slot, digits that every valid assignment places there. */
  rowMust: number[];
  colMust: number[];
}

/**
 * Enumerates every assignment of a cage consistent with the candidates, the cage
 * arithmetic and distinctness of cage cells sharing a row/column. Returns null if
 * no assignment exists.
 */
function scanCage(n: number, cage: CageInfo, cand: Uint16Array): CageScan | null {
  const { cells, op, target, conflicts, rowSlot, colSlot } = cage;
  const len = cells.length;
  const vals = new Array<number>(len).fill(0);
  const support = new Array<number>(len).fill(0);
  const rowMust = new Array<number>(cage.rows.length).fill(-1);
  const colMust = new Array<number>(cage.cols.length).fill(-1);
  const rowHave = new Array<number>(cage.rows.length);
  const colHave = new Array<number>(cage.cols.length);
  let found = false;

  const leaf = (acc: number) => {
    const [a, b] = vals;
    const ok =
      op === '+' || op === '*'
        ? acc === target
        : op === '-'
          ? Math.abs(a - b) === target
          : op === '/'
            ? a * target === b || b * target === a
            : a === target;
    if (!ok) return;
    found = true;
    rowHave.fill(0);
    colHave.fill(0);
    for (let k = 0; k < len; k++) {
      const m = bit(vals[k]);
      support[k] |= m;
      rowHave[rowSlot[k]] |= m;
      colHave[colSlot[k]] |= m;
    }
    for (let s = 0; s < rowHave.length; s++) rowMust[s] &= rowHave[s];
    for (let s = 0; s < colHave.length; s++) colMust[s] &= colHave[s];
  };

  const rec = (k: number, acc: number): void => {
    if (k === len) return leaf(acc);
    let m = cand[cells[k]];
    for (let c = conflicts[k], j = 0; c; c >>= 1, j++) if (c & 1) m &= ~bit(vals[j]);
    const rem = len - k - 1;
    for (; m; m &= m - 1) {
      const d = digitOf(m & -m);
      let next = acc;
      if (op === '+') {
        next = acc + d;
        if (next + rem > target || next + rem * n < target) continue;
      } else if (op === '*') {
        next = acc * d;
        if (target % next) continue;
      }
      vals[k] = d;
      rec(k + 1, next);
    }
  };

  rec(0, op === '*' ? 1 : 0);
  return found ? { support, rowMust, colMust } : null;
}

/**
 * Cage permutation propagation: keeps only candidates used by some valid cage
 * assignment. With `lineElim`, a digit that every assignment places inside the cage
 * within one row/column is also removed from the rest of that row/column.
 */
export function cagePass(ctx: SolverContext, cand: Uint16Array, lineElim = true): PassResult {
  let result: PassResult = NO_CHANGE;
  const eliminate = (cells: number[], ci: number, mask: number): boolean => {
    for (const i of cells) {
      if (ctx.cellCage[i] === ci || !(cand[i] & mask)) continue;
      cand[i] &= ~mask;
      if (!cand[i]) return false;
      result = CHANGED;
    }
    return true;
  };
  for (let ci = 0; ci < ctx.cages.length; ci++) {
    const cage = ctx.cages[ci];
    const scan = scanCage(ctx.n, cage, cand);
    if (!scan) return CONTRADICTION;
    const { support, rowMust, colMust } = scan;
    cage.cells.forEach((i, k) => {
      if (cand[i] !== support[k]) {
        cand[i] = support[k];
        result = CHANGED;
      }
    });
    if (!lineElim) continue;
    for (let s = 0; s < cage.rows.length; s++) {
      if (rowMust[s] && !eliminate(ctx.lines[cage.rows[s]], ci, rowMust[s])) return CONTRADICTION;
    }
    for (let s = 0; s < cage.cols.length; s++) {
      if (colMust[s] && !eliminate(ctx.lines[ctx.n + cage.cols[s]], ci, colMust[s])) return CONTRADICTION;
    }
  }
  return result;
}

type Pass = (ctx: SolverContext, cand: Uint16Array) => PassResult;

/** Cage arithmetic and naked singles only: puzzles solved by these alone are too easy. */
const BASIC: Pass[] = [nakedSingles, (ctx, cand) => cagePass(ctx, cand, false)];
const SEARCH: Pass[] = [nakedSingles, hiddenSingles, cagePass];
const FULL: Pass[] = [...SEARCH, nakedSubsets];

/** Runs techniques (cheapest first) to a fixpoint. Returns false on contradiction. */
function propagate(ctx: SolverContext, cand: Uint16Array, passes: Pass[]): boolean {
  for (let p = 0; p < passes.length; ) {
    const r = passes[p](ctx, cand);
    if (r === CONTRADICTION) return false;
    p = r === CHANGED ? 0 : p + 1;
  }
  return true;
}

const toGrid = (cand: Uint16Array): number[] => Array.from(cand, (m) => (POP[m] === 1 ? digitOf(m) : 0));

const solveWith = (puzzle: KenKenPuzzle, passes: Pass[]): { solved: boolean; grid: number[] } => {
  const ctx = createContext(puzzle);
  const cand = new Uint16Array(ctx.n * ctx.n).fill(ctx.full);
  const ok = propagate(ctx, cand, passes);
  const grid = toGrid(cand);
  return { solved: ok && !grid.includes(0), grid };
};

/**
 * Human-style solver: cage permutation propagation (with row/column eliminations
 * of digits confined to a cage), naked/hidden singles and naked pairs/triples,
 * applied to a fixpoint without guessing. Unsolved cells are 0 in `grid`.
 */
export function solveLogic(puzzle: KenKenPuzzle): { solved: boolean; grid: number[] } {
  return solveWith(puzzle, FULL);
}

/** Counts solutions (up to `limit`) with propagation plus backtracking on the most constrained cell. */
export function countSolutions(puzzle: KenKenPuzzle, limit = 2): number {
  const ctx = createContext(puzzle);
  let count = 0;
  const search = (cand: Uint16Array) => {
    if (!propagate(ctx, cand, SEARCH)) return;
    let best = -1;
    for (let i = 0; i < cand.length; i++) {
      const p = POP[cand[i]];
      if (p > 1 && (best < 0 || p < POP[cand[best]])) best = i;
    }
    if (best < 0) {
      if (validate(puzzle, toGrid(cand))) count++;
      return;
    }
    for (let m = cand[best]; m && count < limit; m &= m - 1) {
      const next = cand.slice();
      next[best] = m & -m;
      search(next);
    }
  };
  search(new Uint16Array(ctx.n * ctx.n).fill(ctx.full));
  return count;
}

/** Independent checker: Latin square of 1..size, cages partition the grid and meet their targets. */
export function validate(puzzle: KenKenPuzzle, grid: number[]): boolean {
  const n = puzzle.size;
  if (grid.length !== n * n || grid.some((v) => !Number.isInteger(v) || v < 1 || v > n)) return false;
  for (let a = 0; a < n; a++) {
    const row = new Set<number>();
    const col = new Set<number>();
    for (let b = 0; b < n; b++) {
      row.add(grid[a * n + b]);
      col.add(grid[b * n + a]);
    }
    if (row.size !== n || col.size !== n) return false;
  }
  const covered = new Array<number>(n * n).fill(0);
  for (const { cells, op, target } of puzzle.cages) {
    for (const i of cells) covered[i]++;
    const v = cells.map((i) => grid[i]);
    let value: number;
    if (op === '+') value = v.reduce((s, x) => s + x, 0);
    else if (op === '*') value = v.reduce((s, x) => s * x, 1);
    else if (op === '-' && v.length === 2) value = Math.max(...v) - Math.min(...v);
    else if (op === '/' && v.length === 2) value = Math.max(...v) / Math.min(...v);
    else if (op === '=' && v.length === 1) value = v[0];
    else return false;
    if (value !== target) return false;
  }
  return covered.every((c) => c === 1);
}

// ---------------------------------------------------------------------------
// Generation

/** Random Latin square by randomized backtracking. */
function latinSquare(rng: Rng, n: number): number[] {
  const grid = new Array<number>(n * n).fill(0);
  const rowUsed = new Array<number>(n).fill(0);
  const colUsed = new Array<number>(n).fill(0);
  const fill = (i: number): boolean => {
    if (i === n * n) return true;
    const r = Math.floor(i / n);
    const c = i % n;
    const free = Array.from({ length: n }, (_, k) => k + 1).filter((d) => !((rowUsed[r] | colUsed[c]) & bit(d)));
    for (const d of shuffle(rng, free)) {
      grid[i] = d;
      rowUsed[r] |= bit(d);
      colUsed[c] |= bit(d);
      if (fill(i + 1)) return true;
      rowUsed[r] &= ~bit(d);
      colUsed[c] &= ~bit(d);
    }
    return false;
  };
  fill(0);
  return grid;
}

const neighbors = (i: number, n: number): number[] => {
  const r = Math.floor(i / n);
  const c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
};

/**
 * Random partition into connected cages of mostly 2–3 cells, some 4. Isolated cells
 * become single-cell cages (at most `maxSingles`) or join an adjacent cage with room.
 * Returns null if too many isolated cells cannot be absorbed.
 */
function partition(rng: Rng, n: number, maxSingles: number): number[][] | null {
  const owner = new Array<number>(n * n).fill(-1);
  const cages: number[][] = [];
  for (const start of shuffle(rng, Array.from({ length: n * n }, (_, i) => i))) {
    if (owner[start] >= 0) continue;
    const r = rng();
    const want = r < 0.45 ? 2 : r < 0.85 ? 3 : 4;
    const cells = [start];
    owner[start] = cages.length;
    while (cells.length < want) {
      const frontier = cells.flatMap((i) => neighbors(i, n)).filter((j) => owner[j] < 0);
      if (!frontier.length) break;
      const next = pick(rng, frontier);
      owner[next] = cages.length;
      cells.push(next);
    }
    cages.push(cells);
  }
  let singles = 0;
  for (const cells of cages) {
    if (cells.length !== 1) continue;
    const [i] = cells;
    const hosts = neighbors(i, n).filter((j) => cages[owner[j]].length > 1 && cages[owner[j]].length < 4);
    if (hosts.length && (singles >= maxSingles || rng() < 0.6)) {
      const host = owner[pick(rng, hosts)];
      cages[host].push(i);
      owner[i] = host;
      cells.length = 0;
    } else if (++singles > maxSingles) {
      return null;
    }
  }
  return cages.filter((c) => c.length > 0).map((c) => c.sort((a, b) => a - b));
}

/** Picks an operation for a cage given its solution values. */
function makeCage(rng: Rng, cells: number[], solution: number[], n: number): Cage {
  const v = cells.map((i) => solution[i]);
  if (v.length === 1) return { cells, op: '=', target: v[0] };
  if (v.length === 2) {
    const hi = Math.max(...v);
    const lo = Math.min(...v);
    if (hi % lo === 0 && rng() < (lo === 1 ? 0.2 : 0.7)) return { cells, op: '/', target: hi / lo };
    const r = rng();
    if (r < 0.5) return { cells, op: '-', target: hi - lo };
    if (r < 0.75) return { cells, op: '+', target: hi + lo };
    return { cells, op: '*', target: hi * lo };
  }
  const product = v.reduce((p, x) => p * x, 1);
  // Huge products pin the digits down almost by themselves.
  if (product <= 4 * n * n && rng() < 0.45) return { cells, op: '*', target: product };
  return { cells, op: '+', target: v.reduce((s, x) => s + x, 0) };
}

/**
 * Generates a puzzle with a unique solution that `solveLogic` fully solves.
 * Draws a random Latin square and cage partition, picks operations, and re-picks
 * the operations of cages left unsolved (or re-partitions) until it is logic-solvable.
 * Puzzles that fall to cage arithmetic and naked singles alone are rejected as too easy.
 */
export function generate(variant: string, seed: number): KenKenPuzzle {
  if (!VARIANTS.some((v) => v.id === variant)) throw new Error(`Unknown KenKen variant: ${variant}`);
  const n = Number(variant);
  const rng = mulberry32(seed);
  const maxSingles = n <= 4 ? 1 : 2;
  for (;;) {
    const solution = latinSquare(rng, n);
    for (let attempt = 0; attempt < 6; attempt++) {
      const parts = partition(rng, n, maxSingles);
      if (!parts) continue;
      let cages = parts.map((cells) => makeCage(rng, cells, solution, n));
      for (let round = 0; round < 4; round++) {
        const puzzle: KenKenPuzzle = { size: n, cages, solution, variant, seed };
        const { solved, grid } = solveLogic(puzzle);
        if (solved) {
          if (solveWith(puzzle, BASIC).solved) break;
          if (grid.every((v, i) => v === solution[i]) && countSolutions(puzzle) === 1) return puzzle;
        }
        cages = cages.map((c) => (c.cells.some((i) => grid[i] === 0) ? makeCage(rng, c.cells, solution, n) : c));
      }
    }
  }
}
