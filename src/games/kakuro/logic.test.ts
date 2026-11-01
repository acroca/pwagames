import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VARIANT,
  VARIANTS,
  combinations,
  countSolutions,
  generate,
  runs,
  solveLogic,
  solveRun,
  validate,
  type KakuroPuzzle,
} from './logic';

/** Builds a puzzle from a row-major solution (0 = block) by summing every run. */
function fromSolution(size: number, solution: number[]): KakuroPuzzle {
  const blocks = solution.map((d) => d === 0);
  const across = new Array<number>(size * size).fill(0);
  const down = new Array<number>(size * size).fill(0);
  for (let i = 0; i < size * size; i++) {
    if (!blocks[i]) continue;
    for (let j = i + 1; j % size !== 0 && !blocks[j]; j++) across[i] += solution[j];
    for (let j = i + size; j < size * size && !blocks[j]; j += size) down[i] += solution[j];
  }
  return { size, blocks, across, down, solution, variant: 'test', seed: 0 };
}

const runLengths = (p: KakuroPuzzle) => runs(p).map((r) => r.cells.length);

describe('combinations', () => {
  it('lists ascending distinct-digit sets', () => {
    expect(combinations(3, 2)).toEqual([[1, 2]]);
    expect(combinations(16, 2)).toEqual([[7, 9]]);
    expect(combinations(10, 4)).toEqual([[1, 2, 3, 4]]);
    expect(combinations(45, 9)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
    expect(combinations(10, 2)).toEqual([
      [1, 9],
      [2, 8],
      [3, 7],
      [4, 6],
    ]);
    expect(combinations(2, 2)).toEqual([]);
    expect(combinations(18, 2)).toEqual([]);
  });
});

describe('runs', () => {
  it('lists across and down runs with their clue cells', () => {
    const p = fromSolution(3, [0, 0, 0, 0, 1, 3, 0, 3, 1]);
    expect(runs(p)).toEqual([
      { cells: [4, 7], sum: 4, dir: 'down', clue: 1 },
      { cells: [5, 8], sum: 4, dir: 'down', clue: 2 },
      { cells: [4, 5], sum: 4, dir: 'across', clue: 3 },
      { cells: [7, 8], sum: 4, dir: 'across', clue: 6 },
    ]);
  });
});

describe('solveRun', () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('restricts to the digits of the possible combinations', () => {
    expect(solveRun(3, [all, all])).toEqual([
      [1, 2],
      [1, 2],
    ]);
    expect(solveRun(7, [all, all, all])).toEqual([
      [1, 2, 4],
      [1, 2, 4],
      [1, 2, 4],
    ]);
    // 23 in 3 is {6,8,9}; 24 would be {7,8,9}.
    expect(solveRun(23, [all, all, all])).toEqual([
      [6, 8, 9],
      [6, 8, 9],
      [6, 8, 9],
    ]);
  });

  it('keeps only digits that complete to the sum with the other cells', () => {
    expect(solveRun(10, [all, [7, 8, 9]])).toEqual([
      [1, 2, 3],
      [7, 8, 9],
    ]);
    // 9 in 3 is 1+2+6, 1+3+5 or 2+3+4; the last cell (5 or 6) rules out 2+3+4.
    expect(solveRun(9, [all, all, [5, 6]])).toEqual([
      [1, 2, 3],
      [1, 2, 3],
      [5, 6],
    ]);
  });

  it('removes a naked single from the rest of the run', () => {
    expect(solveRun(15, [[9], all])).toEqual([[9], [6]]);
  });

  it('applies naked pairs within a run', () => {
    // Cells 0 and 1 take 1 and 2 between them, so the last cell must be 12 - 3.
    expect(solveRun(12, [[1, 2], [1, 2], all])).toEqual([[1, 2], [1, 2], [9]]);
    // Likewise a naked triple: 10 in 4 is {1,2,3,4} and three cells hold 1–3.
    expect(solveRun(10, [[1, 2, 3], [1, 2, 3], all, [1, 2, 3, 9]])).toEqual([[1, 2, 3], [1, 2, 3], [4], [1, 2, 3]]);
  });

  it('finds hidden singles within a run', () => {
    // 6 in 3 is {1,2,3}; only the last cell can hold the 3.
    expect(solveRun(6, [[1, 2, 4], [1, 2, 5], all])).toEqual([[1, 2], [1, 2], [3]]);
    // 7 in 3 is {1,2,4}; only the middle cell can hold the 4.
    expect(solveRun(7, [[1, 2, 9], [1, 2, 4, 5], [1, 2]])).toEqual([[1, 2], [4], [1, 2]]);
  });

  it('reports contradictions', () => {
    expect(solveRun(4, [[2], [2]])).toBeNull();
    expect(solveRun(30, [all, all, all])).toBeNull();
  });
});

