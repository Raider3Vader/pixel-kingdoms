// Pixel sprites, drawn in code from a shared palette and cached as small canvases.
// Two themes: Classic (drawn here) and Sakura Village (sakura.ts).

import * as Sakura from './sakura';

export type ThemeName = 'classic' | 'sakura';
let theme: ThemeName = 'classic';
export function setTheme(t: ThemeName): void {
  theme = t;
}
export function getTheme(): ThemeName {
  return theme;
}
/** Pixels a building sprite hangs below its footprint. */
export function buildingPad(): number {
  return theme === 'sakura' ? Sakura.BUILDING_PAD : 0;
}

export const PAL = {
  ink: '#1a1c2c',
  plum: '#5d275d',
  red: '#b13e53',
  orange: '#ef7d57',
  yellow: '#ffcd75',
  lime: '#a7f070',
  green: '#38b764',
  teal: '#257179',
  navy: '#29366f',
  blue: '#3b5dc9',
  sky: '#41a6f6',
  cyan: '#73eff7',
  white: '#f4f4f4',
  silver: '#94b0c2',
  gray: '#566c86',
  slate: '#333c57',
  grass: '#3e8948',
  grassLight: '#4f9a52',
  grassDark: '#336f3b',
  leaf: '#2f7a3f',
  leafDark: '#1f5536',
  trunk: '#6b4226',
  wood: '#8f5a33',
  woodLight: '#c08a52',
  skin: '#f1c39b',
  hair: '#4a2e1d',
  stone: '#8b8f99',
  stoneDark: '#5e6370',
  berry: '#d63a4a',
  dirt: '#a27a4c',
  dirtDark: '#7a5233',
  wool: '#ecebe4',
  maroon: '#73172d',
};

export interface TeamColors {
  dark: string;
  mid: string;
  light: string;
}

export const TEAM: TeamColors[] = [
  { dark: PAL.navy, mid: PAL.blue, light: PAL.sky },
  { dark: PAL.maroon, mid: PAL.red, light: PAL.orange },
  { dark: PAL.slate, mid: PAL.gray, light: PAL.silver },
];

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

const cache = new Map<string, HTMLCanvasElement>();

function make(key: string, w: number, h: number, draw: (px: Px) => void): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const px: Px = (x, y, ww, hh, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, ww, hh);
  };
  draw(px);
  cache.set(key, c);
  return c;
}

function disc(px: Px, cx: number, cy: number, r: number, c: string): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) px(x, y, 1, 1, c);
    }
  }
}

const SHADOW = 'rgba(16,18,30,0.35)';

// ---------- units (16 x 16, facing right, feet at y = 14) ----------

export type UnitPose = 'idle' | 'walk' | 'attack' | 'work';

function legs(px: Px, pose: UnitPose, frame: number, c: string): void {
  if (pose === 'walk' && frame === 1) {
    px(5, 11, 2, 3, c);
    px(9, 11, 2, 3, c);
    px(4, 14, 2, 1, PAL.ink);
    px(10, 14, 2, 1, PAL.ink);
  } else if (pose === 'walk') {
    px(7, 11, 2, 3, c);
    px(7, 14, 3, 1, PAL.ink);
  } else {
    px(6, 11, 2, 3, c);
    px(9, 11, 2, 3, c);
    px(6, 14, 2, 1, PAL.ink);
    px(9, 14, 2, 1, PAL.ink);
  }
}

function villager(px: Px, tc: TeamColors, pose: UnitPose, frame: number, carry: string): void {
  px(4, 14, 9, 2, SHADOW);
  if (carry === 'wood') {
    px(2, 6, 3, 6, PAL.wood);
    px(2, 6, 3, 1, PAL.woodLight);
  } else if (carry === 'food') {
    px(2, 8, 3, 4, PAL.woodLight);
    px(2, 7, 3, 1, PAL.berry);
  }
  legs(px, pose, frame, PAL.trunk);
  px(5, 6, 6, 5, tc.mid);
  px(5, 6, 6, 1, tc.light);
  px(5, 10, 6, 1, PAL.trunk);
  px(6, 2, 4, 4, PAL.skin);
  px(6, 1, 4, 2, PAL.hair);
  px(6, 3, 1, 1, PAL.hair);
  px(9, 3, 1, 1, PAL.ink);
  if (pose === 'work') {
    if (frame === 0) {
      px(10, 4, 1, 3, PAL.skin);
      px(11, 1, 1, 5, PAL.wood);
      px(11, 0, 3, 2, PAL.silver);
    } else {
      px(10, 7, 2, 2, PAL.skin);
      px(11, 8, 4, 1, PAL.wood);
      px(14, 7, 2, 3, PAL.silver);
    }
  } else if (pose === 'attack') {
    px(10, 6, 2, 2, PAL.skin);
    px(12, frame ? 7 : 4, 1, 4, PAL.wood);
  } else {
    px(10, 7, 1, 3, PAL.skin);
  }
}

