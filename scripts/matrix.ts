// Plays every opening against every other (Normal vs Normal) and prints results.
// npm run balance -- [difficultyA] [difficultyB] [rivers|inlandSea]
import { createMatch } from '../src/sim/map';
import { createBot, updateBot } from '../src/sim/bot';
import { step, PLAYER, ENEMY } from '../src/sim/world';
import type { OpeningKey, DifficultyKey } from '../src/config';
const ops: OpeningKey[] = ['boom', 'rush', 'archers', 'horseRaid'];
const dA = (process.argv[2] ?? 'normal') as DifficultyKey;
const dB = (process.argv[3] ?? 'normal') as DifficultyKey;
const map = (process.argv[4] ?? 'rivers') as 'rivers' | 'inlandSea';
const wins: Record<string, number> = {};
for (const a of ops) for (const b of ops) {
  const rows: string[] = [];
  for (const seed of [1, 2]) {
    const { world: w } = createMatch(seed * 100 + ops.indexOf(a) * 10 + ops.indexOf(b), { map });
    const A = createBot(w, PLAYER, dA, a), B = createBot(w, ENEMY, dB, b);
    for (let i = 0; i < 30 * 60 * 40 && w.winner === null; i++) { updateBot(w, A, 1/30); updateBot(w, B, 1/30); step(w, 1/30); w.events.length = 0; }
    const win = w.winner === null ? 'draw' : w.winner === PLAYER ? a : b;
    wins[win] = (wins[win] ?? 0) + 1;
    rows.push(`${win}@${Math.round(w.time / 60)}m`);
  }
  console.log(`${a.padEnd(9)} vs ${b.padEnd(9)} ${rows.join('  ')}`);
}
console.log(wins);
