// The Sakura Village theme: Japanese villagers and soldiers, cherry blossoms,
// and three-quarter-view buildings with curved tile roofs. Drawn in code.

type Px = (x: number, y: number, w: number, h: number, c: string) => void;
type Team3 = { d: string; m: string; l: string };

const JP = {
  ol: '#2b1a24', plaster: '#f3eee2', plasterD: '#d8cfbd', wood: '#5b3a29', woodD: '#3a251b', woodL: '#8a5a3c', straw: '#d9b56a', strawD: '#a8843f',
  shoji: '#f6f0dc', shojiL: '#c9bfa6', stone: '#9b9a96', stoneD: '#6d6c69', stoneL: '#c4c3be', skin: '#f2c9a2', hair: '#1f1a1d', vermil: '#d2452f', vermilD: '#93301f',
  black: '#2a2a33', blackL: '#4a4a58', gold: '#e3b341', goldD: '#b8862a', pink: '#f4a7c0', pinkD: '#d9779a', pinkL: '#ffd6e3', leaf: '#3f7a43', leafD: '#2a5734',
  bamboo: '#7fb05a', bambooD: '#4f7d38', persim: '#f07d2a', blade: '#d8dee6', horse: '#5a3a26', horseL: '#7a5238',
};
const SH = 'rgba(16,18,30,0.3)';
const TEAMS: Team3[] = [
  { d: '#24406e', m: '#3a62a8', l: '#79a0de' },
  { d: '#6e2430', m: '#a83a44', l: '#de7984' },
  { d: '#3a3a44', m: '#6a6a78', l: '#a0a0ae' },
];
interface RoofC {
  hi: string;
  l: string;
  m: string;
  d: string;
  dd: string;
}
const ROOF: RoofC[] = [
  { hi: '#a9c4ee', l: '#6f93d0', m: '#4a6cae', d: '#33508a', dd: '#22365f' },
  { hi: '#f0b0b0', l: '#d0706f', m: '#ae4a4c', d: '#8a3337', dd: '#5f2226' },
  { hi: '#c8c8d0', l: '#9a9aa6', m: '#74747f', d: '#55555f', dd: '#3a3a42' },
];
const RAFTER = '#3a2418';

/** How far a building sprite's bottom hangs below its footprint (shadow rows). */
export const BUILDING_PAD = 4;

const cache = new Map<string, HTMLCanvasElement>();

function make(key: string, w: number, h: number, fn: (px: Px) => void, outline = true): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  fn((x, y, ww, hh, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, ww, hh);
  });
  if (outline) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 150;
    const marks: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) marks.push(y * w + x);
    for (const i of marks) {
      d[i * 4] = 0x2b;
      d[i * 4 + 1] = 0x1a;
      d[i * 4 + 2] = 0x24;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  cache.set(key, c);
  return c;
}

function disc(px: Px, cx: number, cy: number, r: number, c: string): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) px(x, y, 1, 1, c);
    }
}

// ---------- shared building parts ----------

function shoji(px: Px, x: number, y: number, w: number, h: number): void {
  px(x, y, w, h, JP.shoji);
  for (let i = x; i < x + w; i += 3) px(i, y, 1, h, JP.shojiL);
  for (let j = y; j < y + h; j += 3) px(x, j, w, 1, JP.shojiL);
  px(x, y, w, 1, JP.wood);
}
function noren(px: Px, x: number, y: number, w: number, t: Team3): void {
  px(x - 1, y - 1, w + 2, 1, JP.woodD);
  px(x, y, w, 4, t.m);
  for (let i = x + 2; i < x + w; i += 3) px(i, y + 1, 1, 3, t.d);
  px(x + Math.floor(w / 2) - 1, y + 1, 2, 2, JP.plaster);
}
function nobori(px: Px, x: number, y: number, h: number, t: Team3): void {
  px(x, y, 1, h, JP.woodD);
  px(x + 1, y + 1, 4, 1, JP.woodD);
  px(x + 1, y + 2, 4, h - 6, t.m);
  px(x + 1, y + 2, 4, 1, t.l);
  px(x + 2, y + 5, 2, 2, JP.plaster);
  px(x + 2, y + 9, 2, 1, JP.plaster);
}

/** A curved tile roof seen from the front and a little above. */
function roof3q(px: Px, cx: number, half: number, yTop: number, yEave: number, ridgeHalf: number, lift: number, c: RoofC, gable = false): void {
  const step = (col: string): string => (col === c.hi ? c.l : col === c.l ? c.m : col === c.m ? c.d : c.dd);
  for (let x = cx - half; x <= cx + half; x++) {
    const t = (x - cx) / half;
    const bottom = yEave - Math.round(lift * Math.pow(Math.abs(t), 3.2));
    const ad = Math.abs(x - cx);
    let top = yTop;
    if (ad > ridgeHalf) top = yTop + Math.round(((ad - ridgeHalf) / Math.max(1, half - ridgeHalf)) * (yEave - yTop) * 0.8);
    top = Math.min(top, bottom - 2);
    const right = x > cx + half * 0.3;
    for (let y = top; y <= bottom; y++) {
      const k = (y - top) / Math.max(1, bottom - top);
      let col = k < 0.18 ? c.hi : k < 0.45 ? c.l : k < 0.8 ? c.m : c.d;
      if (right) col = step(col);
      if ((x - cx + 300) % 3 === 0 && y > top) col = step(col);
      px(x, y, 1, 1, col);
    }
    px(x, bottom, 1, 1, right ? c.d : c.l);
    if (Math.abs(t) < 0.97) {
      px(x, bottom + 1, 1, 1, RAFTER);
      if ((x + 300) % 2 === 0) px(x, bottom + 2, 1, 1, RAFTER);
      px(x, bottom + 2, 1, 2, 'rgba(20,10,20,0.28)');
    }
  }
  px(cx - ridgeHalf - 1, yTop - 1, ridgeHalf * 2 + 3, 2, c.dd);
  px(cx - ridgeHalf - 2, yTop - 3, 2, 3, c.dd);
  px(cx + ridgeHalf + 1, yTop - 3, 2, 3, c.dd);
  if (gable) {
    for (let r = 0; r < 4; r++) px(cx - r - 1, yTop + 1 + r, r * 2 + 2, 1, r === 3 ? RAFTER : JP.woodL);
    px(cx, yTop + 2, 1, 2, JP.gold);
  }
}
function wall3q(px: Px, x: number, y: number, w: number, h: number, side: number, face: string, sideC: string): void {
  px(x, y, w, h, face);
  for (let i = 0; i < side; i++) px(x + w + i, y - Math.floor((i + 1) / 2), 1, h, sideC);
}
function base3q(px: Px, x: number, y: number, w: number, h: number, side: number): void {
  px(x, y, w, 1, JP.stoneL);
  px(x, y + 1, w, h - 1, JP.stone);
  for (let r = y + 2; r < y + h; r += 2) for (let c = x + ((r - y) % 4 === 0 ? 1 : 4); c < x + w; c += 6) px(c, r, 2, 1, JP.stoneD);
  for (let i = 0; i < side; i++) px(x + w + i, y - Math.floor((i + 1) / 2), 1, h, JP.stoneD);
}

