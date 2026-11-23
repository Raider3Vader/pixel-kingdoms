// The enemy kingdom. It plays by the player's rules (same costs, same commands);
// difficulty only changes how often and how well it makes decisions.

import {
  AGES,
  BUILDINGS,
  DIFFICULTY,
  OPENINGS,
  RESOURCES,
  UNITS,
  WAY_OF_WARRIOR,
  type BuildingType,
  type Cost,
  type Difficulty,
  type DifficultyKey,
  type Opening,
  type OpeningKey,
  type ResKind,
  type ResourceType,
  type UnitType,
} from '../config';
import {
  T,
  World,
  canAfford,
  canPlace,
  startResearch,
  unitAvailable,
  distToEntity,
  freeFarm,
  isNaval,
  isSoldier,
  garrisoned,
  landingSpot,
  orderBoard,
  orderUnload,
  landPassengers,
  nearestDropoff,
  nearestResource,
  orderMove,
  placeBuilding,
  setOrder,
  teamBuildings,
  teamUnits,
  train,
  type Entity,
} from './world';

export interface Bot {
  team: number;
  diffKey: DifficultyKey;
  diff: Difficulty;
  openingKey: OpeningKey;
  opening: Opening;
  t: number;
  attacksSent: number;
  attackSize: number;
  threatSince: number;
  lastThreatAt: number;
  fleeing: Set<number>;
  defending: Set<number>;
  saving: boolean; // saving up to advance an age
  savingSince: number;
  reserve: Cost; // set aside for a Pagoda or a war boat: troops are not trained out of it
  landing: Landing | null; // a sea landing under way
  landingsSent: number;
}

/** A landing party: soldiers board a transport, it sails to the enemy's shore, and they storm ashore. */
interface Landing {
  boat: number;
  riders: number[];
  target: number; // the enemy building they are going for
  phase: 'boarding' | 'sailing';
  since: number;
}

export function createBot(w: World, team: number, diffKey: DifficultyKey, openingKey?: OpeningKey): Bot {
  const keys = Object.keys(OPENINGS) as OpeningKey[];
  const ok = openingKey ?? keys[Math.floor(w.rng() * keys.length)];
  return {
    team,
    diffKey,
    diff: DIFFICULTY[diffKey],
    openingKey: ok,
    opening: OPENINGS[ok],
    t: 1 + w.rng(),
    attacksSent: 0,
    attackSize: Math.max(2, Math.round(OPENINGS[ok].firstAttackSize * DIFFICULTY[diffKey].armyScale)),
    threatSince: -1,
    lastThreatAt: -99,
    fleeing: new Set(),
    defending: new Set(),
    saving: false,
    savingSince: -1,
    reserve: {},
    landing: null,
    landingsSent: 0,
  };
}

const kindOf = (r: ResourceType): ResKind => RESOURCES[r].kind;

function home(w: World, bot: Bot): Entity | undefined {
  return teamBuildings(w, bot.team, 'townCenter')[0];
}

/** A free spot for a building near a point, leaving a one-tile lane around buildings. */
export function findBuildSpot(w: World, team: number, type: BuildingType, cx: number, cy: number, minR: number, maxR: number): { tx: number; ty: number } | null {
  const size = BUILDINGS[type].size;
  const ctx = Math.floor(cx / T);
  const cty = Math.floor(cy / T);
  const cands: { tx: number; ty: number; d: number }[] = [];
  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const d = Math.hypot(dx, dy);
      if (d < minR || d > maxR) continue;
      cands.push({ tx: ctx + dx - Math.floor(size / 2), ty: cty + dy - Math.floor(size / 2), d: d + w.rng() * 0.8 });
    }
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) {
    const r = canPlace(w, team, type, c.tx, c.ty, false);
    if (r === 'blocked' || r === 'shore') continue;
    let lane = true;
    for (let y = c.ty - 1; y <= c.ty + size && lane; y++) {
      for (let x = c.tx - 1; x <= c.tx + size; x++) {
        if (!w.inBounds(x, y) || w.blocked[y * w.w + x] === 2) {
          lane = false;
          break;
        }
      }
    }
    if (lane) return c;
  }
  return null;
}

