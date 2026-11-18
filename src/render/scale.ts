/** Largest whole-number scale that fits the internal resolution in the window (min 1). */
export function integerScale(winW: number, winH: number, baseW: number, baseH: number): number {
  return Math.max(1, Math.floor(Math.min(winW / baseW, winH / baseH)));
}
