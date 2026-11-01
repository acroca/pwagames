import { trackStrokes } from './pointer';
import type { GameContext } from './types';
import { el } from './util';
import { t } from './i18n';

/** Player state for the number-entry games (Sudoku, KenKen, Kakuro…). */
export interface PadState {
  /** Per cell: 0 = empty, otherwise the digit (givens included). */
  values: number[];
  /** Per cell: pencil marks, bit d set for digit d. */
  notes: number[];
}

export const newPadState = (givens: number[]): PadState => ({ values: [...givens], notes: givens.map(() => 0) });

/** Filled, non-given cells whose digit differs from the solution. */
export const padMistakes = (givens: number[], solution: number[], s: PadState): number[] =>
  s.values.flatMap((v, i) => (v && !givens[i] && v !== solution[i] ? [i] : []));

export const padSolved = (solution: number[], s: PadState): boolean => s.values.every((v, i) => v === solution[i]);

export const padProgress = (givens: number[], s: PadState): boolean =>
  s.values.some((v, i) => v && !givens[i]) || s.notes.some((n) => n);

export const padValidSave = (cells: number, s: PadState): boolean =>
  Array.isArray(s?.values) && Array.isArray(s?.notes) && s.values.length === cells && s.notes.length === cells;

export interface PadOptions {
  ctx: GameContext<unknown, PadState>;
  /** Board element per cell index, or null for cells that take no input (e.g. Kakuro clues). */
  cells: (HTMLElement | null)[];
  /** Digits 1..max. */
  max: number;
  /** Given cells can be selected but not changed. */
  locked(i: number): boolean;
  /** Cells that may not repeat this cell's digit: entering a digit clears it from their notes. */
  peers(i: number): number[];
  /** Cells to shade around the selection (defaults to `peers`). */
  related?(i: number): number[];
  /** How many times each digit appears in a solved grid; its pad button dims once placed that often. */
  digitTotal?: number;
  /** Called after selection or content changes (e.g. to update a helper panel). */
  onChange?(selected: number | null): void;
}

export interface Pad {
  render(): void;
  showMistakes(cells: number[]): void;
  destroy(): void;
}

/**
 * Select-a-cell-then-tap-a-digit input with notes, shared by the number games.
 * Draws digits and notes into `.val` / `.notes` children of each cell and the
 * number pad into the toolbar. Never uses the system keyboard.
 */
