import { generate as binairo } from './binairo/logic';
import { generate as futoshiki } from './futoshiki/logic';
import { generate as kakuro } from './kakuro/logic';
import { generate as kenken } from './kenken/logic';
import { generate as killer } from './killer/logic';
import { generatePuzzle as nonogram } from './nonogram/logic';
import { generate as queens } from './queens/logic';
import { generate as sudoku } from './sudoku/logic';

/** Puzzle generators by game id. Imported by the generation worker, so keep this free of DOM code. */
export const GENERATORS: Record<string, (variant: string, seed: number, extra?: any) => unknown> = {
  nonogram: (variant, seed) => nonogram(Number(variant), seed),
  binairo,
  queens,
  sudoku,
  killer,
  kenken,
  futoshiki,
  kakuro,
};
