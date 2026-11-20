import { describe, expect, it } from 'vitest';
import { AGES, BUILDINGS, ECONOMY, SIM, UNITS, hitDamage, type Age, type UnitType } from '../config';
import { createBot, updateBot } from './bot';
import { RIVERS, createMatch, type RiverKind } from './map';
import { findPath } from './path';
import {
  ENEMY,
  PLAYER,
  T,
  World,
  orderAttack,
  buyResource,
  orderFormation,
  orderRepair,
  setGateLocked,
  setOrder,
  startResearch,
  orderGather,
  orderMove,
  placeBuilding,
  queueOrder,
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

describe('combat', () => {
  /** Five of `a` against five of `b`, starting 6 tiles apart, in the given ages. Returns the winner's type. */
  function duel(a: UnitType, b: UnitType, ageA: Age = 1, ageB: Age = 1): UnitType {
    const w = testWorld();
    w.teams[PLAYER].age = ageA;
    w.teams[ENEMY].age = ageB;
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
    run(w, 120, () => {
      for (const u of w.units)
        if (u.order.type === 'idle') {
          const foe = w.units.find((o) => o.team !== u.team && !o.dead);
          if (foe) orderAttack(w, [u], foe);
        }
    });
    const aLeft = teamUnits(w, PLAYER).length;
    const bLeft = teamUnits(w, ENEMY).length;
    expect(aLeft === 0 || bLeft === 0).toBe(true);
    return aLeft > 0 ? a : b;
  }

  it('Spearmen beat Cavalry', () => expect(duel('spearman', 'cavalry')).toBe('spearman'));
  it('Cavalry beat Swordsmen of the same age', () => expect(duel('cavalry', 'swordsman')).toBe('cavalry'));
  it('Cavalry beat Archers', () => expect(duel('cavalry', 'archer')).toBe('cavalry'));
  it('Swordsmen beat Spearmen', () => expect(duel('swordsman', 'spearman')).toBe('swordsman'));
  it('Feudal Archers beat Dark Age Militia', () => expect(duel('archer', 'swordsman', 1, 0)).toBe('archer'));
  it('Imperial Champions beat Feudal Militia-line', () => expect(duel('swordsman', 'swordsman', 2, 1)).toBe('swordsman'));

  it('armor soaks up arrows, and archers do half damage up close', () => {
    expect(hitDamage('archer', 1, 'swordsman', 0, false)).toBe(6); // Militia: no armor
    expect(hitDamage('archer', 2, 'swordsman', 2, false)).toBe(3); // Champion: heavy armor
    expect(hitDamage('archer', 1, 'spearman', 0, true)).toBe(3); // close quarters
    expect(hitDamage('spearman', 1, 'cavalry', 1, false)).toBeGreaterThan(10); // spears vs horses
  });

  it('advancing an age upgrades existing soldiers', () => {
    const w = testWorld();
    const m = spawnUnit(w, 'swordsman', PLAYER, 20 * T, 20 * T);
    expect(m.maxHp).toBe(UNITS.swordsman.tiers[0].hp);
    w.teams[PLAYER].food = 1000;
    w.teams[PLAYER].wood = 1000;
    const tc = w.buildings.find((b) => b.team === PLAYER && b.type === 'townCenter')!;
    expect(startResearch(w, tc, 'age')).toBe('ok');
    run(w, AGES[1].sec + 1);
    expect(w.teams[PLAYER].age).toBe(1);
    expect(m.maxHp).toBe(UNITS.swordsman.tiers[1].hp);
  });
});

describe('economy extras', () => {
  it('a rice paddy gives food, replants itself, and units walk over it', () => {
    const w = testWorld();
    const farm = spawnBuilding(w, 'farm', PLAYER, 8, 2, true);
    expect(w.isBlocked(8, 2, PLAYER)).toBe(false);
    farm.amount = 15;
    const v = spawnUnit(w, 'villager', PLAYER, 10 * T, 4 * T);
    setOrder(v, { type: 'gather', target: farm.id, resType: 'farm', phase: 'go', dropId: 0 });
    const food0 = w.teams[PLAYER].food;
    const wood0 = w.teams[PLAYER].wood;
    run(w, 70);
    expect(w.teams[PLAYER].food).toBeGreaterThan(food0 + 14);
    expect(farm.dead).toBe(false);
    expect(w.teams[PLAYER].wood).toBe(wood0 - 40); // replanted
  });

  it('a paddy with auto-replant off disappears when empty', () => {
    const w = testWorld();
    const farm = spawnBuilding(w, 'farm', PLAYER, 8, 2, true);
    farm.amount = 5;
    farm.noReplant = true;
    const v = spawnUnit(w, 'villager', PLAYER, 10 * T, 4 * T);
    setOrder(v, { type: 'gather', target: farm.id, resType: 'farm', phase: 'go', dropId: 0 });
    const wood0 = w.teams[PLAYER].wood;
    run(w, 40);
    expect(farm.dead).toBe(true);
    expect(w.teams[PLAYER].wood).toBe(wood0);
  });

  it('villagers mine gold and stone', () => {
    const w = testWorld();
    const g = spawnResource(w, 'gold', 9, 3)!;
    const v = spawnUnit(w, 'villager', PLAYER, 7 * T, 3 * T);
    orderGather(w, [v], g);
    run(w, 60);
    expect(w.teams[PLAYER].gold).toBeGreaterThan(0);
  });

  it('a market trades for gold, sells resources and hires merchants', () => {
    const w = testWorld();
    w.teams[PLAYER].age = 1;
    spawnBuilding(w, 'market', PLAYER, 20, 20, true);
    w.teams[PLAYER].gold = 100;
    expect(buyResource(w, PLAYER, 'wood')).toBe(true);
    expect(w.teams[PLAYER].wood).toBe(ECONOMY.startingWood + 100);
    const g0 = w.teams[PLAYER].gold;
    run(w, 20);
    expect(w.teams[PLAYER].gold).toBeGreaterThan(g0 + 2);
  });

  it('a locked gate stops your own units; an open one lets only your side through', () => {
    const w = testWorld();
    const gate = spawnBuilding(w, 'gate', PLAYER, 30, 30, true);
    expect(w.isBlocked(30, 30, PLAYER)).toBe(false);
    expect(w.isBlocked(30, 30, ENEMY)).toBe(true);
    setGateLocked(w, gate, true);
    expect(w.isBlocked(30, 30, PLAYER)).toBe(true);
  });

  it('archers inside a guard tower add arrows', () => {
    const w = testWorld();
    w.teams[PLAYER].age = 1;
    const tower = spawnBuilding(w, 'guardTower', PLAYER, 30, 30, true);
    const archers = [0, 1, 2].map((i) => spawnUnit(w, 'archer', PLAYER, (28 + i) * T, 32 * T));
    for (const a of archers) setOrder(a, { type: 'garrison', target: tower.id });
    run(w, 8);
    expect(archers.every((a) => a.inside === tower.id)).toBe(true);
    const foe = spawnUnit(w, 'villager', ENEMY, 33 * T, 31 * T);
    foe.maxHp = foe.hp = 500;
    run(w, 1.6);
    expect(foe.hp).toBeLessThanOrEqual(500 - 4 * BUILDINGS.guardTower.attack + 1);
  });

  it('villagers repair damaged buildings and it costs resources', () => {
    const w = testWorld();
    const house = spawnBuilding(w, 'house', PLAYER, 20, 20, true);
    house.hp = 30;
    const v = spawnUnit(w, 'villager', PLAYER, 19 * T, 21 * T);
    const wood0 = w.teams[PLAYER].wood;
    orderRepair(w, [v], house);
    run(w, 40);
    expect(house.hp).toBe(house.maxHp);
    expect(w.teams[PLAYER].wood).toBeLessThan(wood0);
  });
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

describe('river layouts', () => {
  for (const kind of Object.keys(RIVERS) as RiverKind[]) {
    it(`${RIVERS[kind].name}: mirrored, and the villages connect`, () => {
      for (const seed of [1, 7]) {
        const { world: w, playerTC, enemyTC } = createMatch(seed, { river: kind });
        let water = 0;
        for (let y = 0; y < w.h; y++)
          for (let x = 0; x < w.w; x++) {
            const i = y * w.w + x;
            water += w.water[i];
            expect(w.water[i]).toBe(w.water[(w.h - 1 - y) * w.w + (w.w - 1 - x)]);
          }
        expect(water).toBeGreaterThan(100);
        const p = findPath(w, playerTC.tx + 3, playerTC.ty + 3, (x, y) => x === enemyTC.tx - 1 && y === enemyTC.ty - 1, enemyTC.tx - 1, enemyTC.ty - 1);
        expect(p).not.toBeNull();
      }
    });
  }
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

describe('order queue', () => {
  it('finishes one resource, then moves on to the next queued one', () => {
    const w = testWorld();
    const tree = spawnResource(w, 'tree', 8, 3)!;
    tree.amount = 15;
    const sheep = spawnResource(w, 'sheep', 8, 7)!;
    const v = spawnUnit(w, 'villager', PLAYER, 6 * T, 5 * T);
    orderGather(w, [v], tree);
    v.pending.push({ type: 'gather', target: sheep.id, resType: 'sheep', phase: 'go', dropId: 0 });
    const wood0 = w.teams[PLAYER].wood;
    const food0 = w.teams[PLAYER].food;
    run(w, 80);
    expect(tree.dead).toBe(true);
    expect(w.teams[PLAYER].wood).toBe(wood0 + 15);
    expect(w.teams[PLAYER].food).toBeGreaterThan(food0);
    // it did not wander off to another tree
    expect(v.order.type === 'gather' && v.order.resType === 'sheep').toBe(true);
  });

  it('walks a queue of waypoints in order', () => {
    const w = testWorld();
    const s = spawnUnit(w, 'cavalry', PLAYER, 20 * T, 20 * T);
    queueOrder(w, [s], 26 * T, 20 * T, PLAYER, () => true);
    queueOrder(w, [s], 26 * T, 26 * T, PLAYER, () => true);
    queueOrder(w, [s], 20 * T, 26 * T, PLAYER, () => true);
    expect(s.pending.length).toBe(2);
    run(w, 20);
    expect(s.pending.length).toBe(0);
    expect(Math.hypot(s.x - 20 * T, s.y - 26 * T)).toBeLessThan(6);
  });
});

describe('stable', () => {
  it('a Horse raid builds a Stable and trains cavalry', () => {
    const { world: w } = createMatch(6);
    const bot = createBot(w, ENEMY, 'normal', 'horseRaid');
    run(w, 15 * 60, () => updateBot(w, bot, DT));
    expect(w.buildings.some((b) => b.team === ENEMY && b.type === 'stable')).toBe(true);
    expect(w.units.some((u) => u.team === ENEMY && u.type === 'cavalry') || w.teams[ENEMY].stats.trained > 20).toBe(true);
  });

  it('both sides start with a scout', () => {
    const { world: w } = createMatch(2);
    expect(teamUnits(w, PLAYER, 'scout').length).toBe(1);
    expect(teamUnits(w, ENEMY, 'scout').length).toBe(1);
  });
});

describe('formations', () => {
  const army = (w: World): ReturnType<typeof spawnUnit>[] => {
    const list = [];
    for (let i = 0; i < 4; i++) list.push(spawnUnit(w, 'swordsman', PLAYER, (20 + i) * T, 20 * T));
    for (let i = 0; i < 3; i++) list.push(spawnUnit(w, 'archer', PLAYER, (20 + i) * T, 22 * T));
    list.push(spawnUnit(w, 'cavalry', PLAYER, 24 * T, 22 * T));
    return list;
  };

  it('a line forms a single horizontal row', () => {
    const w = testWorld();
    const list = army(w);
    orderFormation(w, list, 'line');
    run(w, 15);
    const ys = list.map((u) => u.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(6);
  });

  it('a box puts melee on the edge and archers inside', () => {
    const w = testWorld();
    const list = [...army(w)];
    for (let i = 0; i < 5; i++) list.push(spawnUnit(w, 'swordsman', PLAYER, (20 + i) * T, 24 * T));
    orderFormation(w, list, 'box');
    run(w, 20);
    const cx = list.reduce((a, u) => a + u.x, 0) / list.length;
    const cy = list.reduce((a, u) => a + u.y, 0) / list.length;
    const dist = (u: (typeof list)[0]): number => Math.max(Math.abs(u.x - cx), Math.abs(u.y - cy));
    const archers = list.filter((u) => u.type === 'archer').map(dist);
    const melee = list.filter((u) => u.type !== 'archer').map(dist);
    expect(Math.max(...archers)).toBeLessThan(Math.max(...melee));
  });

  it('a formation marches at the slowest unit’s pace', () => {
    const w = testWorld();
    const list = army(w);
    orderFormation(w, list, 'block');
    run(w, 10);
    orderMove(w, list, 34 * T, 34 * T);
    run(w, 3);
    const cav = list.find((u) => u.type === 'cavalry')!;
    const sw = list.find((u) => u.type === 'swordsman')!;
    expect(cav.speedCap).toBeCloseTo(1.4);
    expect(Math.abs(Math.hypot(cav.x - 34 * T, cav.y - 34 * T) - Math.hypot(sw.x - 34 * T, sw.y - 34 * T))).toBeLessThan(40);
  });
});

describe('hostile', () => {
  it('hostile soldiers attack an enemy they pass; stood-down ones walk on', () => {
    const w = testWorld();
    const foe = spawnUnit(w, 'villager', ENEMY, 30 * T, 22 * T);
    foe.hp = 1000;
    foe.maxHp = 1000;
    const a = spawnUnit(w, 'swordsman', PLAYER, 20 * T, 20 * T);
    const b = spawnUnit(w, 'swordsman', PLAYER, 20 * T, 24 * T);
    b.hostile = false;
    orderMove(w, [a], 40 * T, 20 * T);
    orderMove(w, [b], 40 * T, 24 * T);
    run(w, 6);
    expect(a.order.type).toBe('attack');
    expect(b.order.type).toBe('move');
  });

  it('scouts are not hostile by default', () => {
    const w = testWorld();
    expect(spawnUnit(w, 'scout', PLAYER, 10 * T, 10 * T).hostile).toBe(false);
    expect(spawnUnit(w, 'archer', PLAYER, 10 * T, 12 * T).hostile).toBe(true);
  });
});
