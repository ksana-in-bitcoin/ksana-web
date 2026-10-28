import { afterEach, describe, expect, it, vi } from 'vitest';
import { BtcTipReader, TIP_EVERY_MS, type TipChannel, tabsChannel } from './btcTip';

/** Tabs on one channel in memory: what one posts, the others hear at once */
function tabs() {
  const listeners: ((message: unknown) => void)[] = [];
  return (): TipChannel => {
    let mine: ((message: unknown) => void) | undefined;
    return {
      post: (message) => {
        for (const l of [...listeners]) if (l !== mine) l(structuredClone(message));
      },
      listen: (heard) => {
        mine = heard;
        listeners.push(heard);
      },
      close: () => {
        if (mine) listeners.splice(listeners.indexOf(mine), 1);
      },
    };
  };
}

describe('The BTC tip is read sparingly', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a tab in view reads it at most once in 30 seconds, a hidden tab not at all', async () => {
    let clock = 1_000_000;
    let hidden = false;
    let tip = 500;
    let reads = 0;
    const reader = new BtcTipReader(
      async () => {
        reads++;
        return { height: tip };
      },
      { now: () => clock, hidden: () => hidden, channel: null, changed: () => undefined },
    );
    await reader.poll();
    expect([reads, reader.height]).toEqual([1, 500]);
    // the data source polls every 2.5 seconds
    for (let t = 2_500; t < TIP_EVERY_MS; t += 2_500) {
      clock += 2_500;
      await reader.poll();
    }
    expect(reads).toBe(1);
    clock += 2_500;
    tip = 501;
    await reader.poll();
    expect([reads, reader.height]).toEqual([2, 501]);
    hidden = true;
    clock += 10 * 60_000;
    await reader.poll();
    expect(reads).toBe(2);
    hidden = false;
    await reader.poll();
    expect(reads).toBe(3);
  });

  it('a read that failed waits as long as one that answered', async () => {
    let clock = 0;
    let down = true;
    let reads = 0;
    const reader = new BtcTipReader(
      async () => {
        reads++;
        if (down) throw new Error('429 Too Many Requests');
        return { height: 600 };
      },
      { now: () => clock, hidden: () => false, channel: null, changed: () => undefined },
    );
    await expect(reader.poll()).rejects.toThrow('429');
    clock += TIP_EVERY_MS - 1;
    await reader.poll();
    expect([reads, reader.height]).toEqual([1, undefined]);
    clock += 1;
    down = false;
    await reader.poll();
    expect([reads, reader.height]).toEqual([2, 600]);
  });

  it("the page's tabs share their readings instead of each reading, hidden tabs included", async () => {
    const open = tabs();
    let clock = 0;
    const reads = new Map<number, number>();
    const changed = new Map<number, number>();
    const count = (m: Map<number, number>, i: number) => m.set(i, (m.get(i) ?? 0) + 1);
    const readers = [0, 1, 2].map(
      (i) =>
        new BtcTipReader(
          async () => {
            count(reads, i);
            return { height: 700 + Math.floor(clock / 60_000) };
          },
          { now: () => clock, hidden: () => i === 2, channel: open(), changed: () => count(changed, i) },
        ),
    );
    // Two minutes of polls, every 2.5 seconds in each tab, the tabs out of step with one another
    for (let t = 0; t < 120_000; t += 500) {
      clock = t;
      const tab = readers[(t / 500) % 5];
      if (tab) await tab.poll();
    }
    // once every 30 seconds in all, by whichever tab in view polled first; on their own the two tabs in view would have read 8 times
    expect((reads.get(0) ?? 0) + (reads.get(1) ?? 0)).toBe(4);
    expect(reads.get(2)).toBeUndefined();
    expect(readers.map((r) => r.height)).toEqual([701, 701, 701]);
    // the hidden tab heard the height change twice (none to 700, 700 to 701)
    expect(changed.get(2)).toBe(2);
  });

  it("another tab's reading counts only when it is well formed and newer, and never from the future", async () => {
    const open = tabs();
    let clock = 50_000;
    let reads = 0;
    let changed = 0;
    const reader = new BtcTipReader(
      async () => {
        reads++;
        return { height: 800 };
      },
      { now: () => clock, hidden: () => false, channel: open(), changed: () => changed++ },
    );
    const other = open();
    for (const bad of [null, 'tip', { height: '801', at: clock }, { height: -1, at: clock }, { height: 1.5, at: clock }, { height: 801, at: Number.NaN }]) other.post(bad);
    expect([reader.height, changed]).toEqual([undefined, 0]);
    await reader.poll();
    expect(reads).toBe(1);
    other.post({ height: 799, at: clock - 1 });
    expect(reader.height).toBe(800);
    // a time ahead of this tab's clock counts as now: the tab reads again 30 seconds later, not an hour later
    clock += 1_000;
    other.post({ height: 801, at: clock + 3_600_000 });
    expect([reader.height, changed]).toEqual([801, 1]);
    clock += TIP_EVERY_MS - 1;
    await reader.poll();
    expect(reads).toBe(1);
    clock += 1;
    await reader.poll();
    expect(reads).toBe(2);
  });

  it('a reading from another answer of the Bitcoin RPC counts, and the other tabs hear it', async () => {
    const open = tabs();
    let reads = 0;
    const read = async () => {
      reads++;
      return { height: 900 };
    };
    const a = new BtcTipReader(read, { now: () => 0, hidden: () => false, channel: open(), changed: () => undefined });
    const b = new BtcTipReader(read, { now: () => 0, hidden: () => false, channel: open(), changed: () => undefined });
    a.note({ height: 905 });
    expect([a.height, b.height]).toEqual([905, 905]);
    await a.poll();
    await b.poll();
    expect(reads).toBe(0);
    b.close();
    a.note({ height: 906 });
    expect(b.height).toBe(905);
  });

  it("a reading carries the hash and the time of the tip's block, which the other tabs hear with it; a malformed one is passed over", async () => {
    const open = tabs();
    let clock = 10_000;
    let changed = 0;
    const [x, y] = ['aa'.repeat(32), 'bb'.repeat(32)];
    const a = new BtcTipReader(async () => ({ height: 1_000, hash: x, time: 9_000 }), { now: () => clock, hidden: () => false, channel: open(), changed: () => undefined });
    const b = new BtcTipReader(async () => undefined, { now: () => clock, hidden: () => true, channel: open(), changed: () => changed++ });
    await a.poll();
    expect([a.height, a.hash, a.time, b.height, b.hash, b.time, changed]).toEqual([1_000, x, 9_000, 1_000, x, 9_000, 1]);
    // the same height with another block: a BTC reorg replaced it
    clock += 1;
    a.note({ height: 1_000, hash: y, time: 9_500 });
    expect([b.hash, b.time, changed]).toEqual([y, 9_500, 2]);
    // a reading with no time (bitcoind before Core 23) has none
    clock += 1;
    a.note({ height: 1_001, hash: x });
    expect([b.height, b.hash, b.time]).toEqual([1_001, x, undefined]);
    const other = open();
    clock += 1;
    for (const time of ['9000', -1, 1.5, Number.NaN]) other.post({ height: 1_002, at: clock, hash: x, time });
    for (const hash of [1, 'AA'.repeat(32), 'aa'.repeat(31), null]) other.post({ height: 1_002, at: clock, hash, time: 9_000 });
    expect([b.height, changed]).toEqual([1_001, 3]);
  });

  it('an answer that gives no height is no reading, and waits as long as one that did', async () => {
    let clock = 0;
    let reads = 0;
    const reader = new BtcTipReader(
      async () => {
        reads++;
        return undefined;
      },
      { now: () => clock, hidden: () => false, channel: null, changed: () => undefined },
    );
    await reader.poll();
    expect([reads, reader.height, reader.readAt]).toEqual([1, undefined, undefined]);
    clock += TIP_EVERY_MS - 1;
    await reader.poll();
    expect(reads).toBe(1);
  });

  it('tabs on one origin share through a BroadcastChannel, where there is one', async () => {
    const a = tabsChannel('ksana-btc-tip test');
    const b = tabsChannel('ksana-btc-tip test');
    if (!a || !b) throw new Error('no BroadcastChannel');
    const heard = new Promise((resolve) => b.listen(resolve));
    a.post({ height: 1, at: 2 });
    expect(await heard).toEqual({ height: 1, at: 2 });
    a.close();
    b.close();
    a.post({ height: 3, at: 4 });
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(tabsChannel('ksana-btc-tip test')).toBeNull();
  });
});
