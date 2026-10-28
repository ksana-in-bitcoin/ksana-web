/**
 * The node's index of the token standards' events (D-120) as the page reads it (D-123): the standard a contract declared
 * (`ksana_getContract`), a KS-20 token's or a KS-721 collection's name, symbol and decimals (`ksana_getToken`), and the tokens and
 * collections an account holds (`ksana_getAccountAssets`).
 *
 * - A KS-20 token is shown as an asset, beside the built-in ones: its name and symbol are cleaned and compared with KSA's and bitcoin's
 *   as a built-in asset's are, and its symbol is the one its ID gives ("Token 0841ac") where either reads as KSA or bitcoin, or before
 *   the token has emitted its metadata. Its decimals are 0 until then, so its amounts are base units, which is all there is.
 * - An account's holdings are read when a page first shows the account, again after an operation names it, and otherwise at most
 *   once every `HOLDINGS_MS`: the node adds them up from every balance it indexed, which is not a read to make with every block.
 * - A node without the index (`-32601`, older than D-120 or with its index not built) leaves the page with the built-in assets alone,
 *   as before; any other failure is asked again `RETRY_MS` later.
 */

import { type Ks20Event, type Ks721Event, type KsanaRpcClient, MAX_OPS_LIMIT, RPC_ERROR_CODES, RpcError, type TokenInfo, decodeStandardEvent, formatOpPosition, fromHex, toHex } from '@ksana/sdk';
import { cleanAssetName, nativeLookalike } from '../assetNames';
import { clipText } from '../../lib/format';
import { lazy, withText } from '../../i18n';
import type { AssetMeta, CollectionMeta, Hex, VmEvent } from '../types';

export type TokenStandard = 'KS-20' | 'KS-721';

/** A contract's declaration as `ksana_getContract` gives it */
export interface Declaration {
  /** The standard first, then its extensions; empty when it declared none */
  standards: string[];
  /** The position of the operation whose events hold the declaration (`height:slot:entry`); null when it made none */
  declared: string | null;
  codeHash: Hex;
  deployer: Hex;
}

/** What the index knows of a token or a collection (`ksana_getToken`), its name and symbol as the page shows them */
export interface TokenFacts {
  standard: TokenStandard;
  extensions: string[];
  /** Cleaned; null before its first metadata event, or when nothing is left of it once cleaned */
  name: string | null;
  symbol: string | null;
  /** A token's decimals; null for a collection, or before a metadata event */
  decimals: number | null;
  /** A token's supply in base units, or how many NFTs of a collection exist */
  supply: bigint;
  holders: bigint;
  declared: string;
  /** The index passed over an event of its standard: its balances may differ from what the contract answers */
  irregular: boolean;
}

/** The tokens and collections an account holds, by contract ID */
export interface Holdings {
  tokens: Map<Hex, bigint>;
  collections: Map<Hex, bigint>;
  /** When they were read, and how many operations the page had seen name the account when the read began */
  at: number;
  ops: number;
}

/** A standard's event as a contract emitted it */
export type TokenEvent = { contract: Hex; standard: 'KS-20'; event: Ks20Event } | { contract: Hex; standard: 'KS-721'; event: Ks721Event };

/** A token's or a collection's largest holders as the index lists them (`ksana_getTokenHolders`), and whether more follow */
export interface TopHolders {
  holders: { account: Hex; balance: bigint }[];
  more: boolean;
  at: number;
}

/** An account's standing in a built-in asset (`ksana_getAssetStatus`, D-121) */
export interface Standing {
  /** Its status flags as recorded: `frozen`, `allowed` */
  status: string[];
  canSend: boolean;
  canReceive: boolean;
  at: number;
}

/** An account's holdings are read again at most this often, unless an operation names it */
export const HOLDINGS_MS = 60_000;
/** The most pages of an account's holdings read at a time: 1,000 tokens and collections */
const HOLDINGS_PAGES = 2;
/** How many of a token's holders its page lists */
export const TOP_HOLDERS = 10;
/** A read that got no answer is asked again this long after */
export const RETRY_MS = 8_000;

interface Host {
  node(): Pick<KsanaRpcClient, 'getContract' | 'getToken' | 'getAccountAssets' | 'getTokenHolders' | 'getAssetStatus'>;
  now(): number;
  /** What the index tells changed: an account's holdings (`account`), or a contract's standard or a token's name (`contract`) */
  changed(change: { account?: Hex; contract?: Hex }): void;
}

const isCode = (e: unknown, code: number) => e instanceof RpcError && e.code === code;

