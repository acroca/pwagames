import { mulberry32, shuffle, type Rng } from '../../core/rng';

/** `value[a] < value[b]`; `a` and `b` are orthogonally adjacent row-major cell indices. */
export interface Ineq {
  a: number;
  b: number;
}

export interface FutoshikiPuzzle {
  size: number;
  /** Row-major, `size * size` entries, 0 = empty, otherwise the given value 1..size. */
  givens: number[];
  ineqs: Ineq[];
  /** Row-major values 1..size. */
  solution: number[];
  variant: string;
  seed: number;
}

/** The parts of a puzzle that define its rules (all the solvers and the checker need). */
export type FutoshikiClues = Pick<FutoshikiPuzzle, 'size' | 'givens' | 'ineqs'>;

export const VARIANTS: { id: string; label: string }[] = [
  { id: '5', label: '5×5' },
  { id: '6', label: '6×6' },
];
export const DEFAULT_VARIANT = '5';

/** Generation targets per size: allowed number of signs and maximum number of givens. */
const TUNING: Record<number, { minSigns: number; maxSigns: number; maxGivens: number }> = {
  5: { minSigns: 10, maxSigns: 13, maxGivens: 4 },
  6: { minSigns: 15, maxSigns: 20, maxGivens: 4 },
};

// Candidates are bitmasks: bit v-1 set = value v possible.
const popcount = (m: number): number => {
  let c = 0;
  for (; m; m &= m - 1) c++;
  return c;
};
const isSingle = (m: number): boolean => m !== 0 && (m & (m - 1)) === 0;
const minVal = (m: number): number => 32 - Math.clz32(m & -m);
const maxVal = (m: number): number => 32 - Math.clz32(m);
/** Mask of the values strictly below `v`. */
const below = (v: number): number => (1 << (v - 1)) - 1;

interface Ctx {
  n: number;
  full: number;
  units: number[][];
  peers: number[][];
  ineqs: Ineq[];
  /** Per cell, per unit containing it (row, column): the unit's cells transitively greater / smaller than it. */
  greater: number[][][];
  smaller: number[][][];
  /** Value masks with 2 or 3 bits, for naked subsets. */
  subsets: number[];
}

const makeCtx = ({ size: n, ineqs }: FutoshikiClues): Ctx => {
  const nn = n * n;
  const units: number[][] = [];
  for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
  const cellUnits = (i: number) => [units[Math.floor(i / n)], units[n + (i % n)]];
  const peers = Array.from({ length: nn }, (_, i) => cellUnits(i).flat().filter((j) => j !== i));

  const up: number[][] = Array.from({ length: nn }, () => []);
  const down: number[][] = Array.from({ length: nn }, () => []);
  for (const { a, b } of ineqs) {
    up[a].push(b);
    down[b].push(a);
  }
  const reach = (start: number, adj: number[][]): Uint8Array => {
    const seen = new Uint8Array(nn);
    const stack = [...adj[start]];
    while (stack.length) {
      const j = stack.pop()!;
      if (seen[j]) continue;
      seen[j] = 1;
      stack.push(...adj[j]);
    }
    return seen;
  };
  const greater: number[][][] = [];
  const smaller: number[][][] = [];
  for (let i = 0; i < nn; i++) {
    const g = reach(i, up);
    const s = reach(i, down);
    greater.push(cellUnits(i).map((u) => u.filter((j) => g[j])));
    smaller.push(cellUnits(i).map((u) => u.filter((j) => s[j])));
  }

  const full = (1 << n) - 1;
  const subsets: number[] = [];
  for (let m = 1; m < full; m++) if (popcount(m) === 2 || popcount(m) === 3) subsets.push(m);
  return { n, full, units, peers, ineqs, greater, smaller, subsets };
};

/** Initial candidates from the givens, or `null` if a given is out of range. */
const initialCands = ({ size, givens }: FutoshikiClues, full: number): Uint16Array | null => {
  const cand = new Uint16Array(size * size).fill(full);
  for (let i = 0; i < cand.length; i++) {
    const v = givens[i];
    if (!Number.isInteger(v) || v < 0 || v > size) return null;
    if (v) cand[i] = 1 << (v - 1);
  }
  return cand;
};

/**
 * Applies deductions to `cand` in place until nothing changes. Returns `false` on a contradiction.
 *
 * Basic techniques (always): naked singles, hidden singles, and min/max bounds across every inequality (repeated
 * to a fixpoint, so they propagate along chains: a cell with k cells chained above it can't exceed N−k). With
 * `advanced`, only when the basic ones are stuck: naked pairs/triples, then bounds against the cells of a row/column
 * that are transitively greater (smaller) than a cell — those k cells hold k distinct values, so the cell must be
 * below the k-th largest (above the k-th smallest) value they can still take.
 */
