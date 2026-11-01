import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';

/** A cage: row-major cells (sorted ascending, orthogonally connected) holding distinct digits that sum to `sum`. */
export interface KillerCage {
  cells: number[];
  sum: number;
}

export interface KillerPuzzle {
  /** Partition of the 81 cells into cages, ordered by first cell. */
  cages: KillerCage[];
  /** 81 row-major digits, 0 = empty. Only the easy variant has a few givens. */
  givens: number[];
  /** 81 row-major digits 1–9. */
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

const N = 81;
const ALL = 0x1ff;
const MAX_LINEAR = 4;

/** Candidate sets are bitmasks: bit `d - 1` stands for digit `d`. */
const POP = new Uint8Array(512);
const SUM = new Uint8Array(512);
for (let m = 1; m < 512; m++) {
  POP[m] = POP[m >> 1] + (m & 1);
  SUM[m] = SUM[m & (m - 1)] + 32 - Math.clz32(m & -m);
}
const bitOf = (d: number) => 1 << (d - 1);
/** Highest digit in a mask (the digit itself for a single bit). */
const digitOf = (m: number) => 32 - Math.clz32(m);
const lowDigit = (m: number) => digitOf(m & -m);

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const CELLS = range(N);
const ROW = CELLS.map((i) => Math.floor(i / 9));
const COL = CELLS.map((i) => i % 9);
const BOX = CELLS.map((i) => Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3));

/** Houses 0–8 are rows, 9–17 columns, 18–26 boxes. */
const HOUSES: number[][] = [
  ...range(9).map((r) => CELLS.filter((i) => ROW[i] === r)),
  ...range(9).map((c) => CELLS.filter((i) => COL[i] === c)),
  ...range(9).map((b) => CELLS.filter((i) => BOX[i] === b)),
];
const HOUSES_OF = CELLS.map((i) => [ROW[i], 9 + COL[i], 18 + BOX[i]]);
const PEERS = CELLS.map((i) =>
  CELLS.filter((j) => j !== i && (ROW[i] === ROW[j] || COL[i] === COL[j] || BOX[i] === BOX[j])),
);
const NEIGHBORS = CELLS.map((i) =>
  [i - 9, i + 9, COL[i] > 0 ? i - 1 : -1, COL[i] < 8 ? i + 1 : -1].filter((j) => j >= 0 && j < N),
);

/** Box/line intersections for locked candidates: digits confined to `inter` within one house leave `bOnly`. */
const INTERSECTIONS = HOUSES.slice(18).flatMap((box) =>
  HOUSES.slice(0, 18).flatMap((line) => {
    const inter = box.filter((i) => line.includes(i));
    if (!inter.length) return [];
    const boxOnly = box.filter((i) => !inter.includes(i));
    const lineOnly = line.filter((i) => !inter.includes(i));
    return [
      { inter, aOnly: boxOnly, bOnly: lineOnly },
      { inter, aOnly: lineOnly, bOnly: boxOnly },
    ];
  }),
);

/** Regions for the rule of 45: single houses, then runs of 2–8 rows/columns and pairs of adjacent boxes. */
const REGIONS: { cells: number[]; houses: number }[] = [
  ...HOUSES.map((cells) => ({ cells, houses: 1 })),
  ...[ROW, COL].flatMap((line) =>
    range(7).flatMap((len) =>
      range(8 - len).map((start) => ({
        cells: CELLS.filter((i) => line[i] >= start && line[i] < start + len + 2),
        houses: len + 2,
      })),
    ),
  ),
  ...range(9).flatMap((b) =>
    [b % 3 < 2 ? b + 1 : -1, b < 6 ? b + 3 : -1]
      .filter((o) => o >= 0)
      .map((o) => ({ cells: CELLS.filter((i) => BOX[i] === b || BOX[i] === o), houses: 2 })),
  ),
];

/** COMBOS[n][s]: digit sets (bitmasks) of n distinct digits summing to s. */
const COMBOS: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
for (let m = 1; m < 512; m++) COMBOS[POP[m]][SUM[m]].push(m);

