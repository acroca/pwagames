import { describe, expect, it } from 'vitest';
import {
  EMPTY,
  FILLED,
  UNKNOWN,
  cluesFor,
  generatePuzzle,
  lineClue,
  solveLine,
  solveLogically,
  type Knowledge,
} from './nonogram';

const U = UNKNOWN;
const E = EMPTY;
const F = FILLED;

/** Counts solutions (up to `limit`) by brute-force backtracking over rows. */
function countSolutions(rows: number[][], cols: number[][], limit = 2): number {
  const size = rows.length;
  const patterns = rows.map((clue) => {
    const out: number[][] = [];
    for (let mask = 0; mask < 1 << size; mask++) {
      const line = Array.from({ length: size }, (_, i) => (mask >> i) & 1);
      if (JSON.stringify(lineClue(line)) === JSON.stringify(clue)) out.push(line);
    }
    return out;
  });
  const grid: number[][] = [];
  let count = 0;
  const search = (r: number) => {
    if (count >= limit) return;
    if (r === size) {
      if (cols.every((clue, c) => JSON.stringify(lineClue(grid.map((g) => g[c]))) === JSON.stringify(clue))) count++;
      return;
    }
    for (const p of patterns[r]) {
      grid.push(p);
      const feasible = cols.every((clue, c) => {
        const partial = Array.from({ length: size }, (_, i) => (i <= r ? grid[i][c] : U)) as Knowledge[];
        return solveLine(clue, partial) !== null;
      });
      if (feasible) search(r + 1);
      grid.pop();
    }
  };
  search(0);
  return count;
}

describe('lineClue', () => {
  it('computes run lengths', () => {
    expect(lineClue([1, 1, 0, 1, 0, 0, 1, 1, 1, 0])).toEqual([2, 1, 3]);
    expect(lineClue([0, 0, 0])).toEqual([]);
    expect(lineClue([1, 1, 1])).toEqual([3]);
  });
});

describe('solveLine', () => {
  it('fills overlapping cells of a large block', () => {
    const line: Knowledge[] = new Array(10).fill(U);
    expect(solveLine([8], line)).toEqual([U, U, F, F, F, F, F, F, U, U]);
  });

  it('solves a line exactly filled by its clue', () => {
    const line: Knowledge[] = new Array(10).fill(U);
    expect(solveLine([3, 2, 3], line)).toEqual([F, F, F, E, F, F, E, F, F, F]);
  });

  it('empties every cell for an empty clue', () => {
    expect(solveLine([], [U, U, U])).toEqual([E, E, E]);
  });

  it('uses existing knowledge', () => {
    expect(solveLine([1], [U, F, U, U])).toEqual([E, F, E, E]);
    expect(solveLine([2], [E, U, U, E])).toEqual([E, F, F, E]);
  });

  it('detects contradictions', () => {
    expect(solveLine([3], [U, E, U, E])).toBeNull();
    expect(solveLine([1], [F, U, F])).toBeNull();
  });
});

describe('solveLogically', () => {
  it('reports ambiguous puzzles as unsolved', () => {
    // Two diagonal solutions share these clues.
    expect(countSolutions([[1], [1]], [[1], [1]])).toBe(2);
    const result = solveLogically([[1], [1]], [[1], [1]]);
    expect(result.solved).toBe(false);
  });

  it('solves a simple puzzle', () => {
    const solution = [1, 1, 0, 1, 0, 0, 1, 1, 1];
    const { rows, cols } = cluesFor(solution, 3);
    const result = solveLogically(rows, cols);
    expect(result.solved).toBe(true);
    expect(result.grid).toEqual(solution);
  });
});

describe('generatePuzzle', () => {
  it('is deterministic for a seed', () => {
    expect(generatePuzzle(10, 42)).toEqual(generatePuzzle(10, 42));
  });

  it('produces 10x10 puzzles solvable by logic alone', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const puzzle = generatePuzzle(10, seed);
      expect(puzzle.solution).toHaveLength(100);
      expect(cluesFor(puzzle.solution, 10)).toEqual({ rows: puzzle.rows, cols: puzzle.cols });
      const result = solveLogically(puzzle.rows, puzzle.cols);
      expect(result.solved).toBe(true);
      expect(result.grid).toEqual(puzzle.solution);
    }
  });

  it('produces puzzles with exactly one solution (brute-force check)', () => {
    for (let seed = 1000; seed < 1020; seed++) {
      const puzzle = generatePuzzle(10, seed);
      expect(countSolutions(puzzle.rows, puzzle.cols)).toBe(1);
    }
  });
});
