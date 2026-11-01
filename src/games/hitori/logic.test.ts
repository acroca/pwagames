import { describe, expect, it } from 'vitest';
import { countSolutions, DEFAULT_VARIANT, generate, type HitoriPuzzle, solveLogic, validate, VARIANTS } from './logic';

const puzzle = (size: number, numbers: number[], solution: boolean[] = []): HitoriPuzzle => ({
  size,
  numbers,
  solution,
  variant: String(size),
  seed: 0,
});

const shade = (size: number, cells: number[]): boolean[] => {
  const grid = new Array<boolean>(size * size).fill(false);
  for (const i of cells) grid[i] = true;
  return grid;
};

describe('generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('7', 42)).toEqual(generate('7', 42));
    expect(generate('7', 42).numbers).not.toEqual(generate('7', 43).numbers);
  });

  it('falls back to the default variant', () => {
    expect(generate('nope', 1).variant).toBe(DEFAULT_VARIANT);
  });

  for (const { id } of VARIANTS) {
    it(`variant ${id}: unique, logically solvable and consistent`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const p = generate(id, seed);
        const n = Number(id);
        expect(p.size).toBe(n);
        expect(p.numbers).toHaveLength(n * n);
        expect(p.numbers.every((x) => Number.isInteger(x) && x >= 1 && x <= n)).toBe(true);
        expect(p.solution).toHaveLength(n * n);
        expect(countSolutions(p)).toBe(1);
        expect(validate(p, p.solution)).toBe(true);
        expect(solveLogic(p)).toEqual({ solved: true, shaded: p.solution });
        const density = p.solution.filter(Boolean).length / (n * n);
        expect(density).toBeGreaterThan(0.15);
        expect(density).toBeLessThan(0.4);
      }
    }, 60_000);
  }
});

describe('countSolutions', () => {
  it('reports 2 for an ambiguous puzzle', () => {
    // Either (0,0) or (1,0) can be shaded.
    expect(countSolutions(puzzle(4, [2, 1, 2, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]))).toBe(2);
  });

  it('never shades numbers unique in their row and column', () => {
    // Without the convention, shading any single cell would also be valid.
    expect(countSolutions(puzzle(2, [1, 2, 2, 1]))).toBe(1);
  });
});

describe('validate', () => {
  it('accepts a valid grid', () => {
    expect(validate(puzzle(2, [1, 2, 2, 1]), shade(2, []))).toBe(true);
  });

  it('rejects a grid of the wrong size', () => {
    expect(validate(puzzle(2, [1, 2, 2, 1]), shade(3, []))).toBe(false);
  });

  it('rejects repeated unshaded numbers', () => {
    expect(validate(puzzle(2, [1, 1, 2, 3]), shade(2, []))).toBe(false);
    expect(validate(puzzle(2, [1, 2, 1, 3]), shade(2, []))).toBe(false);
  });

  it('rejects touching shaded cells', () => {
    const p = puzzle(3, [1, 1, 3, 2, 3, 1, 3, 1, 2]);
    expect(validate(p, shade(3, [1]))).toBe(true);
    expect(validate(p, shade(3, [0, 1]))).toBe(false);
  });

  it('rejects disconnected unshaded cells', () => {
    const p = puzzle(3, [1, 1, 2, 1, 2, 1, 2, 1, 1]);
    expect(validate(p, shade(3, [1, 3, 8]))).toBe(false);
  });

  it('rejects shading a number unique in its row and column', () => {
    expect(validate(puzzle(2, [1, 2, 2, 1]), shade(2, [0]))).toBe(false);
  });
});

describe('solveLogic techniques', () => {
  it('sandwich: the middle of A x A is unshaded, shading its twins', () => {
    // Row 0 is 2 1 2, so (0,1) is unshaded and the other 1 in column 1, (3,1), is shaded.
    const { solved, shaded } = solveLogic(puzzle(4, [2, 1, 2, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]));
    expect(solved).toBe(false);
    expect(shaded[13]).toBe(true);
  });

  it('adjacent pair: in A A one is shaded, so every other A in the line is shaded', () => {
    // Row 0 is 1 1 3 1: (0,3) must be shaded.
    const { shaded } = solveLogic(puzzle(4, [1, 1, 3, 1, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]));
    expect(shaded[3]).toBe(true);
  });

  it('connectivity: cells whose shading would split the unshaded area are unshaded', () => {
    // Local rules alone leave (4,0) and (4,4) undecided; connectivity finishes it.
    const numbers = [5, 1, 2, 4, 3, 5, 2, 2, 5, 2, 2, 2, 4, 3, 1, 4, 3, 2, 1, 2, 4, 4, 3, 2, 2];
    const solution = shade(5, [5, 7, 9, 11, 17, 20, 24]);
    const p = puzzle(5, numbers, solution);
    expect(countSolutions(p)).toBe(1);
    expect(solveLogic(p)).toEqual({ solved: true, shaded: solution });
  });

  it('does not guess on ambiguous puzzles', () => {
    expect(solveLogic(puzzle(4, [2, 1, 2, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3])).solved).toBe(false);
  });
});