describe('solveLogic', () => {
  it('combines crossing runs through shared cells', () => {
    // Across 3 = {1,2} and down 4 = {1,3} share only the 1 in the top-left cell.
    const p = fromSolution(3, [0, 0, 0, 0, 1, 2, 0, 3, 1]);
    expect(solveLogic(p)).toEqual({ solved: true, grid: p.solution });
  });

  it('gets stuck rather than guessing on an ambiguous puzzle', () => {
    const p = fromSolution(3, [0, 0, 0, 0, 1, 2, 0, 2, 1]);
    const { solved, grid } = solveLogic(p);
    expect(solved).toBe(false);
    expect(grid).toEqual(new Array(9).fill(0));
  });
});

describe('countSolutions', () => {
  it('detects an ambiguous puzzle', () => {
    // All four runs sum to 3: 1/2 and 2/1 on the diagonal both work.
    expect(countSolutions(fromSolution(3, [0, 0, 0, 0, 1, 2, 0, 2, 1]))).toBe(2);
    expect(countSolutions(fromSolution(3, [0, 0, 0, 0, 1, 2, 0, 2, 1]), 1)).toBe(1);
  });

  it('counts a unique puzzle once', () => {
    expect(countSolutions(fromSolution(3, [0, 0, 0, 0, 1, 2, 0, 3, 1]))).toBe(1);
  });
});

describe('validate', () => {
  // Every run sums to 4.
  const p = fromSolution(3, [0, 0, 0, 0, 1, 3, 0, 3, 1]);

  it('accepts the solution', () => {
    expect(validate(p, [0, 0, 0, 0, 1, 3, 0, 3, 1])).toBe(true);
  });

  it('rejects a wrong sum', () => {
    expect(validate(p, [0, 0, 0, 0, 1, 3, 0, 4, 1])).toBe(false);
  });

  it('rejects repeated digits in a run', () => {
    expect(validate(p, [0, 0, 0, 0, 2, 2, 0, 2, 2])).toBe(false);
  });

  it('rejects empty or out-of-range white cells', () => {
    expect(validate(p, [0, 0, 0, 0, 0, 4, 0, 4, 0])).toBe(false);
    expect(validate(p, [0, 0, 0, 0, 1, 3, 0, 3, 1.5])).toBe(false);
    const big = fromSolution(3, [0, 0, 0, 0, 9, 8, 0, 8, 9]);
    expect(validate(big, [0, 0, 0, 0, 10, 7, 0, 7, 10])).toBe(false);
  });

  it('rejects digits on blocks and wrong sizes', () => {
    expect(validate(p, [5, 0, 0, 0, 1, 3, 0, 3, 1])).toBe(false);
    expect(validate(p, [0, 0, 0, 0, 1, 3, 0, 3])).toBe(false);
  });
});

describe('generate', () => {
  it('has a default variant', () => {
    expect(VARIANTS.map((v) => v.id)).toContain(DEFAULT_VARIANT);
  });

  it('is deterministic for a seed', () => {
    expect(generate('8', 42)).toEqual(generate('8', 42));
    expect(generate('6', 7)).toEqual(generate('6', 7));
    expect(generate('8', 1)).not.toEqual(generate('8', 2));
  });

  for (const { id } of VARIANTS) {
    it(
      `variant ${id}: unique, logic-solvable and consistent`,
      () => {
        const maxRun = id === '6' ? 4 : 6;
        for (let seed = 1; seed <= 30; seed++) {
          const p = generate(id, seed);
          const { size, blocks, solution } = p;
          expect(size).toBe(Number(id));
          expect(p.variant).toBe(id);
          expect(p.seed).toBe(seed);
          for (let k = 0; k < size; k++) expect(blocks[k] && blocks[k * size]).toBe(true);

          // Layout: 180° symmetric, runs of 2..maxRun, a single connected white region.
          for (let r = 1; r < size; r++) {
            for (let c = 1; c < size; c++) expect(blocks[r * size + c]).toBe(blocks[(size - r) * size + (size - c)]);
          }
          for (const len of runLengths(p)) expect(len >= 2 && len <= maxRun).toBe(true);
          const whites = blocks.flatMap((b, i) => (b ? [] : [i]));
          const seen = new Set([whites[0]]);
          for (const i of seen) {
            for (const j of [i - 1, i + 1, i - size, i + size]) if (whites.includes(j)) seen.add(j);
          }
          expect(seen.size).toBe(whites.length);

          // Clues match the solution, and nothing else holds a clue.
          const expected = fromSolution(size, solution);
          expect(p.across).toEqual(expected.across);
          expect(p.down).toEqual(expected.down);
          expect(blocks).toEqual(expected.blocks);

          expect(validate(p, solution)).toBe(true);
          expect(countSolutions(p)).toBe(1);
          expect(solveLogic(p)).toEqual({ solved: true, grid: solution });
        }
      },
      60_000,
    );
  }
});
