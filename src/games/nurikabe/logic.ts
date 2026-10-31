import { mulberry32, pick, shuffle, type Rng } from '../../core/rng';

/**
 * Nurikabe: shade cells (sea) so that every number lies in an island of exactly that many orthogonally connected
 * unshaded cells, each island holds exactly one number, the sea is orthogonally connected and has no 2×2 pool.
 */
export interface NurikabePuzzle {
  size: number;
  /** Row-major, `size * size` entries: 0 = no number, otherwise the size of the island containing the cell. */
  clues: number[];
  /** Row-major, `true` = sea (shaded). */
  solution: boolean[];
  variant: string;
  seed: number;
}

export const VARIANTS: { id: string; label: string }[] = [
  { id: '7', label: '7×7' },
  { id: '8', label: '8×8' },
  { id: '9', label: '9×9' },
  { id: '10', label: '10×10' },
];

export const DEFAULT_VARIANT = '7';

const UNKNOWN = 0;
const LAND = 1;
const SEA = 2;

/** Thrown (preallocated, so cheap) when the current knowledge contradicts the rules. */
const CONTRADICTION = new Error('contradiction');
/** Thrown when an island has too many possible completions to enumerate. */
const TOO_MANY = new Error('too many completions');
const MAX_ENUM_STATES = 100;

interface Ctx {
  n: number;
  cells: number;
  clues: number[];
  adj: number[][];
  totalSea: number;
  totalLand: number;
  maxClue: number;
  /** Per cell, the top-left cells of the 2×2 blocks containing it. */
  blocks: number[][];
}

/** Land components of the current grid plus per-cell lookups derived from them. */
interface Analysis {
  /** Land component id per cell, -1 if the cell is not land. */
  comp: Int16Array;
  compCells: number[][];
  /** The component's number, 0 if it holds none (an "orphan" that must still join a numbered island). */
  compClue: number[];
  /** Per cell: the numbered component it touches, -1 for none, -2 for several. */
  touch: Int16Array;
  /** Snapshot of the grid the analysis was made on. */
  grid: Uint8Array;
}

const neighbors = (n: number): number[][] =>
  Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    const out: number[] = [];
    if (r > 0) out.push(i - n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    if (r < n - 1) out.push(i + n);
    return out;
  });

/** Top-left cells of every 2×2 block containing cell `i`. */
const blocksOf = (n: number, i: number): number[] => {
  const r = Math.floor(i / n);
  const c = i % n;
  const out: number[] = [];
  for (let r0 = Math.max(0, r - 1); r0 <= Math.min(r, n - 2); r0++) {
    for (let c0 = Math.max(0, c - 1); c0 <= Math.min(c, n - 2); c0++) out.push(r0 * n + c0);
  }
  return out;
};

const makeCtx = (size: number, clues: number[]): Ctx => {
  const totalLand = clues.reduce((s, v) => s + v, 0);
  return {
    n: size,
    cells: size * size,
    clues,
    adj: neighbors(size),
    totalSea: size * size - totalLand,
    totalLand,
    maxClue: Math.max(0, ...clues),
    blocks: Array.from({ length: size * size }, (_, i) => blocksOf(size, i)),
  };
};

const set = (g: Uint8Array, i: number, v: number): boolean => {
  if (g[i] === v) return false;
  if (g[i] !== UNKNOWN) throw CONTRADICTION;
  g[i] = v;
  return true;
};

