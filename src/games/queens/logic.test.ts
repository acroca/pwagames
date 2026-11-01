import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VARIANT,
  LOOKAHEAD,
  VARIANTS,
  countSolutions,
  generate,
  ruledOut,
  solveLogic,
  validate,
  type QueensPuzzle,
} from './logic';

/** Builds a puzzle from region rows written as letters ('A' = region 0). */
const fromRows = (rows: string[], solution: number[]): QueensPuzzle => ({
  size: rows.length,
  regions: rows.flatMap((row) => [...row].map((ch) => ch.charCodeAt(0) - 65)),
  solution,
  variant: String(rows.length),
  seed: 0,
});

const connected = (p: QueensPuzzle, g: number): boolean => {
  const n = p.size;
  const cells = p.regions.flatMap((h, i) => (h === g ? [i] : []));
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    const next = [i - n, i + n, i % n > 0 ? i - 1 : -1, i % n < n - 1 ? i + 1 : -1];
    for (const j of next) {
      if (j >= 0 && j < n * n && p.regions[j] === g && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
};

// Each fixture needs the given technique level: confinement of 1, 2 and 3 units, and lookahead.
const FIXTURES: { level: number; puzzle: QueensPuzzle }[] = [
  {
    level: 1,
    puzzle: fromRows(
      ['AAAAAAA', 'AACAAAB', 'ACCCCAB', 'ACDDDAA', 'DDDEEEA', 'DDFFEEE', 'FFFGGEE'],
      [0, 6, 1, 3, 5, 2, 4],
    ),
  },
  {
    level: 2,
    puzzle: fromRows(
      ['CAAAAAA', 'CCCAABE', 'CAAAAEE', 'DADEAEE', 'DDDEEEF', 'EEEEEEF', 'EEGGEEE'],
      [1, 5, 0, 2, 4, 6, 3],
    ),
  },
  {
    level: 3,
    puzzle: fromRows(
      ['EEAAAAB', 'EEACDAB', 'ECCCDBB', 'EEGGDFF', 'EEEGFFF', 'EGGGFFF', 'EEEGGGG'],
      [2, 6, 1, 4, 0, 5, 3],
    ),
  },
  {
    level: LOOKAHEAD,
    puzzle: fromRows(
      ['AADDDDD', 'AEDDDBD', 'AEECDBD', 'EEECDDD', 'FFEDDDG', 'FFGGDDG', 'GGGGGGG'],
      [1, 5, 3, 6, 2, 0, 4],
    ),
  },
];

// Regions are the columns: both 4×4 non-touching queen placements are solutions.
const ambiguous = fromRows(['ABCD', 'ABCD', 'ABCD', 'ABCD'], [1, 3, 0, 2]);

describe('generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('8', 123)).toEqual(generate('8', 123));
    expect(generate('8', 123)).not.toEqual(generate('8', 124));
  });

  it('falls back to the default variant', () => {
    expect(generate('nope', 5).size).toBe(Number(DEFAULT_VARIANT));
  });

  for (const { id } of VARIANTS) {
    it(
      `produces unique, logic-solvable ${id}×${id} puzzles`,
      () => {
        for (let seed = 1; seed <= 10; seed++) {
          const p = generate(id, seed * 7919);
          const n = Number(id);
          expect(p.size).toBe(n);
          expect(p.variant).toBe(id);
          expect(p.regions).toHaveLength(n * n);
          const sizes = Array.from({ length: n }, (_, g) => p.regions.filter((h) => h === g).length);
          expect(sizes.every((s) => s > 0)).toBe(true);
          expect(sizes.filter((s) => s === 1).length).toBeLessThanOrEqual(1);
          for (let g = 0; g < n; g++) expect(connected(p, g)).toBe(true);
          expect(validate(p, p.solution)).toBe(true);
          expect(countSolutions(p)).toBe(1);
          const res = solveLogic(p);
          expect(res.solved).toBe(true);
          expect(res.queens).toEqual(p.solution);
          expect(res.level).toBeGreaterThan(0);
        }
      },
      60_000,
    );
  }
});

