/**
 * The wallet's BTC balance under the node data source: the coins on the wallet address, read the same way path C and top-ups read
 * them (`walletUtxos`: the Bitcoin RPC's Esplora or scan, else Unisat's own listing). The Ksana node does not know BTC balances, so
 * without either source the wallet points to the user's own BTC wallet instead.
 */

import { useCallback, useEffect, useState } from 'react';
import type { RpcChain } from '../chain/rpc/chain';
import { pageHidden } from '../chain/rpc/btcTip';
import { walletUtxos, type UtxoSourceKind, type WalletUtxo } from './btc';
import type { ConnectedWallet } from './connect';

export interface BtcHoldings {
  /** Sats in every output on the address, confirmed or not */
  total: number;
  /** The part of `total` not confirmed yet; undefined when the source does not say (Unisat's listing carries no heights) */
  unconfirmed: number | undefined;
  /** Number of outputs */
  outputs: number;
}

export function holdingsOf(utxos: readonly WalletUtxo[], source: UtxoSourceKind): BtcHoldings {
  let total = 0;
  let unconfirmed = 0;
  for (const u of utxos) {
    total += u.valueSat;
    if (u.height === undefined) unconfirmed += u.valueSat;
  }
  return { total, unconfirmed: source === 'btc_rpc' ? unconfirmed : undefined, outputs: utxos.length };
}

export type BtcBalance =
  /** Neither a Bitcoin RPC nor a wallet listing its coins: the balance is in the user's BTC wallet */
  | { state: 'unavailable' }
  | { state: 'loading' }
  /** stale: the last read failed with this message, and the numbers are from the read before it */
  | { state: 'ready'; holdings: BtcHoldings; stale?: string }
  | { state: 'failed'; message: string };

/** After a new BTC block the balance is read again within this long, at a random moment, so that the pages open then do not all ask at once */
export const BLOCK_SPREAD_MS = 30_000;
/** Coming back to the page reads the balance again when the last read is at least this old */
export const STALE_AFTER_MS = 60_000;
/**
 * A block first seen this soon after the page came back into view came while it was out of view, where the page reads no BTC tip (the
 * first look at it on coming back is a sync's, chain/rpc/chain.ts)
 */
export const RETURN_MS = 10_000;

/**
 * When the BTC balance is read again after the wallet page opens. The page does not poll: on the signet page every read takes from
 * the hosted proxy's Esplora budget, which path C and top-ups share with every open page (D-108). It reads again after each new BTC
 * block, at a moment spread over `BLOCK_SPREAD_MS`, and on coming back into view when a block's read came due while it was out of
 * view or the last read is `STALE_AFTER_MS` old; a block first seen on coming back is read at once, unless a read made then covers
 * it. The card's refresh button reads at once. Any read covers a block whose read is still waiting, and blocks that come while one
 * waits wait with it.
 */
export class BtcReadSchedule {
  private height: number | undefined;
  private lastRead = -Infinity;
  private waiting: ReturnType<typeof setTimeout> | undefined;
  /** A block's read came due while the page was out of view */
  private missed = false;
  /** When the page last came back into view */
  private back = -Infinity;

  /** `readAgain` starts a read; `hidden` says whether the page is out of view */
  constructor(
    private readonly readAgain: () => void,
    private readonly hidden: () => boolean = pageHidden,
  ) {}

  /** A read starts at `now` */
  read(now: number): void {
    this.lastRead = now;
    this.missed = false;
    this.cancel();
  }