/** Labels land components and checks the global invariants (sizes, single number, counts, no pool). */
function analyze(ctx: Ctx, g: Uint8Array): Analysis {
  const { n, cells, adj, clues } = ctx;
  const comp = new Int16Array(cells).fill(-1);
  const compCells: number[][] = [];
  const compClue: number[] = [];
  let sea = 0;
  let land = 0;
  for (let i = 0; i < cells; i++) {
    if (g[i] === SEA) sea++;
    if (g[i] !== LAND || comp[i] >= 0) continue;
    const id = compCells.length;
    const list = [i];
    comp[i] = id;
    let clue = 0;
    for (let q = 0; q < list.length; q++) {
      const u = list[q];
      if (clues[u]) {
        if (clue) throw CONTRADICTION;
        clue = clues[u];
      }
      for (const v of adj[u]) {
        if (g[v] === LAND && comp[v] < 0) {
          comp[v] = id;
          list.push(v);
        }
      }
    }
    // An orphan must still grow by at least one cell to reach a number.
    if (clue ? list.length > clue : list.length >= ctx.maxClue) throw CONTRADICTION;
    land += list.length;
    compCells.push(list);
    compClue.push(clue);
  }
  if (sea > ctx.totalSea || land > ctx.totalLand) throw CONTRADICTION;
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const i = r * n + c;
      if (g[i] === SEA && g[i + 1] === SEA && g[i + n] === SEA && g[i + n + 1] === SEA) throw CONTRADICTION;
    }
  }
  const touch = new Int16Array(cells).fill(-1);
  for (let i = 0; i < cells; i++) {
    for (const v of adj[i]) {
      const k = comp[v];
      if (k < 0 || !compClue[k] || touch[i] === k) continue;
      touch[i] = touch[i] === -1 ? k : -2;
    }
  }
  return { comp, compCells, compClue, touch, grid: g.slice() };
}

/** Once all land (or all sea) is placed, the remaining cells are of the other kind. */
function fillByCount(ctx: Ctx, g: Uint8Array): boolean {
  let sea = 0;
  let land = 0;
  for (let i = 0; i < ctx.cells; i++) {
    if (g[i] === SEA) sea++;
    else if (g[i] === LAND) land++;
  }
  if (sea + land === ctx.cells) return false;
  const fill = land === ctx.totalLand ? SEA : sea === ctx.totalSea ? LAND : UNKNOWN;
  if (fill === UNKNOWN) return false;
  for (let i = 0; i < ctx.cells; i++) if (g[i] === UNKNOWN) g[i] = fill;
  return true;
}

/**
 * An unknown cell is sea if making it land would join two numbers, overgrow a numbered island (this covers the
 * border of complete islands) or build a number-less blob too big for any clue.
 */
function mergeConflicts(ctx: Ctx, a: Analysis, out: Uint8Array): boolean {
  const g = a.grid;
  let changed = false;
  const seen: number[] = [];
  for (let i = 0; i < ctx.cells; i++) {
    if (g[i] !== UNKNOWN) continue;
    let total = 1;
    let numbered = 0;
    let clue = 0;
    seen.length = 0;
    for (const v of ctx.adj[i]) {
      const k = a.comp[v];
      if (k < 0 || seen.includes(k)) continue;
      seen.push(k);
      total += a.compCells[k].length;
      if (a.compClue[k]) {
        numbered++;
        clue = a.compClue[k];
      }
    }
    if (numbered > 1 || (numbered === 1 && total > clue) || (numbered === 0 && seen.length && total >= ctx.maxClue)) {
      changed = set(out, i, SEA) || changed;
    }
  }
  return changed;
}

/** A 2×2 block with three sea cells: the fourth must be land. */
function avoidPools(ctx: Ctx, a: Analysis, out: Uint8Array): boolean {
  const g = a.grid;
  const { n } = ctx;
  let changed = false;
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const block = [r * n + c, r * n + c + 1, r * n + n + c, r * n + n + c + 1];
      if (block.filter((i) => g[i] === SEA).length !== 3) continue;
      const free = block.find((i) => g[i] === UNKNOWN);
      if (free !== undefined) changed = set(out, free, LAND) || changed;
    }
  }
  return changed;
}

const unknownBorder = (ctx: Ctx, g: Uint8Array, list: number[]): number[] => {
  const out: number[] = [];
  for (const u of list) for (const v of ctx.adj[u]) if (g[v] === UNKNOWN && !out.includes(v)) out.push(v);
  return out;
};

/** An incomplete island (or orphan land) with a single way out must take it. */
function islandExits(ctx: Ctx, a: Analysis, out: Uint8Array): boolean {
  const g = a.grid;
  let changed = false;
  a.compCells.forEach((list, k) => {
    if (a.compClue[k] === list.length) return;
    const exits = unknownBorder(ctx, g, list);
    if (exits.length === 0) throw CONTRADICTION;
    if (exits.length === 1) changed = set(out, exits[0], LAND) || changed;
  });
  return changed;
}