/**
 * Technique levels: 0 = naked/hidden singles + cage combinations; 1 = + locked candidates and the rule of 45 on
 * single houses; 2 = + cage-confined digits, naked pairs and the rule of 45 on unions of rows/columns/boxes;
 * 3 = + innie/outie differences.
 */
export type Level = 0 | 1 | 2 | 3;

/** Linear constraint `sum(coefs[k] * digit(cells[k])) = total` derived from the rule of 45. */
interface Linear {
  cells: number[];
  coefs: number[];
  total: number;
}

interface Ctx {
  cages: KillerCage[];
  cageOf: Int16Array;
  /** Sudoku peers plus cage mates. */
  peers: number[][];
  cand: Uint16Array;
  /** Digits that must appear in each cage (stays sound while candidates only shrink). */
  required: Uint16Array;
  linears: Linear[];
  level: Level;
  changed: boolean;
  bad: boolean;
  /** Change counter: cages and linears are only re-examined when one of their cells changed since their last pass. */
  tick: number;
  cellTick: Int32Array;
  cageTick: Int32Array;
  linearTick: Int32Array;
}

/** Index of the cage containing each cell (-1 if none). */
export function cageOf(puzzle: KillerPuzzle): number[] {
  const out = new Array<number>(N).fill(-1);
  puzzle.cages.forEach((cage, k) => cage.cells.forEach((i) => (out[i] = k)));
  return out;
}

const restrict = (ctx: Ctx, i: number, mask: number) => {
  const v = ctx.cand[i] & mask;
  if (v === ctx.cand[i]) return;
  ctx.cand[i] = v;
  ctx.cellTick[i] = ++ctx.tick;
  ctx.changed = true;
  if (!v) ctx.bad = true;
};

const isStale = (ctx: Ctx, cells: number[], since: number) => cells.some((c) => ctx.cellTick[c] > since);

const sees = (ctx: Ctx, a: number, b: number) =>
  ROW[a] === ROW[b] || COL[a] === COL[b] || BOX[a] === BOX[b] || ctx.cageOf[a] === ctx.cageOf[b];

/** Naked singles (eliminating from peers and cage mates) and hidden singles in houses, to a fixpoint. */
const singles = (ctx: Ctx) => {
  const { cand } = ctx;
  for (let again = true; again && !ctx.bad; ) {
    again = false;
    for (let i = 0; i < N; i++) {
      const v = cand[i];
      if (POP[v] !== 1) continue;
      for (const p of ctx.peers[i]) {
        if (cand[p] & v) {
          restrict(ctx, p, ~v);
          again = true;
        }
      }
    }
    for (const house of HOUSES) {
      let once = 0;
      let twice = 0;
      for (const c of house) {
        twice |= once & cand[c];
        once |= cand[c];
      }
      if (once !== ALL) ctx.bad = true;
      const unique = once & ~twice;
      if (!unique) continue;
      for (const c of house) {
        const u = cand[c] & unique;
        if (!u || u === cand[c]) continue;
        if (POP[u] > 1) ctx.bad = true;
        restrict(ctx, c, u);
        again = true;
      }
    }
  }
};

/**
 * Fills `out[k]` with the digits cell `cells[k]` can take in some no-repeat assignment summing to `sum` and returns the
 * digits common to every feasible combination, or -1 if there is none.
 */
const cageOptions = (cand: Uint16Array, cells: number[], sum: number, out: number[]): number => {
  const n = cells.length;
  out.fill(0, 0, n);
  const path: number[] = [];
  let required = ALL;
  let any = false;
  for (const m of COMBOS[n]?.[sum] ?? []) {
    let union = 0;
    let ok = true;
    for (const c of cells) {
      const x = cand[c] & m;
      if (!x) ok = false;
      union |= x;
    }
    if (!ok || union !== m) continue;
    let found = false;
    // Stops early once every cell already allows all of its candidates within this combination.
    const rec = (k: number, used: number): boolean => {
      if (k === n) {
        found = true;
        let saturated = true;
        for (let j = 0; j < n; j++) {
          out[j] |= path[j];
          if ((out[j] & cand[cells[j]] & m) !== (cand[cells[j]] & m)) saturated = false;
        }
        return saturated;
      }
      for (let avail = cand[cells[k]] & m & ~used; avail; avail &= avail - 1) {
        path[k] = avail & -avail;
        if (rec(k + 1, used | path[k])) return true;
      }
      return false;
    };
    rec(0, 0);
    if (found) {
      any = true;
      required &= m;
    }
  }
  return any ? required : -1;
};

