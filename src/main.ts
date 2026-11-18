import { RENDER } from './config';
import { integerScale } from './render/scale';

// Project skeleton: sets up a crisp, integer-scaled canvas and a frame loop.
// Milestone 1 (map, camera, selection) builds on this.

const canvas = document.getElementById('game') as HTMLCanvasElement;
canvas.width = RENDER.width;
canvas.height = RENDER.height;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

function fit(): void {
  const s = integerScale(window.innerWidth, window.innerHeight, RENDER.width, RENDER.height);
  canvas.style.width = `${RENDER.width * s}px`;
  canvas.style.height = `${RENDER.height * s}px`;
}
window.addEventListener('resize', fit);
fit();

function draw(): void {
  const t = RENDER.tileSize;
  for (let y = 0; y < RENDER.height / t; y++) {
    for (let x = 0; x < RENDER.width / t; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#3b7d3a' : '#357236';
      ctx.fillRect(x * t, y * t, t, t);
    }
  }
  ctx.fillStyle = '#0d0d14';
  ctx.fillRect(200, 160, 240, 40);
  ctx.fillStyle = '#f4f1de';
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Pixel Kingdoms', RENDER.width / 2, 180);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
