import { describe, expect, it } from 'vitest';
import { EMPTY, VARIANTS, countSolutions, generate, linePatterns, solveLogic, validate } from './logic';

const _ = EMPTY;

// A valid 4×4 grid used to check the rules.
const GRID4 = [
  0, 1, 1, 0,
  1, 0, 0, 1,
  0, 0, 1, 1,
  1, 1, 0, 0,
];
const open4 = { size: 4, givens: new Array(16).fill(EMPTY) };

describe('linePatterns', () => {
  it('lists balanced lines without triples', () => {
    expect(linePatterns(4)).toHaveLength(6);
    expect(linePatterns(6)).toHaveLength(14);
    for (const p of linePatterns(6)) expect(p.toString(2).padStart(6, '0')).not.toMatch(/000|111/);
  });
});

describe('validate', () => {
  it('accepts a valid grid', () => {
    expect(validate(open4, GRID4)).toBe(true);
  });

  it('rejects three equal values in a row', () => {
    expect(validate({ size: 6, givens: new Array(36).fill(_) }, [
      0, 0, 0, 1, 1, 1,
      1, 1, 0, 0, 1, 0,
      0, 1, 1, 0, 0, 1,
      1, 0, 0, 1, 1, 0,
      0, 1, 1, 0, 0, 1,
      1, 0, 1, 1, 0, 0,
    ])).toBe(false);
  });

  it('rejects unbalanced lines', () => {
    const grid = [...GRID4];
    grid[0] = 1;
    expect(validate(open4, grid)).toBe(false);
  });

  it('rejects identical rows', () => {
    expect(validate(open4, [
      0, 1, 1, 0,
      0, 1, 1, 0,
      1, 0, 0, 1,
      1, 0, 0, 1,
    ])).toBe(false);
  });

  it('rejects grids that contradict the givens', () => {
    const givens = new Array(16).fill(_);
    givens[0] = 1;
    expect(validate({ size: 4, givens }, GRID4)).toBe(false);
  });
});

describe('solvers', () => {
  it('applies the no-three and balance rules', () => {
    const givens = new Array(16).fill(_);
    // 0 0 _ _ → the third cell must be 1, then balance fixes the fourth.
    givens[0] = 0;
    givens[1] = 0;
    const { grid } = solveLogic({ size: 4, givens });
    expect(grid.slice(0, 4)).toEqual([0, 0, 1, 1]);
  });

  it('uses the unique-lines rule', () => {
    // Row 0 is complete; row 1 has two candidates left, one of which equals row 0.
    const givens = [
      0, 1, 1, 0,
      _, _, 1, 0,
      _, _, _, _,
      _, _, _, _,
    ];
    expect(solveLogic({ size: 4, givens }).grid.slice(4, 8)).toEqual([1, 0, 1, 0]);
  });

  it('counts ambiguous puzzles', () => {
    expect(countSolutions(open4)).toBe(2);
    expect(countSolutions(open4, 100)).toBe(72);
    expect(solveLogic(open4).solved).toBe(false);
  });
});

describe('generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('8', 42)).toEqual(generate('8', 42));
  });

  for (const { id } of VARIANTS) {
    it(`makes unique ${id}×${id} puzzles solvable by logic`, () => {
      for (let seed = 1; seed <= 15; seed++) {
        const p = generate(id, seed);
        expect(p.size).toBe(Number(id));
        expect(validate(p, p.solution)).toBe(true);
        p.givens.forEach((g, i) => g !== EMPTY && expect(g).toBe(p.solution[i]));
        expect(countSolutions(p)).toBe(1);
        const result = solveLogic(p);
        expect(result.solved).toBe(true);
        expect(result.grid).toEqual(p.solution);
      }
    }, 60_000);
  }
});
