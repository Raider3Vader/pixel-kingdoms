// A* pathfinding on the tile grid. 8 directions, no corner cutting.

export interface Pt {
  x: number;
  y: number;
}

export interface Grid {
  w: number;
  h: number;
  blocked: Uint8Array; // 0 = walkable
}

let gScore = new Float32Array(0);
let came = new Int32Array(0);
let stamp = new Uint32Array(0);
let closed = new Uint32Array(0);
let curStamp = 0;

function ensure(n: number): void {
  if (gScore.length < n) {
    gScore = new Float32Array(n);
    came = new Int32Array(n);
    stamp = new Uint32Array(n);
    closed = new Uint32Array(n);
  }
}

class Heap {
  idx: number[] = [];
  f: number[] = [];
  push(i: number, f: number): void {
    const a = this.idx;
    const b = this.f;
    a.push(i);
    b.push(f);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (b[p] <= b[c]) break;
      [a[p], a[c]] = [a[c], a[p]];
      [b[p], b[c]] = [b[c], b[p]];
      c = p;
    }
  }
  pop(): number {
    const a = this.idx;
    const b = this.f;
    const top = a[0];
    const li = a.pop()!;
    const lf = b.pop()!;
    if (a.length > 0) {
      a[0] = li;
      b[0] = lf;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === c) break;
        [a[m], a[c]] = [a[c], a[m]];
        [b[m], b[c]] = [b[c], b[m]];
        c = m;
      }
    }
    return top;
  }
  get size(): number {
    return this.idx.length;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/**
 * Finds a path of tiles from (sx, sy) to any tile where isGoal is true.
 * (hx, hy) is the tile the heuristic aims at. Returns the tiles after the
 * start, ending on the goal tile, or null if no goal can be reached.
 */
export function findPath(
  grid: Grid,
  sx: number,
  sy: number,
  isGoal: (x: number, y: number) => boolean,
  hx: number,
  hy: number,
  maxNodes = 5000,
): Pt[] | null {
  const { w, h, blocked } = grid;
  const n = w * h;
  ensure(n);
  curStamp++;
  if (curStamp === 0xffffffff) {
    stamp.fill(0);
    closed.fill(0);
    curStamp = 1;
  }
  if (isGoal(sx, sy)) return [];
  const start = sy * w + sx;
  const heap = new Heap();
  stamp[start] = curStamp;
  gScore[start] = 0;
  came[start] = -1;
  const heur = (x: number, y: number): number => {
    const dx = Math.abs(x - hx);
    const dy = Math.abs(y - hy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  heap.push(start, heur(sx, sy));
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur] === curStamp) continue;
    closed[cur] = curStamp;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    if (isGoal(cx, cy)) {
      const out: Pt[] = [];
      let c = cur;
      while (c !== start) {
        out.push({ x: c % w, y: (c / w) | 0 });
        c = came[c];
      }
      out.reverse();
      return out;
    }
    if (++expanded > maxNodes) return null;
    const g = gScore[cur];
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (blocked[ni] && !isGoal(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (blocked[cy * w + nx] || blocked[ny * w + cx]) continue;
      }
      if (closed[ni] === curStamp) continue;
      const ng = g + cost;
      if (stamp[ni] !== curStamp || ng < gScore[ni]) {
        stamp[ni] = curStamp;
        gScore[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + heur(nx, ny));
      }
    }
  }
  return null;
}

/** Nearest walkable tile to (x, y), searching outward in rings. */
export function nearestFree(grid: Grid, x: number, y: number, maxR = 12): Pt | null {
  const { w, h, blocked } = grid;
  for (let r = 0; r <= maxR; r++) {
    let best: Pt | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (blocked[ny * w + nx]) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = { x: nx, y: ny };
        }
      }
    }
    if (best) return best;
  }
  return null;
}
