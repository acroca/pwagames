# Logic Puzzles (pwagames)

A Progressive Web App with a collection of logic puzzle games, designed for iPhone.
Open **https://acroca.github.io/pwagames/** in Safari and use **Share → Add to Home Screen**
to install it; it then runs full-screen and works offline.

Every puzzle is generated on the fly, has exactly one solution, and can be solved by logic
alone — no guessing needed.

## Games

| Game | Sizes / levels |
| --- | --- |
| Nonogram | 10×10 |

## Shared features

Every game has the same app bar and behaviour:

- **Menu cards** list the games, with the in-progress puzzle or your best time.
- **Undo** steps back through your moves; **Check** flags entries that contradict the
  solution.
- A **timer** runs while the game is on screen and stops when it's solved; best times are kept
  per game and size.
- Progress is **saved automatically** (per game), so you can switch games and come back.
- **New** opens a sheet to pick a size or difficulty, start a new puzzle, restart the current
  one, change game settings, and read the rules.

## Puzzle generation

Generators live next to each game in `src/games/<game>/logic.ts` and are pure functions of a
size/difficulty and a seed. They run in a Web Worker (`src/core/worker.ts`) with a loading
indicator, so the UI never freezes.

Each generator pairs a *logic solver* (constraint propagation using human techniques only)
with a *counting solver* (propagation + backtracking that stops after finding two solutions).
A puzzle is only accepted if the logic solver solves it completely, which proves its solution
is unique and reachable without guessing. Tests check every generated puzzle with the counting
solver and an independent rule checker.

- **Nonogram**: random pictures are kept only if a line solver fully solves them.

## Project layout

```
src/main.ts              menu + routing
src/core/                shell (app bar, timer, undo, check, autosave), worker, input helpers
src/games/registry.ts    games in menu order
src/games/generators.ts  generator table used by the worker
src/games/<game>/        logic.ts (generator + solvers), index.ts (UI), tests
```

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (Vitest)
npm run build    # type-check + production build into dist/
npm run icons    # regenerate PWA icons in public/
```

## Deployment

`.github/workflows/deploy.yml` tests, builds, and publishes to GitHub Pages on every push to
`main`. The repository's Pages source must be set to **GitHub Actions**
(Settings → Pages → Build and deployment).