/** A sea region that is not the whole sea, with a single way out, must take it. */
function seaExits(ctx: Ctx, a: Analysis, out: Uint8Array): boolean {
  const g = a.grid;
  const seen = new Uint8Array(ctx.cells);
  let changed = false;
  for (let i = 0; i < ctx.cells; i++) {
    if (g[i] !== SEA || seen[i]) continue;
    const list = [i];
    seen[i] = 1;
    for (let q = 0; q < list.length; q++) {
      for (const v of ctx.adj[list[q]]) {
        if (g[v] === SEA && !seen[v]) {
          seen[v] = 1;
          list.push(v);
        }
      }
    }
    if (list.length === ctx.totalSea) continue;
    const exits = unknownBorder(ctx, g, list);
    if (exits.length === 0) throw CONTRADICTION;
    if (exits.length === 1) changed = set(out, exits[0], SEA) || changed;
  }
  return changed;
}

/**
 * Cells numbered island `k` could still grow into within its remaining size, treating `blocked` as sea. Paths may
 * not touch another numbered island; merging an orphan costs its full size. The distance is a lower bound of the
 * true cost, so the result over-approximates (which keeps every deduction based on it sound).
 */
function reach(ctx: Ctx, g: Uint8Array, a: Analysis, k: number, blocked = -1): number[] {
  const own = a.compCells[k];
  const budget = a.compClue[k] - own.length;
  const dist = new Int16Array(ctx.cells).fill(-1);
  const buckets: number[][] = Array.from({ length: budget + 1 }, () => []);
  for (const c of own) dist[c] = 0;
  buckets[0].push(...own);
  const out: number[] = [];
  const enter = (list: number[], d: number) => {
    for (const c of list) {
      if (dist[c] < 0) out.push(c);
      dist[c] = d;
    }
    buckets[d].push(...list);
  };
  for (let d = 0; d < budget; d++) {
    for (const u of buckets[d]) {
      if (dist[u] !== d) continue;
      for (const v of ctx.adj[u]) {
        if (v === blocked || g[v] === SEA || (a.touch[v] !== -1 && a.touch[v] !== k)) continue;
        const o = a.comp[v];
        if (o === k) continue;
        if (o < 0) {
          if (dist[v] < 0 || dist[v] > d + 1) enter([v], d + 1);
          continue;
        }
        const nd = d + a.compCells[o].length;
        if (nd > budget || (dist[v] >= 0 && dist[v] <= nd)) continue;
        if (a.compCells[o].some((c) => a.touch[c] !== -1 && a.touch[c] !== k)) continue;
        enter(a.compCells[o], nd);
      }
    }
  }
  return out;
}

/** Cells no island can reach are sea; an island that cannot reach enough cells is a contradiction. */
function unreachable(ctx: Ctx, a: Analysis, out: Uint8Array): boolean {
  const g = a.grid;
  const reached = new Uint8Array(ctx.cells);
  a.compCells.forEach((list, k) => {
    const clue = a.compClue[k];
    if (!clue) return;
    for (const c of list) reached[c] = 1;
    if (clue === list.length) return;
    const r = reach(ctx, g, a, k);
    if (list.length + r.length < clue) throw CONTRADICTION;
    for (const c of r) reached[c] = 1;
  });
  let changed = false;
  for (let i = 0; i < ctx.cells; i++) {
    if (reached[i]) continue;
    if (g[i] === LAND) throw CONTRADICTION;
    if (g[i] === UNKNOWN) changed = set(out, i, SEA) || changed;
  }
  return changed;
}

/**
 * Sea connectivity: an unknown cell is sea if, were it land, the sea cells could no longer be joined through
 * sea/unknown cells or the region they can occupy would be smaller than the sea's known total size.
 */
function seaBottlenecks(ctx: Ctx, a: Analysis, out: Uint8Array): boolean {
  const g = a.grid;
  const seas: number[] = [];
  for (let i = 0; i < ctx.cells; i++) if (g[i] === SEA) seas.push(i);
  if (seas.length === 0) return false;
  const mark = new Int16Array(ctx.cells).fill(-1);
  const stack: number[] = [];
  const fits = (blocked: number): boolean => {
    const start = seas[0] === blocked ? seas[1] : seas[0];
    let region = 1;
    mark[start] = blocked;
    stack.push(start);
    while (stack.length) {
      for (const v of ctx.adj[stack.pop()!]) {
        if (v === blocked || g[v] === LAND || mark[v] === blocked) continue;
        mark[v] = blocked;
        region++;
        stack.push(v);
      }
    }
    return region >= ctx.totalSea && seas.every((s) => mark[s] === blocked);
  };
  if (!fits(-2)) throw CONTRADICTION;
  let changed = false;
  for (let i = 0; i < ctx.cells; i++) {
    if (g[i] === UNKNOWN && !fits(i)) changed = set(out, i, SEA) || changed;
  }
  return changed;
}

