// Draws the world: terrain, buildings, resources, units, effects and fog.

import { BUILDINGS, RENDER, type BuildingType } from '../config';
import { PLAYER, T, World, type Entity, type SimEvent } from '../sim/world';
import {
  PAL,
  TEAM,
  berrySprite,
  buildingPad,
  buildingSprite,
  corpseSprite,
  foundationSprite,
  getTheme,
  sheepSprite,
  treeSprite,
  unitSprite,
  type UnitPose,
} from './sprites';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Ghost {
  type: BuildingType;
  tx: number;
  ty: number;
  ok: boolean;
}

interface Corpse {
  x: number;
  y: number;
  type: string;
  team: number;
  facing: number;
  t: number;
}
interface Arrow {
  fx: number;
  fy: number;
  x: number;
  y: number;
  t: number;
  dur: number;
}
interface Spark {
  x: number;
  y: number;
  t: number;
  kind: 'hit' | 'puff' | 'marker' | 'markerRed';
}

export class Effects {
  corpses: Corpse[] = [];
  arrows: Arrow[] = [];
  sparks: Spark[] = [];

  consume(ev: SimEvent, facingOf: (x: number, y: number) => number): void {
    if (ev.t === 'death' && ev.kind === 'unit') {
      this.corpses.push({ x: ev.x, y: ev.y, type: ev.type, team: ev.team, facing: facingOf(ev.x, ev.y), t: 0 });
      if (this.corpses.length > 120) this.corpses.shift();
    } else if (ev.t === 'death') {
      this.sparks.push({ x: ev.x, y: ev.y, t: 0, kind: 'puff' });
    } else if (ev.t === 'hit') {
      if (ev.ranged) {
        const d = Math.hypot(ev.x - ev.fx, ev.y - ev.fy);
        this.arrows.push({ fx: ev.fx, fy: ev.fy, x: ev.x, y: ev.y - 4, t: 0, dur: Math.max(0.12, d / 260) });
      } else this.sparks.push({ x: ev.x + (Math.random() - 0.5) * 4, y: ev.y - 6, t: 0, kind: 'hit' });
    } else if (ev.t === 'built') {
      this.sparks.push({ x: ev.x, y: ev.y, t: 0, kind: 'puff' });
    }
  }

  marker(x: number, y: number, red: boolean): void {
    this.sparks.push({ x, y, t: 0, kind: red ? 'markerRed' : 'marker' });
  }

