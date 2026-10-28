import { describe, expect, it } from 'vitest';
import type { StepView } from '../chain/views';
import { stamps, stepTimes } from './Tracker';

describe('The times of the steps done', () => {
  // In local time, as the page shows them: #1,870 on the live signet, mined at 01:51:01, final at 04:47:39 the same day
  const at = (day: number, h: number, m: number, s: number) => new Date(2026, 9, day, h, m, s).getTime();
  const step = (key: string, when?: number, state: StepView['state'] = 'done') => ({ key, label: key, state, ink: 'mo', ...(when ? { at: when } : {}) }) as StepView;
  const block = [step('mined', at(16, 1, 51, 1)), step('broadcast'), step('on_btc', at(16, 2, 13, 59)), step('deep', at(16, 2, 52, 2)), step('final', at(16, 4, 47, 39))];

  it('give the clock alone on the day they happened', () => {
    expect(stepTimes(block, at(16, 23, 59, 0))).toEqual(['01:51:01', undefined, '02:13:59', '02:52:02', '04:47:39']);
  });

  it('on an earlier day, the date once, where the day changes: three days later it read "01:51:01" as if it were today', () => {
    expect(stepTimes(block, at(19, 5, 0, 0))).toEqual(['2026-10-16 01:51:01', undefined, '02:13:59', '02:52:02', '04:47:39']);
    // Past midnight the new day's first step gives its date, also today; a step not done gives none
    const late = [step('mined', at(16, 23, 58, 0)), step('on_btc', at(17, 0, 7, 30)), step('deep', at(17, 0, 52, 0)), step('final', at(17, 1, 40, 0), 'active')];
    expect(stepTimes(late, at(17, 1, 0, 0))).toEqual(['2026-10-16 23:58:00', '2026-10-17 00:07:30', '00:52:00', undefined]);
  });
});

describe('The marks that come down', () => {
  const step = (key: string, state: StepView['state']) => ({ key, label: key, state, ink: 'mo' }) as StepView;
  const drawn = (steps: StepView[]) => new Map(steps.map((s) => [s.key, s.state]));

  it("are those of the steps done as the reader watches, not those done before the tracker was drawn", () => {
    const stamped = new Set<string>();
    // An operation's page opened once its first two steps were done: no mark comes down
    const opened = [step('fast', 'done'), step('on_btc', 'done'), step('deep', 'active'), step('final', 'todo')];
    expect([...stamps(null, opened, stamped)]).toEqual([]);
    // Its sixth confirmation comes while the page is open, and BTC final after it
    const deep = [step('fast', 'done'), step('on_btc', 'done'), step('deep', 'done'), step('final', 'active')];
    expect([...stamps(drawn(opened), deep, stamped)]).toEqual(['deep']);
    const final = [step('fast', 'done'), step('on_btc', 'done'), step('deep', 'done'), step('final', 'done')];
    expect([...stamps(drawn(deep), final, stamped)]).toEqual(['deep', 'final']);
    // and stay down as the page is drawn again
    expect([...stamps(drawn(final), final, stamped)]).toEqual(['deep', 'final']);
  });

  it('not that of a step the tracker did not show before', () => {
    expect([...stamps(drawn([step('fast', 'done')]), [step('fast', 'done'), step('on_btc', 'done')], new Set())]).toEqual([]);
  });
});