/** An unknown cell an island cannot do without (blocking it leaves too little room) belongs to the island. */
function islandBottlenecks(ctx: Ctx, a: Analysis, out: Uint8Array): boolean {
  const g = a.grid;
  let changed = false;
  a.compCells.forEach((list, k) => {
    const clue = a.compClue[k];
    if (!clue || clue === list.length) return;
    for (const x of reach(ctx, g, a, k)) {
      if (g[x] !== UNKNOWN || list.length + reach(ctx, g, a, k, x).length >= clue) continue;
      changed = set(out, x, LAND) || changed;
    }
  });
  return changed;
}

/**
 * Small local lookahead: enumerates every way numbered island `k` can be completed to exactly its size, as connected
 * sets of unknown cells and whole orphans (Redelmeier's algorithm, so each set is produced once). A set must absorb
 * every orphan it touches and its sea border must not close a 2×2 pool. Throws TOO_MANY when there are many.
 */
function completions(ctx: Ctx, a: Analysis, k: number): number[][] {
  const { n, adj, cells } = ctx;
  const g = a.grid;
  const clue = a.compClue[k];
  const inSet = new Uint8Array(cells);
  // Nodes are unknown cells (id = cell) and orphans (id = cells + component).
  const marked = new Uint8Array(cells + a.compCells.length);
  const nodeOf = (v: number): number => {
    if (g[v] === UNKNOWN) return a.touch[v] === -1 || a.touch[v] === k ? v : -1;
    const o = a.comp[v];
    return o >= 0 && !a.compClue[o] ? cells + o : -1;
  };
  const cur: number[] = [];
  const results: number[][] = [];
  let steps = 0;

  let seaCount = 0;
  for (let i = 0; i < cells; i++) if (g[i] === SEA) seaCount++;
  const border = new Int32Array(cells);
  const seen = new Int32Array(cells);
  const borderList: number[] = [];
  const stack: number[] = [];
  let tick = 0;
  const valid = (): boolean => {
    tick++;
    borderList.length = 0;
    for (const u of cur) {
      for (const v of adj[u]) {
        if (inSet[v] || border[v] === tick) continue;
        if (g[v] === LAND) return false;
        border[v] = tick;
        borderList.push(v);
      }
    }
    if (borderList.length === 0) return false;
    const isSea = (j: number) => g[j] === SEA || border[j] === tick;
    for (const v of borderList) {
      for (const b of ctx.blocks[v]) if (isSea(b) && isSea(b + 1) && isSea(b + n) && isSea(b + n + 1)) return false;
    }
    // The sea (known plus border) must still be able to join up through cells outside the island.
    let needed = seaCount - 1;
    for (const v of borderList) if (g[v] !== SEA) needed++;
    let region = 1;
    seen[borderList[0]] = tick;
    stack.push(borderList[0]);
    while (stack.length) {
      for (const v of adj[stack.pop()!]) {
        if (seen[v] === tick || inSet[v] || g[v] === LAND) continue;
        seen[v] = tick;
        region++;
        if (isSea(v)) needed--;
        stack.push(v);
      }
    }
    return needed === 0 && region >= ctx.totalSea;
  };

  const extend = (list: number[]): number[] => {
    const added: number[] = [];
    for (const c of list) {
      inSet[c] = 1;
      cur.push(c);
      for (const v of adj[c]) {
        const node = inSet[v] ? -1 : nodeOf(v);
        if (node >= 0 && !marked[node]) {
          marked[node] = 1;
          added.push(node);
        }
      }
    }
    return added;
  };

  const grow = (untried: number[]) => {
    if (++steps > MAX_ENUM_STATES) throw TOO_MANY;
    if (cur.length === clue) {
      if (valid()) results.push([...cur]);
      return;
    }
    const queue = [...untried];
    while (queue.length) {
      const node = queue.pop()!;
      const list = node < cells ? [node] : a.compCells[node - cells];
      if (cur.length + list.length <= clue) {
        const mark = cur.length;
        const added = extend(list);
        grow([...queue, ...added]);
        for (const m of added) marked[m] = 0;
        for (const c of cur.splice(mark)) inSet[c] = 0;
      }
      // Every queued node touches the current set, so skipping a touching orphan rules out all larger sets.
      if (node >= cells) return;
    }
  };

  grow(extend(a.compCells[k]));
  return results;
}

