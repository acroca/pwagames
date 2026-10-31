import { registerSW } from 'virtual:pwa-register';
import {
  BLANK,
  CROSS,
  FILL,
  Stroke,
  isSolved,
  lineSatisfied,
  loadGame,
  newGame,
  saveGame,
  type GameState,
  type Mark,
  type Tool,
} from './game';
import { col, row } from './nonogram';
import './style.css';

registerSW({ immediate: true });

const SIZE = 10;
const MAX_HISTORY = 200;

const boardEl = document.querySelector<HTMLDivElement>('#board')!;
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const puzzleIdEl = document.querySelector<HTMLSpanElement>('#puzzle-id')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo')!;
const restartBtn = document.querySelector<HTMLButtonElement>('#restart')!;
const newBtn = document.querySelector<HTMLButtonElement>('#new')!;
const toolBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')];

let state: GameState = loadGame() ?? newGame(SIZE);
let tool: Tool = FILL;
let history: Mark[][] = [];
let stroke: { stroke: Stroke; pointerId: number; before: Mark[]; changed: boolean } | null = null;

let cellEls: HTMLDivElement[] = [];
let rowClueEls: HTMLDivElement[] = [];
let colClueEls: HTMLDivElement[] = [];

function clueEl(className: string, clue: number[]): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  for (const n of clue.length ? clue : [0]) {
    const span = document.createElement('span');
    span.textContent = String(n);
    el.append(span);
  }
  return el;
}

function buildBoard() {
  const { size, rows, cols } = state.puzzle;
  boardEl.replaceChildren();
  boardEl.style.setProperty('--size', String(size));
  cellEls = [];
  rowClueEls = [];
  colClueEls = [];

  boardEl.append(Object.assign(document.createElement('div'), { className: 'corner' }));
  cols.forEach((clue) => {
    const el = clueEl('clue col-clue', clue);
    colClueEls.push(el);
    boardEl.append(el);
  });
  for (let r = 0; r < size; r++) {
    const el = clueEl('clue row-clue', rows[r]);
    rowClueEls.push(el);
    boardEl.append(el);
    for (let c = 0; c < size; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.setAttribute('role', 'gridcell');
      if (r === 0) cell.classList.add('edge-top');
      if (c === 0) cell.classList.add('edge-left');
      if (c % 5 === 4 || c === size - 1) cell.classList.add('sep-right');
      if (r % 5 === 4 || r === size - 1) cell.classList.add('sep-bottom');
      cellEls.push(cell);
      boardEl.append(cell);
    }
  }
  puzzleIdEl.textContent = `#${state.puzzle.seed.toString(36).toUpperCase()}`;
  render();
}

const MARK_CLASS: Record<Mark, string> = { [BLANK]: '', [FILL]: 'filled', [CROSS]: 'crossed' };
const MARK_LABEL: Record<Mark, string> = { [BLANK]: 'empty', [FILL]: 'filled', [CROSS]: 'marked blocked' };

function renderCell(i: number) {
  const el = cellEls[i];
  const mark = state.cells[i];
  el.classList.remove('filled', 'crossed');
  if (mark !== BLANK) el.classList.add(MARK_CLASS[mark]);
  el.setAttribute('aria-label', `Row ${Math.floor(i / SIZE) + 1}, column ${(i % SIZE) + 1}: ${MARK_LABEL[mark]}`);
}

function renderClues() {
  const { size, rows, cols } = state.puzzle;
  for (let i = 0; i < size; i++) {
    rowClueEls[i].classList.toggle('done', lineSatisfied(row(state.cells, size, i), rows[i]));
    colClueEls[i].classList.toggle('done', lineSatisfied(col(state.cells, size, i), cols[i]));
  }
}

function render() {
  state.cells.forEach((_, i) => renderCell(i));
  renderClues();
  boardEl.classList.toggle('solved', state.solved);
  statusEl.textContent = state.solved ? 'Solved! 🎉' : '';
  undoBtn.disabled = history.length === 0 || state.solved;
  restartBtn.disabled = state.solved || state.cells.every((m) => m === BLANK);
  toolBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.tool) === tool)));
}

function setTool(t: Tool) {
  tool = t;
  render();
}

function commit() {
  state.solved = isSolved(state);
  saveGame(state);
  render();
}

function pushHistory(snapshot: Mark[]) {
  history.push(snapshot);
  if (history.length > MAX_HISTORY) history.shift();
}

function cellAt(x: number, y: number): { row: number; col: number } | null {
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof HTMLElement) || !el.classList.contains('cell') || !boardEl.contains(el)) return null;
  return { row: Number(el.dataset.row), col: Number(el.dataset.col) };
}

function applyStroke(r: number, c: number) {
  if (!stroke) return;
  const changed = stroke.stroke.apply(state.cells, r, c);
  if (changed.length) {
    stroke.changed = true;
    changed.forEach(renderCell);
    renderClues();
  }
}

boardEl.addEventListener('pointerdown', (e) => {
  if (state.solved || stroke) return;
  const target = cellAt(e.clientX, e.clientY);
  if (!target) return;
  e.preventDefault();
  // Right click (or pen eraser button) always marks blocked cells.
  const strokeTool: Tool = e.button === 2 || e.button === 5 ? CROSS : tool;
  stroke = {
    stroke: new Stroke(SIZE, target.row, target.col, state.cells, strokeTool),
    pointerId: e.pointerId,
    before: [...state.cells],
    changed: false,
  };
  applyStroke(target.row, target.col);
});

window.addEventListener('pointermove', (e) => {
  if (!stroke || e.pointerId !== stroke.pointerId) return;
  const target = cellAt(e.clientX, e.clientY);
  if (target) applyStroke(target.row, target.col);
});

function endStroke(e: PointerEvent) {
  if (!stroke || e.pointerId !== stroke.pointerId) return;
  if (stroke.changed) {
    pushHistory(stroke.before);
    commit();
  }
  stroke = null;
}
window.addEventListener('pointerup', endStroke);
window.addEventListener('pointercancel', endStroke);
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

boardEl.addEventListener('pointerover', (e) => {
  const el = e.target as HTMLElement;
  if (!el.classList.contains('cell')) return;
  const r = Number(el.dataset.row);
  const c = Number(el.dataset.col);
  rowClueEls.forEach((x, i) => x.classList.toggle('active', i === r));
  colClueEls.forEach((x, i) => x.classList.toggle('active', i === c));
});
boardEl.addEventListener('pointerleave', () => {
  [...rowClueEls, ...colClueEls].forEach((x) => x.classList.remove('active'));
});

function undo() {
  const prev = history.pop();
  if (!prev || state.solved) return;
  state.cells = prev;
  commit();
}

toolBtns.forEach((b) => b.addEventListener('click', () => setTool(Number(b.dataset.tool) as Tool)));
undoBtn.addEventListener('click', undo);

restartBtn.addEventListener('click', () => {
  if (!confirm('Clear the board and start this puzzle over?')) return;
  pushHistory([...state.cells]);
  state.cells = state.cells.map(() => BLANK);
  commit();
});

newBtn.addEventListener('click', () => {
  const inProgress = !state.solved && state.cells.some((m) => m !== BLANK);
  if (inProgress && !confirm('Abandon this puzzle and start a new one?')) return;
  state = newGame(SIZE);
  history = [];
  saveGame(state);
  buildBoard();
});

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if (e.key === 'f' || e.key === '1') {
    setTool(FILL);
  } else if (e.key === 'x' || e.key === '2') {
    setTool(CROSS);
  }
});

buildBoard();