// ---------- buildings ----------

function house(px: Px, team: number): void {
  const c = ROOF[team];
  const t = TEAMS[team];
  px(4, 45, 34, 4, SH);
  base3q(px, 6, 42, 26, 4, 4);
  px(5, 41, 28, 2, JP.woodL);
  px(5, 42, 28, 1, JP.wood);
  wall3q(px, 8, 28, 22, 13, 5, JP.plaster, JP.plasterD);
  for (const x of [8, 18, 29]) px(x, 28, 1, 13, JP.wood);
  for (let i = 0; i < 5; i++) px(30 + i, 28 - Math.floor((i + 1) / 2), 1, 1, JP.wood);
  shoji(px, 10, 31, 7, 10);
  noren(px, 10, 31, 7, t);
  shoji(px, 20, 32, 8, 6);
  roof3q(px, 20, 18, 13, 27, 6, 3, c, true);
}
function storehouse(px: Px, team: number): void {
  const c = ROOF[team];
  const t = TEAMS[team];
  px(4, 45, 34, 4, SH);
  base3q(px, 7, 42, 20, 4, 5);
  wall3q(px, 8, 24, 18, 18, 6, JP.plaster, JP.plasterD);
  px(8, 34, 18, 8, '#3b3b46');
  for (let i = 0; i < 6; i++) px(26 + i, 34 - Math.floor((i + 1) / 2), 1, 8, '#2c2c35');
  for (let x = 8; x < 26; x += 3)
    for (const [dx, dy] of [
      [1, 35],
      [0, 36],
      [2, 36],
      [1, 37],
      [1, 39],
      [0, 40],
      [2, 40],
    ])
      px(x + dx, dy, 1, 1, JP.plaster);
  px(14, 27, 6, 5, '#2c2c35');
  px(15, 28, 4, 3, JP.woodD);
  px(13, 27, 1, 5, JP.plasterD);
  px(20, 27, 1, 5, JP.plasterD);
  noren(px, 14, 35, 6, t);
  roof3q(px, 18, 15, 13, 23, 7, 2, c);
  for (const [bx, by] of [
    [30, 38],
    [35, 38],
    [32, 34],
  ]) {
    px(bx, by, 5, 5, JP.straw);
    px(bx, by, 5, 1, '#f0d48c');
    px(bx + 1, by, 1, 5, JP.strawD);
    px(bx + 3, by, 1, 5, JP.strawD);
  }
}
function dojo(px: Px, team: number): void {
  const c = ROOF[team];
  const t = TEAMS[team];
  px(3, 45, 38, 4, SH);
  base3q(px, 4, 41, 32, 5, 4);
  px(16, 44, 10, 2, JP.stoneL);
  wall3q(px, 6, 28, 28, 13, 5, JP.woodL, JP.wood);
  for (let x = 6; x < 34; x += 4) px(x, 28, 1, 13, JP.wood);
  for (let i = 0; i < 5; i++) px(34 + i, 28 - Math.floor((i + 1) / 2), 1, 13, JP.woodD);
  shoji(px, 13, 31, 16, 10);
  px(16, 29, 10, 3, JP.woodD);
  px(17, 30, 8, 1, JP.plaster);
  roof3q(px, 21, 21, 9, 27, 9, 4, c, true);
  nobori(px, 1, 18, 26, t);
  nobori(px, 38, 18, 26, t);
}
function pagoda(px: Px, team: number, H: number): void {
  const c = ROOF[team];
  const cx = 28;
  const tiers = 3;
  px(4, H - 6, 50, 4, SH);
  base3q(px, 5, H - 14, 42, 9, 6);
  px(18, H - 6, 12, 3, JP.stoneL);
  px(19, H - 4, 10, 1, JP.stoneD);
  let y = H - 14;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1);
    const bw = Math.round(28 - f * 12);
    const bh = i === 0 ? 11 : 6;
    const bx = cx - Math.floor(bw / 2);
    wall3q(px, bx, y - bh, bw, bh, 3, JP.plaster, JP.plasterD);
    px(bx, y - bh, 2, bh, JP.vermil);
    px(bx + bw - 2, y - bh, 2, bh, JP.vermil);
    for (let k = 0; k < 3; k++) px(bx + bw + k, y - bh - Math.floor((k + 1) / 2), 1, bh, JP.vermilD);
    if (i === 0) {
      px(cx - 4, y - 9, 8, 9, JP.vermilD);
      px(cx - 3, y - 8, 6, 8, '#4a2418');
      px(cx - 1, y - 6, 2, 2, JP.gold);
      px(bx + 3, y - 8, 3, 4, JP.shojiL);
      px(bx + bw - 6, y - 8, 3, 4, JP.shojiL);
    } else {
      px(bx + 2, y - bh + 1, bw - 4, 1, JP.vermil);
      for (let x = bx + 3; x < bx + bw - 3; x += 2) px(x, y - bh + 2, 1, 2, JP.vermilD);
      px(cx - 1, y - bh + 2, 2, bh - 2, '#4a2418');
    }
    const half = Math.round(bw / 2 + 10 - f * 2);
    const rh = i === 0 ? 8 : 6;
    const eave = y - bh - 1;
    roof3q(px, cx, half, eave - rh, eave, 2, i === 0 ? 3 : 2, c);
    y = eave - rh + 2;
  }
  px(cx, y - 15, 1, 15, JP.gold);
  for (let r = 0; r < 5; r++) px(cx - 1, y - 4 - r * 2, 3, 1, JP.goldD);
  px(cx - 1, y - 17, 3, 2, JP.gold);
  px(cx, y - 18, 1, 1, '#fff2b0');
}

