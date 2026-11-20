// Builds a match: a mirrored map with forests, food, and both starting villages.

import { ECONOMY } from '../config';
import { findPath } from './path';
import { ENEMY, PLAYER, T, World, spawnBuilding, spawnResource, spawnUnit, type Entity } from './world';

export const PLAYER_TC = { tx: 6, ty: 6 };

export interface Setup {
  world: World;
  playerTC: Entity;
  enemyTC: Entity;
}

function mirror(w: World, x: number, y: number): [number, number] {
  return [w.w - 1 - x, w.h - 1 - y];
}

export type RiverKind = 'winding' | 'meandering' | 'twin' | 'lake' | 'fords';

interface RiverLayout {
  name: string;
  streams: number[]; // offsets of each stream from the map's middle diagonal (symmetric)
  amp: number; // how far it swings
  freq: number; // how long each swing is
  width: number; // half-width in tiles
  crossings: number[]; // where bridges or fords are, along the river (symmetric)
  crossWidth: number;
  fords: boolean; // crossings are shallow water instead of bridges
  lake: number; // radius of a lake in the middle, 0 = none
}

export const RIVERS: Record<RiverKind, RiverLayout> = {
  winding: { name: 'Winding river', streams: [0], amp: 4.5, freq: 9.5, width: 1.5, crossings: [0, -26, 26], crossWidth: 1.6, fords: false, lake: 0 },
  meandering: { name: 'Meandering river', streams: [0], amp: 7, freq: 10, width: 1.4, crossings: [-14, 14, -32, 32], crossWidth: 1.6, fords: false, lake: 0 },
  twin: { name: 'Twin streams', streams: [-11, 11], amp: 3, freq: 8, width: 1, crossings: [0, -24, 24], crossWidth: 1.6, fords: false, lake: 0 },
  lake: { name: 'Central lake', streams: [0], amp: 3, freq: 10, width: 1.5, crossings: [-19, 19, -35, 35], crossWidth: 1.6, fords: false, lake: 8 },
  fords: { name: 'Wide river with fords', streams: [0], amp: 3, freq: 12, width: 2.6, crossings: [0, -18, 18, -36, 36], crossWidth: 2.2, fords: true, lake: 0 },
};

