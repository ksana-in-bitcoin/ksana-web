import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Data source settings (app/SourcePanel.tsx) and node connection errors */
const source: Messages['source'] = {
  title: 'Data source',
  state: { live: 'Connected', connecting: 'Connecting…', error: 'Disconnected' },
  tip: (height: string) => `Tip #${height}`,
  push: { ws: 'WebSocket push', poll: 'Polling every 2.5 s' },
  lastSync: (ago: string) => `Last sync ${ago}`,
  indexer: (url: ReactNode) => <>Indexer {url}</>,
  indexerHalted: (reason: string) => `Halted: ${reason}`,
  btc: (url: ReactNode) => <>Bitcoin RPC {url}</>,
  noBtc: 'No Bitcoin RPC: Path C and top-ups use the wallet’s interface or manually entered UTXOs',
  noIndexer: 'No indexer connected; the Verify page can’t compare state roots',
  fromLink: 'Named in the page’s link: used in this tab only, not saved. Another node connected here is saved.',

  kind: { sim: 'In-browser simulator', rpc: 'Node RPC' },
  simHint: 'No services needed; reloading the page regenerates the chain',
  nodeUrl: 'Node JSON-RPC',
  nodeUrlHint: 'The node must allow this page via --rpc-cors, or enter a same-origin proxy path (like /rpc)',
  indexerUrl: 'Indexer JSON-RPC (optional)',
  indexerUrlHint: 'The indexer has no CORS setting; only a same-origin proxy path works',
  btcUrl: 'Bitcoin RPC (optional)',
  btcUrlHint: 'Same-origin proxy path to bitcoind’s JSON-RPC, credentials stay in the proxy; Path C and top-ups use it to list UTXOs and broadcast',
  network: 'Network',
  devnet: 'devnet (regtest)',

  action: {
    connect: 'Connect to node',
    reconnect: 'Reconnect',
    toSim: 'Switch to simulator',
    regenerate: 'Regenerate simulated chain',
  },

  /** Connection errors: the result first, then what to do; node error messages are shown as-is */
  error: {
    noUrl: 'Enter the node’s JSON-RPC URL',
    otherNetwork: (node: string, chainId: string, chosen: string) =>
      `The node is on ${node} (chain_id ${chainId}), not ${chosen}. Choose ${node} as the network, or connect to a ${chosen} node.`,
    mainnet: (chainId: string) => `The node is on mainnet (chain_id ${chainId}). This page does not support mainnet yet; connect to a devnet or signet node.`,
    unknownChain: (chainId: string) => `The node reports chain_id ${chainId}, which belongs to no Ksana network; check the address.`,
    rpc: (code: string, message: string) => `Node returned error ${code}: ${message}`,
    timeout: (url: string) => `Connection to ${url} timed out; make sure the node is running, then retry`,
    unreachable: (url: string, origin: string) => `Can’t reach ${url}. Make sure the node is running and allows ${origin} via --rpc-cors.`,
    /** A path on this page's own server (such as /rpc) that gets no answer: no CORS to set, the connection is what failed */
    offline: (url: string) => `Can’t reach ${url}: check the network connection.`,
    /** The node, or the proxy in front of it, answered with a 5xx, as while the node restarts: the result, with no guess at the cause (WEB_DESIGN 8.1) */
    unavailable: (url: string, status: string) => `The node is not answering for now: ${url} returned HTTP ${status}.`,
    /** Stands in for the page origin when there is none (outside a browser) */
    thisPage: 'this page’s origin',
  },
};

export default source;
