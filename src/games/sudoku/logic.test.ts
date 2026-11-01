import { describe, expect, it } from 'vitest';
import {
  countSolutions,
  DEFAULT_VARIANT,
  emptyState,
  generate,
  peers,
  solveLogic,
  technique,
  validate,
  VARIANTS,
  type SolverState,
} from './logic';

const bit = (d: number): number => 1 << (d - 1);
const has = (s: SolverState, i: number, d: number): boolean => (s.cand[i] & bit(d)) !== 0;
const at = (r: number, c: number): number => r * 9 + c;

/** A valid grid: each row is 1..9 shifted by 3 per row plus 1 per band. */
const PATTERN = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9);
  return ((r * 3 + Math.floor(r / 3) + (i % 9)) % 9) + 1;
});

/** PATTERN without the 1s and 4s of the top band: they can be swapped, so it has exactly two solutions. */
const AMBIGUOUS = PATTERN.map((d, i) => (i < 27 && (d === 1 || d === 4) ? 0 : d));

const swap = (grid: number[], a: number, b: number): number[] => {
  const g = grid.slice();
  [g[a], g[b]] = [g[b], g[a]];
  return g;
};

describe('helpers', () => {
  it('peers are the 20 cells sharing a unit', () => {
    for (let i = 0; i < 81; i++) {
      const p = peers(i);
      expect(p).toHaveLength(20);
      expect(p).not.toContain(i);
      for (const j of p) expect(peers(j)).toContain(i);
    }
    expect(peers(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 27, 36, 45, 54, 63, 72]);
  });

  it('exports the variants', () => {
    expect(VARIANTS.map((v) => v.id)).toEqual(['easy', 'medium', 'hard']);
    expect(DEFAULT_VARIANT).toBe('easy');
  });
});

describe('generate', () => {
  it('is deterministic for a seed', () => {
    for (const { id } of VARIANTS) expect(generate(id, 1234)).toEqual(generate(id, 1234));
    expect(generate('hard', 1).givens).not.toEqual(generate('hard', 2).givens);
  }, 30_000);

  const cases: [string, [number, number], number][] = [
    ['easy', [36, 42], 1],
    ['medium', [28, 34], 2],
    ['hard', [23, 27], 3],
  ];
  for (const [variant, [lo, hi], level] of cases) {
    it(`${variant}: unique, logic-solvable, graded`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const p = generate(variant, seed * 7919);
        expect(p.variant).toBe(variant);
        expect(p.givens).toHaveLength(81);
        expect(p.givens.every((g, i) => g === 0 || g === p.solution[i])).toBe(true);
        const clues = p.givens.filter((g) => g).length;
        expect(clues).toBeGreaterThanOrEqual(lo);
        expect(clues).toBeLessThanOrEqual(hi);
        expect(validate(p, p.solution)).toBe(true);
        expect(countSolutions(p)).toBe(1);
        expect(solveLogic(p)).toEqual({ solved: true, grid: p.solution });
        expect(solveLogic(p, level as 1 | 2 | 3).solved).toBe(true);
        if (level > 1) expect(solveLogic(p, (level - 1) as 1 | 2).solved).toBe(false);
      }
    }, 60_000);
  }
});

describe('countSolutions', () => {
  it('counts a complete grid once', () => {
    expect(countSolutions({ givens: PATTERN })).toBe(1);
  });

  it('finds both solutions of an ambiguous puzzle', () => {
    expect(countSolutions({ givens: AMBIGUOUS })).toBe(2);
    expect(countSolutions({ givens: AMBIGUOUS }, 5)).toBe(2);
    expect(solveLogic({ givens: AMBIGUOUS }).solved).toBe(false);
  });

  it('stops at the limit and rejects clashing givens', () => {
    expect(countSolutions({ givens: new Array(81).fill(0) }, 3)).toBe(3);
    const clash = new Array(81).fill(0);
    clash[0] = clash[8] = 5;
    expect(countSolutions({ givens: clash })).toBe(0);
  });
});

