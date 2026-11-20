// Formations: where each unit stands when a group moves together.
// Melee units take the front (or the outside of a box); archers and scouts
// stand behind (or inside).

import type { UnitType } from '../config';
import type { Pt } from './path';

export type Formation = 'line' | 'block' | 'box';

export const FORMATION_SPACING = 12; // px between neighbours

interface Slot {
  side: number; // px along the front, left to right
  fwd: number; // px toward the facing direction
  outer: boolean; // box only: on the edge
}

const ranged = (t: string): boolean => t === 'archer' || t === 'scout';

function slots(kind: Formation, n: number, melee: number): Slot[] {
  const S = FORMATION_SPACING;
  const out: Slot[] = [];
  if (kind === 'line') {
    const perRow = 16;
    const rows = Math.ceil(n / perRow);
    for (let r = 0; r < rows; r++) {
      const cnt = Math.min(perRow, n - r * perRow);
      for (let i = 0; i < cnt; i++) out.push({ side: (i - (cnt - 1) / 2) * S, fwd: -r * S, outer: true });
    }
  } else if (kind === 'block') {
    const cols = Math.min(n, Math.max(2, Math.ceil(Math.sqrt(n * 2.5))));
    const rows = Math.ceil(n / cols);
    for (let r = 0; r < rows; r++) {
      const cnt = Math.min(cols, n - r * cols);
      for (let c = 0; c < cnt; c++) out.push({ side: (c - (cnt - 1) / 2) * S, fwd: ((rows - 1) / 2 - r) * S, outer: true });
    }
  } else {
    // smallest square whose edge holds the melee units and whose middle holds the rest
    let k = 2;
    const inner = n - melee;
    while (4 * k - 4 < Math.max(melee, 1) || 4 * k - 4 + (k - 2) * (k - 2) < n || (melee > 0 && (k - 2) * (k - 2) < inner - Math.max(0, 4 * k - 4 - melee))) k++;
    for (let r = 0; r < k; r++)
      for (let c = 0; c < k; c++) {
        const edge = r === 0 || c === 0 || r === k - 1 || c === k - 1;
        out.push({ side: (c - (k - 1) / 2) * S, fwd: ((k - 1) / 2 - r) * S, outer: edge });
      }
  }
  // fill order: edge/front first
  out.sort((a, b) => Number(b.outer) - Number(a.outer) || b.fwd - a.fwd || a.side - b.side);
  return out.slice(0, kind === 'box' ? out.length : n);
}

/** Snap a direction to the nearest of 8 compass directions. */
function snap8(dx: number, dy: number): Pt {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: 0, y: 1 };
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: Math.cos(a), y: Math.sin(a) };
}

/**
 * Target points for each unit. (cx, cy) is the formation's center and
 * (dx, dy) the way it faces. Returns positions in the same order as `units`.
 */
export function formationTargets(units: { x: number; y: number; type: string }[], kind: Formation, cx: number, cy: number, dx: number, dy: number): Pt[] {
  const n = units.length;
  const d = snap8(dx, dy);
  const p = { x: -d.y, y: d.x };
  const meleeIdx = units.map((_, i) => i).filter((i) => !ranged(units[i].type as UnitType));
  const rangedIdx = units.map((_, i) => i).filter((i) => ranged(units[i].type as UnitType));
  const all = slots(kind, n, meleeIdx.length);
  const world = all.map((s) => ({ x: cx + p.x * s.side + d.x * s.fwd, y: cy + p.y * s.side + d.y * s.fwd, outer: s.outer }));
  const result: Pt[] = new Array(n);
  const used = new Set<number>();
  // melee first into the front/edge slots, then ranged into what is left;
  // each unit takes the nearest free slot, which avoids units crossing paths
  const place = (idxs: number[], preferOuter: boolean): void => {
    const pool = [...idxs];
    while (pool.length) {
      let best = -1;
      let bestU = -1;
      let bd = Infinity;
      // the next slot in fill order that suits this group
      const order = world.map((_, i) => i).filter((i) => !used.has(i));
      const candidates = preferOuter ? order : [...order.filter((i) => !world[i].outer), ...order.filter((i) => world[i].outer)];
      const s = candidates[0];
      if (s === undefined) break;
      for (const ui of pool) {
        const dd = Math.hypot(units[ui].x - world[s].x, units[ui].y - world[s].y);
        if (dd < bd) {
          bd = dd;
          bestU = ui;
          best = s;
        }
      }
      used.add(best);
      result[bestU] = { x: world[best].x, y: world[best].y };
      pool.splice(pool.indexOf(bestU), 1);
    }
  };
  place(meleeIdx, true);
  place(rangedIdx, kind !== 'box' || meleeIdx.length === 0);
  for (let i = 0; i < n; i++) if (!result[i]) result[i] = { x: cx, y: cy };
  return result;
}