  update(dt: number): void {
    for (const c of this.corpses) c.t += dt;
    this.corpses = this.corpses.filter((c) => c.t < 14);
    for (const a of this.arrows) a.t += dt;
    this.arrows = this.arrows.filter((a) => a.t < a.dur);
    for (const s of this.sparks) s.t += dt;
    this.sparks = this.sparks.filter((s) => s.t < (s.kind === 'puff' ? 0.6 : s.kind === 'hit' ? 0.15 : 0.5));
  }
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildTerrain(w: World): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w.w * T;
  c.height = w.h * T;
  const ctx = c.getContext('2d')!;
  const px = (x: number, y: number, ww: number, hh: number, col: string): void => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, ww, hh);
  };
  for (let ty = 0; ty < w.h; ty++) {
    for (let tx = 0; tx < w.w; tx++) {
      const h = hash(tx, ty);
      px(tx * T, ty * T, T, T, h < 0.33 ? PAL.grass : h < 0.66 ? '#428d4a' : '#3a8444');
      for (let i = 0; i < 5; i++) {
        const a = hash(tx * 7 + i, ty * 13 - i);
        const b = hash(tx * 11 - i, ty * 5 + i * 3);
        px(tx * T + Math.floor(a * 15), ty * T + Math.floor(b * 15), 1, 2, a < 0.5 ? PAL.grassLight : PAL.grassDark);
      }
      const f = hash(tx * 3 + 1, ty * 17 + 2);
      if (f < 0.05) {
        const fx = tx * T + 4 + Math.floor(hash(tx, ty + 9) * 8);
        const fy = ty * T + 4 + Math.floor(hash(tx + 9, ty) * 8);
        px(fx, fy, 1, 1, f < 0.025 ? PAL.yellow : PAL.white);
        px(fx + 3, fy + 2, 1, 1, f < 0.025 ? PAL.yellow : PAL.white);
      } else if (f < 0.07) {
        const fx = tx * T + 3 + Math.floor(hash(tx, ty + 4) * 9);
        const fy = ty * T + 5 + Math.floor(hash(tx + 4, ty) * 8);
        px(fx, fy, 3, 2, PAL.stoneDark);
        px(fx, fy, 2, 1, PAL.stone);
      }
    }
  }
  const sakura = getTheme() === 'sakura';
  if (sakura) {
    // fallen cherry petals
    for (let ty = 0; ty < w.h; ty++)
      for (let tx = 0; tx < w.w; tx++)
        for (let i = 0; i < 3; i++) {
          const a = hash(tx * 13 + i, ty * 29 - i * 5);
          if (a < 0.22) px(tx * T + Math.floor(hash(tx + i * 7, ty) * 16), ty * T + Math.floor(hash(tx, ty + i * 11) * 16), 1, 1, a < 0.08 ? '#ffd6e3' : '#f4a7c0');
        }
  }
  // river and bridges
  const isW = (x: number, y: number): boolean => w.inBounds(x, y) && w.water[y * w.w + x] === 1;
  const deep = sakura ? '#2f6f9a' : '#29559c';
  const shallow = sakura ? '#4f97bf' : '#3f78c4';
  const bank = sakura ? '#c9b07a' : '#a2875a';
  for (let ty = 0; ty < w.h; ty++) {
    for (let tx = 0; tx < w.w; tx++) {
      const i = ty * w.w + tx;
      if (w.water[i]) {
        px(tx * T, ty * T, T, T, deep);
        for (let k = 0; k < 4; k++) {
          const a = hash(tx * 3 + k, ty * 5 - k);
          px(tx * T + Math.floor(a * 12), ty * T + Math.floor(hash(tx - k, ty + k * 3) * 15), 3 + Math.floor(a * 3), 1, k % 2 ? shallow : '#8fc4e0');
        }
        // sandy banks where water meets land
        if (!isW(tx, ty - 1)) px(tx * T, ty * T, T, 2, bank);
        if (!isW(tx, ty + 1)) px(tx * T, ty * T + T - 2, T, 2, bank);
        if (!isW(tx - 1, ty)) px(tx * T, ty * T, 2, T, bank);
        if (!isW(tx + 1, ty)) px(tx * T + T - 2, ty * T, 2, T, bank);
      } else if (w.bridge[i]) {
        px(tx * T, ty * T, T, T, deep);
        px(tx * T, ty * T + 1, T, T - 2, PAL.woodLight);
        for (let k = 1; k < T; k += 3) px(tx * T, ty * T + k, T, 1, PAL.wood);
        const rail = sakura ? '#d2452f' : PAL.trunk;
        // rails only along edges that face the water
        if (isW(tx, ty - 1)) px(tx * T, ty * T, T, 2, rail);
        if (isW(tx, ty + 1)) px(tx * T, ty * T + T - 2, T, 2, rail);
        if (isW(tx - 1, ty)) px(tx * T, ty * T, 2, T, rail);
        if (isW(tx + 1, ty)) px(tx * T + T - 2, ty * T, 2, T, rail);
      }
    }
  }
  // trodden earth around each Town Center
  for (const b of w.buildings) {
    if (b.type !== 'townCenter') continue;
    for (let ty = b.ty - 2; ty < b.ty + b.size + 2; ty++) {
      for (let tx = b.tx - 2; tx < b.tx + b.size + 2; tx++) {
        if (!w.inBounds(tx, ty)) continue;
        for (let i = 0; i < 14; i++) {
          const a = hash(tx * 5 + i, ty * 3 + i * 7);
          const bb = hash(tx * 9 + i * 2, ty * 7 - i);
          if (a < 0.6) px(tx * T + Math.floor(a * 26) % 16, ty * T + Math.floor(bb * 16), 2, 1, i % 3 ? PAL.dirt : PAL.dirtDark);
        }
      }
    }
  }
  return c;
}

