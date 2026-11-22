// Builds a match: a mirrored map with forests, food, and both starting villages.

import { ECONOMY } from '../config';
import { findPath } from './path';
import { ENEMY, PLAYER, T, World, sailable, spawnBuilding, spawnFish, spawnResource, spawnUnit, type Entity } from './world';

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

/** The kinds of map on offer. 'rivers' picks one of the river layouts; 'inlandSea' is islands. */
export type MapKind = 'rivers' | 'inlandSea';
export const MAPS: Record<MapKind, { name: string; hint: string }> = {
  rivers: { name: 'Rivers', hint: 'One big land split by a river, with bridges or fords.' },
  inlandSea: { name: 'Inland Sea', hint: 'Home islands joined to rich islets by shallow sandbars.' },
};

/**
 * The Inland Sea: each side has a large home island in its corner and a
 * private back island (gold and stone) off its coast. Two small islets and a
 * central island sit in the sea between them. Shallow sandbars, walkable like
 * fords, join home to back island, home to each islet, and each islet to the
 * centre: the choke points of this map. Defined for the top-left half and
 * mirrored, so both sides are equal.
 */
const SEA = {
  // [x, y, radius] of the land blobs in the top-left half (each is also mirrored)
  blobs: [
    [14, 14, 24], // home island
    [38, 6, 10], // its northern arm
    [6, 38, 10], // its western arm
    [77, 14, 11], // the back island
    [30, 51, 5], // islet
    [51, 30, 5], // islet
    [47.5, 47.5, 8.5], // the central island (its own mirror)
  ] as [number, number, number][],
  // sandbars: [x0, y0, x1, y1]
  bars: [
    [45, 7, 67, 12], // home to back island
    [11, 44, 27, 49], // home to the west islet
    [44, 11, 49, 27], // home to the north islet
    [34, 50, 41, 48], // west islet to the centre
    [50, 34, 48, 41], // north islet to the centre
  ] as [number, number, number, number][],
};

/** Lays out the Inland Sea's water and sandbars. Returns land (1) per tile. */
function makeSea(w: World, rand: () => number): Uint8Array {
  const N = w.w;
  const land = new Uint8Array(N * N);
  const blobs = SEA.blobs.flatMap(([x, y, r]) => [
    [x, y, r],
    [N - x, N - y, r],
  ]);
  const phase = SEA.blobs.map(() => [rand() * 6.28, rand() * 6.28]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (x + y > N - 1 || (x + y === N - 1 && x >= N / 2)) continue; // the other half is mirrored below
      const px = x + 0.5;
      const py = y + 0.5;
      let on = false;
      for (let b = 0; b < blobs.length && !on; b++) {
        const [bx, by, r] = blobs[b];
        const [p1, p2] = phase[b >> 1];
        const a = Math.atan2(py - by, px - bx);
        const edge = r + Math.sin(a * 3 + p1) * (0.6 + r * 0.06) + Math.cos(a * 5 + p2) * 0.7 + Math.sin(px * 0.9 + py * 0.7) * 0.4;
        if (Math.hypot(px - bx, py - by) < edge) on = true;
      }
      if (on) land[y * N + x] = 1;
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (x + y > N - 1 || (x + y === N - 1 && x >= N / 2)) {
        const [mx, my] = mirror(w, x, y);
        land[y * N + x] = land[my * N + mx];
      }
    }
  }
  for (let i = 0; i < N * N; i++) {
    if (!land[i]) {
      w.water[i] = 1;
      w.blocked[i] = 3;
    }
  }
  // the sandbars: 3 tiles wide, wobbling a little, on both halves
  const bar = (x0: number, y0: number, x1: number, y1: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    for (let k = 0; k <= len * 3; k++) {
      const t = k / (len * 3);
      const wob = Math.sin(t * Math.PI * 2) * 1.2;
      const cx = x0 + (x1 - x0) * t + nx * wob;
      const cy = y0 + (y1 - y0) * t + ny * wob;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const tx = Math.floor(cx + dx);
          const ty = Math.floor(cy + dy);
          if (!w.inBounds(tx, ty) || Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) > 1.6) continue;
          for (const [qx, qy] of [
            [tx, ty],
            mirror(w, tx, ty),
          ]) {
            const i = qy * N + qx;
            if (!w.water[i]) continue;
            w.water[i] = 0;
            w.blocked[i] = 0;
            w.bridge[i] = 2;
          }
        }
      }
    }
  };
  for (const [x0, y0, x1, y1] of SEA.bars) bar(x0, y0, x1, y1);
  return land;
}

