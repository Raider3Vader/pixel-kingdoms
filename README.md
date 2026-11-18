# Pixel Kingdoms

A small single-player medieval strategy game in pixel art that runs in the browser. Working title.

Design doc: https://claude.ai/artifact/M1KbbmGXzcERZLt6A1y5U4

## Run it

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Other commands

- `npm test` runs the tests.
- `npm run build` makes the playable version in `dist/`.

Every push to `main` publishes the game to GitHub Pages.

## Layout

- `src/config.ts`: every cost, rate, HP and timer (all placeholders to tune).
- `src/sim/`: game rules and state, no drawing code.
- `src/render/`: drawing to the canvas.