const cageCombos = (ctx: Ctx) => {
  const out: number[] = [];
  ctx.cages.forEach((cage, k) => {
    if (ctx.bad || !isStale(ctx, cage.cells, ctx.cageTick[k])) return;
    const req = cageOptions(ctx.cand, cage.cells, cage.sum, out);
    if (req < 0) {
      ctx.bad = true;
      return;
    }
    ctx.required[k] = req;
    cage.cells.forEach((c, j) => restrict(ctx, c, out[j]));
    ctx.cageTick[k] = ctx.tick;
  });
};

/** Pointing and claiming: a digit confined to a box/line intersection within one house leaves the other. */
const lockedCandidates = (ctx: Ctx) => {
  const { cand } = ctx;
  for (const { inter, aOnly, bOnly } of INTERSECTIONS) {
    let inside = 0;
    let outside = 0;
    for (const c of inter) inside |= cand[c];
    for (const c of aOnly) outside |= cand[c];
    const locked = inside & ~outside;
    if (locked) for (const c of bOnly) restrict(ctx, c, ~locked);
  }
};

/** A digit required in a cage whose possible cells all share a house cannot appear elsewhere in that house. */
const cageLock = (ctx: Ctx) => {
  ctx.cages.forEach((cage, k) => {
    for (let req = ctx.required[k]; req; req &= req - 1) {
      const b = req & -req;
      const spots = cage.cells.filter((c) => ctx.cand[c] & b);
      if (spots.length < 2) continue;
      for (const h of HOUSES_OF[spots[0]]) {
        if (!spots.every((c) => HOUSES_OF[c].includes(h))) continue;
        for (const c of HOUSES[h]) if (ctx.cageOf[c] !== k) restrict(ctx, c, ~b);
      }
    }
  });
};

const nakedPairs = (ctx: Ctx) => {
  const { cand } = ctx;
  for (const house of HOUSES) {
    for (let a = 0; a < 9; a++) {
      const v = cand[house[a]];
      if (POP[v] !== 2) continue;
      for (let b = a + 1; b < 9; b++) {
        if (cand[house[b]] !== v) continue;
        for (const c of house) if (c !== house[a] && c !== house[b]) restrict(ctx, c, ~v);
      }
    }
  }
};

/**
 * Enumerates digit assignments for a small linear constraint (cells that see each other differ) and fills `out[k]`
 * with the digits each cell takes in some solution. Returns false if there is none.
 */
const linearOptions = (ctx: Ctx, cells: number[], coefs: number[], total: number, out: number[]): boolean => {
  const n = cells.length;
  const { cand } = ctx;
  const lo = new Array<number>(n + 1).fill(0);
  const hi = new Array<number>(n + 1).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    const a = coefs[k] * lowDigit(cand[cells[k]]);
    const b = coefs[k] * digitOf(cand[cells[k]]);
    lo[k] = lo[k + 1] + Math.min(a, b);
    hi[k] = hi[k + 1] + Math.max(a, b);
  }
  const conflicts = cells.map((c, k) => cells.slice(0, k).flatMap((d, j) => (sees(ctx, c, d) ? [j] : [])));
  const path: number[] = [];
  out.fill(0, 0, n);
  let found = false;
  const rec = (k: number, acc: number) => {
    if (k === n) {
      if (acc !== total) return;
      found = true;
      for (let j = 0; j < n; j++) out[j] |= path[j];
      return;
    }
    let used = 0;
    for (const j of conflicts[k]) used |= path[j];
    for (let avail = cand[cells[k]] & ~used; avail; avail &= avail - 1) {
      const b = avail & -avail;
      const next = acc + coefs[k] * digitOf(b);
      if (next + lo[k + 1] > total || next + hi[k + 1] < total) continue;
      path[k] = b;
      rec(k + 1, next);
    }
  };
  rec(0, 0);
  return found;
};

