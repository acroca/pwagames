import { describe, expect, it } from 'vitest';
import {
  countSolutions,
  deduceCandidates,
  DEFAULT_VARIANT,
  generate,
  solveLogic,
  validate,
  VARIANTS,
  type FutoshikiClues,
} from './logic';

const empty = (size: number, ineqs: { a: number; b: number }[] = []): FutoshikiClues => ({
  size,
  givens: new Array<number>(size * size).fill(0),
  ineqs,
});
const mask = (...values: number[]) => values.reduce((m, v) => m | (1 << (v - 1)), 0);

describe('generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('5', 42)).toEqual(generate('5', 42));
    expect(generate('6', 7)).toEqual(generate('6', 7));
    expect(generate('5', 1)).not.toEqual(generate('5', 2));
  });

  it('exposes the variants', () => {
    expect(VARIANTS.map((v) => v.id)).toEqual(['5', '6']);
    expect(VARIANTS.some((v) => v.id === DEFAULT_VARIANT)).toBe(true);
  });

  for (const { id } of VARIANTS) {
    it(`variant ${id}: unique, logic-solvable, consistent clues`, () => {
      const n = Number(id);
      for (let seed = 1; seed <= 10; seed++) {
        const p = generate(id, seed);
        expect(p.size).toBe(n);
        expect(p.variant).toBe(id);
        expect(p.seed).toBe(seed);
        expect(p.givens).toHaveLength(n * n);
        expect(countSolutions(p)).toBe(1);
        expect(validate(p, p.solution)).toBe(true);
        expect(solveLogic(p)).toEqual({ solved: true, grid: p.solution });
        p.givens.forEach((v, i) => v && expect(v).toBe(p.solution[i]));
        for (const { a, b } of p.ineqs) {
          const adjacent = (Math.abs(a - b) === 1 && Math.floor(a / n) === Math.floor(b / n)) || Math.abs(a - b) === n;
          expect(adjacent).toBe(true);
          expect(p.solution[a]).toBeLessThan(p.solution[b]);
        }
        const pairs = 2 * n * (n - 1);
        expect(p.ineqs.length).toBeGreaterThanOrEqual(pairs / 4);
        expect(p.ineqs.length).toBeLessThanOrEqual(pairs / 3);
        expect(p.givens.filter(Boolean).length).toBeLessThanOrEqual(4);
        expect(JSON.parse(JSON.stringify(p))).toEqual(p);
      }
    }, 60_000);
  }
});

describe('countSolutions', () => {
  it('counts ambiguous puzzles up to the limit', () => {
    expect(countSolutions(empty(3))).toBe(2);
    expect(countSolutions(empty(3), 100)).toBe(12);
    // First row and column fixed to 1..4: the 4 reduced Latin squares of order 4 remain.
    const reduced = empty(4, [0, 1, 2].flatMap((k) => [{ a: k, b: k + 1 }, { a: k * 4, b: k * 4 + 4 }]));
    expect(countSolutions(reduced)).toBe(2);
    expect(countSolutions(reduced, 100)).toBe(4);
  });

  it('reports 0 for contradictory puzzles', () => {
    expect(countSolutions(empty(3, [{ a: 0, b: 1 }, { a: 1, b: 0 }]))).toBe(0);
    const p = empty(3);
    p.givens[0] = 1;
    p.givens[1] = 1;
    expect(countSolutions(p)).toBe(0);
  });
});

describe('validate', () => {
  const p = generate('5', 3);
  const broken = (edit: (g: number[]) => void) => {
    const g = [...p.solution];
    edit(g);
    return g;
  };

  it('accepts the solution', () => expect(validate(p, p.solution)).toBe(true));

  it('rejects incomplete or out-of-range grids', () => {
    expect(validate(p, broken((g) => (g[7] = 0)))).toBe(false);
    expect(validate(p, broken((g) => (g[7] = 6)))).toBe(false);
    expect(validate(p, p.solution.slice(1))).toBe(false);
  });

  it('rejects duplicates in a row', () => {
    const q = { ...empty(3) };
    expect(validate(q, [1, 2, 3, 2, 3, 1, 3, 1, 2])).toBe(true);
    expect(validate(q, [1, 1, 3, 2, 3, 1, 3, 2, 2])).toBe(false);
  });

  it('rejects duplicates in a column', () => {
    expect(validate(empty(3), [1, 2, 3, 1, 3, 2, 3, 1, 2])).toBe(false);
  });

  it('rejects violated inequalities', () => {
    const q = empty(3, [{ a: 0, b: 1 }]);
    expect(validate(q, [1, 2, 3, 2, 3, 1, 3, 1, 2])).toBe(true);
    expect(validate(q, [2, 1, 3, 3, 2, 1, 1, 3, 2])).toBe(false);
  });

  it('rejects grids contradicting a given', () => {
    const q = empty(3);
    q.givens[4] = 2;
    expect(validate(q, [1, 2, 3, 2, 3, 1, 3, 1, 2])).toBe(false);
    q.givens[4] = 3;
    expect(validate(q, [1, 2, 3, 2, 3, 1, 3, 1, 2])).toBe(true);
  });
});

describe('logic solver', () => {
  it('propagates bounds along inequality chains', () => {
    const c = deduceCandidates(empty(5, [{ a: 0, b: 1 }, { a: 1, b: 2 }]), false)!;
    expect(c.slice(0, 3)).toEqual([mask(1, 2, 3), mask(2, 3, 4), mask(3, 4, 5)]);
  });

  it('solves a full chain through a column', () => {
    const { solved, grid } = solveLogic(empty(5, [0, 5, 10, 15].map((a) => ({ a: a + 5, b: a }))));
    expect(solved).toBe(false);
    expect([0, 5, 10, 15, 20].map((i) => grid[i])).toEqual([5, 4, 3, 2, 1]);
  });

  it('bounds a cell by several distinct greater cells of its row', () => {
    const p = empty(4, [{ a: 1, b: 0 }, { a: 1, b: 2 }]);
    expect(deduceCandidates(p, false)![1]).toBe(mask(1, 2, 3));
    expect(deduceCandidates(p)![1]).toBe(mask(1, 2));
  });

  it('applies naked pairs', () => {
    const p = empty(4);
    [p.givens[4], p.givens[5], p.givens[8], p.givens[9]] = [3, 4, 4, 3];
    expect(deduceCandidates(p, false)![2]).toBe(mask(1, 2, 3, 4));
    expect(deduceCandidates(p)![2]).toBe(mask(3, 4));
  });

  it('applies naked triples', () => {
    const p = empty(5);
    [p.givens[5], p.givens[6], p.givens[10], p.givens[11], p.givens[17], p.givens[22]] = [4, 5, 5, 4, 4, 5];
    expect(deduceCandidates(p, false)![3]).toBe(mask(1, 2, 3, 4, 5));
    expect(deduceCandidates(p)![3]).toBe(mask(4, 5));
  });

  it('applies hidden singles', () => {
    const p = empty(4);
    [p.givens[4], p.givens[9], p.givens[14]] = [1, 1, 1];
    expect(deduceCandidates(p, false)![3]).toBe(mask(1));
  });

  it('detects contradictions', () => {
    expect(deduceCandidates(empty(3, [{ a: 0, b: 1 }, { a: 1, b: 0 }]))).toBeNull();
    expect(solveLogic(empty(3, [{ a: 0, b: 1 }, { a: 1, b: 0 }])).solved).toBe(false);
  });
});
