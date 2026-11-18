import { mulberry32, randInt, shuffle, type Rng } from '../../core/rng';

/** Someone a clue talks about: a person by name, or whoever has an item of a category. */
export type Entity = { person: number } | { cat: number; item: number };

/**
 * One clue.
 *
 * - `same`: `a` and `b` are the same person ("Ana has a dog", "Whoever has a dog plays tennis").
 * - `diff`: they are different people.
 * - `either`: `a` has one of the two items of category `cat`.
 * - `older` / `younger`: `a` is older / younger than `b`.
 * - `older1` / `younger1`: `a` is exactly one year older / younger than `b`.
 */
export type Clue =
  | { kind: 'same' | 'diff' | 'older' | 'younger' | 'older1' | 'younger1'; a: Entity; b: Entity }
  | { kind: 'either'; a: Entity; cat: number; items: [number, number] };

export interface GridCategory {
  /** Index into `CATEGORIES`. */
  type: number;
  /** The items in row order: indices into the category's items, or the ages themselves (ascending) for `AGES`. */
  items: number[];
}

export interface LogicGridPuzzle {
  /** Number of people, and of items in every category. */
  size: number;
  /** Per person: index into `NAMES`. */
  names: number[];
  cats: GridCategory[];
  clues: Clue[];
  /** Per category, per person: the position (in `cats[k].items`) of the item that person has. */
  solution: number[][];
  variant: string;
  seed: number;
}

/** Variant ids are `<people>x<categories>`; the labels give the board as columns × rows. */
export const VARIANTS: { id: string; label: string }[] = [
  { id: '5x1', label: '5×5' },
  { id: '4x2', label: '4×8' },
  { id: '5x2', label: '5×10' },
  { id: '4x3', label: '4×12' },
];
export const DEFAULT_VARIANT = '4x2';

export const NAMES = ['Ana', 'Bruno', 'Carla', 'Dani', 'Elsa', 'Fidel', 'Gala', 'Hugo'];

export interface CategoryDef {
  /** English sentence parts (translated when shown): "has {x}" and "doesn't have {x}". */
  pos: string;
  neg: string;
  /** `label` names the row; `phrase` fills `{x}`. */
  items: { label: string; phrase: string; icon: string }[];
}

/** Index of the ages category in `CATEGORIES`. Its items are numbers, and it is the only one with an order. */
export const AGES = 0;
export const CATEGORIES: CategoryDef[] = [
  { pos: 'is {x}', neg: "isn't {x}", items: [] },
  {
    pos: 'has {x}',
    neg: "doesn't have {x}",
    items: [
      { label: 'Dog', phrase: 'a dog', icon: '🐶' },
      { label: 'Cat', phrase: 'a cat', icon: '🐱' },
      { label: 'Rabbit', phrase: 'a rabbit', icon: '🐰' },
      { label: 'Parrot', phrase: 'a parrot', icon: '🦜' },
      { label: 'Turtle', phrase: 'a turtle', icon: '🐢' },
      { label: 'Hamster', phrase: 'a hamster', icon: '🐹' },
    ],
  },
  {
    pos: 'plays {x}',
    neg: "doesn't play {x}",
    items: [
      { label: 'Football', phrase: 'football', icon: '⚽' },
      { label: 'Basketball', phrase: 'basketball', icon: '🏀' },
      { label: 'Tennis', phrase: 'tennis', icon: '🎾' },
      { label: 'Volleyball', phrase: 'volleyball', icon: '🏐' },
      { label: 'Rugby', phrase: 'rugby', icon: '🏉' },
      { label: 'Baseball', phrase: 'baseball', icon: '⚾' },
    ],
  },
  {
    pos: 'brought {x}',
    neg: "didn't bring {x}",
    items: [
      { label: 'Apples', phrase: 'apples', icon: '🍎' },
      { label: 'Bananas', phrase: 'bananas', icon: '🍌' },
      { label: 'Strawberries', phrase: 'strawberries', icon: '🍓' },
      { label: 'Grapes', phrase: 'grapes', icon: '🍇' },
      { label: 'Oranges', phrase: 'oranges', icon: '🍊' },
      { label: 'Pears', phrase: 'pears', icon: '🍐' },
    ],
  },
  {
    pos: 'wears {x}',
    neg: "doesn't wear {x}",
    items: [
      { label: 'Red', phrase: 'red', icon: '🔴' },
      { label: 'Blue', phrase: 'blue', icon: '🔵' },
      { label: 'Green', phrase: 'green', icon: '🟢' },
      { label: 'Yellow', phrase: 'yellow', icon: '🟡' },
      { label: 'Purple', phrase: 'purple', icon: '🟣' },
      { label: 'Orange', phrase: 'orange', icon: '🟠' },
    ],
  },
  {
    pos: 'travels {x}',
    neg: "doesn't travel {x}",
    items: [
      { label: 'Bike', phrase: 'by bike', icon: '🚲' },
      { label: 'Bus', phrase: 'by bus', icon: '🚌' },
      { label: 'Car', phrase: 'by car', icon: '🚗' },
      { label: 'Train', phrase: 'by train', icon: '🚆' },
      { label: 'Walking', phrase: 'on foot', icon: '🚶' },
      { label: 'Scooter', phrase: 'by scooter', icon: '🛴' },
    ],
  },
];

