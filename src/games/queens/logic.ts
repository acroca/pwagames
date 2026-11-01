import { mulberry32, pick, randInt, shuffle, type Rng } from '../../core/rng';

export interface QueensPuzzle {
  size: number;
  /** Row-major, length size², region id 0..size-1 per cell; each region is orthogonally connected. */
  regions: number[];
  /** Length size: solution[r] = column of the queen in row r. */
  solution: number[];
  variant: string;
  seed: number;
}

export const VARIANTS: { id: string; label: string }[] = [
  { id: '7', label: '7×7' },
  { id: '8', label: '8×8' },
  { id: '9', label: '9×9' },
  { id: '10', label: '10×10' },
];
export const DEFAULT_VARIANT = '8';

/** Technique levels reported by `solveLogic`: 0 = singles, 1..4 = confinement of k units, 5 = lookahead. */
export const SINGLES = 0;
export const MAX_CONFINEMENT = 4;
export const LOOKAHEAD = 5;

/** Cells (excluding `cell`) that a queen at `cell` rules out: same row, column, region and the 8 neighbours. */
export function ruledOut(size: number, regions: number[], cell: number): number[] {
  const r0 = Math.floor(cell / size);
  const c0 = cell % size;
  const out: number[] = [];
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    if (i === cell) continue;
    if (r === r0 || c === c0 || regions[i] === regions[cell] || (Math.abs(r - r0) <= 1 && Math.abs(c - c0) <= 1)) {
      out.push(i);
    }
  }
  return out;
}

const popcount = (m: number): number => {
  let count = 0;
  for (; m; m &= m - 1) count++;
  return count;
};
const lowestBit = (m: number): number => 31 - Math.clz32(m & -m);
/** Column bits c-1, c, c+1 (clipped to the board). */
const around = (n: number, c: number): number => ((7 << c) >> 1) & ((1 << n) - 1);

/**
 * Solver state. Candidates are stored per row as column bitmasks; `regRow[g * n + r]` holds the columns of
 * region g in row r. Rows, columns and regions that already hold a queen have no candidates left.
 */
interface State {
  n: number;
  regions: ArrayLike<number>;
  regRow: Int32Array;
  rows: Int32Array;
  queens: Int8Array;
  doneCols: number;
  doneRegs: number;
}

const initState = (n: number, regions: ArrayLike<number>): State => {
  const regRow = new Int32Array(n * n);
  for (let i = 0; i < n * n; i++) regRow[regions[i] * n + Math.floor(i / n)] |= 1 << i % n;
  return {
    n,
    regions,
    regRow,
    rows: new Int32Array(n).fill((1 << n) - 1),
    queens: new Int8Array(n).fill(-1),
    doneCols: 0,
    doneRegs: 0,
  };
};

const cloneState = (s: State): State => ({ ...s, rows: s.rows.slice(), queens: s.queens.slice() });

/** Places a queen, eliminating its row, column, region and neighbours. */
const place = (s: State, r: number, c: number): void => {
  const { n, rows, regRow } = s;
  const g = s.regions[r * n + c];
  s.queens[r] = c;
  s.doneCols |= 1 << c;
  s.doneRegs |= 1 << g;
  const nb = around(n, c);
  for (let r2 = 0; r2 < n; r2++) {
    if (r2 === r) rows[r2] = 0;
    else rows[r2] &= ~((1 << c) | regRow[g * n + r2] | (Math.abs(r2 - r) === 1 ? nb : 0));
  }
};

/** Candidate cells (row-major indices) of every row, column and region that still needs a queen. */
const openUnits = (s: State): number[][] => {
  const { n, rows } = s;
  const units: number[][] = [];
  for (let r = 0; r < n; r++) {
    if (s.queens[r] >= 0) continue;
    const cells: number[] = [];
    for (let m = rows[r]; m; m &= m - 1) cells.push(r * n + lowestBit(m));
    units.push(cells);
  }
  for (let c = 0; c < n; c++) {
    if (s.doneCols & (1 << c)) continue;
    const cells: number[] = [];
    for (let r = 0; r < n; r++) if (rows[r] & (1 << c)) cells.push(r * n + c);
    units.push(cells);
  }
  for (let g = 0; g < n; g++) {
    if (s.doneRegs & (1 << g)) continue;
    const cells: number[] = [];
    for (let r = 0; r < n; r++) {
      for (let m = rows[r] & s.regRow[g * n + r]; m; m &= m - 1) cells.push(r * n + lowestBit(m));
    }
    units.push(cells);
  }
  return units;
};