const HORSE = { body: '#6b4329', bodyD: '#4e2f1d', bodyL: '#8a5a3a', mane: '#1f1712', white: '#f1ece0' };
function horseHead(px: Px, x: number, y: number): void {
  px(x, y + 1, 4, 3, HORSE.body);
  px(x + 3, y + 2, 2, 2, HORSE.body);
  px(x + 4, y + 3, 1, 1, HORSE.mane);
  px(x + 2, y + 1, 1, 1, JP.ol);
  px(x + 3, y + 1, 1, 2, HORSE.white);
  px(x, y, 1, 1, HORSE.body);
  px(x - 1, y + 1, 1, 3, HORSE.mane);
}
/** Long wooden barn (umaya) with three stalls. */
function stable(px: Px, team: number): void {
  const c = ROOF[team];
  const t = TEAMS[team];
  px(3, 45, 44, 4, SH);
  base3q(px, 4, 43, 36, 3, 4);
  wall3q(px, 5, 28, 34, 15, 5, JP.woodL, JP.wood);
  for (let x = 5; x < 39; x += 2) px(x, 28, 1, 15, JP.wood);
  for (let i = 0; i < 5; i++) px(39 + i, 28 - Math.floor((i + 1) / 2), 1, 15, JP.woodD);
  for (const sx of [8, 18, 28]) {
    px(sx, 32, 8, 11, '#2e1d14');
    px(sx, 37, 8, 1, JP.woodL);
    horseHead(px, sx + 2, 33);
  }
  roof3q(px, 22, 23, 14, 27, 12, 3, c);
  nobori(px, 44, 18, 26, t);
  px(0, 38, 5, 5, JP.straw);
  px(0, 40, 5, 1, JP.strawD);
}

function market(px: Px, team: number): void {
  const c = ROOF[team];
  const t = TEAMS[team];
  px(4, 45, 36, 4, SH);
  base3q(px, 5, 42, 30, 4, 4);
  wall3q(px, 7, 26, 28, 16, 5, JP.woodL, JP.wood);
  for (let i = 0; i < 5; i++) px(35 + i, 26 - Math.floor((i + 1) / 2), 1, 16, JP.woodD);
  // open shop front with a counter of goods
  px(9, 30, 24, 12, '#3a2418');
  px(8, 36, 26, 6, JP.woodD);
  px(8, 36, 26, 1, JP.woodL);
  px(10, 32, 4, 4, JP.straw);
  px(10, 33, 4, 1, JP.strawD);
  disc(px, 17, 34, 2, '#8a5a3c');
  px(16, 32, 2, 1, '#c98d52');
  px(21, 32, 3, 4, JP.pinkD);
  px(24, 32, 3, 4, '#3a62a8');
  px(27, 33, 4, 3, JP.persim);
  px(28, 33, 1, 1, '#ffb36b');
  noren(px, 12, 27, 18, t);
  // red paper lanterns
  for (const lx of [7, 33]) {
    px(lx, 28, 3, 4, JP.vermil);
    px(lx, 29, 3, 1, JP.vermilD);
    px(lx + 1, 27, 1, 1, JP.woodD);
  }
  roof3q(px, 21, 20, 12, 25, 8, 3, c, true);
}

/** Wall piece joined to its neighbours (mask bits: 1 north, 2 east, 4 south, 8 west). */
function wallPiece(px: Px, mask: number, stone: boolean, team: number): void {
  const g = 18; // ground line inside the tile
  const t = TEAMS[team];
  const run = (x0: number, x1: number, dy: number): void => {
    if (stone) {
      px(x0, g - 11 + dy, x1 - x0, 2, JP.black);
      px(x0, g - 12 + dy, x1 - x0, 1, JP.blackL);
      px(x0, g - 9 + dy, x1 - x0, 7, JP.plaster);
      px(x0, g - 3 + dy, x1 - x0, 5, JP.stone);
      for (let x = x0 + 1; x < x1; x += 4) px(x, g - 1 + dy, 2, 1, JP.stoneD);
      px(x0, g + 2 + dy, x1 - x0, 1, JP.stoneD);
    } else {
      for (let x = x0; x < x1; x += 2) {
        const h = 12 + ((x * 7) % 3);
        px(x, g - h + dy, 2, h + 2, JP.woodL);
        px(x + 1, g - h + 1 + dy, 1, h + 1, JP.wood);
        px(x, g - h - 1 + dy, 1, 1, JP.woodL);
      }
      px(x0, g - 6 + dy, x1 - x0, 1, JP.strawD);
    }
  };
  px(2, g + 1, 12, 3, SH);
  if (mask & 1) run(4, 12, -6);
  if (mask & 8) run(0, 8, 0);
  run(4, 12, 0);
  if (mask & 2) run(8, 16, 0);
  if (mask & 4) run(4, 12, 6);
  if (stone && mask === 0) px(6, g - 7, 4, 2, t.m); // a lone pillar gets a team badge
}

