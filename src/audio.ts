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
  private music: Music | null = null;
  private wantMood: MusicMood = 'off';
  muted = false;
  musicOn = true;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
      this.musicOn = localStorage.getItem(MUSIC_KEY) !== '0';
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
        this.music = new Music(this.ctx, this.master);
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyMood();
  }

  /** What the music should be doing now. It only actually plays once audio is unlocked and music is on. */
  setMood(mood: MusicMood): void {
    this.wantMood = mood;
    this.applyMood();
  }

  get mood(): MusicMood {
    return this.wantMood;
  }

  private applyMood(): void {
    this.music?.setMood(this.musicOn && !this.muted ? this.wantMood : 'off');
  }

  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    try {
      localStorage.setItem(MUSIC_KEY, this.musicOn ? '1' : '0');
    } catch {
      /* ignore */
    }
    this.applyMood();
    return this.musicOn;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.14;
    this.applyMood();
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

// ---------- music ----------
// Two loops written for the game and played live with the Web Audio API:
// a calm one (koto, a soft drone and a bamboo flute, in a bright Japanese
// "yo" scale) while you build, and a battle one (taiko drums and a fast koto
// in the darker "in" scale) while fighting. They cross-fade when the mood changes.

export type MusicMood = 'calm' | 'battle' | 'off';

const MUSIC_KEY = 'pk-music';

/** Note name to frequency, e.g. 'D4', 'F#3'. */
export function noteHz(n: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  const semi = base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
}

interface Track {
  bpm: number;
  stepsPerBeat: number; // 2 = eighth notes, 4 = sixteenths
  bars: number;
  beatsPerBar: number;
  /** Called once per step: schedule that step's notes at time t. */
  step(m: Music, bus: GainNode, i: number, t: number, stepSec: number): void;
}

// "." is a rest; "-" holds the previous note. One entry per step.
const parse = (s: string): string[] => s.trim().split(/\s+/);

// calm: D yo scale (D E G A B), 8 bars of 4 beats, eighth-note steps
const CALM_BASS = ['D2', 'D2', 'G2', 'A2', 'B1', 'G2', 'A2', 'D2'];
const CALM_KOTO = [
  'D4 A4 D5 E5 . A4 D5 .',
  'D4 A4 D5 E5 G5 E5 D5 A4',
  'G3 D4 G4 A4 . D4 B4 .',
  'A3 E4 A4 B4 D5 B4 A4 E4',
  'B3 E4 G4 B4 . G4 E4 .',
  'G3 D4 G4 B4 A4 G4 D4 .',
  'A3 E4 A4 B4 . E5 D5 B4',
  'D4 A4 D5 . A4 . D4 .',
].map(parse);
const CALM_FLUTE = [
  '. . . . . . . .',
  '. . . . . . . .',
  'A5 - - - B5 - A5 -',
  'G5 - E5 - - - - -',
  'E5 - - G5 A5 - - -',
  'B5 - A5 - G5 - E5 -',
  'D5 - - - E5 - - -',
  '. . . . . . . .',
].map(parse);

// battle: E in scale (E F A B C), 4 bars of 4 beats, sixteenth-note steps
const BATTLE_BASS = ['E2', 'E2', 'F2', 'B1'];
// O big taiko, o small taiko, x rim click
const BATTLE_DRUM = parse('O . . o O . x . O . o o O . x x');
const BATTLE_DRUM_FILL = parse('O . o o O . o o O o o o O O O O');
const BATTLE_KOTO = [
  'E4 . E4 B4 . E4 C5 . E4 . B4 . A4 . F4 .',
  'E4 . E4 B4 . E4 C5 . E5 . C5 . B4 . A4 .',
  'F4 . F4 C5 . F4 E5 . F4 . C5 . B4 . A4 .',
  'B3 . B3 F4 . B3 A4 . B4 . A4 . F4 . E4 .',
].map(parse);
const BATTLE_LEAD = [
  'E5 - - - - - F5 - E5 - - - B4 - - -',
  'C5 - - - B4 - A4 - B4 - - - - - - -',
  'F5 - - - E5 - C5 - E5 - - - F5 - - -',
  'E5 - - - - - - - . . . . . . . .',
].map(parse);

export const TRACKS: Record<'calm' | 'battle', Track> = {
  calm: {
    bpm: 76,
    stepsPerBeat: 2,
    bars: 8,
    beatsPerBar: 4,
    step(m, bus, i, t, sp) {
      const bar = Math.floor(i / 8) % 8;
      const s = i % 8;
      const loop = Math.floor(i / 64);
      if (s === 0) m.drone(noteHz(CALM_BASS[bar]), t, sp * 8, bus);
      const k = CALM_KOTO[bar][s];
      if (k !== '.') m.koto(noteHz(k), t, s === 0 ? 0.5 : 0.32, bus);
      // the flute sits out every other time round, so the loop breathes
      if (loop % 2 === 1) {
        const f = CALM_FLUTE[bar][s];
        if (f !== '.' && f !== '-') {
          let len = 1;
          while (s + len < 8 && CALM_FLUTE[bar][s + len] === '-') len++;
          m.flute(noteHz(f), t, sp * len, bus);
        }
      }
    },
  },
  battle: {
    bpm: 116,
    stepsPerBeat: 4,
    bars: 4,
    beatsPerBar: 4,
    step(m, bus, i, t, sp) {
      const bar = Math.floor(i / 16) % 4;
      const s = i % 16;
      const loop = Math.floor(i / 64);
      if (s === 0) m.drone(noteHz(BATTLE_BASS[bar]), t, sp * 16, bus, 0.32);
      const d = (bar === 3 ? BATTLE_DRUM_FILL : BATTLE_DRUM)[s];
      if (d === 'O') m.taiko(t, 1, bus);
      else if (d === 'o') m.taiko(t, 0.45, bus, 1.6);
      else if (d === 'x') m.rim(t, bus);
      const k = BATTLE_KOTO[bar][s];
      if (k !== '.') m.koto(noteHz(k), t, 0.26, bus);
      if (loop % 2 === 1) {
        const f = BATTLE_LEAD[bar][s];
        if (f !== '.' && f !== '-') {
          let len = 1;
          while (s + len < 16 && BATTLE_LEAD[bar][s + len] === '-') len++;
          m.flute(noteHz(f), t, sp * len, bus, 0.3);
        }
      }
    },
  },
};