/** Places queens in units with a single candidate. Returns -1 on contradiction, 1 on progress, 0 otherwise. */
const singles = (s: State): number => {
  const { n, rows } = s;
  // Per column / region: number of candidates and the last one seen.
  const count = new Int32Array(2 * n);
  const last = new Int32Array(2 * n);
  let progress = 0;
  for (;;) {
    count.fill(0);
    let cell = -1;
    for (let r = 0; r < n; r++) {
      const m = rows[r];
      if (s.queens[r] >= 0) continue;
      if (!m) return -1;
      if (!(m & (m - 1))) cell = r * n + lowestBit(m);
      for (let b = m; b; b &= b - 1) {
        const i = r * n + lowestBit(b);
        const g = n + s.regions[i];
        count[i % n]++;
        last[i % n] = i;
        count[g]++;
        last[g] = i;
      }
    }
    for (let u = 0; u < 2 * n; u++) {
      if ((u < n ? s.doneCols >> u : s.doneRegs >> (u - n)) & 1) continue;
      if (!count[u]) return -1;
      if (count[u] === 1) cell = last[u];
    }
    if (cell < 0) return progress;
    place(s, Math.floor(cell / n), cell % n);
    progress = 1;
  }
};

/**
 * Looks for k of the units `ids` whose candidates (`masks[id]`, bitmasks of lines) span exactly k lines and calls
 * `eliminate(set, union)` for them. Stops at the first call that eliminated something.
 */
const confine = (
  ids: number[],
  masks: number[],
  k: number,
  eliminate: (set: number, union: number) => boolean,
): boolean => {
  const rec = (start: number, depth: number, set: number, union: number): boolean => {
    if (popcount(union) > k) return false;
    if (depth === k) return popcount(union) === k && eliminate(set, union);
    for (let i = start; i < ids.length; i++) {
      if (rec(i + 1, depth + 1, set | (1 << ids[i]), union | masks[ids[i]])) return true;
    }
    return false;
  };
  return rec(0, 0, 0, 0);
};

/**
 * Confinement of exactly k units: k regions whose candidates lie in k rows (columns) own those rows (columns),
 * and k rows (columns) whose candidates lie in k regions own those regions. Applies the first one that
 * eliminates something.
 */
const confinement = (s: State, k: number): boolean => {
  const { n, rows, regRow } = s;
  const regRows = new Array<number>(n).fill(0);
  const regCols = new Array<number>(n).fill(0);
  const rowRegs = new Array<number>(n).fill(0);
  const colRegs = new Array<number>(n).fill(0);
  for (let r = 0; r < n; r++) {
    for (let m = rows[r]; m; m &= m - 1) {
      const c = lowestBit(m);
      const g = s.regions[r * n + c];
      regRows[g] |= 1 << r;
      regCols[g] |= 1 << c;
      rowRegs[r] |= 1 << g;
      colRegs[c] |= 1 << g;
    }
  }
  const openRegs: number[] = [];
  const openRows: number[] = [];
  const openCols: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!(s.doneRegs & (1 << i))) openRegs.push(i);
    if (s.queens[i] < 0) openRows.push(i);
    if (!(s.doneCols & (1 << i))) openCols.push(i);
  }
  if (k >= openRows.length) return false;
  // Columns of the regions in `set` within row r.
  const cellsOf = (set: number, r: number): number => {
    let m = 0;
    for (let g = set; g; g &= g - 1) m |= regRow[lowestBit(g) * n + r];
    return m;
  };
  // Restricts every row r to the columns `keep(r)`, reporting whether anything changed.
  const restrict = (keep: (r: number) => number): boolean => {
    let changed = false;
    for (let r = 0; r < n; r++) {
      const m = rows[r] & keep(r);
      if (m !== rows[r]) {
        rows[r] = m;
        changed = true;
      }
    }
    return changed;
  };
  const all = (1 << n) - 1;
  return (
    confine(openRegs, regRows, k, (set, union) => restrict((r) => (union & (1 << r) ? cellsOf(set, r) : all))) ||
    confine(openRegs, regCols, k, (set, union) => restrict((r) => ~union | cellsOf(set, r))) ||
    confine(openRows, rowRegs, k, (set, union) => restrict((r) => (set & (1 << r) ? all : ~cellsOf(union, r)))) ||
    confine(openCols, colRegs, k, (set, union) => restrict((r) => ~(cellsOf(union, r) & ~set)))
  );
};

