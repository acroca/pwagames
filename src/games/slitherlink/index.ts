import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, VARIANTS, type SlitherlinkPuzzle } from './logic';
import { t } from '../../core/i18n';

const EMPTY = 0;
const LINE = 1;
const CROSS = 2;
/** Margin around the dots, in cells, so taps on the outer edges have room. */
const PAD = 0.5;
/** A finger within this distance (in cells) of a dot counts as being on it while dragging. */
const DOT_RADIUS = 0.32;
/** Movement (in cells) that turns a tap into a drag. */
const DRAG_START = 0.25;
const SVG_NS = 'http://www.w3.org/2000/svg';

export interface SlitherlinkState {
  /** Per edge: EMPTY, LINE or CROSS. Horizontal edges first (`r * n + c`), then vertical (`h + r * (n + 1) + c`). */
  edges: number[];
}

const edgeCount = (n: number) => 2 * n * (n + 1);
const solutionEdges = (p: SlitherlinkPuzzle) => [...p.solution.h, ...p.solution.v];

/** Edge indices around a cell: top, bottom, left, right. */
function cellEdges(n: number, cell: number): number[] {
  const r = Math.floor(cell / n);
  const c = cell % n;
  const h = n * (n + 1);
  return [cell, cell + n, h + r * (n + 1) + c, h + r * (n + 1) + c + 1];
}

/** Edge indices touching a dot. */
function dotEdges(n: number, dot: number): number[] {
  const r = Math.floor(dot / (n + 1));
  const c = dot % (n + 1);
  const h = n * (n + 1);
  const out: number[] = [];
  if (c > 0) out.push(r * n + c - 1);
  if (c < n) out.push(r * n + c);
  if (r > 0) out.push(h + (r - 1) * (n + 1) + c);
  if (r < n) out.push(h + r * (n + 1) + c);
  return out;
}

/** The edge joining two orthogonally adjacent dots, or null. */
function edgeBetween(n: number, a: number, b: number): number | null {
  const [ra, ca, rb, cb] = [Math.floor(a / (n + 1)), a % (n + 1), Math.floor(b / (n + 1)), b % (n + 1)];
  if (ra === rb && Math.abs(ca - cb) === 1) return ra * n + Math.min(ca, cb);
  if (ca === cb && Math.abs(ra - rb) === 1) return n * (n + 1) + Math.min(ra, rb) * (n + 1) + ca;
  return null;
}

/** The edge closest to a point given in cell units (dot (0,0) at the origin). */
function nearestEdge(n: number, x: number, y: number): number | null {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const hr = clamp(Math.round(y), 0, n);
  const hc = clamp(Math.floor(x), 0, n - 1);
  const hd = Math.hypot(y - hr, x - clamp(x, hc, hc + 1));
  const vc = clamp(Math.round(x), 0, n);
  const vr = clamp(Math.floor(y), 0, n - 1);
  const vd = Math.hypot(x - vc, y - clamp(y, vr, vr + 1));
  if (Math.min(hd, vd) > 0.6) return null;
  return hd <= vd ? hr * n + hc : n * (n + 1) + vr * (n + 1) + vc;
}

