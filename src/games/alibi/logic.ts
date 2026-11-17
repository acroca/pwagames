import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';

/**
 * One statement about where a person stood.
 *
 * - `room`: in that room.
 * - `beside`: an object of that type is in a square sharing a side with theirs, in the same room.
 * - `clear`: no object at all is beside them.
 * - `row` / `col`: an object of that type is somewhere in their row / column.
 * - `outer`: on the edge of the house.
 * - `alone`: nobody else was in their room.
 * - `with`: in the same room as the other person.
 * - `diag`: touching the other person corner to corner.
 * - `above` / `below` / `left` / `right`: in a row above / below, or a column to the left / right of, the other's.
 */
export type Clue =
  | { kind: 'room'; room: number }
  | { kind: 'beside' | 'row' | 'col'; object: number }
  | { kind: 'clear' | 'outer' | 'alone' }
  | { kind: 'with' | 'diag' | 'above' | 'below' | 'left' | 'right'; other: number };

export interface AlibiPuzzle {
  size: number;
  /** Row-major, length size²: room id per cell. Rooms are rectangles. */
  rooms: number[];
  /** Per room: index into `ROOM_NAMES`. */
  roomNames: number[];
  /** Row-major: -1, or an index into `OBJECTS` for a square nobody can stand on. */
  objects: number[];
  /** Per person, their statements. Person 0 is the victim; persons 1..size-1 are the suspects. */
  clues: Clue[][];
  /** Per person: the cell they stood on. */
  solution: number[];
  /** The only suspect in the victim's room. */
  culprit: number;
  variant: string;
  seed: number;
}

export const VARIANTS: { id: string; label: string }[] = [
  { id: '5', label: '5×5' },
  { id: '6', label: '6×6' },
  { id: '7', label: '7×7' },
  { id: '8', label: '8×8' },
  { id: '9', label: '9×9' },
];
export const DEFAULT_VARIANT = '6';

export const VICTIM = 0;
/** Suspect names: person i is `NAMES[i - 1]`. Their initials are all different. */
export const NAMES = ['Ana', 'Bruno', 'Carla', 'Dani', 'Elsa', 'Fidel', 'Gala', 'Hugo'];
/** English room names (translated when shown). */
export const ROOM_NAMES = [
  'the kitchen',
  'the lounge',
  'the library',
  'the study',
  'the bedroom',
  'the bathroom',
  'the hall',
  'the garage',
  'the pantry',
  'the dining room',
  'the cellar',
  'the attic',
];
export const OBJECTS: { name: string; icon: string }[] = [
  { name: 'a plant', icon: '🌿' },
  { name: 'a TV', icon: '📺' },
  { name: 'a piano', icon: '🎹' },
  { name: 'a bookcase', icon: '📚' },
  { name: 'a bathtub', icon: '🛁' },
  { name: 'a fireplace', icon: '🔥' },
  { name: 'a vase', icon: '🏺' },
  { name: 'a clock', icon: '⏰' },
];

/** Technique levels reported by `solveLogic`. */
export const PLAIN = 0;
export const LOOKAHEAD = 1;

type Layout = Pick<AlibiPuzzle, 'size' | 'rooms' | 'objects'>;

/** Object types in the squares beside `cell` (sharing a side, same room). */
function besideObjects(p: Layout, cell: number): number[] {
  const n = p.size;
  const r = Math.floor(cell / n);
  const c = cell % n;
  const out: number[] = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const r2 = r + dr;
    const c2 = c + dc;
    if (r2 < 0 || c2 < 0 || r2 >= n || c2 >= n) continue;
    const j = r2 * n + c2;
    if (p.objects[j] >= 0 && p.rooms[j] === p.rooms[cell]) out.push(p.objects[j]);
  }
  return out;
}