/** Eliminates every candidate whose queen would leave some row, column or region without candidates. */
const lookahead = (s: State): boolean => {
  const { n, rows, regRow } = s;
  const next = new Int32Array(n);
  let changed = false;
  for (let r = 0; r < n; r++) {
    for (let m = rows[r]; m; m &= m - 1) {
      const c = lowestBit(m);
      const g = s.regions[r * n + c];
      const nb = around(n, c);
      let ok = true;
      let cols = 0;
      for (let r2 = 0; r2 < n && ok; r2++) {
        next[r2] = r2 === r ? 0 : rows[r2] & ~((1 << c) | regRow[g * n + r2] | (Math.abs(r2 - r) === 1 ? nb : 0));
        cols |= next[r2];
        if (r2 !== r && s.queens[r2] < 0 && !next[r2]) ok = false;
      }
      if (ok && (cols | s.doneCols | (1 << c)) !== (1 << n) - 1) ok = false;
      for (let h = 0; h < n && ok; h++) {
        if (h === g || s.doneRegs & (1 << h)) continue;
        let any = 0;
        for (let r2 = 0; r2 < n && !any; r2++) any = next[r2] & regRow[h * n + r2];
        if (!any) ok = false;
      }
      if (!ok) {
        rows[r] &= ~(1 << c);
        changed = true;
      }
    }
  }
  return changed;
};

/**
 * Runs the techniques up to `maxLevel`, simplest first, restarting after every deduction. Returns the final
 * state, the hardest technique level used, and whether no contradiction was met.
 */
const deduce = (n: number, regions: ArrayLike<number>, maxLevel: number) => {
  const s = initState(n, regions);
  let level = SINGLES;
  for (;;) {
    if (singles(s) < 0) return { s, level, ok: false };
    if (s.queens.every((c) => c >= 0)) break;
    let used = -1;
    for (let k = 1; k <= Math.min(MAX_CONFINEMENT, maxLevel) && used < 0; k++) if (confinement(s, k)) used = k;
    if (used < 0 && maxLevel >= LOOKAHEAD && lookahead(s)) used = LOOKAHEAD;
    if (used < 0) break;
    level = Math.max(level, used);
  }
  return { s, level, ok: true };
};

/**
 * Human-style solver (no guessing): queen placement eliminations, single candidates in a row/column/region,
 * confinement of k ≤ 4 regions to k rows/columns (and k rows/columns to k regions), then one-step lookahead.
 * `queens[r]` is the column of the queen in row r or -1. `level` is the hardest technique needed (SINGLES,
 * 1..MAX_CONFINEMENT for confinement of k units, LOOKAHEAD); `maxLevel` restricts the techniques allowed.
 */
export function solveLogic(
  puzzle: QueensPuzzle,
  maxLevel = LOOKAHEAD,
): { solved: boolean; queens: number[]; level: number } {
  const { s, level, ok } = deduce(puzzle.size, puzzle.regions, maxLevel);
  const queens = Array.from(s.queens);
  return { solved: ok && queens.every((c) => c >= 0) && validate(puzzle, queens), queens, level };
}

/** Counts solutions (up to `limit`) by single-candidate propagation and branching on the tightest unit. */
export function countSolutions(puzzle: QueensPuzzle, limit = 2): number {
  let count = 0;
  const search = (s: State): void => {
    if (singles(s) < 0) return;
    if (s.queens.every((c) => c >= 0)) {
      if (validate(puzzle, Array.from(s.queens))) count++;
      return;
    }
    const best = openUnits(s).reduce((a, b) => (b.length < a.length ? b : a));
    for (const cell of best) {
      const next = cloneState(s);
      place(next, Math.floor(cell / s.n), cell % s.n);
      search(next);
      if (count >= limit) return;
    }
  };
  search(initState(puzzle.size, puzzle.regions));
  return count;
}

/** Checks that `grid` (column of the queen in each row) satisfies all the rules for the puzzle's regions. */
export function validate(puzzle: QueensPuzzle, grid: number[]): boolean {
  const n = puzzle.size;
  if (grid.length !== n) return false;
  const colUsed = new Set<number>();
  const regionUsed = new Set<number>();
  for (let r = 0; r < n; r++) {
    const c = grid[r];
    if (!Number.isInteger(c) || c < 0 || c >= n) return false;
    if (colUsed.has(c)) return false;
    colUsed.add(c);
    const region = puzzle.regions[r * n + c];
    if (regionUsed.has(region)) return false;
    regionUsed.add(region);
    if (r > 0 && Math.abs(grid[r - 1] - c) <= 1) return false;
  }
  return true;
}