interface Drawable {
  y: number;
  draw: () => void;
}

export interface DrawOptions {
  selected: Set<number>;
  hoverId: number;
  ghost: Ghost | null;
  rallyFor: Entity | null;
  fog: boolean;
  time: number;
}

export function drawWorld(ctx: CanvasRenderingContext2D, w: World, terrain: HTMLCanvasElement, cam: Camera, fx: Effects, o: DrawOptions): void {
  const z = cam.zoom;
  const vw = RENDER.width / z;
  const vh = RENDER.height / z;
  const cx = Math.round(cam.x * z) / z;
  const cy = Math.round(cam.y * z) / z;
  ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(cx, cy, vw, vh);
  ctx.drawImage(terrain, cx, cy, vw, vh, cx, cy, vw, vh);

  const tx0 = Math.max(0, Math.floor(cx / T) - 1);
  const ty0 = Math.max(0, Math.floor(cy / T) - 1);
  const tx1 = Math.min(w.w - 1, Math.ceil((cx + vw) / T) + 1);
  const ty1 = Math.min(w.h - 2, Math.ceil((cy + vh) / T) + 2);
  const vis = w.vis[PLAYER];
  const exp = w.explored[PLAYER];
  const seenTile = (tx: number, ty: number): boolean => !o.fog || exp[ty * w.w + tx] === 1;
  const visTile = (tx: number, ty: number): boolean => !o.fog || vis[ty * w.w + tx] === 1;
  const items: Drawable[] = [];
  const t = o.time;

  // corpses lie under everything
  for (const c of fx.corpses) {
    const ctx0 = Math.floor(c.x / T);
    const cty = Math.floor(c.y / T);
    if (!w.inBounds(ctx0, cty) || !visTile(ctx0, cty)) continue;
    ctx.globalAlpha = Math.min(1, (14 - c.t) / 4);
    const s = corpseSprite(c.type, c.team);
    drawFlipped(ctx, s, Math.round(c.x) - Math.floor(s.width / 2), Math.round(c.y) - s.height + 3, c.facing < 0);
    ctx.globalAlpha = 1;
  }

  // resources (trees, bushes, sheep) in view
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const id = w.occ[ty * w.w + tx];
      if (!id) continue;
      const e = w.ents.get(id);
      if (!e || e.dead || e.kind !== 'resource' || !seenTile(tx, ty)) continue;
      items.push({
        y: e.y + 6,
        draw: () => {
          const sak = getTheme() === 'sakura';
          if (e.type === 'tree') {
            const v = sak ? treeVariant(e.id) : e.id % 3;
            const s = treeSprite(v);
            ctx.drawImage(s, Math.round(e.x - s.width / 2), (e.ty + 1) * T - s.height + (sak ? 3 : 0));
          } else if (e.type === 'berries') {
            const s = berrySprite(Math.ceil((e.amount / e.startAmount) * 8));
            ctx.drawImage(s, Math.round(e.x - s.width / 2), (e.ty + 1) * T - s.height + (sak ? 3 : 0));
          }
          else {
            const frame = Math.floor(t * 0.7 + e.id) % 3 === 0 ? 1 : 0;
            drawFlipped(ctx, sheepSprite(frame), e.tx * T, e.ty * T, e.id % 2 === 0);
          }
          if (o.selected.has(e.id) || o.hoverId === e.id) bracket(ctx, e.tx * T, e.ty * T, T, T, PAL.yellow);
        },
      });
    }
  }

  // buildings
  for (const b of w.buildings) {
    if (b.dead) continue;
    if (b.tx + b.size < tx0 || b.tx > tx1 || b.ty + b.size < ty0 || b.ty > ty1 + 1) continue;
    if (o.fog && b.team !== PLAYER && !b.seen) continue;
    items.push({
      y: (b.ty + b.size) * T,
      draw: () => {
        const spr = buildingSprite(b.type, b.team);
        const { x, y } = buildingPos(b, spr);
        const sel = o.selected.has(b.id);
        if (sel || o.hoverId === b.id) bracket(ctx, b.tx * T - 1, b.ty * T - 1, b.size * T + 2, b.size * T + 2, b.team === PLAYER ? PAL.white : PAL.orange);
        // tall buildings turn see-through when a unit is behind them
        const tall = spr.height > b.size * T + 12;
        if (tall && b.progress >= 1 && w.units.some((u) => !u.dead && u.x > x && u.x < x + spr.width && u.y > y && u.y < b.ty * T && (!o.fog || u.team === PLAYER || vis[Math.floor(u.y / T) * w.w + Math.floor(u.x / T)] === 1))) ctx.globalAlpha = 0.6;
        if (b.progress < 1) {
          ctx.drawImage(foundationSprite(b.size), b.tx * T, b.ty * T - 8);
          const h = spr.height;
          const shown = Math.floor(h * b.progress);
          if (shown > 0) ctx.drawImage(spr, 0, h - shown, spr.width, shown, x, y + h - shown, spr.width, shown);
          // scaffolding poles in front
          ctx.fillStyle = PAL.wood;
          for (let px = x + 3; px < x + spr.width - 2; px += 9) ctx.fillRect(px, y + h - Math.max(10, shown) - 2, 1, Math.max(10, shown) + 2);
        } else {
          ctx.drawImage(spr, x, y);
          ctx.globalAlpha = 1;
          if (b.hp < b.maxHp * 0.5) flames(ctx, b, t);
        }
      },
    });
  }

  // units
  for (const u of w.units) {
    if (u.dead) continue;
    if (u.x < cx - 16 || u.x > cx + vw + 16 || u.y < cy - 16 || u.y > cy + vh + 24) continue;
    const utx = Math.floor(u.x / T);
    const uty = Math.floor(u.y / T);
    if (o.fog && u.team !== PLAYER && !(w.inBounds(utx, uty) && vis[uty * w.w + utx])) continue;
    items.push({
      y: u.y,
      draw: () => {
        if (o.selected.has(u.id)) ellipse(ctx, u.x, u.y + 1, u.type === 'cavalry' ? 7 : 5, u.team === PLAYER ? PAL.white : PAL.orange);
        else if (o.hoverId === u.id) ellipse(ctx, u.x, u.y + 1, u.type === 'cavalry' ? 7 : 5, PAL.silver);
        const pose = u.anim as UnitPose;
        let frame = 0;
        if (pose === 'walk') frame = Math.floor(u.animT * 7) % 2;
        else if (pose === 'work') frame = Math.floor(u.animT * 3) % 2;
        else if (pose === 'attack') frame = u.cooldown > 0 && u.cooldown > (u.type === 'villager' ? 1.2 : 0.75) ? 1 : 0;
        const carry = u.type === 'villager' && u.carry >= 1 ? (u.carryKind ?? '') : '';
        const spr = unitSprite(u.type, u.team, pose, frame, carry);
        drawFlipped(ctx, spr, Math.round(u.x) - Math.floor(spr.width / 2), Math.round(u.y) - spr.height + 3, u.facing < 0);
      },
    });
  }

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  // health bars for selected or recently hurt things
  for (const e of [...w.units, ...w.buildings]) {
    if (e.dead) continue;
    if (!(o.selected.has(e.id) || t - e.lastHurt < 3 || (e.kind === 'building' && e.progress < 1 && e.team === PLAYER))) continue;
    if (o.fog && e.team !== PLAYER) {
      const etx = Math.floor(e.x / T);
      const ety = Math.floor(e.y / T);
      if (!w.inBounds(etx, ety) || !vis[ety * w.w + etx]) continue;
    }
    if (e.kind === 'unit') hpBar(ctx, e.x - 6, e.y - 16, 12, e.hp / e.maxHp, e.team);
    else {
      const bw = e.size * T - 6;
      const by = e.ty * T - (e.type === 'townCenter' ? 10 : 6);
      hpBar(ctx, e.tx * T + 3, by, bw, e.hp / e.maxHp, e.team);
      if (e.progress < 1) {
        ctx.fillStyle = PAL.ink;
        ctx.fillRect(e.tx * T + 3, by + 3, bw, 2);
        ctx.fillStyle = PAL.yellow;
        ctx.fillRect(e.tx * T + 3, by + 3, Math.round(bw * e.progress), 2);
      }
    }
  }

  // arrows and sparks
  for (const a of fx.arrows) {
    const k = a.t / a.dur;
    const x = a.fx + (a.x - a.fx) * k;
    const y = a.fy + (a.y - a.fy) * k - Math.sin(k * Math.PI) * 6;
    const ang = Math.atan2(a.y - a.fy, a.x - a.fx);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    ctx.fillStyle = PAL.woodLight;
    ctx.fillRect(Math.round(x - Math.cos(ang) * 2), Math.round(y - Math.sin(ang) * 2), 1, 1);
    ctx.fillRect(Math.round(x - Math.cos(ang) * 3), Math.round(y - Math.sin(ang) * 3), 1, 1);
  }
  for (const s of fx.sparks) {
    if (s.kind === 'hit') {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y), 3, 1);
      ctx.fillRect(Math.round(s.x), Math.round(s.y) - 1, 1, 3);
    } else if (s.kind === 'puff') {
      const r = 4 + s.t * 30;
      ctx.globalAlpha = 1 - s.t / 0.6;
      ctx.fillStyle = PAL.silver;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.fillRect(Math.round(s.x + Math.cos(a) * r), Math.round(s.y + Math.sin(a) * r * 0.6), 2, 2);
      }
      ctx.globalAlpha = 1;
    } else {
      const r = Math.max(1, 6 - s.t * 10);
      ellipse(ctx, s.x, s.y, r, s.kind === 'markerRed' ? PAL.orange : PAL.lime);
    }
  }

  // rally point of the selected building
  if (o.rallyFor && o.rallyFor.rally) {
    const r = o.rallyFor.rally;
    ctx.fillStyle = PAL.trunk;
    ctx.fillRect(Math.round(r.x), Math.round(r.y) - 9, 1, 10);
    ctx.fillStyle = TEAM[PLAYER].light;
    ctx.fillRect(Math.round(r.x) + 1, Math.round(r.y) - 9, 4, 3);
  }

  // placement ghost
  if (o.ghost) {
    const g = o.ghost;
    const s = BUILDINGS[g.type].size;
    ctx.globalAlpha = 0.6;
    const gs = buildingSprite(g.type, PLAYER);
    ctx.drawImage(gs, g.tx * T + Math.floor((s * T - gs.width) / 2), (g.ty + s) * T - gs.height + buildingPad());
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = g.ok ? PAL.lime : PAL.red;
    ctx.fillRect(g.tx * T, g.ty * T, s * T, s * T);
    ctx.globalAlpha = 1;
  }

  // fog of war
  if (o.fog) {
    for (let ty = ty0; ty <= ty1 + 1 && ty < w.h; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = ty * w.w + tx;
        if (vis[i]) continue;
        ctx.fillStyle = exp[i] ? 'rgba(14,14,24,0.5)' : PAL.ink;
        ctx.fillRect(tx * T, ty * T, T, T);
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Where to draw a building sprite: centered on its footprint, bottom aligned. */
export function buildingPos(b: Entity, spr: HTMLCanvasElement): { x: number; y: number } {
  return { x: b.tx * T + Math.floor((b.size * T - spr.width) / 2), y: (b.ty + b.size) * T - spr.height + buildingPad() };
}

/** Sakura forests: about 35% cherry blossom, 40% pine, 25% bamboo. */
function treeVariant(id: number): number {
  const v = (id * 7919) % 20;
  return v < 7 ? id % 2 : v < 15 ? 2 : 3;
}

function drawFlipped(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, flip: boolean): void {
  if (!flip) {
    ctx.drawImage(img, x, y);
    return;
  }
  ctx.save();
  ctx.translate(x + img.width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
  ctx.fillStyle = c;
  const ry = Math.max(1, Math.round(r * 0.5));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * ry), 1, 1);
  }
}

