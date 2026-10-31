/** Index of the board cell (an element with `data-i`) under a viewport point. */
export function cellAt(board: HTMLElement, x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  const cell = el instanceof Element ? el.closest<HTMLElement>('[data-i]') : null;
  if (!cell || !board.contains(cell)) return null;
  return Number(cell.dataset.i);
}

export interface StrokeHandlers {
  /** Finger down on a cell; return false to ignore the gesture. */
  start(cell: number): boolean;
  /** The finger moved onto another cell (gaps from fast swipes are filled in). */
  enter?(cell: number): void;
  /** Finger lifted. `moved` is false for a plain tap. */
  end(moved: boolean): void;
}

/**
 * Tracks one-finger tap/drag gestures over the cells of a board. Extra fingers
 * are ignored. Returns a function that removes the listeners.
 */
export function trackStrokes(board: HTMLElement, handlers: StrokeHandlers, hit = cellAt): () => void {
  let active: { pointerId: number; last: number; x: number; y: number; moved: boolean } | null = null;

  const visit = (x: number, y: number) => {
    if (!active) return;
    // Sample along the segment so quick swipes don't skip cells.
    const dx = x - active.x;
    const dy = y - active.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
    for (let s = 1; s <= steps; s++) {
      const cell = hit(board, active.x + (dx * s) / steps, active.y + (dy * s) / steps);
      if (cell !== null && cell !== active.last) {
        active.last = cell;
        active.moved = true;
        handlers.enter?.(cell);
      }
    }
    active.x = x;
    active.y = y;
  };

  const down = (e: PointerEvent) => {
    if (active || !e.isPrimary) return;
    const cell = hit(board, e.clientX, e.clientY);
    if (cell === null) return;
    e.preventDefault();
    if (!handlers.start(cell)) return;
    active = { pointerId: e.pointerId, last: cell, x: e.clientX, y: e.clientY, moved: false };
  };
  const move = (e: PointerEvent) => {
    if (active && e.pointerId === active.pointerId) visit(e.clientX, e.clientY);
  };
  const up = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.pointerId) return;
    const { moved } = active;
    active = null;
    handlers.end(moved);
  };

  board.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return () => {
    board.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
}

/**
 * Tap-to-cycle / drag-to-paint input shared by the shading games: a tap
 * advances the cell to the next value, a drag paints the first cell's new
 * value onto every cell the finger passes over.
 */
export function cyclePaint(opts: {
  board: HTMLElement;
  canEdit(): boolean;
  locked(i: number): boolean;
  get(i: number): number;
  set(i: number, v: number): void;
  next(v: number): number;
  checkpoint(): void;
  /** A cell changed (render it). */
  changed(i: number): void;
  commit(): void;
}): () => void {
  let paint: number | null = null;
  let dirty = false;
  const apply = (i: number) => {
    if (paint === null || opts.locked(i) || opts.get(i) === paint) return;
    if (!dirty) opts.checkpoint();
    dirty = true;
    opts.set(i, paint);
    opts.changed(i);
  };
  return trackStrokes(opts.board, {
    start(i) {
      if (!opts.canEdit() || opts.locked(i)) return false;
      dirty = false;
      paint = opts.next(opts.get(i));
      apply(i);
      return true;
    },
    enter: apply,
    end() {
      paint = null;
      if (dirty) opts.commit();
    },
  });
}