/** Gate (variant bits: 1 open, 2 runs north-south, 4 locked). */
function gatePiece(px: Px, variant: number, stone: boolean, team: number): void {
  const t = TEAMS[team];
  const open = (variant & 1) !== 0;
  const locked = (variant & 4) !== 0;
  px(1, 27, 14, 3, SH);
  const post = stone ? JP.stone : JP.woodD;
  px(0, 10, 3, 18, post);
  px(13, 10, 3, 18, post);
  if (stone) {
    px(0, 10, 3, 1, JP.stoneL);
    px(13, 10, 3, 1, JP.stoneL);
    roof3q(px, 8, 9, 4, 9, 4, 1, ROOF[team]);
  } else {
    px(-1, 7, 18, 2, JP.vermil);
    px(0, 9, 16, 1, JP.vermilD);
    px(1, 11, 14, 1, JP.woodD);
  }
  if (open) {
    px(3, 12, 10, 16, '#241710');
    px(3, 12, 2, 16, JP.woodL);
    px(11, 12, 2, 16, JP.woodL);
  } else {
    px(3, 12, 10, 16, stone ? JP.woodD : JP.woodL);
    for (let x = 4; x < 13; x += 3) px(x, 12, 1, 16, stone ? '#2e1d14' : JP.wood);
    px(7, 12, 2, 16, JP.ol);
    px(4, 14, 3, 4, t.m);
    px(9, 14, 3, 4, t.m);
    if (stone) for (const [x, y] of [[4, 20], [10, 20], [4, 25], [10, 25]]) px(x, y, 1, 1, JP.blade);
  }
  if (locked) {
    px(3, 19, 10, 2, JP.blackL);
    px(7, 18, 2, 4, JP.gold);
  }
}

function watchTower(px: Px, team: number): void {
  const c = ROOF[team];
  const t = TEAMS[team];
  px(2, 41, 20, 4, SH);
  for (const lx of [4, 18]) px(lx, 18, 2, 26, JP.woodD);
  for (const lx of [8, 14]) px(lx, 20, 1, 24, JP.wood);
  for (let i = 0; i < 12; i++) {
    px(5 + i, 22 + Math.floor(i * 1.5), 1, 1, JP.wood);
    px(17 - i, 22 + Math.floor(i * 1.5), 1, 1, JP.wood);
  }
  px(10, 22, 1, 22, JP.woodL);
  px(13, 22, 1, 22, JP.woodL);
  for (let y = 24; y < 44; y += 3) px(10, y, 4, 1, JP.woodL);
  px(2, 17, 20, 3, JP.woodL);
  px(2, 19, 20, 1, JP.woodD);
  px(2, 12, 1, 5, JP.wood);
  px(21, 12, 1, 5, JP.wood);
  px(2, 13, 20, 1, JP.wood);
  roof3q(px, 12, 11, 5, 11, 3, 2, c);
  px(21, 0, 1, 12, JP.woodD);
  px(22, 1, 2, 6, t.m);
}

function guardTower(px: Px, team: number): void {
  const c = ROOF[team];
  const t = TEAMS[team];
  px(2, 47, 26, 4, SH);
  // sloped stone base
  for (let r = 0; r < 12; r++) px(3 + Math.floor((11 - r) / 4), 36 + r, 22 - Math.floor((11 - r) / 4) * 2, 1, r % 3 === 0 ? JP.stoneD : JP.stone);
  px(25, 34, 3, 14, JP.stoneD);
  wall3q(px, 6, 22, 18, 14, 3, JP.plaster, JP.plasterD);
  px(6, 22, 2, 14, JP.woodD);
  px(22, 22, 2, 14, JP.woodD);
  for (const sx of [10, 15, 19]) px(sx, 26, 1, 5, JP.ol);
  px(6, 33, 18, 1, JP.woodD);
  roof3q(px, 15, 14, 14, 21, 4, 2, c);
  roof3q(px, 15, 8, 7, 12, 2, 2, c);
  px(15, 0, 1, 6, JP.woodD);
  px(16, 0, 4, 3, t.l);
  nobori(px, 0, 24, 20, t);
}

/** Gold mine or stone quarry; `level` 1-4 shrinks as it is mined out. */
export function mineSprite(kind: string, level: number): HTMLCanvasElement {
  return make(`mine:${kind}:${level}`, 20, 18, (px) => {
    px(2, 15, 16, 3, SH);
    const rock = kind === 'gold' ? ['#6d6c69', '#8a8884', '#a8a59e'] : ['#7d828c', '#a0a6b0', '#c9ced6'];
    disc(px, 10, 11, 5 + level * 0.5, rock[0]);
    disc(px, 7, 10, 3 + level * 0.3, rock[1]);
    disc(px, 13, 11, 3 + level * 0.3, rock[1]);
    disc(px, 7, 8.5, 1.6, rock[2]);
    disc(px, 12, 9.5, 1.4, rock[2]);
    if (kind === 'gold') {
      const spots = [[6, 11], [12, 8], [9, 13], [14, 12], [8, 7], [11, 11]];
      for (let i = 0; i < Math.min(spots.length, level + 2); i++) {
        const [x, y] = spots[i];
        px(x, y, 2, 2, JP.gold);
        px(x, y, 1, 1, '#fff2b0');
      }
    } else {
      px(6, 12, 5, 1, rock[0]);
      px(11, 8, 1, 4, rock[0]);
      px(8, 9, 1, 1, '#e6e9ee');
    }
  });
}

