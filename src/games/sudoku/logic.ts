import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';

/** Classic 9×9 Sudoku. Cells are row-major (`i = r * 9 + c`); digits are 1..9 and 0 means empty. */
export interface SudokuPuzzle {
  /** 81 entries: the clue digit, or 0 for a cell the player fills in. */
  givens: number[];
  /** 81 digits: the unique solution. */
  solution: number[];
  variant: string;
  seed: number;
}

export const VARIANTS: { id: string; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];
export const DEFAULT_VARIANT = 'easy';

export const SIZE = 9;
export const BOX = 3;
const CELLS = SIZE * SIZE;
const ALL = 0x1ff;

/**
 * Technique levels of the logic solver:
 * 1 = naked/hidden singles;
 * 2 = + locked candidates (pointing/claiming), naked/hidden pairs;
 * 3 = + naked/hidden triples, X-Wing, Swordfish, XY-Wing.
 */
export type Level = 1 | 2 | 3;
export const LEVELS: Record<string, Level> = { easy: 1, medium: 2, hard: 3 };

/** The 27 units (9 rows, 9 columns, 9 boxes), each listing its 9 cells. */
const UNITS: number[][] = [];
for (let r = 0; r < SIZE; r++) UNITS.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
for (let c = 0; c < SIZE; c++) UNITS.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
for (let b = 0; b < SIZE; b++) {
  const r0 = Math.floor(b / BOX) * BOX;
  const c0 = (b % BOX) * BOX;
  UNITS.push(Array.from({ length: SIZE }, (_, k) => (r0 + Math.floor(k / BOX)) * SIZE + c0 + (k % BOX)));
}
const boxOf = (i: number): number => Math.floor(i / 27) * BOX + Math.floor((i % SIZE) / BOX);
const PEERS: number[][] = [];
const IS_PEER = new Uint8Array(CELLS * CELLS);
for (let i = 0; i < CELLS; i++) {
  const set = new Set([...UNITS[Math.floor(i / SIZE)], ...UNITS[SIZE + (i % SIZE)], ...UNITS[2 * SIZE + boxOf(i)]]);
  set.delete(i);
  PEERS.push([...set].sort((a, b) => a - b));
  for (const p of set) IS_PEER[i * CELLS + p] = 1;
}

/** The 20 cells sharing a row, column or box with cell `i`. */
export function peers(i: number): number[] {
  return PEERS[i].slice();
}

const POP = new Uint8Array(ALL + 1);
for (let m = 1; m <= ALL; m++) POP[m] = POP[m >> 1] + (m & 1);
const bitOf = (d: number): number => 1 << (d - 1);
const digitOf = (bit: number): number => 32 - Math.clz32(bit);

/** Calls `fn` with every k-subset of `items` (reusing one array); stops early when `fn` returns true. */
function someCombination<T>(items: T[], k: number, fn: (combo: T[]) => boolean): boolean {
  const combo: T[] = [];
  const rec = (start: number): boolean => {
    if (combo.length === k) return fn(combo);
    for (let j = start; j <= items.length - (k - combo.length); j++) {
      combo.push(items[j]);
      if (rec(j + 1)) return true;
      combo.pop();
    }
    return false;
  };
  return rec(0);
}

// ---------------------------------------------------------------------------
// Logic solver
// ---------------------------------------------------------------------------

/**
 * Pencil-mark state of the logic solver. `cand[i]` is a bitmask of the digits still possible in cell i
 * (bit d-1 for digit d); a placed cell keeps just its own bit. `bad` flags a contradiction.
 */
export interface SolverState {
  value: Uint8Array;
  cand: Uint16Array;
  filled: number;
  bad: boolean;
}

/** A state with no digits placed and every candidate open (handy for testing single techniques). */
export function emptyState(): SolverState {
  return { value: new Uint8Array(CELLS), cand: new Uint16Array(CELLS).fill(ALL), filled: 0, bad: false };
}