/** Cells common to all completions of an island are land; cells bordering all of them are sea. */
function islandCompletions(ctx: Ctx, a: Analysis, out: Uint8Array): boolean {
  const g = a.grid;
  const inAll = new Int16Array(ctx.cells);
  const borderAll = new Int16Array(ctx.cells);
  const stamp = new Int32Array(ctx.cells);
  let tick = 0;
  // Islands with the least left to place first; stop at the first one that yields something.
  const order = a.compCells.map((_, k) => k).filter((k) => a.compClue[k] > a.compCells[k].length);
  order.sort((x, y) => a.compClue[x] - a.compCells[x].length - (a.compClue[y] - a.compCells[y].length));
  for (const k of order) {
    let sets: number[][];
    try {
      sets = completions(ctx, a, k);
    } catch (e) {
      if (e === TOO_MANY) continue;
      throw e;
    }
    if (sets.length === 0) throw CONTRADICTION;
    inAll.fill(0);
    borderAll.fill(0);
    for (const s of sets) {
      tick++;
      for (const c of s) {
        inAll[c]++;
        stamp[c] = tick;
      }
      for (const c of s) {
        for (const v of ctx.adj[c]) {
          if (stamp[v] === tick) continue;
          stamp[v] = tick;
          borderAll[v]++;
        }
      }
    }
    let changed = false;
    for (let i = 0; i < ctx.cells; i++) {
      if (g[i] !== UNKNOWN) continue;
      if (inAll[i] === sets.length) changed = set(out, i, LAND) || changed;
      else if (borderAll[i] === sets.length) changed = set(out, i, SEA) || changed;
    }
    if (changed) return true;
  }
  return false;
}

/** Deduction techniques, cheapest first. Each reads the analysis snapshot and writes its conclusions to the grid. */
const TECHNIQUES = [
  mergeConflicts,
  avoidPools,
  islandExits,
  seaExits,
  unreachable,
  seaBottlenecks,
  islandBottlenecks,
  islandCompletions,
];

/**
 * Applies all deduction techniques, cheapest first, until nothing changes. Returns false on contradiction.
 * Every technique is a sound consequence of the rules, so no branching is involved.
 */
function propagate(ctx: Ctx, g: Uint8Array): boolean {
  try {
    for (;;) {
      if (fillByCount(ctx, g)) continue;
      const a = analyze(ctx, g);
      if (TECHNIQUES.some((technique) => technique(ctx, a, g))) continue;
      return true;
    }
  } catch (e) {
    if (e === CONTRADICTION) return false;
    throw e;
  }
}

const initialGrid = (ctx: Ctx): Uint8Array => Uint8Array.from(ctx.clues, (v) => (v ? LAND : UNKNOWN));

/**
 * Human-style solver: repeatedly applies sound deductions (complete/overgrown islands, cells touching two islands,
 * unreachable cells, forced island and sea exits, 2×2 pools, sea and island bottlenecks, and a small enumeration of
 * the ways each island can be completed) without guessing. `sea[i]` is true for cells proven to be sea.
 */
export function solveLogic(puzzle: NurikabePuzzle): { solved: boolean; sea: boolean[] } {
  const ctx = makeCtx(puzzle.size, puzzle.clues);
  const g = initialGrid(ctx);
  const ok = propagate(ctx, g);
  const sea = Array.from(g, (v) => v === SEA);
  return { solved: ok && !g.includes(UNKNOWN) && validate(puzzle, sea), sea };
}

