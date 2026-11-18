import { t } from '../../core/i18n';
import { trackStrokes } from '../../core/pointer';
import { regionWalls } from '../../core/regions';
import type { GameModule } from '../../core/types';
import { el } from '../../core/util';
import { DEFAULT_VARIANT, NAMES, OBJECTS, ROOM_NAMES, VARIANTS, VICTIM, type AlibiPuzzle, type Clue } from './logic';

export interface AlibiState {
  /** Per person: the cell they are placed on, or -1. */
  pos: number[];
  /** Per person, per cell: 1 where the player ruled the square out for them. */
  marks: number[][];
}

const initial = (who: number): string => (who === VICTIM ? '☠' : NAMES[who - 1][0]);
const nameOf = (who: number, start = false): string =>
  who === VICTIM ? t(start ? 'The victim' : 'the victim') : NAMES[who - 1];

function token(who: number): HTMLElement {
  const node = el('span', `alibi-token tok-${who}`, initial(who));
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/** One statement as a verb phrase; a room name gets its colour swatch. */
function phrase(p: AlibiPuzzle, clue: Clue): (string | HTMLElement)[] {
  const object = () => {
    const o = OBJECTS[(clue as { object: number }).object];
    return `${t(o.name)} ${o.icon}`;
  };
  const other = () => nameOf((clue as { other: number }).other);
  switch (clue.kind) {
    case 'room': {
      const [before, after] = t('was in {room}', { room: '\u0001' }).split('\u0001');
      const chip = el('span', `alibi-swatch rg-${clue.room}`);
      const name = el('span', 'alibi-room');
      name.append(chip, t(ROOM_NAMES[p.roomNames[clue.room]]));
      return [before, name, after];
    }
    case 'beside':
      return [t('was next to {object}', { object: object() })];
    case 'row':
      return [t('was in the same row as {object}', { object: object() })];
    case 'col':
      return [t('was in the same column as {object}', { object: object() })];
    case 'clear':
      return [t('had no object next to them')];
    case 'outer':
      return [t('was touching an outside wall')];
    case 'alone':
      return [t('was alone in the room')];
    case 'with':
      return [t('was in the same room as {other}', { other: other() })];
    case 'diag':
      return [t('was touching {other} diagonally', { other: other() })];
    case 'above':
      return [t('was in a row above {other}', { other: other() })];
    case 'below':
      return [t('was in a row below {other}', { other: other() })];
    case 'left':
      return [t('was in a column to the left of {other}', { other: other() })];
    case 'right':
      return [t('was in a column to the right of {other}', { other: other() })];
  }
}

/** People who share a row or column with someone else. */
function clashes(n: number, pos: number[]): Set<number> {
  const out = new Set<number>();
  pos.forEach((i, a) => {
    pos.forEach((j, b) => {
      if (a < b && i >= 0 && j >= 0 && (Math.floor(i / n) === Math.floor(j / n) || i % n === j % n)) out.add(a).add(b);
    });
  });
  return out;
}

export const alibi: GameModule<AlibiPuzzle, AlibiState> = {
  id: 'alibi',
  title: 'Alibi',
  blurb: 'Use the statements to place everyone in the house and find who was alone with the victim.',
  icon: `<svg viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="3" fill="#fde68a"/><path fill="#bfdbfe" d="M15 2h10a3 3 0 0 1 3 3v10H15z"/><path fill="#bbf7d0" d="M2 17h13v11H5a3 3 0 0 1-3-3z"/><path fill="none" stroke="#1e293b" stroke-width="1.6" d="M15 2v26M15 15h13M2 17h13"/><circle cx="8.5" cy="9" r="4" fill="#dc2626"/><circle cx="21.5" cy="8.5" r="4" fill="#1e293b"/><circle cx="21.5" cy="21.5" r="4" fill="#2563eb"/><path stroke="#fff" stroke-width="1.4" stroke-linecap="round" d="M20 7l3 3m0-3l-3 3"/></svg>`,
  variants: VARIANTS,
  defaultVariant: DEFAULT_VARIANT,
  settings: [{ id: 'autoMark', label: 'Auto-✕ squares ruled out by people already placed', default: true }],
  newState: (p) => ({ pos: new Array(p.size).fill(-1), marks: Array.from({ length: p.size }, () => new Array(p.size * p.size).fill(0)) }),
  isSolved: (p, s) => p.solution.every((cell, who) => s.pos[who] === cell),
  // Coded as person × size² + cell, so the board can tell whose entry is wrong.
  mistakes: (p, s) =>
    p.solution.flatMap((cell, who) => {
      const at = who * p.size * p.size;
      if (s.pos[who] >= 0) return s.pos[who] === cell ? [] : [at + s.pos[who]];
      return s.marks[who][cell] ? [at + cell] : [];
    }),
  hasProgress: (_, s) => s.pos.some((i) => i >= 0) || s.marks.some((row) => row.some(Boolean)),
  isValidSave: (p, s) =>
    s.pos.length === p.size && s.marks.length === p.size && s.marks.every((row) => row.length === p.size * p.size),

  mount(ctx) {
    const { board } = ctx;
    const p = ctx.puzzle;
    const n = p.size;
    let sel = Math.max(0, ctx.state.pos.findIndex((i, who) => i < 0 && who !== VICTIM));

    board.classList.add('grid-board');
    board.style.setProperty('--n', String(n));
    board.setAttribute('role', 'grid');
    board.setAttribute('aria-label', t('Alibi board'));
    const cells = p.rooms.map((g, i) => {
      const cell = el('div', `cell rg-${g}`);
      cell.setAttribute('role', 'gridcell');
      if (p.objects[i] >= 0) cell.classList.add('object');
      else cell.dataset.i = String(i);
      board.append(cell);
      return cell;
    });
    board.append(regionWalls(n, p.rooms));
    ctx.fit(n, n);

    const verdict = el('p', 'alibi-verdict');
    const list = el('div', 'alibi-clues');
    const rows = p.clues.map((clues, who) => {
      const row = el('button', 'alibi-clue');
      row.type = 'button';
      const text = el('span', 'alibi-text');
      text.append(el('strong', '', nameOf(who, true)), ' ');
      clues.forEach((clue, k) => {
        if (k) text.append(t(' and '));
        text.append(...phrase(p, clue));
      });
      text.append('.');
      row.append(token(who), text);
      row.addEventListener('click', () => {
        select(who);
      });
      list.append(row);
      return row;
    });
    ctx.toolbar.append(verdict, list, el('p', 'hint', t('Pick a person, then tap: ✕ → place → empty.')));

    const occupant = (i: number) => ctx.state.pos.indexOf(i);

    /**
     * Shares the height between the board and the statements. The board keeps the largest size the shell would
     * give it anyway (its cell cap and margins, see `applyFit`) while the statements fit beside it; when they
     * don't, it gives up height down to squares that are still easy to tap, and only then does the list scroll.
     */
    const wrap = board.parentElement!;
    const layout = () => {
      const scroll = list.scrollTop;
      // Measured with the list collapsed: left at its full height it can push the board area off the screen.
      list.style.maxHeight = '0px';
      const shared = wrap.clientHeight;
      const cell = Math.min(72, Math.floor((wrap.clientWidth - 12) / n));
      const roomy = shared - (n * cell + 8);
      const tight = shared - (n * Math.min(cell, 40) + 8);
      list.style.maxHeight = `${Math.max(120, roomy, Math.min(list.scrollHeight, tight))}px`;
      list.scrollTop = scroll;
    };
    window.addEventListener('resize', layout);

    /** Squares shown with ✕ for the selected person: their own marks plus, if enabled, squares others rule out. */
    const shownMarks = () => {
      const shown = new Set<number>();
      ctx.state.marks[sel].forEach((v, i) => v && shown.add(i));
      if (ctx.setting('autoMark')) {
        ctx.state.pos.forEach((j, who) => {
          if (who === sel || j < 0) return;
          for (let i = 0; i < n * n; i++) {
            if (i !== j && p.objects[i] < 0 && (Math.floor(i / n) === Math.floor(j / n) || i % n === j % n)) shown.add(i);
          }
        });
      }
      return shown;
    };

    const render = () => {
      const { pos, marks } = ctx.state;
      layout();
      const shown = shownMarks();
      const clash = clashes(n, pos);
      const done = ctx.finished;
      // Rooms named in the selected person's statements are picked out on the board.
      const named = new Set(p.clues[sel].flatMap((clue) => (clue.kind === 'room' ? [clue.room] : [])));
      cells.forEach((cell, i) => {
        const who = occupant(i);
        const object = p.objects[i];
        const view = object >= 0 ? `o${object}` : who >= 0 ? `p${who}` : !done && shown.has(i) ? 'mark' : '';
        if (cell.dataset.v !== view) {
          cell.dataset.v = view;
          cell.replaceChildren();
          if (object >= 0) cell.append(el('span', 'alibi-object', OBJECTS[object].icon));
          else if (who >= 0) cell.append(token(who));
        }
        cell.classList.toggle('auto', view === 'mark' && !marks[sel][i]);
        cell.classList.toggle('sel', !done && who === sel);
        cell.classList.toggle('clash', who >= 0 && clash.has(who));
        cell.classList.toggle('named', !done && named.has(p.rooms[i]));
        cell.classList.toggle('culprit', done && who === p.culprit);
        cell.classList.remove('wrong');
        const content =
          object >= 0 ? t(OBJECTS[object].name) : who >= 0 ? nameOf(who) : t(view === 'mark' ? 'mark' : 'empty');
        cell.setAttribute(
          'aria-label',
          t('Row {r}, column {c}, {room}: {v}', {
            r: Math.floor(i / n) + 1,
            c: (i % n) + 1,
            room: t(ROOM_NAMES[p.roomNames[p.rooms[i]]]),
            v: content,
          }),
        );
      });
      rows.forEach((row, who) => {
        row.setAttribute('aria-pressed', String(!done && who === sel));
        row.classList.toggle('placed', pos[who] >= 0);
        row.classList.toggle('culprit', done && who === p.culprit);
        row.classList.remove('wrong');
      });
      verdict.hidden = !done;
      verdict.textContent = done
        ? t('{name} did it: the only one in {room} with the victim.', {
            name: nameOf(p.culprit),
            room: t(ROOM_NAMES[p.roomNames[p.rooms[p.solution[VICTIM]]]]),
          })
        : '';
    };

    const select = (who: number) => {
      sel = who;
      render();
      rows[who].scrollIntoView({ block: 'nearest' });
    };

    // A tap cycles the square for the selected person; a drag paints ✕ (or erases ✕ when it starts on one).
    let stroke: { start: number; erase: boolean; dirty: boolean } | null = null;
    const change = (apply: () => void) => {
      if (!stroke!.dirty) ctx.checkpoint();
      stroke!.dirty = true;
      apply();
    };
    const paint = (i: number) => {
      if (occupant(i) >= 0) return;
      const v = stroke!.erase ? 0 : 1;
      if (ctx.state.marks[sel][i] === v) return;
      change(() => (ctx.state.marks[sel][i] = v));
      render();
    };
    const stop = trackStrokes(board, {
      start(i) {
        if (ctx.finished) return false;
        const who = occupant(i);
        if (who >= 0 && who !== sel) {
          // Tapping someone else picks them.
          select(who);
          return false;
        }
        const marked = who < 0 && shownMarks().has(i);
        stroke = { start: i, erase: marked, dirty: false };
        if (who < 0 && !marked) paint(i);
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
        if (!moved && !stroke.dirty) {
          if (occupant(i) === sel) change(() => (ctx.state.pos[sel] = -1));
          else if (shownMarks().has(i)) {
            change(() => {
              ctx.state.pos[sel] = i;
              ctx.state.marks[sel][i] = 0;
            });
          }
        }
        const dirty = stroke.dirty;
        stroke = null;
        if (dirty) ctx.commit();
      },
    });

    return {
      render,
      showMistakes(wrong) {
        for (const code of wrong) {
          const who = Math.floor(code / (n * n));
          const cell = code % (n * n);
          // A misplaced person is flagged on the board; a wrong ✕ shows on its square only while that person is picked.
          if (ctx.state.pos[who] === cell || who === sel) cells[cell].classList.add('wrong');
          rows[who].classList.add('wrong');
        }
      },
      destroy() {
        stop();
        window.removeEventListener('resize', layout);
      },
    };
  },
};