type Shape = Pick<LogicGridPuzzle, 'size' | 'cats'>;

const key = (e: Entity): string => ('person' in e ? `p${e.person}` : `${e.cat}:${e.item}`);
const isPerson = (e: Entity): e is { person: number } => 'person' in e;
const ageCat = (p: Shape): number => p.cats.findIndex((c) => c.type === AGES);

/** Whether an age difference (a's minus b's) fits the clue. */
function ageFits(kind: Clue['kind'], diff: number): boolean {
  return kind === 'older' ? diff > 0 : kind === 'younger' ? diff < 0 : kind === 'older1' ? diff === 1 : diff === -1;
}

/**
 * Independent rule checker: every category hands each of its items to a different person, and every clue is true.
 */
export function validate(p: Pick<LogicGridPuzzle, 'size' | 'cats' | 'clues'>, sol: number[][]): boolean {
  const n = p.size;
  if (sol.length !== p.cats.length) return false;
  for (const row of sol) {
    if (row.length !== n || row.some((i) => !Number.isInteger(i) || i < 0 || i >= n) || new Set(row).size !== n) return false;
  }
  const ages = ageCat(p);
  const owner = (e: Entity): number => (isPerson(e) ? e.person : sol[e.cat].indexOf(e.item));
  for (const clue of p.clues) {
    const a = owner(clue.a);
    if (clue.kind === 'either') {
      if (!clue.items.includes(sol[clue.cat][a])) return false;
      continue;
    }
    const b = owner(clue.b);
    if (clue.kind === 'same' || clue.kind === 'diff') {
      if ((a === b) !== (clue.kind === 'same')) return false;
    } else if (ages < 0 || a === b || !ageFits(clue.kind, sol[ages][a] - sol[ages][b])) return false;
  }
  return true;
}

/** Counts solutions up to `limit` by trying every way to hand out the items, with `validate` as the judge. */
export function countSolutions(p: Pick<LogicGridPuzzle, 'size' | 'cats' | 'clues'>, limit = 2): number {
  const n = p.size;
  const sol = p.cats.map(() => new Array<number>(n).fill(-1));
  let count = 0;
  const go = (k: number, person: number, used: number): void => {
    if (count >= limit) return;
    if (k === p.cats.length) {
      if (validate(p, sol)) count++;
      return;
    }
    if (person === n) return go(k + 1, 0, 0);
    for (let i = 0; i < n; i++) {
      if (used & (1 << i)) continue;
      sol[k][person] = i;
      go(k, person + 1, used | (1 << i));
    }
  };
  go(0, 0, 0);
  return count;
}

export interface LogicResult {
  solved: boolean;
  /** Per category, per person: the item, or -1 while undecided. */
  solution: number[][];
  /** Squares still undecided (0 when solved). */
  open: number;
}

/**
 * Solves the way the player does, on the grid of people against items: `can[k][person]` is the set of items of
 * category k the person may still have. Each clue is read on its own, over and over, until nothing changes; nothing
 * is ever tried out.
 */