function swordsman(px: Px, tc: TeamColors, pose: UnitPose, frame: number): void {
  px(4, 14, 9, 2, SHADOW);
  legs(px, pose, frame, PAL.slate);
  px(5, 6, 6, 5, tc.mid);
  px(6, 6, 4, 3, PAL.silver);
  px(5, 10, 6, 1, PAL.trunk);
  px(6, 3, 4, 3, PAL.skin);
  px(9, 4, 1, 1, PAL.ink);
  px(6, 1, 4, 2, PAL.silver);
  px(5, 3, 1, 2, PAL.gray);
  px(6, 1, 4, 1, PAL.white);
  // shield
  px(2, 6, 4, 5, tc.dark);
  px(2, 6, 4, 1, tc.light);
  px(3, 8, 2, 1, PAL.yellow);
  if (pose === 'attack' && frame === 1) {
    px(10, 7, 2, 2, PAL.skin);
    px(12, 7, 4, 1, PAL.white);
    px(11, 6, 1, 3, PAL.yellow);
  } else {
    px(10, 8, 2, 2, PAL.skin);
    px(11, 2, 1, 6, PAL.white);
    px(10, 7, 3, 1, PAL.yellow);
  }
}

function archer(px: Px, tc: TeamColors, pose: UnitPose, frame: number): void {
  px(4, 14, 9, 2, SHADOW);
  legs(px, pose, frame, PAL.trunk);
  px(3, 5, 2, 6, PAL.trunk);
  px(3, 4, 1, 1, PAL.white);
  px(4, 3, 1, 2, PAL.white);
  px(5, 6, 6, 5, tc.mid);
  px(5, 10, 6, 1, PAL.trunk);
  px(7, 3, 3, 3, PAL.skin);
  px(9, 4, 1, 1, PAL.ink);
  px(6, 1, 4, 2, tc.dark);
  px(5, 2, 2, 4, tc.dark);
  px(10, 7, 2, 1, PAL.skin);
  if (pose === 'attack' && frame === 1) {
    px(13, 3, 1, 9, PAL.wood);
    px(12, 2, 1, 1, PAL.wood);
    px(12, 12, 1, 1, PAL.wood);
    px(9, 7, 1, 1, PAL.silver);
    px(10, 5, 1, 2, PAL.silver);
    px(10, 8, 1, 2, PAL.silver);
    px(11, 4, 1, 1, PAL.silver);
    px(11, 10, 1, 1, PAL.silver);
    px(9, 7, 6, 1, PAL.white);
  } else {
    px(13, 4, 1, 7, PAL.wood);
    px(12, 3, 1, 1, PAL.wood);
    px(12, 11, 1, 1, PAL.wood);
    px(12, 4, 1, 7, PAL.silver);
  }
}

function cavalry(px: Px, tc: TeamColors, pose: UnitPose, frame: number): void {
  const horse = '#7a4a2a';
  px(2, 14, 13, 2, SHADOW);
  // legs
  const lc = PAL.hair;
  if (pose === 'walk' && frame === 1) {
    px(3, 12, 1, 3, lc);
    px(6, 12, 1, 2, lc);
    px(10, 12, 1, 2, lc);
    px(13, 12, 1, 3, lc);
  } else {
    px(4, 12, 1, 3, lc);
    px(6, 12, 1, 3, lc);
    px(10, 12, 1, 3, lc);
    px(12, 12, 1, 3, lc);
  }
  px(2, 8, 1, 4, PAL.hair);
  px(3, 8, 10, 4, horse);
  px(4, 11, 8, 1, PAL.trunk);
  px(11, 5, 3, 4, horse);
  px(12, 3, 4, 3, horse);
  px(15, 5, 1, 1, PAL.ink);
  px(13, 4, 1, 1, PAL.ink);
  px(12, 2, 1, 1, horse);
  px(11, 3, 1, 4, PAL.hair);
  px(5, 8, 5, 3, tc.mid);
  px(5, 8, 5, 1, tc.light);
  // rider
  px(6, 3, 3, 5, tc.mid);
  px(6, 3, 3, 1, tc.light);
  px(6, 0, 3, 3, PAL.skin);
  px(6, 0, 3, 1, PAL.silver);
  px(8, 1, 1, 1, PAL.ink);
  if (pose === 'attack' && frame === 1) {
    px(7, 5, 9, 1, PAL.wood);
    px(15, 4, 1, 3, PAL.white);
  } else {
    px(9, 0, 1, 9, PAL.wood);
    px(9, 0, 1, 1, PAL.white);
  }
}

