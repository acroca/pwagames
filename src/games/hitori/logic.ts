/**
 * Hitori: every cell holds a number 1..N. Shade cells so that
 * - no number repeats among the unshaded cells of any row or column,
 * - shaded cells never touch orthogonally,
 * - all unshaded cells form one orthogonally connected area.
 *
 * Convention: a cell whose number is unique in both its row and its column is never shaded, so only repeated
 * numbers can be shaded. `validate`, `solveLogic` and `countSolutions` all enforce it, and solution uniqueness is
 * with respect to these rules.
 */
import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';

export interface HitoriPuzzle {
  size: number;
  /** Row-major N*N numbers, each in 1..N. */
  numbers: number[];
  /** Row-major N*N, true = shaded. */
  solution: boolean[];
  variant: string;
  seed: number;
}

export const VARIANTS: { id: string; label: string }[] = [
  { id: '6', label: '6×6' },
  { id: '7', label: '7×7' },
  { id: '8', label: '8×8' },
];

export const DEFAULT_VARIANT = '6';

const UNKNOWN = -1;
const WHITE = 0;
const BLACK = 1;

interface Ctx {
  n: number;
  numbers: ArrayLike<number>;
  /** Other cells with the same number in the same row or column, per cell. */
  twins: number[][];
  nbrs: number[][];
}

const neighbourCache = new Map<number, number[][]>();

const neighboursFor = (n: number): number[][] => {
  let nbrs = neighbourCache.get(n);
  if (!nbrs) {
    nbrs = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const list: number[] = [];
      if (r > 0) list.push(i - n);
      if (c > 0) list.push(i - 1);
      if (c < n - 1) list.push(i + 1);
      if (r < n - 1) list.push(i + n);
      nbrs.push(list);
    }
    neighbourCache.set(n, nbrs);
  }
  return nbrs;
};

/** Cells of every row and column. */
const linesFor = (n: number): number[][] => {
  const lines: number[][] = [];
  for (let k = 0; k < n; k++) {
    lines.push(Array.from({ length: n }, (_, c) => k * n + c));
    lines.push(Array.from({ length: n }, (_, r) => r * n + k));
  }
  return lines;
};

const makeCtx = (n: number, numbers: ArrayLike<number>): Ctx => {
  const twins: number[][] = Array.from({ length: n * n }, () => []);
  for (const line of linesFor(n)) {
    for (const i of line) for (const j of line) if (i !== j && numbers[i] === numbers[j]) twins[i].push(j);
  }
  return { n, numbers, twins, nbrs: neighboursFor(n) };
};

/**
 * Sets cells and propagates the local rules until quiet: neighbours of a shaded cell are unshaded, and an unshaded
 * cell shades every equal number in its row and column. Returns false on a contradiction.
 */
const assign = (ctx: Ctx, state: Int8Array, cells: number[], values: number[]): boolean => {
  const queue: number[] = [];
  const set = (i: number, v: number): boolean => {
    if (state[i] === v) return true;
    if (state[i] !== UNKNOWN) return false;
    state[i] = v;
    queue.push(i);
    return true;
  };
  for (let k = 0; k < cells.length; k++) if (!set(cells[k], values[k])) return false;
  while (queue.length > 0) {
    const i = queue.pop()!;
    if (state[i] === BLACK) {
      for (const j of ctx.nbrs[i]) if (!set(j, WHITE)) return false;
    } else {
      for (const j of ctx.twins[i]) if (!set(j, BLACK)) return false;
    }
  }
  return true;
};

/**
 * Connectivity: the non-shaded cells must stay connected, so an unknown articulation point of the graph of
 * non-shaded cells must be unshaded (shading it would split them, and every resulting part would contain a cell
 * that cannot be shaded). Returns the cells to unshade, or null if the non-shaded cells are already disconnected.
 */
const cutCells = (ctx: Ctx, state: Int8Array): number[] | null => {
  const { nbrs } = ctx;
  const size = state.length;
  const disc = new Int16Array(size).fill(-1);
  const low = new Int16Array(size);
  const cuts: number[] = [];
  let time = 0;
  const dfs = (u: number, parent: number): void => {
    disc[u] = low[u] = time++;
    let children = 0;
    let isCut = false;
    for (const v of nbrs[u]) {
      if (state[v] === BLACK) continue;
      if (disc[v] < 0) {
        children++;
        dfs(v, u);
        low[u] = Math.min(low[u], low[v]);
        if (parent >= 0 && low[v] >= disc[u]) isCut = true;
      } else if (v !== parent) {
        low[u] = Math.min(low[u], disc[v]);
      }
    }
    if ((parent < 0 ? children > 1 : isCut) && state[u] === UNKNOWN) cuts.push(u);
  };
  let open = 0;
  for (let i = 0; i < size; i++) {
    if (state[i] === BLACK) continue;
    open++;
    if (time === 0) dfs(i, -1);
  }
  return time === open ? cuts : null;
};

