// Renders map overviews to a PNG: npx tsx scripts/mappng.ts out.png seed1 seed2:twin seed3:sea ...
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createMatch } from '../src/sim/map';
const [out, ...seeds] = process.argv.slice(2);
const S = 5;
// seed, seed:riverKind, or seed:sea for the Inland Sea
const maps = seeds.map((s) => {
  const [seed, kind] = s.split(':');
  if (kind === 'sea') return createMatch(Number(seed), { map: 'inlandSea' }).world;
  return (kind ? createMatch(Number(seed), { river: kind as never }) : createMatch(Number(seed))).world;
});
const N = maps[0].w;
const W = maps.length * N * S + (maps.length - 1) * 12;
const H = N * S;
const px = new Uint8Array(W * H * 3).fill(26);
const col: Record<string, [number, number, number]> = { open: [79, 154, 82], tree: [31, 85, 54], water: [47, 111, 154], bridge: [192, 138, 82], gold: [255, 205, 117], stone: [200, 205, 214], food: [240, 125, 42], tc: [65, 166, 246], etc: [239, 125, 87] };
maps.forEach((w, m) => {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const e = w.occ[i] ? w.ents.get(w.occ[i]) : undefined;
      const c = w.water[i] ? col.water : w.bridge[i] === 2 ? [127, 178, 214] as [number, number, number] : w.bridge[i] ? col.bridge : e?.kind === 'building' ? (e.team === 0 ? col.tc : col.etc) : e?.type === 'tree' ? col.tree : e?.type === 'gold' ? col.gold : e?.type === 'stone' ? col.stone : e ? col.food : col.open;
      for (let dy = 0; dy < S; dy++)
        for (let dx = 0; dx < S; dx++) {
          const o = ((y * S + dy) * W + m * (N * S + 12) + x * S + dx) * 3;
          px[o] = c[0];
          px[o + 1] = c[1];
          px[o + 2] = c[2];
        }
    }
});
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) Buffer.from(px.subarray(y * W * 3, (y + 1) * W * 3)).copy(raw, y * (W * 3 + 1) + 1);
const crcT = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer): number => {
  let c = 0xffffffff;
  for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (t: string, d: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