const propagate = (ctx: Ctx, cand: Uint16Array, advanced: boolean): boolean => {
  const { n, full, units, peers, ineqs, greater, smaller, subsets } = ctx;
  let changed = true;
  const narrow = (i: number, mask: number) => {
    const m = cand[i] & mask;
    if (m !== cand[i]) {
      cand[i] = m;
      changed = true;
    }
  };
  const consistent = () => cand.every((m) => m !== 0);

  while (changed) {
    changed = false;
    for (let i = 0; i < cand.length; i++) if (isSingle(cand[i])) for (const j of peers[i]) narrow(j, ~cand[i]);
    if (!consistent()) return false;
    for (const { a, b } of ineqs) {
      narrow(a, below(maxVal(cand[b])));
      narrow(b, full & ~below(minVal(cand[a]) + 1));
    }
    if (!consistent()) return false;
    for (const unit of units) {
      for (let bit = 1; bit <= full; bit <<= 1) {
        let count = 0;
        let at = -1;
        for (const i of unit) {
          if (cand[i] & bit) {
            count++;
            at = i;
          }
        }
        if (count === 0) return false;
        if (count === 1) narrow(at, bit);
      }
    }
    if (changed || !advanced) continue;

    for (const unit of units) {
      for (const s of subsets) {
        const inside = unit.filter((i) => (cand[i] & ~s) === 0);
        const k = popcount(s);
        if (inside.length > k) return false;
        if (inside.length === k) for (const i of unit) if (!inside.includes(i)) narrow(i, ~s);
      }
    }
    if (changed) continue;

    for (let i = 0; i < cand.length; i++) {
      for (let u = 0; u < 2; u++) {
        const g = greater[i][u];
        if (g.length) {
          let union = 0;
          for (const j of g) union |= cand[j];
          let k = g.length;
          let v = n;
          for (; v > 0; v--) if (union & (1 << (v - 1)) && --k === 0) break;
          if (v === 0) return false;
          narrow(i, below(v));
        }
        const s = smaller[i][u];
        if (s.length) {
          let union = 0;
          for (const j of s) union |= cand[j];
          let k = s.length;
          let v = 1;
          for (; v <= n; v++) if (union & (1 << (v - 1)) && --k === 0) break;
          if (v > n) return false;
          narrow(i, full & ~below(v + 1));
        }
      }
    }
    if (!consistent()) return false;
  }
  return true;
};

/**
 * Candidate bitmasks per cell (bit v-1 = value v still possible) after logical deduction, or `null` on a
 * contradiction. `advanced = false` restricts it to singles and pairwise inequality bounds.
 */
export function deduceCandidates(puzzle: FutoshikiClues, advanced = true): number[] | null {
  const ctx = makeCtx(puzzle);
  const cand = initialCands(puzzle, ctx.full);
  return cand && propagate(ctx, cand, advanced) ? Array.from(cand) : null;
}

/**
 * Human-style solver: logical deductions only (see `deduceCandidates`), no guessing. `grid` holds the values it
 * could determine (0 = unknown); `solved` is true when every cell is determined and the result is valid.
 */
export function solveLogic(puzzle: FutoshikiClues): { solved: boolean; grid: number[] } {
  const cand = deduceCandidates(puzzle);
  const grid = cand ? cand.map((m) => (isSingle(m) ? maxVal(m) : 0)) : puzzle.givens.map(() => 0);
  return { solved: validate(puzzle, grid), grid };
}

/** Counts solutions by propagation + backtracking on the cell with the fewest candidates, stopping at `limit`. */
export function countSolutions(puzzle: FutoshikiClues, limit = 2): number {
  const ctx = makeCtx(puzzle);
  const start = initialCands(puzzle, ctx.full);
  if (!start) return 0;
  let count = 0;
  const search = (cand: Uint16Array) => {
    if (!propagate(ctx, cand, false)) return;
    let best = -1;
    let bestCount = Infinity;
    for (let i = 0; i < cand.length; i++) {
      const c = popcount(cand[i]);
      if (c > 1 && c < bestCount) {
        best = i;
        bestCount = c;
      }
    }
    if (best < 0) {
      if (validate(puzzle, Array.from(cand, maxVal))) count++;
      return;
    }
    for (let m = cand[best]; m && count < limit; m &= m - 1) {
      const next = cand.slice();
      next[best] = m & -m;
      search(next);
    }
  };
  search(start);
  return count;
}

