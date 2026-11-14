# Contributing

Bug reports, ideas and pull requests are welcome.

- **Bugs**: open an issue with the game, the size/level and the puzzle code shown under the
  game title (e.g. `#CTFVNV`), which makes the exact puzzle reproducible.
- **Changes**: fork, branch, and open a pull request against `main`. CI runs the tests and a
  production build on every pull request.

## Before opening a pull request

```sh
npm install
npm test         # unit tests (Vitest)
npm run build    # type-check + production build
```

## Guidelines

- Every generated puzzle must have exactly one solution, reachable by logic alone. New or
  changed generators need tests that verify this with the counting solver.
- User-facing text needs a Spanish translation in `src/core/es.ts` (and `src/core/guides.ts`
  for rules).
- A new game lives in `src/games/<game>/` and is registered in `src/games/registry.ts` and
  `src/games/generators.ts`. See the project layout in the [README](README.md).

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
