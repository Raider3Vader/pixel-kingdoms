// Small chiptune-style sound effects made with the Web Audio API. No files.

export type Sound =
  | 'select'
  | 'command'
  | 'place'
  | 'built'
  | 'trained'
  | 'hit'
  | 'arrow'
  | 'death'
  | 'alert'
  | 'error'
  | 'victory'
  | 'defeat'
  | 'click';

const MUTE_KEY = 'pk-muted';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<Sound, number>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage blocked: default to sound on */
    }
  }

  /** Must be called from a user gesture (a click or key press). */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.14;
        this.master.connect(this.ctx.destination);
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.14;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 1, slideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g);
    g.connect(this.master!);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, vol: number, freq: number): void {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master!);
    src.start(start);
  }

  play(s: Sound): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const gap = s === 'hit' || s === 'arrow' ? 0.07 : s === 'death' ? 0.12 : s === 'alert' ? 4 : 0.04;
    if (now - (this.last.get(s) ?? -9) < gap) return;
    this.last.set(s, now);
    switch (s) {
      case 'click':
        this.tone(1200, now, 0.03, 'square', 0.4);
        break;
      case 'select':
        this.tone(880, now, 0.05, 'square', 0.5);
        break;
      case 'command':
        this.tone(660, now, 0.04, 'square', 0.45);
        this.tone(990, now + 0.05, 0.05, 'square', 0.45);
        break;
      case 'place':
        this.tone(140, now, 0.12, 'square', 0.7, 70);
        this.noise(now, 0.08, 0.5, 400);
        break;
      case 'built':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.07, 0.09, 'square', 0.5));
        break;
      case 'trained':
        this.tone(587, now, 0.06, 'square', 0.45);
        this.tone(880, now + 0.07, 0.08, 'square', 0.45);
        break;
      case 'hit':
        this.noise(now, 0.05, 0.6, 1800);
        this.tone(220, now, 0.04, 'square', 0.25, 110);
        break;
      case 'arrow':
        this.tone(1800, now, 0.07, 'triangle', 0.35, 600);
        break;
      case 'death':
        this.tone(440, now, 0.25, 'square', 0.4, 80);
        break;
      case 'alert':
        for (let i = 0; i < 3; i++) {
          this.tone(784, now + i * 0.24, 0.1, 'square', 0.55);
          this.tone(587, now + i * 0.24 + 0.12, 0.1, 'square', 0.55);
        }
        break;
      case 'error':
        this.tone(110, now, 0.15, 'square', 0.5);
        break;
      case 'victory':
        [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.13, i === 5 ? 0.5 : 0.12, 'square', 0.5));
        break;
      case 'defeat':
        [392, 349, 311, 262].forEach((f, i) => this.tone(f, now + i * 0.22, i === 3 ? 0.6 : 0.2, 'square', 0.5));
        break;
    }
  }
}
