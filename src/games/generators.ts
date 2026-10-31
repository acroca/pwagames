import { generatePuzzle as nonogram } from './nonogram/logic';

/** Puzzle generators by game id. Imported by the generation worker, so keep this free of DOM code. */
export const GENERATORS: Record<string, (variant: string, seed: number, extra?: any) => unknown> = {
  nonogram: (variant, seed) => nonogram(Number(variant), seed),
};
