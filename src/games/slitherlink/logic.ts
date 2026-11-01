import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';

/**
 * Loop edges (true = part of the loop).
 * `h[r * size + c]` joins dots (r, c)–(r, c + 1), r in 0..size, c in 0..size-1.
 * `v[r * (size + 1) + c]` joins dots (r, c)–(r + 1, c), r in 0..size-1, c in 0..size.
 */
export interface Edges {
  h: boolean[];
  v: boolean[];
}

export interface SlitherlinkPuzzle {
  size: number;
  /** Row-major, size * size entries: -1 = no clue, else 0..3. */
  clues: number[];
  solution: Edges;
  variant: string;
  seed: number;
}

export const VARIANTS: { id: string; label: string }[] = [
  { id: '5', label: '5×5' },
  { id: '6', label: '6×6' },
  { id: '7', label: '7×7' },
];

export const DEFAULT_VARIANT = '5';

/** Fraction of clues the generator stops removing at (it may keep more if logic needs them). */
const KEEP: Record<number, number> = { 5: 0.56, 6: 0.5, 7: 0.45 };

/** Number of loop edges around `cell`. */
export function cellEdgeCount(edges: Edges, size: number, cell: number): number {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const v = r * (size + 1) + c;
  return +edges.h[cell] + +edges.h[cell + size] + +edges.v[v] + +edges.v[v + 1];
}

/**
 * Checks that `grid` is a single closed loop without crossings or branches that satisfies every clue.
 */
export function validate(puzzle: SlitherlinkPuzzle, grid: Edges): boolean {
  const n = puzzle.size;
  const w = n + 1;
  if (grid.h.length !== w * n || grid.v.length !== n * w) return false;
  const links: number[][] = Array.from({ length: w * w }, () => []);
  const link = (a: number, b: number) => {
    links[a].push(b);
    links[b].push(a);
  };
  for (let r = 0; r <= n; r++) {
    for (let c = 0; c < n; c++) if (grid.h[r * n + c]) link(r * w + c, r * w + c + 1);
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n; c++) if (grid.v[r * w + c]) link(r * w + c, (r + 1) * w + c);
  }
  const used = links.filter((l) => l.length > 0).length;
  if (used === 0 || links.some((l) => l.length !== 0 && l.length !== 2)) return false;
  const start = links.findIndex((l) => l.length > 0);
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const next of links[stack.pop()!]) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  if (seen.size !== used) return false;
  return puzzle.clues.every((clue, i) => clue < 0 || cellEdgeCount(grid, n, i) === clue);
}

const UNKNOWN = -1;
const OFF = 0;
const ON = 1;

/**
 * Board topology. Edges are numbered h first (0..nh-1) then v (nh..). Cell `nCells` is the outside of the board.
 */
interface Topo {
  n: number;
  nCells: number;
  nDots: number;
  nh: number;
  nEdges: number;
  edgeDot: Int16Array;
  edgeCell: Int16Array;
  cellEdge: Int16Array;
  /** 4 entries per dot, -1 when missing. */
  dotEdge: Int16Array;
  /** The 12 edges of every 2×2 block of cells. */
  windows: Int16Array[];
  /** Scratch counters for block enumeration, per cell (incl. outside) and per dot. */
  addOn: Int8Array;
  addSet: Int8Array;
  addOnD: Int8Array;
  addSetD: Int8Array;
}

const topos = new Map<number, Topo>();