export function createMatch(seed: number, opts: { river?: RiverKind } = {}): Setup {
  const w = new World(seed);
  const N = w.w;
  const forest = new Uint8Array(N * N);
  const tcC = { x: PLAYER_TC.tx + 1.5, y: PLAYER_TC.ty + 1.5 };
  const enemyC = { x: N - tcC.x, y: N - tcC.y };
  const setF = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    forest[y * N + x] = 1;
  };
  const rand = (): number => w.rng();

  // the near forests: one east of the village, one south (with gaps to walk through)
  for (let y = 0; y <= 15; y++) for (let x = 19; x <= 29; x++) if (rand() < 0.66 - Math.max(0, (x - 25) * 0.12)) setF(x, y);
  for (let y = 19; y <= 29; y++) for (let x = 0; x <= 15; x++) if (rand() < 0.64 - Math.max(0, (y - 25) * 0.12)) setF(x, y);

  // a thick forest belt across each half, between the village and the middle,
  // with two or three narrow gaps: the choke points into each village's land
  const beltAt = 34 + Math.floor(rand() * 6); // tiles along the diagonal from the corner
  const gapCount = 2 + (rand() < 0.5 ? 1 : 0);
  const gaps: number[] = [];
  for (let g = 0; g < gapCount; g++) gaps.push(-26 + (52 / (gapCount - 1)) * g + (rand() - 0.5) * 8);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const along = x - y; // position along the belt
      const wobble = Math.sin(along / 5.5 + beltAt) * 2.2;
      const depth = x + y - beltAt - wobble; // across the belt
      const thick = 4 + Math.sin(along / 3.1) * 0.8;
      if (Math.abs(depth) > thick) continue;
      if (gaps.some((g) => Math.abs(along - g) < 1.6)) continue; // a 3-tile gap
      if (rand() < 0.97 || Math.abs(depth) < thick - 1.5) setF(x, y);
    }
  }

  // a few dense woods with no paths through them
  for (let i = 0; i < 3; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const cx = 6 + rand() * (N - 12);
      const cy = 6 + rand() * (N - 12);
      if (cx + cy > N - 8) continue;
      if (Math.hypot(cx - tcC.x, cy - tcC.y) < 22 || Math.hypot(cx - enemyC.x, cy - enemyC.y) < 22) continue;
      const r = 3.5 + rand() * 2.5;
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) {
        for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
          const a = Math.atan2(y - cy, x - cx);
          const edge = r + Math.sin(a * 3 + i) * 1.2 + Math.cos(a * 5) * 0.6;
          if (Math.hypot(x - cx, y - cy) < edge) setF(x, y);
        }
      }
      break;
    }
  }

  // and some light, scattered woods; the rest stays open meadow
  for (let i = 0; i < 10; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const cx = 4 + rand() * (N - 8);
      const cy = 4 + rand() * (N - 8);
      if (cx + cy > N - 2) continue; // top-left half only; it is mirrored below
      const dBase = Math.hypot(cx - tcC.x, cy - tcC.y);
      const dEnemy = Math.hypot(cx - enemyC.x, cy - enemyC.y);
      if (dBase < 18 || dEnemy < 18) continue;
      const r = 2 + rand() * 2.8;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
          if (Math.hypot(x - cx, y - cy) < r + rand() * 0.9 - 0.3 && rand() < 0.72) setF(x, y);
        }
      }
      break;
    }
  }

  // the river: runs corner to corner between the villages. Each match picks a layout.
  // Every layout is symmetric under the map's 180-degree mirror, so both sides are equal.
  const C = N / 2;
  const kinds = Object.keys(RIVERS) as RiverKind[];
  const kind: RiverKind = opts.river ?? kinds[Math.floor(rand() * kinds.length)];
  const R = RIVERS[kind];
  w.river = kind;
  const riverAt = (x: number, y: number): { water: boolean; bridge: boolean; ford: boolean; near: boolean; off: number; s: number } => {
    const rx = x + 0.5 - C;
    const ry = y + 0.5 - C;
    const s = (rx - ry) / Math.SQRT2; // along the river
    const d = (rx + ry) / Math.SQRT2; // across it
    let off = Infinity; // distance to the nearest stream's middle
    for (const o of R.streams) {
      const v = d - o - R.amp * Math.sin(s / R.freq);
      if (Math.abs(v) < Math.abs(off)) off = v;
    }
    const lake = R.lake > 0 && Math.hypot(rx, ry) < R.lake + Math.sin(Math.atan2(ry, rx) * 2) * 0.9 + Math.cos(Math.atan2(ry, rx) * 4) * 0.5;
    if (lake) off = 0;
    const crossing = !lake && R.crossings.some((c) => Math.abs(s - c) < R.crossWidth);
    const inRiver = Math.abs(off) < R.width || lake;
    const near = !lake && Math.abs(off) < R.width + 2 && R.crossings.some((c) => Math.abs(s - c) < R.crossWidth + 2);
    return { water: inRiver && !crossing, bridge: inRiver && crossing && !R.fords, ford: inRiver && crossing && R.fords, near, off, s };
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = riverAt(x, y);
      const i = y * N + x;
      if (r.water) {
        w.water[i] = 1;
        w.blocked[i] = 3;
      }
      if (r.bridge) w.bridge[i] = 1;
      if (r.ford) w.bridge[i] = 2; // shallow, walkable water
      if (r.water || r.bridge || r.ford || r.near) forest[i] = 0;
    }
  }
  // trees along the river banks, and small groves where it enters and leaves the map
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = riverAt(x, y);
      if (r.water || r.bridge || r.ford || r.near) continue;
      const bank = Math.abs(r.off);
      if (bank < R.width + 0.2) continue;
      if (bank < 4.5 && rand() < 0.16) setF(x, y);
      else if (Math.abs(r.s) > 44 && bank < 8 && rand() < 0.45) setF(x, y);
    }
  }

  // keep the villages clear
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (Math.hypot(x + 0.5 - tcC.x, y + 0.5 - tcC.y) < 10) forest[y * N + x] = 0;
    }
  }

  // mirror the top-left half onto the bottom-right
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (x + y < N - 1) {
        const [mx, my] = mirror(w, x, y);
        forest[my * N + mx] = forest[y * N + x];
      } else if (x + y === N - 1 && x < N / 2) {
        const [mx, my] = mirror(w, x, y);
        forest[my * N + mx] = forest[y * N + x];
      }
    }
  }

  for (let i = 0; i < N * N; i++) if (w.water[i] || w.bridge[i]) forest[i] = 0;

  // villages
  const playerTC = spawnBuilding(w, 'townCenter', PLAYER, PLAYER_TC.tx, PLAYER_TC.ty, true);
  const [ex, ey] = mirror(w, PLAYER_TC.tx + 2, PLAYER_TC.ty + 2);
  const enemyTC = spawnBuilding(w, 'townCenter', ENEMY, ex, ey, true);

  // food near each village (mirrored)
  const both = (fn: (x: number, y: number) => void, x: number, y: number): void => {
    fn(x, y);
    const [mx, my] = mirror(w, x, y);
    fn(mx, my);
  };
  const berryTiles = [
    [12, 6],
    [13, 6],
    [12, 7],
    [13, 7],
    [12, 8],
    [13, 8],
  ];
  for (const [x, y] of berryTiles) both((a, b) => spawnResource(w, 'berries', a, b), x, y);
  const sheepTiles = [
    [5, 12],
    [7, 13],
    [9, 12],
    [6, 14],
  ];
  for (const [x, y] of sheepTiles) both((a, b) => spawnResource(w, 'sheep', a, b), x, y);
  // a gold mine and a stone quarry within walking distance of each village
  const goldTiles = [
    [14, 13],
    [15, 13],
    [14, 14],
    [15, 14],
  ];
  for (const [x, y] of goldTiles) both((a, b) => spawnResource(w, 'gold', a, b), x, y);
  const stoneTiles = [
    [2, 15],
    [3, 15],
    [2, 16],
  ];
  for (const [x, y] of stoneTiles) both((a, b) => spawnResource(w, 'stone', a, b), x, y);

  // extra food, gold and stone further out, worth fighting over
  const patches: ('berries' | 'gold' | 'stone')[] = ['berries', 'berries', 'gold', 'gold', 'stone'];
  for (const kind of patches) {
    for (let tries = 0; tries < 80; tries++) {
      const cx = Math.floor(8 + rand() * (N - 16));
      const cy = Math.floor(8 + rand() * (N - 16));
      if (cx + cy > N - 6) continue;
      if (Math.hypot(cx - tcC.x, cy - tcC.y) < 22) continue;
      let clear = true;
      for (let y = cy - 1; y <= cy + 2 && clear; y++) for (let x = cx - 1; x <= cx + 2; x++) if (forest[y * N + x] || w.blocked[y * N + x]) clear = false;
      if (!clear) continue;
      for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) both((a, b) => spawnResource(w, kind, a, b), x, y);
      break;
    }
  }

  // trees
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (forest[y * N + x]) spawnResource(w, 'tree', x, y);

  // make sure the two villages can reach each other
  const from = { x: PLAYER_TC.tx + 3, y: PLAYER_TC.ty + 3 };
  const to = { x: ex - 1, y: ey - 1 };
  if (!findPath(w, from.x, from.y, (x, y) => x === to.x && y === to.y, to.x, to.y, 8000)) {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const cx = Math.round(from.x + (to.x - from.x) * t);
      const cy = Math.round(from.y + (to.y - from.y) * t);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (!w.inBounds(x, y)) continue;
          const id = w.occ[y * N + x];
          const e = id ? w.get(id) : undefined;
          if (e && e.kind === 'resource' && e.type === 'tree') {
            e.dead = true;
            w.occ[y * N + x] = 0;
            w.blocked[y * N + x] = 0;
          }
        }
      }
    }
    w.resources = w.resources.filter((r) => !r.dead);
    for (const [id, e] of w.ents) if (e.dead) w.ents.delete(id);
  }

  // starting villagers stand east of each Town Center
  for (let i = 0; i < ECONOMY.startingVillagers; i++) {
    const x = (PLAYER_TC.tx + 3.5) * T;
    const y = (PLAYER_TC.ty + 0.5 + i) * T;
    spawnUnit(w, 'villager', PLAYER, x, y);
    const [mx, my] = [w.w * T - x, w.h * T - y];
    spawnUnit(w, 'villager', ENEMY, mx, my);
  }
  // a scout on horseback, south of each Town Center
  for (let i = 0; i < ECONOMY.startingScouts; i++) {
    const x = (PLAYER_TC.tx + 1.5 + i) * T;
    const y = (PLAYER_TC.ty + 3.6) * T;
    spawnUnit(w, 'scout', PLAYER, x, y);
    spawnUnit(w, 'scout', ENEMY, w.w * T - x, w.h * T - y);
  }
  for (const t of w.teams) t.popUsed = ECONOMY.startingVillagers + ECONOMY.startingScouts;
  w.teams[0].popCap = w.teams[1].popCap = 10;
  return { world: w, playerTC, enemyTC };
}
