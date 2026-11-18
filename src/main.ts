import { registerSW } from 'virtual:pwa-register';
import { GameScreen, bestTimes, loadSession, sessionKey, type Saved } from './core/shell';
import { openGuide } from './core/guide';
import { LANGS, applyStatic, lang, onLangChange, setLang, t } from './core/i18n';
import { load, loadRaw, save } from './core/storage';
import { el, formatTime } from './core/util';
import { GAMES } from './games/registry';
import { initInstall, initShare } from './core/install';
import { trackGame } from './core/analytics';
import './style.css';

registerSW({ immediate: true });

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

const FAVOURITES_KEY = 'favourites';
const idSet = (key: string) => new Set(load<string[]>(key) ?? []);

const HEART =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5 4.6 13.3a4.9 4.9 0 0 1 0-7 5 5 0 0 1 7 0l.4.4.4-.4a5 5 0 0 1 7 0 4.9 4.9 0 0 1 0 7Z"/></svg>';

function toggleFavourite(id: string) {
  const favourites = idSet(FAVOURITES_KEY);
  if (!favourites.delete(id)) favourites.add(id);
  save(FAVOURITES_KEY, [...favourites]);
  renderMenu();
  list.querySelector<HTMLElement>(`[data-fav="${id}"]`)?.focus();
}

function renderMenu() {
  const best = bestTimes();
  const favourites = idSet(FAVOURITES_KEY);
  // Favourites first; the sort is stable, so each group keeps the registry order.
  const games = [...GAMES].sort((a, b) => Number(favourites.has(b.id)) - Number(favourites.has(a.id)));
  list.replaceChildren();
  for (const game of games) {
    const item = el('div', 'card-item');
    const card = el('button', 'card');
    card.type = 'button';
    const icon = el('span', 'card-icon');
    icon.innerHTML = game.icon;
    icon.setAttribute('aria-hidden', 'true');
    const session = loadSession(game);
    const label = (variant: string) => t(game.variants.find((v) => v.id === variant)?.label ?? variant);
    let meta = '';
    if (session && !session.solved && !session.lost && game.hasProgress(session.puzzle, session.state)) {
      meta = `▶ ${game.variants.length > 1 ? `${label(session.variant)} · ` : ''}${formatTime(session.elapsed)}`;
    } else {
      const times = game.variants
        .filter((v) => `${game.id}:${v.id}` in best)
        .map((v) => `${game.variants.length > 1 ? `${t(v.label)} ` : ''}${formatTime(best[`${game.id}:${v.id}`])}`);
      if (times.length) meta = `★ ${times[0]}`;
    }
    card.append(icon, el('span', 'card-title', t(game.title)), el('span', 'card-blurb', t(game.blurb)));
    if (meta) card.append(el('span', 'card-meta', meta));
    card.addEventListener('click', () => {
      history.pushState({ fromMenu: true }, '', `#/${game.id}`);
      route();
    });
    const isFav = favourites.has(game.id);
    const fav = el('button', 'card-fav');
    fav.type = 'button';
    fav.innerHTML = HEART;
    fav.dataset.fav = game.id;
    fav.setAttribute('aria-pressed', String(isFav));
    fav.setAttribute('aria-label', t(isFav ? 'Remove {game} from favourites' : 'Add {game} to favourites', { game: t(game.title) }));
    fav.addEventListener('click', () => toggleFavourite(game.id));
    item.append(card, fav);
    list.append(item);
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
    trackGame(game.id);
  } else {
    screen.close();
    document.title = t('Logic Puzzles');
    renderMenu();
    menuScreen.hidden = false;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

function renderLangSelect() {
  const box = document.querySelector<HTMLElement>('#lang-select')!;
  box.replaceChildren();
  for (const { id, label } of LANGS) {
    const btn = el('button', '', id.toUpperCase());
    btn.type = 'button';
    btn.lang = id;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', String(id === lang()));
    btn.addEventListener('click', () => setLang(id));
    box.append(btn);
  }
}

document.querySelector('#rules-btn')!.addEventListener('click', () => openGuide());
onLangChange(() => {
  renderLangSelect();
  if (!menuScreen.hidden) {
    document.title = t('Logic Puzzles');
    renderMenu();
  }
});

// iOS Safari ignores user-scalable=no; block double-tap and pinch zoom explicitly.
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 350) {
      e.preventDefault();
      // preventDefault also swallows the click, so rapid taps on buttons (e.g. the
      // number pad) would be lost. Re-dispatch the click ourselves.
      const btn = (e.target as Element | null)?.closest?.('button');
      const touch = e.changedTouches[0];
      const r = btn?.getBoundingClientRect();
      const inside =
        r && touch && touch.clientX >= r.left && touch.clientX <= r.right && touch.clientY >= r.top && touch.clientY <= r.bottom;
      if (btn && inside && !btn.disabled) btn.click();
    }
    lastTouchEnd = now;
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault());

initInstall();
initShare();
applyStatic();
renderLangSelect();
migrateLegacyNonogram();
route();