const topology = (n: number): Topo => {
  const cached = topos.get(n);
  if (cached) return cached;
  const w = n + 1;
  const nCells = n * n;
  const nDots = w * w;
  const nh = w * n;
  const nEdges = 2 * nh;
  const edgeDot = new Int16Array(2 * nEdges);
  const edgeCell = new Int16Array(2 * nEdges);
  const cellEdge = new Int16Array(4 * nCells);
  const dotEdge = new Int16Array(4 * nDots).fill(-1);
  const cellAt = (r: number, c: number) => (r < 0 || c < 0 || r >= n || c >= n ? nCells : r * n + c);
  const addEdge = (e: number, d1: number, d2: number, c1: number, c2: number) => {
    edgeDot.set([d1, d2], 2 * e);
    edgeCell.set([c1, c2], 2 * e);
    for (const d of [d1, d2]) dotEdge[4 * d + dotEdge.subarray(4 * d, 4 * d + 4).indexOf(-1)] = e;
  };
  for (let r = 0; r <= n; r++) {
    for (let c = 0; c < n; c++) addEdge(r * n + c, r * w + c, r * w + c + 1, cellAt(r - 1, c), cellAt(r, c));
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n; c++) addEdge(nh + r * w + c, r * w + c, (r + 1) * w + c, cellAt(r, c - 1), cellAt(r, c));
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      cellEdge.set([r * n + c, (r + 1) * n + c, nh + r * w + c, nh + r * w + c + 1], 4 * (r * n + c));
    }
  }
  const windows: Int16Array[] = [];
  for (let r = 0; r + 1 < n; r++) {
    for (let c = 0; c + 1 < n; c++) {
      const set = new Set<number>();
      for (const cell of [r * n + c, r * n + c + 1, (r + 1) * n + c, (r + 1) * n + c + 1]) {
        for (let k = 0; k < 4; k++) set.add(cellEdge[4 * cell + k]);
      }
      windows.push(Int16Array.from(set));
    }
  }
  const topo: Topo = {
    n,
    nCells,
    nDots,
    nh,
    nEdges,
    edgeDot,
    edgeCell,
    cellEdge,
    dotEdge,
    windows,
    addOn: new Int8Array(nCells + 1),
    addSet: new Int8Array(nCells + 1),
    addOnD: new Int8Array(nDots),
    addSetD: new Int8Array(nDots),
  };
  topos.set(n, topo);
  return topo;
};

/** Tiny union-find with parity; returns false on a parity conflict. */
const parityUnion = (parent: Int8Array, par: Int8Array, a: number, b: number, diff: number): boolean => {
  let pa = 0;
  while (parent[a] !== a) {
    pa ^= par[a];
    a = parent[a];
  }
  let pb = 0;
  while (parent[b] !== b) {
    pb ^= par[b];
    b = parent[b];
  }
  if (a === b) return (pa ^ pb) === diff;
  parent[a] = b;
  par[a] = pa ^ pb ^ diff;
  return true;
};

/**
 * Solver state: edge knowledge plus incremental counters, a union-find of path segments over dots and a
 * union-find with parity over cells (inside/outside colouring; cell `nCells` is the outside).
 */
class State {
  readonly t: Topo;
  readonly clues: ArrayLike<number>;
  st: Int8Array;
  cellOn: Int8Array;
  cellUnk: Int8Array;
  deg: Int8Array;
  unk: Int8Array;
  seg: Int16Array;
  segEdges: Int16Array;
  col: Int16Array;
  par: Uint8Array;
  /** Number of known loop edges and of path components containing them. */
  onCount = 0;
  comps = 0;
  ok = true;
  changed = false;
  /** Parity of the last `find` argument relative to its root. */
  private fp = 0;

  constructor(t: Topo, clues: ArrayLike<number>, src?: State) {
    this.t = t;
    this.clues = clues;
    if (src) {
      this.st = src.st.slice();
      this.cellOn = src.cellOn.slice();
      this.cellUnk = src.cellUnk.slice();
      this.deg = src.deg.slice();
      this.unk = src.unk.slice();
      this.seg = src.seg.slice();
      this.segEdges = src.segEdges.slice();
      this.col = src.col.slice();
      this.par = src.par.slice();
      this.onCount = src.onCount;
      this.comps = src.comps;
      this.ok = src.ok;
      return;
    }
    this.st = new Int8Array(t.nEdges).fill(UNKNOWN);
    this.cellOn = new Int8Array(t.nCells + 1);
    this.cellUnk = new Int8Array(t.nCells + 1).fill(4);
    this.deg = new Int8Array(t.nDots);
    this.unk = new Int8Array(t.nDots);
    for (let d = 0; d < t.nDots; d++) {
      for (let k = 0; k < 4; k++) if (t.dotEdge[4 * d + k] >= 0) this.unk[d]++;
    }
    this.seg = Int16Array.from({ length: t.nDots }, (_, i) => i);
    this.segEdges = new Int16Array(t.nDots);
    this.col = Int16Array.from({ length: t.nCells + 1 }, (_, i) => i);
    this.par = new Uint8Array(t.nCells + 1);
  }