function place(s: SolverState, i: number, d: number): void {
  const bit = bitOf(d);
  if (!(s.cand[i] & bit)) s.bad = true;
  s.value[i] = d;
  s.cand[i] = bit;
  s.filled++;
  for (const p of PEERS[i]) {
    if (s.cand[p] & bit) {
      s.cand[p] &= ~bit;
      if (!s.cand[p]) s.bad = true;
    }
  }
}

/** Removes the digits in `mask` from cell i's candidates; returns whether anything changed. */
function eliminate(s: SolverState, i: number, mask: number): boolean {
  if (!(s.cand[i] & mask)) return false;
  s.cand[i] &= ~mask;
  if (!s.cand[i]) s.bad = true;
  return true;
}

const open = (s: SolverState, i: number, bit: number): boolean => s.value[i] === 0 && (s.cand[i] & bit) !== 0;

function nakedSingles(s: SolverState): boolean {
  let progress = false;
  for (let i = 0; i < CELLS && !s.bad; i++) {
    if (s.value[i] === 0 && POP[s.cand[i]] === 1) {
      place(s, i, digitOf(s.cand[i]));
      progress = true;
    }
  }
  return progress;
}

function hiddenSingles(s: SolverState): boolean {
  let progress = false;
  for (const unit of UNITS) {
    let once = 0;
    let twice = 0;
    for (const i of unit) {
      twice |= once & s.cand[i];
      once |= s.cand[i];
    }
    if (once !== ALL) s.bad = true;
    if (s.bad) return progress;
    for (let only = once & ~twice; only; only &= only - 1) {
      const bit = only & -only;
      const i = unit.find((j) => s.cand[j] & bit)!;
      if (s.value[i] === 0) {
        place(s, i, digitOf(bit));
        progress = true;
      }
    }
  }
  return progress;
}

/**
 * Pointing: a digit confined to one row/column within a box is removed from the rest of that line.
 * Claiming: a digit confined to one box within a row/column is removed from the rest of that box.
 */
function lockedCandidates(s: SolverState): boolean {
  let progress = false;
  for (let u = 0; u < UNITS.length; u++) {
    for (let d = 1; d <= SIZE; d++) {
      const bit = bitOf(d);
      const cells = UNITS[u].filter((i) => open(s, i, bit));
      if (cells.length < 2) continue;
      const targets: number[] = [];
      if (u >= 2 * SIZE) {
        const r = Math.floor(cells[0] / SIZE);
        const c = cells[0] % SIZE;
        if (cells.every((i) => Math.floor(i / SIZE) === r)) targets.push(r);
        if (cells.every((i) => i % SIZE === c)) targets.push(SIZE + c);
      } else {
        const b = boxOf(cells[0]);
        if (cells.every((i) => boxOf(i) === b)) targets.push(2 * SIZE + b);
      }
      for (const t of targets) {
        for (const i of UNITS[t]) {
          if (s.value[i] === 0 && !UNITS[u].includes(i) && eliminate(s, i, bit)) progress = true;
        }
      }
    }
  }
  return progress;
}

/** Naked subset: k cells of a unit whose candidates together are just k digits own those digits. */
function nakedSubsets(s: SolverState, k: number): boolean {
  for (const unit of UNITS) {
    const cells = unit.filter((i) => s.value[i] === 0 && POP[s.cand[i]] <= k);
    const found = someCombination(cells, k, (combo) => {
      const mask = combo.reduce((m, i) => m | s.cand[i], 0);
      if (POP[mask] !== k) return false;
      let progress = false;
      for (const i of unit) {
        if (s.value[i] === 0 && !combo.includes(i) && eliminate(s, i, mask)) progress = true;
      }
      return progress;
    });
    if (found) return true;
  }
  return false;
}

