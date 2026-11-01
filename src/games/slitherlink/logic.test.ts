import { describe, expect, it } from 'vitest';
import {
  cellEdgeCount,
  countSolutions,
  DEFAULT_VARIANT,
  generate,
  solveLogic,
  validate,
  VARIANTS,
  type Edges,
  type SlitherlinkPuzzle,
} from './logic';

const emptyEdges = (size: number): Edges => ({
  h: new Array<boolean>((size + 1) * size).fill(false),
  v: new Array<boolean>(size * (size + 1)).fill(false),
});

/** Edge indices around cell (r, c): [top, bottom, left, right] (h indices, then v indices). */
const around = (size: number, r: number, c: number) => ({
  top: r * size + c,
  bottom: (r + 1) * size + c,
  left: r * (size + 1) + c,
  right: r * (size + 1) + c + 1,
});

/** Toggles the four edges of cell (r, c), i.e. XORs a unit square into the loop. */
const square = (edges: Edges, size: number, r: number, c: number): Edges => {
  const e = around(size, r, c);
  edges.h[e.top] = !edges.h[e.top];
  edges.h[e.bottom] = !edges.h[e.bottom];
  edges.v[e.left] = !edges.v[e.left];
  edges.v[e.right] = !edges.v[e.right];
  return edges;
};

const puzzleOf = (size: number, given: Record<number, number> = {}): SlitherlinkPuzzle => {
  const clues = new Array<number>(size * size).fill(-1);
  for (const [i, k] of Object.entries(given)) clues[Number(i)] = k;
  return { size, clues, solution: emptyEdges(size), variant: String(size), seed: 0 };
};

describe('generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('6', 42)).toEqual(generate('6', 42));
    expect(generate('6', 42)).not.toEqual(generate('6', 43));
  });

  it('falls back to the default variant', () => {
    expect(generate('nope', 1).variant).toBe(DEFAULT_VARIANT);
  });

  for (const { id } of VARIANTS) {
    it(
      `variant ${id}: unique, logic-solvable and consistent`,
      () => {
        for (const seed of [1, 2, 3, 77, 2024]) {
          const p = generate(id, seed);
          const n = Number(id);
          expect(p.size).toBe(n);
          expect(p.variant).toBe(id);
          expect(p.seed).toBe(seed);
          expect(p.clues).toHaveLength(n * n);
          expect(validate(p, p.solution)).toBe(true);
          p.clues.forEach((k, i) => {
            if (k >= 0) expect(k).toBe(cellEdgeCount(p.solution, n, i));
          });
          const given = p.clues.filter((k) => k >= 0).length / (n * n);
          expect(given).toBeGreaterThan(0.3);
          expect(given).toBeLessThan(0.75);
          const loop = p.solution.h.filter(Boolean).length + p.solution.v.filter(Boolean).length;
          expect(loop).toBeGreaterThanOrEqual(2 * n + 4);
          const solved = solveLogic(p);
          expect(solved.solved).toBe(true);
          expect(solved.edges).toEqual(p.solution);
          expect(countSolutions(p)).toBe(1);
        }
      },
      60_000,
    );
  }
});

describe('validate', () => {
  const blank = puzzleOf(3);

  it('accepts a single loop', () => {
    expect(validate(blank, square(emptyEdges(3), 3, 1, 1))).toBe(true);
    expect(validate(blank, square(square(emptyEdges(3), 3, 0, 0), 3, 0, 1))).toBe(true);
  });

  it('rejects an empty grid', () => {
    expect(validate(blank, emptyEdges(3))).toBe(false);
  });

  it('rejects wrong array sizes', () => {
    expect(validate(blank, square(emptyEdges(2), 2, 0, 0))).toBe(false);
  });

  it('rejects more than one loop', () => {
    expect(validate(blank, square(square(emptyEdges(3), 3, 0, 0), 3, 2, 2))).toBe(false);
  });

  it('rejects crossings (degree 4)', () => {
    expect(validate(blank, square(square(emptyEdges(3), 3, 0, 0), 3, 1, 1))).toBe(false);
  });

  it('rejects branches and dead ends', () => {
    const edges = square(emptyEdges(3), 3, 1, 1);
    edges.h[around(3, 1, 0).top] = true;
    expect(validate(blank, edges)).toBe(false);
  });

  it('rejects unsatisfied clues', () => {
    const edges = square(emptyEdges(3), 3, 1, 1);
    expect(validate(puzzleOf(3, { 4: 3 }), edges)).toBe(false);
    expect(validate(puzzleOf(3, { 0: 0, 1: 1 }), edges)).toBe(true);
    expect(validate(puzzleOf(3, { 1: 2 }), edges)).toBe(false);
  });
});

