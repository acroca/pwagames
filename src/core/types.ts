export interface Variant {
  id: string;
  label: string;
}

export interface Setting {
  id: string;
  label: string;
  default: boolean;
}

/** Every puzzle remembers how it was made, so it can be shown and regenerated. */
export interface BasePuzzle {
  variant: string;
  seed: number;
}

/**
 * A game plugged into the shell. The shell owns the screen chrome (app bar,
 * timer, undo, check, new/restart sheet, autosave, win detection); the game
 * owns its puzzle/state logic and draws its board and controls.
 */
export interface GameModule<P extends BasePuzzle = any, S = any> {
  id: string;
  title: string;
  /** One-line pitch on the menu card. */
  blurb: string;
  /** Inline SVG for the menu card. */
  icon: string;
  variants: Variant[];
  defaultVariant: string;
  settings?: Setting[];
  /** Hide the Check button (the game reports mistakes itself). */
  noCheck?: boolean;
  /** Hide the Undo button. */
  noUndo?: boolean;

  /**
   * Builds the puzzle on the main thread instead of the generation worker
   * (e.g. Minesweeper only generates its mines after the first tap).
   */
  initialPuzzle?(variant: string, seed: number): P;
  /** Fresh player state for a puzzle. */
  newState(puzzle: P): S;
  isSolved(puzzle: P, state: S): boolean;
  /** Game over without winning (e.g. a mine went off). */
  isLost?(puzzle: P, state: S): boolean;
  /** State to replay the same puzzle after losing. */
  retryState?(puzzle: P, state: S): S;
  /** Whether the clock should run yet (e.g. Minesweeper starts on the first tap). */
  isStarted?(puzzle: P, state: S): boolean;
  /** Cells whose entries contradict the solution (for Check). */
  mistakes(puzzle: P, state: S): number[];
  /** The player has entered something (used for confirmations). */
  hasProgress(puzzle: P, state: S): boolean;
  /** Sanity check for saved data from older versions. */
  isValidSave?(puzzle: P, state: S): boolean;
  mount(ctx: GameContext<P, S>): GameView;
}

export interface GameContext<P, S> {
  /** Element the board is drawn into. */
  readonly board: HTMLElement;
  /** Area below the board for tools / number pad. */
  readonly toolbar: HTMLElement;
  readonly puzzle: P;
  /** Current player state; replaced on undo, so always read it through the context. */
  readonly state: S;
  /** The game is over (won or lost): input should be ignored. */
  readonly finished: boolean;
  /** Snapshot the state for Undo; call before mutating it. */
  checkpoint(): void;
  /** Persist, detect a win and re-render after a change. */
  commit(): void;
  /** Tell the shell the board's size in cell units so it can size `--cell`. */
  fit(cols: number, rows: number): void;
  setting(id: string): boolean;
  /** Replace the puzzle (e.g. Minesweeper generates its mines after the first tap). */
  replacePuzzle(puzzle: P, state: S): void;
  /** Runs a generator in the worker, with the loading indicator. */
  generate(variant: string, seed: number, extra?: unknown): Promise<P>;
}

export interface GameView {
  render(): void;
  /** Briefly flags cells as wrong after Check. */
  showMistakes(cells: number[]): void;
  destroy?(): void;
}