describe('countSolutions', () => {
  it('finds 2 solutions of an ambiguous puzzle', () => {
    expect(countSolutions(ambiguous)).toBe(2);
    expect(countSolutions(ambiguous, 1)).toBe(1);
  });

  it('finds 0 solutions of an impossible puzzle', () => {
    expect(countSolutions(fromRows(['AAA', 'BBB', 'CCC'], [0, 0, 0]))).toBe(0);
  });

  it('finds exactly 1 solution of each fixture', () => {
    for (const { puzzle } of FIXTURES) expect(countSolutions(puzzle)).toBe(1);
  });
});

describe('validate', () => {
  const p = FIXTURES[0].puzzle;

  it('accepts the solution', () => {
    expect(validate(p, p.solution)).toBe(true);
  });

  it('rejects a wrong length or out-of-range columns', () => {
    expect(validate(p, p.solution.slice(1))).toBe(false);
    expect(validate(p, [...p.solution.slice(0, 6), 7])).toBe(false);
    expect(validate(p, [...p.solution.slice(0, 6), -1])).toBe(false);
  });

  it('rejects two queens in a column', () => {
    // Columns 0 and 4 collide; regions and adjacency are fine (regions are rows).
    const rows = fromRows(['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE'], [0, 2, 4, 1, 3]);
    expect(validate(rows, [0, 2, 4, 1, 3])).toBe(true);
    expect(validate(rows, [0, 2, 0, 3, 1])).toBe(false);
  });

  it('rejects two queens in a region', () => {
    // Regions are the columns, except that cell (0,0) belongs to the last one.
    const cols = fromRows(['EBCDE', 'ABCDE', 'ABCDE', 'ABCDE', 'ABCDE'], [1, 3, 0, 2, 4]);
    expect(validate(cols, [1, 3, 0, 2, 4])).toBe(true);
    expect(validate(cols, [0, 2, 4, 1, 3])).toBe(false);
  });

  it('rejects touching queens', () => {
    const rows = fromRows(['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE'], [0, 2, 4, 1, 3]);
    expect(validate(rows, [0, 1, 3, 2, 4])).toBe(false); // diagonally touching
    expect(validate(rows, [0, 2, 4, 3, 1])).toBe(false);
  });
});

describe('solveLogic', () => {
  it('does not guess on an ambiguous puzzle', () => {
    const res = solveLogic(ambiguous);
    expect(res.solved).toBe(false);
    expect(res.queens).toEqual([-1, -1, -1, -1]);
  });

  for (const { level, puzzle } of FIXTURES) {
    it(`needs technique level ${level} and is sound below it`, () => {
      const res = solveLogic(puzzle);
      expect(res.solved).toBe(true);
      expect(res.queens).toEqual(puzzle.solution);
      expect(res.level).toBe(level);
      const weaker = solveLogic(puzzle, level - 1);
      expect(weaker.solved).toBe(false);
      weaker.queens.forEach((c, r) => c >= 0 && expect(c).toBe(puzzle.solution[r]));
    });
  }

  it('solves a single-cell region and singles chain without advanced techniques', () => {
    // Region A is the single cell (0,1); the rest follows by singles.
    const p = fromRows(['CABB', 'CCBB', 'CCDB', 'DDDD'], [1, 3, 0, 2]);
    const res = solveLogic(p);
    expect(res).toEqual({ solved: true, queens: [1, 3, 0, 2], level: 0 });
  });
});

describe('ruledOut', () => {
  it('covers row, column, region and neighbours', () => {
    const regions = fromRows(['AABB', 'ACBB', 'CCDD', 'CCDD'], [0, 0, 0, 0]).regions;
    // Queen at (1,1), region C = {5, 8, 9, 12, 13}.
    expect(ruledOut(4, regions, 5)).toEqual([0, 1, 2, 4, 6, 7, 8, 9, 10, 12, 13]);
    // Queen at (0,3), region B = {2, 3, 6, 7}.
    expect(ruledOut(4, regions, 3)).toEqual([0, 1, 2, 6, 7, 11, 15]);
  });
});