/** Whether a statement that only involves the person's own square holds there. Null for the other kinds. */
function unaryHolds(p: Layout, clue: Clue, cell: number): boolean | null {
  const n = p.size;
  const r = Math.floor(cell / n);
  const c = cell % n;
  switch (clue.kind) {
    case 'room':
      return p.rooms[cell] === clue.room;
    case 'beside':
      return besideObjects(p, cell).includes(clue.object);
    case 'clear':
      return besideObjects(p, cell).length === 0;
    case 'row':
      return p.objects.some((o, i) => o === clue.object && Math.floor(i / n) === r);
    case 'col':
      return p.objects.some((o, i) => o === clue.object && i % n === c);
    case 'outer':
      return r === 0 || c === 0 || r === n - 1 || c === n - 1;
    default:
      return null;
  }
}

/**
 * Independent rule checker: everyone on a free square, one person per row and column, every statement true,
 * and exactly one suspect (the culprit) in the victim's room.
 */
export function validate(p: AlibiPuzzle, pos: number[]): boolean {
  const n = p.size;
  if (pos.length !== n || p.clues.length !== n) return false;
  if (pos.some((i) => !Number.isInteger(i) || i < 0 || i >= n * n || p.objects[i] >= 0)) return false;
  const row = (i: number) => Math.floor(i / n);
  const col = (i: number) => i % n;
  if (new Set(pos.map(row)).size !== n || new Set(pos.map(col)).size !== n) return false;
  const roomOf = (who: number) => p.rooms[pos[who]];
  for (let who = 0; who < n; who++) {
    for (const clue of p.clues[who]) {
      const here = pos[who];
      const unary = unaryHolds(p, clue, here);
      if (unary === false) return false;
      if (unary === true) continue;
      if (clue.kind === 'alone') {
        if (pos.some((_, q) => q !== who && roomOf(q) === roomOf(who))) return false;
        continue;
      }
      if (!('other' in clue) || clue.other === who || clue.other < 0 || clue.other >= n) return false;
      const there = pos[clue.other];
      const ok =
        clue.kind === 'with'
          ? p.rooms[here] === p.rooms[there]
          : clue.kind === 'diag'
            ? Math.abs(row(here) - row(there)) === 1 && Math.abs(col(here) - col(there)) === 1
            : clue.kind === 'above'
              ? row(here) < row(there)
              : clue.kind === 'below'
                ? row(here) > row(there)
                : clue.kind === 'left'
                  ? col(here) < col(there)
                  : col(here) > col(there);
      if (!ok) return false;
    }
  }
  const company = pos.flatMap((_, q) => (q !== VICTIM && roomOf(q) === roomOf(VICTIM) ? [q] : []));
  return company.length === 1 && company[0] === p.culprit;
}

/**
 * Solver model. Sets of cells are bitsets of `W` 32-bit words. `start` holds each person's cells after their own
 * one-person statements; `allow[(a * P + b) * C + cell]` is where b may stand when a stands on `cell`.
 */
interface Model {
  n: number;
  P: number;
  C: number;
  W: number;
  layout: Layout;
  roomBits: Int32Array;
  lineBits: Int32Array;
  start: Int32Array;
  allow: Int32Array;
}

/** The part of the model that depends only on the house, shared by every set of statements tried on it. */
interface Base {
  layout: Layout;
  W: number;
  roomBits: Int32Array;
  /** Rows first, then columns. */
  lineBits: Int32Array;
  /** Per cell: the free cells in another row and column. */
  apart: Int32Array;
}

function makeBase(layout: Layout): Base {
  const n = layout.size;
  const C = n * n;
  const W = Math.ceil(C / 32);
  const set = (a: Int32Array, at: number, cell: number) => (a[at * W + (cell >> 5)] |= 1 << (cell & 31));
  const roomBits = new Int32Array((Math.max(...layout.rooms) + 1) * W);
  const lineBits = new Int32Array(2 * n * W);
  const apart = new Int32Array(C * W);
  for (let i = 0; i < C; i++) {
    if (layout.objects[i] >= 0) continue;
    set(roomBits, layout.rooms[i], i);
    set(lineBits, Math.floor(i / n), i);
    set(lineBits, n + (i % n), i);
    for (let j = 0; j < C; j++) {
      if (Math.floor(j / n) !== Math.floor(i / n) && j % n !== i % n) set(apart, j, i);
    }
  }
  return { layout, W, roomBits, lineBits, apart };
}

