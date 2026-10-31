import type { GameModule } from '../core/types';
import { binairo } from './binairo';
import { nonogram } from './nonogram';
import { queens } from './queens';

/** Games in menu order. */
export const GAMES: GameModule[] = [nonogram, binairo, queens];
