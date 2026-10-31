import { mulberry32, pick, shuffle } from '../../core/rng';

export interface MinesweeperPuzzle {
  width: number;
  height: number;
  /** Row-major, `true` = mine. */
  mines: boolean[];
  /** Index of the player's first tapped cell; it and its neighbours are mine-free. */
  start: number;
  variant: string;
  seed: number;
}

export interface Variant {
  id: string;
  label: string;
  width: number;
  height: number;
  mines: number;
}

export const VARIANTS: Variant[] = [
  { id: '9x9', label: '9×9', width: 9, height: 9, mines: 10 },
  { id: '9x16', label: '9×16', width: 9, height: 16, mines: 25 },
];

export const DEFAULT_VARIANT = '9x9';

export type Technique = 'single' | 'pair' | 'enumerate' | 'global';

/** Cells that can be proven safe or mined from the current position, with the simplest technique that finds any. */
export interface Deduction {
  technique: Technique;
  safe: number[];
  mines: number[];
}

export interface LogicResult {
  solved: boolean;
  revealed: boolean[];
  /** Deduced mines; when solved, every unrevealed cell. */
  flagged: boolean[];
}

/** Frontier components larger than this are not enumerated. */
const MAX_ENUM_CELLS = 20;
/** Search-node budget per enumerated component. */
const ENUM_BUDGET = 20_000;
/** The global remaining-mine count is only used when at most this many cells are unknown. */
const GLOBAL_CELLS = 24;
/** Mine moves tried on a stuck layout before drawing a fresh one. */
const MAX_MOVES = 60;

