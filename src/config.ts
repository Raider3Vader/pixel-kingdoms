// Every tunable number in the game lives here. All values are placeholders
// from the design doc and are meant to be changed during playtests.

export type ResKind = 'food' | 'wood';
export type UnitType = 'villager' | 'swordsman' | 'archer' | 'cavalry';
export type BuildingType = 'townCenter' | 'storehouse' | 'house' | 'barracks';
export type ResourceType = 'berries' | 'sheep' | 'tree';

export const SIM = {
  tickHz: 30,
  unitRadius: 5, // px
  meleeReach: 6, // px beyond both radii
  scanSec: 0.5, // how often idle soldiers look for enemies
} as const;

export const RENDER = {
  width: 640, // internal resolution, upscaled by whole numbers only
  height: 360,
  tileSize: 16,
  hudTop: 12, // px of internal resolution covered by the top bar
  hudBottom: 68, // px covered by the bottom panel
} as const;

export const MAP = {
  widthTiles: 64,
  heightTiles: 64,
} as const;

export const ECONOMY = {
  carryCapacity: 10,
  startingFood: 100,
  startingWood: 50,
  startingVillagers: 3,
  startingScouts: 1, // a cavalry rider for exploring
  maxPop: 100,
  maxQueue: 5,
} as const;

export const RESOURCES: Record<ResourceType, { name: string; kind: ResKind; gatherPerSec: number; amount: number }> = {
  berries: { name: 'Berry bush', kind: 'food', gatherPerSec: 0.6, amount: 200 },
  sheep: { name: 'Sheep', kind: 'food', gatherPerSec: 0.8, amount: 100 },
  tree: { name: 'Tree', kind: 'wood', gatherPerSec: 0.6, amount: 100 },
};

export interface BuildingStats {
  name: string;
  wood: number;
  buildSec: number;
  size: number; // tiles per side
  hp: number;
  sight: number; // tiles
  pop: number; // population cap it adds once finished
  dropoff: boolean;
  trains: UnitType[];
  attack: number; // 0 = does not shoot
  attackSec: number;
  rangeTiles: number;
}

export const BUILDINGS: Record<BuildingType, BuildingStats> = {
  townCenter: { name: 'Town Center', wood: 0, buildSec: 0, size: 3, hp: 600, sight: 8, pop: 10, dropoff: true, trains: ['villager'], attack: 4, attackSec: 1.5, rangeTiles: 6 },
  storehouse: { name: 'Storehouse', wood: 60, buildSec: 20, size: 2, hp: 200, sight: 5, pop: 0, dropoff: true, trains: [], attack: 0, attackSec: 0, rangeTiles: 0 },
  house: { name: 'House', wood: 30, buildSec: 15, size: 2, hp: 150, sight: 4, pop: 5, dropoff: false, trains: [], attack: 0, attackSec: 0, rangeTiles: 0 },
  barracks: { name: 'Barracks', wood: 150, buildSec: 40, size: 2, hp: 350, sight: 5, pop: 0, dropoff: false, trains: ['swordsman', 'archer', 'cavalry'], attack: 0, attackSec: 0, rangeTiles: 0 },
};

export interface UnitStats {
  name: string;
  food: number;
  wood: number;
  hp: number;
  attack: number;
  attackSec: number;
  rangeTiles: number; // 0 = melee
  speed: number; // tiles per second
  trainSec: number;
  sight: number; // tiles
  bonus: Partial<Record<UnitType, number>>; // extra damage vs these units
  vsBuildings: number; // damage multiplier against buildings
}

export const UNITS: Record<UnitType, UnitStats> = {
  villager: { name: 'Villager', food: 50, wood: 0, hp: 25, attack: 2, attackSec: 1.5, rangeTiles: 0, speed: 1.6, trainSec: 10, sight: 5, bonus: {}, vsBuildings: 1 },
  swordsman: { name: 'Swordsman', food: 50, wood: 25, hp: 60, attack: 6, attackSec: 1, rangeTiles: 0, speed: 1.4, trainSec: 15, sight: 5, bonus: { cavalry: 4 }, vsBuildings: 1.5 },
  archer: { name: 'Archer', food: 40, wood: 40, hp: 30, attack: 4, attackSec: 1, rangeTiles: 5, speed: 1.6, trainSec: 15, sight: 7, bonus: { swordsman: 4 }, vsBuildings: 0.5 },
  cavalry: { name: 'Cavalry', food: 80, wood: 30, hp: 70, attack: 5, attackSec: 1, rangeTiles: 0, speed: 2.6, trainSec: 20, sight: 6, bonus: { archer: 4 }, vsBuildings: 1 },
};

export type DifficultyKey = 'easy' | 'normal' | 'hard';
export interface Difficulty {
  name: string;
  decideSec: number; // how often the enemy makes decisions
  villagerTarget: number;
  mistakeChance: number; // chance to skip a decision
  reactSec: number; // delay before it responds to a raid
  armyScale: number; // multiplies the army size it waits for before attacking
  firstAttackSec: number; // it never attacks before this game time
}
export const DIFFICULTY: Record<DifficultyKey, Difficulty> = {
  easy: { name: 'Easy', decideSec: 4, villagerTarget: 15, mistakeChance: 0.35, reactSec: 12, armyScale: 0.75, firstAttackSec: 420 },
  normal: { name: 'Normal', decideSec: 2, villagerTarget: 22, mistakeChance: 0.1, reactSec: 6, armyScale: 1, firstAttackSec: 300 },
  hard: { name: 'Hard', decideSec: 0.5, villagerTarget: 30, mistakeChance: 0, reactSec: 1, armyScale: 1.25, firstAttackSec: 0 },
};

export type OpeningKey = 'boom' | 'rush' | 'archers' | 'horseRaid';
export interface Opening {
  name: string;
  foodShare: number; // share of villagers on food
  barracksAtVillagers: number;
  earlyVillagerCap: number | null; // villager limit until the first attack
  maxStorehouses: number;
  mix: Partial<Record<UnitType, number>>; // army weights before the first attack
  mixAfter: Partial<Record<UnitType, number>>; // and after it
  firstAttackSize: number;
  attackGrow: number;
}
export const OPENINGS: Record<OpeningKey, Opening> = {
  boom: { name: 'Boom', foodShare: 0.55, barracksAtVillagers: 18, earlyVillagerCap: null, maxStorehouses: 3, mix: { swordsman: 2, archer: 2, cavalry: 1 }, mixAfter: { swordsman: 2, archer: 2, cavalry: 1 }, firstAttackSize: 12, attackGrow: 3 },
  rush: { name: 'Rush', foodShare: 0.6, barracksAtVillagers: 7, earlyVillagerCap: 10, maxStorehouses: 1, mix: { swordsman: 1 }, mixAfter: { swordsman: 2, archer: 1 }, firstAttackSize: 4, attackGrow: 2 },
  archers: { name: 'Archer line', foodShare: 0.5, barracksAtVillagers: 9, earlyVillagerCap: null, maxStorehouses: 2, mix: { archer: 3, swordsman: 1 }, mixAfter: { archer: 2, swordsman: 1, cavalry: 1 }, firstAttackSize: 7, attackGrow: 3 },
  horseRaid: { name: 'Horse raid', foodShare: 0.65, barracksAtVillagers: 9, earlyVillagerCap: null, maxStorehouses: 2, mix: { cavalry: 1 }, mixAfter: { cavalry: 1, swordsman: 1, archer: 1 }, firstAttackSize: 4, attackGrow: 2 },
};