function pickBuilder(w: World, bot: Bot, x: number, y: number): Entity | null {
  let best: Entity | null = null;
  let bd = Infinity;
  for (const u of w.units) {
    if (u.dead || u.team !== bot.team || u.type !== 'villager' || bot.fleeing.has(u.id)) continue;
    if (u.order.type === 'build') continue;
    const d = Math.hypot(u.x - x, u.y - y) + (u.order.type === 'gather' && kindOf(u.order.resType) === 'food' ? 64 : 0);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

function tryBuild(w: World, bot: Bot, type: BuildingType, x: number, y: number, minR: number, maxR: number): boolean {
  if (!canAfford(w, bot.team, BUILDINGS[type].cost) || w.teams[bot.team].age < BUILDINGS[type].age) return false;
  const spot = findBuildSpot(w, bot.team, type, x, y, minR, maxR);
  if (!spot) return false;
  const b = pickBuilder(w, bot, (spot.tx + 1) * T, (spot.ty + 1) * T);
  if (!b) return false;
  return placeBuilding(w, bot.team, type, spot.tx, spot.ty, [b], false) === 'ok';
}

/** Plant a rice paddy near the Town Center (or a Storehouse) with this villager. */
function tryFarm(w: World, bot: Bot, tc: Entity, v: Entity): boolean {
  if (!canAfford(w, bot.team, BUILDINGS.farm.cost)) return false;
  const spot = findBuildSpot(w, bot.team, 'farm', tc.x, tc.y, 3, 9);
  if (!spot) return false;
  return placeBuilding(w, bot.team, 'farm', spot.tx, spot.ty, [v], false) === 'ok';
}

function economy(w: World, bot: Bot, tc: Entity): void {
  const team = w.teams[bot.team];
  const vills = teamUnits(w, bot.team, 'villager');
  const queuedV = tc.queue.filter((q) => q === 'villager').length;
  let target = bot.diff.villagerTarget;
  if (bot.opening.earlyVillagerCap !== null && bot.attacksSent === 0) target = Math.min(target, bot.opening.earlyVillagerCap);

  // villagers
  if (vills.length + queuedV < target && tc.queue.length < 2) train(w, tc, 'villager');

  // put idle villagers to work: food and wood first, gold and stone from the Feudal Age
  const threat = bot.threatSince >= 0;
  const have: Record<ResKind, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
  for (const v of vills) if (v.order.type === 'gather') have[kindOf(v.order.resType)]++;
  // each fishing boat brings in food, so fewer villagers need to farm
  have.food += teamUnits(w, bot.team, 'fishingBoat').length;
  const share = (n: number): Record<ResKind, number> => {
    const gold = team.age >= 1 ? 0.18 : 0;
    const stone = team.age >= 1 && bot.opening.towers > 0 ? 0.08 : 0;
    const rest = 1 - gold - stone;
    return { food: n * rest * bot.opening.foodShare, wood: n * rest * (1 - bot.opening.foodShare), gold: n * gold, stone: n * stone };
  };
  for (const v of vills) {
    if (v.order.type !== 'idle') continue;
    if (threat && bot.fleeing.has(v.id)) continue;
    bot.fleeing.delete(v.id);
    const want = share(have.food + have.wood + have.gold + have.stone + 1);
    const kinds: ResKind[] = ['food', 'wood', 'gold', 'stone'];
    kinds.sort((a, b) => have[a] - want[a] - (have[b] - want[b]));
    let res: Entity | null = null;
    let building = false;
    for (const kind of kinds) {
      if (kind === 'food') {
        // wild food close to a drop-off first, then a free rice paddy, else plant one
        const wild = nearestResource(w, v.x, v.y, (r) => RESOURCES[r.type as ResourceType].kind === 'food', 40 * T);
        const drop = wild ? nearestDropoff(w, bot.team, wild.x, wild.y) : null;
        if (wild && drop && distToEntity(wild.x, wild.y, drop) < 9 * T) res = wild;
        else res = freeFarm(w, bot.team, v.x, v.y);
        if (!res && tryFarm(w, bot, tc, v)) {
          building = true;
          break;
        }
        if (!res) res = wild;
      } else res = nearestResource(w, v.x, v.y, (r) => RESOURCES[r.type as ResourceType].kind === kind, 40 * T);
      if (res) break;
    }
    if (building) {
      have.food++;
      continue;
    }
    if (!res) continue;
    const rt = res.kind === 'building' ? 'farm' : (res.type as ResourceType);
    setOrder(v, { type: 'gather', target: res.id, resType: rt, phase: 'go', dropId: 0 });
    have[kindOf(rt)]++;
  }

  // move one worker from a resource with too many to one with too few
  {
    const total = have.food + have.wood + have.gold + have.stone;
    const want = share(total);
    const ks: ResKind[] = ['food', 'wood', 'gold', 'stone'];
    const over = ks.filter((k) => have[k] > want[k] + 1).sort((a, b) => have[b] - want[b] - (have[a] - want[a]))[0];
    const under = ks.filter((k) => have[k] < want[k] - 1).sort((a, b) => have[a] - want[a] - (have[b] - want[b]))[0];
    if (over && under) {
      const v = vills.find((u) => u.order.type === 'gather' && kindOf(u.order.resType) === over && u.order.phase === 'work');
      const res = v && under !== 'food' ? nearestResource(w, v.x, v.y, (r) => RESOURCES[r.type as ResourceType].kind === under, 40 * T) : v ? freeFarm(w, bot.team, v.x, v.y) : null;
      if (v && res) setOrder(v, { type: 'gather', target: res.id, resType: res.kind === 'building' ? 'farm' : (res.type as ResourceType), phase: 'go', dropId: 0 });
    }
  }

  // advance through the ages
  const nextAge = team.age + 1;
  const ageAt = nextAge === 1 ? bot.opening.feudalAtVillagers : bot.opening.imperialAtVillagers;
  bot.saving = false;
  if (nextAge <= 2 && vills.length >= ageAt && !w.buildings.some((b) => b.team === bot.team && b.research?.key === 'age')) {
    if (canAfford(w, bot.team, AGES[nextAge].cost)) {
      if (tc.queue.length === 0) startResearch(w, tc, 'age');
      bot.savingSince = -1;
    } else {
      // hold back on the army to afford it, but never for more than two minutes
      if (bot.savingSince < 0) bot.savingSince = w.time;
      bot.saving = w.time - bot.savingSince < 120;
    }
  }

  const unfinished = teamBuildings(w, bot.team).filter((b) => b.progress < 1);

  // finish buildings nobody is working on
  for (const b of unfinished) {
    const working = vills.some((v) => v.order.type === 'build' && v.order.target === b.id);
    if (!working) {
      const v = pickBuilder(w, bot, b.x, b.y);
      if (v) setOrder(v, { type: 'build', target: b.id, after: v.order.type === 'gather' ? { ...v.order, phase: 'go' } : null });
    }
  }

  // houses
  const houseBuilding = unfinished.some((b) => b.type === 'house');
  const margin = 2 + (teamBuildings(w, bot.team, 'barracks', true).length + teamBuildings(w, bot.team, 'stable', true).length) * 2;
  const forgets = bot.diffKey === 'easy' && w.rng() < 0.5;
  if (!houseBuilding && !forgets && team.popCap < 100 && team.popCap - team.popUsed <= margin) {
    tryBuild(w, bot, 'house', tc.x, tc.y, 4, 10);
  }

  // storehouses near resources that are far from any drop-off
  const stores = teamBuildings(w, bot.team, 'storehouse');
  if (stores.length < bot.opening.maxStorehouses && !unfinished.some((b) => b.type === 'storehouse')) {
    for (const v of vills) {
      if (v.order.type !== 'gather') continue;
      const res = w.get(v.order.target);
      if (!res) continue;
      const drop = nearestDropoff(w, bot.team, res.x, res.y);
      if (!drop || distToEntity(res.x, res.y, drop) > 6 * T) {
        if (tryBuild(w, bot, 'storehouse', res.x, res.y, 1, 4)) break;
      }
    }
  }

  // military buildings: a Barracks first, a Stable once the Feudal Age allows it
  const toward = { x: tc.x + (w.w * T / 2 - tc.x) * 0.25, y: tc.y + (w.h * T / 2 - tc.y) * 0.25 };
  const allMix = [...Object.keys(bot.opening.mix), ...Object.keys(bot.opening.mixAfter)];
  const count = (t: BuildingType): number => teamBuildings(w, bot.team, t).length;
  if (bot.saving) return;
  if (count('barracks') === 0 && vills.length >= bot.opening.barracksAtVillagers) {
    tryBuild(w, bot, 'barracks', toward.x, toward.y, 2, 9);
  } else if (team.age >= 1 && count('stable') === 0 && allMix.includes('cavalry')) {
    tryBuild(w, bot, 'stable', toward.x, toward.y, 2, 10);
  } else if (team.age >= 2 && count('pagoda') === 0 && allMix.includes('samurai') && vills.length >= 16) {
    if (!tryBuild(w, bot, 'pagoda', toward.x, toward.y, 3, 11)) bot.reserve = BUILDINGS.pagoda.cost;
  } else if (count('barracks') === 1 && bot.diffKey !== 'easy' && vills.length >= 20) {
    tryBuild(w, bot, 'barracks', toward.x, toward.y, 2, 10);
  } else if (team.age >= 1 && count('guardTower') + count('watchTower') < bot.opening.towers) {
    // guard towers on the side facing the enemy
    const out = { x: tc.x + (w.w * T / 2 - tc.x) * 0.15, y: tc.y + (w.h * T / 2 - tc.y) * 0.15 };
    tryBuild(w, bot, 'guardTower', out.x, out.y, 3, 8);
  }
}

function military(w: World, bot: Bot): void {
  const team = w.teams[bot.team];
  const vills = teamUnits(w, bot.team, 'villager').length;
  const tc = home(w, bot);
  const villagersWanted = vills < bot.diff.villagerTarget && !(bot.opening.earlyVillagerCap !== null && bot.attacksSent === 0 && vills >= bot.opening.earlyVillagerCap);
  const mix = bot.attacksSent === 0 ? bot.opening.mix : bot.opening.mixAfter;
  const soldiers = w.units.filter((u) => !u.dead && u.team === bot.team && isSoldier(u) && !isNaval(u) && u.type !== 'scout');
  const trainers = w.buildings.filter((b) => !b.dead && b.team === bot.team && b.progress >= 1 && (b.type === 'barracks' || b.type === 'stable' || b.type === 'pagoda'));
  // with a few Samurai out, study the Way of the Warrior before training more
  const pagoda = trainers.find((b) => b.type === 'pagoda');
  const samurai = soldiers.filter((u) => u.type === 'samurai').length;
  const study = !!pagoda && !team.wayOfWarrior && samurai >= 3;
  if (pagoda && study && !pagoda.research && pagoda.queue.length === 0 && startResearch(w, pagoda, 'warrior') === 'cost') bot.reserve = WAY_OF_WARRIOR.cost;
  for (const b of trainers) {
    if (b.queue.length >= 2) continue;
    if (b === pagoda && (study || b.research)) continue;
    const canTrain = BUILDINGS[b.type as BuildingType].trains;
    // pick the unit type furthest below its share of the mix
    const counts: Record<string, number> = {};
    for (const s of soldiers) counts[s.type] = (counts[s.type] ?? 0) + 1;
    for (const q of b.queue) counts[q] = (counts[q] ?? 0) + 1;
    const total = Object.values(counts).reduce((a, c) => a + c, 0) + 1;
    const wsum = Object.values(mix).reduce((a, c) => a + (c ?? 0), 0);
    let pick: UnitType | null = null;
    let worst = -Infinity;
    for (const [k, wt] of Object.entries(mix) as [UnitType, number][]) {
      if (!canTrain.includes(k) || !unitAvailable(w, bot.team, k)) continue;
      const deficit = wt / wsum - (counts[k] ?? 0) / total;
      if (deficit > worst) {
        worst = deficit;
        pick = k;
      }
    }
    if (!pick) continue;
    const cost = UNITS[pick].cost;
    const reserve = villagersWanted && tc && tc.queue.length === 0 ? 50 : 0;
    if (bot.saving) continue;
    // keep back what is set aside for a Pagoda or a war boat
    const kept = (['food', 'wood', 'gold', 'stone'] as const).every((k) => team[k] - (cost[k] ?? 0) >= (bot.reserve[k] ?? 0) || !cost[k]);
    if (kept && team.food >= (cost.food ?? 0) + reserve && canAfford(w, bot.team, cost)) train(w, b, pick);
  }
}

function playerTargets(w: World, bot: Bot): Entity[] {
  return w.buildings.filter((b) => !b.dead && b.team !== bot.team && b.team < 2);
}

function attack(w: World, bot: Bot, tc: Entity): void {
  const army = w.units.filter((u) => !u.dead && u.team === bot.team && isSoldier(u) && !isNaval(u) && !u.inside && !isRider(bot, u) && u.type !== 'scout' && !bot.defending.has(u.id));
  const idle = army.filter((u) => u.order.type === 'idle');
  if (idle.length < bot.attackSize || w.time < bot.diff.firstAttackSec) return;
  const targets = playerTargets(w, bot);
  if (targets.length === 0) return;
  let goal: Entity;
  if (bot.openingKey === 'horseRaid' && bot.attacksSent === 0) {
    // raid the enemy drop-off closest to us (usually an outlying Storehouse)
    const drops = targets.filter((b) => BUILDINGS[b.type as BuildingType].dropoff);
    goal = drops.sort((a, b) => Math.hypot(a.x - tc.x, a.y - tc.y) - Math.hypot(b.x - tc.x, b.y - tc.y))[0] ?? targets[0];
  } else {
    goal = targets.sort((a, b) => Math.hypot(a.x - tc.x, a.y - tc.y) - Math.hypot(b.x - tc.x, b.y - tc.y))[0];
  }
  // send the planned number; anything extra stays home to defend
  orderMove(w, idle.slice(0, bot.attackSize), goal.x, goal.y, true);
  bot.attacksSent++;
  bot.attackSize += Math.max(1, Math.round(bot.opening.attackGrow * bot.diff.armyScale));
}

function defend(w: World, bot: Bot, tc: Entity): void {
  const mine = teamBuildings(w, bot.team);
  const threats = w.units.filter((u) => !u.dead && u.team !== bot.team && u.team < 2 && mine.some((b) => distToEntity(u.x, u.y, b) < 8 * T));
  if (threats.length === 0) {
    if (bot.threatSince >= 0 && w.time - bot.lastThreatAt > 5) {
      bot.threatSince = -1;
      bot.defending.clear();
    }
    return;
  }
  bot.lastThreatAt = w.time;
  if (bot.threatSince < 0) bot.threatSince = w.time;
  if (w.time - bot.threatSince < bot.diff.reactSec) return;
  const cx = threats.reduce((a, u) => a + u.x, 0) / threats.length;
  const cy = threats.reduce((a, u) => a + u.y, 0) / threats.length;
  // soldiers nearby come home to fight
  const soldiers = w.units.filter((u) => !u.dead && u.team === bot.team && isSoldier(u) && !isNaval(u) && !u.inside && !isRider(bot, u) && Math.hypot(u.x - tc.x, u.y - tc.y) < 25 * T);
  const free = soldiers.filter((u) => u.order.type !== 'attack');
  if (free.length) {
    orderMove(w, free, cx, cy, true);
    for (const s of free) bot.defending.add(s.id);
  }
  // villagers near the raiders run to the Town Center
  for (const v of teamUnits(w, bot.team, 'villager')) {
    if (bot.fleeing.has(v.id)) continue;
    if (threats.some((t) => Math.hypot(t.x - v.x, t.y - v.y) < 4 * T)) {
      bot.fleeing.add(v.id);
      setOrder(v, { type: 'move', x: tc.x + (w.rng() - 0.5) * 24, y: tc.y + Math.sign(tc.y - v.y || 1) * 30, attackMove: false });
    }
  }
}

/**
 * On the Inland Sea: a Dock near the closest fish, fishing boats to work the
 * shoals, and from the Feudal Age a few war boats that hunt the enemy's boats
 * and Dock.
 */
function naval(w: World, bot: Bot, tc: Entity): void {
  if (w.river !== 'sea') return;
  const team = w.teams[bot.team];
  const vills = teamUnits(w, bot.team, 'villager').length;
  const docks = teamBuildings(w, bot.team, 'dock');
  const fish = nearestResource(w, tc.x, tc.y, (r) => r.type === 'fish', 60 * T);
  if (docks.length === 0) {
    if (vills >= 9 && fish && !bot.saving) tryBuild(w, bot, 'dock', fish.x, fish.y, 1, 12);
    return;
  }
  const dock = docks.find((d) => d.progress >= 1);
  const boats = teamUnits(w, bot.team, 'fishingBoat');
  const wars = teamUnits(w, bot.team, 'warBoat');
  const wantFish = Math.max(2, Math.round(bot.diff.villagerTarget / 6));
  const wantWar = team.age >= 1 ? Math.max(2, Math.round(4 * bot.diff.armyScale)) : 0;
  if (dock && dock.queue.length === 0 && !bot.saving) {
    if (boats.length < wantFish) train(w, dock, 'fishingBoat');
    else if (team.age >= 1 && wars.length >= 1 && teamUnits(w, bot.team, 'transportBoat').length === 0 && bot.diffKey !== 'easy') {
      if (train(w, dock, 'transportBoat') === 'cost') bot.reserve = UNITS.transportBoat.cost;
    } else if (wars.length < wantWar && train(w, dock, 'warBoat') === 'cost') bot.reserve = UNITS.warBoat.cost;
  }
  // idle fishing boats go back to the nearest shoal
  for (const b of boats) {
    if (b.order.type !== 'idle') continue;
    const f = nearestResource(w, b.x, b.y, (r) => r.type === 'fish', 60 * T);
    if (f) setOrder(b, { type: 'gather', target: f.id, resType: 'fish', phase: 'go', dropId: 0 });
  }
  // war boats: once there are enough, go after the enemy's boats, then its Dock
  const idle = wars.filter((u) => u.order.type === 'idle');
  if (idle.length >= Math.min(3, wantWar) && idle.length === wars.length) {
    const foes = w.units.filter((u) => !u.dead && u.team !== bot.team && u.team < 2 && isNaval(u));
    const foeDocks = w.buildings.filter((b) => !b.dead && b.team !== bot.team && b.team < 2 && b.type === 'dock');
    const goal = [...foes, ...foeDocks].sort((a, b) => Math.hypot(a.x - tc.x, a.y - tc.y) - Math.hypot(b.x - tc.x, b.y - tc.y))[0];
    if (goal) orderMove(w, idle, goal.x, goal.y, true);
  }
}

/** An enemy building near its shore, as deep in its land (close to its Town Center) as possible. */
function landingTarget(w: World, bot: Bot): Entity | null {
  const enemyTc = w.buildings.find((b) => !b.dead && b.team !== bot.team && b.team < 2 && b.type === 'townCenter');
  if (!enemyTc) return null;
  const coastal = w.buildings.filter((b) => !b.dead && b.team !== bot.team && b.team < 2 && landingSpot(w, b.x, b.y, 7));
  coastal.sort((a, b) => Math.hypot(a.x - enemyTc.x, a.y - enemyTc.y) - Math.hypot(b.x - enemyTc.x, b.y - enemyTc.y));
  return coastal[0] ?? null;
}

const isRider = (bot: Bot, u: Entity): boolean => !!bot.landing && bot.landing.riders.includes(u.id);

/**
 * Sea landings (Inland Sea, Normal and Hard): every other attack, up to 8 idle
 * soldiers board the transport, sail round to the shore nearest an enemy
 * building deep in its land, and storm ashore there instead of crossing the
 * sandbars. Returns true while a landing is being launched, so the normal
 * attack waits.
 */
function landing(w: World, bot: Bot): boolean {
  const L = bot.landing;
  if (L) {
    const boat = w.get(L.boat);
    const riders = L.riders.map((id) => w.get(id)).filter((u): u is Entity => !!u);
    if (!boat || riders.length === 0) {
      bot.landing = null;
      return false;
    }
    if (L.phase === 'boarding') {
      const aboard = garrisoned(w, boat).length;
      // the target fell already (the main army got there first): pick another
      if (!w.get(L.target)) L.target = landingTarget(w, bot)?.id ?? 0;
      const target = w.get(L.target);
      // everyone aboard, or the stragglers took too long: set sail
      if (target && (aboard === riders.length || (w.time - L.since > 45 && aboard >= 3))) {
        if (orderUnload(w, [boat], target.x, target.y)) {
          L.phase = 'sailing';
          L.since = w.time;
          bot.landingsSent++;
        }
      } else if (!target || w.time - L.since > 90) {
        // give up: everyone off again, and nobody left waiting to board
        landPassengers(w, boat);
        for (const u of riders) if (u.order.type === 'board') setOrder(u, { type: 'idle' });
        bot.landing = null;
      }
      return true;
    }
    // sailing: done once everyone is ashore (they march on the target themselves)
    if (garrisoned(w, boat).length === 0 && boat.order.type !== 'unload') {
      bot.landing = null;
      const dock = teamBuildings(w, bot.team, 'dock', true)[0];
      if (dock) orderMove(w, [boat], dock.x, dock.y);
    }
    return false;
  }
  if (w.river !== 'sea' || bot.diffKey === 'easy' || bot.attacksSent === 0 || bot.attacksSent % 2 === 0) return false;
  const boat = teamUnits(w, bot.team, 'transportBoat').find((b) => b.order.type === 'idle' && garrisoned(w, b).length === 0);
  if (!boat) return false;
  const idle = w.units.filter((u) => !u.dead && u.team === bot.team && isSoldier(u) && !isNaval(u) && !u.inside && u.type !== 'scout' && u.order.type === 'idle' && !bot.defending.has(u.id));
  if (idle.length < Math.min(6, bot.attackSize)) return false;
  const target = landingTarget(w, bot);
  if (!target) return false;
  const riders = idle.sort((a, b) => Math.hypot(a.x - boat.x, a.y - boat.y) - Math.hypot(b.x - boat.x, b.y - boat.y)).slice(0, 8);
  orderBoard(w, riders, boat);
  bot.landing = { boat: boat.id, riders: riders.map((u) => u.id), target: target.id, phase: 'boarding', since: w.time };
  bot.attacksSent++;
  bot.attackSize += Math.max(1, Math.round(bot.opening.attackGrow * bot.diff.armyScale));
  return true;
}

export function updateBot(w: World, bot: Bot, dt: number): void {
  bot.t -= dt;
  if (bot.t > 0) return;
  bot.t = bot.diff.decideSec * (0.8 + w.rng() * 0.4);
  const tc = home(w, bot);
  if (!tc) return;
  bot.reserve = {};
  defend(w, bot, tc);
  if (w.rng() < bot.diff.mistakeChance) return;
  economy(w, bot, tc);
  naval(w, bot, tc);
  military(w, bot);
  if (!landing(w, bot)) attack(w, bot, tc);
}