  /**
   * The BTC tip is at `height`. After a new block (or a BTC reorg to another height) the balance is read again at a moment `random`
   * (in [0, 1)) of the way into `BLOCK_SPREAD_MS`; the first height seen is covered by the opening read.
   */
  tip(height: number, random: number, now: number = Date.now()): void {
    const known = this.height;
    this.height = height;
    if (known === undefined || known === height) return;
    // The first block seen on coming back came while the page was out of view: a page coming back is not one of many asking at once
    if (now - this.back < RETURN_MS) {
      const covered = this.lastRead >= this.back;
      this.back = -Infinity;
      if (!covered) this.readAgain();
      return;
    }
    if (this.waiting !== undefined) return;
    this.waiting = setTimeout(() => {
      this.waiting = undefined;
      if (this.hidden()) this.missed = true;
      else this.readAgain();
    }, Math.floor(random * BLOCK_SPREAD_MS));
  }

  /** The page came back into view at `now` */
  shown(now: number): void {
    this.back = now;
    if (this.missed || now - this.lastRead >= STALE_AFTER_MS) this.readAgain();
  }

  /** No read waits any longer (the page closed, or a read started) */
  cancel(): void {
    clearTimeout(this.waiting);
    this.waiting = undefined;
  }
}

/**
 * The last holdings read for each data source and account: moving between the wallet's pages closes and opens the wallet home, which
 * shows them while it reads again instead of a blank card
 */
const remembered = new WeakMap<RpcChain, Map<string, BtcHoldings>>();

function rememberedOf(rpc: RpcChain | null, wallet: ConnectedWallet | null): BtcBalance {
  const holdings = rpc && wallet ? remembered.get(rpc)?.get(wallet.account.account) : undefined;
  return holdings ? { state: 'ready', holdings } : { state: 'loading' };
}

function remember(rpc: RpcChain, wallet: ConnectedWallet, holdings: BtcHoldings): void {
  let byAccount = remembered.get(rpc);
  if (!byAccount) remembered.set(rpc, (byAccount = new Map()));
  byAccount.set(wallet.account.account, holdings);
}

/**
 * The connected wallet's BTC balance, read when the wallet page opens, then as `BtcReadSchedule` says and when `refresh` is called.
 * A failed read keeps the last numbers, marked stale. The third value says whether a read is under way.
 */
export function useBtcBalance(rpc: RpcChain | null, wallet: ConnectedWallet | null): [BtcBalance, () => void, boolean] {
  const [balance, setBalance] = useState<BtcBalance>(() => rememberedOf(rpc, wallet));
  const [reading, setReading] = useState(false);
  const [tick, setTick] = useState(0);
  const [schedule] = useState(() => new BtcReadSchedule(() => setTick((n) => n + 1)));
  const btcHeight = rpc?.currentBtcHeight();
  // Another wallet or data source: start over instead of showing the previous account's coins
  useEffect(() => setBalance(rememberedOf(rpc, wallet)), [rpc, wallet]);
  useEffect(() => {
    if (!rpc || !wallet) return;
    let cancelled = false;
    schedule.read(Date.now());
    setReading(true);
    walletUtxos(wallet, rpc)
      .then(
        (r) => {
          if (cancelled) return;
          if (!r) return setBalance({ state: 'unavailable' });
          const holdings = holdingsOf(r.utxos, r.source);
          remember(rpc, wallet, holdings);
          setBalance({ state: 'ready', holdings });
        },
        (e: unknown) => {
          if (cancelled) return;
          const message = e instanceof Error ? e.message : String(e);
          setBalance((prev) => (prev.state === 'ready' ? { state: 'ready', holdings: prev.holdings, stale: message } : { state: 'failed', message }));
        },
      )
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
      setReading(false);
    };
  }, [rpc, wallet, tick, schedule]);
  useEffect(() => {
    if (btcHeight !== undefined) schedule.tip(btcHeight, Math.random());
  }, [btcHeight, schedule]);
  useEffect(() => () => schedule.cancel(), [schedule]);
  useEffect(() => {
    if (!rpc || !wallet || typeof document === 'undefined') return;
    const onChange = () => {
      if (document.visibilityState === 'visible') schedule.shown(Date.now());
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [rpc, wallet, schedule]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return [balance, refresh, reading];
}