/** Counts solutions up to `limit` by propagation plus branching on an unknown cell next to land. */
export function countSolutions(puzzle: NurikabePuzzle, limit = 2): number {
  const ctx = makeCtx(puzzle.size, puzzle.clues);
  let count = 0;
  const search = (g: Uint8Array) => {
    if (!propagate(ctx, g)) return;
    let cell = -1;
    for (let i = 0; i < ctx.cells && cell < 0; i++) {
      if (g[i] === UNKNOWN && ctx.adj[i].some((v) => g[v] === LAND)) cell = i;
    }
    if (cell < 0) cell = g.indexOf(UNKNOWN);
    if (cell < 0) {
      if (validate(puzzle, Array.from(g, (v) => v === SEA))) count++;
      return;
    }
    for (const v of [LAND, SEA]) {
      if (count >= limit) return;
      const next = g.slice();
      next[cell] = v;
      search(next);
    }
  };
  search(initialGrid(ctx));
  return count;
}

/** Checks that a complete grid (`true` = sea) satisfies every rule and clue of the puzzle. */
export function validate(puzzle: NurikabePuzzle, grid: boolean[]): boolean {
  const n = puzzle.size;
  if (grid.length !== n * n || puzzle.clues.length !== n * n) return false;
  const seen = grid.map(() => false);
  const flood = (start: number): number[] => {
    const out = [start];
    seen[start] = true;
    for (let q = 0; q < out.length; q++) {
      const r = Math.floor(out[q] / n);
      const c = out[q] % n;
      for (const [rr, cc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        const j = rr * n + cc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n && !seen[j] && grid[j] === grid[start]) {
          seen[j] = true;
          out.push(j);
        }
      }
    }
    return out;
  };

  let seaRegions = 0;
  for (let i = 0; i < n * n; i++) {
    if (seen[i]) continue;
    const region = flood(i);
    if (grid[i]) {
      seaRegions++;
      continue;
    }
    const numbers = region.filter((j) => puzzle.clues[j] > 0);
    if (numbers.length !== 1 || puzzle.clues[numbers[0]] !== region.length) return false;
  }
  if (seaRegions !== 1) return false;
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const i = r * n + c;
      if (grid[i] && grid[i + 1] && grid[i + n] && grid[i + n + 1]) return false;
    }
  }
  return true;
}

/** Relative frequency of island sizes 1..6 for freshly grown islands (small islands keep puzzles deducible). */
const SIZE_WEIGHTS = [4, 8, 8, 5, 3, 1];
const MAX_ISLAND = 10;
/** Sideways (non-improving) repair steps allowed before a layout is abandoned. */
const MAX_PLATEAU = 10;
/** Candidate repairs tried per step. */
const MAX_SCAN = 30;
/** Sea fraction the finished layout is thinned towards, where possible. */
const TARGET_SEA = 0.57;

const pickIslandSize = (rng: Rng): number => {
  let x = rng() * SIZE_WEIGHTS.reduce((s, w) => s + w, 0);
  for (let i = 0; i < SIZE_WEIGHTS.length; i++) {
    x -= SIZE_WEIGHTS[i];
    if (x < 0) return i + 1;
  }
  return SIZE_WEIGHTS.length;
};

/** Whether the sea (cells with owner -1) stays connected and non-empty when sea cell `x` becomes land. */
const seaConnectedWithout = (owner: Int16Array, adj: number[][], x: number): boolean => {
  const start = adj[x].find((v) => owner[v] < 0);
  if (start === undefined) return false;
  const seen = new Uint8Array(owner.length);
  seen[x] = 1;
  seen[start] = 1;
  const stack = [start];
  let count = 1;
  while (stack.length) {
    for (const v of adj[stack.pop()!]) {
      if (owner[v] < 0 && !seen[v]) {
        seen[v] = 1;
        count++;
        stack.push(v);
      }
    }
  }
  return count === owner.reduce((s, o) => s + (o < 0 ? 1 : 0), 0) - 1;
};

/** A candidate solution: island id per cell (-1 = sea) and the cell holding each island's number. */
interface Draft {
  owner: Int16Array;
  numberAt: number[];
}

const membersOf = (owner: Int16Array, id: number): number[] => {
  const out: number[] = [];
  owner.forEach((o, i) => o === id && out.push(i));
  return out;
};

