import '@fontsource/press-start-2p/400.css';
import './style.css';
import { Audio } from './audio';
import { DIFFICULTY, RENDER, type DifficultyKey } from './config';
import { Game } from './game';
import { CHANGELOG, VERSION } from './changelog';
import { TitleScene } from './title';
import { setTheme } from './render/sprites';
import { MAPS, type MapKind } from './sim/map';
import { drawGraph, fmtClock, summaryRows, type GraphKey, type MatchResults } from './stats';

const $ = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;

const canvas = $<HTMLCanvasElement>('game');
canvas.width = RENDER.width;
canvas.height = RENDER.height;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const audio = new Audio();
const DIFF_KEY = 'pk-difficulty';
const MAP_KEY = 'pk-map';
let mapKind: MapKind = 'rivers';
try {
  const m = localStorage.getItem(MAP_KEY) as MapKind | null;
  if (m && m in MAPS) mapKind = m;
} catch {
  /* ignore */
}
let difficulty: DifficultyKey = 'normal';
try {
  const d = localStorage.getItem(DIFF_KEY) as DifficultyKey | null;
  if (d && d in DIFFICULTY) difficulty = d;
} catch {
  /* ignore */
}

// Only the Sakura Village look is offered for now (Classic is kept in the code for later).
setTheme('sakura');

/**
 * Fill the whole window. Pick the biggest whole-number scale that still leaves
 * room for the HUD (at least 600 x 320 game pixels), then size the view to the
 * window at that scale, so there are no black bars and pixels stay crisp.
 */
function fit(): void {
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (W < 50 || H < 50) return; // hidden or not laid out yet
  let s = Math.max(1, Math.min(Math.floor(W / 600), Math.floor(H / 320)));
  let iw = Math.ceil(W / s);
  let ih = Math.ceil(H / s);
  if (W < 600 || H < 320) {
    // a phone: keep a 640 x 360 view and shrink it to fit
    s = Math.floor(Math.min(W / 640, H / 360) * 100) / 100;
    iw = 640;
    ih = 360;
  }
  RENDER.width = iw;
  RENDER.height = ih;
  canvas.width = iw;
  canvas.height = ih;
  ctx.imageSmoothingEnabled = false;
  const stage = document.getElementById('stage')!;
  stage.style.width = `${iw * s}px`;
  stage.style.height = `${ih * s}px`;
  document.documentElement.style.setProperty('--s', String(s));
}
window.addEventListener('resize', fit);
fit();

let game: Game = new Game(canvas, audio, { difficulty: 'hard', map: mapKind, seed: Math.floor(Math.random() * 1e9), attract: true });
let screen: 'title' | 'menu' | 'playing' | 'paused' | 'over' = 'title';
const title = new TitleScene();

function show(id: string | null): void {
  for (const s of ['title', 'menu', 'pause', 'over', 'help', 'changelog']) $(s).classList.toggle('hidden', s !== id);
}

const DIFF_HINTS: Record<DifficultyKey, string> = {
  easy: 'The enemy builds slowly and makes mistakes.',
  normal: 'A fair fight.',
  hard: 'The enemy builds fast and reacts at once.',
};

function renderMenu(): void {
  for (const b of Array.from($('diff').querySelectorAll('button'))) b.classList.toggle('on', b.dataset.d === difficulty);
  $('diff-hint').textContent = DIFF_HINTS[difficulty];
  for (const b of Array.from($('map-choice').querySelectorAll('button'))) b.classList.toggle('on', b.dataset.m === mapKind);
  $('map-hint').textContent = MAPS[mapKind].hint;
  $('mute-btn').textContent = audio.muted ? 'Sound: off' : 'Sound: on';
  $('music-btn').textContent = audio.musicOn ? 'Music: on' : 'Music: off';
  $('music-btn2').textContent = audio.musicOn ? 'Music: on' : 'Music: off';
}

function startGame(): void {
  audio.unlock();
  audio.play('click');
  game.destroy();
  game = new Game(canvas, audio, { difficulty, map: mapKind, seed: Math.floor(Math.random() * 1e9) });
  game.onPauseRequest = () => pause();
  game.onGameOver = (won) => setTimeout(() => gameOver(won), 1200);
  audio.setMood('calm');
  screen = 'playing';
  show(null);
  $('hud').classList.remove('hidden');
}

function toMenu(): void {
  game.destroy();
  game = new Game(canvas, audio, { difficulty: 'hard', map: mapKind, seed: Math.floor(Math.random() * 1e9), attract: true });
  screen = 'menu';
  audio.setMood('calm');
  $('hud').classList.add('hidden');
  show('menu');
  renderMenu();
}

function pause(): void {
  if (screen !== 'playing') return;
  game.paused = true;
  screen = 'paused';
  show('pause');
}

function resume(): void {
  game.paused = false;
  screen = 'playing';
  show(null);
}

let lastResults: MatchResults | null = null;
let graphKey: GraphKey = 'army';

function gameOver(won: boolean): void {
  const r = game.results();
  lastResults = r;
  screen = 'over';
  $('over-title').textContent = won ? 'Victory!' : 'Defeat';
  $('over-sub').textContent = `${won ? 'You destroyed the enemy Town Center' : 'Your Town Center fell'} after ${fmtClock(r.time)}. The enemy opened with: ${r.opening}.`;
  const rows = summaryRows(r);
  const lead = (a: string, b: string): [string, string] => {
    const x = Number(a);
    const y = Number(b);
    if (Number.isNaN(x) || Number.isNaN(y) || x === y) return ['', ''];
    return x > y ? [' lead', ''] : ['', ' lead'];
  };
  $('over-stats').innerHTML =
    `<tr><th></th><th class="you">You</th><th class="foe">Enemy</th></tr>` +
    rows
      .map(([k, a, b], i) => {
        // for "Units lost", fewer is better; for age times, values are clocks, not compared
        const [la, lb] = k === 'Units lost' ? lead(b, a) : lead(a, b);
        const gap = i === 4 || i === 10 ? ' class="gap"' : '';
        return `<tr${gap}><td>${k}</td><td class="v${la}">${a}</td><td class="v${lb}">${b}</td></tr>`;
      })
      .join('');
  show('over');
  drawOverGraph();
}

