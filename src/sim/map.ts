// Builds a match: a mirrored map with forests, food, and both starting villages.

import { ECONOMY } from '../config';
import { findPath } from './path';
import { ENEMY, PLAYER, T, World, spawnBuilding, spawnResource, spawnUnit, type Entity } from './world';

export const PLAYER_TC = { tx: 4, ty: 4 };

export interface Setup {
  world: World;
  playerTC: Entity;
  enemyTC: Entity;
}

function mirror(w: World, x: number, y: number): [number, number] {
  return [w.w - 1 - x, w.h - 1 - y];
}

export function createMatch(seed: number): Setup {
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

  // the near forests: one east of the village, one south
  for (let y = 0; y <= 11; y++) for (let x = 14; x <= 21; x++) if (rand() < 0.85 - Math.max(0, (x - 18) * 0.15)) setF(x, y);
  for (let y = 14; y <= 21; y++) for (let x = 0; x <= 10; x++) if (rand() < 0.8 - Math.max(0, (y - 18) * 0.15)) setF(x, y);

  // random woods across the map
  for (let i = 0; i < 11; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const cx = 4 + rand() * (N - 8);
      const cy = 4 + rand() * (N - 8);
      if (cx + cy > N - 2) continue; // top-left half only; it is mirrored below
      const dBase = Math.hypot(cx - tcC.x, cy - tcC.y);
      const dEnemy = Math.hypot(cx - enemyC.x, cy - enemyC.y);
      if (dBase < 13 || dEnemy < 13) continue;
      const r = 1.8 + rand() * 2.6;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
          if (Math.hypot(x - cx, y - cy) < r + rand() * 0.9 - 0.3) setF(x, y);
        }
      }
      break;
    }
  }

  // the river: runs corner to corner between the villages, symmetric under the
  // map's 180-degree mirror, with three bridges (center and two flanks)
  const C = N / 2;
  const riverAt = (x: number, y: number): { water: boolean; bridge: boolean; near: boolean } => {
    const rx = x + 0.5 - C;
    const ry = y + 0.5 - C;
    const s = (rx - ry) / Math.SQRT2; // along the river
    const d = (rx + ry) / Math.SQRT2; // across it
    const off = d - 3.2 * Math.sin(s / 6.5);
    const crossing = Math.abs(s) < 1.6 || Math.abs(Math.abs(s) - 17) < 1.6;
    const inRiver = Math.abs(off) < 1.45;
    return { water: inRiver && !crossing, bridge: inRiver && crossing, near: Math.abs(off) < 3.5 && (Math.abs(s) < 3.5 || Math.abs(Math.abs(s) - 17) < 3.5) };
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
      if (r.water || r.bridge || r.near) forest[i] = 0;
    }
  }

  // keep the villages clear
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (Math.hypot(x + 0.5 - tcC.x, y + 0.5 - tcC.y) < 7.5) forest[y * N + x] = 0;
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
    [10, 4],
    [11, 4],
    [10, 5],
    [11, 5],
    [10, 6],
    [11, 6],
  ];
  for (const [x, y] of berryTiles) both((a, b) => spawnResource(w, 'berries', a, b), x, y);
  const sheepTiles = [
    [3, 10],
    [5, 11],
    [7, 10],
    [4, 12],
  ];
  for (const [x, y] of sheepTiles) both((a, b) => spawnResource(w, 'sheep', a, b), x, y);

  // extra berry patches further out
  for (let i = 0; i < 2; i++) {
    for (let tries = 0; tries < 50; tries++) {
      const cx = Math.floor(8 + rand() * (N - 16));
      const cy = Math.floor(8 + rand() * (N - 16));
      if (cx + cy > N - 4) continue;
      if (Math.hypot(cx - tcC.x, cy - tcC.y) < 16) continue;
      let clear = true;
      for (let y = cy - 1; y <= cy + 2 && clear; y++) for (let x = cx - 1; x <= cx + 2; x++) if (forest[y * N + x]) clear = false;
      if (!clear) continue;
      for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) both((a, b) => spawnResource(w, 'berries', a, b), x, y);
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
    spawnUnit(w, 'cavalry', PLAYER, x, y);
    spawnUnit(w, 'cavalry', ENEMY, w.w * T - x, w.h * T - y);
  }
  for (const t of w.teams) t.popUsed = ECONOMY.startingVillagers + ECONOMY.startingScouts;
  w.teams[0].popCap = w.teams[1].popCap = 10;
  return { world: w, playerTC, enemyTC };
}
