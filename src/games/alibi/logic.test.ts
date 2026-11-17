import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VARIANT,
  NAMES,
  OBJECTS,
  PLAIN,
  ROOM_NAMES,
  VARIANTS,
  VICTIM,
  countSolutions,
  generate,
  solveLogic,
  validate,
  type AlibiPuzzle,
  type Clue,
} from './logic';

/**
 * A 3×3 house: the left column is room 0, the rest room 1, no objects. The victim stands top middle, the culprit
 * (person 1) middle right and person 2 bottom left.
 */
const tiny = (clues: Clue[][]): AlibiPuzzle => ({
  size: 3,
  rooms: [0, 1, 1, 0, 1, 1, 0, 1, 1],
  roomNames: [0, 1],
  objects: new Array(9).fill(-1),
  clues,
  solution: [1, 5, 6],
  culprit: 1,
  variant: '3',
  seed: 0,
});

const UNIQUE = tiny([
  [{ kind: 'above', other: 1 }],
  [{ kind: 'right', other: 0 }],
  [{ kind: 'room', room: 0 }, { kind: 'below', other: 1 }],
]);
// Without person 1's statement the victim and the culprit can swap columns.
const AMBIGUOUS = tiny([[{ kind: 'above', other: 1 }], [], UNIQUE.clues[2]]);
// Nobody can be left of person 2, who is in the first column.
const IMPOSSIBLE = tiny([UNIQUE.clues[0], [{ kind: 'left', other: 2 }], UNIQUE.clues[2]]);

/** Every room is a filled rectangle. */
const rectangular = (p: AlibiPuzzle): boolean => {
  const n = p.size;
  return [...new Set(p.rooms)].every((g) => {
    const cells = p.rooms.flatMap((h, i) => (h === g ? [i] : []));
    const rows = cells.map((i) => Math.floor(i / n));
    const cols = cells.map((i) => i % n);
    const height = Math.max(...rows) - Math.min(...rows) + 1;
    const width = Math.max(...cols) - Math.min(...cols) + 1;
    return cells.length === height * width;
  });
};

describe('generate', () => {
  it('is deterministic for a seed', () => {
    expect(generate('6', 123)).toEqual(generate('6', 123));
    expect(generate('6', 123)).not.toEqual(generate('6', 124));
  });

  it('falls back to the default variant', () => {
    expect(generate('nope', 5).size).toBe(Number(DEFAULT_VARIANT));
  });

  it('has a name for every suspect, room and object it can use', () => {
    const largest = Math.max(...VARIANTS.map((v) => Number(v.id)));
    expect(NAMES.length).toBeGreaterThanOrEqual(largest - 1);
    expect(new Set(NAMES.map((name) => name[0])).size).toBe(NAMES.length);
    expect(ROOM_NAMES.length).toBeGreaterThanOrEqual(largest);
    expect(OBJECTS.length).toBeGreaterThanOrEqual(4);
  });

  for (const { id } of VARIANTS) {
    const n = Number(id);
    it(
      `produces unique ${id}×${id} cases that need no lookahead`,
      () => {
        for (let seed = 1; seed <= (n >= 8 ? 4 : 10); seed++) {
          const p = generate(id, seed * 7919);
          expect(p.size).toBe(n);
          expect(p.variant).toBe(id);
          expect(p.rooms).toHaveLength(n * n);
          expect(p.objects).toHaveLength(n * n);
          expect(rectangular(p)).toBe(true);
          const roomCount = Math.max(...p.rooms) + 1;
          expect(roomCount).toBeGreaterThanOrEqual(4);
          expect(roomCount).toBeLessThanOrEqual(10);
          expect(new Set(p.roomNames).size).toBe(roomCount);
          // Everyone says something, never more than two things.
          expect(p.clues).toHaveLength(n);
          for (const list of p.clues) {
            expect(list.length).toBeGreaterThanOrEqual(1);
            expect(list.length).toBeLessThanOrEqual(2);
          }
          // Nothing spells out who shared the victim's room.
          expect(p.clues.flat().some((clue) => clue.kind === 'with' && clue.other === VICTIM)).toBe(false);
          expect(p.clues[VICTIM].some((clue) => clue.kind === 'with' || clue.kind === 'alone')).toBe(false);
          expect(p.culprit).toBeGreaterThan(VICTIM);
          expect(validate(p, p.solution)).toBe(true);
          expect(countSolutions(p)).toBe(1);
          // Solvable without trying squares out.
          const res = solveLogic(p, PLAIN);
          expect(res.solved).toBe(true);
          expect(res.positions).toEqual(p.solution);
        }
      },
      120_000,
    );
  }
});

describe('countSolutions', () => {
  it('finds the single solution of a unique case', () => {
    expect(countSolutions(UNIQUE)).toBe(1);
  });

  it('finds 2 solutions of an ambiguous case', () => {
    expect(countSolutions(AMBIGUOUS)).toBe(2);
    expect(countSolutions(AMBIGUOUS, 1)).toBe(1);
  });

  it('finds 0 solutions of an impossible case', () => {
    expect(countSolutions(IMPOSSIBLE)).toBe(0);
  });

  it('only counts placements that leave the named culprit with the victim', () => {
    expect(countSolutions({ ...UNIQUE, culprit: 2 })).toBe(0);
  });
});

