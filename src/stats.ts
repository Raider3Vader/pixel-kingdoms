// The end-of-match screen: a summary table and graphs of how the match went.

import { AGES } from './config';
import { TEAM } from './render/sprites';
import type { Snapshot, TeamStats } from './sim/world';

export interface MatchResults {
  won: boolean;
  time: number; // seconds
  opening: string;
  stats: [TeamStats, TeamStats]; // player, enemy
  history: Snapshot[];
}

export type GraphKey = 'army' | 'villagers' | 'gathered';

export const GRAPHS: Record<GraphKey, { name: string; hint: string }> = {
  army: { name: 'Army', hint: 'Soldiers alive' },
  villagers: { name: 'Villagers', hint: 'Villagers alive' },
  gathered: { name: 'Resources', hint: 'Total resources gathered' },
};

export function fmtClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** The rows of the summary table: label, player value, enemy value. */
export function summaryRows(r: MatchResults): [string, string, string][] {
  const [a, b] = r.stats;
  const ageAt = (s: TeamStats, i: number): string => (s.agedAt[i] !== undefined ? fmtClock(s.agedAt[i]) : '-');
  const row = (k: string, f: (s: TeamStats) => number | string): [string, string, string] => [k, String(f(a)), String(f(b))];
  return [
    row('Food gathered', (s) => s.byKind.food),
    row('Wood gathered', (s) => s.byKind.wood),
    row('Gold gathered', (s) => s.byKind.gold),
    row('Stone gathered', (s) => s.byKind.stone),
    row('Units trained', (s) => s.trained),
    row('Biggest army', (s) => s.peakArmy),
    row('Enemies killed', (s) => s.killed),
    row('Units lost', (s) => s.lost),
    row('Buildings built', (s) => s.built),
    row('Buildings razed', (s) => s.razed),
    [`${AGES[1].name}`, ageAt(a, 0), ageAt(b, 0)],
    [`${AGES[2].name}`, ageAt(a, 1), ageAt(b, 1)],
  ];
}

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function shortNum(v: number): string {
  return v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v);
}

/**
 * Draw one graph at game-pixel size (the canvas is scaled up by CSS, so it
 * stays crisp and pixelated like the rest of the game).
 */
export function drawGraph(cv: HTMLCanvasElement, r: MatchResults, key: GraphKey): void {
  const W = cv.width;
  const H = cv.height;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(0, 0, W, H);
  const pts = r.history;
  const L = 26;
  const R = W - 6;
  const Tp = 6;
  const B = H - 14;
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textBaseline = 'middle';
  if (pts.length < 2) {
    ctx.fillStyle = '#94b0c2';
    ctx.textAlign = 'center';
    ctx.fillText('Too short to graph', W / 2, H / 2);
    return;
  }
  const end = Math.max(1, r.time);
  let top = 0;
  for (const p of pts) top = Math.max(top, p[key][0], p[key][1]);
  top = niceMax(top);
  const X = (t: number): number => Math.round(L + (t / end) * (R - L));
  const Y = (v: number): number => Math.round(B - (v / top) * (B - Tp));

  // grid and labels
  ctx.textAlign = 'right';
  for (let i = 0; i <= 2; i++) {
    const v = (top / 2) * i;
    const y = Y(v);
    ctx.fillStyle = '#333c57';
    ctx.fillRect(L, y, R - L, 1);
    ctx.fillStyle = '#94b0c2';
    ctx.fillText(shortNum(v), L - 3, y + 1);
  }
  ctx.textAlign = 'center';
  const minutes = end / 60;
  const step = minutes <= 6 ? 1 : minutes <= 15 ? 3 : minutes <= 30 ? 5 : 10;
  for (let m = 0; m * 60 <= end; m += step) {
    const x = X(m * 60);
    ctx.fillStyle = '#5a6988';
    ctx.fillRect(x, B, 1, 2);
    ctx.fillStyle = '#94b0c2';
    if (x > L + 6 || m === 0) ctx.fillText(`${m}m`, Math.max(L + 4, Math.min(R - 6, x)), B + 8);
  }

  // age markers: a small flag on the bottom line where each side reached a new age
  for (let team = 0; team < 2; team++) {
    for (const t of r.stats[team].agedAt) {
      const x = X(t);
      ctx.fillStyle = TEAM[team].light;
      for (let y = Tp; y < B; y += 3) ctx.fillRect(x, y, 1, 1);
    }
  }

  // the two lines (enemy first, so yours is drawn on top)
  for (const team of [1, 0]) {
    ctx.fillStyle = team === 0 ? TEAM[0].light : TEAM[1].light;
    let px = X(pts[0].t);
    let py = Y(pts[0][key][team]);
    for (let i = 1; i < pts.length; i++) {
      const nx = X(pts[i].t);
      const ny = Y(pts[i][key][team]);
      // pixel line: walk the longer axis
      const n = Math.max(Math.abs(nx - px), Math.abs(ny - py), 1);
      for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(px + ((nx - px) * k) / n), Math.round(py + ((ny - py) * k) / n), 2, 2);
      px = nx;
      py = ny;
    }
  }
}