  segFind(x: number): number {
    while (this.seg[x] !== x) x = this.seg[x] = this.seg[this.seg[x]];
    return x;
  }

  /** Colour root of `x`; its parity relative to the root is left in `this.fp`. */
  find(x: number): number {
    const { col, par } = this;
    let p = 0;
    let r = x;
    while (col[r] !== r) {
      p ^= par[r];
      r = col[r];
    }
    for (let y = x, py = p; col[y] !== y; ) {
      const next = col[y];
      const np = py ^ par[y];
      col[y] = r;
      par[y] = py;
      y = next;
      py = np;
    }
    this.fp = p;
    return r;
  }

  set(e: number, v: number): void {
    const s = this.st[e];
    if (s === v) return;
    if (s !== UNKNOWN) {
      this.ok = false;
      return;
    }
    const { t } = this;
    this.st[e] = v;
    this.changed = true;
    const d1 = t.edgeDot[2 * e];
    const d2 = t.edgeDot[2 * e + 1];
    const c1 = t.edgeCell[2 * e];
    const c2 = t.edgeCell[2 * e + 1];
    this.unk[d1]--;
    this.unk[d2]--;
    this.cellUnk[c1]--;
    this.cellUnk[c2]--;
    if (v === ON) {
      this.deg[d1]++;
      this.deg[d2]++;
      this.cellOn[c1]++;
      this.cellOn[c2]++;
      this.onCount++;
      const a = this.segFind(d1);
      const b = this.segFind(d2);
      if (a === b) {
        this.segEdges[a]++;
      } else {
        const ha = this.segEdges[a] > 0;
        const hb = this.segEdges[b] > 0;
        if (ha && hb) this.comps--;
        else if (!ha && !hb) this.comps++;
        this.seg[a] = b;
        this.segEdges[b] += this.segEdges[a] + 1;
      }
    }
    const ra = this.find(c1);
    const pa = this.fp;
    const rb = this.find(c2);
    const pb = this.fp;
    if (ra === rb) {
      if ((pa ^ pb) !== v) this.ok = false;
    } else {
      this.col[ra] = rb;
      this.par[ra] = pa ^ pb ^ v;
    }
  }

  /** Whether turning unknown edge `e` on closes a loop that is the complete solution. */
  private closesSolution(e: number): boolean {
    if (this.comps !== 1) return false;
    const { t, clues } = this;
    const c1 = t.edgeCell[2 * e];
    const c2 = t.edgeCell[2 * e + 1];
    for (let c = 0; c < t.nCells; c++) {
      if (clues[c] >= 0 && this.cellOn[c] + +(c === c1 || c === c2) !== clues[c]) return false;
    }
    return true;
  }

  /** Cell counts, dot degrees, colouring ⇔ edges, no premature loops, and "loop closed ⇒ rest off". */
  private basicSweep(): void {
    const { t, clues, st } = this;
    for (let c = 0; c < t.nCells && this.ok; c++) {
      const k = clues[c];
      const u = this.cellUnk[c];
      if (k < 0 || u === 0) continue;
      const on = this.cellOn[c];
      if (on > k || on + u < k) this.ok = false;
      else if (on === k || on + u === k) {
        const v = on === k ? OFF : ON;
        for (let i = 4 * c; i < 4 * c + 4; i++) if (st[t.cellEdge[i]] === UNKNOWN) this.set(t.cellEdge[i], v);
      }
    }
    let ends = 0;
    for (let d = 0; d < t.nDots && this.ok; d++) {
      const g = this.deg[d];
      const u = this.unk[d];
      if (g === 1) ends++;
      if (g > 2 || (g === 1 && u === 0)) this.ok = false;
      else if (u > 0 && (g === 2 || u === 1)) {
        const v = g === 1 ? ON : OFF;
        for (let i = 4 * d; i < 4 * d + 4; i++) {
          const e = t.dotEdge[i];
          if (e >= 0 && st[e] === UNKNOWN) this.set(e, v);
        }
      }
    }
    if (this.ok && this.onCount > 0 && ends === 0) {
      for (let e = 0; e < t.nEdges; e++) if (st[e] === UNKNOWN) this.set(e, OFF);
    }
    for (let e = 0; e < t.nEdges && this.ok; e++) {
      if (st[e] !== UNKNOWN) continue;
      const ra = this.find(t.edgeCell[2 * e]);
      const pa = this.fp;
      if (ra === this.find(t.edgeCell[2 * e + 1])) this.set(e, pa ^ this.fp);
      else if (this.segFind(t.edgeDot[2 * e]) === this.segFind(t.edgeDot[2 * e + 1]) && !this.closesSolution(e)) {
        this.set(e, OFF);
      }
    }
  }

