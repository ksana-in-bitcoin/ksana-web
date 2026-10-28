import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BLOCK_SPREAD_MS, BtcReadSchedule, RETURN_MS, STALE_AFTER_MS } from './holdings';

describe('the wallet reads its BTC balance without polling (D-108)', () => {
  let reads: number;
  let hidden: boolean;
  let s: BtcReadSchedule;
  beforeEach(() => {
    vi.useFakeTimers();
    reads = 0;
    hidden = false;
    s = new BtcReadSchedule(
      () => reads++,
      () => hidden,
    );
    // the opening read
    s.read(Date.now());
  });
  afterEach(() => {
    s.cancel();
    vi.useRealTimers();
  });

  it('again after each new BTC block, at a moment spread over BLOCK_SPREAD_MS', () => {
    // the opening read covers the first tip seen, and the same tip again needs nothing
    s.tip(100, 0.5);
    s.tip(100, 0.5);
    vi.advanceTimersByTime(BLOCK_SPREAD_MS);
    expect(reads).toBe(0);
    s.tip(101, 0.5);
    vi.advanceTimersByTime(BLOCK_SPREAD_MS / 2 - 1);
    expect(reads).toBe(0);
    vi.advanceTimersByTime(1);
    expect(reads).toBe(1);
    // a BTC reorg back to a lower tip is a change too
    s.tip(100, 0.999_999);
    vi.advanceTimersByTime(BLOCK_SPREAD_MS);
    expect(reads).toBe(2);
  });

  it('once for blocks that come while a read waits, and not at all when another read starts first', () => {
    s.tip(100, 0);
    s.tip(101, 0.9);
    s.tip(102, 0.1);
    vi.advanceTimersByTime(BLOCK_SPREAD_MS);
    expect(reads).toBe(1);
    s.tip(103, 0.5);
    // the refresh button, say
    s.read(Date.now());
    vi.advanceTimersByTime(BLOCK_SPREAD_MS);
    expect(reads).toBe(1);
  });

  it('at once for a block first seen on coming back into view, unless the read made then covers it', () => {
    s.tip(100, 0);
    // Half a minute out of view, where the page reads no BTC tip: the block that came meanwhile is seen once it is back
    vi.advanceTimersByTime(30_000);
    s.shown(Date.now());
    expect(reads).toBe(0);
    vi.advanceTimersByTime(1_000);
    s.tip(101, 0.9);
    expect(reads).toBe(1);
    s.read(Date.now());
    vi.advanceTimersByTime(BLOCK_SPREAD_MS);
    expect(reads).toBe(1);
    // Two minutes out of view: the read made on coming back covers the block seen just after
    vi.advanceTimersByTime(120_000);
    s.shown(Date.now());
    expect(reads).toBe(2);
    s.read(Date.now());
    vi.advanceTimersByTime(1_000);
    s.tip(102, 0.5);
    vi.advanceTimersByTime(BLOCK_SPREAD_MS);
    expect(reads).toBe(2);
    // A block seen later is read at a moment spread over BLOCK_SPREAD_MS, as ever
    s.shown(Date.now());
    vi.advanceTimersByTime(RETURN_MS);
    s.tip(103, 0.5);
    expect(reads).toBe(2);
    vi.advanceTimersByTime(BLOCK_SPREAD_MS / 2);
    expect(reads).toBe(3);
  });

  it('on coming back into view, when a block came while out of view or the last read is STALE_AFTER_MS old', () => {
    s.tip(100, 0);
    hidden = true;
    s.tip(101, 0.5);
    vi.advanceTimersByTime(BLOCK_SPREAD_MS);
    expect(reads).toBe(0);
    s.shown(Date.now());
    expect(reads).toBe(1);
    s.read(Date.now());
    hidden = false;
    // back again soon after that read, with no block in between: nothing to read
    vi.advanceTimersByTime(STALE_AFTER_MS - 1);
    s.shown(Date.now());
    expect(reads).toBe(1);
    vi.advanceTimersByTime(1);
    s.shown(Date.now());
    expect(reads).toBe(2);
  });

  it('never once the page closes', () => {
    s.tip(100, 0);
    s.tip(101, 0.5);
    s.cancel();
    vi.advanceTimersByTime(BLOCK_SPREAD_MS);
    expect(reads).toBe(0);
  });
});