export function unitSprite(type: string, team: number, pose: UnitPose, frame: number, carry: string): HTMLCanvasElement {
  if (theme === 'sakura') return Sakura.unitSprite(type, team, pose, frame, carry);
  const key = `u:${type}:${team}:${pose}:${frame}:${carry}`;
  const tc = TEAM[team] ?? TEAM[2];
  return make(key, 16, 16, (px) => {
    if (type === 'villager') villager(px, tc, pose, frame, carry);
    else if (type === 'swordsman') swordsman(px, tc, pose, frame);
    else if (type === 'archer') archer(px, tc, pose, frame);
    else cavalry(px, tc, pose, frame);
  });
}

export function corpseSprite(type: string, team: number): HTMLCanvasElement {
  if (theme === 'sakura') return Sakura.corpseSprite(type, team);
  const tc = TEAM[team] ?? TEAM[2];
  return make(`c:${type}:${team}`, 16, 16, (px) => {
    if (type === 'cavalry') {
      px(2, 11, 11, 3, '#7a4a2a');
      px(12, 11, 3, 2, '#7a4a2a');
      px(4, 9, 5, 2, tc.mid);
    } else {
      px(3, 12, 8, 3, tc.mid);
      px(11, 12, 3, 3, PAL.skin);
      px(2, 13, 1, 2, PAL.trunk);
      if (type === 'swordsman') px(4, 11, 5, 1, PAL.silver);
    }
  });
}

// ---------- resources ----------

export function treeSprite(variant: number): HTMLCanvasElement {
  if (theme === 'sakura') return Sakura.treeSprite(variant);
  return make(`t:${variant}`, 16, 24, (px) => {
    px(3, 21, 11, 3, SHADOW);
    px(7, 15, 2, 7, PAL.trunk);
    px(7, 15, 1, 7, PAL.hair);
    if (variant === 2) {
      // pine
      for (let r = 0; r < 15; r++) {
        const half = Math.min(7, 1 + Math.floor(r * 0.55) - (r % 5 === 4 ? 1 : 0));
        px(8 - half, 2 + r, half * 2, 1, r % 5 === 0 ? PAL.leaf : PAL.leafDark);
      }
      px(7, 1, 2, 1, PAL.leafDark);
      px(6, 6, 1, 1, PAL.green);
      px(5, 11, 1, 1, PAL.green);
    } else {
      const cx = variant === 1 ? 7.5 : 8.5;
      disc(px, 8, 10, 7, PAL.leafDark);
      disc(px, cx, 8.5, 5.5, PAL.leaf);
      disc(px, cx - 1.5, 6.5, 2.5, PAL.green);
      px(cx - 3, 5, 1, 1, PAL.lime);
      px(11, 12, 1, 1, PAL.green);
    }
  });
}

export function berrySprite(level: number): HTMLCanvasElement {
  if (theme === 'sakura') return Sakura.berrySprite(level);
  return make(`b:${level}`, 16, 16, (px) => {
    px(2, 13, 12, 2, SHADOW);
    disc(px, 8, 9.5, 6, PAL.leafDark);
    disc(px, 7.5, 8.5, 4.5, PAL.leaf);
    disc(px, 6, 7, 1.8, PAL.green);
    const spots = [
      [5, 9],
      [9, 6],
      [11, 10],
      [7, 12],
      [4, 6],
      [10, 13],
      [12, 7],
      [6, 4],
    ];
    for (let i = 0; i < level; i++) {
      const [x, y] = spots[i];
      px(x, y, 2, 2, PAL.berry);
      px(x, y, 1, 1, PAL.orange);
    }
  });
}