function drawOverGraph(): void {
  if (!lastResults) return;
  for (const b of Array.from($('graph-tabs').querySelectorAll('button'))) b.classList.toggle('on', b.dataset.g === graphKey);
  drawGraph($<HTMLCanvasElement>('over-graph'), lastResults, graphKey);
}
$('graph-tabs').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b?.dataset.g) return;
  graphKey = b.dataset.g as GraphKey;
  audio.play('click');
  drawOverGraph();
});

let helpReturn: string = 'menu';
function openHelp(from: string): void {
  helpReturn = from;
  show('help');
}

$('diff').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b?.dataset.d) return;
  difficulty = b.dataset.d as DifficultyKey;
  try {
    localStorage.setItem(DIFF_KEY, difficulty);
  } catch {
    /* ignore */
  }
  audio.unlock();
  audio.play('click');
  renderMenu();
});
$('map-choice').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b?.dataset.m) return;
  mapKind = b.dataset.m as MapKind;
  try {
    localStorage.setItem(MAP_KEY, mapKind);
  } catch {
    /* ignore */
  }
  // the menu's background game shows the chosen map
  game.destroy();
  game = new Game(canvas, audio, { difficulty: 'hard', map: mapKind, seed: Math.floor(Math.random() * 1e9), attract: true });
  audio.unlock();
  audio.play('click');
  renderMenu();
});
$('start').addEventListener('click', startGame);
$('mute-btn').addEventListener('click', () => {
  audio.unlock();
  audio.toggleMute();
  audio.play('click');
  renderMenu();
});
for (const id of ['music-btn', 'music-btn2'])
  $(id).addEventListener('click', () => {
    audio.unlock();
    audio.toggleMusic();
    audio.play('click');
    renderMenu();
  });
function renderFull(): void {
  const on = !!document.fullscreenElement;
  for (const id of ['full-btn', 'full-btn2']) $(id).textContent = on ? 'Exit full screen' : 'Full screen';
}
for (const id of ['full-btn', 'full-btn2'])
  $(id).addEventListener('click', () => {
    audio.unlock();
    audio.play('click');
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  });
document.addEventListener('fullscreenchange', () => {
  renderFull();
  fit();
});
$('help-btn').addEventListener('click', () => openHelp('menu'));
$('help-btn2').addEventListener('click', () => openHelp('pause'));
$('help-close').addEventListener('click', () => show(helpReturn));

// ---------- title screen and changelog ----------
function leaveTitle(): void {
  if (screen !== 'title') return;
  audio.unlock();
  audio.play('click');
  audio.setMood('calm');
  screen = 'menu';
  show('menu');
  renderMenu();
}
$('title').addEventListener('click', leaveTitle);
$('title-ver').textContent = `v${VERSION}`;
$('menu-ver').textContent = `Version ${VERSION}`;

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function renderChangelog(): void {
  const list = $('changelog-list');
  list.innerHTML = '';
  for (const e of CHANGELOG) {
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.innerHTML = `v${e.version} &middot; ${e.title} <span class="date">${fmtDate(e.date)}</span>`;
    sec.appendChild(h);
    const ul = document.createElement('ul');
    for (const it of e.items) {
      const li = document.createElement('li');
      li.textContent = it;
      ul.appendChild(li);
    }
    sec.appendChild(ul);
    list.appendChild(sec);
  }
}
$('changelog-btn').addEventListener('click', () => {
  audio.unlock();
  audio.play('click');
  renderChangelog();
  show('changelog');
});
$('changelog-close').addEventListener('click', () => show('menu'));
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', toMenu);
$('again').addEventListener('click', startGame);
$('to-menu').addEventListener('click', toMenu);
$('menu-btn').addEventListener('click', pause);
window.addEventListener('keydown', (e) => {
  if (screen === 'title') {
    if (!e.metaKey && !e.ctrlKey) leaveTitle();
    return;
  }
  if (e.key === 'Escape' && screen === 'menu' && !$('changelog').classList.contains('hidden')) {
    show('menu');
    return;
  }
  if (e.key === 'Escape' && screen === 'playing') {
    if (!game.cancelMode()) pause();
  } else if (e.key === 'Escape' && screen === 'paused') {
    if (!$('help').classList.contains('hidden')) show('pause');
    else resume();
  } else if (e.key === 'Escape' && screen === 'menu' && !$('help').classList.contains('hidden')) {
    show('menu');
  } else if (e.key === 'Enter' && screen === 'menu' && $('help').classList.contains('hidden') && $('changelog').classList.contains('hidden')) startGame();
});
// keep buttons from holding keyboard focus (Space would click them again)
document.addEventListener('mouseup', () => {
  if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
});

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) $('touch-note').hidden = false;

renderMenu();
show('title');

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (screen === 'title') {
    title.update(dt);
    title.render(ctx);
    requestAnimationFrame(frame);
    return;
  }
  game.update(dt);
  if (screen === 'menu' && game.world.winner !== null) {
    game.destroy();
    game = new Game(canvas, audio, { difficulty: 'hard', map: mapKind, seed: Math.floor(Math.random() * 1e9), attract: true });
  }
  game.render(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging in the browser console
(window as unknown as { pk: () => Game }).pk = () => game;
