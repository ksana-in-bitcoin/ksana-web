/**
 * The BTC tip from the Bitcoin RPC, read sparingly. On the hosted signet the Bitcoin RPC is a proxy that answers each address
 * 120 times a minute at most (core/signet/services/btc-proxy.mjs), and the wallet's coins, path C and top-ups go through it as well:
 * a page that asked it for the tip at every poll (every 2.5 seconds) used that up with four or five tabs open. So the tip is
 *
 * - read by a tab in view only, and by the page's tabs together at most once in `TIP_EVERY_MS`: a tab posts each reading to the
 *   others (`tabsChannel`, a BroadcastChannel), which take it instead of reading;
 * - taken from every answer that carries it (`note`): the Bitcoin RPC is asked for its chain before path C or a top-up is signed,
 *   so a top-up's expiry is checked against the tip as it is then.
 *
 * A reading carries the hash of the tip's block and the time it gives, its header's, which dates that BTC block as a Bitcoin
 * explorer does (`RpcChain.btcStamps`). Only a Bitcoin RPC on the page's BTC network is read (`BtcRpc.checkChain`).
 *
 * Between readings the page's BTC height follows what else it knows, which shows a new BTC block at the next poll: the
 * indexer's BTC height, the settlements' confirmations and the anchors of new fast-lane blocks (`RpcChain.currentBtcHeight`).
 */

import type { TipReading } from '../../wallet/btc';

/** The page's tabs together read the tip at most once in this long */
export const TIP_EVERY_MS = 30_000;

/** Where the page's tabs share their readings: a BroadcastChannel (`tabsChannel`), or a stand-in in tests */
export interface TipChannel {
  post(message: unknown): void;
  listen(heard: (message: unknown) => void): void;
  close(): void;
}

/** The page's tabs on one origin, through a BroadcastChannel of this name; null where there is none (each tab then reads for itself) */
export function tabsChannel(name: string): TipChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(name);
  } catch {
    return null;
  }
  return {
    post: (message) => {
      try {
        channel.postMessage(message);
      } catch {
        /* closed */
      }
    },
    listen: (heard) => {
      channel.onmessage = (e: MessageEvent) => heard(e.data);
    },
    close: () => channel.close(),
  };
}

/** Whether the page is out of view (another tab, a minimised window, a phone's locked screen) */
export function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Calls `fn` each time the page comes into view again; gives what stops it */
export function whenShown(fn: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const heard = () => {
    if (document.visibilityState === 'visible') fn();
  };
  document.addEventListener('visibilitychange', heard);
  return () => document.removeEventListener('visibilitychange', heard);
}

export class BtcTipReader {
  /** The tip's height as last read, by this tab or another; undefined until then */
  height: number | undefined;
  /** The hash of the tip's block, and the time it gives (its header's), where that reading gave them */
  hash: string | undefined;
  time: number | undefined;
  /** When it was read */
  private at = Number.NEGATIVE_INFINITY;
  /** When this tab last asked: a read that failed waits as long as one that answered */
  private asked = Number.NEGATIVE_INFINITY;

  constructor(
    /**
     * Asks the Bitcoin RPC for its tip (`getblockchaininfo`): undefined when the answer gives no height; throws when it fails, or
     * when the Bitcoin RPC is on another BTC network (`BtcRpc.checkChain`)
     */
    private readonly read: () => Promise<TipReading | undefined>,
    private readonly opts: {
      now: () => number;
      hidden: () => boolean;
      channel: TipChannel | null;
      /** Another tab's reading changed the height */
      changed: () => void;
    },
  ) {
    opts.channel?.listen((message) => this.hear(message));
  }

  /** When the height was read, by this tab or another; undefined until then */
  get readAt(): number | undefined {
    return Number.isFinite(this.at) ? this.at : undefined;
  }

  /** At every poll of the data source: reads when this tab is in view and no tab has read for `TIP_EVERY_MS`; a failed read throws */
  async poll(): Promise<void> {
    const now = this.opts.now();
    if (this.opts.hidden() || now - Math.max(this.at, this.asked) < TIP_EVERY_MS) return;
    this.asked = now;
    const tip = await this.read();
    if (tip) this.note(tip);
  }

  /** A reading of the tip, by `poll` or from another answer of the Bitcoin RPC: taken, and posted to the other tabs */
  note(tip: TipReading): void {
    this.height = tip.height;
    this.hash = tip.hash;
    this.time = tip.time;
    this.at = this.opts.now();
    this.opts.channel?.post({ height: tip.height, at: this.at, ...(tip.hash !== undefined ? { hash: tip.hash } : {}), ...(tip.time !== undefined ? { time: tip.time } : {}) });
  }

  /** Another tab's reading: taken in place of reading when it is newer than this tab's */
  private hear(message: unknown): void {
    if (typeof message !== 'object' || message === null) return;
    const { height, at, hash, time } = message as { height?: unknown; at?: unknown; hash?: unknown; time?: unknown };
    if (typeof height !== 'number' || !Number.isSafeInteger(height) || height < 0 || typeof at !== 'number' || !Number.isFinite(at)) return;
    if (hash !== undefined && (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash))) return;
    if (time !== undefined && (typeof time !== 'number' || !Number.isSafeInteger(time) || time <= 0)) return;
    // a time ahead of this tab's clock would hold its reads back for longer than it should
    const when = Math.min(at, this.opts.now());
    if (when <= this.at) return;
    const changed = height !== this.height || hash !== this.hash || time !== this.time;
    this.height = height;
    this.hash = hash;
    this.time = time;
    this.at = when;
    if (changed) this.opts.changed();
  }

  close(): void {
    this.opts.channel?.close();
  }
}