  /** Whether the current tentative assignment of edge `e` keeps its dots and cells satisfiable. */
  private fits(e: number): boolean {
    const { t, clues } = this;
    for (let i = 2 * e; i < 2 * e + 2; i++) {
      const d = t.edgeDot[i];
      const g = this.deg[d] + t.addOnD[d];
      if (g > 2 || (g === 1 && this.unk[d] === t.addSetD[d])) return false;
      const c = t.edgeCell[i];
      const k = c < t.nCells ? clues[c] : -1;
      if (k >= 0) {
        const on = this.cellOn[c] + t.addOn[c];
        if (on > k || on + this.cellUnk[c] - t.addSet[c] < k) return false;
      }
    }
    return true;
  }

  /**
   * Enumerates every assignment of the unknown edges of a 2×2 block of cells that respects the clues, dot degrees,
   * the known colouring and the single-loop rule, and fixes edges that take the same value in all of them.
   * This covers the classic local patterns (adjacent/diagonal 3s, corner 1s/3s, 0 neighbourhoods, corner
   * propagation of 1s and 3s, ...) without hard-coding them.
   */
  private enumerate(win: Int16Array): void {
    const { t, st } = this;
    const loc: number[] = [];
    for (const e of win) if (st[e] === UNKNOWN) loc.push(e);
    const k = loc.length;
    if (k === 0) return;
    // Colour and segment roots of each unknown edge's sides/ends, renumbered into small local indices.
    const colRoots: number[] = [];
    const segRoots: number[] = [];
    const segHas: boolean[] = [];
    const local = (roots: number[], r: number) => {
      const i = roots.indexOf(r);
      return i >= 0 ? i : roots.push(r) - 1;
    };
    const cA: number[] = [];
    const cB: number[] = [];
    const cP: number[] = [];
    const sA: number[] = [];
    const sB: number[] = [];
    for (const e of loc) {
      cA.push(local(colRoots, this.find(t.edgeCell[2 * e])));
      const pa = this.fp;
      cB.push(local(colRoots, this.find(t.edgeCell[2 * e + 1])));
      cP.push(pa ^ this.fp);
      for (const [list, i] of [[sA, 2 * e], [sB, 2 * e + 1]] as const) {
        const r = this.segFind(t.edgeDot[i]);
        const j = local(segRoots, r);
        list.push(j);
        segHas[j] = this.segEdges[r] > 0;
      }
    }
    const cParent = new Int8Array(colRoots.length);
    const cPar = new Int8Array(colRoots.length);
    const sParent = new Int8Array(segRoots.length);
    const sHas: boolean[] = [];
    const val = new Int8Array(k);
    const full = 2 ** k - 1;
    let seenOn = 0;
    let seenOff = 0;

    const leafOk = (): boolean => {
      for (let i = 0; i < cParent.length; i++) cParent[i] = i;
      cPar.fill(0);
      for (let i = 0; i < k; i++) if (!parityUnion(cParent, cPar, cA[i], cB[i], val[i] ^ cP[i])) return false;
      for (let i = 0; i < sParent.length; i++) {
        sParent[i] = i;
        sHas[i] = segHas[i];
      }
      let comps = this.comps;
      let cycle = false;
      for (let i = 0; i < k; i++) {
        if (!val[i]) continue;
        let a = sA[i];
        while (sParent[a] !== a) a = sParent[a];
        let b = sB[i];
        while (sParent[b] !== b) b = sParent[b];
        if (a === b) {
          cycle = true;
          continue;
        }
        if (sHas[a] && sHas[b]) comps--;
        else if (!sHas[a] && !sHas[b]) comps++;
        sParent[a] = b;
        sHas[b] = true;
      }
      if (!cycle) return true;
      // A closed loop is only allowed if it is the whole solution, with every other edge off.
      if (comps !== 1) return false;
      for (let c = 0; c < t.nCells; c++) {
        if (this.clues[c] >= 0 && this.cellOn[c] + t.addOn[c] !== this.clues[c]) return false;
      }
      return true;
    };

    const assign = (e: number, v: number, sign: number) => {
      for (let i = 2 * e; i < 2 * e + 2; i++) {
        t.addSetD[t.edgeDot[i]] += sign;
        t.addSet[t.edgeCell[i]] += sign;
        if (v) {
          t.addOnD[t.edgeDot[i]] += sign;
          t.addOn[t.edgeCell[i]] += sign;
        }
      }
    };

    const dfs = (i: number) => {
      if (i === k) {
        if (leafOk()) {
          let mask = 0;
          for (let j = 0; j < k; j++) if (val[j]) mask |= 1 << j;
          seenOn |= mask;
          seenOff |= full & ~mask;
        }
        return;
      }
      const e = loc[i];
      for (let v = 0; v < 2; v++) {
        val[i] = v;
        assign(e, v, 1);
        if (this.fits(e)) dfs(i + 1);
        assign(e, v, -1);
        if (seenOn === full && seenOff === full) return;
      }
    };
    dfs(0);
    if (seenOn === 0 && seenOff === 0) {
      this.ok = false;
      return;
    }
    for (let i = 0; i < k; i++) {
      const on = (seenOn >> i) & 1;
      if (on !== ((seenOff >> i) & 1)) this.set(loc[i], on);
    }
  }