export class Music {
  private ctx: AudioContext;
  private out: GainNode;
  private buses: Record<'calm' | 'battle', GainNode>;
  private noiseBuf: AudioBuffer;
  private timer: number | null = null;
  private playing: 'calm' | 'battle' | null = null;
  private stepIdx = 0;
  private nextT = 0;
  mood: MusicMood = 'off';
  volume = 0.55;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(dest);
    const mk = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      return g;
    };
    this.buses = { calm: mk(), battle: mk() };
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Change the mood; the new loop starts on the next beat and the old one fades out. */
  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    const now = this.ctx.currentTime;
    const fade = (g: GainNode, to: number, sec: number): void => {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(to, now + sec);
    };
    if (mood === 'off') {
      fade(this.buses.calm, 0, 1.2);
      fade(this.buses.battle, 0, 1.2);
      this.playing = null;
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return;
    }
    const other = mood === 'calm' ? 'battle' : 'calm';
    fade(this.buses[other], 0, mood === 'battle' ? 0.8 : 3);
    fade(this.buses[mood], mood === 'battle' ? 0.7 : 1, mood === 'battle' ? 0.4 : 3); // taiko peaks are loud: keep both loops about as loud
    this.playing = mood;
    this.stepIdx = 0;
    this.nextT = Math.max(now + 0.05, this.nextT);
    if (this.timer === null) this.timer = window.setInterval(() => this.pump(), 50);
    this.pump();
  }

  private pump(): void {
    if (!this.playing) return;
    const tr = TRACKS[this.playing];
    const sp = 60 / tr.bpm / tr.stepsPerBeat;
    const now = this.ctx.currentTime;
    if (this.nextT < now - 0.5) this.nextT = now + 0.05; // the tab was asleep: don't burst out old notes
    while (this.nextT < now + 0.25) {
      tr.step(this, this.buses[this.playing], this.stepIdx, this.nextT, sp);
      this.stepIdx++;
      this.nextT += sp;
    }
  }

  // ---- instruments ----

  koto(f: number, t: number, vol: number, bus: GainNode): void {
    const c = this.ctx;
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    for (const [mult, type, v] of [
      [1, 'triangle', 1],
      [2, 'sine', 0.35],
      [3.01, 'sine', 0.12],
    ] as [number, OscillatorType, number][]) {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f * mult * 1.012, t); // a tiny pitch drop, like a plucked string settling
      o.frequency.exponentialRampToValueAtTime(f * mult, t + 0.05);
      og.gain.value = v;
      o.connect(og);
      og.connect(lp);
      o.start(t);
      o.stop(t + 1.5);
    }
    lp.connect(g);
    g.connect(bus);
  }

  flute(f: number, t: number, dur: number, bus: GainNode, vol = 0.22): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 0.97, t); // shakuhachi players slide up into a note
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 5;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.5, dur));
    lfo.connect(lg);
    lg.connect(o.frequency);
    const end = t + dur + 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + Math.max(0.09, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    lfo.start(t);
    o.stop(end + 0.02);
    lfo.stop(end + 0.02);
    // breath
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 2;
    const ng = c.createGain();
    ng.gain.setValueAtTime(vol * 0.25, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    n.start(t);
    n.stop(t + 0.22);
  }

  drone(f: number, t: number, dur: number, bus: GainNode, vol = 0.2): void {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.4);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    for (const [mult, v] of [
      [1, 1],
      [1.5, 0.3], // a soft fifth above
    ]) {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      og.gain.value = v;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + dur + 0.35);
    }
    g.connect(bus);
  }

  taiko(t: number, vol: number, bus: GainNode, pitch = 1): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(48 * pitch, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 1.1, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.6);
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = c.createGain();
    ng.gain.setValueAtTime(vol * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(bus);
    n.start(t);
    n.stop(t + 0.15);
  }

  rim(t: number, bus: GainNode): void {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.connect(hp);
    hp.connect(g);
    g.connect(bus);
    n.start(t);
    n.stop(t + 0.05);
  }
}

/** The written-out loops, for the tests. */
export const MUSIC_PATTERNS = {
  calm: { bass: CALM_BASS, koto: CALM_KOTO, flute: CALM_FLUTE, steps: 8, bars: 8 },
  battle: { bass: BATTLE_BASS, koto: BATTLE_KOTO, flute: BATTLE_LEAD, steps: 16, bars: 4, drums: [BATTLE_DRUM, BATTLE_DRUM_FILL] },
};