function bracket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  const l = 4;
  ctx.fillRect(x, y, l, 1);
  ctx.fillRect(x, y, 1, l);
  ctx.fillRect(x + w - l, y, l, 1);
  ctx.fillRect(x + w - 1, y, 1, l);
  ctx.fillRect(x, y + h - 1, l, 1);
  ctx.fillRect(x, y + h - l, 1, l);
  ctx.fillRect(x + w - l, y + h - 1, l, 1);
  ctx.fillRect(x + w - 1, y + h - l, 1, l);
}

function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, team: number): void {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(x - 1, y - 1, w + 2, 4);
  ctx.fillStyle = PAL.maroon;
  ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = team === PLAYER ? PAL.lime : PAL.orange;
  ctx.fillRect(x, y, Math.max(0, Math.round(w * frac)), 2);
}

function flames(ctx: CanvasRenderingContext2D, b: Entity, t: number): void {
  const f = Math.floor(t * 8 + b.id) % 2;
  const spots = b.type === 'townCenter' ? [[14, 12], [32, 16]] : [[10, 8], [22, 12]];
  for (const [sx, sy] of spots) {
    const x = b.tx * T + sx;
    const y = b.ty * T + sy - 8;
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(x, y + 1 - f, 3, 3 + f);
    ctx.fillStyle = PAL.yellow;
    ctx.fillRect(x + 1, y + 2, 1, 2);
    ctx.fillStyle = 'rgba(86,108,134,0.6)';
    ctx.fillRect(x + f, y - 4 - f * 2, 2, 2);
  }
}