/** Hidden subset: k digits that fit in only the same k cells of a unit leave no room for other digits there. */
function hiddenSubsets(s: SolverState, k: number): boolean {
  for (const unit of UNITS) {
    const where: number[] = [];
    const digits: number[] = [];
    for (let d = 1; d <= SIZE; d++) {
      let pos = 0;
      unit.forEach((i, j) => {
        if (open(s, i, bitOf(d))) pos |= 1 << j;
      });
      where[d] = pos;
      if (POP[pos] >= 2 && POP[pos] <= k) digits.push(d);
    }
    const found = someCombination(digits, k, (combo) => {
      const pos = combo.reduce((m, d) => m | where[d], 0);
      if (POP[pos] !== k) return false;
      const others = ALL & ~combo.reduce((m, d) => m | bitOf(d), 0);
      let progress = false;
      unit.forEach((i, j) => {
        if (pos & (1 << j) && eliminate(s, i, others)) progress = true;
      });
      return progress;
    });
    if (found) return true;
  }
  return false;
}

/**
 * Fish of size k (2 = X-Wing, 3 = Swordfish): if in k rows a digit only fits in the same k columns, it must
 * occupy those columns in these rows, so it is removed from the rest of those columns (and vice versa).
 */
function fish(s: SolverState, k: number): boolean {
  for (let d = 1; d <= SIZE; d++) {
    const bit = bitOf(d);
    for (const byRow of [true, false]) {
      const cell = (line: number, x: number): number => (byRow ? line * SIZE + x : x * SIZE + line);
      const where: number[] = [];
      const lines: number[] = [];
      for (let line = 0; line < SIZE; line++) {
        let pos = 0;
        for (let x = 0; x < SIZE; x++) if (open(s, cell(line, x), bit)) pos |= 1 << x;
        where[line] = pos;
        if (POP[pos] >= 2 && POP[pos] <= k) lines.push(line);
      }
      const found = someCombination(lines, k, (base) => {
        const cover = base.reduce((m, line) => m | where[line], 0);
        if (POP[cover] !== k) return false;
        let progress = false;
        for (let line = 0; line < SIZE; line++) {
          if (base.includes(line)) continue;
          for (let x = 0; x < SIZE; x++) {
            if (cover & (1 << x) && s.value[cell(line, x)] === 0 && eliminate(s, cell(line, x), bit)) progress = true;
          }
        }
        return progress;
      });
      if (found) return true;
    }
  }
  return false;
}

/**
 * XY-Wing: a pivot {x,y} sees pincers {x,z} and {y,z}. Whichever digit the pivot takes, one pincer is z,
 * so z is removed from every cell seeing both pincers.
 */
function xyWing(s: SolverState): boolean {
  for (let pivot = 0; pivot < CELLS; pivot++) {
    const pm = s.cand[pivot];
    if (s.value[pivot] !== 0 || POP[pm] !== 2) continue;
    const wings = PEERS[pivot].filter((p) => s.value[p] === 0 && POP[s.cand[p]] === 2 && POP[s.cand[p] & pm] === 1);
    for (const a of wings) {
      const z = s.cand[a] & ~pm;
      for (const b of wings) {
        if (b <= a || s.cand[b] !== (z | (pm & ~s.cand[a]))) continue;
        let progress = false;
        for (const c of PEERS[a]) {
          if (c !== b && s.value[c] === 0 && IS_PEER[b * CELLS + c] && eliminate(s, c, z)) progress = true;
        }
        if (progress) return true;
      }
    }
  }
  return false;
}

/** The individual techniques, exposed for unit tests. Each applies itself once and returns whether it made progress. */
export const technique = { nakedSingles, hiddenSingles, lockedCandidates, nakedSubsets, hiddenSubsets, fish, xyWing };

/** Techniques from simplest to hardest. */
const TECHNIQUES: { level: Level; apply: (s: SolverState) => boolean }[] = [
  { level: 1, apply: nakedSingles },
  { level: 1, apply: hiddenSingles },
  { level: 2, apply: lockedCandidates },
  { level: 2, apply: (s) => nakedSubsets(s, 2) },
  { level: 2, apply: (s) => hiddenSubsets(s, 2) },
  { level: 3, apply: (s) => nakedSubsets(s, 3) },
  { level: 3, apply: (s) => hiddenSubsets(s, 3) },
  { level: 3, apply: (s) => fish(s, 2) },
  { level: 3, apply: (s) => fish(s, 3) },
  { level: 3, apply: xyWing },
];

