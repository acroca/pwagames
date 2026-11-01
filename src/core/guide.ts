import { guideFor, type Example } from './guides';
import { lang, onLangChange, t } from './i18n';
import { el } from './util';
import { GAMES } from '../games/registry';

const dialog = () => document.querySelector<HTMLDialogElement>('#guide')!;

/** Draws a token grid: `.` empty, `#` dark, `#x` shaded x, `*x` highlighted x, anything else as text. */
function renderGrid(rows: string[]): HTMLElement {
  const grid = el('div', 'ex-grid');
  grid.setAttribute('role', 'img');
  rows.forEach((row) => {
    const line = el('div', 'ex-row');
    row.split(' ').forEach((tok) => {
      const cell = el('span', 'ex-cell');
      if (tok === '#') cell.classList.add('dark');
      else if (tok === '.') cell.classList.add('blank');
      else if (tok.startsWith('#')) {
        cell.classList.add('dark');
        cell.textContent = tok.slice(1);
      } else if (tok.startsWith('*')) {
        cell.classList.add('hl');
        cell.textContent = tok.slice(1);
      } else {
        if (/^[<>]$/.test(tok)) cell.classList.add('op');
        else if (tok.length > 2) cell.classList.add('wide');
        cell.textContent = tok;
      }
      line.append(cell);
    });
    grid.append(line);
  });
  return grid;
}

function renderExample(e: Example): HTMLElement {
  const box = el('figure', 'example');
  if (e.grid) box.append(renderGrid(e.grid));
  if (e.pre) box.append(el('pre', 'ex-pre', e.pre));
  box.append(el('figcaption', '', e.caption));
  return box;
}

function section(title: string, node: HTMLElement): HTMLElement {
  const wrap = el('section', 'guide-section');
  wrap.append(el('h3', '', title), node);
  return wrap;
}

function list(items: string[]): HTMLElement {
  const ul = el('ul');
  items.forEach((i) => ul.append(el('li', '', i)));
  return ul;
}

let shownGame: string | null = null;

function render() {
  const body = el('div', 'sheet-body guide');
  const game = GAMES.find((g) => g.id === shownGame);
  const guide = game ? guideFor(game.id, lang()) : null;

  if (game && guide) {
    const back = el('button', 'guide-back', `‹ ${t('All rules')}`);
    back.type = 'button';
    back.addEventListener('click', () => open(null));
    const title = el('h2', '', t(game.title));
    const icon = el('span', 'guide-icon');
    icon.innerHTML = game.icon;
    icon.setAttribute('aria-hidden', 'true');
    const head = el('div', 'guide-head');
    head.append(icon, title);
    body.append(back, head);
    body.append(section(t('Goal'), el('p', '', guide.goal)));
    body.append(section(t('Rules of the game'), list(guide.rules)));
    body.append(section(t('Controls'), list(guide.controls)));
    const examples = el('div');
    guide.examples.forEach((e) => examples.append(renderExample(e)));
    body.append(section(t('Example'), examples));
    body.append(section(t('Tips'), list(guide.tips)));
  } else {
    body.append(el('h2', '', t('Rules & how to play')));
    body.append(el('p', 'guide-intro', t('Choose a game to learn how to play it.')));
    const cards = el('div', 'guide-list');
    for (const g of GAMES) {
      const btn = el('button', 'guide-item');
      btn.type = 'button';
      const icon = el('span', 'guide-icon');
      icon.innerHTML = g.icon;
      icon.setAttribute('aria-hidden', 'true');
      const text = el('span', 'guide-item-text');
      text.append(el('strong', '', t(g.title)), el('small', '', t(g.blurb)));
      btn.append(icon, text, el('span', 'chev', '›'));
      btn.addEventListener('click', () => open(g.id));
      cards.append(btn);
    }
    body.append(cards);
  }

  const close = el('button', 'wide', t('Close'));
  close.type = 'button';
  close.addEventListener('click', () => dialog().close());
  body.append(close);
  dialog().replaceChildren(body);
  body.scrollTop = 0;
}

function open(id: string | null) {
  shownGame = id;
  render();
  if (!dialog().open) dialog().showModal();
}

/** Opens the rules dialog, on a specific game or on the list of all games. */
export function openGuide(gameId: string | null = null) {
  open(gameId);
}

onLangChange(() => {
  if (dialog().open) render();
});
