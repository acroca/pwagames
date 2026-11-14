// Generates public/og.png, the 1200x630 picture shown when the site is shared.
// It opens the real menu and lays out every game's icon, so it stays in step with the
// game list. Run with `npm run og` after adding a game.
//
// Needs Playwright with Chromium, which is not a dependency of this project:
// install it globally and point NODE_PATH at it (hence `require`, which honours NODE_PATH).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)('playwright');

const WIDTH = 1200;
const HEIGHT = 630;
const ROWS = 3;

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    colorScheme: 'light',
    locale: 'en',
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForSelector('.card-icon svg');
  await page.evaluate((rows) => {
    const icons = [...document.querySelectorAll('.card-icon')];
    const cols = Math.ceil(icons.length / rows);
    const style = document.createElement('style');
    style.textContent = `
      body > * { display: none !important; }
      body > .og {
        display: flex !important; flex-direction: column; justify-content: space-between;
        position: fixed; inset: 0; box-sizing: border-box; padding: 52px 64px 56px;
        background: var(--bar); color: var(--bar-fg);
        font-family: Inter, system-ui, sans-serif;
      }
      .og h1 { margin: 0; font-size: 76px; line-height: 1; font-weight: 800; letter-spacing: -0.02em; }
      .og p { margin: 20px 0 0; font-size: 31px; color: #94a3b8; }
      .og p b { color: var(--bar-fg); font-weight: 600; }
      .og .tiles { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 14px; }
      .og .tile {
        aspect-ratio: 1; display: grid; place-items: center;
        background: var(--surface); border-radius: 20px;
      }
      .og .card-icon { width: 62%; height: 62%; }
    `;
    document.head.append(style);

    const og = document.createElement('div');
    og.className = 'og';
    const head = document.createElement('div');
    const h1 = document.createElement('h1');
    h1.textContent = 'Logic Puzzles';
    const p = document.createElement('p');
    // No game count: services cache this picture for a long time, and it would go stale.
    p.innerHTML = '<b>No guessing, ever</b> · free and offline';
    head.append(h1, p);
    const tiles = document.createElement('div');
    tiles.className = 'tiles';
    for (const icon of icons) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.append(icon.cloneNode(true));
      tiles.append(tile);
    }
    og.append(head, tiles);
    document.body.append(og);
  }, ROWS);
  await page.screenshot({ path: fileURLToPath(new URL('../public/og.png', import.meta.url)) });
  console.log('public/og.png written');
} finally {
  await browser.close();
  await server.close();
}