/** One pixel per tile overview. */
export function drawMinimap(ctx: CanvasRenderingContext2D, w: World, cam: Camera, fog: boolean): void {
  const img = ctx.createImageData(w.w, w.h);
  const d = img.data;
  const set = (i: number, hex: string): void => {
    const n = parseInt(hex.slice(1), 16);
    d[i * 4] = (n >> 16) & 255;
    d[i * 4 + 1] = (n >> 8) & 255;
    d[i * 4 + 2] = n & 255;
    d[i * 4 + 3] = 255;
  };
  for (let i = 0; i < w.w * w.h; i++) set(i, '#3e8948');
  for (let i = 0; i < w.w * w.h; i++) if (w.water[i]) set(i, '#3f78c4');
  else if (w.bridge[i]) set(i, '#c08a52');
  for (const r of w.resources) set(r.ty * w.w + r.tx, r.type === 'tree' ? '#1f5536' : r.type === 'berries' ? '#d63a4a' : '#ecebe4');
  for (const b of w.buildings) {
    if (fog && b.team !== PLAYER && !b.seen) continue;
    const c = TEAM[b.team].light;
    for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) set(y * w.w + x, c);
  }
  for (const u of w.units) {
    const tx = Math.floor(u.x / T);
    const ty = Math.floor(u.y / T);
    if (!w.inBounds(tx, ty)) continue;
    if (fog && u.team !== PLAYER && !w.vis[PLAYER][ty * w.w + tx]) continue;
    set(ty * w.w + tx, u.team === PLAYER ? '#73eff7' : '#ffcd75');
  }
  if (fog) {
    const vis = w.vis[PLAYER];
    const exp = w.explored[PLAYER];
    for (let i = 0; i < w.w * w.h; i++) {
      if (!exp[i]) {
        d[i * 4] = 26;
        d[i * 4 + 1] = 28;
        d[i * 4 + 2] = 44;
      } else if (!vis[i]) {
        d[i * 4] = Math.round(d[i * 4] * 0.55);
        d[i * 4 + 1] = Math.round(d[i * 4 + 1] * 0.55);
        d[i * 4 + 2] = Math.round(d[i * 4 + 2] * 0.55);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = '#f4f4f4';
  ctx.lineWidth = 1;
  const vw = RENDER.width / cam.zoom / T;
  const vh = (RENDER.height - RENDER.hudBottom - RENDER.hudTop) / cam.zoom / T;
  ctx.strokeRect(Math.round(cam.x / T) + 0.5, Math.round((cam.y + RENDER.hudTop / cam.zoom) / T) + 0.5, Math.round(vw), Math.round(vh));
}
