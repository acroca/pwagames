import { describe, expect, it } from 'vitest';
import {
  cageOf,
  countSolutions,
  DEFAULT_VARIANT,
  generate,
  logicCandidates,
  solveLogic,
  validate,
  VARIANTS,
  type KillerPuzzle,
} from './logic';

const GRID = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  .split('')
  .map(Number);

const mask = (...digits: number[]) => digits.reduce((m, d) => m | (1 << (d - 1)), 0);

/** Builds a puzzle over `grid` with the given cages (sums taken from `grid`); remaining cells become single cages. */
const puzzleFrom = (groups: number[][], grid = GRID, fillSingles = true): KillerPuzzle => {
  const covered = new Set(groups.flat());
  const all = fillSingles ? [...groups, ...grid.map((_, i) => [i]).filter(([i]) => !covered.has(i))] : groups;
  return {
    cages: all.map((cells) => ({ cells, sum: cells.reduce((s, i) => s + grid[i], 0) })),
    givens: new Array(81).fill(0),
    solution: grid.slice(),
    variant: 'test',
    seed: 0,
  };
};

/** Splits each row segment `[from, to)` of the listed rows into a horizontal cage. */
const rowCages = (rows: number[], segments: [number, number][]) =>
  rows.flatMap((r) => segments.map(([from, to]) => Array.from({ length: to - from }, (_, k) => r * 9 + from + k)));

const range9 = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Vertical three-cell cages for the listed columns and bands (each lies inside one box). */
const columnTriples = (cols: number[], bands: number[]) =>
  cols.flatMap((c) => bands.map((b) => [0, 1, 2].map((k) => (b * 3 + k) * 9 + c)));

/** Every deduction keeps the actual solution digit. */
const expectSound = (cand: number[]) => expect(cand.every((m, i) => m & mask(GRID[i]))).toBe(true);

