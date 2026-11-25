// Every tunable number in the game lives here. All values are placeholders
// from the design doc and are meant to be changed during playtests.

export type ResKind = 'food' | 'wood' | 'gold' | 'stone';
export const RES_KINDS: ResKind[] = ['food', 'wood', 'gold', 'stone'];
export type Cost = Partial<Record<ResKind, number>>;
export type UnitType = 'villager' | 'swordsman' | 'spearman' | 'archer' | 'cavalry' | 'scout' | 'samurai' | 'fishingBoat' | 'warBoat' | 'transportBoat';
export type BuildingType =
  | 'townCenter'
  | 'storehouse'
  | 'house'
  | 'farm'
  | 'barracks'
  | 'stable'
  | 'market'
  | 'wall'
  | 'gate'
  | 'stoneWall'
  | 'stoneGate'
  | 'watchTower'
  | 'guardTower'
  | 'pagoda'
  | 'dock';
export type ResourceType = 'berries' | 'sheep' | 'tree' | 'gold' | 'stone' | 'farm' | 'fish';

/** 0 = Dark Age, 1 = Feudal Age, 2 = Imperial Age. */
export type Age = 0 | 1 | 2;
export const AGES: { name: string; cost: Cost; sec: number }[] = [
  { name: 'Dark Age', cost: {}, sec: 0 },
  { name: 'Feudal Age', cost: { food: 350, wood: 150 }, sec: 60 },
  { name: 'Imperial Age', cost: { food: 600, wood: 300, gold: 200 }, sec: 90 },
];

/** When the music switches to the battle loop: this many fighting hits within `window` seconds; back to calm after `calmAfter` quiet seconds. */
export const MUSIC_MOOD = { hits: 5, window: 6, calmAfter: 18 };

export const SIM = {
  tickHz: 30,
  unitRadius: 5, // px
  meleeReach: 6, // px beyond both radii
  scanSec: 0.5, // how often idle soldiers look for enemies
} as const;

/** Internal resolution. width and height change with the window (see main.ts). */
export const RENDER: { width: number; height: number; tileSize: number; hudTop: number; hudBottom: number } = {
  width: 640, // upscaled by whole numbers only
  height: 360,
  tileSize: 16,
  hudTop: 12, // px of internal resolution covered by the top bar
  hudBottom: 54, // px covered by the bottom panel
};

export const MAP = {
  widthTiles: 96,
  heightTiles: 96,
  cameraMargin: 32, // px the camera may scroll past the map edge
} as const;

export const ECONOMY = {
  carryCapacity: 10,
  startingFood: 100,
  startingWood: 50,
  startingGold: 0,
  startingStone: 0,
  startingVillagers: 3,
  startingScouts: 1, // a fast Scout for exploring
  maxPop: 100,
  maxQueue: 5,
} as const;

export const RESOURCES: Record<ResourceType, { name: string; kind: ResKind; gatherPerSec: number; amount: number }> = {
  berries: { name: 'Persimmon tree', kind: 'food', gatherPerSec: 0.6, amount: 200 },
  sheep: { name: 'Sheep', kind: 'food', gatherPerSec: 0.8, amount: 100 },
  tree: { name: 'Tree', kind: 'wood', gatherPerSec: 0.6, amount: 100 },
  gold: { name: 'Gold mine', kind: 'gold', gatherPerSec: 0.45, amount: 400 },
  stone: { name: 'Stone quarry', kind: 'stone', gatherPerSec: 0.45, amount: 350 },
  farm: { name: 'Rice paddy', kind: 'food', gatherPerSec: 0.5, amount: 300 },
  fish: { name: 'Fish', kind: 'food', gatherPerSec: 0.7, amount: 225 },
};

/** Rice paddies replant themselves for this much when they run dry. */
export const FARM = { reseed: { wood: 40 } as Cost };

