import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/rng';
import {
  DEFAULT_VARIANT,
  VARIANTS,
  counts,
  countSolutions,
  findDeductions,
  floodOpen,
  generate,
  neighbors,
  solveLogic,
  validate,
  type MinesweeperPuzzle,
} from './logic';

/** Builds a puzzle from rows of '*' (mine) and '.' (empty). */
function board(rows: string[], start: number, variant = 'test'): MinesweeperPuzzle {
  return {
    width: rows[0].length,
    height: rows.length,
    mines: rows.join('').split('').map((ch) => ch === '*'),
    start,
    variant,
    seed: 0,
  };
}

const mask = (n: number, cells: number[]) => Array.from({ length: n }, (_, i) => cells.includes(i));

/** Every mine layout (with the puzzle's mine count) consistent with the revealed numbers, by brute force. */
function consistentLayouts(p: MinesweeperPuzzle, revealed: boolean[]): boolean[][] {
  const n = p.mines.length;
  const total = p.mines.filter(Boolean).length;
  const cnt = counts(p);
  const unknown = revealed.flatMap((r, i) => (r ? [] : [i]));
  const out: boolean[][] = [];
  const layout = new Array<boolean>(n).fill(false);
  const rec = (from: number, left: number) => {
    if (left === 0) {
      const ok = revealed.every(
        (r, i) => !r || neighbors(p.width, p.height, i).filter((j) => layout[j]).length === cnt[i],
      );
      if (ok) out.push([...layout]);
      return;
    }
    for (let u = from; u <= unknown.length - left; u++) {
      layout[unknown[u]] = true;
      rec(u + 1, left - 1);
      layout[unknown[u]] = false;
    }
  };
  rec(0, total);
  return out;
}

describe('helpers', () => {
  it('lists neighbours of corners, edges and inner cells', () => {
    expect(neighbors(9, 9, 0).sort((a, b) => a - b)).toEqual([1, 9, 10]);
    expect(neighbors(9, 9, 4)).toHaveLength(5);
    expect(neighbors(9, 9, 80).sort((a, b) => a - b)).toEqual([70, 71, 79]);
    expect(neighbors(9, 16, 40)).toHaveLength(8);
  });

  it('counts adjacent mines', () => {
    const p = board(['*..', '...', '..*'], 4);
    expect(counts(p)).toEqual([0, 1, 0, 1, 2, 1, 0, 1, 0]);
  });

  it('flood-opens zero regions up to the numbers and never opens other mines', () => {
    const p = board(['....', '....', '...*'], 0);
    const revealed = new Array<boolean>(12).fill(false);
    const opened = floodOpen(p, revealed, 0);
    expect(opened.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(revealed[11]).toBe(false);
    expect(floodOpen(p, revealed, 0)).toEqual([]);
    expect(floodOpen(p, revealed, 11)).toEqual([11]);
  });

  it('opens a numbered cell alone', () => {
    const p = board(['*..', '...'], 5);
    const revealed = new Array<boolean>(6).fill(false);
    expect(floodOpen(p, revealed, 1)).toEqual([1]);
  });
});

describe('logic techniques', () => {
  it('finds a pair (1-2-1) deduction', () => {
    // Top row revealed: 1 2 1 over the unknown bottom row.
    const p = board(['...', '*.*'], 0);
    const d = findDeductions(p, mask(6, [0, 1, 2]), mask(6, []));
    expect(d?.technique).toBe('pair');
    expect(d?.mines.sort()).toEqual([3, 5]);
    expect(d?.safe).toEqual([]);
  });

  it('applies the subset rule', () => {
    // 1 at (1,0) covers {0,1}; 1 at (1,1) covers {0,1,2,5} → 2 and 5 are safe.
    const p = board(['*..', '...'], 3);
    const d = findDeductions(p, mask(6, [3, 4]), mask(6, []));
    expect(d).toEqual({ technique: 'pair', safe: [2, 5], mines: [] });
  });

  it('needs enumeration when three numbers interact', () => {
    // 1 covers {5,6}, 2 covers {5,6,7,12,17}, 1 covers {12,17}: so 7 is safe.
    const p = board(['...*.', '*....', '..*..', '.....'], 15);
    const revealed = new Array<boolean>(20).fill(false);
    floodOpen(p, revealed, 15);
    expect(revealed.flatMap((r, i) => (r ? [i] : []))).toEqual([10, 11, 15, 16]);
    expect(findDeductions(p, revealed, mask(20, []))).toEqual({ technique: 'enumerate', safe: [7], mines: [] });
  });

  it('uses the global mine count when few cells are unknown', () => {
    // One mine left, and it is in the 50/50 next to the numbers, so the far column is safe.
    const p = board(['...*.', '.....'], 0);
    const d = findDeductions(p, mask(10, [0, 1, 2, 5, 6, 7]), mask(10, []));
    expect(d?.technique).toBe('global');
    expect(d?.safe.sort()).toEqual([4, 9]);
  });

  it('makes only sound deductions (checked by brute force on random small boards)', () => {
    for (let s = 1; s <= 150; s++) {
      const rng = mulberry32(s);
      const rows = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => (rng() < 0.22 ? '*' : '.')).join(''));
      const p = board(rows, Math.floor(rng() * 20));
      if (p.mines[p.start]) continue;
      const revealed = new Array<boolean>(20).fill(false);
      const flagged = new Array<boolean>(20).fill(false);
      floodOpen(p, revealed, p.start);
      for (let d = findDeductions(p, revealed, flagged); d; d = findDeductions(p, revealed, flagged)) {
        const layouts = consistentLayouts(p, revealed);
        for (const i of d.safe) expect(layouts.every((l) => !l[i])).toBe(true);
        for (const i of d.mines) expect(layouts.every((l) => l[i])).toBe(true);
        d.safe.forEach((i) => floodOpen(p, revealed, i));
        d.mines.forEach((i) => (flagged[i] = true));
      }
      const { solved, revealed: final } = solveLogic(p);
      expect(final).toEqual(revealed);
      expect(countSolutions(p, 1e9)).toBe(consistentLayouts(p, revealed).length);
      if (solved) expect(countSolutions(p)).toBe(1);
    }
  }, 30_000);
});