/** Applies connectivity and propagation until nothing changes. Returns false on a contradiction. */
const deduce = (ctx: Ctx, state: Int8Array): boolean => {
  for (;;) {
    const cuts = cutCells(ctx, state);
    if (!cuts) return false;
    if (cuts.length === 0) return true;
    if (!assign(ctx, state, cuts, cuts.map(() => WHITE))) return false;
  }
};

/**
 * Static number patterns, valid for every solution:
 * - unique numbers (in both row and column) are unshaded (convention),
 * - sandwich: in A x A the middle cell is unshaded (one of the A's is shaded and it must not touch a shaded cell),
 * - adjacent pair: in A A one of them is shaded, so every other A in that line is shaded.
 */
const staticDeductions = (ctx: Ctx): { cells: number[]; values: number[] } => {
  const { n, numbers, twins } = ctx;
  const cells: number[] = [];
  const values: number[] = [];
  const add = (i: number, v: number) => {
    cells.push(i);
    values.push(v);
  };
  for (let i = 0; i < n * n; i++) if (twins[i].length === 0) add(i, WHITE);
  for (const line of linesFor(n)) {
    for (let k = 0; k + 1 < n; k++) {
      const a = numbers[line[k]];
      if (k + 2 < n && numbers[line[k + 2]] === a) add(line[k + 1], WHITE);
      if (numbers[line[k + 1]] !== a) continue;
      for (let m = 0; m < n; m++) if (m !== k && m !== k + 1 && numbers[line[m]] === a) add(line[m], BLACK);
    }
  }
  return { cells, values };
};

const initialState = (ctx: Ctx): Int8Array | null => {
  const state = new Int8Array(ctx.n * ctx.n).fill(UNKNOWN);
  const { cells, values } = staticDeductions(ctx);
  return assign(ctx, state, cells, values) && deduce(ctx, state) ? state : null;
};

/**
 * Human-style solver using only sound deductions (unique numbers, sandwich, adjacent pair, shaded/unshaded
 * propagation and connectivity), without guessing. `shaded` marks the cells known to be shaded.
 */
export function solveLogic(puzzle: HitoriPuzzle): { solved: boolean; shaded: boolean[] } {
  const state = initialState(makeCtx(puzzle.size, puzzle.numbers));
  if (!state) return { solved: false, shaded: puzzle.numbers.map(() => false) };
  const shaded = Array.from(state, (v) => v === BLACK);
  return { solved: !state.includes(UNKNOWN) && validate(puzzle, shaded), shaded };
}

/** Counts solutions (up to `limit`) by propagation plus backtracking on the most constrained unknown cell. */
export function countSolutions(puzzle: HitoriPuzzle, limit = 2): number {
  const ctx = makeCtx(puzzle.size, puzzle.numbers);
  let count = 0;
  const search = (state: Int8Array): void => {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < state.length; i++) {
      if (state[i] !== UNKNOWN) continue;
      let score = 0;
      for (const j of ctx.twins[i]) if (state[j] === UNKNOWN) score++;
      if (score > bestScore) [best, bestScore] = [i, score];
    }
    if (best < 0) {
      if (validate(puzzle, Array.from(state, (v) => v === BLACK))) count++;
      return;
    }
    for (const v of [BLACK, WHITE]) {
      const next = state.slice();
      if (assign(ctx, next, [best], [v]) && deduce(ctx, next)) search(next);
      if (count >= limit) return;
    }
  };
  const state = initialState(ctx);
  if (state) search(state);
  return count;
}

