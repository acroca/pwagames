import { generate as binairo } from './binairo/logic';
import { generate as futoshiki } from './futoshiki/logic';
import { generate as hitori } from './hitori/logic';
import { generate as kakuro } from './kakuro/logic';
import { generate as kenken } from './kenken/logic';
import { generate as killer } from './killer/logic';
import { generate as minesweeper } from './minesweeper/logic';
import { generatePuzzle as nonogram } from './nonogram/logic';
import { generate as nurikabe } from './nurikabe/logic';
import { generate as queens } from './queens/logic';
import { generate as slitherlink } from './slitherlink/logic';
import { generate as sudoku } from './sudoku/logic';
import { generate as tents } from './tents/logic';
import { generate as lightup } from './lightup/logic';
import { generate as bridges } from './bridges/logic';
import { generate as skyscrapers } from './skyscrapers/logic';
import { generate as battleships } from './battleships/logic';
import { generate as masyu } from './masyu/logic';
import { generate as norinori } from './norinori/logic';
import { generate as fillomino } from './fillomino/logic';
import { generate as kuromasu } from './kuromasu/logic';
import { generate as dominosa } from './dominosa/logic';
import { generate as numberlink } from './numberlink/logic';
import { generate as thermometers } from './thermometers/logic';
import { generate as mosaic } from './mosaic/logic';
import { generate as jigsaw } from './jigsaw/logic';
import { generate as taketen } from './taketen/logic';
import { generate as alibi } from './alibi/logic';

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
  hitori,
  nurikabe,
  slitherlink,
  minesweeper,
  tents,
  lightup,
  bridges,
  skyscrapers,
  battleships,
  masyu,
  norinori,
  fillomino,
  kuromasu,
  dominosa,
  numberlink,
  thermometers,
  mosaic,
  jigsaw,
  taketen,
  alibi,
};