export interface BuildingStats {
  name: string;
  cost: Cost;
  age: Age; // first age it can be built in
  buildSec: number;
  size: number; // tiles per side
  hp: number;
  sight: number; // tiles
  pop: number; // population cap it adds once finished
  dropoff: boolean;
  trains: UnitType[];
  attack: number; // per arrow; 0 = does not shoot
  attackSec: number;
  rangeTiles: number;
  garrison: number; // troops it can hold
  walkable?: boolean; // units walk over it (rice paddies)
  wall?: boolean; // one-tile wall piece
  gate?: boolean; // lets its own side through unless locked
  limit?: number; // most a player may have (counting ones still being built)
}

const B = (o: Partial<BuildingStats> & Pick<BuildingStats, 'name' | 'cost' | 'buildSec' | 'size' | 'hp'>): BuildingStats => ({
  age: 0,
  sight: 4,
  pop: 0,
  dropoff: false,
  trains: [],
  attack: 0,
  attackSec: 0,
  rangeTiles: 0,
  garrison: 0,
  ...o,
});

export const BUILDINGS: Record<BuildingType, BuildingStats> = {
  townCenter: B({ name: 'Town Center', cost: {}, buildSec: 0, size: 3, hp: 600, sight: 8, pop: 10, dropoff: true, trains: ['villager'], attack: 4, attackSec: 1.5, rangeTiles: 6 }),
  storehouse: B({ name: 'Storehouse', cost: { wood: 60 }, buildSec: 20, size: 2, hp: 200, sight: 5, dropoff: true }),
  house: B({ name: 'House', cost: { wood: 30 }, buildSec: 15, size: 2, hp: 150, pop: 5 }),
  farm: B({ name: 'Rice paddy', cost: { wood: 60 }, buildSec: 12, size: 2, hp: 100, sight: 2, walkable: true }),
  barracks: B({ name: 'Barracks', cost: { wood: 150 }, buildSec: 40, size: 2, hp: 350, sight: 5, trains: ['swordsman', 'spearman', 'archer'] }),
  stable: B({ name: 'Stable', cost: { wood: 125 }, age: 1, buildSec: 35, size: 2, hp: 300, sight: 5, trains: ['cavalry', 'scout'] }),
  market: B({ name: 'Market', cost: { wood: 175 }, age: 1, buildSec: 45, size: 2, hp: 300, sight: 5 }),
  wall: B({ name: 'Wooden wall', cost: { wood: 4 }, buildSec: 4, size: 1, hp: 150, sight: 2, wall: true }),
  gate: B({ name: 'Wooden gate', cost: { wood: 25 }, buildSec: 10, size: 1, hp: 220, sight: 3, wall: true, gate: true }),
  stoneWall: B({ name: 'Stone wall', cost: { stone: 6 }, age: 1, buildSec: 8, size: 1, hp: 700, sight: 2, wall: true }),
  stoneGate: B({ name: 'Stone gate', cost: { stone: 30 }, age: 1, buildSec: 15, size: 1, hp: 900, sight: 3, wall: true, gate: true }),
  watchTower: B({ name: 'Watch tower', cost: { wood: 60 }, buildSec: 25, size: 1, hp: 250, sight: 11 }),
  guardTower: B({ name: 'Guard tower', cost: { wood: 50, stone: 125 }, age: 1, buildSec: 45, size: 1, hp: 700, sight: 10, attack: 5, attackSec: 1.5, rangeTiles: 7, garrison: 5 }),
  // a landmark: one per player, costly, and very hard to bring down
  pagoda: B({ name: 'Pagoda', cost: { wood: 300, stone: 200, gold: 100 }, age: 2, buildSec: 80, size: 2, hp: 1200, sight: 7, trains: ['samurai'], limit: 1 }),
  // built on the shore; boats are trained here and fishing boats bring their catch back to it
  dock: B({ name: 'Dock', cost: { wood: 120 }, buildSec: 35, size: 2, hp: 300, sight: 6, trains: ['fishingBoat', 'warBoat', 'transportBoat'] }),
};

/** Watch tower to guard tower, done at the tower. */
export const TOWER_UPGRADE = { cost: { wood: 40, stone: 100 } as Cost, sec: 30 };

