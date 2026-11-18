import { t } from '../../core/i18n';
import { trackStrokes } from '../../core/pointer';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { AGES, CATEGORIES, DEFAULT_VARIANT, NAMES, VARIANTS, type Clue, type Entity, type LogicGridPuzzle } from './logic';

const EMPTY = 0;
const NO = 1;
const YES = 2;
/** Width of the column of row names, in squares. */
const LABEL = 3;

export interface LogicGridState {
  /** Per square (row × size + person, rows running through the categories in order): empty, ✕ or ✓. */
  cells: number[];
  /** Per clue: 1 when the player crossed it off. */
  done: number[];
}

const nameOf = (p: LogicGridPuzzle, person: number): string => NAMES[p.names[person]];

/** What fills `{x}` in a category's sentence, e.g. "a dog" or "7 years old". */
function itemPhrase(p: LogicGridPuzzle, cat: number, item: number): string {
  const { type, items } = p.cats[cat];
  return type === AGES ? t('{n} years old', { n: items[item] }) : t(CATEGORIES[type].items[items[item]].phrase);
}

function itemLabel(p: LogicGridPuzzle, cat: number, item: number): string {
  const { type, items } = p.cats[cat];
  return type === AGES ? t('{n} years', { n: items[item] }) : t(CATEGORIES[type].items[items[item]].label);
}

/** "has a dog" / "doesn't have a dog". */
function does(p: LogicGridPuzzle, e: { cat: number; item: number }, negated = false): string {
  const def = CATEGORIES[p.cats[e.cat].type];
  return t(negated ? def.neg : def.pos, { x: itemPhrase(p, e.cat, e.item) });
}

/** A name, or "whoever has a dog". */
function subject(p: LogicGridPuzzle, e: Entity, start: boolean): string {
  if ('person' in e) return nameOf(p, e.person);
  return t(start ? 'Whoever {does}' : 'whoever {does}', { does: does(p, e) });
}

const AGE_TEXT = {
  older: '{a} is older than {b}',
  younger: '{a} is younger than {b}',
  older1: '{a} is one year older than {b}',
  younger1: '{a} is one year younger than {b}',
};

export function clueText(p: LogicGridPuzzle, clue: Clue): string {
  const a = subject(p, clue.a, true);
  if (clue.kind === 'either') {
    const def = CATEGORIES[p.cats[clue.cat].type];
    const [x, y] = clue.items.map((item) => itemPhrase(p, clue.cat, item));
    return `${a} ${t(def.pos, { x: t('{a} or {b}', { a: x, b: y }) })}.`;
  }
  if (clue.kind === 'same' || clue.kind === 'diff') {
    // The second one is always an item.
    return `${a} ${does(p, clue.b as { cat: number; item: number }, clue.kind === 'diff')}.`;
  }
  return `${t(AGE_TEXT[clue.kind], { a, b: subject(p, clue.b, false) })}.`;
}