export const slitherlink: GameModule<SlitherlinkPuzzle, SlitherlinkState> = {
  id: 'slitherlink',
  title: 'Slitherlink',
  blurb: 'Draw one closed loop that matches every number.',
  icon: `<svg viewBox="0 0 30 30"><g fill="currentColor"><circle cx="4" cy="4" r="1.6"/><circle cx="15" cy="4" r="1.6"/><circle cx="26" cy="4" r="1.6"/><circle cx="4" cy="15" r="1.6"/><circle cx="15" cy="15" r="1.6"/><circle cx="26" cy="15" r="1.6"/><circle cx="4" cy="26" r="1.6"/><circle cx="15" cy="26" r="1.6"/><circle cx="26" cy="26" r="1.6"/></g><path d="M4 4h22v11H15v11H4z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><text x="20.5" y="24" font-family="system-ui,sans-serif" font-weight="700" font-size="9" text-anchor="middle" fill="currentColor">1</text></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  newState: (p) => ({ edges: new Array(edgeCount(p.size)).fill(EMPTY) }),
  isSolved: (p, s) => solutionEdges(p).every((on, i) => (s.edges[i] === LINE) === on),
  mistakes: (p, s) => {
    const sol = solutionEdges(p);
    return s.edges.flatMap((v, i) => ((v === LINE && !sol[i]) || (v === CROSS && sol[i]) ? [i] : []));
  },
  hasProgress: (_, s) => s.edges.some((v) => v !== EMPTY),
  isValidSave: (p, s) => s.edges.length === edgeCount(p.size),

  mount(ctx) {
    const { board } = ctx;
    const { size: n, clues } = ctx.puzzle;
    const span = n + 2 * PAD;
    const h = n * (n + 1);
    board.style.setProperty('--span', String(span));
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${span} ${span}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('Slitherlink board'));
    board.append(svg);
    const make = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.append(node);
      return node;
    };

    const ends = (e: number): [number, number, number, number] => {
      if (e < h) {
        const [r, c] = [Math.floor(e / n), e % n];
        return [c, r, c + 1, r];
      }
      const [r, c] = [Math.floor((e - h) / (n + 1)), (e - h) % (n + 1)];
      return [c, r, c, r + 1];
    };
    const clueText = clues.map((v, i) =>
      v < 0 ? null : make('text', { x: (i % n) + 0.5, y: Math.floor(i / n) + 0.5, class: 'clue' }),
    );
    clueText.forEach((t, i) => t && (t.textContent = String(clues[i])));
    const edgeEls = Array.from({ length: edgeCount(n) }, (_, e) => {
      const [x1, y1, x2, y2] = ends(e);
      const g = make('g', { class: 'edge' });
      make('line', { x1, y1, x2, y2, class: 'ln' }, g);
      const [mx, my, d] = [(x1 + x2) / 2, (y1 + y2) / 2, 0.09];
      make('path', { d: `M${mx - d} ${my - d}L${mx + d} ${my + d}M${mx + d} ${my - d}L${mx - d} ${my + d}`, class: 'x' }, g);
      return g;
    });
    const dotEls = Array.from({ length: (n + 1) * (n + 1) }, (_, d) =>
      make('circle', { cx: d % (n + 1), cy: Math.floor(d / (n + 1)), r: 0.07, class: 'dot' }),
    );
    ctx.fit(span, span);
    ctx.toolbar.append(el('p', 'hint', t('Tap a gap: line → ✕ → empty. Drag dot to dot to draw.')));

    const render = () => {
      const s = ctx.state.edges;
      edgeEls.forEach((g, e) => {
        g.setAttribute('class', `edge${s[e] === LINE ? ' on' : s[e] === CROSS ? ' off' : ''}`);
      });
      clueText.forEach((t, i) => {
        if (!t) return;
        const sides = cellEdges(n, i).map((e) => s[e]);
        const lines = sides.filter((v) => v === LINE).length;
        const open = sides.filter((v) => v === EMPTY).length;
        const bad = lines > clues[i] || lines + open < clues[i];
        t.setAttribute('class', `clue${bad ? ' bad' : lines === clues[i] ? ' done' : ''}`);
      });
      dotEls.forEach((dot, d) => {
        const lines = dotEdges(n, d).filter((e) => s[e] === LINE).length;
        dot.setAttribute('class', `dot${lines > 2 ? ' bad' : ''}`);
      });
    };

    const local = (e: PointerEvent): [number, number] => {
      const r = svg.getBoundingClientRect();
      const k = r.width / span;
      return [(e.clientX - r.left) / k - PAD, (e.clientY - r.top) / k - PAD];
    };
    const dotNear = (x: number, y: number, radius: number): number | null => {
      const [c, r] = [Math.round(x), Math.round(y)];
      if (c < 0 || r < 0 || c > n || r > n || Math.hypot(x - c, y - r) > radius) return null;
      return r * (n + 1) + c;
    };

    let g: {
      id: number;
      x0: number;
      y0: number;
      x: number;
      y: number;
      dot: number | null;
      moved: boolean;
      paint: number | null;
      dirty: boolean;
    } | null = null;
    const set = (e: number, v: number) => {
      if (ctx.state.edges[e] === v) return;
      if (!g!.dirty) ctx.checkpoint();
      g!.dirty = true;
      ctx.state.edges[e] = v;
    };
    const visit = (x: number, y: number) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(x - g!.x, y - g!.y) / 0.1));
      for (let k = 1; k <= steps; k++) {
        const dot = dotNear(g!.x + ((x - g!.x) * k) / steps, g!.y + ((y - g!.y) * k) / steps, DOT_RADIUS);
        if (dot === null || dot === g!.dot) continue;
        const e = g!.dot === null ? null : edgeBetween(n, g!.dot, dot);
        g!.dot = dot;
        if (e === null) continue;
        g!.paint ??= ctx.state.edges[e] === LINE ? EMPTY : LINE;
        set(e, g!.paint);
      }
      g!.x = x;
      g!.y = y;
    };

    const down = (e: PointerEvent) => {
      if (g || !e.isPrimary || ctx.finished) return;
      e.preventDefault();
      const [x, y] = local(e);
      g = { id: e.pointerId, x0: x, y0: y, x, y, dot: dotNear(x, y, 0.5), moved: false, paint: null, dirty: false };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const [x, y] = local(e);
      if (!g.moved && Math.hypot(x - g.x0, y - g.y0) < DRAG_START) return;
      g.moved = true;
      const before = g.dirty;
      visit(x, y);
      if (g.dirty || before) render();
    };
    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      if (!g.moved && e.type === 'pointerup') {
        const edge = nearestEdge(n, g.x0, g.y0);
        if (edge !== null) set(edge, (ctx.state.edges[edge] + 1) % 3);
      }
      const { dirty } = g;
      g = null;
      if (dirty) ctx.commit();
    };
    board.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    return {
      render,
      showMistakes: (wrong) => wrong.forEach((e) => edgeEls[e].classList.add('wrong')),
      destroy() {
        board.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      },
    };
  },
};