/**
 * Grows islands on an all-sea grid, each seeded inside a remaining 2×2 pool, keeping the sea connected and islands
 * apart, until no pool is left (extending a neighbouring island when a pool has no room for a new one). Numbers go
 * on random cells. Returns null if some pool cannot be broken.
 */
function layout(rng: Rng, n: number, adj: number[][]): Draft | null {
  const owner = new Int16Array(n * n).fill(-1);
  const sizes: number[] = [];
  const canTake = (x: number, id: number) =>
    owner[x] < 0 && adj[x].every((v) => owner[v] < 0 || owner[v] === id) && seaConnectedWithout(owner, adj, x);
  for (;;) {
    const poolCells = new Set<number>();
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const block = [r * n + c, r * n + c + 1, r * n + n + c, r * n + n + c + 1];
        if (block.every((i) => owner[i] < 0)) block.forEach((i) => poolCells.add(i));
      }
    }
    if (poolCells.size === 0) break;
    const candidates = shuffle(rng, [...poolCells]);
    const id = sizes.length;
    const seed = candidates.find((x) => canTake(x, id));
    if (seed === undefined) {
      const grow = candidates.find((x) => {
        const near = adj[x].find((v) => owner[v] >= 0);
        return near !== undefined && sizes[owner[near]] < MAX_ISLAND && canTake(x, owner[near]);
      });
      if (grow === undefined) return null;
      const near = owner[adj[grow].find((v) => owner[v] >= 0)!];
      owner[grow] = near;
      sizes[near]++;
      continue;
    }
    owner[seed] = id;
    const island = [seed];
    for (let target = pickIslandSize(rng); island.length < target; ) {
      const frontier: number[] = [];
      for (const u of island) for (const v of adj[u]) if (!frontier.includes(v) && canTake(v, id)) frontier.push(v);
      if (frontier.length === 0) break;
      const x = pick(rng, frontier);
      owner[x] = id;
      island.push(x);
    }
    sizes.push(island.length);
  }
  return { owner, numberAt: sizes.map((_, id) => pick(rng, membersOf(owner, id))) };
}

/**
 * Turns cell `x` of the draft from sea to land (joining the island it touches, or as a new 1-island) or from land to
 * sea, if the result is still a valid solution. Returns whether the draft changed.
 */
