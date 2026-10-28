import { Fragment, type CSSProperties } from 'react';
import { useNow } from '../app/store';
import { useWalletPrefs } from '../app/prefs';
import { amountParts, fmtAmount, fmtClock, fmtDateTime, fmtInt, timeAgo } from '../lib/format';
import type { AssetMeta, EntryKind, Path } from '../chain/types';
import { PATH_DESC, PATH_LABEL } from '../chain/views';
import { localized, t, useT } from '../i18n';

/** Amount: the integer part is the focus, the fraction is de-emphasized, the unit is lightest */
export function Amount({
  value,
  asset,
  maxFrac,
  size = 'md',
  sign = false,
  privacy = false,
}: {
  value: bigint;
  asset: Pick<AssetMeta, 'decimals' | 'symbol' | 'pending'>;
  maxFrac?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  sign?: boolean;
  /** Controlled by the "hide balances" switch */
  privacy?: boolean;
}) {
  const prefs = useWalletPrefs();
  const hidden = privacy && prefs.hideBalances;
  // An asset the node has yet to name: without its decimals the figure would be its base units, so it shows as being read, as a balance does
  if (asset.pending && !hidden) {
    return (
      <span className={`amount amount--${size} amount--unknown`} aria-busy="true">
        <span className="amount-int">…</span>
        <span className="amount-unit">{asset.symbol}</span>
      </span>
    );
  }
  const p = amountParts(value, asset.decimals, { maxFrac: maxFrac ?? Math.min(asset.decimals, 4) });
  const plus = sign && value > 0n ? '+' : '';
  const chars = hidden ? 4 : plus.length + p.sign.length + p.int.length + (p.frac ? p.frac.length + 1 : 0);
  return (
    <span
      className={`amount amount--${size}`}
      style={figureFit(size, chars)}
      title={hidden ? undefined : `${fmtAmount(value, asset.decimals, { minFrac: Math.min(asset.decimals, 8) })} ${asset.symbol}`}
    >
      {hidden ? (
        <span className="amount-int">••••</span>
      ) : (
        <>
          <span className="amount-int">
            {plus}
            {p.sign}
            <Groups digits={p.int} />
          </span>
          {p.frac && <span className="amount-frac">.{p.frac}</span>}
        </>
      )}
      <span className="amount-unit">{asset.symbol}</span>
    </span>
  );
}

/**
 * An integer's groups of digits: where the figure may wrap (a phone's card rows, the wallet's tokens) and a line has no room for it, it
 * breaks after a comma, never inside a group, where "607,43 / 1,768" would read as two numbers. Everywhere else the styles take the
 * breaks out (`.amount wbr`), since a browser breaks at a <wbr> even in text that does not wrap
 */
function Groups({ digits }: { digits: string }) {
  return digits.split(',').map((g, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <>
          ,<wbr />
        </>
      )}
      {g}
    </Fragment>
  ));
}

/** A figure (size xl) shrinks to fit the balance card it is in by how many characters it has (`.balance-card .amount--xl`, pages.css) */
function figureFit(size: string, chars: number): CSSProperties | undefined {
  return size === 'xl' ? ({ '--figure-chars': chars } as CSSProperties) : undefined;
}

/** Sats: the Bitcoin path is denominated in sats (SPEC §8) */
export function Sats({ value, size = 'md', privacy = false }: { value: number | undefined; size?: 'sm' | 'md' | 'lg' | 'xl'; privacy?: boolean }) {
  const prefs = useWalletPrefs();
  const hidden = privacy && prefs.hideBalances;
  // The node data source does not know input amounts and fees (the transaction itself does not carry those numbers)
  const t = useT();
  if (value === undefined) {
    return (
      <span className={`amount amount--${size} amount--unknown`} title={t.ui.satsUnknown}>
        <span className="amount-int">—</span>
      </span>
    );
  }
  const digits = hidden ? '••••' : fmtInt(value);
  return (
    <span className={`amount amount--${size}`} style={figureFit(size, digits.length)} title={hidden ? undefined : `${(value / 1e8).toFixed(8)} BTC`}>
      <span className="amount-int">{hidden ? digits : <Groups digits={digits} />}</span>
      <span className="amount-unit">{t.format.sats}</span>
    </span>
  );
}

