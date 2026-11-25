# Pixel Kingdoms: handoff

Read this first in a new chat. Last updated 2026-11-25, version **0.13.2**.

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

## 3. What the game has (0.13.0)

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
  - Samurai (Imperial, from the Pagoda): bonus damage against swords, spears and archers; beats one Champion, loses to two.
  - Fishing boat, War boat (then Heavy war boat) and Transport boat (carries 8, `carries` in `UNITS`), all from the Dock. Boats are `naval` in `UNITS`.
- **Combat rules:** spears get a big bonus against all horses. Cavalry is a bit stronger than swords and faster. Archers do well against most things, but heavy armor reduces arrow damage, and archers do half damage in close quarters. Armor is shown as melee/arrow.
- **Buildings:**
  - Town Center, House, Rice paddy, Storehouse, Barracks.
  - Stable and Market (Feudal).
  - Pagoda (Imperial, 300W 200S 100G, 1200 hp, one per player via `limit`): trains Samurai and researches Way of the Warrior (`WAY_OF_WARRIOR`, research key `warrior`, `team.wayOfWarrior`; `unitStats(type, age, warrior)` adds +20 hp, +1/+1 armor to Samurai). The AI studies it after 3 Samurai. Dock: must touch water (`canPlace` returns 'shore' otherwise); trains boats, and fishing boats drop their catch there.
  - Wooden walls and gates; stone walls and gates (Feudal). Gates let only their own side through, and Z locks them.
  - Watch tower (sight 11). Guard tower (Feudal, or upgrade a watch tower): holds 5 troops, and each archer inside adds an arrow.
  - Villagers repair damaged buildings for 25% of the build cost.
- **Controls:**
  - Left click or drag to select. Right click for orders, repair, entering towers and rally points.
  - Shift + right-click queues orders, shown with flags. Double-click selects all of a type (double-clicking a building selects all of that building, and a train key queues one unit in each).
  - Z X C V B N are the command buttons. Villagers first get Village (Z), Military (X), Defenses (C) and Repair (V) (`buildMenu` in `game.ts`); inside a section F or Esc goes back. Repair is a mode: click a damaged building. Building buttons are `size: 'narrow'` (half width, small icon, cost as coloured numbers); section buttons `size: 'wide'`; soldier orders `size: 'icon'` (picture only, name in the hover tooltip; the owner chose this from mockups).
  - Soldier commands: Z line, X block, C box formation; V Hostile on/off; B Stand down.
  - H selects the Town Center, Q the next idle villager (Q twice within 0.5 s, or Shift + Q: all idle villagers). Ctrl + 1-9 saves a group, 1-9 selects it, and Shift + 1-9 adds it to the selection. Space jumps to the last alert. M mutes, Esc pauses.
  - Walls: click a start tile, then an end tile. Gates are two tiles: two 1-tile gate entities linked by `partner` (`placeGate`, `canPlaceGate`, `gateTiles`), running along the wall (`gateVertical`; R turns it when there is no wall). Put on walls they replace them and refund the walls in full. Lock, select and delete act on both halves. Wall lines are 4-connected (`lineTiles` adds the corner tile on diagonal steps), up to 32 pieces.
  - Delete or Backspace destroys your selection (`deleteOwn`): unfinished buildings refund the unbuilt part, and the last Town Center is protected.
- **Maps:** chosen on the menu (`MapKind` in `src/sim/map.ts`, saved as `pk-map`).
  - **Inland Sea** (`makeSea`, layout in `SEA`): home islands in opposite corners, a private back island each (gold, stone, persimmons), two islets and a central island with gold. Walkable sandbars (`bridge` code 2, like fords) join them. Woods only grow on the home islands, and `clearRoute` cuts tree-free routes to the enemy and every island resource on both sides, so every map is connected (checked on 300 seeds). `npm run balance -- normal normal inlandSea`: last run 31 of 32 games finished, in 13 to 30 minutes, and Boom is strongest there (14 wins).
  - Fish shoals (resource `fish` on water tiles, `spawnFish`) lie off each home coast and out in the sea, mirrored.
- **Rivers map:** 96 x 96 tiles, mirrored so both sides are fair.
  - Forest belts with 2 or 3 narrow gaps work as choke points. There are dense woods and open meadows.
  - Gold and stone sit near each village, with more in the middle.
  - Five river layouts are picked per match: twin streams (favored, about 40%), winding, meandering, central lake, and a wide river with fords.
