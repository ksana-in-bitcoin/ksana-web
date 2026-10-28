import type { Messages } from '..';

/** Operation list (pages/Ops.tsx) */
const ops: Messages['ops'] = {
  title: 'Operations',
  tabs: {
    label: 'Operation view',
    latest: 'Latest',
    mempool: 'Mempool',
    /** Node data source: only operations submitted from this page */
    pendingLocal: 'Pending here',
  },

  filter: {
    label: 'Filter by path',
    all: 'All paths',
    /** Filter option: A · Merged */
    path: (path: string, label: string) => `${path} · ${label}`,
    failedOnly: 'Failed only',
    none: 'No matching operations',
  },

  mempool: {
    localOnly: 'Showing only operations submitted from this page and not yet included.',
    /** list is "producer amount KSA" items, already joined with the list separator */
    minFees: (list: string) => `Minimum sponsor fee by producer: ${list}`,
    waited: 'Waiting',
    note: 'Note',
    emptyLocal: 'No pending operations from this page',
    empty: 'The mempool is empty',
    total: (n: number) => `${n} total`,
    /** "Note" column: what it's still waiting for */
    why: {
      nativeConfirmed: 'Confirmed on BTC; forced inclusion in the next block',
      nativeWaiting: 'Waiting for BTC confirmation',
      /** n of the `need` BTC confirmations forced inclusion takes */
      nativeConfs: (n: number, need: number) => `${n}\u00a0of\u00a0${need} BTC ${need === 1 ? 'confirmation' : 'confirmations'}; forced inclusion once it has ${need}`,
      backlog: 'Settlement backlog at limit; fast paths paused',
      censored: 'Producers won’t include this account; you can use Path C instead',
      /** producers is a list of producer names */
      lowFee: (producers: string) => `Below the minimum sponsor fee of ${producers}; only some producers will include it`,
      nonce: (nonce: string) => `Waiting for nonce ${nonce} to be included first`,
      /** An operation the pool no longer has, kept while the keyboard is in the table */
      gone: 'No longer waiting',
    },
  },
};

export default ops;