export function sheepSprite(frame: number): HTMLCanvasElement {
  return make(`s:${frame}`, 16, 16, (px) => {
    px(3, 13, 11, 2, SHADOW);
    px(5, 12, 1, 3, PAL.ink);
    px(7, 12, 1, 3, PAL.ink);
    px(10, 12, 1, 3, PAL.ink);
    px(12, 12, 1, 2, PAL.ink);
    px(4, 7, 9, 6, PAL.wool);
    px(5, 6, 7, 1, PAL.wool);
    px(4, 11, 9, 1, PAL.silver);
    px(6, 7, 1, 1, PAL.white);
    const hy = frame ? 9 : 7;
    px(12, hy, 3, 3, '#3a3340');
    px(14, hy + 1, 1, 1, PAL.white);
    px(12, hy - 1, 1, 1, '#3a3340');
  });
}

// ---------- buildings (footprint plus 8 px of roof above) ----------

function stoneWall(px: Px, x: number, y: number, w: number, h: number): void {
  px(x, y, w, h, PAL.stone);
  for (let r = 0; r < h; r += 3) {
    px(x, y + r, w, 1, PAL.stoneDark);
    for (let c = (r / 3) % 2 === 0 ? 2 : 5; c < w; c += 6) px(x + c, y + r, 1, 3, PAL.stoneDark);
  }
  px(x, y, w, 1, PAL.silver);
}

function roof(px: Px, cx: number, top: number, rows: number, base: number, slope: number, tc: TeamColors): void {
  for (let r = 0; r < rows; r++) {
    const half = Math.round(base + r * slope);
    const c = r === 0 ? tc.light : r === rows - 1 ? tc.dark : r % 3 === 0 ? tc.dark : tc.mid;
    px(cx - half, top + r, half * 2, 1, c);
    px(cx - half, top + r, 1, 1, tc.dark);
    px(cx + half - 1, top + r, 1, 1, tc.dark);
  }
}

function house(px: Px, tc: TeamColors): void {
  px(2, 37, 30, 3, SHADOW);
  px(21, 8, 4, 8, PAL.stoneDark);
  px(21, 8, 4, 1, PAL.stone);
  px(5, 23, 22, 14, PAL.woodLight);
  px(5, 23, 1, 14, PAL.wood);
  px(26, 23, 1, 14, PAL.wood);
  px(5, 30, 22, 1, PAL.wood);
  px(14, 28, 5, 9, PAL.trunk);
  px(14, 28, 5, 1, PAL.hair);
  px(17, 32, 1, 1, PAL.yellow);
  px(8, 25, 4, 4, PAL.ink);
  px(9, 26, 2, 2, PAL.yellow);
  px(21, 25, 4, 4, PAL.ink);
  px(22, 26, 2, 2, PAL.yellow);
  roof(px, 16, 10, 13, 3, 1.05, tc);
}

function storehouse(px: Px, tc: TeamColors): void {
  px(2, 37, 30, 3, SHADOW);
  px(6, 20, 20, 17, '#3d2a1a');
  px(4, 18, 3, 19, PAL.wood);
  px(25, 18, 3, 19, PAL.wood);
  px(2, 12, 28, 7, tc.mid);
  px(2, 12, 28, 1, tc.light);
  px(2, 18, 28, 1, tc.dark);
  for (let x = 4; x < 30; x += 5) px(x, 13, 1, 5, tc.dark);
  // crates, sack and logs
  px(8, 29, 7, 8, PAL.woodLight);
  px(8, 32, 7, 1, PAL.wood);
  px(11, 29, 1, 8, PAL.wood);
  px(15, 31, 5, 6, PAL.woodLight);
  px(15, 33, 5, 1, PAL.wood);
  px(10, 25, 4, 4, '#d9c08c');
  px(10, 25, 4, 1, PAL.dirt);
  disc(px, 21.5, 34.5, 2, PAL.wood);
  disc(px, 24, 34.5, 2, PAL.wood);
  disc(px, 22.8, 31.5, 2, PAL.wood);
  px(21, 34, 1, 1, PAL.woodLight);
  px(24, 34, 1, 1, PAL.woodLight);
  px(22, 31, 1, 1, PAL.woodLight);
  px(28, 2, 1, 11, PAL.trunk);
  px(29, 2, 3, 4, tc.light);
}

