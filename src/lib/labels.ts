import { fmtInt } from './format';

/** The width of a height label under the overview's lanes, in its 10 px monospace face (0.6 em a character) */
export const heightWidth = (height: number) => fmtInt(height).length * 6;

const LABEL_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/**
 * Every how many heights the fast lane is labeled, with `spacing` px per block in view: the smallest round step that leaves 50 px between
 * two labels, and more once the newest height's label needs it with 10 px beside it (at 50 px, every other label of "123,450" fell to the
 * check below and the labels came unevenly)
 */
export function labelStep(spacing: number, newest: number): number {
  const room = Math.max(50, heightWidth(newest) + 10);
  return LABEL_STEPS.find((n) => n * spacing >= room) ?? 1000;
}

/**
 * The heights the overview labels under a lane, the newest first: a height is labeled where its label starts at `fromX` or further right
 * (clear of the fade at the left edge), at least `floor` px from the next label drawn after it, and far enough from it that the two keep
 * `gap` px between them however long the heights grow ("326,438" and "326,440" 46 px apart touched)
 */
export function spacedHeights(points: readonly { x: number; height: number }[], floor: number, fromX: number, gap = 10): Set<number> {
  const labeled = new Set<number>();
  let lastX = Infinity;
  let lastW = 0;
  for (const { x, height } of [...points].reverse()) {
    const w = heightWidth(height);
    if (lastX - x < Math.max(floor, (lastW + w) / 2 + gap) || x - w / 2 < fromX) continue;
    labeled.add(height);
    lastX = x;
    lastW = w;
  }
  return labeled;
}