export const MARKET = {
  buy: { food: 60, wood: 60, stone: 80 } as Record<'food' | 'wood' | 'stone', number>, // gold per 100
  lot: 100,
  tradePerSec: 0.15, // gold each market earns on its own
  merchantPerSec: 0.15, // extra gold per merchant
  merchantCost: { food: 40, wood: 40, gold: 40 } as Cost,
  merchantSec: 20,
  maxMerchants: 5,
};

/** Repairing a building from nothing to full costs this share of its price. */
export const REPAIR = { costShare: 0.25, rateShare: 0.5 };

export interface Tier {
  name: string;
  hp: number;
  attack: number;
  attackSec: number;
  armor: number; // reduces melee damage
  arrowArmor: number; // reduces arrow damage
  rangeTiles?: number;
  bonusScale?: number; // multiplies the unit's bonus damage
}

export interface UnitStats {
  name: string; // the unit line, e.g. 'Sword line'
  cost: Cost;
  age: Age; // first age it can be trained in
  rangeTiles: number; // 0 = melee
  speed: number; // tiles per second
  trainSec: number;
  sight: number; // tiles
  bonus: Partial<Record<UnitType, number>>; // extra damage vs these units
  naval?: boolean; // sails on water instead of walking on land
  carries?: number; // a transport: how many land units fit aboard
  vsBuildings: number; // damage multiplier against buildings
  tiers: [Tier, Tier, Tier]; // stats in the Dark, Feudal and Imperial Ages
}

const same = (t: Tier): [Tier, Tier, Tier] => [t, t, t];

// samurai and the boats are added just below
export const UNITS = {
  villager: { name: 'Villager', cost: { food: 50 }, age: 0, rangeTiles: 0, speed: 1.6, trainSec: 10, sight: 5, bonus: {}, vsBuildings: 1, tiers: same({ name: 'Villager', hp: 25, attack: 2, attackSec: 1.5, armor: 0, arrowArmor: 0 }) },
  swordsman: {
    name: 'Sword line',
    cost: { food: 50, wood: 20 },
    age: 0,
    rangeTiles: 0,
    speed: 1.4,
    trainSec: 15,
    sight: 5,
    bonus: { spearman: 2 },
    vsBuildings: 1.5,
    tiers: [
      { name: 'Militia', hp: 40, attack: 4, attackSec: 1.2, armor: 0, arrowArmor: 0 },
      { name: 'Man-at-Arms', hp: 55, attack: 6, attackSec: 1.0, armor: 1, arrowArmor: 1 },
      { name: 'Champion', hp: 75, attack: 8, attackSec: 0.85, armor: 2, arrowArmor: 4 },
    ],
  },
  spearman: {
    name: 'Spear line',
    cost: { food: 35, wood: 25 },
    age: 0,
    rangeTiles: 0,
    speed: 1.5,
    trainSec: 14,
    sight: 5,
    bonus: { cavalry: 10, scout: 7 },
    vsBuildings: 1,
    tiers: [
      { name: 'Spearman', hp: 38, attack: 3, attackSec: 1.2, armor: 0, arrowArmor: 0, bonusScale: 0.8 },
      { name: 'Pikeman', hp: 50, attack: 4, attackSec: 1.1, armor: 0, arrowArmor: 1 },
      { name: 'Halberdier', hp: 62, attack: 5, attackSec: 1.0, armor: 1, arrowArmor: 2, bonusScale: 1.25 },
    ],
  },
  archer: {
    name: 'Archer line',
    cost: { food: 30, wood: 40, gold: 10 },
    age: 1,
    rangeTiles: 5,
    speed: 1.6,
    trainSec: 15,
    sight: 7,
    bonus: {},
    vsBuildings: 0.5,
    tiers: [
      { name: 'Archer', hp: 30, attack: 6, attackSec: 1.1, armor: 0, arrowArmor: 0 },
      { name: 'Archer', hp: 30, attack: 6, attackSec: 1.1, armor: 0, arrowArmor: 0 },
      { name: 'Longbowman', hp: 35, attack: 7, attackSec: 0.95, armor: 0, arrowArmor: 1, rangeTiles: 6 },
    ],
  },
  cavalry: {
    name: 'Cavalry line',
    cost: { food: 80, wood: 20, gold: 20 },
    age: 1,
    rangeTiles: 0,
    speed: 2.6,
    trainSec: 20,
    sight: 6,
    bonus: { archer: 2 },
    vsBuildings: 1,
    tiers: [
      { name: 'Cavalry', hp: 75, attack: 6, attackSec: 1.0, armor: 1, arrowArmor: 1 },
      { name: 'Cavalry', hp: 75, attack: 6, attackSec: 1.0, armor: 1, arrowArmor: 1 },
      { name: 'Knight', hp: 100, attack: 8, attackSec: 0.95, armor: 2, arrowArmor: 4 },
    ],
  },
  scout: {
    name: 'Scout',
    cost: { food: 60 },
    age: 1,
    rangeTiles: 0,
    speed: 3.0,
    trainSec: 15,
    sight: 9,
    bonus: { archer: 2 },
    vsBuildings: 0.3,
    tiers: [
      { name: 'Scout', hp: 40, attack: 3, attackSec: 1.1, armor: 0, arrowArmor: 0 },
      { name: 'Scout', hp: 50, attack: 4, attackSec: 1.0, armor: 0, arrowArmor: 1 },
      { name: 'Scout', hp: 60, attack: 5, attackSec: 1.0, armor: 1, arrowArmor: 1 },
    ],
  },
} as Record<UnitType, UnitStats>;