describe('validate', () => {
  it('accepts the solution', () => {
    expect(validate(UNIQUE, UNIQUE.solution)).toBe(true);
  });

  it('rejects a wrong length or squares off the board', () => {
    expect(validate(UNIQUE, [1, 5])).toBe(false);
    expect(validate(UNIQUE, [1, 5, 9])).toBe(false);
    expect(validate(UNIQUE, [1, 5, -1])).toBe(false);
  });

  it('rejects two people in a row or column', () => {
    const free = tiny([[], [], []]);
    expect(validate(free, [1, 5, 6])).toBe(true);
    expect(validate(free, [1, 2, 6])).toBe(false);
    expect(validate(free, [1, 4, 6])).toBe(false);
  });

  it('rejects someone standing on an object', () => {
    const blocked = { ...tiny([[], [], []]), objects: [-1, -1, -1, -1, -1, -1, 0, -1, -1] };
    expect(validate(blocked, [1, 5, 6])).toBe(false);
  });

  it('rejects a false statement', () => {
    expect(validate(UNIQUE, [2, 4, 6])).toBe(false);
    expect(validate(tiny([[], [], [{ kind: 'alone' }]]), [1, 5, 6])).toBe(true);
    expect(validate(tiny([[], [{ kind: 'alone' }], []]), [1, 5, 6])).toBe(false);
    expect(validate(tiny([[{ kind: 'diag', other: 1 }], [], []]), [1, 5, 6])).toBe(true);
    expect(validate(tiny([[{ kind: 'diag', other: 2 }], [], []]), [1, 5, 6])).toBe(false);
    expect(validate(tiny([[], [{ kind: 'outer' }], []]), [1, 5, 6])).toBe(true);
    expect(validate(tiny([[], [{ kind: 'outer' }], []]), [2, 4, 6])).toBe(false);
  });

  it('reads objects beside a square only within its room', () => {
    // A plant bottom middle: it is beside the bottom-right square, but a wall away from the bottom-left one.
    const plant = (clues: Clue[][]): AlibiPuzzle => ({ ...tiny(clues), objects: [-1, -1, -1, -1, -1, -1, -1, 0, -1], solution: [3, 1, 8] });
    expect(validate({ ...plant([[], [], [{ kind: 'beside', object: 0 }]]), culprit: 2 }, [1, 3, 8])).toBe(true);
    expect(validate({ ...plant([[], [{ kind: 'beside', object: 0 }], []]), culprit: 2 }, [2, 6, 4])).toBe(false);
    expect(validate({ ...plant([[], [{ kind: 'clear' }], []]), culprit: 2 }, [2, 6, 4])).toBe(true);
    expect(validate({ ...plant([[], [{ kind: 'row', object: 0 }], []]), culprit: 2 }, [2, 6, 4])).toBe(true);
    expect(validate({ ...plant([[], [{ kind: 'col', object: 0 }], []]), culprit: 2 }, [2, 6, 4])).toBe(false);
  });

  it('needs exactly one suspect, the culprit, in the victim’s room', () => {
    const free = tiny([[], [], []]);
    // The victim alone in the left room.
    expect(validate(free, [0, 4, 8])).toBe(false);
    // Person 2 is the one with the victim.
    expect(validate(free, [1, 3, 8])).toBe(false);
    expect(validate({ ...free, culprit: 2 }, [1, 3, 8])).toBe(true);
    // Everyone in one room.
    expect(validate({ ...free, rooms: new Array(9).fill(0) }, [1, 5, 6])).toBe(false);
  });
});

describe('solveLogic', () => {
  it('solves a small case with plain deductions', () => {
    expect(solveLogic(UNIQUE)).toEqual({ solved: true, positions: [1, 5, 6], level: PLAIN, open: 0 });
  });

  it('does not guess on an ambiguous case', () => {
    const res = solveLogic(AMBIGUOUS);
    expect(res.solved).toBe(false);
    expect(res.positions).toEqual([-1, -1, 6]);
    expect(res.open).toBeGreaterThan(0);
  });

  it('reports an impossible case as unsolved', () => {
    expect(solveLogic(IMPOSSIBLE).solved).toBe(false);
  });

  it('keeps everyone but the culprit out of the victim’s room', () => {
    // The victim and person 1 are pinned to the right-hand room, so person 2 must be in the left column.
    const p = tiny([[{ kind: 'room', room: 1 }], [{ kind: 'room', room: 1 }], []]);
    const res = solveLogic(p, PLAIN);
    expect(res.positions[2]).toBe(-1);
    expect(countSolutions({ ...p, clues: [...p.clues.slice(0, 2), [{ kind: 'room', room: 1 }]] })).toBe(0);
    expect(countSolutions({ ...p, clues: [...p.clues.slice(0, 2), [{ kind: 'room', room: 0 }]] }, 9)).toBe(countSolutions(p, 9));
  });
});
