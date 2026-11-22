// One match: owns the world, the enemy AI, the camera, input and the HUD.

import type { MatchResults } from './stats';
import { Audio } from './audio';
import { AGES, BUILDINGS, MAP, MARKET, RESOURCES, OPENINGS, RENDER, SIM, TOWER_UPGRADE, UNITS, costText, unitStats, type BuildingType, type Cost, type DifficultyKey, type ResKind, type UnitType, MUSIC_MOOD } from './config';
import { buildingPos, buildTerrain, drawMinimap, drawWorld, Effects, type Camera, type Ghost } from './render/renderer';
import { buildingSprite, iconFor } from './render/sprites';
import { createBot, updateBot, type Bot } from './sim/bot';
import { createMatch, type MapKind } from './sim/map';
import {
  ENEMY,
  NATURE,
  PLAYER,
  T,
  World,
  canPlace,
  cancelTrain,
  distToEntity,
  entityAt,
  isSoldier,
  orderMove,
  buyResource,
  canAfford,
  cancelResearch,
  garrisoned,
  lineTiles,
  MAX_WALL,
  orderFormation,
  placeBuilding,
  deleteOwn,
  placeWallLine,
  researchInfo,
  setGateLocked,
  shortOf,
  startResearch,
  tradeIncome,
  ungarrison,
  type ResearchKey,
  queueOrder,
  setOrder,
  smartOrder,
  step,
  train,
  visibleTo,
  type Entity,
} from './sim/world';

type Mode = { kind: 'none' } | { kind: 'place'; type: BuildingType } | { kind: 'wall'; type: BuildingType; start: { tx: number; ty: number } | null } | { kind: 'attackMove' };

interface Cmd {
  key: string;
  icon: string;
  label: string;
  status?: string; // short state shown under the icon, e.g. On / Off
  cost?: Cost;
  locked?: boolean; // needs a later age
  enabled: boolean;
  active?: boolean;
  tip: string;
  run: () => void;
}

const $ = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;

const TIPS: Record<string, string> = {
  house: '+5 population.',
  farm: 'Renewable food: one villager works it for 300 food, then it replants itself for 40 wood. Units can walk over it.',
  storehouse: 'Drop-off for food and wood. Build it next to trees or berries to cut walking time.',
  barracks: 'Trains the sword and spear lines, and Archers from the Feudal Age.',
  stable: 'Trains Cavalry and Scouts.',
  market: 'Trade earns gold over time. Buy food, wood and stone with gold, and hire merchants for more trade.',
  wall: 'Cheap wooden wall that keeps enemies out.',
  gate: 'Wooden gate: your units walk through, enemies do not. Can be locked.',
  stoneWall: 'Strong stone wall.',
  stoneGate: 'Strong stone gate: your units walk through, enemies do not. Can be locked.',
  watchTower: 'Sees far to warn you of attacks. Can be upgraded in the Feudal Age.',
  guardTower: 'Shoots arrows and holds 5 troops; each archer inside adds an arrow.',
  spearman: 'Cheap and deadly against horses. Weak to swords and arrows.',
  villager: 'Gathers food and wood, and builds.',
  swordsman: 'Solid frontline that beats spearmen and wrecks buildings.',
  archer: 'Good against most things from range. Weak up close and against heavy armor.',
  cavalry: 'Fast and a bit stronger than swordsmen. Runs down archers. Fears spears.',
  scout: 'Very fast and sees far. Weak arrows from 3 tiles. Explores without picking fights.',
};

function icon(type: string, team: number, size: number, tier = 0): HTMLCanvasElement {
  const src = iconFor(type, team, tier);
  const c = document.createElement('canvas');
  const s = Math.max(src.width, src.height);
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, Math.floor((s - src.width) / 2), Math.floor((s - src.height) / 2));
  c.style.width = c.style.height = `calc(${size}px * var(--s))`;
  return c;
}

