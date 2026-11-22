import { describe, expect, it } from 'vitest';
import { MUSIC_PATTERNS, noteHz } from './audio';

describe('music', () => {
  it('turns note names into the right pitch', () => {
    expect(noteHz('A4')).toBeCloseTo(440);
    expect(noteHz('A5')).toBeCloseTo(880);
    expect(noteHz('C4')).toBeCloseTo(261.63, 1);
    expect(noteHz('F#3')).toBeCloseTo(185.0, 1);
  });

  it('every loop has the right number of bars and steps, and every note is real', () => {
    for (const p of Object.values(MUSIC_PATTERNS)) {
      expect(p.bass.length).toBe(p.bars);
      for (const part of [p.koto, p.flute]) {
        expect(part.length).toBe(p.bars);
        for (const bar of part) {
          expect(bar.length).toBe(p.steps);
          for (const n of bar) if (n !== '.' && n !== '-') expect(noteHz(n)).toBeGreaterThan(40);
        }
      }
      for (const n of p.bass) expect(noteHz(n)).toBeLessThan(150);
    }
    for (const d of MUSIC_PATTERNS.battle.drums) expect(d.length).toBe(16);
  });

  it('uses only Japanese scale notes: D yo for the calm loop, E in for the battle loop', () => {
    const name = (n: string): string => n.replace(/\d/, '');
    const scaleOk = (parts: string[][][], bass: string[], scale: string[]): void => {
      for (const part of parts) for (const bar of part) for (const n of bar) if (n !== '.' && n !== '-') expect(scale).toContain(name(n));
      for (const n of bass) expect(scale).toContain(name(n));
    };
    scaleOk([MUSIC_PATTERNS.calm.koto, MUSIC_PATTERNS.calm.flute], MUSIC_PATTERNS.calm.bass, ['D', 'E', 'G', 'A', 'B']);
    scaleOk([MUSIC_PATTERNS.battle.koto, MUSIC_PATTERNS.battle.flute], MUSIC_PATTERNS.battle.bass, ['E', 'F', 'A', 'B', 'C']);
  });
});
