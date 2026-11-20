// The title screen's background: a villager running from a rider across a meadow.

import { RENDER } from './config';
import { getTheme, treeSprite, unitSprite } from './render/sprites';

interface Dust {
  x: number;
  y: number;
  t: number;
}
interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class TitleScene {
  private t = 0;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private dust: Dust[] = [];
  private petals: Petal[] = [];

  private scale(): number {
    return Math.max(2, Math.floor(RENDER.height / 120));
  }

  private groundY(): number {
    return Math.round(RENDER.height * 0.74);
  }

  /** Meadow, dirt road and two rows of trees, drawn once per window size and theme. */
  private background(): HTMLCanvasElement {
    const W = RENDER.width;
    const H = RENDER.height;
    const key = `${W}x${H}:${getTheme()}`;
    if (this.bg && this.bgKey === key) return this.bg;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const sakura = getTheme() === 'sakura';
    ctx.fillStyle = '#3e8948';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 2)
      for (let x = 0; x < W; x += 2) {
        const h = hash(x, y);
        if (h < 0.08) ctx.fillStyle = '#4f9a52';
        else if (h < 0.14) ctx.fillStyle = '#336f3b';
        else if (sakura && h < 0.16) ctx.fillStyle = '#f4a7c0';
        else continue;
        ctx.fillRect(x, y, 1, 2);
      }
    // dirt road the chase runs along
    const gy = this.groundY();
    const s = this.scale();
    const roadTop = gy - 8 * s;
    const roadH = 12 * s;
    ctx.fillStyle = '#a27a4c';
    ctx.fillRect(0, roadTop, W, roadH);
    ctx.fillStyle = '#7a5233';
    ctx.fillRect(0, roadTop, W, s);
    ctx.fillRect(0, roadTop + roadH - s, W, s);
    for (let x = 0; x < W; x += 3) {
      const h = hash(x, 7);
      if (h < 0.3) ctx.fillRect(x, roadTop + Math.floor(h * roadH * 3) % roadH, s, Math.max(1, s - 1));
    }
    // trees: a far row near the top third and a near row along the bottom
    const rows: [number, number][] = [
      [Math.round(H * 0.6), s],
      [H + 4 * s, s + 1],
    ];
    for (const [by, sc] of rows) {
      for (let i = 0, x = -10; x < W + 20; i++) {
        const v = getTheme() === 'sakura' ? [0, 2, 1, 3, 2, 0][i % 6] : i % 3;
        const spr = treeSprite(v);
        const w = spr.width * sc;
        ctx.drawImage(spr, x, by - spr.height * sc, w, spr.height * sc);
        x += Math.round(w * (0.55 + hash(i, by) * 0.5));
      }
    }
    // soft vignette so the title reads clearly
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    g.addColorStop(0, 'rgba(13,13,20,0.55)');
    g.addColorStop(1, 'rgba(13,13,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.45);
    this.bg = c;
    this.bgKey = key;
    return c;
  }

  update(dt: number): void {
    this.t += dt;
    const W = RENDER.width;
    const s = this.scale();
    const { cav } = this.positions();
    // dust behind the galloping horse
    if (Math.random() < dt * 14) this.dust.push({ x: cav - 4 * s, y: this.groundY() - s * (1 + Math.random() * 2), t: 0 });
    for (const d of this.dust) d.t += dt;
    this.dust = this.dust.filter((d) => d.t < 0.6);
    if (getTheme() === 'sakura') {
      if (this.petals.length < 40 && Math.random() < dt * 20) this.petals.push({ x: Math.random() * W * 1.2, y: -4, vx: -10 - Math.random() * 14, vy: 14 + Math.random() * 12 });
      for (const p of this.petals) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.x += Math.sin(this.t * 3 + p.y * 0.05) * 0.3;
      }
      this.petals = this.petals.filter((p) => p.y < RENDER.height + 4);
    } else this.petals = [];
  }

  /** The chase loops: the villager runs left to right, the rider gaining but never catching up. */
  private positions(): { vil: number; cav: number; scared: boolean } {
    const W = RENDER.width;
    const s = this.scale();
    const lap = W + 80 * s;
    const speed = 34 * s;
    const vil = ((this.t * speed) % lap) - 30 * s;
    const gap = 30 * s + Math.sin(this.t * 1.7) * 8 * s;
    return { vil, cav: vil - gap, scared: Math.sin(this.t * 2.3) > 0.2 };
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.background(), 0, 0);
    const s = this.scale();
    const gy = this.groundY();
    const { vil, cav, scared } = this.positions();
    const frame = Math.floor(this.t * 9) % 2;
    // dust
    for (const d of this.dust) {
      ctx.globalAlpha = 1 - d.t / 0.6;
      ctx.fillStyle = '#c9a874';
      const r = Math.round(s * (1 + d.t * 3));
      ctx.fillRect(Math.round(d.x - d.t * 20 * s), Math.round(d.y - d.t * 6 * s), r, r);
    }
    ctx.globalAlpha = 1;
    const draw = (img: HTMLCanvasElement, x: number, flip = false): void => {
      const w = img.width * s;
      const h = img.height * s;
      const dx = Math.round(x - w / 2);
      const dy = gy - h + 3 * s;
      if (flip) {
        ctx.save();
        ctx.translate(dx + w, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
      } else ctx.drawImage(img, dx, dy, w, h);
    };
    // the rider (red) chases the villager (blue)
    draw(unitSprite('cavalry', 1, 'walk', frame, '', 0), cav);
    draw(unitSprite('villager', 0, 'walk', frame, 'wood', 0), vil);
    if (scared) {
      // a little "!" over the villager's head
      const x = Math.round(vil - s);
      const y = gy - 22 * s;
      ctx.fillStyle = '#1a1c2c';
      ctx.fillRect(x - s, y - s, 4 * s, 9 * s);
      ctx.fillStyle = '#ffcd75';
      ctx.fillRect(x, y, 2 * s, 5 * s);
      ctx.fillRect(x, y + 6 * s, 2 * s, 2 * s);
    }
    // petals over everything
    ctx.fillStyle = '#ffd6e3';
    for (const p of this.petals) ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, s - 1), Math.max(1, s - 1));
  }
}