function barracks(px: Px, tc: TeamColors): void {
  px(1, 37, 31, 3, SHADOW);
  stoneWall(px, 2, 30, 28, 7);
  px(3, 20, 26, 10, PAL.woodLight);
  px(3, 20, 1, 10, PAL.wood);
  px(28, 20, 1, 10, PAL.wood);
  px(12, 25, 8, 12, '#3d2a1a');
  px(13, 24, 6, 1, '#3d2a1a');
  px(12, 25, 1, 12, PAL.stoneDark);
  px(19, 25, 1, 12, PAL.stoneDark);
  // shield sign with crossed swords
  px(5, 22, 6, 6, tc.dark);
  px(5, 22, 6, 1, tc.light);
  for (let i = 0; i < 4; i++) {
    px(6 + i, 23 + i, 1, 1, PAL.white);
    px(9 - i, 23 + i, 1, 1, PAL.white);
  }
  px(22, 23, 4, 4, PAL.ink);
  px(23, 24, 2, 2, PAL.orange);
  roof(px, 16, 9, 11, 8, 0.75, tc);
  px(26, 0, 1, 10, PAL.trunk);
  px(27, 0, 5, 3, tc.light);
  px(27, 3, 3, 1, tc.mid);
}

function townCenter(px: Px, tc: TeamColors): void {
  px(2, 53, 45, 3, SHADOW);
  stoneWall(px, 3, 41, 42, 13);
  px(6, 28, 36, 13, PAL.woodLight);
  for (const x of [6, 17, 30, 41]) px(x, 28, 1, 13, PAL.wood);
  px(6, 34, 36, 1, PAL.wood);
  px(9, 30, 5, 4, PAL.ink);
  px(10, 31, 3, 2, PAL.yellow);
  px(34, 30, 5, 4, PAL.ink);
  px(35, 31, 3, 2, PAL.yellow);
  px(19, 40, 10, 14, '#3d2a1a');
  px(20, 39, 8, 1, '#3d2a1a');
  px(19, 40, 1, 14, PAL.stoneDark);
  px(28, 40, 1, 14, PAL.stoneDark);
  roof(px, 24, 16, 13, 9, 1.15, tc);
  // tower
  stoneWall(px, 19, 6, 10, 12);
  for (let x = 19; x < 29; x += 3) px(x, 4, 2, 2, PAL.stone);
  px(22, 9, 4, 5, PAL.ink);
  px(23, 10, 2, 3, PAL.yellow);
  px(24, 0, 1, 5, PAL.trunk);
  px(25, 0, 6, 3, tc.light);
  px(25, 3, 4, 1, tc.mid);
}

export function buildingSprite(type: string, team: number): HTMLCanvasElement {
  if (theme === 'sakura') return Sakura.buildingSprite(type, team);
  const tc = TEAM[team] ?? TEAM[2];
  const size = type === 'townCenter' ? 48 : 32;
  return make(`bld:${type}:${team}`, size, size + 8, (px) => {
    if (type === 'house') house(px, tc);
    else if (type === 'storehouse') storehouse(px, tc);
    else if (type === 'barracks') barracks(px, tc);
    else townCenter(px, tc);
  });
}

export function foundationSprite(size: number): HTMLCanvasElement {
  const s = size * 16;
  return make(`f:${size}`, s, s + 8, (px) => {
    px(1, 9, s - 2, s - 2, PAL.dirt);
    px(1, 9, s - 2, 1, PAL.dirtDark);
    px(1, s + 6, s - 2, 1, PAL.dirtDark);
    px(1, 9, 1, s - 2, PAL.dirtDark);
    px(s - 2, 9, 1, s - 2, PAL.dirtDark);
    for (let x = 4; x < s - 4; x += 7) px(x, 14, 2, s - 10, PAL.wood);
    for (let y = 16; y < s + 4; y += 8) px(3, y, s - 6, 1, PAL.woodLight);
  });
}

/** A 16 x 16 icon for the HUD. */
export function iconFor(type: string, team = 0): HTMLCanvasElement {
  if (type === 'villager' || type === 'swordsman' || type === 'archer' || type === 'cavalry') return unitSprite(type, team, 'idle', 0, '');
  if (type === 'tree') return treeSprite(0);
  if (type === 'berries') return berrySprite(6);
  if (type === 'sheep') return sheepSprite(0);
  return buildingSprite(type, team);
}