export const logicgrid: GameModule<LogicGridPuzzle, LogicGridState> = {
  id: 'logicgrid',
  title: 'Logic Grid',
  blurb: 'Read the clues and work out who has what, crossing off what can’t be.',
  icon: `<svg viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="3" fill="#e0f2fe"/><path fill="#bae6fd" d="M2 5a3 3 0 0 1 3-3h23v8H2z"/><path fill="none" stroke="#1e293b" stroke-width="1.4" d="M2 10h26M2 19h26M11 2v26M20 2v26"/><path fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M13 14.5l2 2 3.2-4M4 23.5l2 2 3.2-4"/><path stroke="#dc2626" stroke-width="1.8" stroke-linecap="round" d="M4.5 12.5l4 4m0-4l-4 4M22 12.5l4 4m0-4l-4 4M13.5 21.5l4 4m0-4l-4 4"/></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  settings: [{ id: 'autoMark', label: 'Auto-✕ the rest of the row and column when you place a ✓', default: true }],
  newState: (p) => ({
    cells: new Array(p.cats.length * p.size * p.size).fill(EMPTY),
    done: new Array(p.clues.length).fill(0),
  }),
  isSolved: (p, s) =>
    s.cells.filter((v) => v === YES).length === p.cats.length * p.size &&
    p.solution.every((row, k) => row.every((item, person) => s.cells[(k * p.size + item) * p.size + person] === YES)),
  mistakes: (p, s) =>
    s.cells.flatMap((v, i) => {
      const n = p.size;
      const row = Math.floor(i / n);
      const right = p.solution[Math.floor(row / n)][i % n] === row % n;
      return (v === YES && !right) || (v === NO && right) ? [i] : [];
    }),
  hasProgress: (_, s) => s.cells.some(Boolean),
  isValidSave: (p, s) =>
    Array.isArray(s.cells) && s.cells.length === p.cats.length * p.size * p.size && Array.isArray(s.done) && s.done.length === p.clues.length,

  mount(ctx) {
    const { board } = ctx;
    const p = ctx.puzzle;
    const n = p.size;
    const rowCount = p.cats.length * n;

    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Logic Grid board'));
    board.append(el('div', 'lg-corner'));
    for (let person = 0; person < n; person++) board.append(el('div', 'lg-head', nameOf(p, person)));
    const cells: HTMLElement[] = [];
    for (let row = 0; row < rowCount; row++) {
      const k = Math.floor(row / n);
      const { type, items } = p.cats[k];
      const label = el('div', 'lg-label');
      label.append(el('span', 'lg-icon', type === AGES ? '🎂' : CATEGORIES[type].items[items[row % n]].icon));
      label.append(el('span', 'lg-name', itemLabel(p, k, row % n)));
      if (row % n === n - 1) label.classList.add('last');
      board.append(label);
      for (let person = 0; person < n; person++) {
        const cell = el('div', 'cell');
        cell.setAttribute('role', 'gridcell');
        cell.dataset.i = String(row * n + person);
        if (row === 0) cell.classList.add('edge-top');
        if (row % n === n - 1) cell.classList.add('sep-bottom');
        if (person === 0) cell.classList.add('edge-left');
        if (person === n - 1) cell.classList.add('sep-right');
        board.append(cell);
        cells.push(cell);
      }
    }
    ctx.fit(n + LABEL, rowCount + 1);

    const list = el('div', 'lg-clues');
    const rows = p.clues.map((clue, at) => {
      const row = el('button', 'lg-clue');
      row.type = 'button';
      row.append(el('span', 'lg-num', String(at + 1)), el('span', 'lg-text', clueText(p, clue)));
      row.addEventListener('click', () => {
        if (ctx.finished) return;
        ctx.checkpoint();
        ctx.state.done[at] = ctx.state.done[at] ? 0 : 1;
        ctx.commit();
      });
      list.append(row);
      return row;
    });
    const hint = el('p', 'hint', t('Tap: ✕ → ✓ → empty. Tap a clue to cross it off.'));
    ctx.toolbar.append(list, hint);

    /** The other squares of a square's row, and of its column within its category. */
    const peers = (i: number): number[] => {
      const row = Math.floor(i / n);
      const person = i % n;
      const first = row - (row % n);
      const out: number[] = [];
      for (let q = 0; q < n; q++) if (q !== person) out.push(row * n + q);
      for (let r = first; r < first + n; r++) if (r !== row) out.push(r * n + person);
      return out;
    };
    /** Whether the square shows a ✕: the player's own, or one that follows from a ✓. */
    const crossed = (i: number): boolean => {
      const { cells: v } = ctx.state;
      if (v[i] !== EMPTY) return v[i] === NO;
      return ctx.setting('autoMark') && peers(i).some((j) => v[j] === YES);
    };

    const render = () => {
      const { cells: v, done } = ctx.state;
      cells.forEach((cell, i) => {
        const yes = v[i] === YES;
        const cross = crossed(i);
        if (cell.classList.contains('yes') !== yes) cell.replaceChildren(...(yes ? [el('span', 'lg-yes', '✓')] : []));
        cell.classList.toggle('yes', yes);
        cell.classList.toggle('crossed', cross);
        cell.classList.toggle('auto', cross && v[i] === EMPTY);
        cell.classList.toggle('clash', yes && peers(i).some((j) => v[j] === YES));
        cell.classList.remove('wrong');
        const row = Math.floor(i / n);
        cell.setAttribute(
          'aria-label',
          t('{name}, {item}: {v}', {
            name: nameOf(p, i % n),
            item: itemLabel(p, Math.floor(row / n), row % n),
            v: t(yes ? 'yes' : cross ? 'no' : 'empty'),
          }),
        );
      });
      rows.forEach((row, at) => {
        row.classList.toggle('done', !!done[at] && !ctx.finished);
        row.setAttribute('aria-pressed', String(!!done[at]));
      });
      hint.hidden = ctx.finished;
    };

    // A tap cycles the square; a drag paints ✕ (or erases ✕ when it starts on one).
    let stroke: { start: number; erase: boolean; dirty: boolean } | null = null;
    const set = (i: number, v: number) => {
      if (!stroke!.dirty) ctx.checkpoint();
      stroke!.dirty = true;
      ctx.state.cells[i] = v;
    };
    const paint = (i: number) => {
      const v = stroke!.erase ? EMPTY : NO;
      if (ctx.state.cells[i] === YES || ctx.state.cells[i] === v) return;
      set(i, v);
      render();
    };
    const stop = trackStrokes(board, {
      start(i) {
        if (ctx.finished) return false;
        const marked = crossed(i);
        stroke = { start: i, erase: marked, dirty: false };
        if (ctx.state.cells[i] === EMPTY && !marked) paint(i);
        return true;
      },
      enter(i) {
        if (!stroke) return;
        paint(stroke.start);
        paint(i);
      },
      end(moved) {
        if (!stroke) return;
        const i = stroke.start;
        if (!moved && !stroke.dirty) set(i, ctx.state.cells[i] === YES ? EMPTY : YES);
        const dirty = stroke.dirty;
        stroke = null;
        if (dirty) ctx.commit();
      },
    });

    return {
      render,
      showMistakes(wrong) {
        for (const i of wrong) cells[i].classList.add('wrong');
      },
      destroy: stop,
    };
  },
};
