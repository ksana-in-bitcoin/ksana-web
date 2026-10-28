import { describe, expect, it } from 'vitest';
import { boundaryLabel } from './RailView';

describe("A boundary's label on the rail", () => {
  // A phone's rail: 340 px wide, bars 2 px wide; "Settled #1,880" takes 14 monospace characters at 6.6 px
  const text = 'Settled #1,880';

  it('runs right of its line while it fits', () => {
    expect(boundaryLabel(100, text, 2, 340)).toMatchObject({ x: 106, anchor: 'start', from: 106 });
    expect(boundaryLabel(100, text, 2, 340).to).toBeCloseTo(198.4);
  });

  it('runs left of its line where it would run past the right edge, a boundary near now', () => {
    const l = boundaryLabel(290, text, 2, 340);
    expect(l).toMatchObject({ x: 288, anchor: 'end', to: 288 });
    expect(l.from).toBeCloseTo(195.6);
    expect(l.to).toBeLessThanOrEqual(340 - 4);
  });
});