- **Enemy AI:** seven hidden openings (Boom, Rush, Archer line, Horse raid, Fast Imperial, Fortress, Swarm) and four difficulties (Easy, Normal, Hard, Impossible). **Temporary names (0.13.1, the owner's request):** the menu and `DIFFICULTY[].name` show Hannah Mode, Zach Mode, Jordan Mode and Hudson Mode. The code keys are unchanged, so to undo it, change the four names in `config.ts` and the buttons in `index.html` back. Only Impossible bends the rules: `team.speed` (1.4) speeds up its gathering, training and research. It also gets `extraTrainers` (more Barracks and Stables) and `counters` (`armyMix` shifts training toward `COUNTER` of the player's army). Openings can set `maxBarracks` and `lateMixAge` (switch to `mixAfter` on reaching that age). Hard and Impossible also have `counters` and `retreats` (`retreat()` pulls attackers (`bot.attackers`) more than 18 tiles from home back when nearby enemy worth (cost × health, plus 250 for a Town Center and 150 for a guard tower) is more than 1.3 times theirs). Testing (Nov 25) showed decision speed, reaction time and attack size barely change bot-vs-bot results, because the opening matchup decides most games; a Hard with 30 villagers lost to Normal because it had nothing to spend the extra resources on. Archers garrison guard towers that are raided and come out after. Houses are placed further out once the town fills up, attack size is capped (`MAX_ATTACK`), and at full population it attacks with what it has, at most every 30 s.
  - It advances ages, mines gold and stone, plants paddies, moves workers between resources and builds guard towers.
  - Its soldiers break through walls when blocked.
  - Difficulty changes how fast it decides and how many mistakes it makes; it never gets extra resources.
- **Boats (how they work):** `isNaval`, `sailable`, `navGrid` and `blockedFor` in `world.ts`. Boats use their own pathfinding grid: open water, fords, sandbars and under bridges. `canFight` stops foot soldiers chasing boats; anything shooting across the waterline paths to "within range" (`pathToEntity` with a reach). When a fish tile is emptied it goes back to water (`kill`). Fishing boats count as food workers for the AI.
- **The enemy and the new units:** on the Inland Sea it builds a Dock by the nearest fish, 2 to 5 fishing boats, and from the Feudal Age a few war boats that hunt enemy boats and Docks (`naval` in `bot.ts`). Boom and Rush add Samurai after their first attack. `bot.reserve` holds back troop training while it saves for a Pagoda or a war boat.
- **Transports:** passengers use `inside` like tower garrisons and ride along (`updateUnit`). Orders `board` and `unload`; `orderBoard` also brings the boat to the shore (`landingSpot`), `orderUnload` sails to the shore nearest a land point, `landPassengers` lets them off. Right-clicking your transport with land units boards; a loaded transport right-clicking land unloads (`smartOrder`). Passengers die with the boat.
- **AI sea landings** (`landing` in `bot.ts`, Inland Sea, Normal and Hard): it trains a transport after its first war boat. Every other attack, up to 8 idle soldiers board it (`bot.landing`, phases boarding then sailing), and it unloads at the enemy's coastal building nearest the enemy Town Center (`landingTarget`). If that target falls first it picks another; after 90 s it gives up and lets everyone off. Riders are kept out of normal attacks and defence (`isRider`).
- **Not built yet:** touch controls (the owner wants these later), monks (the owner wants them later), and a Classic version of anything added after Classic was hidden.

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

- `npm test` runs 72 tests: economy, every combat matchup, ages, the market, gates, towers, repair, paddies, formations, queued orders, every river layout (mirrored and connected), and AI games including Hard beating Easy.
- `npm run balance` plays every opening against every other (32 games, takes several minutes). The last run was fairly even, with games of about 11 to 22 minutes.
- `npx tsx scripts/mappng.ts out.png 5 5:twin 5:sea` renders map overviews (`seed`, `seed:riverKind` or `seed:sea`). `scripts/showmap.ts` prints a map as text. `scripts/simulate.ts` traces one AI.
- In the browser console, `pk()` returns the live Game. The built-in browser pane runs at about 1.5 fps when hidden, so drive time with `pk().update(1/60)` loops.
- Run the dev server from Bash (`./node_modules/.bin/vite --port 5174`), then open it in the browser pane. `preview_start` cannot read `~/Documents`.

## 6. Open questions and likely next steps

- **Playtesting by hand:** age costs, market prices, wall strength and AI difficulty have only been tested AI against AI.
- **Touch controls** for phones and tablets (the owner said "later").
- **Balance:** Horse raid is the weakest opening. Rush is weaker since Dark Age units were made weaker, which was intended.
- **Requested next:** monks (owner said "we'll get there").
- **Possible ideas, not requested yet:** a river or map choice on the menu, more Sakura looks for Imperial buildings.
