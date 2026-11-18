import { describe, expect, it } from 'vitest';
import { integerScale } from './scale';

describe('integerScale', () => {
  it('picks 2x for a 1280x720 window', () => expect(integerScale(1280, 720, 640, 360)).toBe(2));
  it('picks 3x for a 1920x1080 window', () => expect(integerScale(1920, 1080, 640, 360)).toBe(3));
  it('never goes fractional', () => expect(integerScale(1900, 1000, 640, 360)).toBe(2));
  it('never drops below 1x', () => expect(integerScale(300, 200, 640, 360)).toBe(1));
});