UNITS.samurai = {
  name: 'Samurai',
  cost: { food: 65, gold: 45 },
  age: 2,
  rangeTiles: 0,
  speed: 1.5,
  trainSec: 18,
  sight: 6,
  // a master swordsman: quick, hard-hitting blows that cut down other foot soldiers
  bonus: { swordsman: 3, spearman: 3, archer: 3 },
  vsBuildings: 1.2,
  tiers: [
    // Imperial Age only: a bit better than a Champion man for man, at a gold price
    { name: 'Samurai', hp: 75, attack: 9, attackSec: 0.8, armor: 2, arrowArmor: 3 },
    { name: 'Samurai', hp: 75, attack: 9, attackSec: 0.8, armor: 2, arrowArmor: 3 },
    { name: 'Samurai', hp: 75, attack: 9, attackSec: 0.8, armor: 2, arrowArmor: 3 },
  ],
};
UNITS.fishingBoat = {
  name: 'Fishing boat',
  cost: { wood: 60 },
  age: 0,
  rangeTiles: 0,
  speed: 1.8,
  trainSec: 18,
  sight: 5,
  bonus: {},
  vsBuildings: 0,
  naval: true,
  tiers: same({ name: 'Fishing boat', hp: 60, attack: 0, attackSec: 1, armor: 0, arrowArmor: 2 }),
};
UNITS.warBoat = {
  name: 'War boat',
  cost: { wood: 90, gold: 30 },
  age: 1,
  rangeTiles: 5,
  speed: 2.0,
  trainSec: 25,
  sight: 7,
  bonus: { fishingBoat: 4, warBoat: 2 },
  vsBuildings: 1,
  naval: true,
  tiers: [
    { name: 'War boat', hp: 110, attack: 6, attackSec: 1.4, armor: 1, arrowArmor: 2 },
    { name: 'War boat', hp: 110, attack: 6, attackSec: 1.4, armor: 1, arrowArmor: 2 },
    { name: 'Heavy war boat', hp: 150, attack: 7, attackSec: 1.2, armor: 2, arrowArmor: 3, rangeTiles: 6 },
  ],
};

UNITS.transportBoat = {
  name: 'Transport boat',
  cost: { wood: 100 },
  age: 0,
  rangeTiles: 0,
  speed: 2.0,
  trainSec: 25,
  sight: 6,
  bonus: {},
  vsBuildings: 0,
  naval: true,
  carries: 8,
  tiers: same({ name: 'Transport boat', hp: 150, attack: 0, attackSec: 1, armor: 1, arrowArmor: 3 }),
};

