# Pixel Kingdoms: handoff

Read this first in a new chat. Last updated 2026-11-22, version **0.9.1**.

## 1. Where everything is

| What | Where |
| --- | --- |
| Live game | https://raider3vader.github.io/pixel-kingdoms/ (hard-refresh with Cmd + Shift + R after a deploy; the page is cached for up to 10 minutes) |
| Code | `/Users/jake/Documents/Claude-projects/pixel-kingdoms`, GitHub `Raider3Vader/pixel-kingdoms` (public) |
| Deploy | Every push to `main` runs the tests and the build in GitHub Actions, then publishes to GitHub Pages. A failing test blocks the deploy. |
| Design doc | Claude Doc: https://claude.ai/artifact/M1KbbmGXzcERZLt6A1y5U4 (read and edit it with the docs tools, not a web fetch). Units, buildings, ages, the enemy and a "Prototype status" section. |
| Art canvas | https://claude.ai/artifact/UJUYyyBJQaD1my53vLdR8o: every art option shown so far (looks A to F, Sakura depth, stable and cavalry, rice paddies). |

## 2. Working with the owner

- The owner is not a developer. Use plain language, give one recommendation, and work in small checkable steps.
- **Every update adds an entry to `src/changelog.ts`** (newest first; bump `version`). The menu's "Open changelog" shows it, and `VERSION` comes from the newest entry.
- **Push after each milestone is OK.** Run the tests first and stop if any fail:
  ```bash
  npx vitest run src > /tmp/pk-test.log 2>&1; grep -q failed /tmp/pk-test.log && echo FAILED
  ```
- For new art, **show options on the art canvas first** and let the owner pick before putting it in the game.
- **Keep Classic hidden.** Its art is still in `src/render/sprites.ts`, but `setTheme` always forces `sakura`, and the Theme menu option was removed on request.
- Test UI changes in the browser at a desktop size and at a small or zoomed-in size (about 600 x 336). The owner's browser is zoomed to about 165%.

## 3. What the game has (0.9.1)

- **Screens:** a title screen (a villager chased by a rider), a menu (difficulty, map: Rivers or Inland Sea, Controls, Open changelog, Sound, Music, Full screen), pause and an end screen with a stats table and graphs (army, villagers, resources over time; `src/stats.ts`, data from `World.history`, a snapshot every 10 s).
- **Music:** made live in `src/audio.ts` (`Music`, `TRACKS`): a calm loop (D yo scale, koto, drone, flute) and a battle loop (E in scale, taiko). `Game.updateMood()` switches to battle after `MUSIC_MOOD` hits nearby and back to calm after a quiet spell. The game fills the whole window at a whole-number pixel scale.
- **Look:** Sakura Village (ancient Japan) only. Villagers in straw hats, samurai, three-quarter-view tile-roof buildings, a three-tier pagoda Town Center, cherry, pine and bamboo forests, and golden rice fields with scarecrows.
- **Economy:** food, wood, gold and stone.
  - Persimmon trees and sheep are the starting food.
  - **Rice paddies** (60 wood) give renewable food: 300 per field, auto-replant for 40 wood, which is on by default; Z toggles it.
  - One farmer per paddy: shift-placing paddies gives each its own villager (`Game.paddyBuilder`), and `finishBuildOrder` / right-click spread extra villagers to other paddies (`farmTaken`, `freeFarm`).
  - Storehouses are drop-offs for everything.
  - The **Market** (Feudal) buys 100 food or wood for 60 gold and 100 stone for 80. It earns trade gold, and merchants add more.
- **Ages:** Dark → Feudal (350 food, 150 wood, 60 s) → Imperial (600 food, 300 wood, 200 gold, 90 s), advanced at the Town Center. Every soldier upgrades on the spot when you advance.
- **Units:**
  - Villager.
  - Sword line: Militia, Man-at-Arms, Champion.
  - Spear line: Spearman, Pikeman, Halberdier.
  - Archer (Feudal), then Longbowman.
  - Cavalry (Feudal, from the Stable), then Knight.
  - Scout (a fast sword rider; each side starts with one).
- **Combat rules:** spears get a big bonus against all horses. Cavalry is a bit stronger than swords and faster. Archers do well against most things, but heavy armor reduces arrow damage, and archers do half damage in close quarters. Armor is shown as melee/arrow.
- **Buildings:**
  - Town Center, House, Rice paddy, Storehouse, Barracks.
  - Stable and Market (Feudal).
  - Wooden walls and gates; stone walls and gates (Feudal). Gates let only their own side through, and Z locks them.
  - Watch tower (sight 11). Guard tower (Feudal, or upgrade a watch tower): holds 5 troops, and each archer inside adds an arrow.
  - Villagers repair damaged buildings for 25% of the build cost.