const MIRROR: Record<string, string> = { with: 'with', apart: 'apart', diag: 'diag', above: 'below', below: 'above', left: 'right', right: 'left' };

function buildModel(base: Base, clues: Clue[][]): Model {
  const { layout, W, roomBits, lineBits, apart } = base;
  const n = layout.size;
  const P = n;
  const C = n * n;

  const start = new Int32Array(P * W);
  for (let a = 0; a < P; a++) {
    for (let i = 0; i < C; i++) {
      if (layout.objects[i] < 0 && clues[a].every((clue) => unaryHolds(layout, clue, i) !== false)) {
        start[a * W + (i >> 5)] |= 1 << (i & 31);
      }
    }
  }

  // Whether the other may be on cell j when I am on `cell`, for each kind of two-person statement.
  const rel = (kind: string, cell: number, j: number): boolean => {
    const dr = Math.floor(j / n) - Math.floor(cell / n);
    const dc = (j % n) - (cell % n);
    switch (kind) {
      case 'with':
        return layout.rooms[j] === layout.rooms[cell];
      case 'apart':
        return layout.rooms[j] !== layout.rooms[cell];
      case 'diag':
        return Math.abs(dr) === 1 && Math.abs(dc) === 1;
      case 'above':
        return dr > 0;
      case 'below':
        return dr < 0;
      case 'left':
        return dc > 0;
      default:
        return dc < 0;
    }
  };

  // Everyone stands in a different row and column.
  const allow = new Int32Array(P * P * C * W);
  for (let pair = 0; pair < P * P; pair++) allow.set(apart, pair * C * W);
  const restrict = (a: number, b: number, kind: string) => {
    for (let i = 0; i < C; i++) {
      const at = ((a * P + b) * C + i) * W;
      for (let j = 0; j < C; j++) if (!rel(kind, i, j)) allow[at + (j >> 5)] &= ~(1 << (j & 31));
    }
  };
  clues.forEach((list, a) => {
    for (const clue of list) {
      if (clue.kind === 'alone') {
        for (let b = 0; b < P; b++) {
          if (b === a) continue;
          restrict(a, b, 'apart');
          restrict(b, a, 'apart');
        }
      } else if ('other' in clue) {
        restrict(a, clue.other, clue.kind);
        restrict(clue.other, a, MIRROR[clue.kind]);
      }
    }
  });

  return { n, P, C, W, layout, roomBits, lineBits, start, allow };
}

const sizeOf = (d: Int32Array, from: number, W: number): number => {
  let count = 0;
  for (let k = 0; k < W; k++) for (let m = d[from + k]; m; m &= m - 1) count++;
  return count;
};

/** The only cell of a one-cell set. */
const onlyCell = (d: Int32Array, from: number, W: number): number => {
  for (let k = 0; k < W; k++) if (d[from + k]) return k * 32 + 31 - Math.clz32(d[from + k] & -d[from + k]);
  return -1;
};

/**
 * Plain deductions, run until nothing changes: a square is out for someone if it leaves another person nowhere to
 * stand; a row or column only one person can reach is theirs; and the victim's room holds exactly one suspect.
 * Returns false on a contradiction.
 */
