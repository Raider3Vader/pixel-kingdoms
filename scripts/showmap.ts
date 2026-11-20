// Prints a map as text: T tree, ~ water, = bridge, g gold, s stone, f food, H town center, . open.
import { createMatch } from '../src/sim/map';
const seed = Number(process.argv[2] ?? 1);
const { world: w } = createMatch(seed);
const rows: string[] = [];
for (let y = 0; y < w.h; y++) {
  let r = '';
  for (let x = 0; x < w.w; x++) {
    const i = y * w.w + x;
    const e = w.occ[i] ? w.ents.get(w.occ[i]) : undefined;
    if (w.water[i]) r += '~';
    else if (w.bridge[i]) r += '=';
    else if (e?.kind === 'building') r += 'H';
    else if (e?.type === 'tree') r += 'T';
    else if (e?.type === 'gold') r += 'g';
    else if (e?.type === 'stone') r += 's';
    else if (e) r += 'f';
    else r += '.';
  }
  rows.push(r);
}
console.log(rows.join('\n'));