/**
 * The accounts a standard's event names, as the node's listings list the operation under them (D-120): the two sides of a transfer,
 * the owner and the account an approval or an operator names, a minter before and after; never the zero account
 */
export function eventAccounts(te: TokenEvent): Hex[] {
  const e = te.event;
  const named: (Uint8Array | null)[] =
    e.kind === 'Transfer'
      ? [e.from, e.to]
      : e.kind === 'Approve'
        ? [e.owner, e.spender]
        : e.kind === 'Minter'
          ? [e.previous, e.minter]
          : e.kind === 'Operator'
            ? [e.owner, e.operator]
            : [];
  return named.filter((a): a is Uint8Array => a !== null && a.some((x) => x !== 0)).map((a) => toHex(a));
}

function unnamed(id: Hex, standard: TokenStandard): { name: () => string; symbol: () => string } {
  return standard === 'KS-20'
    ? { name: lazy((m) => m.asset.tokenName, id.slice(0, 8), id.slice(-4)), symbol: lazy((m) => m.asset.tokenSymbol, id.slice(0, 6)) }
    : { name: lazy((m) => m.asset.collectionName, id.slice(0, 8), id.slice(-4)), symbol: lazy((m) => m.asset.collectionSymbol, id.slice(0, 6)) };
}

/**
 * A token's or a collection's name and symbol as the page shows them: cleaned, the symbol cut to 8 characters, and the ones its ID
 * gives where it named itself nothing, or where either reads as KSA's or bitcoin's
 */
function named<T extends object>(base: T, id: Hex, standard: TokenStandard, facts: Pick<TokenFacts, 'name' | 'symbol'> | undefined): T & { name: string; symbol: string; lookalike?: AssetMeta['lookalike'] } {
  const name = facts?.name ?? '';
  const symbol = clipText(facts?.symbol || name, 8);
  const lookalike = nativeLookalike(name) ?? nativeLookalike(symbol);
  const fallback = unnamed(id, standard);
  const out = Object.assign(base, lookalike ? { lookalike } : {});
  const withName = name ? Object.assign(out, { name }) : withText(out, 'name', fallback.name);
  return lookalike || !symbol ? withText(withName, 'symbol', fallback.symbol) : Object.assign(withName, { symbol });
}

/** A KS-20 token as an asset; `pending` until the index has answered for it */
export function tokenAsset(id: Hex, facts?: TokenFacts): AssetMeta {
  const meta: AssetMeta = named({ id, decimals: facts?.decimals ?? 0, issuer: id, standard: 'KS-20' as const }, id, 'KS-20', facts);
  if (facts) meta.totalSupply = facts.supply;
  else meta.pending = true;
  return meta;
}

export function collectionMeta(id: Hex, facts?: TokenFacts): CollectionMeta {
  const meta: CollectionMeta = named({ id }, id, 'KS-721', facts);
  if (!facts) meta.pending = true;
  return meta;
}

function factsOf(info: TokenInfo): TokenFacts {
  const clean = (s: string | null) => (s === null ? null : cleanAssetName(s) || null);
  return {
    standard: info.standard,
    extensions: [...info.extensions],
    name: clean(info.name),
    symbol: clean(info.symbol),
    decimals: info.decimals,
    supply: info.supply,
    holders: info.holders,
    declared: formatOpPosition(info.declared),
    irregular: info.irregular,
  };
}

export class TokenBook {
  /** Whether the node has the index: undefined until it first answers one of its methods */
  indexed: boolean | undefined;
  /** KS-20 tokens as assets, by contract ID */
  readonly assets = new Map<Hex, AssetMeta>();
  /** KS-721 collections, by contract ID */
  readonly collections = new Map<Hex, CollectionMeta>();
  /** What the index knows of each token and collection; null for a contract it knows as neither */
  readonly facts = new Map<Hex, TokenFacts | null>();
  private readonly factsAt = new Map<Hex, number>();
  /** Each contract's declaration; null for an ID that is no contract */
  readonly declarations = new Map<Hex, Declaration | null>();
  readonly holdings = new Map<Hex, Holdings>();
  readonly holders = new Map<Hex, TopHolders>();
  /** Accounts' standings in built-in assets, by "asset:account"; null where the node does not tell (older than D-121) */
  readonly standings = new Map<string, Standing | null>();
  /** The standard of each contract a holding named, before its facts are in */
  private readonly kinds = new Map<Hex, TokenStandard>();
  private readonly reading = new Set<string>();
  private readonly failed = new Map<string, number>();

