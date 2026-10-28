import type { Messages } from '..';

/** Node data source (chain/rpc): on-demand lookups, dropped operations, the indexer and unknown asset names */
const rpc: Messages['rpc'] = {
  pending: 'This operation is still in the node’s mempool; details appear once it’s included.',
  missing: {
    block: 'The node doesn’t have this block',
    /** confs: the BTC confirmations a path C op's transaction needs before a block forces it in (NATIVE_CONFIRMATIONS + ANCHOR_DEPTH) */
    op: (confs: number) =>
      `The node doesn’t know this operation. A Path C operation becomes known to it only once its BTC transaction has ${confs} ${confs === 1 ? 'confirmation' : 'confirmations'} and a block includes it; any other may never have arrived, or may have been dropped from the mempool. This page checks again on its own.`,
    account: 'Couldn’t find this account',
    asset: 'The node doesn’t have this asset: it isn’t a built-in asset, and the node’s index knows no token or collection with this ID',
  },
  badBlockId: 'Invalid format: blocks take a decimal height or a 64-character hex hash',
  dropped: 'The node no longer knows this operation; it may have been dropped from the mempool',
  /** Why a skipped operation won't be included again (status.skipFinal), when the node no longer holds it (D-063) */
  notRequeued: 'the node no longer holds it in its mempool',
  indexerDown: (message: string) => `Indexer unavailable: ${message}`,
  btcRpcDown: (message: string) => `Bitcoin RPC unavailable: ${message}`,
  btcRpcNotJson: (method: string, status: number) => `Bitcoin RPC ${method} returned a response that isn’t JSON (HTTP ${status})`,
  btcRpcFailed: (method: string, code: number, message: string) => `Bitcoin RPC ${method} failed (${code}): ${message}`,
  btcRpcHttp: (method: string, status: number) => `Bitcoin RPC ${method} failed: HTTP ${status}`,
  btcRpcWrongChain: (url: string, chain: string, expected: string) =>
    `The Bitcoin RPC (${url}) is on BTC ${chain}, but this page’s network runs on BTC ${expected}, so it isn’t used to list UTXOs or broadcast. Point the Bitcoin RPC in the data source settings at a BTC ${expected} bitcoind, or clear it to enter UTXOs by hand and broadcast yourself.`,
  skipped: 'Skipped',
  unaccepted: 'Not yet merged into the main chain',
  producer: (n: number) => `Producer ${n}`,
  assetSymbol: (id: string) => `Asset ${id}`,
  assetName: (head: string, tail: string) => `Asset ${head}…${tail}`,
};

export default rpc;