/** Checks that `grid` is a complete Latin square respecting every given and inequality of the puzzle. */
export function validate(puzzle: FutoshikiClues, grid: number[]): boolean {
  const n = puzzle.size;
  if (grid.length !== n * n) return false;
  for (let i = 0; i < n * n; i++) {
    if (!Number.isInteger(grid[i]) || grid[i] < 1 || grid[i] > n) return false;
    if (puzzle.givens[i] && puzzle.givens[i] !== grid[i]) return false;
  }
  for (let k = 0; k < n; k++) {
    const row = new Set<number>();
    const col = new Set<number>();
    for (let j = 0; j < n; j++) {
      row.add(grid[k * n + j]);
      col.add(grid[j * n + k]);
    }
    if (row.size !== n || col.size !== n) return false;
  }
  return puzzle.ineqs.every(({ a, b }) => grid[a] < grid[b]);
}

/** Random Latin square by randomized backtracking (row-major fill). */
const randomLatinSquare = (n: number, rng: Rng): number[] => {
  const grid = new Array<number>(n * n).fill(0);
  const fill = (i: number): boolean => {
    if (i === n * n) return true;
    const r = Math.floor(i / n);
    const c = i % n;
    for (const v of shuffle(rng, Array.from({ length: n }, (_, k) => k + 1))) {
      let used = false;
      for (let k = 0; k < n && !used; k++) used = grid[r * n + k] === v || grid[k * n + c] === v;
      if (used) continue;
      grid[i] = v;
      if (fill(i + 1)) return true;
    }
    grid[i] = 0;
    return false;
  };
  fill(0);
  return grid;
};

/** One generation attempt; `null` if the result misses the tuning targets. */
const tryGenerate = (n: number, rng: Rng): (FutoshikiClues & { solution: number[] }) | null => {
  const tuning = TUNING[n];
  const solution = randomLatinSquare(n, rng);
  const ineqOf = (i: number, j: number): Ineq => (solution[i] < solution[j] ? { a: i, b: j } : { a: j, b: i });
  const allIneqs: Ineq[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c + 1 < n) allIneqs.push(ineqOf(i, i + 1));
      if (r + 1 < n) allIneqs.push(ineqOf(i, i + n));
    }
  }

  // Clue ids: 0..nn-1 are givens, nn.. are inequalities.
  const nn = n * n;
  const active = new Uint8Array(nn + allIneqs.length);
  const build = (): FutoshikiClues => ({
    size: n,
    givens: solution.map((v, i) => (active[i] ? v : 0)),
    ineqs: allIneqs.filter((_, k) => active[nn + k]),
  });
  const solvable = () => solveLogic(build()).solved;

  // Start with half of the signs and a couple of givens, adding givens until it is logic-solvable.
  const ineqOrder = shuffle(rng, allIneqs.map((_, k) => nn + k));
  for (const k of ineqOrder.slice(0, Math.ceil(allIneqs.length / 2))) active[k] = 1;
  const givenOrder = shuffle(rng, Array.from({ length: nn }, (_, i) => i));
  for (const i of givenOrder) {
    if (solvable()) break;
    active[i] = 1;
  }

  // Remove givens first (keeping them few), then signs, as long as the puzzle stays logic-solvable.
  for (const k of [...givenOrder.filter((i) => active[i]), ...ineqOrder.filter((k) => active[k])]) {
    active[k] = 0;
    if (!solvable()) active[k] = 1;
  }

  // Top up with redundant signs so the board doesn't look bare (extra clues never break logic-solvability).
  let signs = ineqOrder.filter((k) => active[k]).length;
  for (const k of ineqOrder) {
    if (signs >= tuning.minSigns) break;
    if (!active[k]) {
      active[k] = 1;
      signs++;
    }
  }
  const givens = givenOrder.filter((i) => active[i]).length;
  if (signs > tuning.maxSigns || givens > tuning.maxGivens) return null;
  return { ...build(), solution };
};

/**
 * Generates a Futoshiki puzzle with a unique solution that `solveLogic` solves without guessing. Deterministic for
 * (`variant`, `seed`); unknown variants fall back to the 5×5 size.
 */
export function generate(variant: string, seed: number): FutoshikiPuzzle {
  const n = variant === '6' ? 6 : 5;
  const rng = mulberry32(seed);
  for (;;) {
    const p = tryGenerate(n, rng);
    if (!p) continue;
    const { solved, grid } = solveLogic(p);
    if (solved && grid.every((v, i) => v === p.solution[i]) && countSolutions(p) === 1) {
      return { ...p, variant, seed };
    }
  }
}