function flip(rng: Rng, d: Draft, n: number, adj: number[][], x: number): boolean {
  const { owner, numberAt } = d;
  if (owner[x] < 0) {
    const near = [...new Set(adj[x].map((v) => owner[v]).filter((o) => o >= 0))];
    if (near.length > 1 || !seaConnectedWithout(owner, adj, x)) return false;
    if (near.length === 0) {
      owner[x] = numberAt.length;
      numberAt.push(x);
      return true;
    }
    if (membersOf(owner, near[0]).length >= MAX_ISLAND) return false;
    owner[x] = near[0];
    return true;
  }
  const id = owner[x];
  const rest = membersOf(owner, id).filter((c) => c !== x);
  if (rest.length === 0 || !adj[x].some((v) => owner[v] < 0)) return false;
  if (blocksOf(n, x).some((b) => [b, b + 1, b + n, b + n + 1].every((j) => j === x || owner[j] < 0))) return false;
  const seen = new Set([rest[0]]);
  const stack = [rest[0]];
  while (stack.length) {
    for (const v of adj[stack.pop()!]) {
      if (v !== x && owner[v] === id && !seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  if (seen.size !== rest.length) return false;
  owner[x] = -1;
  if (numberAt[id] === x) numberAt[id] = pick(rng, rest);
  return true;
}

const cluesOf = (d: Draft): number[] => {
  const clues = Array.from(d.owner, () => 0);
  d.numberAt.forEach((c, id) => (clues[c] = membersOf(d.owner, id).length));
  return clues;
};

/** Runs the logic solver on a draft's clues, returning the resulting knowledge grid and its unknown count. */
const attempt = (n: number, d: Draft): { grid: Uint8Array; unknown: number } => {
  const ctx = makeCtx(n, cluesOf(d));
  const grid = initialGrid(ctx);
  if (!propagate(ctx, grid)) return { grid, unknown: Infinity };
  return { grid, unknown: grid.reduce((s, v) => s + (v === UNKNOWN ? 1 : 0), 0) };
};

/**
 * Candidate changes around the cells the solver left unknown, most promising first: shrinking an island or adding
 * a 1-island (these add the most constraint), moving a number, then growing an island.
 */
function repairs(rng: Rng, d: Draft, grid: Uint8Array, n: number, adj: number[][]): ((d: Draft) => boolean)[] {
  const area = new Set<number>();
  grid.forEach((v, i) => {
    if (v !== UNKNOWN) return;
    area.add(i);
    for (const j of adj[i]) area.add(j);
  });
  const constrain: number[] = [];
  const grow: number[] = [];
  const islands = new Set<number>();
  for (const c of area) {
    if (d.owner[c] >= 0) islands.add(d.owner[c]);
    (d.owner[c] >= 0 || !adj[c].some((v) => d.owner[v] >= 0) ? constrain : grow).push(c);
  }
  const flipAt = (c: number) => (next: Draft) => flip(rng, next, n, adj, c);
  const moveNumber = (id: number) => (next: Draft) => {
    const others = membersOf(next.owner, id).filter((c) => c !== next.numberAt[id]);
    if (others.length === 0) return false;
    next.numberAt[id] = pick(rng, others);
    return true;
  };
  return [
    ...shuffle(rng, constrain).map(flipAt),
    ...shuffle(rng, [...islands]).map(moveNumber),
    ...shuffle(rng, grow).map(flipAt),
  ];
}

/** Grows islands into the sea while the puzzle stays fully solvable, until the sea is down to TARGET_SEA. */
function densify(rng: Rng, d: Draft, n: number, adj: number[][]): Draft {
  const target = Math.floor(TARGET_SEA * n * n);
  let sea = d.owner.reduce((s, o) => s + (o < 0 ? 1 : 0), 0);
  for (const x of shuffle(rng, Array.from(d.owner.keys()))) {
    if (sea <= target) break;
    if (d.owner[x] >= 0) continue;
    const next: Draft = { owner: d.owner.slice(), numberAt: [...d.numberAt] };
    if (!flip(rng, next, n, adj, x) || attempt(n, next).unknown > 0) continue;
    d = next;
    sea--;
  }
  return d;
}

/**
 * Generates a puzzle with a unique solution that `solveLogic` fully solves. A random island layout is numbered and
 * then repaired by local search: while the logic solver gets stuck, cells near the stuck area are flipped between sea
 * and land (or a nearby island's number is moved), taking the first change that leaves fewer cells unresolved (or a
 * sideways step, a bounded number of times) and restarting from a fresh layout when no change helps. Islands are then
 * grown towards ~57% sea where that keeps the puzzle solvable. Deterministic for (variant, seed).
 */
export function generate(variant: string, seed: number): NurikabePuzzle {
  const id = VARIANTS.some((v) => v.id === variant) ? variant : DEFAULT_VARIANT;
  const size = Number(id);
  const rng = mulberry32(seed);
  const adj = neighbors(size);
  for (;;) {
    let d = layout(rng, size, adj);
    if (!d) continue;
    let best = attempt(size, d);
    for (let plateau = 0; best.unknown > 0 && plateau < MAX_PLATEAU; ) {
      let equal: { d: Draft; r: typeof best } | null = null;
      let improved = false;
      let scanned = 0;
      for (const move of repairs(rng, d, best.grid, size, adj)) {
        const next: Draft = { owner: d.owner.slice(), numberAt: [...d.numberAt] };
        if (!move(next)) continue;
        if (++scanned > MAX_SCAN) break;
        const r = attempt(size, next);
        if (r.unknown < best.unknown) {
          d = next;
          best = r;
          improved = true;
          break;
        }
        if (r.unknown === best.unknown && !equal) equal = { d: next, r };
      }
      if (improved) continue;
      if (!equal) break;
      d = equal.d;
      best = equal.r;
      plateau++;
    }
    if (best.unknown > 0) continue;
    d = densify(rng, d, size, adj);
    const solution = Array.from(d.owner, (o) => o < 0);
    const puzzle: NurikabePuzzle = { size, clues: cluesOf(d), solution, variant: id, seed };
    if (validate(puzzle, puzzle.solution) && countSolutions(puzzle) === 1) return puzzle;
  }
}
