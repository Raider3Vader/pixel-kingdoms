import { describe, expect, it } from 'vitest';
import { SIM, UNITS, type UnitType } from '../config';
import { createBot, updateBot } from './bot';
import { createMatch } from './map';
import { findPath } from './path';
import {
  ENEMY,
  PLAYER,
  T,
  World,
  orderAttack,
  orderGather,
  placeBuilding,
  spawnBuilding,
  spawnResource,
  spawnUnit,
  step,
  teamUnits,
  train,
} from './world';

const DT = 1 / SIM.tickHz;

function run(w: World, seconds: number, each?: () => void): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && w.winner === null; i++) {
    each?.();
    step(w, DT);
    w.events.length = 0;
  }
}

/** An empty world with a Town Center for each side, far apart. */
function testWorld(): World {
  const w = new World(7);
  spawnBuilding(w, 'townCenter', PLAYER, 2, 2, true);
  spawnBuilding(w, 'townCenter', ENEMY, 59, 59, true);
  step(w, DT);
  return w;
}

describe('economy', () => {
  it('a villager gathers berries and drops them at the Town Center', () => {
    const w = testWorld();
    const bush = spawnResource(w, 'berries', 9, 3)!;
    const v = spawnUnit(w, 'villager', PLAYER, 6 * T, 3 * T);
    const before = w.teams[PLAYER].food;
    orderGather(w, [v], bush);
    run(w, 90);
    expect(w.teams[PLAYER].food).toBeGreaterThanOrEqual(before + 30);
    expect(bush.amount).toBeLessThan(200);
  });

  it('training costs food and takes the configured time', () => {
    const w = testWorld();
    const tc = w.buildings.find((b) => b.team === PLAYER)!;
    expect(train(w, tc, 'villager')).toBe('ok');
    expect(w.teams[PLAYER].food).toBe(50);
    run(w, UNITS.villager.trainSec - 0.5);
    expect(teamUnits(w, PLAYER, 'villager').length).toBe(0);
    run(w, 1);
    expect(teamUnits(w, PLAYER, 'villager').length).toBe(1);
  });

  it('the population cap holds training until a House is built', () => {
    const w = testWorld();
    for (let i = 0; i < 10; i++) spawnUnit(w, 'villager', PLAYER, 10 * T, (2 + i) * T);
    w.teams[PLAYER].food = 1000;
    w.teams[PLAYER].wood = 1000;
    const tc = w.buildings.find((b) => b.team === PLAYER)!;
    train(w, tc, 'villager');
    run(w, 15);
    expect(teamUnits(w, PLAYER, 'villager').length).toBe(10);
    const builders = teamUnits(w, PLAYER, 'villager').slice(0, 3);
    expect(placeBuilding(w, PLAYER, 'house', 12, 8, builders, false)).toBe('ok');
    run(w, 20);
    expect(teamUnits(w, PLAYER, 'villager').length).toBe(11);
    expect(w.teams[PLAYER].popCap).toBe(15);
  });

  it('buildings cannot go on trees', () => {
    const w = testWorld();
    spawnResource(w, 'tree', 20, 20);
    const v = spawnUnit(w, 'villager', PLAYER, 18 * T, 18 * T);
    expect(placeBuilding(w, PLAYER, 'house', 19, 19, [v], false)).toBe('blocked');
  });
});

describe('counter triangle', () => {
  /** Five of `a` against five of `b`, starting 6 tiles apart. Returns the winner's type. */
  function duel(a: UnitType, b: UnitType): UnitType {
    const w = testWorld();
    const as = [];
    const bs = [];
    for (let i = 0; i < 5; i++) {
      as.push(spawnUnit(w, a, PLAYER, 24 * T, (28 + i) * T));
      bs.push(spawnUnit(w, b, ENEMY, 30 * T, (28 + i) * T));
    }
    for (let i = 0; i < 5; i++) {
      orderAttack(w, [as[i]], bs[i]);
      orderAttack(w, [bs[i]], as[i]);
    }
    run(w, 90, () => {
      // keep everyone fighting
      for (const u of w.units) if (u.order.type === 'idle') {
        const foe = w.units.find((o) => o.team !== u.team && !o.dead);
        if (foe) orderAttack(w, [u], foe);
      }
    });
    const aLeft = teamUnits(w, PLAYER).length;
    const bLeft = teamUnits(w, ENEMY).length;
    expect(aLeft === 0 || bLeft === 0).toBe(true);
    return aLeft > 0 ? a : b;
  }

  it('Archers beat Swordsmen', () => expect(duel('archer', 'swordsman')).toBe('archer'));
  it('Cavalry beats Archers', () => expect(duel('cavalry', 'archer')).toBe('cavalry'));
  it('Swordsmen beat Cavalry', () => expect(duel('swordsman', 'cavalry')).toBe('swordsman'));
});