  constructor(private readonly host: Host) {}

  /** The standard a contract follows, as far as the page knows: undefined while it does not know, null for none */
  standardOf(contract: Hex): TokenStandard | null | undefined {
    const facts = this.facts.get(contract);
    if (facts) return facts.standard;
    const kind = this.kinds.get(contract);
    if (kind) return kind;
    const d = this.declarations.get(contract);
    if (d === undefined) return facts === null ? null : undefined;
    const first = d?.standards[0];
    return first === 'KS-20' || first === 'KS-721' ? first : null;
  }

  /**
   * A standard's event, read by the declaration of the contract that emitted it (`core/docs/STANDARDS.md` §2): undefined while the page does
   * not know whether the contract declared one, null for any other event
   */
  eventOf(ev: VmEvent): TokenEvent | null | undefined {
    const contract = ev.fields.contract;
    if (!contract || ev.raw === undefined || this.indexed === false) return null;
    const standard = this.standardOf(contract);
    if (standard === undefined) return undefined;
    if (standard === null) return null;
    let decoded;
    try {
      decoded = decodeStandardEvent([standard], fromHex(ev.raw));
    } catch {
      return null;
    }
    return decoded ? ({ contract, ...decoded } as TokenEvent) : null;
  }

  /** Reads a contract's declaration once (`ksana_getContract`) */
  wantDeclaration(contract: Hex): void {
    if (this.declarations.has(contract)) return;
    this.read(
      `contract:${contract}`,
      () => this.host.node().getContract(contract),
      (c) => {
        this.declarations.set(contract, {
          standards: [...c.standards],
          declared: c.declared === null ? null : formatOpPosition(c.declared),
          codeHash: toHex(c.code_hash),
          deployer: toHex(c.deployer),
        });
        const first = c.standards[0];
        if (first === 'KS-20' || first === 'KS-721') this.wantFacts(contract);
      },
      () => this.declarations.set(contract, null),
      { contract },
    );
  }

  /**
   * Reads what the index knows of a token or a collection once (`ksana_getToken`); `fresh`, as a token's page asks, again once the last
   * read is `HOLDINGS_MS` old: its supply and its holders change with its transfers
   */
  wantFacts(contract: Hex, fresh = false): void {
    const at = this.factsAt.get(contract);
    if (this.facts.has(contract) && (!fresh || (at !== undefined && this.host.now() - at < HOLDINGS_MS))) return;
    this.askFacts(contract);
  }

  private askFacts(contract: Hex) {
    this.read(
      `token:${contract}`,
      () => this.host.node().getToken(contract),
      (info) => this.takeFacts(contract, info),
      () => {
        this.facts.set(contract, null);
        // A holding named it a token, which the index no longer knows: its amounts stay base units, named by its ID
        const pending = this.assets.get(contract);
        if (pending?.pending) delete pending.pending;
        const coll = this.collections.get(contract);
        if (coll?.pending) delete coll.pending;
      },
      { contract },
    );
  }

  /** `wantFacts`, waiting for the answer: whether the contract is a token or a collection (false too for a node without the index) */
  async readFacts(contract: Hex): Promise<boolean> {
    try {
      this.takeFacts(contract, await this.host.node().getToken(contract));
      this.indexed = true;
      return true;
    } catch (e) {
      if (isCode(e, RPC_ERROR_CODES.METHOD_NOT_FOUND)) {
        this.indexed = false;
        return false;
      }
      if (isCode(e, RPC_ERROR_CODES.NOT_FOUND)) {
        this.indexed = true;
        this.facts.set(contract, null);
        return false;
      }
      throw e;
    }
  }

  private takeFacts(contract: Hex, info: TokenInfo) {
    const facts = factsOf(info);
    this.facts.set(contract, facts);
    this.factsAt.set(contract, this.host.now());
    if (facts.standard === 'KS-20') this.assets.set(contract, tokenAsset(contract, facts));
    else this.collections.set(contract, collectionMeta(contract, facts));
  }

  /**
   * An account's tokens and collections (`ksana_getAccountAssets`), read when the page first asks, again once `ops` (how many operations
   * the page has seen name the account) has grown, and otherwise at most once every `HOLDINGS_MS`
   */
  wantHoldings(account: Hex, ops: number): void {
    const h = this.holdings.get(account);
    if (h && h.ops === ops && this.host.now() - h.at < HOLDINGS_MS) return;
    this.read(
      `holdings:${account}`,
      () => this.readHoldings(account),
      ({ tokens, collections }) => {
        this.holdings.set(account, { tokens, collections, at: this.host.now(), ops });
        for (const id of tokens.keys()) this.noteHolding(id, 'KS-20');
        for (const id of collections.keys()) this.noteHolding(id, 'KS-721');
      },
      () => undefined,
      { account },
    );
  }