function getVariant(id: string): Variant {
  const v = VARIANTS.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown minesweeper variant: ${id}`);
  return v;
}

/** Indices of the (up to 8) cells adjacent to cell `i`. */
export function neighbors(width: number, height: number, i: number): number[] {
  const r = Math.floor(i / width);
  const c = i % width;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < height && cc >= 0 && cc < width) out.push(rr * width + cc);
    }
  }
  return out;
}

const neighborTable = (width: number, height: number): number[][] =>
  Array.from({ length: width * height }, (_, i) => neighbors(width, height, i));

/** Number of adjacent mines for every cell. */
export function counts(puzzle: MinesweeperPuzzle): number[] {
  const { width, height, mines } = puzzle;
  return mines.map((_, i) => neighbors(width, height, i).filter((j) => mines[j]).length);
}

interface Ctx {
  n: number;
  width: number;
  nb: number[][];
  cnt: number[];
  mines: boolean[];
  total: number;
}

const context = (puzzle: MinesweeperPuzzle): Ctx => ({
  n: puzzle.width * puzzle.height,
  width: puzzle.width,
  nb: neighborTable(puzzle.width, puzzle.height),
  cnt: counts(puzzle),
  mines: puzzle.mines,
  total: puzzle.mines.filter(Boolean).length,
});

function flood(ctx: Ctx, revealed: boolean[], i: number): number[] {
  if (revealed[i]) return [];
  revealed[i] = true;
  const out = [i];
  if (ctx.mines[i]) return out;
  for (let q = 0; q < out.length; q++) {
    const j = out[q];
    if (ctx.cnt[j] !== 0) continue;
    for (const k of ctx.nb[j]) {
      if (!revealed[k] && !ctx.mines[k]) {
        revealed[k] = true;
        out.push(k);
      }
    }
  }
  return out;
}

/**
 * Reveals cell `i` (mutating `revealed`) and, while revealed cells have no adjacent mines, their neighbours.
 * Mines are never revealed except `i` itself. Returns the newly revealed indices.
 */
export function floodOpen(puzzle: MinesweeperPuzzle, revealed: boolean[], i: number): number[] {
  return flood(context(puzzle), revealed, i);
}

/** "`req` of the unknown `cells` are mines", from a revealed number at `center`. */
interface Constraint {
  center: number;
  cells: number[];
  req: number;
}

function constraintsOf(ctx: Ctx, revealed: boolean[], flagged: boolean[]): Constraint[] {
  const out: Constraint[] = [];
  for (let i = 0; i < ctx.n; i++) {
    if (!revealed[i] || ctx.mines[i]) continue;
    const cells: number[] = [];
    let req = ctx.cnt[i];
    for (const j of ctx.nb[i]) {
      if (flagged[j]) req--;
      else if (!revealed[j]) cells.push(j);
    }
    if (cells.length) out.push({ center: i, cells, req });
  }
  return out;
}

/** Groups constraints sharing cells; cells are listed in BFS order so backtracking prunes early. */
function components(cons: Constraint[]): { cells: number[]; cons: Constraint[] }[] {
  const byCell = new Map<number, number[]>();
  cons.forEach((c, k) => c.cells.forEach((x) => (byCell.get(x) ?? byCell.set(x, []).get(x)!).push(k)));
  const seenCon = new Uint8Array(cons.length);
  const seenCell = new Set<number>();
  const out: { cells: number[]; cons: Constraint[] }[] = [];
  for (let k0 = 0; k0 < cons.length; k0++) {
    if (seenCon[k0]) continue;
    seenCon[k0] = 1;
    const queue = [k0];
    const cells: number[] = [];
    for (let q = 0; q < queue.length; q++) {
      for (const x of cons[queue[q]].cells) {
        if (seenCell.has(x)) continue;
        seenCell.add(x);
        cells.push(x);
        for (const k of byCell.get(x)!) {
          if (!seenCon[k]) {
            seenCon[k] = 1;
            queue.push(k);
          }
        }
      }
    }
    out.push({ cells, cons: queue.map((k) => cons[k]) });
  }
  return out;
}

/**
 * Backtracks over mine/safe assignments of `cells` (in order) satisfying every constraint in `cons` (whose cells must
 * all be among `cells`) with at most `maxMines` mines, calling `leaf(mineCount, assignment)` for each; `leaf` returns
 * true to stop. Returns false if stopped or the node budget ran out.
 */
function search(
  cells: number[],
  cons: Constraint[],
  maxMines: number,
  budget: number,
  leaf: (k: number, assign: Uint8Array) => boolean,
): boolean {
  const m = cells.length;
  const pos = new Map(cells.map((x, p) => [x, p]));
  const cellCons: number[][] = cells.map(() => []);
  cons.forEach((c, k) => c.cells.forEach((x) => cellCons[pos.get(x)!].push(k)));
  const req = cons.map((c) => c.req);
  const left = cons.map((c) => c.cells.length);
  const have = new Array<number>(cons.length).fill(0);
  const assign = new Uint8Array(m);
  let nodes = 0;
  let stopped = false;

  const rec = (p: number, k: number) => {
    if (p === m) {
      if (leaf(k, assign)) stopped = true;
      return;
    }
    if (++nodes > budget) {
      stopped = true;
      return;
    }
    for (let v = 0; v <= 1 && !stopped && k + v <= maxMines; v++) {
      let ok = true;
      for (const ci of cellCons[p]) {
        left[ci]--;
        have[ci] += v;
        if (have[ci] > req[ci] || have[ci] + left[ci] < req[ci]) ok = false;
      }
      if (ok) {
        assign[p] = v;
        rec(p + 1, k + v);
      }
      for (const ci of cellCons[p]) {
        left[ci]++;
        have[ci] -= v;
      }
    }
  };

  rec(0, 0);
  return !stopped;
}

/** Possible mine counts of a region and, per count, whether each cell can be a mine (bit 1) / safe (bit 2). */
interface Part {
  cells: number[];
  feasible: Uint8Array;
  info: Uint8Array;
}

function enumeratePart(cells: number[], cons: Constraint[], maxMines: number): Part {
  const m = cells.length;
  const feasible = new Uint8Array(m + 1);
  const info = new Uint8Array((m + 1) * m);
  const complete =
    m <= MAX_ENUM_CELLS &&
    search(cells, cons, maxMines, ENUM_BUDGET, (k, assign) => {
      feasible[k] = 1;
      for (let c = 0; c < m; c++) info[k * m + c] |= assign[c] ? 1 : 2;
      return false;
    });
  if (!complete) {
    // Unknown: allow every count and value, which keeps the deductions sound.
    feasible.fill(1);
    info.fill(3);
  }
  return { cells, feasible, info };
}

/** Unconstrained cells: any count of mines in any arrangement. */
function freePart(cells: number[]): Part {
  const m = cells.length;
  const info = new Uint8Array((m + 1) * m);
  for (let k = 0; k <= m; k++) for (let c = 0; c < m; c++) info[k * m + c] = (k > 0 ? 1 : 0) | (k < m ? 2 : 0);
  return { cells, feasible: new Uint8Array(m + 1).fill(1), info };
}

/**
 * Cells safe/mined in every arrangement of every part. With `remaining` set, only combinations of part mine counts
 * summing to exactly `remaining` are allowed (the parts must then cover every unknown cell).
 */
function partDeductions(parts: Part[], remaining: number | null, safe: Set<number>, mines: Set<number>) {
  parts.forEach((part, pi) => {
    const m = part.cells.length;
    let allowed = part.feasible;
    if (remaining !== null) {
      let sums = new Uint8Array(remaining + 1);
      sums[0] = 1;
      parts.forEach((other, oi) => {
        if (oi === pi) return;
        const next = new Uint8Array(remaining + 1);
        for (let s = 0; s <= remaining; s++) {
          if (!sums[s]) continue;
          for (let k = 0; k < other.feasible.length && s + k <= remaining; k++) if (other.feasible[k]) next[s + k] = 1;
        }
        sums = next;
      });
      allowed = part.feasible.map((f, k) => (f && k <= remaining && sums[remaining - k] ? 1 : 0));
    }
    for (let c = 0; c < m; c++) {
      let bits = 0;
      for (let k = 0; k <= m; k++) if (allowed[k]) bits |= part.info[k * m + c];
      if (bits === 2) safe.add(part.cells[c]);
      else if (bits === 1) mines.add(part.cells[c]);
    }
  });
}

/** Single-constraint rule: a number already satisfied, or needing all its unknown neighbours. */
function singleRule(cons: Constraint[], safe: Set<number>, mines: Set<number>) {
  for (const c of cons) {
    if (c.req === 0) c.cells.forEach((x) => safe.add(x));
    else if (c.req === c.cells.length) c.cells.forEach((x) => mines.add(x));
  }
}

/**
 * Pair rule between overlapping constraints A and B: bounds on the mines in their shared cells give bounds on the
 * mines in the A-only and B-only cells (covers the subset rule and patterns like 1-2-1).
 */
function pairRule(ctx: Ctx, cons: Constraint[], safe: Set<number>, mines: Set<number>) {
  const { n, width } = ctx;
  const at = new Int32Array(n).fill(-1);
  cons.forEach((c, k) => (at[c.center] = k));
  const settle = (cells: number[], min: number, max: number) => {
    if (!cells.length) return;
    if (max === 0) cells.forEach((x) => safe.add(x));
    else if (min === cells.length) cells.forEach((x) => mines.add(x));
  };
  cons.forEach((a, ka) => {
    const r = Math.floor(a.center / width);
    const c = a.center % width;
    // Overlapping constraints have centers at most 2 apart; later ones (kb > ka) are on this row or below.
    for (let rr = r; rr <= Math.min(r + 2, n / width - 1); rr++) {
      for (let cc = Math.max(c - 2, 0); cc <= Math.min(c + 2, width - 1); cc++) {
        const kb = at[rr * width + cc];
        if (kb <= ka) continue;
        const b = cons[kb];
        const shared = a.cells.filter((x) => b.cells.includes(x));
        if (!shared.length) continue;
        const onlyA = a.cells.filter((x) => !shared.includes(x));
        const onlyB = b.cells.filter((x) => !shared.includes(x));
        const sMin = Math.max(0, a.req - onlyA.length, b.req - onlyB.length);
        const sMax = Math.min(shared.length, a.req, b.req);
        settle(shared, sMin, sMax);
        settle(onlyA, a.req - sMax, a.req - sMin);
        settle(onlyB, b.req - sMax, b.req - sMin);
      }
    }
  });
}

function deduce(ctx: Ctx, revealed: boolean[], flagged: boolean[]): Deduction | null {
  const cons = constraintsOf(ctx, revealed, flagged);
  const safe = new Set<number>();
  const mines = new Set<number>();
  const result = (technique: Technique): Deduction | null =>
    safe.size || mines.size ? { technique, safe: [...safe], mines: [...mines] } : null;

  singleRule(cons, safe, mines);
  let d = result('single');
  if (d) return d;
  pairRule(ctx, cons, safe, mines);
  if ((d = result('pair'))) return d;

  let flags = 0;
  let unknown = 0;
  for (let i = 0; i < ctx.n; i++) {
    if (flagged[i]) flags++;
    else if (!revealed[i]) unknown++;
  }
  const remaining = ctx.total - flags;
  const comps = components(cons);
  const parts = comps.map((c) => enumeratePart(c.cells, c.cons, remaining));
  partDeductions(parts, null, safe, mines);
  if ((d = result('enumerate'))) return d;

  if (unknown > GLOBAL_CELLS) return null;
  const inFrontier = new Set(comps.flatMap((c) => c.cells));
  const interior: number[] = [];
  for (let i = 0; i < ctx.n; i++) if (!revealed[i] && !flagged[i] && !inFrontier.has(i)) interior.push(i);
  partDeductions([...parts, freePart(interior)], remaining, safe, mines);
  return result('global');
}

/**
 * Finds the next logical deductions for a position (e.g. for hints): tries single-number rules, then pair rules, then
 * exact enumeration of each frontier component, then (when few cells remain unknown) the global mine count.
 * `flagged` must only contain proven mines.
 */
export function findDeductions(puzzle: MinesweeperPuzzle, revealed: boolean[], flagged: boolean[]): Deduction | null {
  return deduce(context(puzzle), revealed, flagged);
}

function solveCtx(ctx: Ctx, start: number): LogicResult {
  const revealed = new Array<boolean>(ctx.n).fill(false);
  const flagged = new Array<boolean>(ctx.n).fill(false);
  flood(ctx, revealed, start);
  if (!ctx.mines[start]) {
    for (let d = deduce(ctx, revealed, flagged); d; d = deduce(ctx, revealed, flagged)) {
      d.safe.forEach((i) => flood(ctx, revealed, i));
      d.mines.forEach((i) => (flagged[i] = true));
    }
  }
  const solved = ctx.mines.every((m, i) => m || revealed[i]);
  return { solved, revealed, flagged: solved ? revealed.map((r) => !r) : flagged };
}

/**
 * Simulates a perfect logical player who opens `start` and then only acts on sound deductions (see `findDeductions`).
 * `solved` means every non-mine cell gets revealed without guessing.
 */
export function solveLogic(puzzle: MinesweeperPuzzle): LogicResult {
  return solveCtx(context(puzzle), puzzle.start);
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/**
 * Counts (up to `limit`) the mine layouts a player cannot rule out where `solveLogic` stops: layouts with the
 * puzzle's total mine count, no mines on revealed cells, and matching every revealed number. Unknown cells next to a
 * revealed number are backtracked over; the other unknown cells contribute a binomial factor. A board that
 * `solveLogic` solves has exactly 1.
 */
export function countSolutions(puzzle: MinesweeperPuzzle, limit = 2): number {
  const ctx = context(puzzle);
  const { revealed } = solveCtx(ctx, puzzle.start);
  const cons = constraintsOf(ctx, revealed, new Array<boolean>(ctx.n).fill(false));
  const frontier = components(cons).flatMap((c) => c.cells);
  const rest = revealed.filter((r) => !r).length - frontier.length;
  let found = 0;
  search(frontier, cons, ctx.total, Infinity, (k) => {
    found += binomial(rest, ctx.total - k);
    return found >= limit;
  });
  return Math.min(found, limit);
}

/** Whether `flagged` marks exactly the mines of a well-formed puzzle of its variant with a mine-free start area. */
export function validate(puzzle: MinesweeperPuzzle, flagged: boolean[]): boolean {
  const v = VARIANTS.find((x) => x.id === puzzle.variant);
  if (!v || puzzle.width !== v.width || puzzle.height !== v.height) return false;
  const n = v.width * v.height;
  if (puzzle.mines.length !== n || flagged.length !== n) return false;
  if (puzzle.mines.filter((m) => m).length !== v.mines) return false;
  if (!Number.isInteger(puzzle.start) || puzzle.start < 0 || puzzle.start >= n) return false;
  const sr = Math.floor(puzzle.start / v.width);
  const sc = puzzle.start % v.width;
  for (let r = 0; r < v.height; r++) {
    for (let c = 0; c < v.width; c++) {
      if (Math.abs(r - sr) <= 1 && Math.abs(c - sc) <= 1 && puzzle.mines[r * v.width + c]) return false;
    }
  }
  return puzzle.mines.every((m, i) => m === flagged[i]);
}

/**
 * Generates a no-guess board for the player's first tap at `start`: mines are placed randomly outside start's 3×3
 * area; while `solveLogic` gets stuck, a mine on the stuck frontier is moved into the unexplored region (or a fresh
 * layout is drawn). Deterministic for (variant, seed, start).
 */
export function generate(variant: string, seed: number, start: number): MinesweeperPuzzle {
  const { width, height, mines: count } = getVariant(variant);
  const n = width * height;
  if (!Number.isInteger(start) || start < 0 || start >= n) throw new RangeError(`Invalid start cell: ${start}`);
  const rng = mulberry32(seed);
  const banned = new Set([start, ...neighbors(width, height, start)]);
  const pool = Array.from({ length: n }, (_, i) => i).filter((i) => !banned.has(i));
  const nb = neighborTable(width, height);

  for (;;) {
    const mines = new Array<boolean>(n).fill(false);
    shuffle(rng, [...pool])
      .slice(0, count)
      .forEach((i) => (mines[i] = true));
    const puzzle: MinesweeperPuzzle = { width, height, mines, start, variant, seed };
    for (let move = 0; move <= MAX_MOVES; move++) {
      const { solved, revealed, flagged } = solveLogic(puzzle);
      if (solved) return puzzle;
      const touched = (i: number) => nb[i].some((j) => revealed[j]);
      const stuck = pool.filter((i) => mines[i] && !revealed[i] && touched(i));
      const from = stuck.filter((i) => !flagged[i]);
      const to = pool.filter((i) => !mines[i] && !revealed[i] && !touched(i));
      if (!stuck.length || !to.length) break;
      mines[pick(rng, from.length ? from : stuck)] = false;
      mines[pick(rng, to)] = true;
    }
  }
}