describe('countSolutions', () => {
  it('detects an ambiguous puzzle', () => {
    // A 1 in the corner of a 2×2 board: a unit loop around either neighbouring cell works.
    expect(countSolutions(puzzleOf(2, { 0: 1 }))).toBe(2);
    expect(countSolutions(puzzleOf(5))).toBe(2);
  });

  it('counts a unique puzzle once', () => {
    expect(countSolutions(puzzleOf(2, { 0: 3, 1: 3 }))).toBe(1);
  });

  it('returns 0 for an impossible puzzle', () => {
    expect(countSolutions(puzzleOf(3, { 0: 3, 1: 0, 3: 0 }))).toBe(0);
  });
});

describe('solveLogic techniques', () => {
  const on = (p: SlitherlinkPuzzle) => solveLogic(p).edges;

  it('3 in a corner: both corner edges are on', () => {
    const e = on(puzzleOf(5, { 0: 3 }));
    expect(e.h[0]).toBe(true);
    expect(e.v[0]).toBe(true);
  });

  it('adjacent 3s: the shared edge and both outer edges are on (the domino loop would be premature)', () => {
    const e = on(puzzleOf(5, { 11: 3, 12: 3, 24: 2 }));
    const a = around(5, 2, 1);
    const b = around(5, 2, 2);
    expect([e.v[a.left], e.v[a.right], e.v[b.right]]).toEqual([true, true, true]);
  });

  it('diagonal 3s: the outer corners are on', () => {
    const e = on(puzzleOf(5, { 6: 3, 12: 3 }));
    const a = around(5, 1, 1);
    const b = around(5, 2, 2);
    expect([e.h[a.top], e.v[a.left], e.h[b.bottom], e.v[b.right]]).toEqual([true, true, true, true]);
  });

  it('3 next to a 0: the three far edges are on', () => {
    const e = on(puzzleOf(5, { 11: 0, 12: 3 }));
    const b = around(5, 2, 2);
    expect([e.h[b.top], e.h[b.bottom], e.v[b.right], e.v[b.left]]).toEqual([true, true, true, false]);
  });

  it('1 in a corner next to a 3: the 3 takes both edges at the shared corner dot', () => {
    // The 1 keeps its corner edges off, so the dot between them needs both or neither of the 3's edges there.
    const e = on(puzzleOf(5, { 0: 1, 1: 3 }));
    const b = around(5, 0, 1);
    expect([e.h[b.top], e.v[b.left]]).toEqual([true, true]);
  });

  it('allows a loop closure only when it completes the whole solution', () => {
    const domino = square(square(emptyEdges(2), 2, 0, 0), 2, 0, 1);
    const p = puzzleOf(2, { 0: 3, 1: 3 });
    expect(solveLogic(p)).toEqual({ solved: true, edges: domino });
    // With an extra clue elsewhere, the same small loop is premature.
    const q = puzzleOf(3, { 0: 3, 1: 3, 8: 2 });
    expect(solveLogic(q).edges.v[1]).toBe(true);
  });

  it('only deduces edges that are in every solution', () => {
    for (const id of ['5', '6', '7']) {
      for (const seed of [5, 6]) {
        const p = generate(id, seed);
        // Sparser, possibly ambiguous clue sets: every deduced loop edge must still be in the solution.
        for (let drop = 0; drop < 3; drop++) {
          const clues = p.clues.map((k, i) => ((i * 7 + drop * 3 + seed) % 4 === 0 ? -1 : k));
          const e = solveLogic({ ...p, clues }).edges;
          e.h.forEach((x, i) => x && expect(p.solution.h[i]).toBe(true));
          e.v.forEach((x, i) => x && expect(p.solution.v[i]).toBe(true));
        }
      }
    }
  }, 30_000);

  it('reports unsolved for an ambiguous puzzle', () => {
    expect(solveLogic(puzzleOf(2, { 0: 1 })).solved).toBe(false);
  });
});

describe('cellEdgeCount', () => {
  it('counts the loop edges around a cell', () => {
    const edges = square(square(emptyEdges(3), 3, 0, 0), 3, 0, 1);
    expect([0, 1, 2, 3, 4].map((i) => cellEdgeCount(edges, 3, i))).toEqual([3, 3, 1, 1, 1]);
  });
});