/** Rule of 45: innie/outie constraints whose unsolved part is small enough are solved as virtual cages. */
const rule45 = (ctx: Ctx) => {
  const out: number[] = [];
  for (const [l, lin] of ctx.linears.entries()) {
    if (!isStale(ctx, lin.cells, ctx.linearTick[l])) continue;
    const cells: number[] = [];
    const coefs: number[] = [];
    let total = lin.total;
    lin.cells.forEach((c, k) => {
      const v = ctx.cand[c];
      if (POP[v] === 1) {
        total -= lin.coefs[k] * digitOf(v);
      } else {
        cells.push(c);
        coefs.push(lin.coefs[k]);
      }
    });
    if (!cells.length) {
      if (total !== 0) ctx.bad = true;
    } else if (cells.length <= MAX_LINEAR) {
      if (linearOptions(ctx, cells, coefs, total, out)) cells.forEach((c, k) => restrict(ctx, c, out[k]));
      else ctx.bad = true;
    }
    if (ctx.bad) return;
    ctx.linearTick[l] = ctx.tick;
  }
};

const STEPS: [(ctx: Ctx) => void, Level][] = [
  [singles, 0],
  [cageCombos, 0],
  [lockedCandidates, 1],
  [cageLock, 2],
  [nakedPairs, 2],
  [rule45, 1],
];

/** Builds the rule-of-45 constraints for the regions and techniques allowed at `level`. */
const buildLinears = (cages: KillerCage[], cageIdx: Int16Array, level: Level): Linear[] => {
  if (level < 1) return [];
  const seen = new Set<string>();
  const linears: Linear[] = [];
  const add = (cells: number[], coefs: number[], total: number) => {
    const key = `${cells}/${coefs}/${total}`;
    if (!cells.length || seen.has(key)) return;
    seen.add(key);
    linears.push({ cells, coefs, total });
  };
  const inCount = new Uint8Array(cages.length);
  const inR = new Uint8Array(N);
  for (const region of level < 2 ? REGIONS.slice(0, 27) : REGIONS) {
    inR.fill(0);
    inCount.fill(0);
    for (const c of region.cells) {
      inR[c] = 1;
      inCount[cageIdx[c]]++;
    }
    const touching = [...new Set(region.cells.map((c) => cageIdx[c]))];
    const partial = touching.filter((k) => inCount[k] < cages[k].cells.length);
    const sumOf = (list: number[]) => list.reduce((s, k) => s + cages[k].sum, 0);
    const innies = (list: number[]) => list.flatMap((k) => cages[k].cells.filter((c) => inR[c]));
    const outies = (list: number[]) => list.flatMap((k) => cages[k].cells.filter((c) => !inR[c]));
    const full = 45 * region.houses;
    const insideSum = sumOf(touching) - sumOf(partial);
    const ins = innies(partial);
    add(ins, ins.map(() => 1), full - insideSum);
    const outs = outies(partial);
    add(outs, outs.map(() => 1), sumOf(touching) - full);
    if (level < 3) continue;
    // Cover the region with the inside cages plus the partial cages lying mostly inside it:
    // innies - outies = 45 * houses - sum(covering cages).
    const mostly = partial.filter((k) => 2 * inCount[k] > cages[k].cells.length);
    const rest = partial.filter((k) => 2 * inCount[k] <= cages[k].cells.length);
    if (!mostly.length || !rest.length) continue;
    const i3 = innies(rest);
    const o3 = outies(mostly);
    add([...i3, ...o3], [...i3.map(() => 1), ...o3.map(() => -1)], full - insideSum - sumOf(mostly));
  }
  return linears;
};