- **Controls:**
  - Left click or drag to select. Right click for orders, repair, entering towers and rally points.
  - Shift + right-click queues orders, shown with flags. Double-click selects all of a type (double-clicking a building selects all of that building, and a train key queues one unit in each).
  - Z X C V B N are the command buttons; F switches a villager's build page between buildings and walls/towers.
  - Soldier commands: Z line, X block, C box formation; V Hostile on/off; B Stand down.
  - H selects the Town Center, Q the next idle villager. Ctrl + 1-9 saves a group and 1-9 selects it. Space jumps to the last alert. M mutes, Esc pauses.
  - Walls: click a start tile, then an end tile. A gate placed on your own wall piece swaps in (`wallUnder`).
  - Delete or Backspace destroys your selection (`deleteOwn`): unfinished buildings refund the unbuilt part, and the last Town Center is protected.
- **Maps:** chosen on the menu (`MapKind` in `src/sim/map.ts`, saved as `pk-map`).
  - **Inland Sea** (`makeSea`, layout in `SEA`): home islands in opposite corners, a private back island each (gold, stone, persimmons), two islets and a central island with gold. Walkable sandbars (`bridge` code 2, like fords) join them. Woods only grow on the home islands, and `clearRoute` cuts tree-free routes to the enemy and every island resource on both sides, so every map is connected (checked on 300 seeds). `npm run balance -- normal normal inlandSea`: last run 31 of 32 games finished, in 13 to 30 minutes, and Boom is strongest there (14 wins).
  - Boats are not built yet; the owner wants naval troops next.
- **Rivers map:** 96 x 96 tiles, mirrored so both sides are fair.
  - Forest belts with 2 or 3 narrow gaps work as choke points. There are dense woods and open meadows.
  - Gold and stone sit near each village, with more in the middle.
  - Five river layouts are picked per match: twin streams (favored, about 40%), winding, meandering, central lake, and a wide river with fords.
- **Enemy AI:** four hidden openings (Boom, Rush, Archer line, Horse raid) and three difficulties.
  - It advances ages, mines gold and stone, plants paddies, moves workers between resources and builds guard towers.
  - Its soldiers break through walls when blocked.
  - Difficulty changes how fast it decides and how many mistakes it makes; it never gets extra resources.
- **Not built yet:** touch controls (the owner wants these later), boats, and a Classic version of anything added after Classic was hidden.

## 4. Code map

- `src/config.ts`: every number: costs (`Cost` with four resources), `AGES`, `UNITS` (with `tiers` per age, `armor`/`arrowArmor`), `BUILDINGS`, `MARKET`, `REPAIR`, `FARM`, difficulties and openings. `unitStats()` and `hitDamage()` live here.
- `src/sim/`: rules only, no drawing.
  - `world.ts` is the core: entities, orders (move, gather, build, attack, repair, garrison), research (age, merchant, tower upgrade), gates (blocked code 4 + team = an open gate for that side), walls, towers, fog, and the tick.
  - `map.ts` generates matches (`createMatch(seed, { river })`, `RIVERS`).
  - `bot.ts` is the enemy. `path.ts` is A* pathfinding (gate-aware per team). `formation.ts` lays out formations.
- `src/render/`: `sakura.ts` draws all Sakura art in code. `sprites.ts` dispatches to it and holds the hidden Classic art, plus icons. `renderer.ts` draws the world, fog, effects and minimap.
- `src/game.ts`: one match: camera, input, the HUD and command buttons. `src/main.ts`: screens, window fitting, the game loop. `src/title.ts`: the title scene. `src/changelog.ts`, `src/audio.ts`.
- `index.html` and `src/style.css`: menus and HUD (sizes use `--s`, the pixel scale).

## 5. Tools and tests

- `npm test` runs 55 tests: economy, every combat matchup, ages, the market, gates, towers, repair, paddies, formations, queued orders, every river layout (mirrored and connected), and AI games including Hard beating Easy.
- `npm run balance` plays every opening against every other (32 games, takes several minutes). The last run was fairly even, with games of about 11 to 22 minutes.
- `npx tsx scripts/mappng.ts out.png 5 5:twin 5:sea` renders map overviews (`seed`, `seed:riverKind` or `seed:sea`). `scripts/showmap.ts` prints a map as text. `scripts/simulate.ts` traces one AI.
- In the browser console, `pk()` returns the live Game. The built-in browser pane runs at about 1.5 fps when hidden, so drive time with `pk().update(1/60)` loops.
- Run the dev server from Bash (`./node_modules/.bin/vite --port 5174`), then open it in the browser pane. `preview_start` cannot read `~/Documents`.

## 6. Open questions and likely next steps

- **Playtesting by hand:** age costs, market prices, wall strength and AI difficulty have only been tested AI against AI.
- **Touch controls** for phones and tablets (the owner said "later").
- **Balance:** Horse raid is the weakest opening. Rush is weaker since Dark Age units were made weaker, which was intended.
- **Requested next (Nov 22):** an islands map (still Japanese) with naval troops; a special samurai unit trained at a Pagoda building; monks later.
- **Possible ideas, not requested yet:** a river or map choice on the menu, more Sakura looks for Imperial buildings.
