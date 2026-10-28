import type { Devnet } from './sim/engine';
import type { RpcChain, RpcConfig } from './rpc/chain';

/** The UI's data source: the in-browser devnet simulator, or a real node read over JSON-RPC (docs/WEB_DESIGN.md section 7) */
export type Chain = Devnet | RpcChain;

/** Data source setting (stored on this device) */
export type SourcePref = { kind: 'sim' } | ({ kind: 'rpc' } & RpcConfig);