describe('solveLogic / countSolutions', () => {
  it('gets stuck on a classic 50/50', () => {
    const p = board(['...*', '....'], 0);
    const { solved, revealed, flagged } = solveLogic(p);
    expect(solved).toBe(false);
    expect(revealed).toEqual(mask(8, [0, 1, 2, 4, 5, 6]));
    expect(flagged).toEqual(mask(8, []));
    expect(countSolutions(p)).toBe(2);
    expect(countSolutions(p, 10)).toBe(2);
    expect(countSolutions(p, 1)).toBe(1);
  });

  it('counts unconstrained cells combinatorially', () => {
    // A wall of mines hides the right three columns: their 2 mines can be in any of C(12, 2) places.
    const p = board(['..*...', '..*..*', '..*...', '..*.*.'], 0);
    const { solved, revealed, flagged } = solveLogic(p);
    expect(solved).toBe(false);
    expect(flagged).toEqual(mask(24, [2, 8, 14, 20]));
    expect(countSolutions(p, 1e9)).toBe(66);
    expect(consistentLayouts(p, revealed)).toHaveLength(66);
    expect(countSolutions(p)).toBe(2);
  });

  it('solves a board that only needs the opening and single rules', () => {
    const p = board(['....', '....', '...*'], 0);
    expect(solveLogic(p)).toEqual({ solved: true, revealed: p.mines.map((m) => !m), flagged: p.mines });
    expect(countSolutions(p)).toBe(1);
  });
});

describe('validate', () => {
  const p = generate('9x9', 7, 40);

  it('accepts the mines as flags', () => {
    expect(validate(p, p.mines)).toBe(true);
  });

  it('rejects a missing or extra flag', () => {
    const missing = [...p.mines];
    missing[missing.indexOf(true)] = false;
    expect(validate(p, missing)).toBe(false);
    const extra = [...p.mines];
    extra[extra.indexOf(false)] = true;
    expect(validate(p, extra)).toBe(false);
    expect(validate(p, p.mines.slice(1))).toBe(false);
  });

  it('rejects a wrong mine count', () => {
    const mines = [...p.mines];
    mines[mines.findIndex((m, i) => !m && !neighbors(9, 9, 40).includes(i) && i !== 40)] = true;
    expect(validate({ ...p, mines }, mines)).toBe(false);
  });

  it('rejects a mine next to the start cell', () => {
    const mines = [...p.mines];
    mines[mines.indexOf(true)] = false;
    mines[31] = true;
    expect(validate({ ...p, mines }, mines)).toBe(false);
    const onStart = [...p.mines];
    onStart[onStart.indexOf(true)] = false;
    onStart[40] = true;
    expect(validate({ ...p, mines: onStart }, onStart)).toBe(false);
  });

  it('rejects a size or variant mismatch', () => {
    expect(validate({ ...p, variant: '9x16' }, p.mines)).toBe(false);
    expect(validate({ ...p, variant: 'nope' }, p.mines)).toBe(false);
    expect(validate({ ...p, start: 81 }, p.mines)).toBe(false);
  });
});

describe('generate', () => {
  it('has the expected variants', () => {
    expect(VARIANTS.map((v) => v.id)).toContain(DEFAULT_VARIANT);
    expect(VARIANTS.map((v) => [v.id, v.width, v.height, v.mines])).toEqual([
      ['9x9', 9, 9, 10],
      ['9x16', 9, 16, 25],
    ]);
  });

  it('is deterministic for (variant, seed, start)', () => {
    expect(generate('9x16', 42, 0)).toEqual(generate('9x16', 42, 0));
    expect(generate('9x16', 42, 0).mines).not.toEqual(generate('9x16', 43, 0).mines);
  });

  it('rejects bad input', () => {
    expect(() => generate('nope', 1, 0)).toThrow();
    expect(() => generate('9x9', 1, 81)).toThrow();
    expect(() => generate('9x9', 1, -1)).toThrow();
  });

  for (const v of VARIANTS) {
    it(`generates no-guess ${v.id} boards for any first tap`, () => {
      const n = v.width * v.height;
      const w = v.width;
      const starts = [0, w - 1, n - w, n - 1, Math.floor(w / 2), w * 4, w * 5 - 1, Math.floor(n / 2), n - 2, w + 1];
      for (let s = 1; s <= 30; s++) {
        const start = starts[s % starts.length];
        const p = generate(v.id, s * 7919, start);
        expect(p).toMatchObject({ width: v.width, height: v.height, start, variant: v.id, seed: s * 7919 });
        expect(p.mines.filter(Boolean)).toHaveLength(v.mines);
        expect([start, ...neighbors(v.width, v.height, start)].some((i) => p.mines[i])).toBe(false);
        const res = solveLogic(p);
        expect(res.solved).toBe(true);
        expect(res.flagged).toEqual(p.mines);
        expect(res.revealed).toEqual(p.mines.map((m) => !m));
        expect(countSolutions(p)).toBe(1);
        expect(validate(p, p.mines)).toBe(true);
        expect(JSON.parse(JSON.stringify(p))).toEqual(p);
      }
    }, 30_000);
  }
});
