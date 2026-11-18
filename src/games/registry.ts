import type { GameModule } from '../core/types';
import { binairo } from './binairo';
import { futoshiki } from './futoshiki';
import { hitori } from './hitori';
import { kakuro } from './kakuro';
import { kenken } from './kenken';
import { killer } from './killer';
import { minesweeper } from './minesweeper';
import { nonogram } from './nonogram';
import { nurikabe } from './nurikabe';
import { queens } from './queens';
import { slitherlink } from './slitherlink';
import { sudoku } from './sudoku';
import { tents } from './tents';
import { lightup } from './lightup';
import { bridges } from './bridges';
import { skyscrapers } from './skyscrapers';
import { battleships } from './battleships';
import { masyu } from './masyu';
import { norinori } from './norinori';
import { fillomino } from './fillomino';
import { kuromasu } from './kuromasu';
import { dominosa } from './dominosa';
import { numberlink } from './numberlink';
import { thermometers } from './thermometers';
import { mosaic } from './mosaic';
import { jigsaw } from './jigsaw';
import { taketen } from './taketen';
import { alibi } from './alibi';

/** Games in menu order. */
export const GAMES: GameModule[] = [nonogram, binairo, queens, sudoku, jigsaw, killer, kenken, futoshiki, skyscrapers, kakuro, hitori, nurikabe, slitherlink, minesweeper, tents, lightup, bridges, battleships, masyu, norinori, fillomino, kuromasu, dominosa, numberlink, thermometers, mosaic, taketen, alibi];

/** Recently added games, flagged with a "New" badge on the menu. */
export const NEW_GAMES: ReadonlySet<string> = new Set();