/** "50F 20W" style cost for small buttons. */
function shortCost(c: Cost): string {
  const letter: Record<string, string> = { food: 'F', wood: 'W', gold: 'G', stone: 'S' };
  return Object.entries(c)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${v}${letter[k]}`)
    .join(' ');
}

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface GameOptions {
  difficulty: DifficultyKey;
  seed: number;
  attract?: boolean; // menu background: two AIs play, no fog, no input
  map?: MapKind;
}

export class Game {
  world: World;
  bot: Bot;
  playerBot: Bot | null = null;
  cam: Camera = { x: 0, y: 0, zoom: 1 };
  fx = new Effects();
  terrain: HTMLCanvasElement;
  selected: Entity[] = [];
  groups = new Map<number, number[]>();
  mode: Mode = { kind: 'none' };
  paused = false;
  over = false;
  attract: boolean;
  difficulty: DifficultyKey;
  onGameOver: ((won: boolean) => void) | null = null;

  private acc = 0;
  private mouse = { x: 320, y: 180, inside: false, onCanvas: false };
  private drag: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private hoverId = 0;
  private lastClick = { t: 0, id: 0 };
  private hudT = 0;
  private miniT = 0;
  private cmdKey = '-';
  private cmds: Cmd[] = [];
  private lastGroupKey = { n: -1, t: 0 };
  private drift = { a: 0 };
  private cleanup: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private audio: Audio,
    opts: GameOptions,
  ) {
    this.attract = !!opts.attract;
    this.difficulty = opts.difficulty;
    const m = createMatch(opts.seed, { map: opts.map ?? 'rivers' });
    this.world = m.world;
    this.bot = createBot(this.world, ENEMY, opts.difficulty);
    if (this.attract) this.playerBot = createBot(this.world, PLAYER, 'hard');
    this.terrain = buildTerrain(this.world);
    this.centerOn(m.playerTC.x, m.playerTC.y + 24);
    if (this.attract) {
      this.cam.x = 200;
      this.cam.y = 160;
    } else {
      this.bindInput();
      this.selected = [];
      $('toast').innerHTML = '';
      $('cmds').innerHTML = '';
      $('tooltip').classList.add('hidden');
    }
  }

  destroy(): void {
    for (const f of this.cleanup) f();
    this.cleanup = [];
  }

  // ---------- camera ----------

  private get viewH(): number {
    return RENDER.height / this.cam.zoom;
  }

  centerOn(x: number, y: number): void {
    this.cam.x = x - RENDER.width / this.cam.zoom / 2;
    this.cam.y = y - this.viewH / 2 + (RENDER.hudBottom - RENDER.hudTop) / 2 / this.cam.zoom;
    this.clampCam();
  }

  private clampCam(): void {
    const z = this.cam.zoom;
    const m = MAP.cameraMargin; // a little room to look past the edge of the map
    const maxX = this.world.w * T - RENDER.width / z + m;
    const minY = -RENDER.hudTop / z - m;
    const maxY = this.world.h * T - (RENDER.height - RENDER.hudBottom) / z + m;
    this.cam.x = Math.max(-m, Math.min(maxX, this.cam.x));
    this.cam.y = Math.max(minY, Math.min(maxY, this.cam.y));
  }

  private toWorld(ix: number, iy: number): { x: number; y: number } {
    return { x: this.cam.x + ix / this.cam.zoom, y: this.cam.y + iy / this.cam.zoom };
  }

  private toInternal(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * RENDER.width, y: ((clientY - r.top) / r.height) * RENDER.height };
  }

  private onScreen(x: number, y: number): boolean {
    return x >= this.cam.x && x <= this.cam.x + RENDER.width / this.cam.zoom && y >= this.cam.y && y <= this.cam.y + this.viewH;
  }

  // ---------- per-frame ----------

  update(dt: number): void {
    const w = this.world;
    if (this.attract) {
      this.drift.a += dt * 0.05;
      this.cam.x = 192 + Math.sin(this.drift.a) * 180;
      this.cam.y = 300 + Math.sin(this.drift.a * 0.7) * 260;
      this.clampCam();
    } else this.scrollCamera(dt);

    if (!this.paused && !this.over) {
      this.acc += Math.min(dt, 0.25);
      const stepDt = 1 / SIM.tickHz;
      while (this.acc >= stepDt) {
        this.acc -= stepDt;
        updateBot(w, this.bot, stepDt);
        if (this.playerBot) updateBot(w, this.playerBot, stepDt);
        step(w, stepDt);
      }
      this.fx.update(dt);
    }
    this.handleEvents();
    this.updateMood();
    if (this.attract && w.winner !== null) return;

    this.selected = this.selected.filter((e) => !e.dead);
    if (!this.attract) {
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.2;
        this.renderHud();
      }
      this.miniT -= dt;
      if (this.miniT <= 0) {
        this.miniT = 0.15;
        const mm = $<HTMLCanvasElement>('minimap');
        drawMinimap(mm.getContext('2d')!, w, this.cam, true);
      }
    }
  }

  private scrollCamera(dt: number): void {
    const sp = (420 / this.cam.zoom) * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (this.mouse.inside && !this.drag && document.hasFocus()) {
      const m = 3;
      if (this.mouse.x <= m) dx -= 1;
      if (this.mouse.x >= RENDER.width - m) dx += 1;
      if (this.mouse.y <= m) dy -= 1;
      if (this.mouse.y >= RENDER.height - m) dy += 1;
    }
    if (dx || dy) {
      this.cam.x += Math.sign(dx) * sp;
      this.cam.y += Math.sign(dy) * sp;
      this.clampCam();
    }
  }

  private handleEvents(): void {
    const w = this.world;
    const evs = w.events.splice(0);
    for (const ev of evs) {
      this.fx.consume(ev, (x, y) => {
        const u = w.units.find((q) => Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1);
        return u ? u.facing : 1;
      });
      if (this.attract) continue;
      switch (ev.t) {
        case 'hit': {
          const tx = Math.floor(ev.x / T);
          const ty = Math.floor(ev.y / T);
          const seen = w.inBounds(tx, ty) && w.vis[PLAYER][ty * w.w + tx] === 1;
          if (this.onScreen(ev.x, ev.y) && seen) this.audio.play(ev.ranged ? 'arrow' : 'hit');
          if (seen && this.isBattleHit(ev.team, ev.x, ev.y)) this.combatHits.push(w.time);
          break;
        }
        case 'death': {
          const tx = Math.floor(ev.x / T);
          const ty = Math.floor(ev.y / T);
          if (ev.kind !== 'resource' && this.onScreen(ev.x, ev.y) && w.inBounds(tx, ty) && w.vis[PLAYER][ty * w.w + tx]) this.audio.play('death');
          if (ev.kind === 'building' && ev.team === PLAYER && !ev.deleted) this.toast(`Your ${BUILDINGS[ev.type as BuildingType].name} was destroyed!`, true);
          break;
        }
        case 'built':
          if (ev.team === PLAYER) {
            this.audio.play('built');
            this.toast(`${BUILDINGS[ev.type as BuildingType].name} finished.`);
          }
          break;
        case 'trained':
          if (ev.team === PLAYER) this.audio.play('trained');
          break;
        case 'placed':
          if (ev.team === PLAYER) this.audio.play('place');
          break;
        case 'underAttack':
          if (ev.team === PLAYER && !this.onScreen(ev.x, ev.y)) {
            this.audio.play('alert');
            this.toast('You are under attack! (Space jumps there)', true);
            this.alertAt = { x: ev.x, y: ev.y, t: w.time };
          }
          break;
        case 'aged':
          if (ev.team === PLAYER) {
            this.audio.play('victory');
            this.toast(`You have reached the ${AGES[ev.age].name}! Your soldiers grow stronger.`);
          } else this.toast(`The enemy has reached the ${AGES[ev.age].name}.`, true);
          this.cmdKey = '-';
          break;
        case 'researched':
          if (ev.team === PLAYER && ev.key !== 'age') {
            this.audio.play('built');
            this.toast(ev.key === 'merchant' ? 'A merchant joins your market.' : 'Guard tower ready.');
          }
          break;
        case 'cantRepair':
          if (ev.team === PLAYER) this.toast(`Repair stopped: not enough ${ev.kind}.`, true);
          break;
        case 'housed':
          if (ev.team === PLAYER) {
            this.audio.play('error');
            this.toast('Population cap reached. Build a House.', true);
          }
          break;
        case 'gameOver':
          this.over = true;
          this.audio.setMood('off');
          this.audio.play(ev.winner === PLAYER ? 'victory' : 'defeat');
          this.onGameOver?.(ev.winner === PLAYER);
          break;
      }
    }
  }

  private alertAt: { x: number; y: number; t: number } | null = null;

  // ---------- music mood ----------
  private combatHits: number[] = [];
  private lastBattleAt = -999;

  /** A hit that is part of a fight between the two sides (not a villager hunting a sheep). */
  private isBattleHit(attacker: number, x: number, y: number): boolean {
    if (attacker === ENEMY) return true; // the enemy only ever hits your things
    if (attacker !== PLAYER) return false;
    const w = this.world;
    for (const u of w.units) if (u.team === ENEMY && Math.abs(u.x - x) < 6 && Math.abs(u.y - y) < 6) return true;
    for (const b of w.buildings) if (b.team === ENEMY && Math.abs(b.x - x) < 40 && Math.abs(b.y - y) < 40) return true;
    return false;
  }

  /** Battle music while a real fight is on (several hits in a few seconds), calm again after a quiet spell. */
  private updateMood(): void {
    if (this.attract || this.over) return;
    const t = this.world.time;
    while (this.combatHits.length && this.combatHits[0] < t - MUSIC_MOOD.window) this.combatHits.shift();
    if (this.combatHits.length >= MUSIC_MOOD.hits) this.lastBattleAt = t;
    const want = t - this.lastBattleAt < MUSIC_MOOD.calmAfter ? 'battle' : 'calm';
    if (this.audio.mood !== want) this.audio.setMood(want);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const g1 = this.ghost();
    const ghosts = g1 ? [g1] : this.wallGhosts();
    const rallyFor = this.selected.length >= 1 && this.selected[0].kind === 'building' && this.selected[0].team === PLAYER ? this.selected[0] : null;
    drawWorld(ctx, this.world, this.terrain, this.cam, this.fx, {
      selected: new Set(this.selected.map((e) => e.id)),
      hoverId: this.hoverId,
      ghosts,
      rallyFor,
      fog: !this.attract,
      time: this.world.time,
    });
    if (this.drag) {
      const x0 = Math.min(this.drag.x, this.mouse.x);
      const y0 = Math.min(this.drag.y, this.mouse.y);
      const x1 = Math.max(this.drag.x, this.mouse.x);
      const y1 = Math.max(this.drag.y, this.mouse.y);
      if (x1 - x0 > 2 || y1 - y0 > 2) {
        ctx.strokeStyle = '#a7f070';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
      }
    }
    this.canvas.style.cursor = this.mode.kind === 'attackMove' ? 'crosshair' : this.hoverIsEnemy() ? 'crosshair' : 'default';
  }

  private hoverIsEnemy(): boolean {
    const e = this.hoverId ? this.world.get(this.hoverId) : undefined;
    return !!e && e.team === ENEMY && this.selected.some((s) => s.team === PLAYER && s.kind === 'unit');
  }

  private ghost(): Ghost | null {
    if (this.mode.kind !== 'place' || !this.mouse.onCanvas) return null;
    const p = this.toWorld(this.mouse.x, this.mouse.y);
    const size = BUILDINGS[this.mode.type].size;
    const tx = Math.round(p.x / T - size / 2);
    const ty = Math.round(p.y / T - size / 2);
    return { type: this.mode.type, tx, ty, ok: canPlace(this.world, PLAYER, this.mode.type, tx, ty) === 'ok' };
  }

  /** Wall placement preview: the tile under the mouse, or the whole line once a start is set. */
  private wallGhosts(): Ghost[] {
    if (this.mode.kind !== 'wall' || !this.mouse.onCanvas) return [];
    const p = this.toWorld(this.mouse.x, this.mouse.y);
    const end = { tx: Math.floor(p.x / T), ty: Math.floor(p.y / T) };
    const start = this.mode.start ?? end;
    const type = this.mode.type;
    const tiles = lineTiles(start.tx, start.ty, end.tx, end.ty).slice(0, MAX_WALL);
    const team = this.world.teams[PLAYER];
    const cost = BUILDINGS[type].cost;
    let budget = Math.min(...(Object.entries(cost) as [keyof typeof team, number][]).map(([k, v]) => Math.floor((team[k] as number) / v)));
    return tiles.map((t) => {
      const ok = canPlace(this.world, PLAYER, type, t.x, t.y) === 'ok' && budget > 0;
      if (ok) budget--;
      return { type, tx: t.x, ty: t.y, ok };
    });
  }

  // ---------- selection & commands ----------

  private mySel(): Entity[] {
    return this.selected.filter((e) => e.team === PLAYER);
  }

  private select(list: Entity[], sound = true): void {
    this.selected = list;
    this.mode = { kind: 'none' };
    this.hudT = 0;
    if (sound && list.length) this.audio.play('select');
  }

  private buildPage: 0 | 1 = 0; // villager build menu: 0 economy and army, 1 defenses

  private commands(): Cmd[] {
    const w = this.world;
    const sel = this.mySel();
    const team = w.teams[PLAYER];
    const out: Cmd[] = [];
    if (sel.length === 0) return out;
    const vills = sel.filter((e) => e.type === 'villager');
    const soldiers = sel.filter(isSoldier);
    const keys = ['Z', 'X', 'C', 'V', 'B', 'N'];
    const lockedTip = (age: number): string => `Needs the ${AGES[age].name}.`;
    if (vills.length) {
      const pages: BuildingType[][] = [
        ['house', 'farm', 'storehouse', 'barracks', 'stable', 'market'],
        ['wall', 'gate', 'watchTower', 'stoneWall', 'stoneGate', 'guardTower'],
      ];
      pages[this.buildPage].forEach((b, i) => {
        const s = BUILDINGS[b];
        const ageOk = team.age >= s.age;
        out.push({
          key: keys[i],
          icon: b,
          label: s.name,
          cost: s.cost,
          enabled: ageOk && canAfford(w, PLAYER, s.cost),
          locked: !ageOk,
          active: (this.mode.kind === 'place' || this.mode.kind === 'wall') && this.mode.type === b,
          tip: (ageOk ? '' : lockedTip(s.age) + ' ') + TIPS[b] + (s.wall && !s.gate ? ' Click a start tile, then an end tile.' : ''),
          run: () => {
            if (!ageOk) {
              this.audio.play('error');
              this.toast(`${s.name}: ${lockedTip(s.age)}`);
              return;
            }
            const short = shortOf(w, PLAYER, s.cost);
            if (short) {
              this.audio.play('error');
              this.toast(`Not enough ${short} (${costText(s.cost)}).`);
              return;
            }
            this.mode = s.wall && !s.gate ? { kind: 'wall', type: b, start: null } : { kind: 'place', type: b };
            this.audio.play('click');
          },
        });
      });
      out.push({
        key: 'F',
        icon: this.buildPage === 0 ? 'wall' : 'house',
        label: this.buildPage === 0 ? 'Walls' : 'Build',
        enabled: true,
        tip: this.buildPage === 0 ? 'Walls, gates and towers.' : 'Houses, storehouses, barracks, stable and market.',
        run: () => {
          this.buildPage = this.buildPage === 0 ? 1 : 0;
          this.mode = { kind: 'none' };
          this.audio.play('click');
        },
      });
    } else if (soldiers.length) {
      const current = soldiers.every((u) => u.formation === soldiers[0].formation) ? soldiers[0].formation : null;
      const forms: [string, 'line' | 'block' | 'box', string, string][] = [
        ['Z', 'line', 'Line', 'One wide row, side by side. Archers stand behind when there are many.'],
        ['X', 'block', 'Block', 'A tight rectangle: fighters in front, archers at the back.'],
        ['C', 'box', 'Box', 'A hollow square: fighters on the outside, archers protected inside.'],
      ];
      for (const [key, f, label, tip] of forms) {
        out.push({
          key,
          icon: `form-${f}`,
          label,
          enabled: true,
          active: current === f,
          tip: `${tip} They keep it when they move, marching at the slowest unit's pace. Press again to break formation.`,
          run: () => {
            if (current === f) {
              for (const u of soldiers) u.formation = null;
              this.toast('Formation off.');
            } else orderFormation(this.world, soldiers, f);
            this.audio.play('command');
          },
        });
      }
      const allHostile = soldiers.every((u) => u.hostile);
      out.push({
        key: 'V',
        icon: allHostile ? 'hostile-on' : 'hostile-off',
        label: 'Hostile',
        status: allHostile ? 'on' : 'off',
        enabled: true,
        active: allHostile,
        tip: 'On: they go after any enemy they can see, even while marching. Off: they ignore enemies unless attacked, so you can retreat.',
        run: () => {
          const on = !allHostile;
          for (const u of soldiers) u.hostile = on;
          this.toast(on ? 'Hostile: they will attack any enemy in sight.' : 'Hostile off: they only fight back when attacked.');
          this.audio.play('command');
        },
      });
      out.push({
        key: 'B',
        icon: 'standdown',
        label: 'Stand down',
        enabled: true,
        tip: 'Stop everything, drop their orders, and turn Hostile off. They stay put and only fight back if attacked.',
        run: () => {
          for (const s of soldiers) {
            s.pending.length = 0;
            s.hostile = false;
            setOrder(s, { type: 'idle' });
          }
          this.toast('Standing down.');
          this.audio.play('command');
        },
      });
    } else if (sel.length >= 1 && sel.every((b) => b.kind === 'building' && b.type === sel[0].type)) {
      const ready = sel.filter((b) => b.progress >= 1);
      if (ready.length === 0) return out;
      const type = sel[0].type as BuildingType;
      const busy = ready.every((b) => b.research);
      // training: one click trains one in every selected building
      BUILDINGS[type].trains.forEach((u, i) => {
        const st = unitStats(u, team.age);
        const avail = team.age >= UNITS[u].age;
        out.push({
          key: keys[i],
          icon: u,
          label: avail ? st.name : UNITS[u].tiers[UNITS[u].age].name,
          cost: UNITS[u].cost,
          enabled: avail && !busy && canAfford(w, PLAYER, UNITS[u].cost) && ready.some((b) => b.queue.length < 5),
          locked: !avail,
          tip: (avail ? '' : lockedTip(UNITS[u].age) + ' ') + (TIPS[u] ?? '') + (ready.length > 1 ? ` Trains one in each of your ${ready.length} selected buildings.` : ''),
          run: () => (avail ? this.trainAt(ready, u) : (this.audio.play('error'), this.toast(lockedTip(UNITS[u].age)))),
        });
      });
      const k0 = BUILDINGS[type].trains.length;
      // Town Center: advance to the next age
      if (type === 'townCenter' && team.age < 2) {
        const next = AGES[team.age + 1];
        const researching = w.buildings.some((b) => b.team === PLAYER && b.research?.key === 'age');
        out.push({
          key: keys[k0],
          icon: team.age === 0 ? 'age-feudal' : 'age-imperial',
          label: team.age === 0 ? 'Feudal Age' : 'Imperial Age',
          cost: next.cost,
          enabled: !researching && canAfford(w, PLAYER, next.cost),
          active: researching,
          tip: `Advance to the ${next.name} (${next.sec} s). ${team.age === 0 ? 'Unlocks Archers, the Stable, the Market, stone walls and guard towers. Soldiers get stronger.' : 'Champions, Halberdiers, Longbowmen and Knights.'}`,
          run: () => this.research(ready[0], 'age'),
        });
      }
      if (type === 'market') {
        (['food', 'wood', 'stone'] as const).forEach((kind, i) => {
          out.push({
            key: keys[i],
            icon: `buy-${kind}`,
            label: `Buy ${kind}`,
            cost: { gold: MARKET.buy[kind] },
            enabled: team.gold >= MARKET.buy[kind],
            tip: `Trade ${MARKET.buy[kind]} gold for ${MARKET.lot} ${kind}.`,
            run: () => {
              if (buyResource(w, PLAYER, kind)) this.audio.play('click');
              else {
                this.audio.play('error');
                this.toast('Not enough gold.');
              }
            },
          });
        });
        out.push({
          key: 'V',
          icon: 'merchant',
          label: `Merchant ${team.merchants}/${MARKET.maxMerchants}`,
          cost: MARKET.merchantCost,
          enabled: team.merchants < MARKET.maxMerchants && !ready.some((b) => b.research) && canAfford(w, PLAYER, MARKET.merchantCost),
          active: ready.some((b) => b.research?.key === 'merchant'),
          tip: `Hire a merchant: +${MARKET.merchantPerSec} gold per second from trade. Up to ${MARKET.maxMerchants}.`,
          run: () => this.research(ready[0], 'merchant'),
        });
      }
      if (BUILDINGS[type].gate) {
        const locked = ready.every((b) => b.locked);
        out.push({
          key: 'Z',
          icon: locked ? 'gate-locked' : 'gate-open',
          label: locked ? 'Unlock' : 'Lock',
          enabled: true,
          active: locked,
          tip: locked ? 'Unlock: your own units can pass through again.' : 'Lock: nobody gets through, not even your own units.',
          run: () => {
            for (const b of ready) setGateLocked(w, b, !locked);
            this.audio.play('command');
          },
        });
      }
      if (type === 'farm') {
        const auto = ready.every((b) => !b.noReplant);
        out.push({
          key: 'Z',
          icon: 'farm',
          label: 'Replant',
          status: auto ? 'on' : 'off',
          enabled: true,
          active: auto,
          tip: auto ? 'On: when it runs dry it replants itself for 40 wood. Press to turn it off; the paddy then disappears when empty.' : 'Off: it disappears when empty. Press to turn automatic replanting back on (40 wood each time).',
          run: () => {
            for (const b of ready) b.noReplant = auto;
            this.toast(auto ? 'Auto-replant off.' : 'Auto-replant on.');
            this.audio.play('command');
          },
        });
      }
      if (type === 'watchTower') {
        out.push({
          key: 'Z',
          icon: 'guardTower',
          label: 'Upgrade',
          cost: TOWER_UPGRADE.cost,
          locked: team.age < 1,
          enabled: team.age >= 1 && !ready[0].research && canAfford(w, PLAYER, TOWER_UPGRADE.cost),
          active: !!ready[0].research,
          tip: (team.age < 1 ? lockedTip(1) + ' ' : '') + 'Turn it into a stone guard tower that shoots arrows and holds 5 troops.',
          run: () => this.research(ready[0], 'towerUpgrade'),
        });
      }
      if (BUILDINGS[type].garrison > 0) {
        const n = ready.reduce((a, b) => a + garrisoned(w, b).length, 0);
        out.push({
          key: 'X',
          icon: 'standdown',
          label: 'Let out',
          status: `${n}`,
          enabled: n > 0,
          tip: 'Everyone inside comes out. To send troops in, select them and right-click the tower.',
          run: () => {
            for (const b of ready) ungarrison(w, b);
            this.audio.play('command');
          },
        });
      }
    }
    return out;
  }

  private research(b: Entity, key: ResearchKey): void {
    if (b.research && b.research.key === key) {
      cancelResearch(this.world, b);
      this.toast('Cancelled.');
      this.audio.play('click');
      return;
    }
    const r = startResearch(this.world, b, key);
    if (r === 'ok') this.audio.play('click');
    else {
      this.audio.play('error');
      const info = researchInfo(this.world, b, key);
      this.toast(r === 'cost' && info ? `Not enough ${shortOf(this.world, PLAYER, info.cost)} (${costText(info.cost)}).` : r === 'busy' ? 'Already busy.' : 'Not available.');
    }
  }

  private trainAt(list: Entity[], u: UnitType): void {
    // shortest queues first, so one click spreads across all selected buildings
    let r: ReturnType<typeof train> = 'cannot';
    let any = false;
    for (const b of [...list].sort((a, c) => a.queue.length - c.queue.length)) {
      r = train(this.world, b, u);
      if (r === 'ok') any = true;
      else if (r === 'cost') break;
    }
    if (any) this.audio.play('click');
    else {
      this.audio.play('error');
      const c = UNITS[u].cost;
      this.toast(r === 'cost' ? `Not enough ${shortOf(this.world, PLAYER, c)} (${costText(c)}).` : r === 'queue' ? 'The queue is full.' : r === 'busy' ? 'Busy researching.' : r === 'age' ? 'Not available in this age.' : 'Cannot train that here.');
    }
    this.hudT = 0;
  }

  private nextIdleVillager(): void {
    const idle = this.world.units.filter((u) => u.team === PLAYER && u.type === 'villager' && u.order.type === 'idle');
    if (!idle.length) {
      this.audio.play('error');
      return;
    }
    const cur = this.selected.length === 1 ? idle.indexOf(this.selected[0]) : -1;
    const v = idle[(cur + 1) % idle.length];
    this.select([v]);
    this.centerOn(v.x, v.y);
  }

  // ---------- input ----------

  private bindInput(): void {
    const c = this.canvas;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
      t.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };

    on(window, 'mousemove', (e) => {
      const p = this.toInternal(e.clientX, e.clientY);
      this.mouse.x = Math.max(0, Math.min(RENDER.width, p.x));
      this.mouse.y = Math.max(0, Math.min(RENDER.height, p.y));
      const r = c.getBoundingClientRect();
      this.mouse.inside = e.clientX >= r.left - 2 && e.clientX <= r.right + 2 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2;
      this.mouse.onCanvas = e.target === c;
      if (this.mouse.onCanvas) {
        const wp = this.toWorld(this.mouse.x, this.mouse.y);
        const h = this.pickAt(wp.x, wp.y);
        this.hoverId = h ? h.id : 0;
      } else this.hoverId = 0;
    });
    on(document.documentElement, 'mouseleave', () => {
      this.mouse.inside = false;
    });

    on(c, 'mousedown', (e) => {
      this.audio.unlock();
      if (this.paused || this.over) return;
      const p = this.toInternal(e.clientX, e.clientY);
      const wp = this.toWorld(p.x, p.y);
      if (e.button === 0) {
        if (this.mode.kind === 'wall') {
          this.wallClick(wp.x, wp.y, e.shiftKey);
          return;
        }
        if (this.mode.kind === 'place') {
          this.tryPlace(e.shiftKey);
          return;
        }
        if (this.mode.kind === 'attackMove') {
          const units = this.mySel().filter((u) => u.kind === 'unit');
          for (const u of units) u.pending.length = 0;
          orderMove(this.world, units, wp.x, wp.y, true);
          this.fx.marker(wp.x, wp.y, true);
          this.audio.play('command');
          this.mode = { kind: 'none' };
          return;
        }
        this.drag = { x: p.x, y: p.y };
      } else if (e.button === 2) {
        if (this.mode.kind !== 'none') {
          this.mode = { kind: 'none' };
          return;
        }
        this.rightClick(wp.x, wp.y, e.shiftKey);
      }
    });
    on(window, 'mouseup', (e) => {
      if (e.button !== 0 || !this.drag) return;
      const d = this.drag;
      this.drag = null;
      const p = this.toInternal(e.clientX, e.clientY);
      if (Math.abs(p.x - d.x) > 3 || Math.abs(p.y - d.y) > 3) this.boxSelect(d, p, e.shiftKey);
      else this.clickSelect(p, e.shiftKey);
    });
    on(c, 'contextmenu', (e) => e.preventDefault());
    on(document.getElementById('panel')!, 'contextmenu', (e) => e.preventDefault());
    on(
      c,
      'wheel',
      (e) => {
        e.preventDefault();
        const nz = e.deltaY < 0 ? 2 : 1;
        if (nz === this.cam.zoom) return;
        const before = this.toWorld(this.mouse.x, this.mouse.y);
        this.cam.zoom = nz;
        this.cam.x = before.x - this.mouse.x / nz;
        this.cam.y = before.y - this.mouse.y / nz;
        this.clampCam();
      },
      { passive: false },
    );

    on(window, 'keydown', (e) => this.keyDown(e));
    on(window, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => this.keys.clear());

    // minimap
    const mm = $<HTMLCanvasElement>('minimap');
    let mmDrag = false;
    const mmPoint = (e: MouseEvent): { x: number; y: number } => {
      const r = mm.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * this.world.w * T, y: ((e.clientY - r.top) / r.height) * this.world.h * T };
    };
    on(mm, 'mousedown', (e) => {
      this.audio.unlock();
      const p = mmPoint(e);
      if (e.button === 0) {
        mmDrag = true;
        this.centerOn(p.x, p.y);
      } else if (e.button === 2) this.rightClick(p.x, p.y, e.shiftKey);
    });
    on(window, 'mousemove', (e) => {
      if (mmDrag) {
        const p = mmPoint(e);
        this.centerOn(p.x, p.y);
      }
    });
    on(window, 'mouseup', () => (mmDrag = false));
    on(mm, 'contextmenu', (e) => e.preventDefault());

    // command buttons
    on($('cmds'), 'mousedown', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || e.button !== 0) return;
      e.preventDefault();
      const cmd = this.cmds[Number(b.dataset.i)];
      cmd?.run();
      this.cmdKey = '-';
      this.hudT = 0;
    });
    on($('cmds'), 'mouseover', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      const cmd = b ? this.cmds[Number(b.dataset.i)] : null;
      this.showTip(cmd, b);
    });
    on($('cmds'), 'mouseout', () => this.showTip(null, null));
    on($('info'), 'mousedown', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      e.preventDefault();
      if (b.dataset.q !== undefined) {
        const bld = this.selected[0];
        if (bld) {
          cancelTrain(this.world, bld, Number(b.dataset.q));
          this.audio.play('click');
        }
      } else if (b.dataset.u !== undefined) {
        const u = this.world.get(Number(b.dataset.u));
        if (u) this.select(e.shiftKey ? this.selected.filter((s) => s !== u) : [u]);
      }
      this.hudT = 0;
    });
    on($('idle-btn'), 'click', () => this.nextIdleVillager());
  }

  private showTip(cmd: Cmd | null, el: HTMLElement | null): void {
    const tip = $('tooltip');
    if (!cmd || !el) {
      tip.classList.add('hidden');
      return;
    }
    const cost = cmd.cost ? costText(cmd.cost) : '';
    tip.innerHTML = `<div class="t">${cmd.label} (${cmd.key})</div>${cost ? `<div class="dim">${cost}</div>` : ''}<div>${cmd.tip}</div>`;
    tip.classList.remove('hidden');
    const stage = $('stage').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    tip.style.left = `${r.left - stage.left}px`;
    tip.style.bottom = `${stage.bottom - r.top + 4}px`;
    tip.style.top = 'auto';
  }

  private tryPlace(keep: boolean): void {
    if (this.mode.kind !== 'place') return;
    const g = this.ghost();
    if (!g) return;
    let builders = this.mySel().filter((u) => u.type === 'villager');
    if (g.type === 'farm' && keep && builders.length > 1) builders = this.paddyBuilder(builders, g.tx, g.ty);
    const r = placeBuilding(this.world, PLAYER, g.type, g.tx, g.ty, builders);
    if (r === 'ok') {
      if (!keep || !canAfford(this.world, PLAYER, BUILDINGS[g.type].cost)) this.mode = { kind: 'none' };
    } else {
      this.audio.play('error');
      const c = BUILDINGS[g.type].cost;
      this.toast(r === 'cost' ? `Not enough ${shortOf(this.world, PLAYER, c)} (${costText(c)}).` : r === 'unexplored' ? 'You cannot build in unexplored land.' : r === 'age' ? 'Not available in this age.' : 'Cannot build there.');
    }
  }

  /**
   * Shift-placing several rice paddies: each one gets its own villager (the
   * nearest one not already building a paddy), so every paddy ends up with one
   * farmer. Paddies beyond the number of villagers wait for a free villager.
   */
  private paddyBuilder(vills: Entity[], tx: number, ty: number): Entity[] {
    const w = this.world;
    const onPaddy = (u: Entity): boolean => {
      if (u.order.type !== 'build') return false;
      const b = w.get(u.order.target);
      return !!b && b.type === 'farm' && b.progress < 1;
    };
    const free = vills.filter((u) => !onPaddy(u));
    if (!free.length) return [];
    const cx = (tx + 1) * T;
    const cy = (ty + 1) * T;
    free.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    return [free[0]];
  }

  /** Walls: first click sets the start, second click builds the line. */
  private wallClick(x: number, y: number, keep: boolean): void {
    if (this.mode.kind !== 'wall') return;
    const tile = { tx: Math.floor(x / T), ty: Math.floor(y / T) };
    if (!this.mode.start) {
      this.mode.start = tile;
      this.audio.play('click');
      return;
    }
    const builders = this.mySel().filter((u) => u.type === 'villager');
    const n = placeWallLine(this.world, PLAYER, this.mode.type, this.mode.start.tx, this.mode.start.ty, tile.tx, tile.ty, builders);
    if (n === 0) {
      this.audio.play('error');
      this.toast(canAfford(this.world, PLAYER, BUILDINGS[this.mode.type].cost) ? 'Cannot build a wall there.' : `Not enough ${shortOf(this.world, PLAYER, BUILDINGS[this.mode.type].cost)}.`);
      return;
    }
    this.toast(`${n} wall piece${n === 1 ? '' : 's'} placed.`);
    // keep going from the end of this piece with Shift held
    this.mode = keep && canAfford(this.world, PLAYER, BUILDINGS[this.mode.type].cost) ? { kind: 'wall', type: this.mode.type, start: tile } : { kind: 'none' };
  }

  private rightClick(x: number, y: number, queue = false): void {
    const w = this.world;
    const mine = this.mySel();
    if (mine.length === 0) return;
    if (mine.every((b) => b.kind === 'building')) {
      const trainers = mine.filter((b) => BUILDINGS[b.type as BuildingType].trains.length > 0);
      if (trainers.length === 0) return;
      const t = entityAt(w, x, y, (e) => (e.kind === 'resource' || (e.type === 'farm' && e.team === PLAYER)) && visibleTo(w, PLAYER, e));
      for (const b of trainers) {
        b.rally = { x, y };
        b.rallyTarget = t ? t.id : 0;
      }
      this.fx.marker(x, y, false);
      this.audio.play('command');
      return;
    }
    const r = queue ? queueOrder(w, mine, x, y, PLAYER, (e) => visibleTo(w, PLAYER, e)) : smartOrder(w, mine, x, y, PLAYER, (e) => visibleTo(w, PLAYER, e));
    if (r !== 'none') {
      this.fx.marker(x, y, r === 'attack');
      this.audio.play('command');
    }
  }

  private clickSelect(p: { x: number; y: number }, shift: boolean): void {
    const wp = this.toWorld(p.x, p.y);
    const e = this.pickAt(wp.x, wp.y);
    if (!e) {
      if (!shift) this.select([], false);
      return;
    }
    const now = performance.now();
    const dbl = now - this.lastClick.t < 350 && this.lastClick.id === e.id;
    this.lastClick = { t: now, id: e.id };
    if (dbl && e.team === PLAYER && e.kind === 'unit') {
      const same = this.world.units.filter((u) => u.team === PLAYER && u.type === e.type && this.onScreen(u.x, u.y));
      this.select(same);
      return;
    }
    if (dbl && e.team === PLAYER && e.kind === 'building') {
      // every building of this kind you own, anywhere on the map
      this.select(this.world.buildings.filter((b) => b.team === PLAYER && b.type === e.type));
      return;
    }
    if (shift && e.team === PLAYER && e.kind === 'unit' && this.mySel().every((s) => s.kind === 'unit')) {
      if (this.selected.includes(e)) this.select(this.selected.filter((s) => s !== e));
      else this.select([...this.mySel(), e]);
      return;
    }
    this.select([e]);
  }

  /** What is under a world point, including the upper floors of tall buildings. */
  private pickAt(x: number, y: number): Entity | null {
    const w = this.world;
    const e = entityAt(w, x, y, (q) => visibleTo(w, PLAYER, q));
    if (e) return e;
    for (const b of w.buildings) {
      if (b.dead || !visibleTo(w, PLAYER, b)) continue;
      const spr = buildingSprite(b.type, b.team);
      const p = buildingPos(b, spr);
      if (x >= p.x + 4 && x < p.x + spr.width - 4 && y >= p.y + 2 && y < (b.ty + b.size) * T) return b;
    }
    return null;
  }

  private boxSelect(a: { x: number; y: number }, b: { x: number; y: number }, shift: boolean): void {
    const p0 = this.toWorld(Math.min(a.x, b.x), Math.min(a.y, b.y));
    const p1 = this.toWorld(Math.max(a.x, b.x), Math.max(a.y, b.y));
    const inBox = this.world.units.filter((u) => u.team === PLAYER && u.x >= p0.x - 4 && u.x <= p1.x + 4 && u.y >= p0.y - 2 && u.y - 10 <= p1.y);
    if (inBox.length === 0) {
      if (!shift) this.select([], false);
      return;
    }
    // a box with soldiers in it selects only the soldiers
    const soldiers = inBox.filter(isSoldier);
    const pick = soldiers.length && soldiers.length < inBox.length && !shift ? soldiers : inBox;
    this.select(shift ? Array.from(new Set([...this.mySel().filter((s) => s.kind === 'unit'), ...pick])) : pick);
  }

  private keyDown(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (e.target instanceof HTMLInputElement) return;
    this.audio.unlock();
    if (k === 'escape') return; // handled in main.ts (pause / resume / cancel)
    if (this.paused || this.over) return;
    if (k === 'delete' || k === 'backspace') {
      // Delete (on a Mac keyboard the key marked "delete" is Backspace) destroys what you have selected
      e.preventDefault();
      const mine = this.mySel();
      if (!mine.length) return;
      const r = deleteOwn(this.world, PLAYER, mine);
      if (r === 'townCenter') {
        this.audio.play('error');
        this.toast('You cannot delete your Town Center.', true);
      } else if (r === 'ok') {
        this.audio.play('death');
        this.select(this.selected.filter((x) => !x.dead), false);
      }
      return;
    }
    if (k === 'm') {
      const muted = this.audio.toggleMute();
      this.toast(muted ? 'Sound off.' : 'Sound on.');
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) {
      this.keys.add(k);
      e.preventDefault();
      return;
    }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) {
      const n = Number(digit[1]);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const ids = this.mySel().map((s) => s.id);
        this.groups.set(n, ids);
        this.toast(ids.length ? `Group ${n}: ${ids.length} selected. Press ${n} to pick them again.` : `Group ${n} cleared.`);
      } else {
        const ids = this.groups.get(n) ?? [];
        const list = ids.map((id) => this.world.get(id)).filter((x): x is Entity => !!x);
        if (list.length) {
          const now = performance.now();
          this.select(list);
          if (this.lastGroupKey.n === n && now - this.lastGroupKey.t < 400) this.centerOn(list[0].x, list[0].y);
          this.lastGroupKey = { n, t: now };
        }
      }
      return;
    }
    if (k === 'h') {
      const tc = this.world.buildings.find((b) => b.team === PLAYER && b.type === 'townCenter');
      if (tc) {
        this.select([tc]);
        this.centerOn(tc.x, tc.y);
      }
      return;
    }
    if (k === '.' || k === 'q') {
      this.nextIdleVillager();
      return;
    }
    if (k === ' ') {
      e.preventDefault();
      if (this.alertAt && this.world.time - this.alertAt.t < 10) {
        this.centerOn(this.alertAt.x, this.alertAt.y);
        this.alertAt = null;
      } else if (this.selected.length) this.centerOn(this.selected[0].x, this.selected[0].y);
      return;
    }
    this.cmds = this.commands();
    const cmd = this.cmds.find((c) => c.key.toLowerCase() === k);
    if (cmd) {
      cmd.run();
      this.cmdKey = '-';
      this.hudT = 0;
    }
  }

  onPauseRequest: (() => void) | null = null;

  /** Cancels building placement or attack-move. Returns true if there was one. */
  cancelMode(): boolean {
    if (this.mode.kind === 'none') return false;
    this.mode = { kind: 'none' };
    this.cmdKey = '-';
    return true;
  }

  // ---------- HUD ----------

  private toast(text: string, alarm = false): void {
    const box = $('toast');
    const d = document.createElement('div');
    d.textContent = text;
    if (alarm) d.className = 'alarm';
    const wrap = document.createElement('section');
    wrap.appendChild(d);
    box.appendChild(wrap);
    while (box.children.length > 3) box.removeChild(box.firstChild!);
    setTimeout(() => (d.style.opacity = '0'), 3000);
    setTimeout(() => wrap.remove(), 3500);
  }

  private renderHud(): void {
    const w = this.world;
    const t = w.teams[PLAYER];
    // how many villagers work each resource, shown in brackets after the amount
    const workers: Record<ResKind, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const u of w.units) if (u.team === PLAYER && u.type === 'villager' && u.order.type === 'gather') workers[RESOURCES[u.order.resType].kind]++;
    for (const k of ['food', 'wood', 'gold', 'stone'] as ResKind[]) {
      $(`r-${k}`).textContent = String(Math.floor(t[k]));
      $(`n-${k}`).textContent = `(${workers[k]})`;
    }
    const adv = w.buildings.find((b) => b.team === PLAYER && b.research?.key === 'age');
    const compact = RENDER.width < 780;
    $('topbar').classList.toggle('compact', compact);
    const ageName = compact ? AGES[t.age].name.replace(' Age', '') : AGES[t.age].name;
    $('r-age').textContent = adv ? `${ageName} → ${Math.floor((adv.research!.t / adv.research!.sec) * 100)}%` : ageName;
    const pop = $('r-pop');
    pop.textContent = `${t.popUsed}/${t.popCap}`;
    pop.classList.toggle('capped', t.popUsed >= t.popCap);
    const idle = w.units.filter((u) => u.team === PLAYER && u.type === 'villager' && u.order.type === 'idle').length;
    $('r-idle').textContent = String(idle);
    $('idle-btn').classList.toggle('none', idle === 0);
    $('r-time').textContent = fmtTime(w.time);

    // command buttons: rebuild only when something changed
    this.cmds = this.commands();
    const key = this.cmds.map((c) => `${c.label}:${c.enabled}:${c.active}:${c.icon}`).join('|') + this.mySel().map((s) => s.id).join(',');
    if (key !== this.cmdKey) {
      this.cmdKey = key;
      const box = $('cmds');
      box.innerHTML = '';
      this.cmds.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = `cmd${c.enabled ? '' : ' off'}${c.active ? ' on' : ''}${c.locked ? ' locked' : ''}`;
        b.dataset.i = String(i);
        b.appendChild(icon(c.icon, PLAYER, 24, this.world.teams[PLAYER].age));
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = c.key;
        b.appendChild(k);
        const cost = document.createElement('span');
        cost.className = 'cost';
        cost.textContent = c.locked ? 'Locked' : c.status ? `${c.label} ${c.status}` : c.cost && Object.keys(c.cost).length ? shortCost(c.cost) : c.label;
        b.appendChild(cost);
        box.appendChild(b);
      });
    }

    // selection info
    const info = $('info');
    info.innerHTML = '';
    const sel = this.selected;
    if (sel.length === 0) {
      info.innerHTML = `<div class="dim">Click or drag: select<br>Right-click: give orders<br>H: Town Center<br>Q: idle villager</div>`;
      return;
    }
    if (sel.length === 1) {
      const e = sel[0];
      const head = document.createElement('div');
      head.className = 'sel-head';
      head.appendChild(icon(e.type, e.team === NATURE ? 0 : e.team, 32, e.team < 2 ? w.teams[e.team].age : 0));
      const col = document.createElement('div');
      head.appendChild(col);
      info.appendChild(head);
      const owner = e.team === ENEMY ? ' (enemy)' : '';
      if (e.kind === 'resource') {
        const r = RESOURCES[e.type as keyof typeof RESOURCES];
        col.innerHTML = `<div class="sel-name">${r.name}</div><div>${Math.ceil(e.amount)} ${r.kind} left</div>`;
        return;
      }
      if (e.kind === 'unit') {
        const s = unitStats(e.type as UnitType, w.teams[e.team].age);
        const bonus = Object.entries(s.bonus)
          .map(([k, v]) => `+${Math.round(v * (s.bonusScale ?? 1))} vs ${UNITS[k as UnitType].tiers[w.teams[e.team].age].name}`)
          .join(' ');
        let task = '';
        const o = e.order;
        if (o.type === 'gather') task = o.phase === 'drop' ? `Carrying ${Math.floor(e.carry)} ${e.carryKind ?? ''}` : `Gathering ${RESOURCES[o.resType].kind} (${Math.floor(e.carry)}/10)`;
        else if (o.type === 'build') task = 'Building';
        else if (o.type === 'repair') task = 'Repairing';
        else if (o.type === 'garrison') task = 'Heading into the tower';
        else if (o.type === 'attack') task = 'Fighting';
        else if (o.type === 'move') task = e.hostile ? 'Marching (hostile)' : 'Moving';
        else task = e.type === 'villager' ? '<span class="warn">Idle</span>' : e.hostile ? 'On guard (hostile)' : 'Standing down';
        col.innerHTML = `<div class="sel-name">${s.name}${owner}</div><div>HP ${Math.ceil(e.hp)}/${Math.ceil(e.maxHp)}</div><div class="bar"><i style="width:${(e.hp / e.maxHp) * 100}%"></i></div>`;
        const more = document.createElement('div');
        more.innerHTML = `<div class="dim">Atk ${s.attack}${s.rangeTiles ? ` Rng ${s.rangeTiles}` : ''} Armor ${s.armor}/${s.arrowArmor} ${bonus}</div>${e.team === PLAYER ? `<div>${task}</div>` : ''}`;
        info.appendChild(more);
        return;
      }
      // building
      const s = BUILDINGS[e.type as BuildingType];
      col.innerHTML = `<div class="sel-name">${s.name}${owner}</div><div>HP ${Math.ceil(e.hp)}/${e.maxHp}</div><div class="bar"><i style="width:${(e.hp / e.maxHp) * 100}%"></i></div>`;
      if (e.progress < 1) {
        col.innerHTML += `<div>Building ${Math.floor(e.progress * 100)}%</div><div class="bar prog"><i style="width:${e.progress * 100}%"></i></div>`;
        if (e.team === PLAYER && !w.units.some((u) => u.order.type === 'build' && u.order.target === e.id)) col.innerHTML += `<div class="warn">No one is building it.</div>`;
        return;
      }
      if (e.team !== PLAYER) return;
      if (e.research) {
        const info2 = researchInfo(w, e, e.research.key);
        const label = e.research.key === 'age' ? info2?.name ?? 'Advancing' : e.research.key === 'merchant' ? 'Hiring a merchant' : 'Upgrading';
        info.insertAdjacentHTML('beforeend', `<div>${label} ${Math.floor((e.research.t / e.research.sec) * 100)}%</div><div class="bar prog"><i style="width:${(e.research.t / e.research.sec) * 100}%"></i></div><div class="dim">Press its button again to cancel.</div>`);
        return;
      }
      if (s.garrison) info.insertAdjacentHTML('beforeend', `<div>${garrisoned(w, e).length}/${s.garrison} inside. Archers add arrows.</div>`);
      if (e.type === 'market') info.insertAdjacentHTML('beforeend', `<div class="dim">Trade: +${tradeIncome(w, PLAYER).toFixed(2)} gold/s. Merchants: ${w.teams[PLAYER].merchants}/${MARKET.maxMerchants}</div>`);
      if (e.type === 'farm') info.insertAdjacentHTML('beforeend', `<div>${Math.ceil(e.amount)} food left.</div><div class="dim">${e.noReplant ? 'Replant off' : 'Replant on (40 wood)'}</div>`);
      if (s.gate) info.insertAdjacentHTML('beforeend', `<div class="dim">${e.locked ? 'Locked: nobody can pass.' : 'Open for your units only.'}</div>`);
      if (e.hp < e.maxHp) info.insertAdjacentHTML('beforeend', `<div class="dim">Right-click it with villagers to repair.</div>`);
      if (e.queue.length) {
        const q = document.createElement('div');
        q.className = 'queue';
        e.queue.forEach((u, i) => {
          const b = document.createElement('button');
          b.dataset.q = String(i);
          b.title = 'Click to cancel';
          b.appendChild(icon(u, PLAYER, 16));
          q.appendChild(b);
          if (i === 0) {
            const bar = document.createElement('div');
            bar.className = 'bar prog';
            bar.style.width = 'calc(60px * var(--s))';
            bar.innerHTML = `<i style="width:${(e.queueT / UNITS[u].trainSec) * 100}%"></i>`;
            q.appendChild(bar);
          }
        });
        info.appendChild(q);
        if (e.housed) info.insertAdjacentHTML('beforeend', `<div class="warn">Need a House to train more.</div>`);
      } else if (s.trains.length) {
        info.insertAdjacentHTML('beforeend', `<div class="dim">Right-click the map to set a rally point.</div>`);
      } else if (s.dropoff) {
        info.insertAdjacentHTML('beforeend', `<div class="dim">Villagers drop off resources here.</div>`);
      } else if (s.pop) {
        info.insertAdjacentHTML('beforeend', `<div class="dim">+${s.pop} population.</div>`);
      }
      return;
    }
    // several units
    const counts = new Map<string, number>();
    for (const e of sel) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    info.insertAdjacentHTML(
      'beforeend',
      `<div class="sel-name">${sel.length} selected: ${[...counts].map(([k, n]) => `${n} ${UNITS[k as UnitType] ? unitStats(k as UnitType, w.teams[PLAYER].age).name : BUILDINGS[k as BuildingType]?.name ?? k}`).join(', ')}</div>`,
    );
    const g = document.createElement('div');
    g.className = 'group';
    for (const e of sel.slice(0, 26)) {
      const b = document.createElement('button');
      b.dataset.u = String(e.id);
      b.appendChild(icon(e.type, e.team, 16));
      const hp = document.createElement('i');
      hp.style.width = `${(e.hp / e.maxHp) * 100}%`;
      b.appendChild(hp);
      g.appendChild(b);
    }
    info.appendChild(g);
  }

  // ---------- results ----------

  results(): MatchResults {
    const w = this.world;
    return {
      won: w.winner === PLAYER,
      time: w.time,
      opening: OPENINGS[this.bot.openingKey].name,
      stats: [w.teams[PLAYER].stats, w.teams[ENEMY].stats],
      history: w.history,
    };
  }

  /** Used by the dev console and tests: how far the nearest enemy is from the player's Town Center. */
  debugThreat(): number {
    const tc = this.world.buildings.find((b) => b.team === PLAYER && b.type === 'townCenter');
    if (!tc) return -1;
    return Math.min(...this.world.units.filter((u) => u.team === ENEMY).map((u) => distToEntity(u.x, u.y, tc)));
  }
}