/** Checks that `grid` (true = shaded) is a complete, valid solution of the puzzle under all the rules. */
export function validate(puzzle: HitoriPuzzle, grid: boolean[]): boolean {
  const { size: n, numbers } = puzzle;
  if (grid.length !== n * n) return false;
  const at = (r: number, c: number) => numbers[r * n + c];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!grid[r * n + c]) continue;
      if ((r + 1 < n && grid[(r + 1) * n + c]) || (c + 1 < n && grid[r * n + c + 1])) return false;
      let repeated = false;
      for (let k = 0; k < n; k++) {
        if ((k !== c && at(r, k) === at(r, c)) || (k !== r && at(k, c) === at(r, c))) repeated = true;
      }
      if (!repeated) return false;
    }
  }
  for (let k = 0; k < n; k++) {
    const rowSeen = new Set<number>();
    const colSeen = new Set<number>();
    for (let m = 0; m < n; m++) {
      if (!grid[k * n + m]) {
        if (rowSeen.has(at(k, m))) return false;
        rowSeen.add(at(k, m));
      }
      if (!grid[m * n + k]) {
        if (colSeen.has(at(m, k))) return false;
        colSeen.add(at(m, k));
      }
    }
  }
  const start = grid.indexOf(false);
  if (start < 0) return false;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop()!;
    const r = Math.floor(i / n);
    const c = i % n;
    const next = [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1];
    for (const j of next) {
      if (j >= 0 && !grid[j] && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === grid.filter((s) => !s).length;
}

/** Random Latin square (values 1..n) by randomized backtracking with bitmasks. */
const latinSquare = (rng: Rng, n: number): number[] => {
  const grid = new Array<number>(n * n).fill(0);
  const rowUsed = new Array<number>(n).fill(0);
  const colUsed = new Array<number>(n).fill(0);
  const fill = (i: number): boolean => {
    if (i === n * n) return true;
    const r = Math.floor(i / n);
    const c = i % n;
    for (const v of shuffle(rng, Array.from({ length: n }, (_, k) => k))) {
      const bit = 1 << v;
      if ((rowUsed[r] | colUsed[c]) & bit) continue;
      rowUsed[r] |= bit;
      colUsed[c] |= bit;
      grid[i] = v + 1;
      if (fill(i + 1)) return true;
      rowUsed[r] &= ~bit;
      colUsed[c] &= ~bit;
    }
    return false;
  };
  fill(0);
  return grid;
};

/** Random non-adjacent shaded set (25–35% density) that keeps the unshaded cells connected. */
const randomShading = (rng: Rng, n: number): boolean[] => {
  const nbrs = neighboursFor(n);
  const shaded = new Array<boolean>(n * n).fill(false);
  const target = Math.round(n * n * (0.25 + 0.1 * rng()));
  let count = 0;
  const connectedWithout = (x: number): boolean => {
    const start = x === 0 ? 1 : 0;
    const seen = new Uint8Array(n * n);
    seen[start] = 1;
    const stack = [start];
    let reached = 1;
    while (stack.length > 0) {
      for (const j of nbrs[stack.pop()!]) {
        if (j === x || shaded[j] || seen[j]) continue;
        seen[j] = 1;
        reached++;
        stack.push(j);
      }
    }
    return reached === n * n - count - 1;
  };
  for (const i of shuffle(rng, Array.from({ length: n * n }, (_, k) => k))) {
    if (count >= target) break;
    if (nbrs[i].some((j) => shaded[j]) || !connectedWithout(i)) continue;
    shaded[i] = true;
    count++;
  }
  return shaded;
};

/** Gives each shaded cell the number of a random unshaded cell in its row or column. */
const disguise = (rng: Rng, n: number, latin: number[], shaded: boolean[]): number[] => {
  const numbers = latin.slice();
  for (let i = 0; i < n * n; i++) {
    if (!shaded[i]) continue;
    const r = Math.floor(i / n);
    const c = i % n;
    const sources: number[] = [];
    for (let k = 0; k < n; k++) {
      if (!shaded[r * n + k]) sources.push(r * n + k);
      if (!shaded[k * n + c]) sources.push(k * n + c);
    }
    numbers[i] = latin[sources[randInt(rng, sources.length)]];
  }
  return numbers;
};

/** Generates a puzzle with a unique solution that `solveLogic` solves completely. Deterministic per (variant, seed). */
export function generate(variant: string, seed: number): HitoriPuzzle {
  const id = VARIANTS.some((v) => v.id === variant) ? variant : DEFAULT_VARIANT;
  const size = Number(id);
  const rng = mulberry32(seed);
  for (;;) {
    const latin = latinSquare(rng, size);
    const shaded = randomShading(rng, size);
    for (let attempt = 0; attempt < 8; attempt++) {
      const numbers = disguise(rng, size, latin, shaded);
      const puzzle: HitoriPuzzle = { size, numbers, solution: [], variant: id, seed };
      const result = solveLogic(puzzle);
      if (result.solved && countSolutions(puzzle) === 1) return { ...puzzle, solution: result.shaded };
    }
  }
}
