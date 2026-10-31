import { registerSW } from 'virtual:pwa-register';
import { GameScreen, bestTimes, loadSession, sessionKey, type Saved } from './core/shell';
import { load, loadRaw, save } from './core/storage';
import { el, formatTime } from './core/util';
import { GAMES } from './games/registry';
import './style.css';

registerSW({ immediate: true });

const APP_TITLE = 'Logic Puzzles';
const menuScreen = document.querySelector<HTMLElement>('#menu-screen')!;
const list = document.querySelector<HTMLElement>('#game-list')!;

/** Carry over an in-progress game from the single-game "nonograms" app. */
function migrateLegacyNonogram() {
  if (load(sessionKey('nonogram'))) return;
  const raw = loadRaw('nonograms:v1');
  if (!raw) return;
  try {
    const old = JSON.parse(raw) as { puzzle: { size: number; seed: number }; cells: number[]; solved: boolean };
    const puzzle = { ...old.puzzle, variant: String(old.puzzle.size) };
    const session: Saved = { v: 1, variant: puzzle.variant, puzzle, state: { cells: old.cells }, elapsed: 0, solved: old.solved, lost: false };
    save(sessionKey('nonogram'), session);
  } catch {
    // Unreadable legacy data: start fresh.
  }
}

function renderMenu() {
  const best = bestTimes();
  list.replaceChildren();
  for (const game of GAMES) {
    const card = el('button', 'card');
    card.type = 'button';
    const icon = el('span', 'card-icon');
    icon.innerHTML = game.icon;
    icon.setAttribute('aria-hidden', 'true');
    const session = loadSession(game);
    const label = (variant: string) => game.variants.find((v) => v.id === variant)?.label ?? variant;
    let meta = '';
    if (session && !session.solved && !session.lost && game.hasProgress(session.puzzle, session.state)) {
      meta = `▶ ${game.variants.length > 1 ? `${label(session.variant)} · ` : ''}${formatTime(session.elapsed)}`;
    } else {
      const times = game.variants
        .filter((v) => `${game.id}:${v.id}` in best)
        .map((v) => `${game.variants.length > 1 ? `${v.label} ` : ''}${formatTime(best[`${game.id}:${v.id}`])}`);
      if (times.length) meta = `★ ${times[0]}`;
    }
    card.append(icon, el('span', 'card-title', game.title), el('span', 'card-blurb', game.blurb));
    if (meta) card.append(el('span', 'card-meta', meta));
    card.addEventListener('click', () => {
      history.pushState({ fromMenu: true }, '', `#/${game.id}`);
      route();
    });
    list.append(card);
  }
}

const screen = new GameScreen(() => {
  // Return to the menu entry in history when we came from it, so the iOS
  // back swipe and the in-app back button agree.
  if (history.state?.fromMenu) history.back();
  else location.replace('#/');
});

let current: string | null = null;

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  const game = GAMES.find((g) => g.id === id);
  if ((game?.id ?? '') === current) return;
  current = game?.id ?? '';
  if (game) {
    menuScreen.hidden = true;
    screen.open(game);
  } else {
    screen.close();
    document.title = APP_TITLE;
    renderMenu();
    menuScreen.hidden = false;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

migrateLegacyNonogram();
route();
