import { mulberry32, pick, randInt, shuffle, type Rng } from '../../core/rng';

export interface KakuroPuzzle {
  /** Grid width and height, including the top row and left column of clue cells. */
  size: number;
  /** Row-major, `true` = black/clue cell. Row 0 and column 0 are all blocks. */
  blocks: boolean[];
  /** Per cell: for a block, the sum of the white run immediately to its right (0 if none); 0 for white cells. */
  across: number[];
  /** Per cell: for a block, the sum of the white run immediately below (0 if none); 0 for white cells. */
  down: number[];
  /** Row-major digits 1–9 for white cells, 0 for blocks. */
  solution: number[];
  variant: string;
  seed: number;
}

export interface Run {
  /** White cell indices in reading order. */
  cells: number[];
  sum: number;
  dir: 'across' | 'down';
  /** Index of the block cell holding the clue. */
  clue: number;
}

export const VARIANTS: { id: string; label: string }[] = [
  { id: '6', label: 'Small 6×6' },
  { id: '8', label: 'Medium 8×8' },
];

export const DEFAULT_VARIANT = '8';

interface VariantConfig {
  size: number;
  maxRun: number;
  minWhite: number;
  maxWhite: number;
}

const CONFIGS: Record<string, VariantConfig> = {
  '6': { size: 6, maxRun: 4, minWhite: 15, maxWhite: 19 },
  '8': { size: 8, maxRun: 6, minWhite: 36, maxWhite: 42 },
};

/** Bit for digit `d` (1–9) in a candidate mask. */
const bit = (d: number) => 1 << (d - 1);
const ALL = 0x1ff;
const isSingle = (m: number) => m !== 0 && (m & (m - 1)) === 0;
/** Digit of a single-bit mask. */
const digitOf = (b: number) => 32 - Math.clz32(b);
const popcount = (m: number) => {
  let n = 0;
  for (; m; m &= m - 1) n++;
  return n;
};

/** All ascending sets of distinct digits 1–9 with `length` members summing to `sum`. */
export function combinations(sum: number, length: number): number[][] {
  const out: number[][] = [];
  const acc: number[] = [];
  const rec = (from: number, left: number) => {
    if (acc.length === length) {
      if (left === 0) out.push([...acc]);
      return;
    }
    for (let d = from; d <= 9 && d <= left; d++) {
      acc.push(d);
      rec(d + 1, left - d);
      acc.pop();
    }
  };
  rec(1, sum);
  return out;
}

/** Maximal white runs of a layout (sums left as 0). */
function layoutRuns(size: number, blocks: boolean[]): Run[] {
  const out: Run[] = [];
  for (let i = 0; i < size * size; i++) {
    if (!blocks[i]) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    const across: number[] = [];
    for (let k = c + 1; k < size && !blocks[r * size + k]; k++) across.push(r * size + k);
    if (across.length) out.push({ cells: across, sum: 0, dir: 'across', clue: i });
    const down: number[] = [];
    for (let k = r + 1; k < size && !blocks[k * size + c]; k++) down.push(k * size + c);
    if (down.length) out.push({ cells: down, sum: 0, dir: 'down', clue: i });
  }
  return out;
}

/** All white runs of the puzzle with their clue sums. */
export function runs(puzzle: KakuroPuzzle): Run[] {
  return layoutRuns(puzzle.size, puzzle.blocks).map((run) => ({
    ...run,
    sum: (run.dir === 'across' ? puzzle.across : puzzle.down)[run.clue],
  }));
}

// Scratch state for `narrowRun`; the solver is synchronous so sharing it is safe.
const memo = new Uint8Array(512);
const support = new Uint16Array(9);
let curCand: Uint16Array = new Uint16Array(0);
let curCells: number[] = [];
let curSum = 0;

/**
 * Whether the run's cells from position `k` on can take unused digits so the run reaches its sum, recording in
 * `support` every digit that occurs in some completion. `used` determines `k` and the partial sum `s`, so it is the
 * memo key.
 */