export function solveLogic(p: Pick<LogicGridPuzzle, 'size' | 'cats' | 'clues'>): LogicResult {
  const n = p.size;
  const K = p.cats.length;
  const all = (1 << n) - 1;
  const ages = ageCat(p);
  const can = p.cats.map(() => new Array<number>(n).fill(all));
  let changed = true;
  let sound = true;

  const single = (m: number) => m !== 0 && (m & (m - 1)) === 0;
  const drop = (k: number, person: number, items: number) => {
    if (!(can[k][person] & items)) return;
    can[k][person] &= ~items;
    changed = true;
    if (!can[k][person]) sound = false;
  };
  /** The people an entity may be. */
  const who = (e: Entity): number => {
    if (isPerson(e)) return 1 << e.person;
    let m = 0;
    for (let q = 0; q < n; q++) if (can[e.cat][q] & (1 << e.item)) m |= 1 << q;
    return m;
  };
  const restrict = (e: Entity, people: number) => {
    if (isPerson(e)) {
      if (!(people & (1 << e.person))) sound = false;
      return;
    }
    for (let q = 0; q < n; q++) if (!(people & (1 << q))) drop(e.cat, q, 1 << e.item);
  };

  /** One side of an age clue: `x` must be `kind` than `y`, who is someone else. */
  const compare = (x: Entity, y: Entity, kind: Clue['kind']) => {
    const xs = who(x);
    const ys = who(y);
    let keep = 0;
    for (let q = 0; q < n; q++) {
      if (!(xs & (1 << q))) continue;
      let fitting = 0;
      for (let i = 0; i < n; i++) {
        if (!(can[ages][q] & (1 << i))) continue;
        for (let r = 0; r < n && !(fitting & (1 << i)); r++) {
          if (r === q || !(ys & (1 << r))) continue;
          for (let j = 0; j < n; j++) {
            if (can[ages][r] & (1 << j) && ageFits(kind, i - j)) {
              fitting |= 1 << i;
              break;
            }
          }
        }
      }
      if (fitting) keep |= 1 << q;
      if (xs === 1 << q) drop(ages, q, can[ages][q] & ~fitting);
    }
    restrict(x, keep);
  };
  const MIRROR = { older: 'younger', younger: 'older', older1: 'younger1', younger1: 'older1' } as const;

  while (changed && sound) {
    changed = false;

    // An item nobody else can have, and a person with one item left.
    for (let k = 0; k < K; k++) {
      for (let q = 0; q < n; q++) {
        if (!single(can[k][q])) continue;
        for (let r = 0; r < n; r++) if (r !== q) drop(k, r, can[k][q]);
      }
      for (let i = 0; i < n; i++) {
        const people = who({ cat: k, item: i });
        if (!people) sound = false;
        else if (single(people)) drop(k, 31 - Math.clz32(people), all & ~(1 << i));
      }
    }

    for (const clue of p.clues) {
      if (!sound) break;
      const as = who(clue.a);
      if (clue.kind === 'either') {
        const pair = (1 << clue.items[0]) | (1 << clue.items[1]);
        let keep = 0;
        for (let q = 0; q < n; q++) if (as & (1 << q) && can[clue.cat][q] & pair) keep |= 1 << q;
        restrict(clue.a, keep);
        if (single(keep)) drop(clue.cat, 31 - Math.clz32(keep), all & ~pair);
        continue;
      }
      const bs = who(clue.b);
      if (clue.kind === 'same') {
        restrict(clue.a, as & bs);
        restrict(clue.b, as & bs);
      } else if (clue.kind === 'diff') {
        if (single(as)) restrict(clue.b, bs & ~as);
        if (single(bs)) restrict(clue.a, as & ~bs);
      } else if (ages < 0) sound = false;
      else {
        compare(clue.a, clue.b, clue.kind);
        compare(clue.b, clue.a, MIRROR[clue.kind]);
      }
    }
  }

  let open = 0;
  const solution = can.map((row) =>
    row.map((m) => {
      if (!sound || !single(m)) {
        for (let rest = sound ? m & (m - 1) : all; rest; rest &= rest - 1) open++;
        return -1;
      }
      return 31 - Math.clz32(m);
    }),
  );
  return { solved: sound && open === 0, solution, open };
}

/** How readily each sort of clue is picked. `given` is a `same` that simply names a person and their item. */
const WEIGHT = { given: 0.25, link: 2.5, not: 1.2, unlink: 1, either: 1.4, age: 2.2, age1: 1.6 };
type Sort = keyof typeof WEIGHT;

const sortOf = (clue: Clue): Sort => {
  if (clue.kind === 'either') return 'either';
  if (clue.kind === 'same') return isPerson(clue.a) ? 'given' : 'link';
  if (clue.kind === 'diff') return isPerson(clue.a) ? 'not' : 'unlink';
  return clue.kind === 'older' || clue.kind === 'younger' ? 'age' : 'age1';
};

/** Every true clue worth saying. A named person always comes first in `same` and `diff`. */
function trueClues(p: Shape, sol: number[][], rng: Rng): Clue[] {
  const n = p.size;
  const K = p.cats.length;
  const ages = ageCat(p);
  const out: Clue[] = [];
  const owner = (e: Entity): number => (isPerson(e) ? e.person : sol[e.cat].indexOf(e.item));
  const people: Entity[] = Array.from({ length: n }, (_, person) => ({ person }));
  const items = (k: number): Entity[] => Array.from({ length: n }, (_, item) => ({ cat: k, item }));

  for (let k = 0; k < K; k++) {
    // Subjects: the people, and the items of the categories listed before this one.
    const subjects = [...people];
    for (let j = 0; j < k; j++) subjects.push(...items(j));
    for (const a of subjects) {
      for (const b of items(k)) out.push({ kind: owner(a) === owner(b) ? 'same' : 'diff', a, b });
    }
    if (k === ages || n < 4) continue;
    const anyone = [...people];
    for (let j = 0; j < K; j++) if (j !== k) anyone.push(...items(j));
    for (const a of anyone) {
      const mine = sol[k][owner(a)];
      for (let other = 0; other < n; other++) {
        if (other !== mine) out.push({ kind: 'either', a, cat: k, items: rng() < 0.5 ? [mine, other] : [other, mine] });
      }
    }
  }

  if (ages >= 0) {
    const anyone = [...people];
    for (let j = 0; j < K; j++) if (j !== ages) anyone.push(...items(j));
    for (const a of anyone) {
      for (const b of anyone) {
        const diff = sol[ages][owner(a)] - sol[ages][owner(b)];
        if (!diff) continue;
        out.push({ kind: diff > 0 ? 'older' : 'younger', a, b });
        if (Math.abs(diff) === 1) out.push({ kind: diff > 0 ? 'older1' : 'younger1', a, b });
      }
    }
  }
  return out;
}