describe('validate', () => {
  const puzzle = { givens: AMBIGUOUS };

  it('accepts both solutions of the ambiguous puzzle', () => {
    expect(validate(puzzle, PATTERN)).toBe(true);
    expect(validate(puzzle, PATTERN.map((d, i) => (i < 27 && (d === 1 || d === 4) ? 5 - d : d)))).toBe(true);
  });

  it('rejects a repeated digit in a row', () => {
    // Swapping within a column and box keeps those intact but breaks rows 0 and 1.
    expect(validate({ givens: [] }, swap(PATTERN, at(0, 0), at(1, 0)))).toBe(false);
  });

  it('rejects a repeated digit in a column', () => {
    expect(validate({ givens: [] }, swap(PATTERN, at(0, 0), at(0, 1)))).toBe(false);
  });

  it('rejects a repeated digit in a box', () => {
    // A cyclic Latin square: rows and columns are fine, boxes are not.
    expect(validate({ givens: [] }, Array.from({ length: 81 }, (_, i) => ((Math.floor(i / 9) + i) % 9) + 1))).toBe(false);
  });

  it('rejects incomplete or out-of-range grids', () => {
    expect(validate({ givens: [] }, PATTERN.map((d, i) => (i === 40 ? 0 : d)))).toBe(false);
    expect(validate({ givens: [] }, PATTERN.slice(0, 80))).toBe(false);
    expect(validate({ givens: [] }, PATTERN.map((d) => d + 9))).toBe(false);
  });

  it('rejects a grid that contradicts a given', () => {
    const givens = new Array(81).fill(0);
    givens[0] = 4;
    expect(validate({ givens }, PATTERN)).toBe(false);
  });
});