const createCtx = (puzzle: KillerPuzzle, level: Level): Ctx => {
  const cageIdx = Int16Array.from(cageOf(puzzle));
  const bad = cageIdx.includes(-1);
  const linears = bad ? [] : buildLinears(puzzle.cages, cageIdx, level);
  const cand = new Uint16Array(N).fill(ALL);
  puzzle.givens.forEach((g, i) => {
    if (g) cand[i] = bitOf(g);
  });
  return {
    cages: puzzle.cages,
    cageOf: cageIdx,
    peers: CELLS.map((i) => [
      ...PEERS[i],
      ...(puzzle.cages[cageIdx[i]]?.cells ?? []).filter((c) => c !== i && !PEERS[i].includes(c)),
    ]),
    cand,
    required: new Uint16Array(puzzle.cages.length),
    linears,
    level,
    changed: false,
    bad,
    tick: 0,
    cellTick: new Int32Array(N),
    cageTick: new Int32Array(puzzle.cages.length).fill(-1),
    linearTick: new Int32Array(linears.length).fill(-1),
  };
};

/** Applies the techniques allowed at the context's level until none makes progress. Returns false on contradiction. */
const propagate = (ctx: Ctx): boolean => {
  const steps = STEPS.filter(([, lvl]) => lvl <= ctx.level).map(([step]) => step);
  for (let s = 0; s < steps.length && !ctx.bad; ) {
    ctx.changed = false;
    steps[s](ctx);
    s = ctx.changed && s > 0 ? 0 : s + 1;
  }
  return !ctx.bad;
};

/** Candidates left by pure logic at `level`, or null on contradiction. */
const runLogic = (puzzle: KillerPuzzle, level: Level): Uint16Array | null => {
  const ctx = createCtx(puzzle, level);
  return !ctx.bad && propagate(ctx) ? ctx.cand : null;
};

const gridOf = (cand: Uint16Array) => Array.from(cand, (v) => (POP[v] === 1 ? digitOf(v) : 0));
const isSolved = (cand: Uint16Array | null) => !!cand && cand.every((v) => POP[v] === 1);

/**
 * Human-style solver: sudoku singles, locked candidates and naked pairs, cage combinations, cage-confined digits and
 * the rule of 45 (innies/outies over houses and unions of rows, columns and adjacent boxes). No guessing.
 * `grid` holds the deduced digits (0 where unresolved).
 */
export function solveLogic(puzzle: KillerPuzzle): { solved: boolean; grid: number[] } {
  const cand = runLogic(puzzle, 3);
  if (!cand) return { solved: false, grid: new Array<number>(N).fill(0) };
  const grid = gridOf(cand);
  return { solved: grid.every((v) => v > 0) && validate(puzzle, grid), grid };
}

/**
 * Candidate bitmasks (bit `d - 1` = digit `d`) left by pure logic restricted to the techniques of `level`, or all
 * zeros on contradiction. Useful for hints and for testing individual techniques.
 */
export function logicCandidates(puzzle: KillerPuzzle, level: Level = 3): number[] {
  return Array.from(runLogic(puzzle, level) ?? new Uint16Array(N));
}

/** Counts solutions (up to `limit`) by propagation plus backtracking on the cell with the fewest candidates. */
export function countSolutions(puzzle: KillerPuzzle, limit = 2): number {
  const ctx = createCtx(puzzle, 1);
  let count = 0;
  const search = (cand: Uint16Array) => {
    ctx.cand = cand;
    ctx.bad = false;
    ctx.cageTick.fill(-1);
    ctx.linearTick.fill(-1);
    if (!propagate(ctx)) return;
    let best = -1;
    for (let i = 0; i < N; i++) if (POP[cand[i]] > 1 && (best < 0 || POP[cand[i]] < POP[cand[best]])) best = i;
    if (best < 0) {
      if (validate(puzzle, gridOf(cand))) count++;
      return;
    }
    for (let avail = cand[best]; avail && count < limit; avail &= avail - 1) {
      const next = cand.slice();
      next[best] = avail & -avail;
      search(next);
    }
  };
  if (!ctx.bad) search(ctx.cand);
  return count;
}