function propagate(m: Model, d: Int32Array): boolean {
  const { P, C, W, allow, roomBits, lineBits, n } = m;
  for (let changed = true; changed; ) {
    changed = false;

    for (let a = 0; a < P; a++) {
      let left = 0;
      for (let k = 0; k < W; k++) {
        for (let bits = d[a * W + k]; bits; bits &= bits - 1) {
          const cell = k * 32 + 31 - Math.clz32(bits & -bits);
          let ok = true;
          for (let b = 0; b < P && ok; b++) {
            if (b === a) continue;
            const at = ((a * P + b) * C + cell) * W;
            let support = 0;
            for (let j = 0; j < W; j++) support |= allow[at + j] & d[b * W + j];
            ok = support !== 0;
          }
          if (ok) left++;
          else {
            d[a * W + k] &= ~(bits & -bits);
            changed = true;
          }
        }
      }
      if (!left) return false;
    }

    for (let line = 0; line < 2 * n; line++) {
      let who = -1;
      let count = 0;
      for (let a = 0; a < P; a++) {
        let hit = 0;
        for (let k = 0; k < W; k++) hit |= d[a * W + k] & lineBits[line * W + k];
        if (hit) {
          who = a;
          count++;
        }
      }
      if (!count) return false;
      if (count > 1) continue;
      for (let k = 0; k < W; k++) {
        const kept = d[who * W + k] & lineBits[line * W + k];
        if (kept !== d[who * W + k]) {
          d[who * W + k] = kept;
          changed = true;
        }
      }
    }

    // Per room: who could be in it and who certainly is.
    let room = -1;
    let oneRoom = true;
    let left = 0;
    for (let k = 0; k < W; k++) {
      for (let bits = d[k]; bits; bits &= bits - 1) {
        const cell = k * 32 + 31 - Math.clz32(bits & -bits);
        const g = m.layout.rooms[cell];
        let possible = 0;
        let certain = 0;
        for (let b = 1; b < P; b++) {
          const at = (b * C + cell) * W;
          let inside = 0;
          let outside = 0;
          for (let j = 0; j < W; j++) {
            inside |= d[b * W + j] & roomBits[g * W + j] & allow[at + j];
            outside |= d[b * W + j] & ~roomBits[g * W + j];
          }
          if (inside) possible++;
          if (!outside) certain++;
        }
        if (!possible || certain > 1) {
          d[k] &= ~(bits & -bits);
          changed = true;
          continue;
        }
        left++;
        if (room >= 0 && room !== g) oneRoom = false;
        room = g;
      }
    }
    if (!left) return false;
    if (oneRoom) {
      // The victim's room is known: its one suspect keeps the others out, or is the only one who can be there.
      const inside: number[] = [];
      const certain: number[] = [];
      for (let b = 1; b < P; b++) {
        let hit = 0;
        let outside = 0;
        for (let j = 0; j < W; j++) {
          hit |= d[b * W + j] & roomBits[room * W + j];
          outside |= d[b * W + j] & ~roomBits[room * W + j];
        }
        if (hit) inside.push(b);
        if (!outside) certain.push(b);
      }
      if (!inside.length || certain.length > 1) return false;
      for (const b of inside) {
        const stays = inside.length === 1;
        if (!stays && (certain.length !== 1 || certain[0] === b)) continue;
        for (let j = 0; j < W; j++) {
          const kept = d[b * W + j] & (stays ? roomBits[room * W + j] : ~roomBits[room * W + j]);
          if (kept !== d[b * W + j]) {
            d[b * W + j] = kept;
            changed = true;
          }
        }
        if (!sizeOf(d, b * W, W)) return false;
      }
    }
  }
  return true;
}

/** One-step lookahead: drops every square that leads the plain deductions to a contradiction. */
function probe(m: Model, d: Int32Array): boolean | null {
  const { P, W } = m;
  const copy = new Int32Array(d.length);
  let progress = false;
  for (let a = 0; a < P; a++) {
    for (let k = 0; k < W; k++) {
      for (let bits = d[a * W + k]; bits; bits &= bits - 1) {
        if (sizeOf(d, a * W, W) === 1) break;
        copy.set(d);
        for (let j = 0; j < W; j++) copy[a * W + j] = j === k ? bits & -bits : 0;
        if (!propagate(m, copy)) {
          d[a * W + k] &= ~(bits & -bits);
          progress = true;
        }
      }
    }
    if (!sizeOf(d, a * W, W)) return null;
  }
  return progress;
}

export interface LogicResult {
  solved: boolean;
  /** Per person: their cell, or -1 while undecided. */
  positions: number[];
  /** Hardest technique used. */
  level: number;
  /** Candidate squares left over, summed over the people (0 when solved). */
  open: number;
}