/**
 * Whether a choice between two items and another clue about the same one add up to naming the answer: a second
 * choice, or a "doesn't have" for one of the two.
 */
function spoils(either: Clue, other: Clue): boolean {
  if (either.kind !== 'either' || key(either.a) !== key(other.a)) return false;
  if (other.kind === 'either') return other !== either && other.cat === either.cat;
  return other.kind === 'diff' && !isPerson(other.b) && other.b.cat === either.cat && either.items.includes(other.b.item);
}

/**
 * Picks clues: walks the true clues in a weighted random order, keeping each one that settles more squares, until
 * the solver finishes; then drops every clue the solver can do without. Returns null when too many of what is left
 * simply name someone's item.
 */
function chooseClues(p: Shape, sol: number[][], rng: Rng): Clue[] | null {
  const pool = trueClues(p, sol, rng);
  const sizes: Partial<Record<Sort, number>> = {};
  for (const clue of pool) sizes[sortOf(clue)] = (sizes[sortOf(clue)] ?? 0) + 1;
  // Each sort gets its weight as a whole, however many clues of that sort there are.
  const order = pool
    .map((clue) => ({ clue, key: -Math.log(1 - rng()) / (WEIGHT[sortOf(clue)] / sizes[sortOf(clue)]!) }))
    .sort((x, y) => x.key - y.key)
    .map((x) => x.clue);

  const maxGiven = p.cats.length === 1 ? 2 : 1;
  let clues: Clue[] = [];
  let res = solveLogic({ ...p, clues });
  for (let pass = 0; pass < 3 && !res.solved; pass++) {
    for (const clue of order) {
      if (clues.includes(clue)) continue;
      if (clues.some((c) => spoils(c, clue) || spoils(clue, c))) continue;
      const next = solveLogic({ ...p, clues: [...clues, clue] });
      if (next.open >= res.open) continue;
      clues.push(clue);
      res = next;
      if (res.solved) break;
    }
  }
  if (!res.solved) return null;

  // Try the plain givens first, so as few as possible survive.
  const givens = clues.filter((clue) => sortOf(clue) === 'given');
  for (const clue of [...shuffle(rng, givens), ...shuffle(rng, clues.filter((c) => !givens.includes(c)))]) {
    const without = clues.filter((c) => c !== clue);
    if (solveLogic({ ...p, clues: without }).solved) clues = without;
  }
  if (clues.filter((clue) => sortOf(clue) === 'given').length > maxGiven) return null;
  return shuffle(rng, clues);
}

export function generate(variant: string, seed: number): LogicGridPuzzle {
  const id = VARIANTS.some((v) => v.id === variant) ? variant : DEFAULT_VARIANT;
  const [n, K] = id.split('x').map(Number);
  const rng = mulberry32(seed);
  const range = (count: number) => Array.from({ length: count }, (_, i) => i);
  for (;;) {
    const plain = shuffle(rng, range(CATEGORIES.length).filter((type) => type !== AGES));
    // Ages come with three categories, and more often than not with two.
    const withAges = K === 3 || (K === 2 && rng() < 0.65);
    const types = withAges ? [...plain.slice(0, K - 1), AGES] : plain.slice(0, K);
    const firstAge = 5 + randInt(rng, 5);
    const cats: GridCategory[] = types.map((type) => ({
      type,
      items: type === AGES ? range(n).map((i) => firstAge + i) : shuffle(rng, range(CATEGORIES[type].items.length)).slice(0, n),
    }));
    const solution = cats.map(() => shuffle(rng, range(n)));
    const clues = chooseClues({ size: n, cats }, solution, rng);
    if (!clues) continue;
    return { size: n, names: shuffle(rng, range(NAMES.length)).slice(0, n).sort((a, b) => a - b), cats, clues, solution, variant: id, seed };
  }
}