/** Checks that `grid` is a complete sudoku satisfying every cage and given of `puzzle`. */
export function validate(puzzle: KillerPuzzle, grid: number[]): boolean {
  if (grid.length !== N || !grid.every((v) => Number.isInteger(v) && v >= 1 && v <= 9)) return false;
  const distinct = (cells: number[]) => new Set(cells.map((i) => grid[i])).size === cells.length;
  for (let k = 0; k < 9; k++) {
    const row: number[] = [];
    const col: number[] = [];
    const box: number[] = [];
    for (let j = 0; j < 9; j++) {
      row.push(k * 9 + j);
      col.push(j * 9 + k);
      box.push((Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3));
    }
    if (!distinct(row) || !distinct(col) || !distinct(box)) return false;
  }
  for (const cage of puzzle.cages) {
    if (!distinct(cage.cells) || cage.cells.reduce((s, i) => s + grid[i], 0) !== cage.sum) return false;
  }
  return puzzle.givens.every((g, i) => !g || g === grid[i]);
}

interface Config {
  /** Techniques the generated puzzle must be solvable with. */
  level: Level;
  /** Puzzles fully solvable below this level are rejected as too easy. */
  minLevel: Level;
  /** Relative weights of cage sizes, indexed by size. */
  weights: number[];
  givens: number;
  maxGivens: number;
}

const CONFIGS: Record<string, Config> = {
  easy: { level: 1, minLevel: 0, weights: [0, 0, 5, 4, 1], givens: 2, maxGivens: 6 },
  medium: { level: 2, minLevel: 1, weights: [0, 0, 3, 4, 3], givens: 0, maxGivens: 0 },
  hard: { level: 3, minLevel: 2, weights: [0, 0, 1, 3, 3, 3], givens: 0, maxGivens: 0 },
};
const MAX_SINGLES = 2;
const MAX_REFINES = 40;

const fillGrid = (rng: Rng): number[] => {
  const grid = new Array<number>(N).fill(0);
  const used = new Uint16Array(27);
  const fill = (i: number): boolean => {
    if (i === N) return true;
    const hs = HOUSES_OF[i];
    const options: number[] = [];
    const free = ALL & ~(used[hs[0]] | used[hs[1]] | used[hs[2]]);
    for (let rest = free; rest; rest &= rest - 1) options.push(rest & -rest);
    for (const b of shuffle(rng, options)) {
      for (const h of hs) used[h] |= b;
      grid[i] = digitOf(b);
      if (fill(i + 1)) return true;
      for (const h of hs) used[h] &= ~b;
    }
    return false;
  };
  fill(0);
  return grid;
};

const sample = (rng: Rng, weights: number[]) => {
  let x = rng() * weights.reduce((a, b) => a + b, 0);
  const i = weights.findIndex((w) => (x -= w) < 0);
  return i < 0 ? weights.length - 1 : i;
};

