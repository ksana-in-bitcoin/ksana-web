import type { SourcePref } from '../chain/source';
import type { Locale } from '../i18n';

/**
 * The network a hosted copy of the page was published for (D-107): `deployment.json` next to `index.html` names its node, indexer,
 * Bitcoin RPC proxy and faucet, so a first-time visitor lands on that network instead of the simulator. A copy without the file
 * (the development server, the single-file preview, a page saved to disk) starts in the simulator as before. Paths are taken like
 * the address bar's `?rpc=` parameters: relative to the page.
 *
 *   { "chain": "signet", "rpc": "/rpc", "indexer": "/indexer", "btc": "/btc", "faucet": "/faucet" }
 *
 * `playground` names the contract playground of the deployment's network (core/playground/, D-119) when it is not the hosted one.
 */
export interface Deployment {
  chain: 'devnet' | 'signet';
  rpc: string;
  indexer?: string;
  btc?: string;
  /** The KSA faucet (core/signet/services/faucet.mjs): `POST {"to": <account>}` sends test KSA */
  faucet?: string;
  /** The contract playground on this network, when it is not the hosted one at playground.ksana.network (D-119) */
  playground?: string;
}

declare global {
  interface Window {
    /** `deployment.json` as index.html asked for it, while the scripts downloaded */
    __ksanaDeployment?: Promise<Response>;
  }
}

let deployment: Deployment | null = null;
/** `deployment.json` could not be read (no answer, or a 5xx): the copy may be one published for a network */
let unknown = false;

/** The deployment read at startup; `null` when the page has none */
export function currentDeployment(): Deployment | null {
  return deployment;
}

/** Whether the page could not tell at startup if it was published for a network (`deployment.json` got no answer, or a 5xx) */
export function deploymentUnknown(): boolean {
  return unknown;
}

/** Checks the contents of `deployment.json`; `null` when it is not a deployment */
export function parseDeployment(value: unknown): Deployment | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' && x.trim() !== '' ? x.trim() : undefined);
  const rpc = text(v.rpc);
  if (!rpc || (v.chain !== 'devnet' && v.chain !== 'signet')) return null;
  const indexer = text(v.indexer);
  const btc = text(v.btc);
  const faucet = text(v.faucet);
  const playground = text(v.playground);
  return {
    chain: v.chain, rpc, ...(indexer ? { indexer } : {}), ...(btc ? { btc } : {}), ...(faucet ? { faucet } : {}), ...(playground ? { playground } : {}),
  };
}

/** The hosted contract playground (core/playground/, D-119): a page of its own, on the public signet */
export const PLAYGROUND_URL = 'https://playground.ksana.network/';

/**
 * A link into the contract playground: its home, or `contract` opened there (the playground's `#/open?c=` route, which finds
 * the example it is or reads its ABI). The playground has English and Simplified Chinese: a page in Simplified Chinese asks for
 * that with `?lang=zh-CN`, as the project's site asks this page (D-115)
 */
export function playgroundLink(locale: Locale, contract?: string): string {
  const url = new URL(deployment?.playground ?? PLAYGROUND_URL, typeof window === 'undefined' ? PLAYGROUND_URL : window.location.href);
  if (locale === 'zh-CN') url.searchParams.set('lang', 'zh-CN');
  if (contract) url.hash = `#/open?c=${contract}`;
  return url.toString();
}

/** Whether a contract of `chain` can be opened in the playground: the hosted one runs on the signet, a deployment's own on its network */
export function playgroundHas(chain: 'devnet' | 'signet'): boolean {
  return deployment?.playground ? deployment.chain === chain : chain === 'signet';
}

/** The data source a deployment starts in */
export function deploymentSource(d: Deployment | null = deployment): SourcePref | null {
  if (!d) return null;
  return { kind: 'rpc', url: d.rpc, chain: d.chain, ...(d.indexer ? { indexerUrl: d.indexer } : {}), ...(d.btc ? { btcUrl: d.btc } : {}) };
}

/**
 * Reads `deployment.json` before the first render. A copy without it (a 404, or an answer that is not a deployment, as the development
 * server's page) has no deployment; one that gets no answer or a 5xx cannot tell, and does not take a link's node without asking (store.ts)
 */
export async function loadDeployment(): Promise<void> {
  if (import.meta.env.MODE === 'artifact' || typeof window === 'undefined') return;
  // The request index.html made while the scripts downloaded, a round trip sooner; one made now where there is none
  const early = window.__ksanaDeployment;
  window.__ksanaDeployment = undefined;
  let res: Response;
  try {
    res = await (early ?? fetch(new URL('deployment.json', window.location.href), { cache: 'no-cache' }));
  } catch {
    unknown = true;
    return;
  }
  if (res.status >= 500) unknown = true;
  if (!res.ok) return;
  try {
    deployment = parseDeployment(await res.json());
  } catch {
    deployment = null;
  }
}

/** A claim the faucet did not send: the message is its own words, or the browser's where no answer came (`status` undefined), and `retryAfter` the seconds its Retry-After asks to wait */
export class FaucetError extends Error {
  readonly status: number | undefined;
  readonly retryAfter: number | undefined;
  constructor(message: string, status?: number, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Asks the deployment's faucet to send test KSA to `account` (hex); returns the op_id of the transfer */
export async function claimFromFaucet(url: string, account: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: account }) });
  } catch (e) {
    throw new FaucetError(e instanceof Error ? e.message : String(e));
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // not JSON: reported by status below
  }
  const reply = (typeof body === 'object' && body !== null ? body : {}) as { op_id?: unknown; error?: unknown };
  if (!res.ok || typeof reply.op_id !== 'string') {
    // In seconds, as the faucet writes it (core/signet/services/faucet.mjs)
    const wait = Number(res.headers.get('retry-after') ?? '');
    throw new FaucetError(typeof reply.error === 'string' ? reply.error : `HTTP ${res.status}`, res.status, Number.isFinite(wait) && wait > 0 ? wait : undefined);
  }
  return reply.op_id;
}