/** Archers fighting an enemy right next to them do this share of their damage. */
export const CLOSE_QUARTERS = { tiles: 1.2, share: 0.5 };

/** A unit's stats in a given age. */
/** Way of the Warrior, the Pagoda's upgrade: every Samurai gets this much more. */
export const WAY_OF_WARRIOR = { cost: { food: 200, gold: 200 } as Cost, sec: 45, hp: 20, armor: 1, arrowArmor: 1 };

/** A unit's stats in an age; `warrior` is true once the team has Way of the Warrior. */
export function unitStats(type: UnitType, age: Age, warrior = false): UnitStats & Tier {
  const u = UNITS[type];
  const t = u.tiers[Math.max(age, u.age)];
  const s = { ...u, ...t, rangeTiles: t.rangeTiles ?? u.rangeTiles };
  if (warrior && type === 'samurai') {
    s.hp += WAY_OF_WARRIOR.hp;
    s.armor += WAY_OF_WARRIOR.armor;
    s.arrowArmor += WAY_OF_WARRIOR.arrowArmor;
  }
  return s;
}

/** Damage one hit does: bonus, close-quarters penalty for archers, then armor (at least 1). */
export function hitDamage(att: UnitType, attAge: Age, def: UnitType, defAge: Age, closeQuarters: boolean, attWarrior = false, defWarrior = false): number {
  const a = unitStats(att, attAge, attWarrior);
  const d = unitStats(def, defAge, defWarrior);
  const ranged = a.rangeTiles > 0;
  let dmg = a.attack + (a.bonus[def] ?? 0) * (a.bonusScale ?? 1);
  if (ranged && closeQuarters) dmg *= CLOSE_QUARTERS.share;
  dmg -= ranged ? d.arrowArmor : d.armor;
  return Math.max(1, dmg);
}

export function costText(c: Cost): string {
  return (Object.entries(c) as [ResKind, number][])
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
}

export type DifficultyKey = 'easy' | 'normal' | 'hard' | 'impossible';
export interface Difficulty {
  name: string;
  decideSec: number; // how often the enemy makes decisions
  villagerTarget: number;
  mistakeChance: number; // chance to skip a decision
  reactSec: number; // delay before it responds to a raid
  armyScale: number; // multiplies the army size it waits for before attacking
  firstAttackSec: number; // it never attacks before this game time
  speed: number; // gathering, training and research speed (1 = the player's)
  extraTrainers: number; // more Barracks and Stables than its plan asks for
  counters: boolean; // shifts its army toward units that beat yours
  retreats: boolean; // pulls back from fights it is losing and regroups
}
export const DIFFICULTY: Record<DifficultyKey, Difficulty> = {
  easy: { name: 'Hannah Mode', decideSec: 4, villagerTarget: 15, mistakeChance: 0.35, reactSec: 12, armyScale: 0.75, firstAttackSec: 420, speed: 1, extraTrainers: 0, counters: false, retreats: false },
  normal: { name: 'Zach Mode', decideSec: 2, villagerTarget: 22, mistakeChance: 0.1, reactSec: 6, armyScale: 1, firstAttackSec: 300, speed: 1, extraTrainers: 0, counters: false, retreats: false },
  hard: { name: 'Jordan Mode', decideSec: 0.5, villagerTarget: 22, mistakeChance: 0, reactSec: 1, armyScale: 1.25, firstAttackSec: 0, speed: 1, extraTrainers: 0, counters: true, retreats: true },
  impossible: { name: 'Hudson Mode', decideSec: 0.25, villagerTarget: 40, mistakeChance: 0, reactSec: 0, armyScale: 1.5, firstAttackSec: 0, speed: 1.4, extraTrainers: 2, counters: true, retreats: true },
};

