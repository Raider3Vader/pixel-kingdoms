import { createMatch } from '../src/sim/map';
import { createBot, updateBot } from '../src/sim/bot';
import { step, ENEMY } from '../src/sim/world';
const { world: w } = createMatch(4);
const bot = createBot(w, ENEMY, 'normal', (process.argv[2] as any) ?? 'rush');
console.log('start', w.winner, w.buildings.map(b => b.type + b.team));
for (let i = 0; i < 30 * 480; i++) {
  updateBot(w, bot, 1/30); step(w, 1/30); w.events.length = 0;
  if (i % (30*30) === 0 || w.winner !== null) {
    const t = w.teams[ENEMY];
    const us = w.units.filter(u => u.team === ENEMY);
    const orders: Record<string, number> = {};
    for (const u of us) { const k = u.type+':'+u.order.type+(u.order.type==='gather'?':'+u.order.phase:''); orders[k] = (orders[k]??0)+1; }
    console.log(Math.round(w.time), 'f', Math.round(t.food), 'w', Math.round(t.wood), 'pop', t.popUsed+'/'+t.popCap, JSON.stringify(orders), w.buildings.filter(b=>b.team===ENEMY).map(b=>b.type+':'+b.progress.toFixed(2)+':q'+b.queue.length).join(' '), 'atk', bot.attacksSent);
    if (w.winner !== null) { console.log('winner', w.winner); break; }
  }
}