/**
 * Runs the techniques up to `maxLevel`, restarting from the simplest one after any progress. Since this is
 * deterministic, a run only deviates from a lower-level run once that one is stuck, so `level` (the hardest
 * level that made progress) tells exactly which levels can solve the puzzle.
 */
function runLogic(givens: ArrayLike<number>, maxLevel: Level): { state: SolverState; level: Level } {
  const s = emptyState();
  for (let i = 0; i < CELLS && !s.bad; i++) if (givens[i]) place(s, i, givens[i]);
  let level: Level = 1;
  while (!s.bad && s.filled < CELLS) {
    const t = TECHNIQUES.find((t) => t.level <= maxLevel && t.apply(s));
    if (!t) break;
    if (t.level > level) level = t.level;
  }
  return { state: s, level };
}

/**
 * Solves using human techniques only (no guessing) up to `maxLevel` (default: all). When `solved` is true the
 * solution is unique; otherwise `grid` holds the digits deduced so far (0 = unknown).
 */
export function solveLogic(puzzle: { givens: number[] }, maxLevel: Level = 3): { solved: boolean; grid: number[] } {
  const { state } = runLogic(puzzle.givens, maxLevel);
  return { solved: !state.bad && state.filled === CELLS, grid: Array.from(state.value) };
}

// ---------------------------------------------------------------------------
// Backtracking (solution counting and full-grid generation)
// ---------------------------------------------------------------------------

/**
 * Depth-first search over digit bitmasks, branching on the empty cell with the fewest options (so forced cells
 * are filled first). Calls `onSolution` for each complete grid and stops once it returns true. With `rng`,
 * digits are tried in random order. Clashing givens yield no solutions.
 */