export function buildingSprite(type: string, team: number, variant = 0): HTMLCanvasElement {
  if (type === 'wall' || type === 'stoneWall') return make(`w:${type}:${team}:${variant}`, 16, 30, (px) => wallPiece(px, variant, type === 'stoneWall', team));
  if (type === 'gate' || type === 'stoneGate') return make(`g:${type}:${team}:${variant}`, 16, 32, (px) => gatePiece(px, variant, type === 'stoneGate', team));
  if (type === 'watchTower') return make(`wt:${team}`, 24, 48, (px) => watchTower(px, team));
  if (type === 'guardTower') return make(`gt:${team}`, 28, 54, (px) => guardTower(px, team));
  if (type === 'market') return make(`mk:${team}`, 44, 50, (px) => market(px, team));
  if (type === 'stable') return make(`stable:${team}`, 50, 50, (px) => stable(px, team));
  if (type === 'townCenter') return make(`tc:${team}`, 58, 86, (px) => pagoda(px, team, 86));
  const w = type === 'barracks' ? 44 : 42;
  return make(`b:${type}:${team}`, w, 50, (px) => {
    if (type === 'house') house(px, team);
    else if (type === 'storehouse') storehouse(px, team);
    else dojo(px, team);
  });
}

// ---------- people ----------

export type Pose = 'idle' | 'walk' | 'attack' | 'work';

function feet(px: Px, o: number, pose: Pose, frame: number): void {
  if (pose === 'walk' && frame === 1) {
    px(o + 5, 12, 2, 3, JP.black);
    px(o + 9, 12, 2, 3, JP.black);
    px(o + 4, 15, 2, 1, JP.straw);
    px(o + 10, 15, 2, 1, JP.straw);
  } else if (pose === 'walk') {
    px(o + 7, 12, 2, 3, JP.black);
    px(o + 7, 15, 3, 1, JP.straw);
  } else {
    px(o + 6, 12, 2, 3, JP.black);
    px(o + 8, 12, 2, 3, JP.black);
    px(o + 6, 15, 4, 1, JP.straw);
  }
}
function flag(px: Px, o: number, t: Team3): void {
  px(o + 3, 0, 1, 9, JP.woodD);
  px(o + 0, 0, 3, 5, t.m);
  px(o + 0, 0, 3, 1, t.l);
  px(o + 1, 2, 1, 1, JP.plaster);
}

function villager(px: Px, t: Team3, pose: Pose, frame: number, carry: string): void {
  const o = 1;
  px(o + 3, 15, 10, 2, SH);
  if (carry === 'wood') {
    px(o + 1, 6, 1, 7, JP.woodD);
    px(o + 1, 7, 3, 5, JP.woodL);
    px(o + 1, 8, 3, 1, JP.straw);
  } else if (carry === 'food') {
    px(o + 1, 8, 4, 4, JP.straw);
    px(o + 1, 7, 2, 2, JP.persim);
    px(o + 3, 7, 2, 1, JP.persim);
  }
  feet(px, o, pose, frame);
  px(o + 5, 7, 6, 5, t.m);
  px(o + 5, 7, 1, 5, t.d);
  px(o + 7, 7, 1, 1, JP.plaster);
  px(o + 8, 8, 1, 1, JP.plaster);
  px(o + 5, 10, 6, 1, JP.plaster);
  px(o + 6, 3, 4, 4, JP.skin);
  px(o + 9, 4, 1, 1, JP.ol);
  px(o + 7, 0, 2, 1, JP.strawD);
  px(o + 5, 1, 6, 1, JP.straw);
  px(o + 3, 2, 10, 1, JP.straw);
  px(o + 2, 3, 12, 1, JP.strawD);
  if (pose === 'work' || pose === 'attack') {
    if (frame === 0) {
      px(o + 10, 4, 1, 3, JP.skin);
      px(o + 11, 0, 1, 6, JP.woodL);
      px(o + 11, 0, 3, 2, JP.blade);
    } else {
      px(o + 10, 7, 2, 2, JP.skin);
      px(o + 11, 8, 4, 1, JP.woodL);
      px(o + 14, 7, 2, 3, JP.blade);
    }
  } else px(o + 10, 8, 1, 3, JP.skin);
}

/** Samurai helmet (kabuto) with neck guard and a gold crescent crest. */
function kabuto(px: Px, o: number, crest: boolean): void {
  px(o + 6, 1, 4, 3, JP.black);
  px(o + 7, 1, 2, 1, JP.blackL);
  px(o + 4, 3, 2, 3, JP.black);
  px(o + 5, 3, 1, 1, JP.blackL);
  px(o + 10, 3, 1, 1, JP.black);
  if (crest) {
    px(o + 6, 0, 1, 1, JP.gold);
    px(o + 9, 0, 1, 1, JP.gold);
    px(o + 7, 1, 2, 1, JP.gold);
  } else px(o + 8, 1, 1, 1, JP.gold);
}
/** Laced lamellar armor in team colors with shoulder plates. */
function armor(px: Px, o: number, t: Team3): void {
  px(o + 5, 7, 6, 4, t.d);
  px(o + 5, 8, 6, 1, t.l);
  px(o + 5, 10, 6, 1, t.m);
  px(o + 5, 11, 6, 1, t.m);
  px(o + 6, 11, 1, 1, t.d);
  px(o + 9, 11, 1, 1, t.d);
  px(o + 4, 7, 2, 3, t.m);
  px(o + 4, 8, 2, 1, t.d);
}

