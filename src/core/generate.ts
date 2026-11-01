import type { GenerateRequest, GenerateResponse } from './worker';

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (p: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<GenerateResponse>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if ('error' in e.data) job.reject(new Error(e.data.error));
      else job.resolve(e.data.puzzle);
    };
    worker.onerror = () => {
      // The worker failed to load: fall back to the main thread for everything.
      worker = null;
      const jobs = [...pending.values()];
      pending.clear();
      jobs.forEach((job) => job.reject(new Error('worker failed')));
    };
  } catch {
    worker = null;
  }
  return worker;
}

async function generateHere(game: string, variant: string, seed: number, extra?: unknown): Promise<unknown> {
  const { GENERATORS } = await import('../games/generators');
  // Let the loading indicator paint before blocking the main thread.
  await new Promise((r) => setTimeout(r, 30));
  return GENERATORS[game](variant, seed, extra);
}

/** Generates a puzzle off the main thread (falls back to the main thread if workers fail). */
export async function generatePuzzle<P>(game: string, variant: string, seed: number, extra?: unknown): Promise<P> {
  const w = getWorker();
  if (!w) return (await generateHere(game, variant, seed, extra)) as P;
  const id = nextId++;
  const request: GenerateRequest = { id, game, variant, seed, extra };
  try {
    return (await new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage(request);
    })) as P;
  } catch {
    return (await generateHere(game, variant, seed, extra)) as P;
  }
}
