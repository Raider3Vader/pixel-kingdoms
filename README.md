# Pixel Kingdoms

A small single-player medieval strategy game in pixel art that runs in the browser. Working title.

**Play it:** https://raider3vader.github.io/pixel-kingdoms/ (mouse and keyboard; touch screens come later)

Design doc: https://claude.ai/artifact/M1KbbmGXzcERZLt6A1y5U4

## How to play

Gather food, wood, gold and stone, train villagers, and advance from the Dark Age to the Feudal and Imperial Ages at your Town Center. Each age upgrades your soldiers. Build walls, gates and towers, trade at the Market, and destroy the enemy Town Center to win.

The enemy is a rival kingdom on the same rules as you. Each match it picks a hidden opening (Boom, Rush, Archer line or Horse raid). Difficulty changes how fast and how well it plays, never its resources.

Spears beat horses, cavalry beat swordsmen and run down archers, swordsmen beat spears, and archers do well against anything not heavily armored or right on top of them.

| Control | What it does |
| --- | --- |
| Left click / drag | Select units (double click: all of that type on screen) |
| Right click | Move, gather, build or attack; villagers repair damaged buildings; troops enter a guard tower; with a building selected, set its rally point |
| Z X C V B N, F | The command buttons; F flips a villager's build menu between buildings and walls/towers. With soldiers: Z line, X block, C box formation, V Hostile on/off, B Stand down |
| Click, click | Walls: first click sets the start, second click builds the line (Shift keeps going) |
| Double click a building | Select all of that kind; a train key queues one in each |
| Shift | Add to the selection, or keep placing buildings |
| Shift + right click | Queue orders: waypoints for a scout, or gather one tree then a sheep |
| W A S D, arrows, screen edge | Move the camera |
| Mouse wheel | Zoom in and out |
| H / Q (or .) | Town Center / next idle villager |
| Ctrl + 1-9, then 1-9 | Save a group, then select it (press twice to jump there). Cmd + 1-9 is usually taken by the browser for tabs |
| Space | Jump to the last attack, or to the selection |
| M / Esc | Mute / pause |

## Run it locally

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

## Other commands

- `npm test` runs the rules tests (economy, the counter triangle, the map, the enemy AI).
- `npm run balance` plays every enemy opening against every other and prints who wins and when.
- `npm run build` makes the playable version in `dist/`.

Every push to `main` runs the tests and publishes the game to GitHub Pages.

## Layout

- `src/config.ts`: every cost, rate, HP value, timer, difficulty and opening (all placeholders to tune).
- `src/sim/`: game rules and state, no drawing code. `world.ts` is the core, `map.ts` builds a match, `bot.ts` is the enemy kingdom, `path.ts` is pathfinding.
- `src/render/`: pixel sprites drawn in code, and the world renderer with fog of war.
- `src/game.ts`: one match: camera, input, HUD.
- `src/main.ts`: menus and the game loop. `src/audio.ts`: sound effects.
