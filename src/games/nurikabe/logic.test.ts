import { describe, expect, it } from 'vitest';
import {
  countSolutions,
  DEFAULT_VARIANT,
  generate,
  solveLogic,
  validate,
  VARIANTS,
  type NurikabePuzzle,
} from './logic';

/**
 * Builds a puzzle from rows where a digit (base 36) is a clue, '#' is sea and '.' is unnumbered land. The solution is
 * read from the same picture (clues are land).
 */
const parse = (rows: string[]): NurikabePuzzle => {
  const cells = rows.join('').split('');
  return {
    size: rows.length,
    clues: cells.map((ch) => (ch === '#' || ch === '.' ? 0 : parseInt(ch, 36))),
    solution: cells.map((ch) => ch === '#'),
    variant: '',
    seed: 0,
  };
};

/** Puzzle with only the clues of `rows` and an empty solution. */
const cluesOnly = (rows: string[]): NurikabePuzzle => ({ ...parse(rows), solution: [] });

const at = (p: NurikabePuzzle, r: number, c: number) => r * p.size + c;

/** Sizes of the land regions, keyed by any clue cell they contain. */
const islandSizeAt = (p: NurikabePuzzle, start: number): number => {
  const n = p.size;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / n);
    const c = i % n;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      const j = rr * n + cc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && !p.solution[j] && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size;
};

const SMALL = parse([
  '1#2.#',
  '#####',
  '#1#.2',
  '#####',
  '2.#1#',
]);

describe('generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('7', 42)).toEqual(generate('7', 42));
    expect(generate('7', 42)).not.toEqual(generate('7', 43));
  }, 30_000);

  it('falls back to the default variant', () => {
    const p = generate('nope', 1);
    expect(p.variant).toBe(DEFAULT_VARIANT);
    expect(p.size).toBe(Number(DEFAULT_VARIANT));
  }, 30_000);

  for (const { id } of VARIANTS) {
    it(`produces unique, logically solvable ${id}×${id} puzzles`, () => {
      for (const seed of [1, 2, 3, 4]) {
        const p = generate(id, seed);
        const cells = p.size * p.size;
        expect(p.size).toBe(Number(id));
        expect(p.variant).toBe(id);
        expect(p.seed).toBe(seed);
        expect(p.clues).toHaveLength(cells);
        expect(p.solution).toHaveLength(cells);
        expect(countSolutions(p)).toBe(1);
        expect(validate(p, p.solution)).toBe(true);
        const r = solveLogic(p);
        expect(r.solved).toBe(true);
        expect(r.sea).toEqual(p.solution);
        p.clues.forEach((clue, i) => {
          if (!clue) return;
          expect(p.solution[i]).toBe(false);
          expect(islandSizeAt(p, i)).toBe(clue);
        });
        const sea = p.solution.filter(Boolean).length / cells;
        expect(sea).toBeGreaterThan(0.4);
        expect(sea).toBeLessThan(0.75);
      }
    }, 60_000);
  }
});

describe('countSolutions', () => {
  it('reports ambiguity', () => {
    const p = cluesOnly(['...', '.2.', '...']);
    expect(countSolutions(p)).toBe(2);
    expect(countSolutions(p, 10)).toBe(4);
  });

  it('counts a unique puzzle and an impossible one', () => {
    expect(countSolutions(SMALL)).toBe(1);
    expect(countSolutions(cluesOnly(['3....', '.....', '.....', '.....', '....3']))).toBe(0);
  });
});

describe('validate', () => {
  it('accepts a correct solution', () => {
    expect(validate(SMALL, SMALL.solution)).toBe(true);
  });

  it('rejects an island smaller than its number', () => {
    const p = { ...SMALL, clues: [...SMALL.clues] };
    p.clues[at(p, 0, 0)] = 2;
    expect(validate(p, SMALL.solution)).toBe(false);
  });

  it('rejects an island larger than its number', () => {
    const p = { ...SMALL, clues: [...SMALL.clues] };
    p.clues[at(p, 0, 2)] = 1;
    expect(validate(p, SMALL.solution)).toBe(false);
  });

  it('rejects an island without a number', () => {
    const p = { ...SMALL, clues: [...SMALL.clues] };
    p.clues[at(p, 2, 1)] = 0;
    expect(validate(p, SMALL.solution)).toBe(false);
  });

  it('rejects an island with two numbers', () => {
    const p = { ...SMALL, clues: [...SMALL.clues] };
    p.clues[at(p, 0, 3)] = 2;
    expect(validate(p, SMALL.solution)).toBe(false);
  });

  it('rejects a disconnected sea', () => {
    const p = parse(['#3#', '#.#', '#.#']);
    expect(validate(p, p.solution)).toBe(false);
  });

  it('rejects a 2×2 pool', () => {
    const p = parse(['1##', '###', '###']);
    expect(validate(p, p.solution)).toBe(false);
  });

  it('rejects a grid without sea or of the wrong size', () => {
    const p = parse(['4.', '..']);
    expect(validate(p, p.solution)).toBe(false);
    expect(validate(SMALL, SMALL.solution.slice(1))).toBe(false);
  });
});

describe('solveLogic techniques', () => {
  it('surrounds complete islands and shades cells between two numbers', () => {
    const r = solveLogic(SMALL);
    expect(r.solved).toBe(true);
    expect(r.sea).toEqual(SMALL.solution);
    const p = parse(['2#2', '.#.', '###']);
    expect(solveLogic(cluesOnly(['2.2', '...', '...'])).sea).toEqual(p.solution);
  });

  it('shades cells no island can reach, leaving the rest open', () => {
    const p = cluesOnly(['...', '.2.', '...']);
    const r = solveLogic(p);
    expect(r.solved).toBe(false);
    expect(r.sea).toEqual([true, false, true, false, false, false, true, false, true]);
  });

  // Each of these generated puzzles stops being solvable when the named technique is disabled.
  const cases: [string, string[]][] = [
    ['island completion enumeration', ['2#####1', '.#...7#', '##...##', '#2####1', '#.#.2##', '#####5.', '#.2#...']],
    ['pool avoidance and reachability', ['...#4.#', '..6##.#', '###1#.#', '4#3####', '.#.#2.#', '.#.####', '.###2.#']],
    ['forced island exits', ['####.2#', '3..####', '###.#.#', '.#3.#2#', '2#####.', '##.4#5.', '#..##..']],
    ['sea bottlenecks', ['#1#.5.#', '####..#', '#.3####', '#.#.#.2', '###.###', '#.#3#.5', '#2##...']],
  ];
  for (const [name, rows] of cases) {
    it(`uses ${name}`, () => {
      const p = parse(rows);
      expect(validate(p, p.solution)).toBe(true);
      const r = solveLogic({ ...p, solution: [] });
      expect(r.solved).toBe(true);
      expect(r.sea).toEqual(p.solution);
    }, 10_000);
  }
});