function feasible(used: number, k: number, s: number): boolean {
  const known = memo[used];
  if (known) return known === 1;
  let ok = false;
  const len = curCells.length;
  if (k === len) {
    ok = s === curSum;
  } else {
    const rem = curSum - s;
    const r = len - k;
    if (rem >= (r * (r + 1)) / 2 && rem <= (r * (19 - r)) / 2) {
      let avail = curCand[curCells[k]] & ~used;
      while (avail) {
        const b = avail & -avail;
        avail ^= b;
        const d = digitOf(b);
        if (d > rem) break;
        if (feasible(used | b, k + 1, s + d)) {
          support[k] |= b;
          ok = true;
        }
      }
    }
  }
  memo[used] = ok ? 1 : 2;
  return ok;
}

/**
 * Line solver for one run: keeps exactly the candidates that occur in some assignment of distinct digits, consistent
 * with all candidates of the run, adding up to the sum. This subsumes combination elimination, naked singles, hidden
 * singles and naked/hidden pairs within the run. Narrows `cand` in place; returns -1 on contradiction, 1 if anything
 * changed, else 0.
 */
function narrowRun(cand: Uint16Array, cells: number[], sum: number): number {
  memo.fill(0);
  support.fill(0);
  curCand = cand;
  curCells = cells;
  curSum = sum;
  if (!feasible(0, 0, 0)) return -1;
  let changed = 0;
  for (let k = 0; k < cells.length; k++) {
    if (cand[cells[k]] !== support[k]) {
      cand[cells[k]] = support[k];
      changed = 1;
    }
  }
  return changed;
}

/**
 * Applies the run line solver to a single run given per-cell candidate digit lists. Returns the narrowed candidate
 * lists, or `null` if the run cannot be completed.
 */
export function solveRun(sum: number, candidates: number[][]): number[][] | null {
  const cand = Uint16Array.from(candidates, (ds) => ds.reduce((m, d) => m | bit(d), 0));
  if (narrowRun(cand, [...cand.keys()], sum) < 0) return null;
  return Array.from(cand, (m) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => m & bit(d)));
}

interface Model {
  cells: number[][];
  sums: number[];
  /** Per cell, the indices of the runs containing it. */
  cellRuns: number[][];
}

const buildModel = (size: number, list: Run[]): Model => {
  const cellRuns: number[][] = Array.from({ length: size * size }, () => []);
  list.forEach((run, ri) => run.cells.forEach((i) => cellRuns[i].push(ri)));
  return { cells: list.map((r) => r.cells), sums: list.map((r) => r.sum), cellRuns };
};

/** Runs every run's line solver until nothing changes. Returns false on contradiction. */
function propagate(cand: Uint16Array, model: Model): boolean {
  const n = model.cells.length;
  const queue = [...model.cells.keys()];
  const queued = new Uint8Array(n).fill(1);
  const before = new Uint16Array(9);
  while (queue.length) {
    const ri = queue.pop()!;
    queued[ri] = 0;
    const cells = model.cells[ri];
    for (let k = 0; k < cells.length; k++) before[k] = cand[cells[k]];
    const res = narrowRun(cand, cells, model.sums[ri]);
    if (res < 0) return false;
    if (!res) continue;
    for (let k = 0; k < cells.length; k++) {
      if (cand[cells[k]] === before[k]) continue;
      for (const rj of model.cellRuns[cells[k]]) {
        if (!queued[rj]) {
          queued[rj] = 1;
          queue.push(rj);
        }
      }
    }
  }
  return true;
}

const initialCandidates = (blocks: boolean[]) => Uint16Array.from(blocks, (b) => (b ? 0 : ALL));
const toGrid = (cand: Uint16Array) => Array.from(cand, (m) => (isSingle(m) ? digitOf(m) : 0));
const countKnown = (cand: Uint16Array) => cand.reduce((n, m) => n + (isSingle(m) ? 1 : 0), 0);

/**
 * Human-style solver: the per-run line solver (combinations, naked/hidden singles and pairs within a run) iterated
 * to a fixpoint, so deductions flow between crossing runs through shared cells. No guessing. `grid` holds the
 * digits it could determine (0 elsewhere).
 */