  /** Runs the deductions to a fixpoint, enumerating 2×2 blocks only when the cheap rules stall. */
  propagate(blocks: boolean): void {
    do {
      do {
        this.changed = false;
        this.basicSweep();
      } while (this.ok && this.changed);
      if (!this.ok || !blocks) return;
      for (const win of this.t.windows) {
        this.enumerate(win);
        if (!this.ok) return;
        if (this.changed) break;
      }
    } while (this.changed);
  }

  firstUnknown(): number {
    return this.st.indexOf(UNKNOWN);
  }

  toEdges(): Edges {
    const on = Array.from(this.st, (s) => s === ON);
    return { h: on.slice(0, this.t.nh), v: on.slice(this.t.nh) };
  }
}

/**
 * Human-style solver: cell counts, dot degrees, no premature loops, inside/outside colouring and exhaustive
 * enumeration of every 2×2 block of cells. No guessing. Edges it cannot determine are reported as false.
 */
export function solveLogic(puzzle: SlitherlinkPuzzle): { solved: boolean; edges: Edges } {
  const s = new State(topology(puzzle.size), puzzle.clues);
  s.propagate(true);
  const edges = s.toEdges();
  return { solved: s.ok && s.firstUnknown() < 0 && validate(puzzle, edges), edges };
}

/** Counts solutions (up to `limit`) with propagation and backtracking, extending the most constrained loop end. */
export function countSolutions(puzzle: SlitherlinkPuzzle, limit = 2): number {
  const t = topology(puzzle.size);
  const search = (s: State): number => {
    s.propagate(false);
    if (!s.ok) return 0;
    if (s.firstUnknown() < 0) return validate(puzzle, s.toEdges()) ? 1 : 0;
    let end = -1;
    for (let d = 0; d < t.nDots; d++) if (s.deg[d] === 1 && (end < 0 || s.unk[d] < s.unk[end])) end = d;
    let e = -1;
    if (end >= 0) {
      for (let i = 4 * end; i < 4 * end + 4 && e < 0; i++) {
        const x = t.dotEdge[i];
        if (x >= 0 && s.st[x] === UNKNOWN) e = x;
      }
    } else {
      // No loop yet: start from an unknown edge of the cell with the largest clue.
      let top = -2;
      for (let c = 0; c < t.nCells; c++) {
        if (s.cellUnk[c] > 0 && puzzle.clues[c] > top) {
          top = puzzle.clues[c];
          for (let i = 4 * c; i < 4 * c + 4; i++) if (s.st[t.cellEdge[i]] === UNKNOWN) e = t.cellEdge[i];
        }
      }
    }
    let total = 0;
    for (const v of [ON, OFF]) {
      const next = new State(t, puzzle.clues, s);
      next.set(e, v);
      if (next.ok) total += search(next);
      if (total >= limit) break;
    }
    return total;
  };
  return Math.min(search(new State(t, puzzle.clues)), limit);
}