describe('map', () => {
  it('the two villages are connected', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const { world: w, playerTC, enemyTC } = createMatch(seed);
      const p = findPath(w, playerTC.tx + 3, playerTC.ty + 3, (x, y) => x === enemyTC.tx - 1 && y === enemyTC.ty - 1, enemyTC.tx - 1, enemyTC.ty - 1, 8000);
      expect(p).not.toBeNull();
    }
  });

  it('is mirrored so both sides are fair', () => {
    const { world: w } = createMatch(5);
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const a = w.blocked[y * w.w + x] === 1;
        const b = w.blocked[(w.h - 1 - y) * w.w + (w.w - 1 - x)] === 1;
        expect(a).toBe(b);
      }
    }
  });
});

describe('enemy kingdom', () => {
  it('grows its economy and builds a Barracks on Normal', () => {
    const { world: w } = createMatch(3);
    const bot = createBot(w, ENEMY, 'normal', 'boom');
    run(w, 8 * 60, () => updateBot(w, bot, DT));
    expect(teamUnits(w, ENEMY, 'villager').length).toBeGreaterThanOrEqual(15);
    expect(w.buildings.some((b) => b.team === ENEMY && b.type === 'barracks')).toBe(true);
    expect(w.buildings.some((b) => b.team === ENEMY && b.type === 'house')).toBe(true);
  });

  it('a Rush attacks early', () => {
    const { world: w } = createMatch(4);
    const bot = createBot(w, ENEMY, 'normal', 'rush');
    run(w, 7 * 60, () => updateBot(w, bot, DT));
    expect(bot.attacksSent).toBeGreaterThan(0);
  });

  it('Hard beats Easy in a full game', () => {
    const { world: w } = createMatch(11);
    const hard = createBot(w, PLAYER, 'hard', 'boom');
    const easy = createBot(w, ENEMY, 'easy', 'boom');
    run(w, 40 * 60, () => {
      updateBot(w, hard, DT);
      updateBot(w, easy, DT);
    });
    expect(w.winner).toBe(PLAYER);
  }, 120_000);
});

describe('pathing', () => {
  it('a villager sent into a dense forest switches to a reachable tree', () => {
    const w = testWorld();
    for (let y = 20; y < 27; y++) for (let x = 20; x < 27; x++) spawnResource(w, 'tree', x, y);
    spawnBuilding(w, 'storehouse', PLAYER, 17, 22, true);
    const inner = w.resources.find((r) => r.tx === 23 && r.ty === 23)!;
    const v = spawnUnit(w, 'villager', PLAYER, 16 * T, 21 * T);
    const before = w.teams[PLAYER].wood;
    orderGather(w, [v], inner);
    run(w, 60);
    expect(w.teams[PLAYER].wood).toBeGreaterThan(before);
  });
});

describe('river', () => {
  it('crosses the map, is mirrored, and has bridges', () => {
    const { world: w } = createMatch(8);
    let water = 0;
    let bridges = 0;
    for (let y = 0; y < w.h; y++)
      for (let x = 0; x < w.w; x++) {
        const i = y * w.w + x;
        water += w.water[i];
        bridges += w.bridge[i];
        expect(w.water[i]).toBe(w.water[(w.h - 1 - y) * w.w + (w.w - 1 - x)]);
      }
    expect(water).toBeGreaterThan(100);
    expect(bridges).toBeGreaterThan(6);
  });
});
