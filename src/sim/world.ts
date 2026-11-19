// Game state and rules. No drawing code lives here, so it can run in tests.

import {
  BUILDINGS,
  ECONOMY,
  MAP,
  RESOURCES,
  SIM,
  UNITS,
  type BuildingType,
  type ResKind,
  type ResourceType,
  type UnitType,
} from '../config';
import { findPath, nearestFree, type Pt } from './path';

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
  | { type: 'attack'; target: number; after: Order | null };

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
  | { t: 'gameOver'; winner: number };

export class World {
  readonly w = MAP.widthTiles;
  readonly h = MAP.heightTiles;
  blocked: Uint8Array; // 0 free, 1 resource, 2 building
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
    this.occ = new Int32Array(n);
    this.vis = [new Uint8Array(n), new Uint8Array(n)];
    this.explored = [new Uint8Array(n), new Uint8Array(n)];
    this.rngState = seed >>> 0 || 1;
    for (let i = 0; i < 2; i++) {
      this.teams.push({
        food: ECONOMY.startingFood,
        wood: ECONOMY.startingWood,
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

  isBlocked(tx: number, ty: number): boolean {
    return !this.inBounds(tx, ty) || this.blocked[ty * this.w + tx] !== 0;
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
    seen: false,
    housed: false,
    amount: 0,
    startAmount: 0,
  };
}

export function spawnUnit(w: World, type: UnitType, team: number, x: number, y: number): Entity {
  const e = blank(w, 'unit', type, team, x, y, UNITS[type].hp);
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
      w.blocked[i] = 2;
      w.occ[i] = e.id;
    }
  }
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
    if (u.dead || !filter(u)) continue;
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

export function canAfford(w: World, team: number, food: number, wood: number): boolean {
  const t = w.teams[team];
  return t.food >= food && t.wood >= wood;
}

export type PlaceResult = 'ok' | 'blocked' | 'unexplored' | 'wood';

export function canPlace(w: World, team: number, type: BuildingType, tx: number, ty: number, requireExplored = true): PlaceResult {
  const s = BUILDINGS[type];
  for (let y = ty; y < ty + s.size; y++) {
    for (let x = tx; x < tx + s.size; x++) {
      if (x < 1 || y < 1 || x >= w.w - 1 || y >= w.h - 1) return 'blocked';
      if (w.blocked[y * w.w + x]) return 'blocked';
      if (requireExplored && team < 2 && !w.explored[team][y * w.w + x]) return 'unexplored';
    }
  }
  if (w.teams[team].wood < s.wood) return 'wood';
  return 'ok';
}

// ---------- commands (used by the player's input and by the enemy AI) ----------

export function placeBuilding(w: World, team: number, type: BuildingType, tx: number, ty: number, builders: Entity[], requireExplored = true): PlaceResult {
  const r = canPlace(w, team, type, tx, ty, requireExplored);
  if (r !== 'ok') return r;
  w.teams[team].wood -= BUILDINGS[type].wood;
  const b = spawnBuilding(w, type, team, tx, ty, false);
  w.emit({ t: 'placed', team, x: b.x, y: b.y });
  for (const u of builders) {
    if (u.type !== 'villager' || u.team !== team) continue;
    const prev = u.order.type === 'gather' ? u.order : null;
    setOrder(u, { type: 'build', target: b.id, after: prev ? { ...prev, phase: 'go' } : null });
  }
  return 'ok';
}

export type TrainResult = 'ok' | 'food' | 'wood' | 'queue' | 'cannot';

export function train(w: World, building: Entity, type: UnitType): TrainResult {
  const s = BUILDINGS[building.type as BuildingType];
  if (building.dead || building.progress < 1 || !s.trains.includes(type)) return 'cannot';
  if (building.queue.length >= ECONOMY.maxQueue) return 'queue';
  const u = UNITS[type];
  const t = w.teams[building.team];
  if (t.food < u.food) return 'food';
  if (t.wood < u.wood) return 'wood';
  t.food -= u.food;
  t.wood -= u.wood;
  building.queue.push(type);
  return 'ok';
}

export function cancelTrain(w: World, building: Entity, index: number): void {
  const type = building.queue[index];
  if (!type) return;
  building.queue.splice(index, 1);
  if (index === 0) building.queueT = 0;
  const t = w.teams[building.team];
  t.food += UNITS[type].food;
  t.wood += UNITS[type].wood;
}

export function setOrder(u: Entity, o: Order): void {
  u.order = o;
  u.path = [];
  u.repathT = 0;
  u.goalX = -1;
}

export function orderMove(w: World, units: Entity[], x: number, y: number, attackMove = false): void {
  const list = units.filter((u) => u.kind === 'unit' && !u.dead);
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

// ---------- movement ----------

function unstick(w: World, u: Entity): void {
  const tx = tileOf(u.x);
  const ty = tileOf(u.y);
  if (!w.isBlocked(tx, ty)) return;
  const f = nearestFree(w, Math.max(0, Math.min(w.w - 1, tx)), Math.max(0, Math.min(w.h - 1, ty)));
  if (f) {
    u.x = (f.x + 0.5) * T;
    u.y = (f.y + 0.5) * T;
    u.path = [];
  }
}

function speedPx(u: Entity): number {
  return UNITS[u.type as UnitType].speed * T;
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
      // the way got blocked (a building went up): repath
      if (w.isBlocked(tileOf(nx), tileOf(ny))) {
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
  if (w.isBlocked(gx, gy)) {
    const f = nearestFree(w, Math.max(0, Math.min(w.w - 1, gx)), Math.max(0, Math.min(w.h - 1, gy)));
    if (!f) return false;
    gx = f.x;
    gy = f.y;
    exact = false;
  }
  const sx = tileOf(u.x);
  const sy = tileOf(u.y);
  const p = findPath(w, sx, sy, (tx, ty) => tx === gx && ty === gy, gx, gy);
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
    const p = findPath(w, sx, sy, (tx, ty) => Math.abs(tx - ex) <= 1 && Math.abs(ty - ey) <= 1, ex, ey, 2500);
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
    (tx, ty) => tx >= x0 - 1 && tx <= x1 + 1 && ty >= y0 - 1 && ty <= y1 + 1 && !(tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) && !w.isBlocked(tx, ty),
    tileOf(e.x),
    tileOf(e.y),
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

function reachFor(u: Entity): number {
  const r = UNITS[u.type as UnitType].rangeTiles;
  return r > 0 ? r * T : SIM.unitRadius + SIM.meleeReach;
}

function findEnemyNear(w: World, u: Entity, radius: number): Entity | null {
  let best: Entity | null = null;
  let bd = radius;
  for (const o of w.units) {
    if (o.dead || o.team === u.team || o.team === NATURE) continue;
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
    // target gone: look for another nearby, then go back to what we were doing
    const next = u.type !== 'villager' ? findEnemyNear(w, u, UNITS[u.type as UnitType].sight * T) : null;
    if (next) setOrder(u, { type: 'attack', target: next.id, after: o.after });
    else setOrder(u, o.after ?? { type: 'idle' });
    return;
  }
  const st = UNITS[u.type as UnitType];
  const reach = reachFor(u);
  const r = approach(w, u, tgt, reach, dt);
  if (r === 'stuck') {
    setOrder(u, o.after ?? { type: 'idle' });
    return;
  }
  if (r === 'there') {
    u.facing = tgt.x >= u.x ? 1 : -1;
    u.anim = 'attack';
    if (u.cooldown <= 0) {
      u.cooldown = st.attackSec;
      u.animT = 0;
      let dmg = st.attack + (tgt.kind === 'unit' ? st.bonus[tgt.type as UnitType] ?? 0 : 0);
      if (tgt.kind === 'building') dmg *= st.vsBuildings;
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
    nearestResource(w, fromX, fromY, (r) => r.type === o.resType, 10 * T) ?? nearestResource(w, fromX, fromY, (r) => RESOURCES[r.type as ResourceType].kind === kind, 10 * T);

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
  if (res.amount <= 1e-6) kill(w, res);
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
      w.emit({ t: 'built', id: b.id, team: b.team, type: b.type, x: b.x, y: b.y });
      finishBuildOrder(w, u, o, b);
    }
  }
}

function finishBuildOrder(w: World, u: Entity, o: Extract<Order, { type: 'build' }>, b: Entity | undefined): void {
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

function updateUnit(w: World, u: Entity, dt: number): void {
  u.cooldown = Math.max(0, u.cooldown - dt);
  u.animT += dt;
  u.anim = 'idle';
  const o = u.order;
  const soldier = u.type !== 'villager';
  const sight = UNITS[u.type as UnitType].sight * T;

  if (soldier && (o.type === 'idle' || (o.type === 'move' && o.attackMove))) {
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
          setOrder(u, { type: 'idle' });
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
  }
}

function separate(w: World): void {
  const us = w.units;
  const minD = SIM.unitRadius * 1.6;
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    if (a.dead) continue;
    for (let j = i + 1; j < us.length; j++) {
      const b = us[j];
      if (b.dead) continue;
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
      if (!w.isBlocked(tileOf(ax), tileOf(ay))) {
        a.x = ax;
        a.y = ay;
      }
      if (!w.isBlocked(tileOf(bx), tileOf(by))) {
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
      if (w.isBlocked(x, y)) continue;
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
  const f = nearestFree(w, b.tx, b.ty + b.size, 8);
  return f ? { x: (f.x + 0.5) * T, y: (f.y + 0.5) * T } : { x: b.x, y: b.y };
}

function updateBuilding(w: World, b: Entity, dt: number): void {
  if (b.progress < 1) return;
  const s = BUILDINGS[b.type as BuildingType];
  // training
  if (b.queue.length > 0) {
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
        if (rt && rt.kind === 'resource' && type === 'villager') orderGather(w, [u], rt);
        else if (b.rally) orderMove(w, [u], b.rally.x, b.rally.y);
      }
    }
  }
  // Town Center shoots at enemies in range
  if (s.attack > 0) {
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.cooldown <= 0) {
      let best: Entity | null = null;
      let bd = s.rangeTiles * T;
      for (const u of w.units) {
        if (u.dead || u.team === b.team) continue;
        const d = distToEntity(u.x, u.y, b);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      if (best) {
        b.cooldown = s.attackSec;
        w.emit({ t: 'hit', x: best.x, y: best.y, team: b.team, ranged: true, fx: b.x, fy: b.y - 10 });
        damage(w, b, best, s.attack);
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
    for (const u of w.units) if (!u.dead && u.team === team) mark(u.x, u.y, UNITS[u.type as UnitType].sight);
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