/** Relative chance of adding a cell with 0..4 region neighbours: favour protrusions for wiggly loops. */
const GROW_WEIGHT = [0, 6, 1, 0.3, 0.1];

/**
 * Grows a random region of cells whose boundary is one simple loop: the outside stays connected (no holes) and no
 * 2×2 block touches itself only diagonally. Works on the grid padded with a ring of outside cells.
 */
const growRegion = (rng: Rng, n: number): Uint8Array => {
  const p = n + 2;
  const inR = new Uint8Array(p * p);
  const target = Math.round(n * n * (0.45 + 0.2 * rng()));
  inR[(randInt(rng, n) + 1) * p + randInt(rng, n) + 1] = 1;
  const queue = new Int16Array(p * p);
  const outsideConnected = (outside: number): boolean => {
    const seen = new Uint8Array(p * p);
    seen[0] = 1;
    queue[0] = 0;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const x = queue[head++];
      const r = Math.floor(x / p);
      const c = x % p;
      for (const y of [r > 0 ? x - p : -1, r < p - 1 ? x + p : -1, c > 0 ? x - 1 : -1, c < p - 1 ? x + 1 : -1]) {
        if (y >= 0 && !inR[y] && !seen[y]) {
          seen[y] = 1;
          queue[tail++] = y;
        }
      }
    }
    return tail === outside;
  };
  const diagonalTouch = (x: number): boolean => {
    for (const b of [x - p - 1, x - p, x - 1, x]) {
      const [a, q, c, d] = [inR[b], inR[b + 1], inR[b + p], inR[b + p + 1]];
      if (a === d && q === c && a !== q) return true;
    }
    return false;
  };
  for (let size = 1; size < target; size++) {
    const cands: number[] = [];
    const weights: number[] = [];
    let sum = 0;
    for (let r = 1; r <= n; r++) {
      for (let c = 1; c <= n; c++) {
        const x = r * p + c;
        const nb = inR[x - p] + inR[x + p] + inR[x - 1] + inR[x + 1];
        if (inR[x] || nb === 0) continue;
        inR[x] = 1;
        if (!diagonalTouch(x) && outsideConnected(p * p - size - 1)) {
          cands.push(x);
          weights.push(GROW_WEIGHT[nb]);
          sum += GROW_WEIGHT[nb];
        }
        inR[x] = 0;
      }
    }
    if (cands.length === 0) break;
    let roll = rng() * sum;
    let i = 0;
    while (i < cands.length - 1 && (roll -= weights[i]) >= 0) i++;
    inR[cands[i]] = 1;
  }
  const region = new Uint8Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) region[r * n + c] = inR[(r + 1) * p + c + 1];
  return region;
};

/**
 * Generates a puzzle whose loop is the boundary of a random region; clues are removed in random order while
 * `solveLogic` still solves it, so the solution is unique and reachable without guessing.
 */
export function generate(variant: string, seed: number): SlitherlinkPuzzle {
  const v = VARIANTS.find((x) => x.id === variant) ?? VARIANTS.find((x) => x.id === DEFAULT_VARIANT)!;
  const n = Number(v.id);
  const t = topology(n);
  const rng = mulberry32(seed);
  const keep = Math.round(KEEP[n] * n * n);
  for (;;) {
    const region = growRegion(rng, n);
    const side = (c: number) => (c < t.nCells ? region[c] : 0);
    const on = Array.from({ length: t.nEdges }, (_, e) => side(t.edgeCell[2 * e]) !== side(t.edgeCell[2 * e + 1]));
    const solution: Edges = { h: on.slice(0, t.nh), v: on.slice(t.nh) };
    const clues = Array.from({ length: t.nCells }, (_, c) => cellEdgeCount(solution, n, c));
    const puzzle: SlitherlinkPuzzle = { size: n, clues, solution, variant: v.id, seed };
    if (!solveLogic(puzzle).solved) continue;
    let count = clues.length;
    for (const c of shuffle(rng, Array.from(clues.keys()))) {
      if (count <= keep) break;
      const clue = clues[c];
      clues[c] = -1;
      if (solveLogic(puzzle).solved) count--;
      else clues[c] = clue;
    }
    return puzzle;
  }
}
