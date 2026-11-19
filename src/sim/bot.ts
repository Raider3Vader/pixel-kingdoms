// The enemy kingdom. It plays by the player's rules (same costs, same commands);
// difficulty only changes how often and how well it makes decisions.

import {
  BUILDINGS,
  DIFFICULTY,
  OPENINGS,
  RESOURCES,
  UNITS,
  type BuildingType,
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
  canPlace,
  distToEntity,
  isSoldier,
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
    if (canPlace(w, team, type, c.tx, c.ty, false) === 'blocked') continue;
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
  if (w.teams[bot.team].wood < BUILDINGS[type].wood) return false;
  const spot = findBuildSpot(w, bot.team, type, x, y, minR, maxR);
  if (!spot) return false;
  const b = pickBuilder(w, bot, (spot.tx + 1) * T, (spot.ty + 1) * T);
  if (!b) return false;
  return placeBuilding(w, bot.team, type, spot.tx, spot.ty, [b], false) === 'ok';
}

function economy(w: World, bot: Bot, tc: Entity): void {
  const team = w.teams[bot.team];
  const vills = teamUnits(w, bot.team, 'villager');
  const queuedV = tc.queue.filter((q) => q === 'villager').length;
  let target = bot.diff.villagerTarget;
  if (bot.opening.earlyVillagerCap !== null && bot.attacksSent === 0) target = Math.min(target, bot.opening.earlyVillagerCap);

  // villagers
  if (vills.length + queuedV < target && tc.queue.length < 2) train(w, tc, 'villager');

  // put idle villagers to work
  const threat = bot.threatSince >= 0;
  let food = 0;
  let wood = 0;
  for (const v of vills) {
    if (v.order.type === 'gather') {
      if (kindOf(v.order.resType) === 'food') food++;
      else wood++;
    }
  }
  for (const v of vills) {
    if (v.order.type !== 'idle') continue;
    if (threat && bot.fleeing.has(v.id)) continue;
    bot.fleeing.delete(v.id);
    const wantFood = food < Math.round((food + wood + 1) * bot.opening.foodShare);
    const kind: ResKind = wantFood ? 'food' : 'wood';
    let res = nearestResource(w, v.x, v.y, (r) => RESOURCES[r.type as ResourceType].kind === kind, 30 * T);
    if (!res) res = nearestResource(w, v.x, v.y, () => true, 40 * T);
    if (!res) continue;
    setOrder(v, { type: 'gather', target: res.id, resType: res.type as ResourceType, phase: 'go', dropId: 0 });
    if (kind === 'food') food++;
    else wood++;
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
  const margin = 2 + teamBuildings(w, bot.team, 'barracks', true).length * 2;
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

  // barracks
  const barracks = teamBuildings(w, bot.team, 'barracks');
  const toward = { x: tc.x + (w.w * T / 2 - tc.x) * 0.25, y: tc.y + (w.h * T / 2 - tc.y) * 0.25 };
  if (barracks.length === 0 && vills.length >= bot.opening.barracksAtVillagers) {
    tryBuild(w, bot, 'barracks', toward.x, toward.y, 2, 9);
  } else if (barracks.length === 1 && bot.diffKey !== 'easy' && vills.length >= 20) {
    tryBuild(w, bot, 'barracks', toward.x, toward.y, 2, 10);
  }
}

function military(w: World, bot: Bot): void {
  const team = w.teams[bot.team];
  const vills = teamUnits(w, bot.team, 'villager').length;
  const tc = home(w, bot);
  const villagersWanted = vills < bot.diff.villagerTarget && !(bot.opening.earlyVillagerCap !== null && bot.attacksSent === 0 && vills >= bot.opening.earlyVillagerCap);
  const mix = bot.attacksSent === 0 ? bot.opening.mix : bot.opening.mixAfter;
  const soldiers = w.units.filter((u) => !u.dead && u.team === bot.team && isSoldier(u));
  for (const b of teamBuildings(w, bot.team, 'barracks', true)) {
    if (b.queue.length >= 2) continue;
    // pick the unit type furthest below its share of the mix
    const counts: Record<string, number> = {};
    for (const s of soldiers) counts[s.type] = (counts[s.type] ?? 0) + 1;
    for (const q of b.queue) counts[q] = (counts[q] ?? 0) + 1;
    const total = Object.values(counts).reduce((a, c) => a + c, 0) + 1;
    const wsum = Object.values(mix).reduce((a, c) => a + (c ?? 0), 0);
    let pick: UnitType | null = null;
    let worst = -Infinity;
    for (const [k, wt] of Object.entries(mix) as [UnitType, number][]) {
      const deficit = wt / wsum - (counts[k] ?? 0) / total;
      if (deficit > worst) {
        worst = deficit;
        pick = k;
      }
    }
    if (!pick) continue;
    const u = UNITS[pick];
    const reserve = villagersWanted && tc && tc.queue.length === 0 ? 50 : 0;
    if (team.food >= u.food + reserve && team.wood >= u.wood) train(w, b, pick);
  }
}

function playerTargets(w: World, bot: Bot): Entity[] {
  return w.buildings.filter((b) => !b.dead && b.team !== bot.team && b.team < 2);
}

function attack(w: World, bot: Bot, tc: Entity): void {
  const army = w.units.filter((u) => !u.dead && u.team === bot.team && isSoldier(u) && !bot.defending.has(u.id));
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
  const soldiers = w.units.filter((u) => !u.dead && u.team === bot.team && isSoldier(u) && Math.hypot(u.x - tc.x, u.y - tc.y) < 25 * T);
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

export function updateBot(w: World, bot: Bot, dt: number): void {
  bot.t -= dt;
  if (bot.t > 0) return;
  bot.t = bot.diff.decideSec * (0.8 + w.rng() * 0.4);
  const tc = home(w, bot);
  if (!tc) return;
  defend(w, bot, tc);
  if (w.rng() < bot.diff.mistakeChance) return;
  economy(w, bot, tc);
  military(w, bot);
  attack(w, bot, tc);
}