const isConnected = (cells: number[]) => {
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of [i - 9, i + 9, i % 9 ? i - 1 : -1, i % 9 < 8 ? i + 1 : -1]) {
      if (cells.includes(j) && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
};

describe('generate', () => {
  it('exposes variants', () => {
    expect(VARIANTS.map((v) => v.id)).toEqual(['easy', 'medium', 'hard']);
    expect(VARIANTS.some((v) => v.id === DEFAULT_VARIANT)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(generate('medium', 42)).toEqual(generate('medium', 42));
    expect(generate('medium', 42)).not.toEqual(generate('medium', 43));
  }, 30_000);

  for (const { id } of VARIANTS) {
    it(`builds unique, logic-solvable ${id} puzzles`, () => {
      for (const seed of [1, 2, 3, 77, 12345]) {
        const p = generate(id, seed);
        expect(p.variant).toBe(id);
        expect(p.seed).toBe(seed);
        const owner = cageOf(p);
        expect(owner.every((k) => k >= 0)).toBe(true);
        expect(p.cages.reduce((n, cage) => n + cage.cells.length, 0)).toBe(81);
        for (const { cells, sum } of p.cages) {
          expect(cells).toEqual(cells.slice().sort((a, b) => a - b));
          expect(isConnected(cells)).toBe(true);
          expect(new Set(cells.map((i) => p.solution[i])).size).toBe(cells.length);
          expect(cells.reduce((s, i) => s + p.solution[i], 0)).toBe(sum);
          expect(cells.length).toBeLessThanOrEqual(id === 'hard' ? 5 : 4);
        }
        expect(p.cages.filter((c) => c.cells.length === 1).length).toBeLessThanOrEqual(2);
        const givens = p.givens.filter((g) => g).length;
        expect(givens).toBeLessThanOrEqual(id === 'easy' ? 6 : 0);
        expect(p.givens.every((g, i) => !g || g === p.solution[i])).toBe(true);
        expect(validate(p, p.solution)).toBe(true);
        expect(countSolutions(p)).toBe(1);
        expect(solveLogic(p)).toEqual({ solved: true, grid: p.solution });
      }
    }, 60_000);
  }

  it('grades difficulty by technique level', () => {
    const solvedAt = (p: KillerPuzzle, level: 0 | 1 | 2) => logicCandidates(p, level).every((m) => !(m & (m - 1)));
    expect(solvedAt(generate('easy', 5), 1)).toBe(true);
    expect(solvedAt(generate('medium', 5), 0)).toBe(false);
    expect(solvedAt(generate('hard', 5), 1)).toBe(false);
  }, 30_000);
});

describe('countSolutions', () => {
  it('finds both fillings of an ambiguous rectangle', () => {
    // r3c5/r4c5 and r3c8/r4c8 hold 1/3 and 3/1; vertical sum-4 cages cannot tell them apart.
    const p = puzzleFrom([
      [32, 41],
      [35, 44],
    ]);
    expect(countSolutions(p)).toBe(2);
    expect(countSolutions(p, 1)).toBe(1);
    expect(solveLogic(p).solved).toBe(false);
  });

  it('counts a unique puzzle once and an impossible one as zero', () => {
    expect(countSolutions(puzzleFrom([]))).toBe(1);
    const broken = puzzleFrom([]);
    broken.cages[0].sum = broken.cages[1].sum;
    expect(countSolutions(broken)).toBe(0);
  });
});

describe('validate', () => {
  const singles = (grid: number[]) => puzzleFrom([], grid);
  const swap = (grid: number[], a: number, b: number) => {
    const g = grid.slice();
    [g[a], g[b]] = [g[b], g[a]];
    return g;
  };

  it('accepts the solution', () => {
    expect(validate(puzzleFrom([[0, 1, 2]]), GRID)).toBe(true);
  });

  it('rejects incomplete or out-of-range grids', () => {
    const p = singles(GRID);
    expect(validate(p, GRID.slice(0, 80))).toBe(false);
    expect(validate(p, GRID.map((v, i) => (i === 40 ? 0 : v)))).toBe(false);
    expect(validate(p, GRID.map((v, i) => (i === 40 ? 10 : v)))).toBe(false);
  });

  it('rejects a repeated digit in a row', () => {
    // Swapping two cells of a column inside one box keeps that column and box valid.
    const grid = swap(GRID, 0, 9);
    expect(validate(singles(grid), grid)).toBe(false);
  });

  it('rejects a repeated digit in a column', () => {
    const grid = swap(GRID, 0, 1);
    expect(validate(singles(grid), grid)).toBe(false);
  });

  it('rejects a repeated digit in a box', () => {
    const latin = GRID.map((_, i) => ((Math.floor(i / 9) + (i % 9)) % 9) + 1);
    expect(validate(singles(latin), latin)).toBe(false);
  });

  it('rejects a wrong cage sum', () => {
    const p = puzzleFrom([[0, 1]]);
    p.cages[0].sum++;
    expect(validate(p, GRID)).toBe(false);
  });

  it('rejects a repeated digit in a cage', () => {
    // Cells 0 and 14 both hold 5; the cage sum matches but digits repeat.
    expect(GRID[0]).toBe(GRID[14]);
    expect(validate(puzzleFrom([[0, 1, 2, 3, 4, 5, 14]]), GRID)).toBe(false);
  });

  it('rejects a grid contradicting a given', () => {
    const p = singles(GRID);
    p.givens[10] = GRID[10] === 1 ? 2 : 1;
    expect(validate(p, GRID)).toBe(false);
  });
});

describe('solveLogic techniques', () => {
  const filler = rowCages([2, 3, 4, 5, 6, 7, 8], [
    [0, 4],
    [4, 9],
  ]);

  it('restricts cage cells to feasible combinations', () => {
    // Row 0 is 5 3 4 6 7 8 9 1 2: cells 5–6 sum 17 = {8,9}, cells 7–8 sum 3 = {1,2}.
    const p = puzzleFrom([[0, 1, 2, 3, 4], [5, 6], [7, 8], ...rowCages([1], [[0, 4], [4, 9]]), ...filler], GRID, false);
    const cand = logicCandidates(p, 0);
    expectSound(cand);
    expect(cand[5]).toBe(mask(8, 9));
    expect(cand[6]).toBe(mask(8, 9));
    expect(cand[7]).toBe(mask(1, 2));
    expect(cand[8]).toBe(mask(1, 2));
  });

  it('resolves a single innie with the rule of 45', () => {
    const groups = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 17], ...rowCages([1], [[0, 4], [4, 8]]), ...filler];
    const p = puzzleFrom(groups, GRID, false);
    expect(logicCandidates(p, 0)[8]).not.toBe(mask(GRID[8]));
    expect(logicCandidates(p, 1)[8]).toBe(mask(GRID[8]));
  });

  it('treats two innies as a virtual cage', () => {
    // Innies r0c7 + r0c8 = 45 - 42 = 3, so both are in {1, 2}.
    const groups = [[0, 1, 2], [3, 4, 5, 6], [7, 16], [8, 17], ...rowCages([1], [[0, 4], [4, 7]]), ...filler];
    const p = puzzleFrom(groups, GRID, false);
    expect(logicCandidates(p, 0)[8] & ~mask(1, 2)).not.toBe(0);
    expect(logicCandidates(p, 1)[8] & ~mask(1, 2)).toBe(0);
  });

  it('eliminates cage-required digits confined to one house', () => {
    // Cage r0c7, r0c8, r1c7 sums to 7 = {1,2,4}, all inside box 2; the rest are box-aligned column triples.
    const triples = [...columnTriples(range9.slice(0, 7), [0, 1, 2]), ...columnTriples([7, 8], [1, 2])];
    const p = puzzleFrom([[7, 8, 16], [17, 25, 26], ...triples], GRID, false);
    const others = [6, 15, 17, 24, 25, 26];
    expect(others.some((i) => logicCandidates(p, 1)[i] & mask(1, 2, 4))).toBe(true);
    const cand = logicCandidates(p, 2);
    expectSound(cand);
    expect(others.every((i) => !(cand[i] & mask(1, 2, 4)))).toBe(true);
  });

  it('uses innie/outie differences', () => {
    // Box 0 is covered by two inside cages and {r0c2, r1c2, r1c3}, leaving innie r2c2 and outie r1c3.
    const groups = [[2, 11, 12], [20, 21, 22], [3, 4, 5], [6, 7, 8], [13, 14, 23], [15, 24, 25], [16, 17, 26]];
    const p = puzzleFrom([...groups, ...columnTriples([0, 1], [0]), ...columnTriples(range9, [1, 2])], GRID, false);
    const before = logicCandidates(p, 2);
    const after = logicCandidates(p, 3);
    expectSound(after);
    expect(after.every((m, i) => (m & before[i]) === m)).toBe(true);
    expect(after).not.toEqual(before);
  });

  it('solves a plain sudoku given as single cages and reports contradictions', () => {
    expect(solveLogic(puzzleFrom([]))).toEqual({ solved: true, grid: GRID });
    const broken = puzzleFrom([[0, 1]]);
    broken.cages[0].sum = 2;
    expect(solveLogic(broken).solved).toBe(false);
  });
});
