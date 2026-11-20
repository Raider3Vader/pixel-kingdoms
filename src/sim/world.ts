// Game state and rules. No drawing code lives here, so it can run in tests.

import {
  AGES,
  BUILDINGS,
  CLOSE_QUARTERS,
  ECONOMY,
  FARM,
  MAP,
  MARKET,
  REPAIR,
  RESOURCES,
  RES_KINDS,
  SIM,
  TOWER_UPGRADE,
  UNITS,
  hitDamage,
  unitStats,
  type Age,
  type BuildingType,
  type Cost,
  type ResKind,
  type ResourceType,
  type UnitType,
} from '../config';
import { OPEN_GATE, findPath, nearestFree, type Pt } from './path';
import { formationTargets, type Formation } from './formation';

export const T = 16; // tile size in world px
export const PLAYER = 0;
export const ENEMY = 1;
export const NATURE = 2;

export type Kind = 'unit' | 'building' | 'resource';
export type Anim = 'idle' | 'walk' | 'attack' | 'work';

export type Order =
  | { type: 'idle' }
  | { type: 'move'; x: number; y: number; attackMove: boolean }
  | { type: 'gather'; target: number; resType: ResourceType; phase: 'go' | 'work' | 'drop'; dropId: number }
  | { type: 'build'; target: number; after: Order | null }
  | { type: 'attack'; target: number; after: Order | null }
  | { type: 'repair'; target: number }
  | { type: 'garrison'; target: number };

export interface Entity {
  id: number;
  kind: Kind;
  type: string;
  team: number;
  x: number; // center, world px
  y: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  // units
  order: Order;
  path: Pt[];
  repathT: number;
  goalX: number;
  goalY: number;
  carryKind: ResKind | null;
  carry: number;
  cooldown: number;
  facing: 1 | -1;
  anim: Anim;
  animT: number;
  scanT: number;
  lastHurt: number;
  // buildings
  tx: number;
  ty: number;
  size: number;
  progress: number; // 0..1, 1 = finished
  queue: UnitType[];
  queueT: number;
  rally: Pt | null;
  rallyTarget: number;
  pending: Order[]; // queued orders (Shift + right-click), done in turn
  formation: Formation | null; // set with the formation keys
  hostile: boolean; // soldiers: chase any enemy in sight, even while marching
  inside: number; // id of the tower this unit is garrisoned in, or 0
  locked: boolean; // gates: closed to everyone
  research: { key: 'age' | 'merchant' | 'towerUpgrade'; t: number; sec: number } | null;
  repairDebt: Cost; // fractional repair costs not yet paid
  speedCap: number; // tiles/s; > 0 while marching in formation
  seen: boolean; // has the player ever seen it
  housed: boolean;
  // resources
  amount: number;
  startAmount: number;
}

export interface TeamStats {
  gathered: number;
  trained: number;
  killed: number;
  lost: number;
  razed: number;
}

export interface TeamState {
  food: number;
  wood: number;
  gold: number;
  stone: number;
  age: Age;
  merchants: number;
  popCap: number;
  popUsed: number;
  stats: TeamStats;
  lastAlertAt: number;
}

export type SimEvent =
  | { t: 'death'; x: number; y: number; team: number; type: string; kind: Kind }
  | { t: 'hit'; x: number; y: number; team: number; ranged: boolean; fx: number; fy: number }
  | { t: 'built'; id: number; team: number; type: string; x: number; y: number }
  | { t: 'trained'; id: number; team: number; type: string; x: number; y: number }
  | { t: 'underAttack'; team: number; x: number; y: number }
  | { t: 'housed'; team: number }
  | { t: 'placed'; team: number; x: number; y: number }
  | { t: 'gameOver'; winner: number }
  | { t: 'aged'; team: number; age: Age }
  | { t: 'researched'; team: number; key: string; x: number; y: number }
  | { t: 'cantRepair'; team: number; kind: ResKind };

export class World {
  readonly w = MAP.widthTiles;
  readonly h = MAP.heightTiles;
  blocked: Uint8Array; // 0 free, 1 resource, 2 building, 3 water
  water: Uint8Array; // 1 = river
  bridge: Uint8Array; // 1 = walkable crossing over the river
  occ: Int32Array; // entity id on the tile, or 0
  ents = new Map<number, Entity>();
  units: Entity[] = [];
  buildings: Entity[] = [];
  resources: Entity[] = [];
  teams: TeamState[] = [];
  time = 0;
  nextId = 1;
  events: SimEvent[] = [];
  winner: number | null = null;
  vis: Uint8Array[]; // per team, 1 = visible now
  explored: Uint8Array[];
  fogT = 0;
  rngState: number;

  constructor(seed = 1) {
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.water = new Uint8Array(n);
    this.bridge = new Uint8Array(n);
    this.occ = new Int32Array(n);
    this.vis = [new Uint8Array(n), new Uint8Array(n)];
    this.explored = [new Uint8Array(n), new Uint8Array(n)];
    this.rngState = seed >>> 0 || 1;
    for (let i = 0; i < 2; i++) {
      this.teams.push({
        food: ECONOMY.startingFood,
        wood: ECONOMY.startingWood,
        gold: ECONOMY.startingGold,
        stone: ECONOMY.startingStone,
        age: 0,
        merchants: 0,
        popCap: 0,
        popUsed: 0,
        stats: { gathered: 0, trained: 0, killed: 0, lost: 0, razed: 0 },
        lastAlertAt: -999,
      });
    }
  }

