// Every tunable number in the game lives here. All values are placeholders
// from the design doc v0.1 and are meant to be changed during playtests.

export const RENDER = {
  width: 640, // internal resolution, upscaled by whole numbers only
  height: 360,
  tileSize: 16,
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
  startingPopCap: 10, // from the Town Center
  housePopBonus: 5,
} as const;

export const RESOURCES = {
  berries: { kind: 'food', gatherPerSec: 0.6, amount: 200 },
  sheep: { kind: 'food', gatherPerSec: 0.8, amount: 100 },
  tree: { kind: 'wood', gatherPerSec: 0.6, amount: 100 },
} as const;

export const BUILDINGS = {
  townCenter: { wood: 0, buildSec: 0, size: 3 },
  storehouse: { wood: 60, buildSec: 20, size: 2 },
  house: { wood: 30, buildSec: 15, size: 2 },
  barracks: { wood: 150, buildSec: 40, size: 2 },
} as const;

export const UNITS = {
  villager: { food: 50, wood: 0, hp: 25, attack: 2, rangeTiles: 0, speed: 1.0, trainSec: 10 },
  swordsman: { food: 50, wood: 25, hp: 60, attack: 6, rangeTiles: 0, speed: 0.9, trainSec: 15, bonusVsCavalry: 4 },
  archer: { food: 40, wood: 40, hp: 30, attack: 4, rangeTiles: 5, speed: 1.0, trainSec: 15 },
  cavalry: { food: 80, wood: 30, hp: 70, attack: 5, rangeTiles: 0, speed: 1.6, trainSec: 20 },
} as const;
