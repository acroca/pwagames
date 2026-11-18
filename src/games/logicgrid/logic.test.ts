import { describe, expect, it } from 'vitest';
import {
  AGES,
  CATEGORIES,
  DEFAULT_VARIANT,
  NAMES,
  VARIANTS,
  countSolutions,
  generate,
  solveLogic,
  validate,
  type Clue,
  type LogicGridPuzzle,
} from './logic';

/** Three people, with pets (category 0) and ages 6 to 8 (category 1). Person q has pet q and is 6 + q. */
const tiny = (clues: Clue[]): LogicGridPuzzle => ({
  size: 3,
  names: [0, 1, 2],
  cats: [
    { type: 1, items: [0, 1, 2] },
    { type: AGES, items: [6, 7, 8] },
  ],
  clues,
  solution: [
    [0, 1, 2],
    [0, 1, 2],
  ],
  variant: '3x2',
  seed: 0,
});

const pet = (item: number) => ({ cat: 0, item });
const UNIQUE = tiny([
  { kind: 'same', a: { person: 0 }, b: pet(0) },
  { kind: 'older1', a: pet(1), b: { person: 0 } },
  { kind: 'older', a: { person: 2 }, b: pet(1) },
]);
// Without the middle clue the pets are settled, but the ages are not.
const AMBIGUOUS = tiny([UNIQUE.clues[0], UNIQUE.clues[2]]);
// The owner of pet 0 is the youngest, so can't be older than person 2.
const IMPOSSIBLE = tiny([...UNIQUE.clues, { kind: 'older', a: pet(0), b: { person: 2 } }]);

describe('generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('4x2', 123)).toEqual(generate('4x2', 123));
    expect(generate('4x2', 123)).not.toEqual(generate('4x2', 124));
  });

  it('falls back to the default variant', () => {
    expect(generate('nope', 5).variant).toBe(DEFAULT_VARIANT);
  });

  it('has enough names and items for every variant', () => {
    const largest = Math.max(...VARIANTS.map((v) => Number(v.id.split('x')[0])));
    const most = Math.max(...VARIANTS.map((v) => Number(v.id.split('x')[1])));
    expect(NAMES.length).toBeGreaterThanOrEqual(largest);
    const plain = CATEGORIES.filter((_, type) => type !== AGES);
    expect(plain.length).toBeGreaterThanOrEqual(most);
    for (const c of plain) {
      expect(c.items.length).toBeGreaterThanOrEqual(largest);
      expect(new Set(c.items.map((i) => i.label)).size).toBe(c.items.length);
    }
  });

  for (const { id } of VARIANTS) {
    const [n, K] = id.split('x').map(Number);
    it(`produces unique ${id} puzzles that need no guessing`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const p = generate(id, seed * 7919);
        expect(p.size).toBe(n);
        expect(p.variant).toBe(id);
        expect(p.cats).toHaveLength(K);
        expect(new Set(p.names).size).toBe(n);
        expect(new Set(p.cats.map((c) => c.type)).size).toBe(K);
        for (const c of p.cats) {
          expect(new Set(c.items).size).toBe(n);
          if (c.type === AGES) expect(c.items).toEqual(c.items.map((_, i) => c.items[0] + i));
          else for (const i of c.items) expect(CATEGORIES[c.type].items[i]).toBeDefined();
        }
        // At most a couple of clues simply name someone's item.
        const given = p.clues.filter((c) => c.kind === 'same' && 'person' in c.a);
        expect(given.length).toBeLessThanOrEqual(K === 1 ? 2 : 1);
        // A choice of two is never narrowed to one by another clue about the same subject.
        for (const c of p.clues) {
          if (c.kind !== 'either') continue;
          const same = p.clues.filter((d) => d !== c && JSON.stringify(d.a) === JSON.stringify(c.a));
          expect(same.some((d) => d.kind === 'either' && d.cat === c.cat)).toBe(false);
          expect(same.some((d) => d.kind === 'diff' && 'cat' in d.b && d.b.cat === c.cat && c.items.includes(d.b.item))).toBe(false);
        }
        // No clue is redundant.
        for (const clue of p.clues) {
          expect(solveLogic({ ...p, clues: p.clues.filter((c) => c !== clue) }).solved).toBe(false);
        }
        expect(validate(p, p.solution)).toBe(true);
        expect(countSolutions(p)).toBe(1);
        const res = solveLogic(p);
        expect(res.solved).toBe(true);
        expect(res.solution).toEqual(p.solution);
      }
    });
  }
});

