import { describe, expect, it } from 'vitest';
import {
  cageOf,
  cagePass,
  countSolutions,
  createContext,
  DEFAULT_VARIANT,
  generate,
  hiddenSingles,
  nakedSingles,
  nakedSubsets,
  opSymbol,
  solveLogic,
  validate,
  VARIANTS,
  type Cage,
  type KenKenPuzzle,
} from './logic';

const puzzleOf = (size: number, cages: Cage[], solution: number[] = []): KenKenPuzzle => ({
  size,
  cages,
  solution,
  variant: String(size),
  seed: 0,
});

const mask = (...digits: number[]) => digits.reduce((m, d) => m | (1 << (d - 1)), 0);
const freshCandidates = (size: number) => new Uint16Array(size * size).fill((1 << size) - 1);

const connected = (cells: number[], n: number) => {
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of cells) {
      const adjacent = Math.abs(j - i) === n || (Math.abs(j - i) === 1 && Math.floor(j / n) === Math.floor(i / n));
      if (adjacent && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
};

// Hand-made 4×4 puzzle with a unique, logic-solvable solution.
const SOLUTION_4 = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
const PUZZLE_4 = puzzleOf(
  4,
  [
    { cells: [0, 1], op: '+', target: 3 },
    { cells: [2, 6], op: '+', target: 4 },
    { cells: [4, 8], op: '+', target: 5 },
    { cells: [5, 9], op: '/', target: 4 },
    { cells: [3, 7], op: '-', target: 2 },
    { cells: [10, 11, 15], op: '*', target: 12 },
    { cells: [12, 13], op: '*', target: 12 },
    { cells: [14], op: '=', target: 2 },
  ],
  SOLUTION_4,
);

describe('kenken helpers', () => {
  it('has variants and a default', () => {
    expect(VARIANTS.map((v) => v.id)).toEqual(['4', '5', '6']);
    expect(VARIANTS.some((v) => v.id === DEFAULT_VARIANT)).toBe(true);
  });

  it('maps cells to cages and ops to symbols', () => {
    const owner = cageOf(PUZZLE_4);
    expect(owner).toHaveLength(16);
    expect(owner[0]).toBe(0);
    expect(owner[15]).toBe(5);
    expect(owner[14]).toBe(7);
    expect(['+', '-', '*', '/', '='].map((op) => opSymbol(op as Cage['op']))).toEqual(['+', '−', '×', '÷', '']);
  });
});

describe('kenken validate', () => {
  it('accepts the solution', () => {
    expect(validate(PUZZLE_4, SOLUTION_4)).toBe(true);
  });

  it('rejects out-of-range or incomplete grids', () => {
    expect(validate(PUZZLE_4, SOLUTION_4.slice(1))).toBe(false);
    expect(validate(PUZZLE_4, SOLUTION_4.map((v, i) => (i === 0 ? 0 : v)))).toBe(false);
    expect(validate(PUZZLE_4, SOLUTION_4.map((v, i) => (i === 0 ? 5 : v)))).toBe(false);
  });

  it('rejects repeated digits in a row', () => {
    // A single all-covering cage isolates the Latin square rules.
    const p = puzzleOf(4, [{ cells: Array.from({ length: 16 }, (_, i) => i), op: '+', target: 40 }]);
    const grid = [...SOLUTION_4];
    [grid[0], grid[4]] = [grid[4], grid[0]];
    expect(validate(p, SOLUTION_4)).toBe(true);
    expect(validate(p, grid)).toBe(false);
  });

  it('rejects repeated digits in a column', () => {
    const p = puzzleOf(4, [{ cells: Array.from({ length: 16 }, (_, i) => i), op: '+', target: 40 }]);
    const grid = [...SOLUTION_4];
    [grid[0], grid[1]] = [grid[1], grid[0]];
    expect(validate(p, grid)).toBe(false);
  });

  it('rejects a grid that misses a cage target', () => {
    // Swapping rows 0 and 1 keeps a Latin square but breaks the cages.
    const grid = [...SOLUTION_4.slice(4, 8), ...SOLUTION_4.slice(0, 4), ...SOLUTION_4.slice(8)];
    expect(validate(PUZZLE_4, grid)).toBe(false);
    const wrongOp = { ...PUZZLE_4, cages: PUZZLE_4.cages.map((c, i) => (i === 0 ? { ...c, op: '/' as const } : c)) };
    expect(validate(wrongOp, SOLUTION_4)).toBe(false);
  });

  it('rejects cages that do not partition the grid', () => {
    expect(validate({ ...PUZZLE_4, cages: PUZZLE_4.cages.slice(1) }, SOLUTION_4)).toBe(false);
    const overlap = { ...PUZZLE_4, cages: [...PUZZLE_4.cages, { cells: [14], op: '=' as const, target: 2 }] };
    expect(validate(overlap, SOLUTION_4)).toBe(false);
  });
});

describe('kenken countSolutions', () => {
  it('reports an ambiguous puzzle', () => {
    const p = puzzleOf(2, [
      { cells: [0, 1], op: '+', target: 3 },
      { cells: [2, 3], op: '+', target: 3 },
    ]);
    expect(countSolutions(p)).toBe(2);
    expect(countSolutions(p, 1)).toBe(1);
    expect(solveLogic(p).solved).toBe(false);
  });

  it('counts a unique puzzle once and an impossible one zero times', () => {
    expect(countSolutions(PUZZLE_4)).toBe(1);
    const impossible = puzzleOf(2, [
      { cells: [0, 1], op: '+', target: 4 },
      { cells: [2, 3], op: '+', target: 3 },
    ]);
    expect(countSolutions(impossible)).toBe(0);
    expect(solveLogic(impossible).solved).toBe(false);
  });
});

describe('kenken logic techniques', () => {
  it('cage propagation restricts candidates to valid assignments', () => {
    const p = puzzleOf(4, [
      { cells: [0, 1], op: '/', target: 2 },
      { cells: [4, 5], op: '-', target: 3 },
    ]);
    const cand = freshCandidates(4);
    cagePass(createContext(p), cand, false);
    expect(cand[0]).toBe(mask(1, 2, 4));
    expect(cand[1]).toBe(mask(1, 2, 4));
    expect(cand[4]).toBe(mask(1, 4));
  });

  it('cage propagation allows repeats only across different rows and columns', () => {
    // L-shaped cage: cells 1 and 4 may repeat, cells 0/1 and 0/4 may not. Only 2,1,1 sums to 4.
    const p = puzzleOf(4, [{ cells: [0, 1, 4], op: '+', target: 4 }]);
    const cand = freshCandidates(4);
    cagePass(createContext(p), cand, false);
    expect([cand[0], cand[1], cand[4]]).toEqual([mask(2), mask(1), mask(1)]);
  });

  it('eliminates digits confined to a cage from the rest of the row/column', () => {
    // 4 = 1×4 only (2×2 would repeat in the row), so 1 and 4 leave the rest of row 0.
    const p = puzzleOf(4, [{ cells: [0, 1], op: '*', target: 4 }]);
    const ctx = createContext(p);
    const cand = freshCandidates(4);
    cagePass(ctx, cand, false);
    expect(cand[2]).toBe(mask(1, 2, 3, 4));
    cagePass(ctx, cand);
    expect([cand[2], cand[3]]).toEqual([mask(2, 3), mask(2, 3)]);
    expect(cand[4]).toBe(mask(1, 2, 3, 4));
  });

  it('eliminates digits confined to a vertical cage from the rest of the column', () => {
    // 7 = 3+4 only, so 3 and 4 leave the rest of column 0.
    const p = puzzleOf(4, [{ cells: [0, 4], op: '+', target: 7 }]);
    const cand = freshCandidates(4);
    cagePass(createContext(p), cand);
    expect([cand[8], cand[12]]).toEqual([mask(1, 2), mask(1, 2)]);
    expect(cand[1]).toBe(mask(1, 2, 3, 4));
  });

  it('naked singles remove solved digits from peers', () => {
    const ctx = createContext(puzzleOf(4, []));
    const cand = freshCandidates(4);
    cand[5] = mask(3);
    expect(nakedSingles(ctx, cand)).toBe(1);
    expect(cand[4]).toBe(mask(1, 2, 4));
    expect(cand[1]).toBe(mask(1, 2, 4));
    expect(cand[0]).toBe(mask(1, 2, 3, 4));
  });

  it('hidden singles place a digit with one spot in a line', () => {
    const ctx = createContext(puzzleOf(4, []));
    const cand = freshCandidates(4);
    cand[0] = cand[1] = cand[3] = mask(1, 2, 3);
    expect(hiddenSingles(ctx, cand)).toBe(1);
    expect(cand[2]).toBe(mask(4));
  });

  it('naked pairs and triples eliminate from the rest of the line', () => {
    const ctx = createContext(puzzleOf(4, []));
    const pair = freshCandidates(4);
    pair[0] = pair[1] = mask(1, 2);
    expect(nakedSubsets(ctx, pair)).toBe(1);
    expect([pair[2], pair[3]]).toEqual([mask(3, 4), mask(3, 4)]);

    const triple = freshCandidates(4);
    triple[0] = mask(1, 2);
    triple[4] = mask(2, 3);
    triple[8] = mask(1, 3);
    nakedSubsets(ctx, triple);
    expect(triple[12]).toBe(mask(4));
    expect(triple[1]).toBe(mask(1, 2, 3, 4));
  });

  it('solves a hand-made puzzle by logic', () => {
    expect(solveLogic(PUZZLE_4)).toEqual({ solved: true, grid: SOLUTION_4 });
  });
});

describe('kenken generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('5', 42)).toEqual(generate('5', 42));
    expect(generate('5', 42)).not.toEqual(generate('5', 43));
  });

  it('rejects unknown variants', () => {
    expect(() => generate('9', 1)).toThrow();
  });

  for (const { id } of VARIANTS) {
    it(
      `produces unique, logic-solvable, well-formed ${id}×${id} puzzles`,
      () => {
        for (let seed = 1; seed <= 12; seed++) {
          const p = generate(id, seed * 104729);
          const n = Number(id);
          expect(p.size).toBe(n);
          expect(p.variant).toBe(id);
          expect(p.solution).toHaveLength(n * n);
          expect(validate(p, p.solution)).toBe(true);
          expect(countSolutions(p)).toBe(1);
          expect(solveLogic(p)).toEqual({ solved: true, grid: p.solution });
          expect(p.cages.filter((c) => c.op === '=').length).toBeLessThanOrEqual(2);
          expect(cageOf(p).every((c) => c >= 0)).toBe(true);
          for (const { cells, op, target } of p.cages) {
            expect(cells).toEqual([...cells].sort((a, b) => a - b));
            expect(connected(cells, n)).toBe(true);
            expect(cells.length).toBeLessThanOrEqual(4);
            if (op === '=') expect([cells.length, p.solution[cells[0]]]).toEqual([1, target]);
            else expect(cells.length).toBeGreaterThanOrEqual(2);
            if (op === '-' || op === '/') expect(cells).toHaveLength(2);
          }
        }
      },
      30_000,
    );
  }
});
