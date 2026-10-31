/// <reference lib="webworker" />
import { GENERATORS } from '../games/generators';

export interface GenerateRequest {
  id: number;
  game: string;
  variant: string;
  seed: number;
  extra?: unknown;
}

export type GenerateResponse = { id: number; puzzle: unknown } | { id: number; error: string };

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { id, game, variant, seed, extra } = e.data;
  let response: GenerateResponse;
  try {
    response = { id, puzzle: GENERATORS[game](variant, seed, extra) };
  } catch (err) {
    response = { id, error: String(err) };
  }
  self.postMessage(response);
};