/** Solves by deduction only, never guessing. `maxLevel` caps the techniques used. */
export function solveLogic(p: Pick<AlibiPuzzle, 'size' | 'rooms' | 'objects' | 'clues'>, maxLevel = LOOKAHEAD): LogicResult {
  return solveWith(makeBase(p), p.clues, maxLevel);
}

function solveWith(base: Base, clues: Clue[][], maxLevel = LOOKAHEAD): LogicResult {
  const m = buildModel(base, clues);
  const { P, W } = m;
  const d = m.start.slice();
  let level = PLAIN;
  let sound = propagate(m, d);
  while (sound && maxLevel >= LOOKAHEAD) {
    let open = 0;
    for (let a = 0; a < P; a++) open += sizeOf(d, a * W, W) - 1;
    if (!open) break;
    const progress = probe(m, d);
    if (!progress) {
      sound = progress !== null;
      break;
    }
    level = LOOKAHEAD;
    sound = propagate(m, d);
  }
  const positions: number[] = [];
  let open = 0;
  for (let a = 0; a < P; a++) {
    const size = sound ? sizeOf(d, a * W, W) : 0;
    positions.push(size === 1 ? onlyCell(d, a * W, W) : -1);
    open += sound ? size - 1 : m.C;
  }
  return { solved: sound && open === 0, positions, level, open };
}

/** Counts solutions up to `limit`: the plain deductions plus backtracking, with `validate` checking every leaf. */
export function countSolutions(p: AlibiPuzzle, limit = 2): number {
  const m = buildModel(makeBase(p), p.clues);
  const { P, W } = m;
  let count = 0;
  const go = (d: Int32Array): void => {
    if (!propagate(m, d)) return;
    let best = -1;
    let bestSize = Infinity;
    for (let a = 0; a < P; a++) {
      const size = sizeOf(d, a * W, W);
      if (size > 1 && size < bestSize) [best, bestSize] = [a, size];
    }
    if (best < 0) {
      if (validate(p, Array.from({ length: P }, (_, a) => onlyCell(d, a * W, W)))) count++;
      return;
    }
    for (let k = 0; k < W && count < limit; k++) {
      for (let bits = d[best * W + k]; bits && count < limit; bits &= bits - 1) {
        const next = d.slice();
        for (let j = 0; j < W; j++) next[best * W + j] = j === k ? bits & -bits : 0;
        go(next);
      }
    }
  };
  go(m.start.slice());
  return count;
}

/** Cuts the house into rectangular rooms, always splitting one of the biggest rooms along its longer side. */
function makeRooms(n: number, rng: Rng): number[] {
  const target = n <= 6 ? n - 1 : n;
  const rects = [{ r: 0, c: 0, h: n, w: n }];
  while (rects.length < target) {
    const splittable = rects.filter((q) => q.h >= 4 || q.w >= 4).sort((a, b) => b.h * b.w - a.h * a.w);
    if (!splittable.length) break;
    const q = splittable[Math.min(splittable.length - 1, randInt(rng, 2))];
    const tall = q.h >= 4 && (q.w < 4 || q.h > q.w || (q.h === q.w && rng() < 0.5));
    const cut = 2 + randInt(rng, (tall ? q.h : q.w) - 3);
    rects.splice(rects.indexOf(q), 1);
    if (tall) rects.push({ ...q, h: cut }, { ...q, r: q.r + cut, h: q.h - cut });
    else rects.push({ ...q, w: cut }, { ...q, c: q.c + cut, w: q.w - cut });
  }
  // Number the rooms in reading order of their top-left corners.
  rects.sort((a, b) => a.r - b.r || a.c - b.c);
  const rooms = new Array<number>(n * n).fill(0);
  rects.forEach((q, g) => {
    for (let r = q.r; r < q.r + q.h; r++) for (let c = q.c; c < q.c + q.w; c++) rooms[r * n + c] = g;
  });
  return rooms;
}