export type OpeningKey = 'boom' | 'rush' | 'archers' | 'horseRaid' | 'fastImperial' | 'fortress' | 'swarm';
export interface Opening {
  name: string;
  foodShare: number; // share of food+wood villagers on food
  barracksAtVillagers: number;
  feudalAtVillagers: number; // starts advancing at this many villagers
  imperialAtVillagers: number;
  earlyVillagerCap: number | null; // villager limit until the first attack
  maxStorehouses: number;
  mix: Partial<Record<UnitType, number>>; // army weights before the first attack
  mixAfter: Partial<Record<UnitType, number>>; // and after it
  firstAttackSize: number;
  attackGrow: number;
  towers: number; // guard towers it builds once in the Feudal Age
  maxBarracks?: number; // default 2 (1 on Easy)
  lateMixAge?: number; // switch to mixAfter on reaching this age, even before attacking
}
export const OPENINGS: Record<OpeningKey, Opening> = {
  boom: { name: 'Boom', foodShare: 0.55, barracksAtVillagers: 18, feudalAtVillagers: 16, imperialAtVillagers: 26, earlyVillagerCap: null, maxStorehouses: 3, mix: { swordsman: 2, spearman: 1, archer: 2, cavalry: 1 }, mixAfter: { swordsman: 2, spearman: 1, archer: 2, cavalry: 2, samurai: 2 }, firstAttackSize: 12, attackGrow: 3, towers: 2 },
  rush: { name: 'Rush', foodShare: 0.6, barracksAtVillagers: 7, feudalAtVillagers: 13, imperialAtVillagers: 24, earlyVillagerCap: 10, maxStorehouses: 1, mix: { swordsman: 2, spearman: 1 }, mixAfter: { swordsman: 2, spearman: 1, archer: 1, samurai: 1 }, firstAttackSize: 4, attackGrow: 2, towers: 0 },
  archers: { name: 'Archer line', foodShare: 0.5, barracksAtVillagers: 9, feudalAtVillagers: 11, imperialAtVillagers: 24, earlyVillagerCap: null, maxStorehouses: 2, mix: { archer: 3, spearman: 1 }, mixAfter: { archer: 2, swordsman: 1, cavalry: 1 }, firstAttackSize: 7, attackGrow: 3, towers: 1 },
  horseRaid: { name: 'Horse raid', foodShare: 0.65, barracksAtVillagers: 9, feudalAtVillagers: 11, imperialAtVillagers: 24, earlyVillagerCap: null, maxStorehouses: 2, mix: { cavalry: 1 }, mixAfter: { cavalry: 2, spearman: 1, archer: 1 }, firstAttackSize: 4, attackGrow: 2, towers: 0 },
  // races to the Imperial Age behind a few guards, then comes with Samurai and Knights
  fastImperial: { name: 'Fast Imperial', foodShare: 0.55, barracksAtVillagers: 14, feudalAtVillagers: 13, imperialAtVillagers: 19, earlyVillagerCap: null, maxStorehouses: 3, mix: { spearman: 1, archer: 1 }, mixAfter: { samurai: 3, cavalry: 2, archer: 1 }, firstAttackSize: 12, attackGrow: 4, towers: 1, lateMixAge: 2 },
  // guard towers ring its town, archers fill them when raided; then one big push
  fortress: { name: 'Fortress', foodShare: 0.5, barracksAtVillagers: 12, feudalAtVillagers: 13, imperialAtVillagers: 24, earlyVillagerCap: null, maxStorehouses: 2, mix: { archer: 2, spearman: 2 }, mixAfter: { archer: 2, swordsman: 2, cavalry: 1, samurai: 1 }, firstAttackSize: 16, attackGrow: 4, towers: 5 },
  // three Barracks pump out cheap foot soldiers in steady waves
  swarm: { name: 'Swarm', foodShare: 0.6, barracksAtVillagers: 8, feudalAtVillagers: 17, imperialAtVillagers: 28, earlyVillagerCap: 15, maxStorehouses: 1, mix: { swordsman: 2, spearman: 2 }, mixAfter: { swordsman: 2, spearman: 2, archer: 1 }, firstAttackSize: 8, attackGrow: 2, towers: 0, maxBarracks: 3 },
};