/** Straw war hat worn by the lowest tier. */
function jingasa(px: Px, o: number): void {
  px(o + 4, 3, 8, 1, JP.black);
  px(o + 5, 2, 6, 1, JP.black);
  px(o + 7, 1, 2, 1, JP.blackL);
}
/** The top tier's great horned helmet and face mask. */
function hornedKabuto(px: Px, o: number): void {
  kabuto(px, o, false);
  px(o + 4, 0, 1, 2, JP.gold);
  px(o + 11, 0, 1, 2, JP.gold);
  px(o + 3, 0, 1, 1, JP.gold);
  px(o + 12, 0, 1, 1, JP.gold);
  px(o + 7, 0, 2, 1, JP.vermil);
  px(o + 7, 6, 3, 1, JP.vermilD);
}
function lightBody(px: Px, o: number, t: Team3): void {
  px(o + 5, 7, 6, 5, t.m);
  px(o + 5, 7, 1, 5, t.d);
  px(o + 7, 7, 1, 1, JP.plaster);
  px(o + 5, 10, 6, 1, JP.plaster);
}
function goldTrim(px: Px, o: number): void {
  px(o + 5, 7, 6, 1, JP.gold);
  px(o + 4, 7, 2, 1, JP.gold);
  px(o + 5, 11, 6, 1, JP.goldD);
}

function militia(px: Px, t: Team3, pose: Pose, frame: number): void {
  const o = 1;
  px(o + 3, 15, 10, 2, SH);
  feet(px, o, pose, frame);
  lightBody(px, o, t);
  px(o + 6, 4, 4, 3, JP.skin);
  px(o + 9, 4, 1, 1, JP.ol);
  jingasa(px, o);
  if (pose === 'attack' && frame === 1) {
    px(o + 10, 8, 2, 2, JP.skin);
    px(o + 12, 8, 4, 1, JP.blade);
  } else {
    px(o + 10, 8, 2, 2, JP.skin);
    px(o + 12, 4, 1, 4, JP.blade);
    px(o + 11, 8, 2, 1, JP.woodD);
  }
}

function champion(px: Px, t: Team3, pose: Pose, frame: number): void {
  const o = 1;
  px(o + 3, 15, 10, 2, SH);
  flag(px, o, t);
  feet(px, o, pose, frame);
  armor(px, o, t);
  goldTrim(px, o);
  px(o + 6, 4, 4, 3, JP.skin);
  px(o + 9, 4, 1, 1, JP.ol);
  hornedKabuto(px, o);
  if (pose === 'attack' && frame === 1) {
    px(o + 10, 8, 2, 2, JP.skin);
    px(o + 12, 8, 5, 1, JP.blade);
    px(o + 11, 7, 1, 3, JP.gold);
  } else {
    px(o + 10, 8, 2, 2, JP.skin);
    px(o + 12, 0, 1, 8, JP.blade);
    px(o + 11, 8, 3, 1, JP.gold);
    px(o + 12, 9, 1, 2, JP.black);
  }
}

function spearman(px: Px, t: Team3, pose: Pose, frame: number, tier: number): void {
  const o = 1;
  px(o + 3, 15, 10, 2, SH);
  if (tier >= 1) flag(px, o, t);
  feet(px, o, pose, frame);
  if (tier === 0) lightBody(px, o, t);
  else armor(px, o, t);
  if (tier === 2) goldTrim(px, o);
  px(o + 6, 4, 4, 3, JP.skin);
  px(o + 9, 4, 1, 1, JP.ol);
  if (tier === 0) jingasa(px, o);
  else if (tier === 1) kabuto(px, o, false);
  else hornedKabuto(px, o);
  const thrust = pose === 'attack' && frame === 1;
  if (thrust) {
    px(o + 10, 8, 2, 1, JP.skin);
    px(o + 7, 8, 9, 1, JP.woodL);
    if (tier === 2) {
      px(o + 15, 6, 2, 3, JP.blade);
      px(o + 16, 9, 1, 1, JP.blade);
    } else px(o + 16, 7, 1, 3, JP.blade);
  } else {
    px(o + 10, 8, 2, 1, JP.skin);
    px(o + 12, 2, 1, 13, JP.woodL);
    if (tier === 2) {
      px(o + 12, 0, 2, 3, JP.blade);
      px(o + 14, 1, 1, 1, JP.blade);
    } else px(o + 12, 0, 1, 2, JP.blade);
  }
}

function swordsman(px: Px, t: Team3, pose: Pose, frame: number): void {
  const o = 1;
  px(o + 3, 15, 10, 2, SH);
  flag(px, o, t);
  feet(px, o, pose, frame);
  armor(px, o, t);
  px(o + 6, 4, 4, 3, JP.skin);
  px(o + 9, 4, 1, 1, JP.ol);
  px(o + 7, 6, 3, 1, JP.black);
  kabuto(px, o, true);
  if (pose === 'attack' && frame === 1) {
    px(o + 10, 8, 2, 2, JP.skin);
    px(o + 12, 8, 5, 1, JP.blade);
    px(o + 11, 7, 1, 3, JP.gold);
  } else {
    px(o + 10, 8, 2, 2, JP.skin);
    px(o + 12, 1, 1, 7, JP.blade);
    px(o + 11, 8, 3, 1, JP.gold);
    px(o + 12, 9, 1, 2, JP.black);
  }
}