/** Scatters objects of a few types, never more than two in a line so every row and column keeps room to stand. */
function makeObjects(n: number, rng: Rng): number[] {
  const types = shuffle(rng, OBJECTS.map((_, i) => i)).slice(0, n <= 6 ? 3 : 4);
  const objects = new Array<number>(n * n).fill(-1);
  const perLine = new Array<number>(2 * n).fill(0);
  let placed = 0;
  for (const cell of shuffle(rng, objects.map((_, i) => i))) {
    if (placed >= Math.round(n * 1.4)) break;
    const r = Math.floor(cell / n);
    const c = cell % n;
    if (perLine[r] >= 2 || perLine[n + c] >= 2) continue;
    perLine[r]++;
    perLine[n + c]++;
    objects[cell] = types[placed++ % types.length];
  }
  return objects;
}

/** A random placement, one person per row and column on free squares, with a victim who has one room-mate. */
function makeSolution(layout: Layout, rng: Rng): { solution: number[]; culprit: number } | null {
  const n = layout.size;
  for (let attempt = 0; attempt < 40; attempt++) {
    const cols: number[] = [];
    const used = new Set<number>();
    const fill = (r: number): boolean => {
      if (r === n) return true;
      for (const c of shuffle(rng, Array.from({ length: n }, (_, i) => i))) {
        if (used.has(c) || layout.objects[r * n + c] >= 0) continue;
        used.add(c);
        cols[r] = c;
        if (fill(r + 1)) return true;
        used.delete(c);
      }
      return false;
    };
    if (!fill(0)) return null;
    const cells = cols.map((c, r) => r * n + c);
    const byRoom = new Map<number, number[]>();
    for (const cell of cells) byRoom.set(layout.rooms[cell], [...(byRoom.get(layout.rooms[cell]) ?? []), cell]);
    const pairs = [...byRoom.values()].filter((list) => list.length === 2);
    if (!pairs.length) continue;
    const scene = shuffle(rng, [...pairs[randInt(rng, pairs.length)]]);
    const others = shuffle(rng, cells.filter((cell) => !scene.includes(cell)));
    const culprit = 1 + randInt(rng, n - 1);
    const solution = [scene[0]];
    for (let who = 1; who < n; who++) solution.push(who === culprit ? scene[1] : others.pop()!);
    return { solution, culprit };
  }
  return null;
}

/** How readily each kind of statement is picked. */
const WEIGHT: Record<Clue['kind'], number> = {
  room: 1,
  beside: 3,
  clear: 1,
  row: 2,
  col: 2,
  outer: 1.5,
  alone: 2.5,
  with: 2.5,
  diag: 3,
  above: 0.6,
  below: 0.6,
  left: 0.6,
  right: 0.6,
};

/** Every true statement about one person. Nothing links the victim to a room-mate: that is for the player to find. */
function trueClues(layout: Layout, solution: number[], who: number): Clue[] {
  const n = layout.size;
  const here = solution[who];
  const out: Clue[] = [{ kind: 'room', room: layout.rooms[here] }];
  const types = [...new Set(layout.objects.filter((o) => o >= 0))];
  for (const object of types) {
    for (const kind of ['beside', 'row', 'col'] as const) {
      if (unaryHolds(layout, { kind, object }, here)) out.push({ kind, object });
    }
  }
  for (const kind of ['clear', 'outer'] as const) if (unaryHolds(layout, { kind }, here)) out.push({ kind });
  const mates = solution.filter((cell, q) => q !== who && layout.rooms[cell] === layout.rooms[here]).length;
  if (!mates) out.push({ kind: 'alone' });
  for (let other = 0; other < n; other++) {
    if (other === who) continue;
    const there = solution[other];
    const dr = Math.floor(there / n) - Math.floor(here / n);
    const dc = (there % n) - (here % n);
    if (who !== VICTIM && other !== VICTIM && layout.rooms[there] === layout.rooms[here]) out.push({ kind: 'with', other });
    if (Math.abs(dr) === 1 && Math.abs(dc) === 1) out.push({ kind: 'diag', other });
    out.push({ kind: dr > 0 ? 'above' : 'below', other }, { kind: dc > 0 ? 'left' : 'right', other });
  }
  return out;
}