  private async readHoldings(account: Hex): Promise<{ tokens: Map<Hex, bigint>; collections: Map<Hex, bigint> }> {
    const tokens = new Map<Hex, bigint>();
    const collections = new Map<Hex, bigint>();
    let after: string | null = null;
    for (let page = 0; page < HOLDINGS_PAGES; page++) {
      const list = await this.host.node().getAccountAssets(account, { after, limit: MAX_OPS_LIMIT });
      for (const a of list.assets) {
        if (a.kind === 'token') tokens.set(toHex(a.contract), a.balance);
        else if (a.kind === 'nft') collections.set(toHex(a.contract), a.count);
      }
      if (list.next === null) break;
      after = list.next;
    }
    return { tokens, collections };
  }

  /**
   * A token's or a collection's largest holders, read when its page asks and at most once every `HOLDINGS_MS`, and its facts again with
   * them: read when a holding first named the token, those may be older, and their number of holders would not count the list's
   */
  wantHolders(contract: Hex): void {
    const h = this.holders.get(contract);
    if (h && this.host.now() - h.at < HOLDINGS_MS) return;
    const asked = this.read(
      `holders:${contract}`,
      () => this.host.node().getTokenHolders(contract, { limit: TOP_HOLDERS }),
      (list) =>
        this.holders.set(contract, {
          holders: list.holders.map((x) => ({ account: toHex(x.account), balance: x.balance })),
          more: list.next !== null,
          at: this.host.now(),
        }),
      () => this.holders.set(contract, { holders: [], more: false, at: this.host.now() }),
      { contract },
    );
    if (asked) this.askFacts(contract);
  }

  /** An account's standing in a built-in asset (D-121), read when the asset's page asks and at most once every `HOLDINGS_MS` */
  wantStanding(asset: Hex, account: Hex): void {
    const key = `${asset}:${account}`;
    const s = this.standings.get(key);
    if (s === null || (s && this.host.now() - s.at < HOLDINGS_MS)) return;
    this.read(
      `standing:${key}`,
      () => this.host.node().getAssetStatus(asset, account),
      (st) => this.standings.set(key, { status: [...st.status], canSend: st.can_send, canReceive: st.can_receive, at: this.host.now() }),
      () => this.standings.set(key, null),
      { account },
      false,
    );
  }

  /** A holding names a token or a collection: it shows by its ID, its amounts as being read, until the index names it */
  private noteHolding(id: Hex, standard: TokenStandard) {
    this.kinds.set(id, standard);
    if (standard === 'KS-20' && !this.assets.has(id)) this.assets.set(id, tokenAsset(id));
    if (standard === 'KS-721' && !this.collections.has(id)) this.collections.set(id, collectionMeta(id));
    this.wantFacts(id);
  }

  /**
   * One read at a time for each key; a failure other than the index's absence or a missing object is asked again `RETRY_MS` later.
   * A read of the index (`index`) that finds the node without it tells the page so, and the index is not asked again; a standing's
   * read is no read of the index, and a node without the method answers it as missing. Whether it asked the node
   */
  private read<T>(key: string, ask: () => Promise<T>, take: (value: T) => void, missing: () => void, change: { account?: Hex; contract?: Hex }, index = true): boolean {
    if ((index && this.indexed === false) || this.reading.has(key)) return false;
    const failedAt = this.failed.get(key);
    if (failedAt !== undefined && this.host.now() - failedAt < RETRY_MS) return false;
    this.reading.add(key);
    ask()
      .then(
        (value) => {
          if (index) this.indexed = true;
          this.failed.delete(key);
          take(value);
        },
        (e: unknown) => {
          if (index && isCode(e, RPC_ERROR_CODES.METHOD_NOT_FOUND)) this.indexed = false;
          else if (isCode(e, RPC_ERROR_CODES.NOT_FOUND) || isCode(e, RPC_ERROR_CODES.METHOD_NOT_FOUND)) {
            if (index) this.indexed = true;
            this.failed.delete(key);
            missing();
          } else this.failed.set(key, this.host.now());
        },
      )
      .finally(() => {
        this.reading.delete(key);
        this.host.changed(change);
      });
    return true;
  }
}