/** Random queen placement: one per row and column, no two touching. */
const placeQueens = (rng: Rng, n: number): number[] => {
  const cols: number[] = [];
  const rec = (r: number): boolean => {
    if (r === n) return true;
    for (const c of shuffle(rng, Array.from({ length: n }, (_, i) => i))) {
      if (cols.includes(c) || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
      cols.push(c);
      if (rec(r + 1)) return true;
      cols.pop();
    }
    return false;
  };
  rec(0);
  return cols;
};

const neighbours = (n: number, i: number): number[] => {
  const r = Math.floor(i / n);
  const c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
};

/** Grows one region per queen by randomized flood fill; random per-region weights make sizes vary. */
const growRegions = (rng: Rng, n: number, queens: number[]): number[] => {
  const regions = new Array<number>(n * n).fill(-1);
  queens.forEach((c, r) => (regions[r * n + c] = r));
  const weights = queens.map(() => 0.4 + rng() * rng() * 3);
  for (let left = n * n - n; left > 0; left--) {
    const frontier: number[][] = queens.map(() => []);
    for (let i = 0; i < n * n; i++) {
      if (regions[i] >= 0) continue;
      for (const j of neighbours(n, i)) if (regions[j] >= 0) frontier[regions[j]].push(i);
    }
    let x = rng() * frontier.reduce((sum, f, g) => sum + (f.length ? weights[g] : 0), 0);
    let g = frontier.findIndex((f, h) => f.length > 0 && (x -= weights[h]) < 0);
    if (g < 0) g = frontier.findIndex((f) => f.length > 0);
    regions[frontier[g][randInt(rng, frontier[g].length)]] = g;
  }
  return regions;
};

/** Whether region g stays orthogonally connected without cell `skip`. */
const connectedWithout = (n: number, regions: number[], g: number, skip: number): boolean => {
  const cells: number[] = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === g && i !== skip) cells.push(i);
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    for (const j of neighbours(n, stack.pop()!)) {
      if (j !== skip && regions[j] === g && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
};

const regionSizes = (n: number, regions: number[]): number[] => {
  const sizes = new Array<number>(n).fill(0);
  for (const g of regions) sizes[g]++;
  return sizes;
};

/** Candidates left after logic (0 when solved): the hill-climbing cost. */
const cost = (n: number, regions: number[]): number => {
  const { s, ok } = deduce(n, regions, LOOKAHEAD);
  return ok ? s.rows.reduce((sum, m) => sum + popcount(m), 0) : Infinity;
};

const MUTATIONS = 1500;

/**
 * Generates a puzzle with a unique solution that `solveLogic` solves without guessing: places queens, grows
 * regions around them, then hill-climbs on region shapes (moving a border cell to a neighbouring region while
 * keeping regions connected and the queens in place) until the logic solver succeeds. Puzzles solvable with
 * singles only are rejected as trivial; at most one region has a single cell.
 */
export function generate(variant: string, seed: number): QueensPuzzle {
  const n = Number(VARIANTS.some((v) => v.id === variant) ? variant : DEFAULT_VARIANT);
  const rng = mulberry32(seed);
  for (;;) {
    const solution = placeQueens(rng, n);
    const regions = growRegions(rng, n, solution);
    if (regionSizes(n, regions).filter((size) => size === 1).length > 1) continue;
    let current = cost(n, regions);
    for (let step = 0; step < MUTATIONS && current > 0; step++) {
      const i = randInt(rng, n * n);
      const from = regions[i];
      const targets = neighbours(n, i).filter((j) => regions[j] !== from);
      if (solution[Math.floor(i / n)] === i % n || !targets.length) continue;
      const sizes = regionSizes(n, regions);
      if (sizes[from] === 2 || !connectedWithout(n, regions, from, i)) continue;
      regions[i] = regions[pick(rng, targets)];
      const next = cost(n, regions);
      if (next <= current) current = next;
      else regions[i] = from;
    }
    if (current > 0) continue;
    const puzzle: QueensPuzzle = { size: n, regions, solution, variant: String(n), seed };
    const { solved, queens, level } = solveLogic(puzzle);
    if (solved && level > SINGLES && queens.every((c, r) => c === solution[r])) return puzzle;
  }
}