describe('logic techniques', () => {
  it('naked and hidden singles', () => {
    const s = emptyState();
    s.cand[40] = bit(5);
    expect(technique.nakedSingles(s)).toBe(true);
    expect(s.value[40]).toBe(5);
    expect(has(s, 41, 5)).toBe(false);

    const h = emptyState();
    for (let c = 0; c < 9; c++) if (c !== 4) h.cand[at(0, c)] &= ~bit(9);
    expect(technique.hiddenSingles(h)).toBe(true);
    expect(h.value[at(0, 4)]).toBe(9);
  });

  it('pointing: a digit locked to one row of a box leaves the rest of the row', () => {
    const s = emptyState();
    for (const i of [2, 9, 10, 11, 18, 19, 20]) s.cand[i] &= ~bit(7);
    expect(technique.lockedCandidates(s)).toBe(true);
    for (let c = 3; c < 9; c++) expect(has(s, at(0, c), 7)).toBe(false);
    expect(has(s, 0, 7) && has(s, 1, 7) && has(s, at(1, 3), 7)).toBe(true);
  });

  it('claiming: a digit locked to one box of a row leaves the rest of the box', () => {
    const s = emptyState();
    for (let c = 3; c < 9; c++) s.cand[at(0, c)] &= ~bit(7);
    expect(technique.lockedCandidates(s)).toBe(true);
    for (const i of [9, 10, 11, 18, 19, 20]) expect(has(s, i, 7)).toBe(false);
    expect(has(s, at(1, 3), 7)).toBe(true);
  });

  it('naked pair', () => {
    const s = emptyState();
    s.cand[at(0, 0)] = s.cand[at(0, 5)] = bit(1) | bit(2);
    expect(technique.nakedSubsets(s, 2)).toBe(true);
    for (const c of [1, 2, 3, 4, 6, 7, 8]) expect(s.cand[at(0, c)] & (bit(1) | bit(2))).toBe(0);
    expect(s.cand[at(0, 0)]).toBe(bit(1) | bit(2));
    expect(technique.nakedSubsets(emptyState(), 2)).toBe(false);
  });

  it('hidden pair', () => {
    const s = emptyState();
    for (let c = 0; c < 9; c++) if (c !== 2 && c !== 5) s.cand[at(0, c)] &= ~(bit(3) | bit(4));
    expect(technique.hiddenSubsets(s, 2)).toBe(true);
    expect(s.cand[at(0, 2)]).toBe(bit(3) | bit(4));
    expect(s.cand[at(0, 5)]).toBe(bit(3) | bit(4));
  });

  it('naked triple (no cell needs all three digits)', () => {
    const s = emptyState();
    s.cand[0] = bit(1) | bit(2);
    s.cand[4] = bit(2) | bit(3);
    s.cand[8] = bit(1) | bit(3);
    expect(technique.nakedSubsets(s, 2)).toBe(false);
    expect(technique.nakedSubsets(s, 3)).toBe(true);
    for (const c of [1, 2, 3, 5, 6, 7]) expect(s.cand[c] & (bit(1) | bit(2) | bit(3))).toBe(0);
  });

  it('hidden triple', () => {
    const s = emptyState();
    const d456 = bit(4) | bit(5) | bit(6);
    for (let c = 0; c < 9; c++) if (c < 3 || c > 5) s.cand[at(0, c)] &= ~d456;
    s.cand[at(0, 3)] &= ~bit(6);
    expect(technique.hiddenSubsets(s, 2)).toBe(false);
    expect(technique.hiddenSubsets(s, 3)).toBe(true);
    expect(s.cand[at(0, 3)]).toBe(bit(4) | bit(5));
    expect(s.cand[at(0, 4)]).toBe(d456);
    expect(s.cand[at(0, 5)]).toBe(d456);
  });

  it('X-Wing', () => {
    const s = emptyState();
    for (const r of [1, 4]) for (let c = 0; c < 9; c++) if (c !== 2 && c !== 7) s.cand[at(r, c)] &= ~bit(5);
    expect(technique.fish(emptyState(), 2)).toBe(false);
    expect(technique.fish(s, 2)).toBe(true);
    for (const r of [0, 2, 3, 5, 6, 7, 8]) {
      expect(has(s, at(r, 2), 5) || has(s, at(r, 7), 5)).toBe(false);
      expect(has(s, at(r, 0), 5)).toBe(true);
    }
    expect(has(s, at(1, 2), 5) && has(s, at(4, 7), 5)).toBe(true);
  });

  it('Swordfish', () => {
    const s = emptyState();
    const keep: Record<number, number[]> = { 0: [1, 4], 3: [4, 7], 6: [1, 7] };
    for (const r of [0, 3, 6]) for (let c = 0; c < 9; c++) if (!keep[r].includes(c)) s.cand[at(r, c)] &= ~bit(9);
    expect(technique.fish(s, 2)).toBe(false);
    expect(technique.fish(s, 3)).toBe(true);
    for (const r of [1, 2, 4, 5, 7, 8]) for (const c of [1, 4, 7]) expect(has(s, at(r, c), 9)).toBe(false);
    expect(has(s, at(1, 0), 9) && has(s, at(0, 1), 9)).toBe(true);
  });

  it('XY-Wing', () => {
    const s = emptyState();
    s.cand[at(0, 0)] = bit(1) | bit(2);
    s.cand[at(0, 4)] = bit(1) | bit(3);
    s.cand[at(3, 0)] = bit(2) | bit(3);
    expect(technique.xyWing(s)).toBe(true);
    expect(has(s, at(3, 4), 3)).toBe(false);
    expect(has(s, at(3, 5), 3) && has(s, at(1, 4), 3)).toBe(true);
  });

  it('solveLogic respects the technique level', () => {
    const p = generate('hard', 42);
    const singles = solveLogic(p, 1);
    expect(singles.solved).toBe(false);
    singles.grid.forEach((d, i) => expect(d === 0 || d === p.solution[i]).toBe(true));
    expect(solveLogic(p, 3).solved).toBe(true);
  });
});
