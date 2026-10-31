import { describe, expect, it } from 'vitest';
import { BLANK, CROSS, FILL, Stroke, isSolved, lineSatisfied, newGame, type Mark } from './game';

const blank = (n: number): Mark[] => new Array(n * n).fill(BLANK);

describe('Stroke', () => {
  it('fills a blank cell and clears a filled one', () => {
    const cells = blank(3);
    new Stroke(3, 0, 0, cells, FILL).apply(cells, 0, 0);
    expect(cells[0]).toBe(FILL);
    new Stroke(3, 0, 0, cells, FILL).apply(cells, 0, 0);
    expect(cells[0]).toBe(BLANK);
  });

  it('crosses with the cross tool', () => {
    const cells = blank(3);
    new Stroke(3, 1, 1, cells, CROSS).apply(cells, 1, 1);
    expect(cells[4]).toBe(CROSS);
  });

  it('drags along a locked axis without overwriting other marks', () => {
    const cells = blank(4);
    cells[2] = CROSS;
    const stroke = new Stroke(4, 0, 0, cells, FILL);
    stroke.apply(cells, 0, 0);
    stroke.apply(cells, 0, 3);
    // Diagonal drift stays on the locked row.
    stroke.apply(cells, 1, 3);
    expect(cells.slice(0, 4)).toEqual([FILL, FILL, CROSS, FILL]);
    expect(cells.slice(4)).toEqual(new Array(12).fill(BLANK));
  });

  it('drags vertically', () => {
    const cells = blank(3);
    const stroke = new Stroke(3, 0, 1, cells, CROSS);
    stroke.apply(cells, 2, 1);
    expect([cells[1], cells[4], cells[7]]).toEqual([CROSS, CROSS, CROSS]);
  });
});

describe('game state', () => {
  it('detects a solved board, ignoring crosses', () => {
    const state = newGame(10, 7);
    expect(isSolved(state)).toBe(false);
    state.cells = state.puzzle.solution.map((v) => (v ? FILL : CROSS));
    expect(isSolved(state)).toBe(true);
    state.cells = state.puzzle.solution.map((v) => (v ? FILL : BLANK));
    expect(isSolved(state)).toBe(true);
  });

  it('checks line satisfaction', () => {
    expect(lineSatisfied([FILL, FILL, CROSS, FILL], [2, 1])).toBe(true);
    expect(lineSatisfied([FILL, BLANK, CROSS, FILL], [2, 1])).toBe(false);
  });
});