function archer(px: Px, t: Team3, pose: Pose, frame: number, tier = 1): void {
  const o = 1;
  px(o + 3, 15, 10, 2, SH);
  px(o + 2, 5, 2, 7, JP.woodL);
  px(o + 2, 4, 1, 1, JP.plaster);
  px(o + 3, 3, 1, 2, JP.plaster);
  feet(px, o, pose, frame);
  armor(px, o, t);
  if (tier === 2) goldTrim(px, o);
  px(o + 6, 4, 4, 3, JP.skin);
  px(o + 9, 4, 1, 1, JP.ol);
  kabuto(px, o, tier === 2);
  px(o + 10, 8, 2, 1, JP.skin);
  // tall yumi bow
  px(o + 13, 1, 1, 14, JP.woodL);
  px(o + 12, 0, 1, 1, JP.woodL);
  px(o + 12, 15, 1, 1, JP.woodL);
  if (pose === 'attack' && frame === 1) {
    for (const [x, y] of [
      [12, 2],
      [11, 4],
      [10, 6],
      [9, 8],
      [10, 10],
      [11, 12],
      [12, 14],
    ])
      px(o + x, y, 1, 1, JP.plasterD);
    px(o + 9, 8, 6, 1, JP.plaster);
  } else px(o + 12, 1, 1, 14, JP.plasterD);
}

function cavalry(px: Px, t: Team3, pose: Pose, frame: number): void {
  px(2, 15, 15, 2, SH);
  // horse
  const lc = JP.woodD;
  if (pose === 'walk' && frame === 1) {
    px(3, 13, 1, 3, lc);
    px(6, 13, 1, 2, lc);
    px(11, 13, 1, 2, lc);
    px(14, 13, 1, 3, lc);
  } else {
    px(4, 13, 1, 3, lc);
    px(6, 13, 1, 3, lc);
    px(11, 13, 1, 3, lc);
    px(13, 13, 1, 3, lc);
  }
  px(2, 9, 1, 5, JP.hair);
  px(3, 9, 12, 4, JP.horse);
  px(4, 12, 10, 1, JP.woodD);
  px(12, 6, 3, 4, JP.horse);
  px(13, 4, 4, 3, JP.horse);
  px(16, 6, 1, 1, JP.ol);
  px(14, 5, 1, 1, JP.ol);
  px(13, 3, 1, 1, JP.horse);
  px(12, 4, 1, 4, JP.hair);
  px(5, 9, 6, 3, t.m);
  px(5, 9, 6, 1, t.l);
  // rider in armor with a crested helmet
  flag(px, 3, t);
  px(7, 4, 4, 5, t.d);
  px(7, 5, 4, 1, t.m);
  px(7, 7, 4, 1, t.m);
  px(8, 2, 3, 2, JP.skin);
  px(10, 2, 1, 1, JP.ol);
  px(7, 1, 5, 1, JP.black);
  px(8, 0, 3, 1, JP.black);
  px(9, 0, 1, 1, JP.gold);
  px(8, -1, 3, 1, JP.gold);
  if (pose === 'attack' && frame === 1) {
    px(9, 6, 9, 1, JP.woodL);
    px(17, 5, 1, 3, JP.blade);
  } else {
    px(12, 0, 1, 10, JP.woodL);
    px(12, 0, 1, 2, JP.blade);
  }
}

function legs4(px: Px, frame: number, x0: number, y: number): void {
  const xs = frame ? [x0, x0 + 3, x0 + 8, x0 + 11] : [x0 + 1, x0 + 3, x0 + 8, x0 + 10];
  xs.forEach((x, i) => px(x, y, 1, frame && (i === 1 || i === 2) ? 2 : 3, HORSE.bodyD));
}
/** Scout: a light rider in a straw war hat with a sword. */
function scout(px: Px, t: Team3, pose: Pose, frame: number): void {
  px(2, 15, 15, 2, SH);
  legs4(px, pose === 'walk' ? frame : 0, 3, 13);
  px(2, 9, 1, 5, HORSE.mane);
  px(3, 9, 12, 4, HORSE.body);
  px(4, 12, 10, 1, HORSE.bodyD);
  px(12, 6, 3, 4, HORSE.body);
  px(13, 4, 4, 3, HORSE.body);
  px(15, 5, 1, 2, HORSE.white);
  px(14, 5, 1, 1, JP.ol);
  px(12, 4, 1, 4, HORSE.mane);
  px(5, 9, 6, 3, t.m);
  px(5, 9, 6, 1, t.l);
  // rider
  px(7, 4, 4, 5, t.l);
  px(7, 7, 4, 1, t.d);
  px(8, 2, 3, 2, JP.skin);
  px(10, 2, 1, 1, JP.ol);
  px(6, 1, 6, 1, JP.straw);
  px(7, 0, 4, 1, JP.strawD);
  if (pose === 'attack' && frame === 1) {
    px(11, 5, 2, 1, JP.skin);
    px(12, 5, 6, 1, JP.blade);
    px(12, 4, 1, 3, JP.gold);
  } else {
    px(11, 6, 1, 2, JP.skin);
    px(12, 1, 1, 6, JP.blade);
    px(11, 6, 3, 1, JP.gold);
  }
}
/** Heavy cavalry: horse in team-colored scale armor, rider with horned helmet and naginata. */
function armored(px: Px, t: Team3, pose: Pose, frame: number): void {
  px(2, 16, 16, 2, SH);
  legs4(px, pose === 'walk' ? frame : 0, 3, 14);
  px(2, 10, 1, 5, HORSE.mane);
  px(3, 10, 12, 4, t.d);
  for (let x = 3; x < 15; x += 2) px(x, 11, 1, 1, t.l);
  for (let x = 4; x < 15; x += 2) px(x, 13, 1, 1, t.m);
  px(12, 7, 3, 4, t.d);
  px(13, 5, 4, 3, JP.gold);
  px(15, 6, 2, 2, HORSE.body);
  px(14, 6, 1, 1, JP.ol);
  px(12, 5, 1, 4, HORSE.mane);
  px(7, 5, 4, 5, t.d);
  px(7, 6, 4, 1, t.l);
  px(7, 8, 4, 1, t.m);
  px(6, 5, 1, 3, t.m);
  px(8, 3, 3, 2, JP.skin);
  px(10, 3, 1, 1, JP.ol);
  px(7, 2, 5, 1, JP.black);
  px(6, 1, 1, 2, JP.gold);
  px(11, 1, 1, 2, JP.gold);
  px(5, 0, 1, 1, JP.gold);
  px(12, 0, 1, 1, JP.gold);
  if (pose === 'attack' && frame === 1) {
    px(9, 7, 9, 1, JP.woodD);
    px(18, 6, 3, 1, JP.blade);
    px(19, 7, 2, 1, JP.blade);
  } else {
    px(14, 1, 1, 10, JP.woodD);
    px(15, 0, 1, 3, JP.blade);
  }
}