describe('countSolutions', () => {
  it('finds the single solution of a unique puzzle', () => {
    expect(countSolutions(UNIQUE)).toBe(1);
  });

  it('stops at the limit on an ambiguous puzzle', () => {
    expect(countSolutions(AMBIGUOUS)).toBe(2);
    expect(countSolutions(AMBIGUOUS, 9)).toBe(3);
    expect(countSolutions(AMBIGUOUS, 1)).toBe(1);
  });

  it('finds 0 solutions of an impossible puzzle', () => {
    expect(countSolutions(IMPOSSIBLE)).toBe(0);
  });
});

describe('validate', () => {
  it('accepts the solution', () => {
    expect(validate(UNIQUE, UNIQUE.solution)).toBe(true);
  });

  it('rejects a malformed answer', () => {
    expect(validate(UNIQUE, [[0, 1, 2]])).toBe(false);
    expect(validate(UNIQUE, [[0, 1, 1], [0, 1, 2]])).toBe(false);
    expect(validate(UNIQUE, [[0, 1, 3], [0, 1, 2]])).toBe(false);
  });

  it('rejects an answer that breaks a clue', () => {
    expect(validate(UNIQUE, [[1, 0, 2], [0, 1, 2]])).toBe(false);
    expect(validate(UNIQUE, [[0, 1, 2], [0, 2, 1]])).toBe(false);
  });

  it('checks each kind of clue', () => {
    const sol = UNIQUE.solution;
    const holds = (clue: Clue) => validate(tiny([clue]), sol);
    expect(holds({ kind: 'diff', a: { person: 0 }, b: pet(1) })).toBe(true);
    expect(holds({ kind: 'diff', a: { person: 0 }, b: pet(0) })).toBe(false);
    expect(holds({ kind: 'either', a: { person: 1 }, cat: 0, items: [2, 1] })).toBe(true);
    expect(holds({ kind: 'either', a: { person: 1 }, cat: 0, items: [0, 2] })).toBe(false);
    expect(holds({ kind: 'younger', a: pet(0), b: { person: 2 } })).toBe(true);
    expect(holds({ kind: 'younger1', a: pet(0), b: { person: 2 } })).toBe(false);
    expect(holds({ kind: 'older1', a: { person: 2 }, b: pet(1) })).toBe(true);
    // Nobody is older than themselves.
    expect(holds({ kind: 'older', a: { person: 2 }, b: pet(2) })).toBe(false);
  });

  it('rejects age clues when nobody has an age', () => {
    const p = { size: 3, cats: [{ type: 1, items: [0, 1, 2] }], clues: [{ kind: 'older', a: { person: 0 }, b: { person: 1 } }] as Clue[] };
    expect(validate(p, [[0, 1, 2]])).toBe(false);
  });
});

describe('solveLogic', () => {
  it('solves a unique puzzle', () => {
    expect(solveLogic(UNIQUE)).toEqual({ solved: true, solution: UNIQUE.solution, open: 0 });
  });

  it('stops where an ambiguous puzzle leaves a choice', () => {
    const res = solveLogic(AMBIGUOUS);
    expect(res.solved).toBe(false);
    expect(res.solution[0]).toEqual([0, 1, 2]);
    expect(res.solution[1][0]).toBe(-1);
    expect(res.open).toBeGreaterThan(0);
  });

  it('reports an impossible puzzle as unsolved', () => {
    expect(solveLogic(IMPOSSIBLE).solved).toBe(false);
  });

  it('leaves everything open without clues', () => {
    expect(solveLogic(tiny([])).open).toBe(12);
  });
});