export function mountPad(opts: PadOptions): Pad {
  const { ctx, cells, max } = opts;
  const related = opts.related ?? opts.peers;
  let selected: number | null = null;
  let notesMode = false;

  const noteCols = max <= 4 ? 2 : 3;
  for (const cell of cells) {
    if (!cell) continue;
    const notes = el('div', 'notes');
    notes.style.setProperty('--note-cols', String(noteCols));
    notes.style.setProperty('--note-rows', String(Math.ceil(max / noteCols)));
    for (let d = 1; d <= max; d++) notes.append(el('span', '', ''));
    cell.append(el('span', 'val'), notes);
  }

  // Number pad: digits plus erase, and a notes toggle.
  const pad = el('div', 'numpad');
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', t('Number pad'));
  const cols = max <= 6 ? max + 1 : Math.ceil((max + 1) / 2);
  pad.style.setProperty('--pad-cols', String(cols));
  const digitBtns: HTMLButtonElement[] = [];
  for (let d = 1; d <= max; d++) {
    const b = el('button', 'pad-btn', String(d));
    b.type = 'button';
    b.addEventListener('click', () => enter(d));
    digitBtns.push(b);
    pad.append(b);
  }
  const erase = el('button', 'pad-btn pad-erase', '⌫');
  erase.type = 'button';
  erase.setAttribute('aria-label', t('Erase'));
  erase.addEventListener('click', () => clear());
  pad.append(erase);

  const modes = el('div', 'pad-modes');
  const notesBtn = el('button', 'tool notes-toggle');
  notesBtn.type = 'button';
  notesBtn.append(el('span', 'pencil', '✎'), el('span', '', t('Notes')));
  notesBtn.addEventListener('click', () => {
    notesMode = !notesMode;
    renderPad();
  });
  modes.append(notesBtn);
  ctx.toolbar.append(modes, pad);

  const editable = (i: number | null): i is number => i !== null && !ctx.finished && !opts.locked(i);

  function enter(d: number) {
    if (!editable(selected)) return;
    const i = selected;
    const s = ctx.state;
    if (notesMode && !s.values[i]) {
      ctx.checkpoint();
      ctx.state.notes[i] ^= 1 << d;
    } else if (notesMode) {
      return;
    } else {
      ctx.checkpoint();
      const next = ctx.state;
      if (next.values[i] === d) {
        next.values[i] = 0;
      } else {
        next.values[i] = d;
        for (const j of opts.peers(i)) next.notes[j] &= ~(1 << d);
      }
    }
    ctx.commit();
  }

  function clear() {
    if (!editable(selected)) return;
    const i = selected;
    if (!ctx.state.values[i] && !ctx.state.notes[i]) return;
    ctx.checkpoint();
    const s = ctx.state;
    if (s.values[i]) s.values[i] = 0;
    else s.notes[i] = 0;
    ctx.commit();
  }

  function renderPad() {
    notesBtn.setAttribute('aria-pressed', String(notesMode));
    pad.classList.toggle('notes-on', notesMode);
    if (opts.digitTotal) {
      const counts = new Array(max + 1).fill(0);
      for (const v of ctx.state.values) counts[v]++;
      digitBtns.forEach((b, k) => b.classList.toggle('done', counts[k + 1] >= opts.digitTotal!));
    }
  }

  function render() {
    const { values, notes } = ctx.state;
    const sel = selected;
    const rel = new Set(sel === null ? [] : related(sel));
    const selValue = sel === null ? 0 : values[sel];
    cells.forEach((cell, i) => {
      if (!cell) return;
      const v = values[i];
      const val = cell.querySelector('.val')!;
      val.textContent = v ? String(v) : '';
      const noteEls = cell.querySelector('.notes')!.children;
      for (let d = 1; d <= max; d++) {
        const on = !v && (notes[i] >> d) & 1;
        noteEls[d - 1].textContent = on ? String(d) : '';
        noteEls[d - 1].classList.toggle('hit', !!on && d === selValue);
      }
      const clash = !!v && opts.peers(i).some((j) => values[j] === v);
      cell.classList.toggle('given', opts.locked(i));
      cell.classList.toggle('sel', i === sel);
      cell.classList.toggle('rel', rel.has(i) && i !== sel);
      cell.classList.toggle('same', !!selValue && v === selValue && i !== sel);
      cell.classList.toggle('clash', clash);
      cell.classList.remove('wrong');
      cell.setAttribute('aria-selected', String(i === sel));
    });
    renderPad();
    opts.onChange?.(sel);
  }

  const stop = trackStrokes(ctx.board, {
    start(i) {
      if (!cells[i]) return false;
      selected = i;
      render();
      return true;
    },
    enter(i) {
      if (!cells[i]) return;
      selected = i;
      render();
    },
    end() {},
  });

  return {
    render,
    showMistakes: (wrong) => wrong.forEach((i) => cells[i]?.classList.add('wrong')),
    destroy: stop,
  };
}

/** Cells in the same row, column or box of a square grid (box = 0 for no boxes). */
export function gridPeers(n: number, box = 0): (i: number) => number[] {
  const cache: number[][] = [];
  return (i) => {
    if (cache[i]) return cache[i];
    const r = Math.floor(i / n);
    const c = i % n;
    const out = new Set<number>();
    for (let k = 0; k < n; k++) {
      out.add(r * n + k);
      out.add(k * n + c);
    }
    if (box) {
      const br = r - (r % box);
      const bc = c - (c % box);
      for (let dr = 0; dr < box; dr++) for (let dc = 0; dc < box; dc++) out.add((br + dr) * n + bc + dc);
    }
    out.delete(i);
    return (cache[i] = [...out]);
  };
}
