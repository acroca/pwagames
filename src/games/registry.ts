import type { GameModule } from '../core/types';
import { binairo } from './binairo';
import { futoshiki } from './futoshiki';
import { kakuro } from './kakuro';
import { kenken } from './kenken';
import { killer } from './killer';
import { nonogram } from './nonogram';
import { queens } from './queens';
import { sudoku } from './sudoku';

/** Games in menu order. */
export const GAMES: GameModule[] = [nonogram, binairo, queens, sudoku, killer, kenken, futoshiki, kakuro];