export function solveLogic(puzzle: KakuroPuzzle): { solved: boolean; grid: number[] } {
  const cand = initialCandidates(puzzle.blocks);
  const ok = propagate(cand, buildModel(puzzle.size, runs(puzzle)));
  const grid = toGrid(cand);
  return { solved: ok && puzzle.blocks.every((b, i) => b || grid[i] > 0), grid };
}

/** Counts solutions up to `limit` by propagation plus backtracking on the cell with the fewest candidates. */
export function countSolutions(puzzle: KakuroPuzzle, limit = 2): number {
  const model = buildModel(puzzle.size, runs(puzzle));
  let count = 0;
  const search = (cand: Uint16Array) => {
    if (!propagate(cand, model)) return;
    let best = -1;
    let bestCount = 10;
    for (let i = 0; i < cand.length; i++) {
      const pc = popcount(cand[i]);
      if (pc > 1 && pc < bestCount) {
        best = i;
        bestCount = pc;
      }
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
  search(initialCandidates(puzzle.blocks));
  return count;
}

/** Checks that `grid` has 0 at blocks, 1–9 at white cells and every run matches its clue without repeated digits. */
export function validate(puzzle: KakuroPuzzle, grid: number[]): boolean {
  const { size, blocks } = puzzle;
  if (grid.length !== size * size) return false;
  for (let i = 0; i < grid.length; i++) {
    if (blocks[i] ? grid[i] !== 0 : !(Number.isInteger(grid[i]) && grid[i] >= 1 && grid[i] <= 9)) return false;
  }
  const lineOk = (clueAt: number, step: number, end: number, clue: number) => {
    const seen = new Set<number>();
    let total = 0;
    for (let i = clueAt + step; i < end && !blocks[i]; i += step) {
      if (seen.has(grid[i])) return false;
      seen.add(grid[i]);
      total += grid[i];
    }
    return total === clue;
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (!blocks[i]) continue;
      if (!lineOk(i, 1, r * size + size, puzzle.across[i]) || !lineOk(i, size, size * size, puzzle.down[i])) {
        return false;
      }
    }
  }
  return true;
}

/** Whether the white cells form a single orthogonally connected region. */
function connected(size: number, blocks: boolean[]): boolean {
  const whites: number[] = [];
  blocks.forEach((b, i) => b || whites.push(i));
  if (!whites.length) return false;
  const seen = new Uint8Array(blocks.length);
  seen[whites[0]] = 1;
  const stack = [whites[0]];
  let reached = 1;
  while (stack.length) {
    const i = stack.pop()!;
    // Row 0 and column 0 are blocks, so plain index arithmetic never wraps onto another white cell.
    for (const j of [i - 1, i + 1, i - size, i + size]) {
      if (j < blocks.length && !blocks[j] && !seen[j]) {
        seen[j] = 1;
        reached++;
        stack.push(j);
      }
    }
  }
  return reached === whites.length;
}

/**
 * Random layout with 180° rotational symmetry. Starting from an all-white interior, symmetric pairs of blocks are
 * added (first inside over-long runs, then anywhere) whenever every run keeps length >= 2 and the white cells stay
 * connected, until all runs are short enough and the white count is down to a random target. Returns null if stuck.
 */
function makeLayout(cfg: VariantConfig, rng: Rng): boolean[] | null {
  const { size, maxRun } = cfg;
  const blocks = Array.from({ length: size * size }, (_, i) => i < size || i % size === 0);
  let whites = (size - 1) * (size - 1);
  const tryBlock = (i: number) => {
    if (blocks[i]) return false;
    const j = (size - Math.floor(i / size)) * size + (size - (i % size));
    blocks[i] = blocks[j] = true;
    if (layoutRuns(size, blocks).every((r) => r.cells.length >= 2) && connected(size, blocks)) {
      whites -= i === j ? 1 : 2;
      return true;
    }
    blocks[i] = blocks[j] = false;
    return false;
  };
  for (;;) {
    const long = layoutRuns(size, blocks).filter((r) => r.cells.length > maxRun);
    if (!long.length) break;
    if (!shuffle(rng, [...pick(rng, long).cells]).some(tryBlock)) return null;
  }
  const target = cfg.minWhite + randInt(rng, cfg.maxWhite - cfg.minWhite + 1);
  for (const i of shuffle(rng, [...blocks.keys()])) {
    if (whites <= target) break;
    tryBlock(i);
  }
  return whites >= cfg.minWhite && whites <= cfg.maxWhite ? blocks : null;
}

/**
 * Fills the zero white cells of `digits` by randomized backtracking without repeats in any run. A positive `bias`
 * favours small digits and a negative one large digits, which pushes run sums towards few combinations.
 */
function fill(digits: Uint8Array, model: Model, rng: Rng, bias = 0): boolean {
  const todo: number[] = [];
  digits.forEach((d, i) => d === 0 && model.cellRuns[i].length > 0 && todo.push(i));
  const rec = (k: number): boolean => {
    if (k === todo.length) return true;
    const i = todo[k];
    let used = 0;
    for (const ri of model.cellRuns[i]) for (const j of model.cells[ri]) if (digits[j]) used |= bit(digits[j]);
    const order = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => [d, bias * d + rng() * 4]).sort((a, b) => a[1] - b[1]);
    for (const [d] of order) {
      if (used & bit(d)) continue;
      digits[i] = d;
      if (rec(k + 1)) return true;
    }
    digits[i] = 0;
    return false;
  };
  return rec(0);
}