function search(grid: Uint8Array, onSolution: () => boolean, rng?: Rng): void {
  const rows = new Uint16Array(SIZE);
  const cols = new Uint16Array(SIZE);
  const boxes = new Uint16Array(SIZE);
  for (let i = 0; i < CELLS; i++) {
    if (!grid[i]) continue;
    const bit = bitOf(grid[i]);
    const [r, c, b] = [Math.floor(i / SIZE), i % SIZE, boxOf(i)];
    if ((rows[r] | cols[c] | boxes[b]) & bit) return;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }
  const rec = (): boolean => {
    let best = -1;
    let bestMask = 0;
    for (let i = 0; i < CELLS; i++) {
      if (grid[i]) continue;
      const mask = ALL & ~(rows[Math.floor(i / SIZE)] | cols[i % SIZE] | boxes[boxOf(i)]);
      if (!mask) return false;
      if (best < 0 || POP[mask] < POP[bestMask]) {
        best = i;
        bestMask = mask;
        if (POP[mask] === 1) break;
      }
    }
    if (best < 0) return onSolution();
    const [r, c, b] = [Math.floor(best / SIZE), best % SIZE, boxOf(best)];
    const digits: number[] = [];
    for (let m = bestMask; m; m &= m - 1) digits.push(digitOf(m & -m));
    if (rng) shuffle(rng, digits);
    for (const d of digits) {
      const bit = bitOf(d);
      grid[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      const stop = rec();
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      if (stop) return true;
    }
    grid[best] = 0;
    return false;
  };
  rec();
}

/** Whether a complete grid has each digit 1..9 exactly once in every row, column and box. */
function followsRules(grid: ArrayLike<number>): boolean {
  if (grid.length !== CELLS) return false;
  for (let i = 0; i < CELLS; i++) if (!Number.isInteger(grid[i]) || grid[i] < 1 || grid[i] > SIZE) return false;
  for (let u = 0; u < SIZE; u++) {
    const row = new Set<number>();
    const col = new Set<number>();
    const box = new Set<number>();
    for (let k = 0; k < SIZE; k++) {
      row.add(grid[u * SIZE + k]);
      col.add(grid[k * SIZE + u]);
      box.add(grid[(Math.floor(u / BOX) * BOX + Math.floor(k / BOX)) * SIZE + (u % BOX) * BOX + (k % BOX)]);
    }
    if (row.size !== SIZE || col.size !== SIZE || box.size !== SIZE) return false;
  }
  return true;
}

/** Counts solutions by propagation + backtracking, stopping as soon as `limit` are found. */
export function countSolutions(puzzle: { givens: ArrayLike<number> }, limit = 2): number {
  let count = 0;
  const grid = Uint8Array.from(puzzle.givens);
  search(grid, () => {
    if (followsRules(grid)) count++;
    return count >= limit;
  });
  return count;
}

/** Whether `grid` is a complete, valid Sudoku that keeps all of the puzzle's givens. */
export function validate(puzzle: { givens: number[] }, grid: number[]): boolean {
  return followsRules(grid) && puzzle.givens.every((g, i) => g === 0 || g === grid[i]);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface Recipe {
  level: Level;
  /** Inclusive range the target clue count is drawn from. */
  clues: [number, number];
  /** Never go below this many clues. */
  floor: number;
  /** The hardest technique level the puzzle must need (all lower levels must fail). */
  needs: Level;
}

const RECIPES: Record<string, Recipe> = {
  easy: { level: 1, clues: [36, 42], floor: 36, needs: 1 },
  medium: { level: 2, clues: [28, 34], floor: 28, needs: 2 },
  hard: { level: 3, clues: [23, 27], floor: 23, needs: 3 },
};
/** Attempts that keep 180° rotational symmetry before also removing single clues. */
const SYMMETRIC_TRIES = 25;
/** Hard attempts that must need a level-3 technique before settling for anything beyond singles. */
const HARD_TRIES = 60;

/**
 * Removes clues in random order, first in 180°-symmetric pairs and then (unless `symmetric`) one by one, keeping
 * only removals that leave the solution unique (fast counter first) and the logic solver able to finish at the
 * recipe's level. Stops once the target clue count is reached and the puzzle needs `needs`-level techniques;
 * returns null if that never happens.
 */
function dig(rng: Rng, solution: Uint8Array, recipe: Recipe, needs: Level, symmetric: boolean): Uint8Array | null {
  const grid = solution.slice();
  const puzzle = { givens: grid };
  const [lo, hi] = recipe.clues;
  const target = lo + randInt(rng, hi - lo + 1);
  const half = Array.from({ length: Math.ceil(CELLS / 2) }, (_, i) => (i === CELLS - 1 - i ? [i] : [i, CELLS - 1 - i]));
  const groups = shuffle(rng, half);
  if (!symmetric) groups.push(...shuffle(rng, Array.from({ length: CELLS }, (_, i) => [i])));
  let clues = CELLS;
  let level = 1;
  for (const group of groups) {
    if (clues - group.length < recipe.floor || group.some((i) => !grid[i])) continue;
    for (const i of group) grid[i] = 0;
    const run = countSolutions(puzzle) === 1 ? runLogic(grid, recipe.level) : null;
    if (!run || run.state.bad || run.state.filled < CELLS) {
      for (const i of group) grid[i] = solution[i];
      continue;
    }
    clues -= group.length;
    level = run.level;
    if (clues <= target && level >= needs) return grid;
  }
  return clues <= hi && level >= needs ? grid : null;
}

/**
 * Generates a puzzle with a unique solution that the logic solver finishes at the variant's level: easy needs
 * only singles; medium needs locked candidates or pairs; hard needs triples, fish or an XY-Wing (falling back to
 * anything beyond singles if many attempts fail). Unknown variants are generated as the default one.
 */
export function generate(variant: string, seed: number): SudokuPuzzle {
  const id = variant in RECIPES ? variant : DEFAULT_VARIANT;
  const recipe = RECIPES[id];
  const rng = mulberry32(seed);
  for (let attempt = 0; ; attempt++) {
    const solution = new Uint8Array(CELLS);
    search(solution, () => true, rng);
    const needs = recipe.needs === 3 && attempt >= HARD_TRIES ? 2 : recipe.needs;
    const givens = dig(rng, solution, recipe, needs, attempt < SYMMETRIC_TRIES);
    if (givens) return { givens: Array.from(givens), solution: Array.from(solution), variant: id, seed };
  }
}