/**
 * An operation's path as its letter. A screen reader says the path's name ("Path B · Sponsored"), which the letter alone does not give;
 * where the words beside the badge give the path (`named`: the path's name, an entry's kind), it leaves the badge out
 */
export function PathBadge({ path, named = false }: { path: Path; named?: boolean }) {
  const name = t().status.pathName(path, PATH_LABEL[path]);
  return (
    <span className={`path-badge path-badge--${path}`} title={`${name}: ${PATH_DESC[path]}`} aria-hidden={named || undefined}>
      <span className="path-badge-letter mono" aria-hidden="true">{path}</span>
      {!named && <span className="sr-only">{name}</span>}
    </span>
  );
}

const ENTRY_PATH: Partial<Record<EntryKind, Path>> = { Forced: 'C', Sponsored: 'B' };
const ENTRY_LABEL: Record<EntryKind, string> = localized(() => t().ui.entryKind);

export function EntryTag({ kind }: { kind: EntryKind }) {
  const path = ENTRY_PATH[kind];
  if (path) {
    return (
      <span className={`entry-tag entry-tag--${kind}`}>
        <PathBadge path={path} named />
        <span>{ENTRY_LABEL[kind]}</span>
      </span>
    );
  }
  return <span className={`entry-tag entry-tag--${kind} tag tag--neutral`}>{ENTRY_LABEL[kind]}</span>;
}

/** A figure in running text: digits with their commas and decimal point, a height's "#" before them and a parallel block's prime after */
const FIGURE = /(#?\d(?:[\d.,]*\d)?′?)/;

/**
 * A web address (a node's, an indexer's): where a line has no room for it, it breaks as an address does, after its "//" and before a
 * "." or a "/", and inside a name only where the name alone is longer than the line (the `overflow-wrap: anywhere` of the boxes
 * that show it). Broken anywhere, as a hash is, it read "https://signet.ksana.networ" over "k/rpc" in the data source panel on a phone
 */
export function WebAddress({ url }: { url: string }) {
  return addressParts(url).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}

/**
 * An address cut where it may break: after its "//", and before a ".", "/", "?" or "#" that neither ends it nor follows a "/" or ":".
 * Worked out by hand: a regular expression that looks behind fails to parse on iOS before 16.4, and with it the whole script
 */
function addressParts(url: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i < url.length; i++) {
    const prev = url.charAt(i - 1);
    const afterSlashes = prev === '/' && url.charAt(i - 2) === '/';
    const beforeMark = './?#'.includes(url.charAt(i)) && prev !== '/' && prev !== ':' && i < url.length - 1;
    if (afterSlashes || beforeMark) {
      parts.push(url.slice(start, i));
      start = i;
    }
  }
  parts.push(url.slice(start));
  return parts;
}

/**
 * Text that runs figures and words together (a count with its noun, "4 block bodies"; a readout, "gas 206,858 / declared limits
 * 520,000"): each figure in the monospace face of data, its words in the face of the text around them, as a stat's unit is beside its
 * figure. Set wholly in the monospace face, the words read as code
 */
export function Figures({ text }: { text: string }) {
  return text.split(FIGURE).map((part, i) => (i % 2 === 1 ? <span key={i} className="num">{part}</span> : part || null));
}

export function TimeAgo({ at, clock = false }: { at: number; clock?: boolean }) {
  const now = useNow();
  return (
    <time className="time-ago ticking" dateTime={new Date(at).toISOString()} title={fmtDateTime(at)}>
      {clock ? fmtClock(at) : timeAgo(at, Math.max(now, at))}
    </time>
  );
}