/** Hill-climbing steps without progress before a generation attempt is abandoned. */
const STALL = 15;

/**
 * Generates a puzzle with a unique solution that `solveLogic` fully solves. A random symmetric layout gets a random
 * fill; while the logic solver gets stuck, the digits of a run through a still-undetermined cell are re-randomized,
 * keeping changes that don't reduce how many cells logic determines. Stale attempts restart with a new layout.
 */
export function generate(variant: string, seed: number): KakuroPuzzle {
  const cfg = CONFIGS[variant];
  if (!cfg) throw new Error(`Unknown kakuro variant: ${variant}`);
  const { size } = cfg;
  const rng = mulberry32(seed);
  for (;;) {
    const blocks = makeLayout(cfg, rng);
    if (!blocks) continue;
    const list = layoutRuns(size, blocks);
    const model = buildModel(size, list);
    let digits = new Uint8Array(size * size);
    if (!fill(digits, model, rng)) continue;

    const evaluate = (ds: Uint8Array) => {
      model.sums = model.cells.map((cells) => cells.reduce((s, i) => s + ds[i], 0));
      const cand = initialCandidates(blocks);
      propagate(cand, model);
      return cand;
    };
    let cand = evaluate(digits);
    let known = countKnown(cand);
    const whites = blocks.filter((b) => !b).length;
    for (let step = 0, last = 0; step - last < STALL && known < whites; step++) {
      const unknown: number[] = [];
      cand.forEach((m, i) => m && !isSingle(m) && unknown.push(i));
      const cellRuns = model.cellRuns[unknown[randInt(rng, unknown.length)]];
      const next = digits.slice();
      for (const i of model.cells[cellRuns[randInt(rng, cellRuns.length)]]) next[i] = 0;
      if (!fill(next, model, rng, rng() < 0.5 ? 1 : -1)) continue;
      const nextCand = evaluate(next);
      const nextKnown = countKnown(nextCand);
      if (nextKnown >= known) {
        if (nextKnown > known) last = step;
        digits = next;
        cand = nextCand;
        known = nextKnown;
      }
    }
    if (known < whites) continue;

    const solution = Array.from(digits);
    const across = new Array<number>(size * size).fill(0);
    const down = new Array<number>(size * size).fill(0);
    for (const run of list) {
      (run.dir === 'across' ? across : down)[run.clue] = run.cells.reduce((s, i) => s + solution[i], 0);
    }
    const puzzle = { size, blocks, across, down, solution, variant, seed };
    const { solved, grid } = solveLogic(puzzle);
    if (solved && grid.every((v, i) => v === solution[i])) return puzzle;
  }
}
