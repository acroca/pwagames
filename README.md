# Nonograms

A Progressive Web App for playing 10×10 [nonogram](https://en.wikipedia.org/wiki/Nonogram) puzzles,
designed for iPhone. Open **https://acroca.github.io/nonograms/** in Safari and use
**Share → Add to Home Screen** to install it; it then runs full-screen and works offline.

## Playing

- Pick a tool at the bottom: **Fill** fills squares, **Block** marks squares as blocked (✕).
- Tap a square to toggle it, or drag a finger to paint along a row or column. Dragging only
  changes squares in the same state as the first one, so existing marks aren't overwritten.
- The clues of the row and column under your finger are highlighted while drawing.
- Clues turn grey once their row/column matches. Progress is saved automatically.

## Puzzle generation

Every puzzle has a unique solution reachable by logic alone — no guessing needed.
The generator (`src/nonogram.ts`) draws random 10×10 pictures and keeps only those that a
line solver fully solves. The line solver only makes deductions that hold for every valid
placement of a row's or column's blocks, so a complete solve proves the solution is unique.
Tests additionally confirm uniqueness with a brute-force solver.

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