/**
 * Hands out statements: one each to start with, then swaps or adds statements for whoever the solver can't place,
 * keeping a change only when it leaves fewer open squares. Returns null when that doesn't reach a solved puzzle.
 */
function chooseClues(layout: Layout, solution: number[], rng: Rng): Clue[][] | null {
  const n = layout.size;
  const base = makeBase(layout);
  const pools = solution.map((_, who) => trueClues(layout, solution, who));
  const clues: Clue[][] = solution.map(() => []);
  const maxRooms = Math.ceil(n / 3);
  const maxExtra = Math.ceil(n / 2);

  const allowed = (who: number, clue: Clue, skip?: Clue): boolean => {
    const mine = clues[who].filter((x) => x !== skip);
    if (mine.some((x) => x.kind === clue.kind)) return false;
    if (clue.kind === 'room' && clues.flat().filter((x) => x !== skip && x.kind === 'room').length >= maxRooms) return false;
    if ('other' in clue) {
      // Don't say the same thing from both sides, or two things about the same pair.
      if (mine.some((x) => 'other' in x && x.other === clue.other)) return false;
      if (clues[clue.other].some((x) => 'other' in x && x.other === who)) return false;
    }
    return true;
  };
  const draw = (who: number, skip?: Clue): Clue | null => {
    const options = pools[who].filter((clue) => clue !== skip && allowed(who, clue, skip));
    let roll = rng() * options.reduce((sum, clue) => sum + WEIGHT[clue.kind], 0);
    for (const clue of options) {
      roll -= WEIGHT[clue.kind];
      if (roll < 0) return clue;
    }
    return options[options.length - 1] ?? null;
  };

  for (const who of shuffle(rng, solution.map((_, i) => i))) {
    const clue = draw(who);
    if (!clue) return null;
    clues[who].push(clue);
  }

  let res = solveWith(base, clues);
  for (let step = 0; step < 14 * n && !res.solved; step++) {
    const stuck = res.positions.flatMap((cell, who) => (cell < 0 ? [who] : []));
    const who = stuck[randInt(rng, stuck.length)];
    const extra = clues.reduce((sum, list) => sum + list.length - 1, 0);
    const before = clues[who].slice();
    if (clues[who].length < 2 && extra < maxExtra && rng() < 0.4) {
      const clue = draw(who);
      if (!clue) continue;
      clues[who].push(clue);
    } else {
      const at = randInt(rng, clues[who].length);
      const clue = draw(who, clues[who][at]);
      if (!clue) continue;
      clues[who][at] = clue;
    }
    const next = solveWith(base, clues);
    if (next.open < res.open) res = next;
    else clues[who] = before;
  }
  if (!res.solved) return null;

  // Take back second statements that turned out not to be needed.
  for (const who of shuffle(rng, solution.map((_, i) => i))) {
    for (let at = clues[who].length - 1; at >= 0 && clues[who].length > 1; at--) {
      const before = clues[who].slice();
      clues[who].splice(at, 1);
      if (!solveWith(base, clues).solved) clues[who] = before;
    }
  }
  return clues;
}

export function generate(variant: string, seed: number): AlibiPuzzle {
  const id = VARIANTS.some((v) => v.id === variant) ? variant : DEFAULT_VARIANT;
  const n = Number(id);
  const rng = mulberry32(seed);
  for (;;) {
    const rooms = makeRooms(n, rng);
    const roomCount = Math.max(...rooms) + 1;
    const layout: Layout = { size: n, rooms, objects: makeObjects(n, rng) };
    const placed = makeSolution(layout, rng);
    if (!placed) continue;
    const clues = chooseClues(layout, placed.solution, rng);
    if (!clues) continue;
    return {
      ...layout,
      roomNames: shuffle(rng, ROOM_NAMES.map((_, i) => i)).slice(0, roomCount),
      clues,
      solution: placed.solution,
      culprit: placed.culprit,
      variant: id,
      seed,
    };
  }
}