/** `tier` is the owner's age: 0 Dark, 1 Feudal, 2 Imperial. Soldiers look tougher each age. */
export function unitSprite(type: string, team: number, pose: Pose, frame: number, carry: string, tier = 0): HTMLCanvasElement {
  const t = TEAMS[team] ?? TEAMS[2];
  if (type === 'scout') return make(`u:scout:${team}:${pose}:${frame}`, 20, 18, (px) => scout(px, t, pose, frame));
  if (type === 'cavalry' && tier >= 2) return make(`u:hcav:${team}:${pose}:${frame}`, 22, 19, (px) => armored(px, t, pose, frame));
  if (type === 'cavalry') return make(`u:cav:${team}:${pose}:${frame}`, 20, 18, (px) => cavalry(px, t, pose, frame));
  const k = type === 'villager' ? 0 : tier;
  return make(`u:${type}:${team}:${pose}:${frame}:${carry}:${k}`, 18, 18, (px) => {
    if (type === 'villager') villager(px, t, pose, frame, carry);
    else if (type === 'swordsman') (k === 0 ? militia : k === 1 ? swordsman : champion)(px, t, pose, frame);
    else if (type === 'spearman') spearman(px, t, pose, frame, k);
    else archer(px, t, pose, frame, Math.max(1, k));
  });
}

export function corpseSprite(type: string, team: number): HTMLCanvasElement {
  const t = TEAMS[team] ?? TEAMS[2];
  const horse = type === 'cavalry' || type === 'scout';
  return make(`c:${type}:${team}`, horse ? 20 : 18, 18, (px) => {
    if (horse) {
      px(2, 12, 13, 3, JP.horse);
      px(14, 12, 3, 2, JP.horse);
      px(5, 10, 6, 2, t.d);
    } else {
      px(3, 13, 9, 3, type === 'villager' ? t.m : t.d);
      px(12, 13, 3, 3, JP.skin);
      if (type === 'villager') px(13, 11, 4, 1, JP.straw);
    }
  });
}

// ---------- nature ----------

export function treeSprite(variant: number): HTMLCanvasElement {
  // 0-1 cherry blossom, 2 pine, 3 bamboo
  return make(`t:${variant}`, 20, 26, (px) => {
    px(3, 23, 14, 3, SH);
    if (variant <= 1) {
      px(9, 15, 2, 9, JP.woodD);
      px(7, 13, 2, 3, JP.woodD);
      px(11, 12, 2, 3, JP.woodD);
      disc(px, 10, 10, 8, JP.pinkD);
      disc(px, variant ? 8.5 : 11, 8.5, 6, JP.pink);
      disc(px, variant ? 7 : 9, 6.5, 2.6, JP.pinkL);
      for (const [x, y] of [
        [4, 12],
        [15, 7],
        [13, 13],
        [6, 5],
        [11, 3],
      ])
        px(x, y, 1, 1, '#ffffff');
    } else if (variant === 2) {
      px(9, 12, 2, 12, JP.woodD);
      px(10, 10, 3, 2, JP.woodD);
      px(6, 15, 3, 1, JP.woodD);
      for (const [cx, cy, w] of [
        [10, 4, 6],
        [7, 9, 7],
        [13, 13, 6],
        [5, 16, 5],
      ]) {
        px(cx - w, cy, w * 2, 3, JP.leafD);
        px(cx - w + 1, cy - 1, w * 2 - 2, 1, JP.leaf);
        px(cx - w + 2, cy, w * 2 - 5, 1, JP.leaf);
      }
    } else {
      for (const [x, top] of [
        [5, 3],
        [9, 0],
        [13, 4],
        [16, 8],
      ]) {
        px(x, top, 2, 24 - top, JP.bamboo);
        for (let y = top + 4; y < 23; y += 5) px(x, y, 2, 1, JP.bambooD);
        px(x + 2, top + 3, 3, 1, JP.leaf);
        px(x - 3, top + 7, 3, 1, JP.leaf);
      }
    }
  });
}

/** Persimmon tree: the food source that replaces berry bushes. */
export function berrySprite(level: number): HTMLCanvasElement {
  return make(`p:${level}`, 20, 22, (px) => {
    px(3, 19, 14, 3, SH);
    px(9, 13, 2, 7, JP.woodD);
    disc(px, 10, 9, 7, JP.leafD);
    disc(px, 9, 8, 5, JP.leaf);
    const spots = [
      [5, 9],
      [12, 5],
      [13, 11],
      [8, 13],
      [7, 4],
      [10, 8],
      [4, 6],
      [14, 8],
    ];
    for (let i = 0; i < level; i++) {
      const [x, y] = spots[i];
      px(x, y, 2, 2, JP.persim);
      px(x, y, 1, 1, '#ffb36b');
    }
  });
}

/** Petals and pebbles sprinkled over the grass. */
export const GROUND_SPECKS = [JP.pink, JP.pinkL, JP.pinkD];