  rng(): number {
    // mulberry32
    let t = (this.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  get(id: number): Entity | undefined {
    const e = this.ents.get(id);
    return e && !e.dead ? e : undefined;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  /** Blocked for `team` (open gates of that team are passable). team -1: blocked for anyone. */
  isBlocked(tx: number, ty: number, team = -1): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const v = this.blocked[ty * this.w + tx];
    return v !== 0 && !(team >= 0 && v === OPEN_GATE + team);
  }

  emit(e: SimEvent): void {
    this.events.push(e);
    if (this.events.length > 2000) this.events.splice(0, 1000);
  }
}

// ---------- entity creation ----------

function blank(w: World, kind: Kind, type: string, team: number, x: number, y: number, hp: number): Entity {
  return {
    id: w.nextId++,
    kind,
    type,
    team,
    x,
    y,
    hp,
    maxHp: hp,
    dead: false,
    order: { type: 'idle' },
    path: [],
    repathT: 0,
    goalX: -1,
    goalY: -1,
    carryKind: null,
    carry: 0,
    cooldown: 0,
    facing: 1,
    anim: 'idle',
    animT: w.rng() * 10,
    scanT: w.rng() * SIM.scanSec,
    lastHurt: -99,
    tx: 0,
    ty: 0,
    size: 1,
    progress: 1,
    queue: [],
    queueT: 0,
    rally: null,
    rallyTarget: 0,
    pending: [],
    formation: null,
    hostile: false,
    inside: 0,
    locked: false,
    research: null,
    repairDebt: {},
    speedCap: 0,
    seen: false,
    housed: false,
    amount: 0,
    startAmount: 0,
  };
}

export function spawnUnit(w: World, type: UnitType, team: number, x: number, y: number): Entity {
  const e = blank(w, 'unit', type, team, x, y, unitStats(type, w.teams[team]?.age ?? 0).hp);
  e.hostile = type !== 'villager' && type !== 'scout';
  w.ents.set(e.id, e);
  w.units.push(e);
  return e;
}

export function spawnResource(w: World, type: ResourceType, tx: number, ty: number): Entity | null {
  if (w.isBlocked(tx, ty)) return null;
  const e = blank(w, 'resource', type, NATURE, (tx + 0.5) * T, (ty + 0.5) * T, 1);
  e.tx = tx;
  e.ty = ty;
  e.amount = e.startAmount = RESOURCES[type].amount;
  w.ents.set(e.id, e);
  w.resources.push(e);
  const i = ty * w.w + tx;
  w.blocked[i] = 1;
  w.occ[i] = e.id;
  return e;
}

export function spawnBuilding(w: World, type: BuildingType, team: number, tx: number, ty: number, finished: boolean): Entity {
  const s = BUILDINGS[type];
  const e = blank(w, 'building', type, team, (tx + s.size / 2) * T, (ty + s.size / 2) * T, s.hp);
  e.tx = tx;
  e.ty = ty;
  e.size = s.size;
  e.progress = finished ? 1 : 0;
  e.hp = finished ? s.hp : Math.max(1, Math.round(s.hp * 0.1));
  w.ents.set(e.id, e);
  w.buildings.push(e);
  for (let y = ty; y < ty + s.size; y++) {
    for (let x = tx; x < tx + s.size; x++) {
      const i = y * w.w + x;
      if (!s.walkable) w.blocked[i] = 2;
      w.occ[i] = e.id;
    }
  }
  if (finished) applyGate(w, e);
  if (type === 'farm' && finished) e.amount = e.startAmount = RESOURCES.farm.amount;
  if (s.walkable) return e;
  // push units out of the footprint
  for (const u of w.units) {
    const utx = Math.floor(u.x / T);
    const uty = Math.floor(u.y / T);
    if (utx >= tx && utx < tx + s.size && uty >= ty && uty < ty + s.size) unstick(w, u);
  }
  return e;
}

// ---------- queries ----------

export const isSoldier = (e: Entity): boolean => e.kind === 'unit' && e.type !== 'villager';

export function tileOf(v: number): number {
  return Math.floor(v / T);
}

/** Distance from a point to an entity's edge (0 inside). */
export function distToEntity(x: number, y: number, e: Entity): number {
  if (e.kind === 'unit') return Math.max(0, Math.hypot(e.x - x, e.y - y) - SIM.unitRadius);
  const x0 = e.tx * T;
  const y0 = e.ty * T;
  const x1 = x0 + e.size * T;
  const y1 = y0 + e.size * T;
  const dx = Math.max(x0 - x, 0, x - x1);
  const dy = Math.max(y0 - y, 0, y - y1);
  return Math.hypot(dx, dy);
}

export function teamUnits(w: World, team: number, type?: UnitType): Entity[] {
  return w.units.filter((u) => !u.dead && u.team === team && (!type || u.type === type));
}

export function teamBuildings(w: World, team: number, type?: BuildingType, finishedOnly = false): Entity[] {
  return w.buildings.filter((b) => !b.dead && b.team === team && (!type || b.type === type) && (!finishedOnly || b.progress >= 1));
}

export function nearestDropoff(w: World, team: number, x: number, y: number): Entity | null {
  let best: Entity | null = null;
  let bd = Infinity;
  for (const b of w.buildings) {
    if (b.dead || b.team !== team || b.progress < 1 || !BUILDINGS[b.type as BuildingType].dropoff) continue;
    const d = distToEntity(x, y, b);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** The nearest finished rice paddy of a team that nobody is working. */
export function freeFarm(w: World, team: number, x: number, y: number, maxDist = Infinity): Entity | null {
  let best: Entity | null = null;
  let bd = maxDist;
  for (const b of w.buildings) {
    if (b.dead || b.team !== team || b.type !== 'farm' || b.progress < 1) continue;
    if (w.units.some((u) => !u.dead && u.order.type === 'gather' && u.order.target === b.id)) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** True if a resource has at least one open tile next to it (so it can be reached). */
export function exposed(w: World, r: Entity): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !w.isBlocked(r.tx + dx, r.ty + dy)) return true;
  return false;
}

export function nearestResource(w: World, x: number, y: number, match: (r: Entity) => boolean, maxDist = Infinity): Entity | null {
  let best: Entity | null = null;
  let bd = maxDist;
  for (const r of w.resources) {
    if (r.dead || !match(r) || !exposed(w, r)) continue;
    const d = Math.hypot(r.x - x, r.y - y);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

/** The entity under a world point: units first, then buildings and resources. */
export function entityAt(w: World, x: number, y: number, filter: (e: Entity) => boolean = () => true): Entity | null {
  let best: Entity | null = null;
  let bd = 8;
  for (const u of w.units) {
    if (u.dead || u.inside || !filter(u)) continue;
    // sprites stand above their feet point, so favour clicks slightly above
    const d = Math.hypot(u.x - x, u.y - 3 - y);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  if (best) return best;
  const tx = tileOf(x);
  const ty = tileOf(y);
  if (!w.inBounds(tx, ty)) return null;
  const id = w.occ[ty * w.w + tx];
  const e = id ? w.get(id) : undefined;
  return e && filter(e) ? e : null;
}

export function canAfford(w: World, team: number, cost: Cost): boolean {
  const t = w.teams[team];
  return RES_KINDS.every((k) => t[k] >= (cost[k] ?? 0));
}

export function pay(w: World, team: number, cost: Cost): void {
  const t = w.teams[team];
  for (const k of RES_KINDS) t[k] -= cost[k] ?? 0;
}

export function refund(w: World, team: number, cost: Cost): void {
  const t = w.teams[team];
  for (const k of RES_KINDS) t[k] += cost[k] ?? 0;
}

/** The first resource the team is short of for this cost, or null. */
export function shortOf(w: World, team: number, cost: Cost): ResKind | null {
  const t = w.teams[team];
  return RES_KINDS.find((k) => t[k] < (cost[k] ?? 0)) ?? null;
}

export type PlaceResult = 'ok' | 'blocked' | 'unexplored' | 'cost' | 'age';

export function canPlace(w: World, team: number, type: BuildingType, tx: number, ty: number, requireExplored = true): PlaceResult {
  const s = BUILDINGS[type];
  if (team < 2 && w.teams[team].age < s.age) return 'age';
  for (let y = ty; y < ty + s.size; y++) {
    for (let x = tx; x < tx + s.size; x++) {
      if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) return 'blocked';
      if (w.blocked[y * w.w + x] || w.occ[y * w.w + x]) return 'blocked';
      if (requireExplored && team < 2 && !w.explored[team][y * w.w + x]) return 'unexplored';
    }
  }
  if (!canAfford(w, team, s.cost)) return 'cost';
  return 'ok';
}

/** Gates: an unlocked, finished gate lets its own side through. */
export function applyGate(w: World, b: Entity): void {
  if (!BUILDINGS[b.type as BuildingType].gate || b.dead) return;
  const code = b.progress >= 1 && !b.locked ? OPEN_GATE + b.team : 2;
  w.blocked[b.ty * w.w + b.tx] = code;
}

export function setGateLocked(w: World, b: Entity, locked: boolean): void {
  b.locked = locked;
  applyGate(w, b);
  if (locked) for (const u of w.units) if (tileOf(u.x) === b.tx && tileOf(u.y) === b.ty) unstick(w, u);
}

// ---------- commands (used by the player's input and by the enemy AI) ----------

export function placeBuilding(w: World, team: number, type: BuildingType, tx: number, ty: number, builders: Entity[], requireExplored = true): PlaceResult {
  const r = canPlace(w, team, type, tx, ty, requireExplored);
  if (r !== 'ok') return r;
  pay(w, team, BUILDINGS[type].cost);
  const b = spawnBuilding(w, type, team, tx, ty, false);
  w.emit({ t: 'placed', team, x: b.x, y: b.y });
  for (const u of builders) {
    if (u.type !== 'villager' || u.team !== team) continue;
    const prev = u.order.type === 'gather' ? u.order : null;
    setOrder(u, { type: 'build', target: b.id, after: prev ? { ...prev, phase: 'go' } : null });
  }
  return 'ok';
}

/** Tiles on a straight line between two tiles (8-connected, so walls have no gaps). */
export function lineTiles(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const out: Pt[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

export const MAX_WALL = 24;

/** Places a wall from one tile to another. Returns how many pieces went down. */
export function placeWallLine(w: World, team: number, type: BuildingType, x0: number, y0: number, x1: number, y1: number, builders: Entity[], requireExplored = true): number {
  let placed = 0;
  let first: Entity | null = null;
  for (const t of lineTiles(x0, y0, x1, y1).slice(0, MAX_WALL)) {
    if (canPlace(w, team, type, t.x, t.y, requireExplored) !== 'ok') continue;
    pay(w, team, BUILDINGS[type].cost);
    const b = spawnBuilding(w, type, team, t.x, t.y, false);
    first ??= b;
    placed++;
  }
  if (first) {
    w.emit({ t: 'placed', team, x: first.x, y: first.y });
    for (const u of builders) {
      if (u.type !== 'villager' || u.team !== team) continue;
      const prev = u.order.type === 'gather' ? u.order : null;
      setOrder(u, { type: 'build', target: first.id, after: prev ? { ...prev, phase: 'go' } : null });
    }
  }
  return placed;
}

export type TrainResult = 'ok' | 'cost' | 'queue' | 'cannot' | 'age' | 'busy';

/** Is this unit available to the team in its current age? */
export function unitAvailable(w: World, team: number, type: UnitType): boolean {
  return w.teams[team].age >= UNITS[type].age;
}

export function train(w: World, building: Entity, type: UnitType): TrainResult {
  const s = BUILDINGS[building.type as BuildingType];
  if (building.dead || building.progress < 1 || !s.trains.includes(type)) return 'cannot';
  if (!unitAvailable(w, building.team, type)) return 'age';
  if (building.research) return 'busy';
  if (building.queue.length >= ECONOMY.maxQueue) return 'queue';
  const cost = UNITS[type].cost;
  if (!canAfford(w, building.team, cost)) return 'cost';
  pay(w, building.team, cost);
  building.queue.push(type);
  return 'ok';
}

export function cancelTrain(w: World, building: Entity, index: number): void {
  const type = building.queue[index];
  if (!type) return;
  building.queue.splice(index, 1);
  if (index === 0) building.queueT = 0;
  refund(w, building.team, UNITS[type].cost);
}

export type ResearchKey = 'age' | 'merchant' | 'towerUpgrade';

/** What a research costs and how long it takes, or null if it can't be done here now. */
export function researchInfo(w: World, b: Entity, key: ResearchKey): { cost: Cost; sec: number; name: string } | null {
  const team = w.teams[b.team];
  if (key === 'age') {
    if (b.type !== 'townCenter' || team.age >= 2) return null;
    const next = AGES[team.age + 1];
    return { cost: next.cost, sec: next.sec, name: `Advance to the ${next.name}` };
  }
  if (key === 'merchant') {
    if (b.type !== 'market' || team.merchants >= MARKET.maxMerchants) return null;
    return { cost: MARKET.merchantCost, sec: MARKET.merchantSec, name: 'Hire a merchant' };
  }
  if (b.type !== 'watchTower' || team.age < 1) return null;
  return { cost: TOWER_UPGRADE.cost, sec: TOWER_UPGRADE.sec, name: 'Upgrade to a guard tower' };
}

export function startResearch(w: World, b: Entity, key: ResearchKey): 'ok' | 'cost' | 'busy' | 'cannot' {
  if (b.dead || b.progress < 1) return 'cannot';
  if (b.research || b.queue.length) return 'busy';
  // only one age advance at a time, across all Town Centers
  if (key === 'age' && w.buildings.some((o) => o.team === b.team && o.research?.key === 'age')) return 'busy';
  if (key === 'merchant' && w.buildings.some((o) => o.team === b.team && o.research?.key === 'merchant')) return 'busy';
  const info = researchInfo(w, b, key);
  if (!info) return 'cannot';
  if (!canAfford(w, b.team, info.cost)) return 'cost';
  pay(w, b.team, info.cost);
  b.research = { key, t: 0, sec: info.sec };
  return 'ok';
}

export function cancelResearch(w: World, b: Entity): void {
  if (!b.research) return;
  const info = researchInfo(w, b, b.research.key);
  if (info) refund(w, b.team, info.cost);
  b.research = null;
}

function finishResearch(w: World, b: Entity): void {
  const key = b.research!.key;
  b.research = null;
  const team = w.teams[b.team];
  if (key === 'age') {
    team.age = Math.min(2, team.age + 1) as Age;
    // every unit of the team upgrades on the spot
    for (const u of w.units) {
      if (u.team !== b.team || u.dead) continue;
      const max = unitStats(u.type as UnitType, team.age).hp;
      u.hp = (u.hp / u.maxHp) * max;
      u.maxHp = max;
    }
    w.emit({ t: 'aged', team: b.team, age: team.age });
  } else if (key === 'merchant') {
    team.merchants++;
  } else {
    const was = b.maxHp;
    b.type = 'guardTower';
    b.maxHp = BUILDINGS.guardTower.hp;
    b.hp = Math.min(b.maxHp, b.hp + (b.maxHp - was));
  }
  w.emit({ t: 'researched', team: b.team, key, x: b.x, y: b.y });
}

/** Market: buy a lot of food, wood or stone with gold. */
export function buyResource(w: World, team: number, kind: 'food' | 'wood' | 'stone'): boolean {
  if (!w.buildings.some((b) => b.team === team && b.type === 'market' && b.progress >= 1)) return false;
  const price = MARKET.buy[kind];
  const t = w.teams[team];
  if (t.gold < price) return false;
  t.gold -= price;
  t[kind] += MARKET.lot;
  return true;
}

/** Gold per second a team earns from trade at its markets. */
export function tradeIncome(w: World, team: number): number {
  const markets = w.buildings.filter((b) => b.team === team && b.type === 'market' && b.progress >= 1).length;
  if (markets === 0) return 0;
  return markets * MARKET.tradePerSec + w.teams[team].merchants * MARKET.merchantPerSec;
}

export function setOrder(u: Entity, o: Order): void {
  u.order = o;
  u.speedCap = 0;
  u.path = [];
  u.repathT = 0;
  u.goalX = -1;
}

export function orderMove(w: World, units: Entity[], x: number, y: number, attackMove = false): void {
  const list = units.filter((u) => u.kind === 'unit' && !u.dead);
  const f = list[0]?.formation;
  if (list.length > 1 && f && list.every((u) => u.formation === f)) {
    const cx = list.reduce((a, u) => a + u.x, 0) / list.length;
    const cy = list.reduce((a, u) => a + u.y, 0) / list.length;
    placeFormation(w, list, f, x, y, x - cx, y - cy, attackMove);
    return;
  }
  // spread units out in a small grid around the point
  const cols = Math.ceil(Math.sqrt(list.length));
  const spacing = 11;
  list.forEach((u, i) => {
    const cx = (i % cols) - (cols - 1) / 2;
    const cy = Math.floor(i / cols) - (Math.ceil(list.length / cols) - 1) / 2;
    let px = x + cx * spacing;
    let py = y + cy * spacing;
    if (w.isBlocked(tileOf(px), tileOf(py))) {
      px = x;
      py = y;
    }
    setOrder(u, { type: 'move', x: px, y: py, attackMove });
  });
}

/** Puts units into formation around (x, y), facing (dx, dy). They march at the slowest one's pace. */
export function placeFormation(w: World, list: Entity[], f: Formation, x: number, y: number, dx: number, dy: number, attackMove = false): void {
  const pts = formationTargets(list, f, x, y, dx, dy);
  const slowest = Math.min(...list.map((u) => UNITS[u.type as UnitType].speed));
  list.forEach((u, i) => {
    let { x: px, y: py } = pts[i];
    if (w.isBlocked(tileOf(px), tileOf(py))) {
      const free = nearestFree(w, Math.max(0, Math.min(w.w - 1, tileOf(px))), Math.max(0, Math.min(w.h - 1, tileOf(py))), 4);
      if (free) {
        px = (free.x + 0.5) * T;
        py = (free.y + 0.5) * T;
      }
    }
    setOrder(u, { type: 'move', x: px, y: py, attackMove });
    u.speedCap = slowest;
  });
}

/** Formation key: set the formation and line up where the group stands. */
export function orderFormation(w: World, units: Entity[], f: Formation): void {
  const list = units.filter((u) => u.kind === 'unit' && !u.dead && u.type !== 'villager');
  if (list.length === 0) return;
  for (const u of list) {
    u.formation = f;
    u.pending.length = 0;
  }
  if (list.length < 2) return;
  const cx = list.reduce((a, u) => a + u.x, 0) / list.length;
  const cy = list.reduce((a, u) => a + u.y, 0) / list.length;
  // a fresh formation faces down the screen, so a line is horizontal
  placeFormation(w, list, f, cx, cy, 0, 1);
}

export function orderGather(w: World, units: Entity[], res: Entity): void {
  for (const u of units) {
    if (u.type !== 'villager' || u.dead) continue;
    setOrder(u, { type: 'gather', target: res.id, resType: res.type as ResourceType, phase: 'go', dropId: 0 });
  }
  void w;
}

export function orderAttack(w: World, units: Entity[], target: Entity): void {
  for (const u of units) {
    if (u.kind !== 'unit' || u.dead || u.team === target.team) continue;
    setOrder(u, { type: 'attack', target: target.id, after: null });
  }
  void w;
}

export function orderBuild(w: World, units: Entity[], b: Entity): void {
  for (const u of units) {
    if (u.type !== 'villager' || u.dead || u.team !== b.team) continue;
    setOrder(u, { type: 'build', target: b.id, after: null });
  }
  void w;
}

/** Right-click style order: does the obvious thing for what is under the point. */
export function smartOrder(w: World, units: Entity[], x: number, y: number, team: number, canSee: (e: Entity) => boolean): 'move' | 'gather' | 'build' | 'attack' | 'none' {
  const mine = units.filter((u) => u.kind === 'unit' && u.team === team && !u.dead);
  if (mine.length === 0) return 'none';
  for (const u of mine) u.pending.length = 0;
  const target = entityAt(w, x, y, (e) => canSee(e) && !(e.kind === 'unit' && e.team === team));
  if (target) {
    if (target.kind === 'resource') {
      const vills = mine.filter((u) => u.type === 'villager');
      if (vills.length) {
        orderGather(w, vills, target);
        const rest = mine.filter((u) => u.type !== 'villager');
        if (rest.length) orderMove(w, rest, x, y);
        return 'gather';
      }
    } else if (target.team !== team && target.team !== NATURE) {
      orderAttack(w, mine, target);
      return 'attack';
    } else if (target.kind === 'building' && target.team === team) {
      const vills = mine.filter((u) => u.type === 'villager');
      if (target.progress < 1 && vills.length) {
        orderBuild(w, vills, target);
        return 'build';
      }
      if (target.type === 'farm' && vills.length) {
        for (const v of vills) setOrder(v, { type: 'gather', target: target.id, resType: 'farm', phase: 'go', dropId: 0 });
        return 'gather';
      }
      const soldiersHere = mine.filter((u) => u.type !== 'villager');
      if (BUILDINGS[target.type as BuildingType].garrison > 0 && target.progress >= 1 && soldiersHere.length) {
        orderGarrison(w, soldiersHere, target);
        if (vills.length && target.hp < target.maxHp) orderRepair(w, vills, target);
        return 'move';
      }
      if (vills.length && target.progress >= 1 && target.hp < target.maxHp) {
        orderRepair(w, vills, target);
        const rest = mine.filter((u) => u.type !== 'villager');
        if (rest.length) orderMove(w, rest, x, y);
        return 'build';
      }
      // villagers carrying something drop it off here
      if (BUILDINGS[target.type as BuildingType].dropoff && target.progress >= 1) {
        for (const v of vills) {
          if (v.carry > 0) {
            const resType: ResourceType = v.carryKind === 'wood' ? 'tree' : 'berries';
            setOrder(v, { type: 'gather', target: 0, resType, phase: 'drop', dropId: target.id });
          } else orderMove(w, [v], x, y);
        }
        const rest = mine.filter((u) => u.type !== 'villager');
        if (rest.length) orderMove(w, rest, x, y);
        return 'move';
      }
    }
  }
  orderMove(w, mine, x, y);
  return 'move';
}

export const MAX_QUEUE = 20;

/** Shift + right-click: add an order to the end of each unit's queue. */
export function queueOrder(w: World, units: Entity[], x: number, y: number, team: number, canSee: (e: Entity) => boolean): 'move' | 'gather' | 'build' | 'attack' | 'none' {
  const mine = units.filter((u) => u.kind === 'unit' && u.team === team && !u.dead);
  if (mine.length === 0) return 'none';
  const target = entityAt(w, x, y, (e) => canSee(e) && !(e.kind === 'unit' && e.team === team));
  let kind: 'move' | 'gather' | 'build' | 'attack' = 'move';
  for (const u of mine) {
    let o: Order = { type: 'move', x, y, attackMove: false };
    if (target && target.kind === 'resource' && u.type === 'villager') {
      o = { type: 'gather', target: target.id, resType: target.type as ResourceType, phase: 'go', dropId: 0 };
      kind = 'gather';
    } else if (target && target.team !== team && target.team !== NATURE) {
      o = { type: 'attack', target: target.id, after: null };
      kind = 'attack';
    } else if (target && target.kind === 'building' && target.team === team && target.progress < 1 && u.type === 'villager') {
      o = { type: 'build', target: target.id, after: null };
      kind = 'build';
    }
    if (u.order.type === 'idle' && u.pending.length === 0) setOrder(u, o);
    else if (u.pending.length < MAX_QUEUE) u.pending.push(o);
  }
  return kind;
}

/** Where an order points, for drawing queue flags. */
export function orderPoint(w: World, o: Order): Pt | null {
  if (o.type === 'move') return { x: o.x, y: o.y };
  if (o.type === 'idle') return null;
  const e = w.ents.get(o.target);
  return e && !e.dead ? { x: e.x, y: e.y } : null;
}

// ---------- movement ----------

function unstick(w: World, u: Entity): void {
  if (u.inside) return;
  const tx = tileOf(u.x);
  const ty = tileOf(u.y);
  if (!w.isBlocked(tx, ty, u.team)) return;
  const f = nearestFree(w, Math.max(0, Math.min(w.w - 1, tx)), Math.max(0, Math.min(w.h - 1, ty)), 12, u.team);
  if (f) {
    u.x = (f.x + 0.5) * T;
    u.y = (f.y + 0.5) * T;
    u.path = [];
  }
}

function speedPx(u: Entity): number {
  const base = UNITS[u.type as UnitType].speed;
  return (u.speedCap > 0 ? Math.min(base, u.speedCap) : base) * T;
}

/** Moves along the current path. Returns true when the path is used up. */
function followPath(w: World, u: Entity, dt: number): boolean {
  let budget = speedPx(u) * dt;
  while (budget > 0 && u.path.length > 0) {
    const p = u.path[0];
    const dx = p.x - u.x;
    const dy = p.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget + 0.01) {
      u.x = p.x;
      u.y = p.y;
      budget -= d;
      u.path.shift();
    } else {
      const nx = u.x + (dx / d) * budget;
      const ny = u.y + (dy / d) * budget;
      // the way got blocked (a building went up, a gate locked): repath
      if (w.isBlocked(tileOf(nx), tileOf(ny), u.team)) {
        u.path = [];
        u.repathT = 0;
        return true;
      }
      u.x = nx;
      u.y = ny;
      if (Math.abs(dx) > 0.3) u.facing = dx > 0 ? 1 : -1;
      budget = 0;
    }
    u.anim = 'walk';
  }
  return u.path.length === 0;
}

function tileCenters(tiles: Pt[]): Pt[] {
  return tiles.map((t) => ({ x: (t.x + 0.5) * T, y: (t.y + 0.5) * T }));
}

/** Path to a world point. Returns false if unreachable. */
function pathToPoint(w: World, u: Entity, x: number, y: number): boolean {
  let gx = tileOf(x);
  let gy = tileOf(y);
  let exact = true;
  if (w.isBlocked(gx, gy, u.team)) {
    const f = nearestFree(w, Math.max(0, Math.min(w.w - 1, gx)), Math.max(0, Math.min(w.h - 1, gy)), 12, u.team);
    if (!f) return false;
    gx = f.x;
    gy = f.y;
    exact = false;
  }
  const sx = tileOf(u.x);
  const sy = tileOf(u.y);
  const p = findPath(w, sx, sy, (tx, ty) => tx === gx && ty === gy, gx, gy, 12000, u.team);
  if (!p) return false;
  u.path = tileCenters(p);
  if (exact) {
    if (u.path.length) u.path[u.path.length - 1] = { x, y };
    else u.path.push({ x, y });
  }
  return true;
}

/** Path to any free tile next to an entity's footprint. */
function pathToEntity(w: World, u: Entity, e: Entity): boolean {
  const sx = tileOf(u.x);
  const sy = tileOf(u.y);
  let x0: number, y0: number, x1: number, y1: number;
  if (e.kind === 'unit') {
    const ex = tileOf(e.x);
    const ey = tileOf(e.y);
    const p = findPath(w, sx, sy, (tx, ty) => Math.abs(tx - ex) <= 1 && Math.abs(ty - ey) <= 1, ex, ey, 4000, u.team);
    if (!p) return false;
    u.path = tileCenters(p);
    return true;
  }
  x0 = e.tx;
  y0 = e.ty;
  x1 = e.tx + e.size - 1;
  y1 = e.ty + e.size - 1;
  const p = findPath(
    w,
    sx,
    sy,
    (tx, ty) => tx >= x0 - 1 && tx <= x1 + 1 && ty >= y0 - 1 && ty <= y1 + 1 && !(tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) && !w.isBlocked(tx, ty, u.team),
    tileOf(e.x),
    tileOf(e.y),
    12000,
    u.team,
  );
  if (!p) return false;
  u.path = tileCenters(p);
  return true;
}

/** Walk toward an entity. Returns 'there', 'walking' or 'stuck'. */
function approach(w: World, u: Entity, e: Entity, reach: number, dt: number): 'there' | 'walking' | 'stuck' {
  if (distToEntity(u.x, u.y, e) <= reach) {
    u.path = [];
    return 'there';
  }
  u.repathT -= dt;
  const moved = e.kind === 'unit' && Math.hypot(e.x - u.goalX, e.y - u.goalY) > T;
  if (u.path.length === 0 || (moved && u.repathT <= 0)) {
    // close to a unit in the open: walk straight at it
    if (e.kind === 'unit' && Math.hypot(e.x - u.x, e.y - u.y) < 3 * T) {
      u.path = [{ x: e.x, y: e.y }];
    } else if (!pathToEntity(w, u, e)) {
      return 'stuck';
    } else if (u.path.length === 0) {
      // already on a tile next to it: step toward its nearest edge
      const x0 = e.tx * T;
      const y0 = e.ty * T;
      const sz = (e.kind === 'building' ? e.size : 1) * T;
      u.path = [{ x: Math.max(x0, Math.min(x0 + sz, u.x)), y: Math.max(y0, Math.min(y0 + sz, u.y)) }];
    }
    u.goalX = e.x;
    u.goalY = e.y;
    u.repathT = 0.4;
  }
  followPath(w, u, dt);
  if (u.path.length === 0 && distToEntity(u.x, u.y, e) > reach && e.kind !== 'unit') {
    // arrived at the planned tile but still not in reach: try again next tick
    u.repathT = 0;
  }
  return 'walking';
}

// ---------- unit behaviour ----------

function statsOf(w: World, u: Entity): ReturnType<typeof unitStats> {
  return unitStats(u.type as UnitType, (w.teams[u.team]?.age ?? 0) as Age);
}

function reachFor(w: World, u: Entity): number {
  const r = statsOf(w, u).rangeTiles;
  return r > 0 ? r * T : SIM.unitRadius + SIM.meleeReach;
}

function findEnemyNear(w: World, u: Entity, radius: number): Entity | null {
  let best: Entity | null = null;
  let bd = radius;
  for (const o of w.units) {
    if (o.dead || o.inside || o.team === u.team || o.team === NATURE) continue;
    const d = Math.hypot(o.x - u.x, o.y - u.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  if (best) return best;
  bd = radius;
  for (const b of w.buildings) {
    if (b.dead || b.team === u.team) continue;
    const d = distToEntity(u.x, u.y, b);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function nearestEnemyWall(w: World, u: Entity, radius: number): Entity | null {
  let best: Entity | null = null;
  let bd = radius;
  for (const b of w.buildings) {
    if (b.dead || b.team === u.team || !BUILDINGS[b.type as BuildingType].wall) continue;
    const d = distToEntity(u.x, u.y, b);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function damage(w: World, attacker: Entity, target: Entity, amount: number): void {
  target.hp -= amount;
  target.lastHurt = w.time;
  const team = w.teams[target.team];
  if (target.team < 2 && w.time - team.lastAlertAt > 15) {
    team.lastAlertAt = w.time;
    w.emit({ t: 'underAttack', team: target.team, x: target.x, y: target.y });
  }
  if (target.hp <= 0 && !target.dead) {
    kill(w, target);
    if (attacker.team < 2) {
      if (target.kind === 'unit') w.teams[attacker.team].stats.killed++;
      else w.teams[attacker.team].stats.razed++;
    }
  }
  // a hit villager or idle soldier fights back
  if (!target.dead && target.kind === 'unit' && target.order.type === 'idle' && attacker.kind === 'unit') {
    setOrder(target, { type: 'attack', target: attacker.id, after: null });
  }
}

export function kill(w: World, e: Entity): void {
  if (e.dead) return;
  e.dead = true;
  e.hp = 0;
  w.emit({ t: 'death', x: e.x, y: e.y, team: e.team, type: e.type, kind: e.kind });
  if (e.kind === 'unit' && e.team < 2) w.teams[e.team].stats.lost++;
  if (e.kind === 'building') ungarrison(w, e);
  if (e.kind !== 'unit') {
    const size = e.kind === 'building' ? e.size : 1;
    for (let y = e.ty; y < e.ty + size; y++) {
      for (let x = e.tx; x < e.tx + size; x++) {
        const i = y * w.w + x;
        if (w.occ[i] === e.id) {
          w.occ[i] = 0;
          w.blocked[i] = 0;
        }
      }
    }
  }
}

function attackStep(w: World, u: Entity, dt: number): void {
  const o = u.order as Extract<Order, { type: 'attack' }>;
  const tgt = w.get(o.target);
  if (!tgt) {
    // target gone: with queued orders, move on to the next one
    if (u.pending.length) {
      setOrder(u, { type: 'idle' });
      return;
    }
    // otherwise look for another nearby, then go back to what we were doing
    const next = u.type !== 'villager' ? findEnemyNear(w, u, UNITS[u.type as UnitType].sight * T) : null;
    if (next) setOrder(u, { type: 'attack', target: next.id, after: o.after });
    else setOrder(u, o.after ?? { type: 'idle' });
    return;
  }
  const st = statsOf(w, u);
  const reach = reachFor(w, u);
  const r = approach(w, u, tgt, reach, dt);
  if (r === 'stuck') {
    // walled off: attack the nearest enemy wall or gate instead
    const wall = u.type !== 'villager' ? nearestEnemyWall(w, u, 14 * T) : null;
    if (wall && wall.id !== tgt.id) setOrder(u, { type: 'attack', target: wall.id, after: o.after });
    else setOrder(u, o.after ?? { type: 'idle' });
    return;
  }
  if (r === 'there') {
    u.facing = tgt.x >= u.x ? 1 : -1;
    u.anim = 'attack';
    if (u.cooldown <= 0) {
      u.cooldown = st.attackSec;
      u.animT = 0;
      let dmg: number;
      if (tgt.kind === 'unit') {
        // archers in close quarters do less; armor soaks up part of every hit
        const close = st.rangeTiles > 0 && Math.hypot(tgt.x - u.x, tgt.y - u.y) < CLOSE_QUARTERS.tiles * T;
        dmg = hitDamage(u.type as UnitType, w.teams[u.team].age, tgt.type as UnitType, w.teams[tgt.team].age, close);
      } else dmg = st.attack * st.vsBuildings;
      w.emit({ t: 'hit', x: tgt.x, y: tgt.y, team: u.team, ranged: st.rangeTiles > 0, fx: u.x, fy: u.y - 6 });
      damage(w, u, tgt, dmg);
    }
  }
}

function gatherStep(w: World, u: Entity, dt: number): void {
  const o = u.order as Extract<Order, { type: 'gather' }>;
  const cap = ECONOMY.carryCapacity;
  const kind = RESOURCES[o.resType].kind;

  const findReplacement = (fromX: number, fromY: number): Entity | null =>
    o.resType === 'farm'
      ? freeFarm(w, u.team, fromX, fromY, 10 * T)
      : nearestResource(w, fromX, fromY, (r) => r.type === o.resType, 10 * T) ?? nearestResource(w, fromX, fromY, (r) => RESOURCES[r.type as ResourceType].kind === kind, 10 * T);

  if (o.phase === 'drop') {
    let drop = w.get(o.dropId);
    if (!drop || drop.progress < 1) {
      drop = nearestDropoff(w, u.team, u.x, u.y) ?? undefined;
      if (!drop) {
        setOrder(u, { type: 'idle' });
        return;
      }
      o.dropId = drop.id;
      u.path = [];
    }
    const r = approach(w, u, drop, 12, dt);
    if (r === 'stuck') {
      setOrder(u, { type: 'idle' });
      return;
    }
    if (r === 'there') {
      if (u.carry > 0 && u.carryKind) {
        const team = w.teams[u.team];
        const amt = Math.floor(u.carry + 1e-6);
        team[u.carryKind] += amt;
        team.stats.gathered += amt;
      }
      u.carry = 0;
      u.carryKind = null;
      let res = w.get(o.target);
      if (!res && u.pending.length) {
        // this resource is finished: on to the next queued task
        setOrder(u, { type: 'idle' });
        return;
      }
      if (!res) res = findReplacement(u.x, u.y) ?? undefined;
      if (!res) {
        setOrder(u, { type: 'idle' });
        return;
      }
      o.target = res.id;
      o.resType = res.type as ResourceType;
      o.phase = 'go';
      u.path = [];
    }
    return;
  }

  let res = w.get(o.target);
  if (!res && u.pending.length) {
    if (u.carry > 0) {
      o.phase = 'drop';
      o.dropId = 0;
    } else setOrder(u, { type: 'idle' });
    return;
  }
  if (!res) {
    const rep = findReplacement(u.x, u.y);
    if (!rep) {
      if (u.carry > 0) {
        o.phase = 'drop';
        o.dropId = 0;
      } else setOrder(u, { type: 'idle' });
      return;
    }
    o.target = rep.id;
    o.resType = rep.type as ResourceType;
    o.phase = 'go';
    u.path = [];
    res = rep;
  }

  if (o.phase === 'go') {
    const r = approach(w, u, res, 12, dt);
    if (r === 'stuck') {
      // someone else is in the way or it is walled in: try another one
      const rep = nearestResource(w, u.x, u.y, (x) => x.id !== res!.id && RESOURCES[x.type as ResourceType].kind === kind, 10 * T);
      if (rep) {
        o.target = rep.id;
        u.path = [];
      } else setOrder(u, { type: 'idle' });
      return;
    }
    if (r === 'there') o.phase = 'work';
    return;
  }

  // work
  if (distToEntity(u.x, u.y, res) > 14) {
    o.phase = 'go';
    return;
  }
  if (u.carryKind !== kind) {
    u.carry = 0;
    u.carryKind = kind;
  }
  u.anim = 'work';
  u.facing = res.x >= u.x ? 1 : -1;
  const rate = RESOURCES[o.resType].gatherPerSec * dt;
  const take = Math.min(rate, res.amount, cap - u.carry);
  u.carry += take;
  res.amount -= take;
  if (res.amount <= 1e-6) {
    if (res.type === 'farm' && canAfford(w, res.team, FARM.reseed)) {
      // a rice paddy replants itself
      pay(w, res.team, FARM.reseed);
      res.amount = res.startAmount;
    } else kill(w, res);
  }
  if (u.carry >= cap - 1e-6 || res.dead) {
    o.phase = 'drop';
    o.dropId = 0;
    u.path = [];
  }
}

function buildStep(w: World, u: Entity, dt: number): void {
  const o = u.order as Extract<Order, { type: 'build' }>;
  const b = w.get(o.target);
  if (!b || b.progress >= 1) {
    finishBuildOrder(w, u, o, b);
    return;
  }
  const r = approach(w, u, b, 12, dt);
  if (r === 'stuck') {
    setOrder(u, o.after ?? { type: 'idle' });
    return;
  }
  if (r === 'there') {
    u.anim = 'work';
    u.facing = b.x >= u.x ? 1 : -1;
    const s = BUILDINGS[b.type as BuildingType];
    const dp = dt / s.buildSec;
    b.progress = Math.min(1, b.progress + dp);
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * dp * 0.9);
    if (b.progress >= 1) {
      applyGate(w, b);
      if (b.type === 'farm') b.amount = b.startAmount = RESOURCES.farm.amount;
      w.emit({ t: 'built', id: b.id, team: b.team, type: b.type, x: b.x, y: b.y });
      finishBuildOrder(w, u, o, b);
    }
  }
}

function finishBuildOrder(w: World, u: Entity, o: Extract<Order, { type: 'build' }>, b: Entity | undefined): void {
  if (u.pending.length) {
    setOrder(u, { type: 'idle' });
    return;
  }
  if (b && b.type === 'farm' && b.progress >= 1) {
    setOrder(u, { type: 'gather', target: b.id, resType: 'farm', phase: 'go', dropId: 0 });
    return;
  }
  // help with another unfinished building close by
  const other = w.buildings.find((x) => !x.dead && x.team === u.team && x.progress < 1 && Math.hypot(x.x - u.x, x.y - u.y) < 5 * T);
  if (other) {
    setOrder(u, { type: 'build', target: other.id, after: o.after });
    return;
  }
  if (o.after) {
    setOrder(u, o.after);
    return;
  }
  if (b && b.type === 'storehouse') {
    const res = nearestResource(w, b.x, b.y, () => true, 6 * T);
    if (res) {
      setOrder(u, { type: 'gather', target: res.id, resType: res.type as ResourceType, phase: 'go', dropId: 0 });
      return;
    }
  }
  setOrder(u, { type: 'idle' });
}

/** Villagers fix damaged buildings from outside, paying a share of the building's price. */
function repairStep(w: World, u: Entity, dt: number): void {
  const o = u.order as Extract<Order, { type: 'repair' }>;
  const b = w.get(o.target);
  if (!b || b.progress < 1 || b.hp >= b.maxHp) {
    setOrder(u, { type: 'idle' });
    return;
  }
  const r = approach(w, u, b, 12, dt);
  if (r === 'stuck') {
    setOrder(u, { type: 'idle' });
    return;
  }
  if (r !== 'there') return;
  const s = BUILDINGS[b.type as BuildingType];
  const hp = Math.min(b.maxHp - b.hp, (b.maxHp / Math.max(1, s.buildSec)) * REPAIR.rateShare * dt);
  // cost for this bit of health, collected as whole resources once they add up
  const team = w.teams[u.team];
  for (const k of RES_KINDS) {
    const per = ((s.cost[k] ?? 0) * REPAIR.costShare) / b.maxHp;
    if (per <= 0) continue;
    b.repairDebt[k] = (b.repairDebt[k] ?? 0) + per * hp;
    const whole = Math.floor(b.repairDebt[k]!);
    if (whole > 0) {
      if (team[k] < whole) {
        w.emit({ t: 'cantRepair', team: u.team, kind: k });
        setOrder(u, { type: 'idle' });
        return;
      }
      team[k] -= whole;
      b.repairDebt[k]! -= whole;
    }
  }
  u.anim = 'work';
  u.facing = b.x >= u.x ? 1 : -1;
  b.hp += hp;
}

/** Walk into a tower and stay there. */
function garrisonStep(w: World, u: Entity, dt: number): void {
  const o = u.order as Extract<Order, { type: 'garrison' }>;
  const b = w.get(o.target);
  const cap = b ? BUILDINGS[b.type as BuildingType].garrison : 0;
  if (!b || b.progress < 1 || cap === 0 || b.team !== u.team || garrisoned(w, b).length >= cap) {
    setOrder(u, { type: 'idle' });
    return;
  }
  const r = approach(w, u, b, 12, dt);
  if (r === 'stuck') {
    setOrder(u, { type: 'idle' });
    return;
  }
  if (r === 'there') {
    u.inside = b.id;
    u.x = b.x;
    u.y = b.y;
    u.pending.length = 0;
    setOrder(u, { type: 'idle' });
  }
}

export function garrisoned(w: World, b: Entity): Entity[] {
  return w.units.filter((u) => !u.dead && u.inside === b.id);
}

/** Everyone inside comes out next to the building. */
export function ungarrison(w: World, b: Entity): void {
  for (const u of garrisoned(w, b)) {
    u.inside = 0;
    const p = spawnPoint(w, b);
    u.x = p.x;
    u.y = p.y;
    setOrder(u, { type: 'idle' });
  }
}

export function orderGarrison(w: World, units: Entity[], b: Entity): void {
  for (const u of units) if (u.kind === 'unit' && u.type !== 'villager' && u.team === b.team && !u.dead) setOrder(u, { type: 'garrison', target: b.id });
  void w;
}

export function orderRepair(w: World, units: Entity[], b: Entity): void {
  for (const u of units) if (u.type === 'villager' && u.team === b.team && !u.dead) setOrder(u, { type: 'repair', target: b.id });
  void w;
}

function updateUnit(w: World, u: Entity, dt: number): void {
  if (u.inside) {
    // garrisoned: safe inside, does nothing
    u.anim = 'idle';
    return;
  }
  u.cooldown = Math.max(0, u.cooldown - dt);
  u.animT += dt;
  u.anim = 'idle';
  if (u.order.type === 'idle' && u.pending.length) setOrder(u, u.pending.shift()!);
  const o = u.order;
  const soldier = u.type !== 'villager';
  const sight = UNITS[u.type as UnitType].sight * T;

  // Hostile soldiers go after any enemy in sight, even while marching.
  // Others (scouts, or soldiers told to stand down) only fight back when hit.
  if (soldier && (o.type === 'idle' || o.type === 'move') && (u.hostile || (o.type === 'move' && o.attackMove))) {
    u.scanT -= dt;
    if (u.scanT <= 0) {
      u.scanT = SIM.scanSec;
      const e = findEnemyNear(w, u, sight);
      if (e) {
        setOrder(u, { type: 'attack', target: e.id, after: o.type === 'move' ? o : null });
        return;
      }
    }
  }

  switch (o.type) {
    case 'idle':
      break;
    case 'move': {
      if (u.path.length === 0 && u.goalX < 0) {
        if (!pathToPoint(w, u, o.x, o.y)) {
          const wall = soldier && (u.hostile || o.attackMove) ? nearestEnemyWall(w, u, 14 * T) : null;
          setOrder(u, wall ? { type: 'attack', target: wall.id, after: o } : { type: 'idle' });
          break;
        }
        u.goalX = o.x;
        u.goalY = o.y;
      }
      if (followPath(w, u, dt)) {
        if (Math.hypot(u.x - o.x, u.y - o.y) < 3 || u.repathT < -2) setOrder(u, { type: 'idle' });
        else {
          // blocked on the way: plan again (give up after a while)
          u.repathT -= 1;
          u.goalX = -1;
        }
      }
      break;
    }
    case 'gather':
      gatherStep(w, u, dt);
      break;
    case 'build':
      buildStep(w, u, dt);
      break;
    case 'attack':
      attackStep(w, u, dt);
      break;
    case 'repair':
      repairStep(w, u, dt);
      break;
    case 'garrison':
      garrisonStep(w, u, dt);
      break;
  }
}

function separate(w: World): void {
  const us = w.units;
  const minD = SIM.unitRadius * 1.6;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (a.dead || a.inside) continue;
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j];
      if (b.dead || b.inside) continue;
      // walkers pass through each other; only units standing still are nudged
      if (a.anim !== 'idle' && b.anim !== 'idle') continue;
      const dx = b.x - a.x;
      if (dx > minD || dx < -minD) continue;
      const dy = b.y - a.y;
      if (dy > minD || dy < -minD) continue;
      const d = Math.hypot(dx, dy);
      if (d >= minD) continue;
      const push = (minD - d) * 0.25;
      const nx = d > 0.01 ? dx / d : Math.cos(a.id);
      const ny = d > 0.01 ? dy / d : Math.sin(a.id);
      // units that are working stay put; movers step aside
      const aw = a.anim === 'idle' ? 1 : 0;
      const bw = b.anim === 'idle' ? 1 : 0;
      const tot = aw + bw || 1;
      const ax = a.x - nx * push * 2 * (aw / tot);
      const ay = a.y - ny * push * 2 * (aw / tot);
      const bx = b.x + nx * push * 2 * (bw / tot);
      const by = b.y + ny * push * 2 * (bw / tot);
      if (!w.isBlocked(tileOf(ax), tileOf(ay), a.team)) {
        a.x = ax;
        a.y = ay;
      }
      if (!w.isBlocked(tileOf(bx), tileOf(by), b.team)) {
        b.x = bx;
        b.y = by;
      }
    }
  }
}

// ---------- buildings ----------

function spawnPoint(w: World, b: Entity): Pt {
  const tx0 = b.tx - 1;
  const ty0 = b.ty - 1;
  const tx1 = b.tx + b.size;
  const ty1 = b.ty + b.size;
  // without a rally point, new units step out on the side facing the map center
  const aim = b.rally ?? { x: b.x + Math.sign(w.w * T / 2 - b.x) * 40, y: b.y + Math.sign(w.h * T / 2 - b.y) * 40 };
  let best: Pt | null = null;
  let bd = Infinity;
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      if (x > tx0 && x < tx1 && y > ty0 && y < ty1) continue;
      if (w.isBlocked(x, y, b.team)) continue;
      const cx = (x + 0.5) * T;
      const cy = (y + 0.5) * T;
      const d = Math.hypot(cx - aim.x, cy - aim.y);
      if (d < bd) {
        bd = d;
        best = { x: cx, y: cy };
      }
    }
  }
  if (best) return best;
  const f = nearestFree(w, Math.min(w.w - 1, b.tx), Math.min(w.h - 1, b.ty + b.size), 8, b.team);
  return f ? { x: (f.x + 0.5) * T, y: (f.y + 0.5) * T } : { x: b.x, y: b.y };
}

function updateBuilding(w: World, b: Entity, dt: number): void {
  if (b.progress < 1) return;
  const s = BUILDINGS[b.type as BuildingType];
  if (b.research) {
    b.research.t += dt;
    if (b.research.t >= b.research.sec) finishResearch(w, b);
  }
  // training
  if (b.queue.length > 0 && !b.research) {
    const type = b.queue[0];
    const need = UNITS[type].trainSec;
    if (b.queueT < need) b.queueT = Math.min(need, b.queueT + dt);
    if (b.queueT >= need) {
      const team = w.teams[b.team];
      if (team.popUsed >= team.popCap) {
        if (!b.housed) {
          b.housed = true;
          w.emit({ t: 'housed', team: b.team });
        }
      } else {
        b.housed = false;
        b.queue.shift();
        b.queueT = 0;
        const p = spawnPoint(w, b);
        const u = spawnUnit(w, type, b.team, p.x, p.y);
        team.popUsed++;
        team.stats.trained++;
        w.emit({ t: 'trained', id: u.id, team: b.team, type, x: u.x, y: u.y });
        const rt = b.rallyTarget ? w.get(b.rallyTarget) : undefined;
        if (rt && type === 'villager' && rt.type === 'farm') setOrder(u, { type: 'gather', target: rt.id, resType: 'farm', phase: 'go', dropId: 0 });
        else if (rt && rt.kind === 'resource' && type === 'villager') orderGather(w, [u], rt);
        else if (b.rally) orderMove(w, [u], b.rally.x, b.rally.y);
      }
    }
  }
  // Town Centers and guard towers shoot; each archer inside a tower adds an arrow
  if (s.attack > 0) {
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.cooldown <= 0) {
      let best: Entity | null = null;
      let bd = s.rangeTiles * T;
      for (const u of w.units) {
        if (u.dead || u.inside || u.team === b.team) continue;
        const d = distToEntity(u.x, u.y, b);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      if (best) {
        b.cooldown = s.attackSec;
        const arrows = 1 + (s.garrison > 0 ? garrisoned(w, b).filter((u) => u.type === 'archer').length : 0);
        const armor = unitStats(best.type as UnitType, w.teams[best.team].age).arrowArmor;
        const top = b.y - (s.garrison > 0 ? 30 : 10);
        for (let a = 0; a < arrows && !best.dead; a++) {
          w.emit({ t: 'hit', x: best.x + (a - (arrows - 1) / 2) * 3, y: best.y, team: b.team, ranged: true, fx: b.x, fy: top });
          damage(w, b, best, Math.max(1, s.attack - armor));
        }
      }
    }
  }
}

// ---------- fog of war ----------

export function updateFog(w: World): void {
  for (let team = 0; team < 2; team++) {
    const vis = w.vis[team];
    const exp = w.explored[team];
    vis.fill(0);
    const mark = (cx: number, cy: number, r: number): void => {
      const tx = Math.floor(cx / T);
      const ty = Math.floor(cy / T);
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        const y = ty + dy;
        if (y < 0 || y >= w.h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = tx + dx;
          if (x < 0 || x >= w.w) continue;
          if (dx * dx + dy * dy > r2) continue;
          vis[y * w.w + x] = 1;
          exp[y * w.w + x] = 1;
        }
      }
    };
    for (const u of w.units) if (!u.dead && !u.inside && u.team === team) mark(u.x, u.y, UNITS[u.type as UnitType].sight);
    for (const b of w.buildings) if (!b.dead && b.team === team) mark(b.x, b.y, BUILDINGS[b.type as BuildingType].sight + (b.size > 2 ? 1 : 0));
  }
  // remember enemy buildings the player has seen
  const vis0 = w.vis[0];
  for (const b of w.buildings) {
    if (b.dead || b.team === 0 || b.seen) continue;
    for (let y = b.ty; y < b.ty + b.size && !b.seen; y++) {
      for (let x = b.tx; x < b.tx + b.size; x++) {
        if (vis0[y * w.w + x]) {
          b.seen = true;
          break;
        }
      }
    }
  }
}

export function visibleTo(w: World, team: number, e: Entity): boolean {
  if (e.kind === 'unit' && e.inside) return false;
  if (e.team === team) return true;
  const tx = tileOf(e.x);
  const ty = tileOf(e.y);
  if (!w.inBounds(tx, ty)) return false;
  if (e.kind === 'unit') return w.vis[team][ty * w.w + tx] === 1;
  if (e.kind === 'building' && team === 0) return e.seen;
  return w.explored[team][ty * w.w + tx] === 1;
}

// ---------- the tick ----------

export function step(w: World, dt: number): void {
  if (w.winner !== null) return;
  w.time += dt;
  // alternate the update order every tick so neither side always acts first
  const flip = Math.round(w.time / dt) % 2 === 1;
  const bs = w.buildings;
  for (let k = 0; k < bs.length; k++) {
    const b = bs[flip ? bs.length - 1 - k : k];
    if (!b.dead) updateBuilding(w, b, dt);
  }
  const us = w.units.slice();
  for (let k = 0; k < us.length; k++) {
    const u = us[flip ? us.length - 1 - k : k];
    if (!u.dead) updateUnit(w, u, dt);
  }
  separate(w);
  for (let t = 0; t < 2; t++) w.teams[t].gold += tradeIncome(w, t) * dt;

  // remove the dead
  if (w.units.some((u) => u.dead)) w.units = w.units.filter((u) => !u.dead);
  if (w.buildings.some((b) => b.dead)) w.buildings = w.buildings.filter((b) => !b.dead);
  if (w.resources.some((r) => r.dead)) w.resources = w.resources.filter((r) => !r.dead);
  for (const [id, e] of w.ents) if (e.dead) w.ents.delete(id);

  // population
  for (let t = 0; t < 2; t++) {
    let cap = 0;
    for (const b of w.buildings) if (b.team === t && b.progress >= 1) cap += BUILDINGS[b.type as BuildingType].pop;
    w.teams[t].popCap = Math.min(ECONOMY.maxPop, cap);
    w.teams[t].popUsed = w.units.reduce((n, u) => n + (u.team === t ? 1 : 0), 0);
  }

  w.fogT -= dt;
  if (w.fogT <= 0) {
    w.fogT = 0.2;
    updateFog(w);
  }

  // win and lose: a Town Center destroyed ends the game
  for (let t = 0; t < 2; t++) {
    if (!w.buildings.some((b) => b.team === t && b.type === 'townCenter')) {
      w.winner = 1 - t;
      w.emit({ t: 'gameOver', winner: w.winner });
      break;
    }
  }
}