const isConnected = (cells: number[]) => {
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    for (const j of NEIGHBORS[stack.pop()!]) {
      if (cells.includes(j) && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
};

/** Randomly grows cages of no-repeat digits; leftover single cells are merged into neighbours when possible. */
const partition = (rng: Rng, solution: number[], cfg: Config): number[][] | null => {
  const maxSize = cfg.weights.length - 1;
  const id = new Int16Array(N).fill(-1);
  const groups: number[][] = [];
  const freeNeighbors = (i: number) => NEIGHBORS[i].filter((j) => id[j] < 0).length;
  const order = shuffle(rng, CELLS.slice());
  for (;;) {
    // Starting from the most cornered free cell keeps isolated leftovers rare.
    let start = -1;
    for (const i of order) if (id[i] < 0 && (start < 0 || freeNeighbors(i) < freeNeighbors(start))) start = i;
    if (start < 0) break;
    const target = sample(rng, cfg.weights);
    const cells = [start];
    let digits = bitOf(solution[start]);
    id[start] = groups.length;
    while (cells.length < target) {
      const frontier = [...new Set(cells.flatMap((c) => NEIGHBORS[c]))].filter(
        (j) => id[j] < 0 && !(digits & bitOf(solution[j])),
      );
      if (!frontier.length) break;
      const next = frontier[randInt(rng, frontier.length)];
      cells.push(next);
      digits |= bitOf(solution[next]);
      id[next] = groups.length;
    }
    groups.push(cells);
  }
  for (const single of groups.filter((g) => g.length === 1)) {
    const c = single[0];
    const options = NEIGHBORS[c]
      .map((j) => groups[id[j]])
      .filter((g) => g.length > 1 && g.length < maxSize && g.every((j) => solution[j] !== solution[c]));
    if (!options.length) continue;
    const into = options.reduce((a, b) => (b.length < a.length ? b : a));
    into.push(c);
    single.pop();
    id[c] = id[into[0]];
  }
  const result = groups.filter((g) => g.length);
  return result.filter((g) => g.length === 1).length <= MAX_SINGLES ? result : null;
};

/** Splits a cage into two connected parts of at least `minPart` cells, or returns null. */
const split = (rng: Rng, cells: number[], minPart: number): number[][] | null => {
  if (cells.length < 2 * minPart) return null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const size = minPart + randInt(rng, cells.length - 2 * minPart + 1);
    const part = [cells[randInt(rng, cells.length)]];
    while (part.length < size) {
      const frontier = part.flatMap((c) => NEIGHBORS[c]).filter((j) => cells.includes(j) && !part.includes(j));
      part.push(frontier[randInt(rng, frontier.length)]);
    }
    const rest = cells.filter((c) => !part.includes(c));
    if (isConnected(rest)) return [part, rest];
  }
  return null;
};

const buildPuzzle = (
  groups: number[][],
  solution: number[],
  givens: number[],
  variant: string,
  seed: number,
): KillerPuzzle => ({
  cages: groups
    .map((g) => g.slice().sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .map((cells) => ({ cells, sum: cells.reduce((s, i) => s + solution[i], 0) })),
  givens: givens.slice(),
  solution: solution.slice(),
  variant,
  seed,
});

/**
 * Generates a puzzle with a unique solution reachable by `solveLogic`. Builds a random cage partition of a random
 * grid, then repeatedly splits a cage (or, in easy, adds a given) at a cell the variant's technique level cannot
 * resolve, restarting when no refinement is possible.
 */
export function generate(variant: string, seed: number): KillerPuzzle {
  const cfg = CONFIGS[variant] ?? CONFIGS[DEFAULT_VARIANT];
  const rng = mulberry32(seed);
  for (;;) {
    const solution = fillGrid(rng);
    const groups = partition(rng, solution, cfg);
    if (!groups) continue;
    const givens = new Array<number>(N).fill(0);
    for (const i of shuffle(rng, CELLS.slice()).slice(0, cfg.givens)) givens[i] = solution[i];
    let numGivens = cfg.givens;
    for (let refine = 0; refine < MAX_REFINES; refine++) {
      const puzzle = buildPuzzle(groups, solution, givens, variant, seed);
      const cand = runLogic(puzzle, cfg.level);
      if (!cand) break;
      const open = shuffle(rng, CELLS.filter((i) => POP[cand[i]] > 1));
      if (!open.length) {
        if (cfg.minLevel && isSolved(runLogic(puzzle, (cfg.minLevel - 1) as Level))) break;
        const { solved, grid } = solveLogic(puzzle);
        if (solved && grid.every((v, i) => v === solution[i]) && countSolutions(puzzle) === 1) return puzzle;
        break;
      }
      if (numGivens < cfg.maxGivens && rng() < 0.5) {
        givens[open[0]] = solution[open[0]];
        numGivens++;
        continue;
      }
      const budget = MAX_SINGLES - groups.filter((g) => g.length === 1).length;
      let parts: number[][] | null = null;
      for (const u of open) {
        const g = groups.findIndex((cells) => cells.includes(u));
        const len = groups[g].length;
        parts = split(rng, groups[g], len >= 4 || budget < 4 - len ? 2 : 1);
        if (parts) {
          groups.splice(g, 1, ...parts);
          break;
        }
      }
      if (!parts) break;
    }
  }
}