export function createMatch(seed: number, opts: { river?: RiverKind; map?: MapKind } = {}): Setup {
  const w = new World(seed);
  const sea = opts.map === 'inlandSea';
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
  if (!sea) {
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
  } // not on the sea map

  const land = sea ? makeSea(w, rand) : null;
  if (sea) w.river = 'sea';

  // and some light, scattered woods; the rest stays open meadow
  for (let i = 0; i < (sea ? 16 : 10); i++) {
    for (let tries = 0; tries < 30; tries++) {
      const cx = 4 + rand() * (N - 8);
      const cy = 4 + rand() * (N - 8);
      if (cx + cy > N - 2) continue; // top-left half only; it is mirrored below
      if (land && (!land[Math.floor(cy) * N + Math.floor(cx)] || Math.hypot(cx - 14, cy - 14) > 26)) continue; // home island only: islets stay open
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
  if (!sea) {
  const kinds = Object.keys(RIVERS) as RiverKind[];
  // twin streams come up about 40% of the time; the other layouts share the rest
  const roll = rand();
  const others = kinds.filter((k) => k !== 'twin');
  const kind: RiverKind = opts.river ?? (roll < 0.4 ? 'twin' : others[Math.floor(((roll - 0.4) / 0.6) * others.length) % others.length]);
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
  } else {
    // pines along the coasts
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (!land![i] || w.bridge[i]) continue;
        let coast = false;
        for (let d = 0; d < 4 && !coast; d++) {
          const qx = x + [1, -1, 0, 0][d] * 2;
          const qy = y + [0, 0, 1, -1][d] * 2;
          if (w.inBounds(qx, qy) && w.water[qy * N + qx]) coast = true;
        }
        if (coast && rand() < 0.2) setF(x, y);
      }
    }
    // keep the sandbar landings clear
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.inBounds(x + dx, y + dy) && w.bridge[(y + dy) * N + x + dx] === 2) forest[y * N + x] = 0;
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
  if (land) {
    // the sea map keeps its sandbar landings clear on both halves (mirroring can carry trees onto them)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.inBounds(x + dx, y + dy) && w.bridge[(y + dy) * N + x + dx] === 2) forest[y * N + x] = 0;
  }

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

  if (sea) {
    // riches on the islands: the back island has gold and stone, each islet gold,
    // the central island gold and persimmons
    const put = (kind: 'berries' | 'gold' | 'stone', x0: number, y0: number, wd: number, ht: number): void => {
      for (let y = y0; y < y0 + ht; y++) for (let x = x0; x < x0 + wd; x++) both((a, b) => spawnResource(w, kind, a, b), x, y);
    };
    put('gold', 78, 11, 2, 2);
    put('stone', 74, 16, 2, 2);
    put('berries', 80, 16, 2, 2);
    put('gold', 29, 51, 2, 2);
    put('gold', 51, 29, 2, 2);
    put('gold', 44, 45, 2, 2);
    put('berries', 46, 50, 3, 1);
  }

  // extra food, gold and stone further out, worth fighting over
  const patches: ('berries' | 'gold' | 'stone')[] = ['berries', 'berries', 'gold', 'gold', 'stone'];
  for (const kind of sea ? [] : patches) {
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

  // on the sea map, cut walking routes through any trees that block the way from
  // home to the enemy and to every island's riches (on both sides, so it stays fair)
  if (sea) {
    const home = { x: PLAYER_TC.tx + 3, y: PLAYER_TC.ty + 3 };
    const goals: [number, number][] = [[ex - 1, ey - 1]];
    for (const r of w.resources) if (r.type !== 'tree' && r.type !== 'sheep' && Math.hypot(r.tx - PLAYER_TC.tx, r.ty - PLAYER_TC.ty) > 20) goals.push([r.tx, r.ty]);
    for (const [gx, gy] of goals) {
      clearRoute(w, home.x, home.y, gx, gy);
      const [mx, my] = mirror(w, gx, gy);
      clearRoute(w, ex - 1, ey - 1, mx, my);
    }
    w.resources = w.resources.filter((r) => !r.dead);
    for (const [id, e] of w.ents) if (e.dead) w.ents.delete(id);
  }

  // fish: small shoals in open water (boats from a Dock catch them), mirrored for fairness
  {
    const open = (x: number, y: number): boolean => {
      const i = y * N + x;
      if (!w.water[i] || w.blocked[i] !== 3) return false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!sailable(w, x + dx, y + dy)) return false;
      return true;
    };
    const nearLand = (x: number, y: number, r: number): boolean => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (w.inBounds(x + dx, y + dy) && !w.water[(y + dy) * N + x + dx] && !w.bridge[(y + dy) * N + x + dx]) return true;
      return false;
    };
    // water within 4 tiles of the home island (the land blob around the home corner)
    const homeCoast = (x: number, y: number): boolean => {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const qx = x + dx;
          const qy = y + dy;
          if (w.inBounds(qx, qy) && !w.water[qy * N + qx] && !w.bridge[qy * N + qx] && Math.hypot(qx - 14, qy - 14) < 30) return true;
        }
      return false;
    };
    const shoals: [number, number][] = [];
    const tryShoal = (near: boolean): boolean => {
      for (let tries = 0; tries < 400; tries++) {
        const x = 2 + Math.floor(rand() * (N - 4));
        const y = 2 + Math.floor(rand() * (N - 4));
        if (x + y > N - 4) continue; // the top-left half; mirrored below
        if (!open(x, y) || !open(x + 1, y) || !nearLand(x, y, 5)) continue;
        const d = Math.hypot(x - PLAYER_TC.tx, y - PLAYER_TC.ty);
        if (near ? d > 40 || !homeCoast(x, y) : d < 30) continue; // near shoals lie off your own island's coast
        if (shoals.some(([a, b]) => Math.hypot(a - x, b - y) < 8)) continue;
        shoals.push([x, y]);
        for (const [fx, fy] of [[x, y], [x + 1, y]]) {
          spawnFish(w, fx, fy);
          const [mx, my] = mirror(w, fx, fy);
          spawnFish(w, mx, my);
        }
        return true;
      }
      return false;
    };
    const nearCount = sea ? 3 : 1;
    const farCount = sea ? 6 : 2;
    for (let k = 0; k < nearCount; k++) tryShoal(true);
    for (let k = 0; k < farCount; k++) tryShoal(false);
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

/**
 * Finds a way from one tile to another treating trees as passable (water and
 * everything else still blocks), then fells the trees on it, two tiles wide.
 */
function clearRoute(w: World, sx: number, sy: number, gx: number, gy: number): void {
  const N = w.w;
  const blocked = new Uint8Array(w.blocked);
  for (const r of w.resources) if (r.type === 'tree' && !r.dead) blocked[r.ty * N + r.tx] = 0;
  const near = (x: number, y: number): boolean => Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1;
  const p = findPath({ w: N, h: w.h, blocked }, sx, sy, near, gx, gy, 40000);
  if (!p) return;
  for (const t of p) {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
    ]) {
      const x = t.x + dx;
      const y = t.y + dy;
      if (!w.inBounds(x, y)) continue;
      const e = w.get(w.occ[y * N + x]);
      if (e && e.kind === 'resource' && e.type === 'tree') {
        e.dead = true;
        w.occ[y * N + x] = 0;
        w.blocked[y * N + x] = 0;
      }
    }
  }
}
