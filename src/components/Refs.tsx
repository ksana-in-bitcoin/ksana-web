import { useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { href, onLinkClick, type Route } from '../app/router';
import { useChain } from '../app/store';
import { useMe } from '../wallet/model';
import { groupHex, shortAddress, shortHash } from '../lib/format';
import type { AssetMeta, Hex } from '../chain/types';
import { KSA_ASSET_ID } from '../chain/params';
import { IconAlert, IconCheck, IconCopy } from './icons';
import { useT } from '../i18n';

export function Link({ to, children, ...rest }: { to: Route; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & { 'data-acct'?: string }) {
  return (
    <a href={href(to)} onClick={(e) => onLinkClick(e, to)} {...rest}>
      {children}
    </a>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({ text, label: labelProp, className = '', showLabel = false }: { text: string; label?: string; className?: string; showLabel?: boolean }) {
  const t = useT();
  const label = labelProp ?? t.common.copy;
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <button
      type="button"
      className={`copy-btn ${showLabel ? 'copy-btn--labelled' : ''} ${state !== 'idle' ? `copy-btn--${state}` : ''} ${className}`}
      aria-label={showLabel ? undefined : state === 'done' ? t.common.copied : t.ui.copyWhat(label, text)}
      title={state === 'done' ? t.common.copied : state === 'fail' ? t.common.copyFailedHint : label}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copyText(text);
        setState(ok ? 'done' : 'fail');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), 1400);
      }}
    >
      {state === 'done' ? <IconCheck size={14} /> : <IconCopy size={14} />}
      {showLabel && <span>{state === 'done' ? t.common.copied : state === 'fail' ? t.common.copyFailed : label}</span>}
    </button>
  );
}

/** Hash: elided in the middle by default, the full value on hover, copyable */
export function Hash({ value, to, head = 8, tail = 6, copy = false, className = '' }: { value: string; to?: Route; head?: number; tail?: number; copy?: boolean; className?: string }) {
  const text = shortHash(value, head, tail);
  const inner = (
    <span className="hash-text mono" title={value}>
      {text}
    </span>
  );
  return (
    <span className={`hash ${className}`}>
      {to ? (
        <Link to={to} className="hash-link">
          {inner}
        </Link>
      ) : (
        inner
      )}
      {copy && <CopyButton text={value} />}
    </span>
  );
}

/** Full hash: laid out in groups of 8 digits so it can be verified piece by piece */
export function FullHash({ value, copy = true }: { value: string; copy?: boolean }) {
  return (
    <span className="full-hash">
      <span className="mono full-hash-groups">
        {groupHex(value).map((g, i) => (
          <span key={i}>{g}</span>
        ))}
      </span>
      {copy && <CopyButton text={value} />}
    </span>
  );
}

/**
 * Account seal: a symmetric 5×5 pattern generated from the public key, like a personal seal.
 * Only low-saturation ink tones are used, so it is not confused with the status semantics of qing, mo and zhu.
 */
export function AccountSeal({ id, size = 18 }: { id: Hex; size?: number }) {
  const { cells, hue } = useMemo(() => {
    const bytes: number[] = [];
    for (let i = 0; i < 16; i++) bytes.push(parseInt(id.slice(i * 2, i * 2 + 2), 16) || 0);
    const cells: [number, number][] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const byte = bytes[row * 3 + col] ?? 0;
        if (byte % 2 === 0) {
          cells.push([col, row]);
          if (col < 2) cells.push([4 - col, row]);
        }
      }
    }
    return { cells, hue: ((bytes[15] ?? 0) * 360) / 256 };
  }, [id]);
  return (
    <svg className="acct-seal" width={size} height={size} viewBox="-1 -1 7 7" aria-hidden="true" style={{ '--h': hue.toFixed(0) } as React.CSSProperties}>
      <rect x="-0.6" y="-0.6" width="6.2" height="6.2" rx="0.5" className="acct-seal-frame" />
      {cells.map(([x, y], i) => (
        <rect key={i} x={x + 0.08} y={y + 0.08} width="0.84" height="0.84" rx="0.12" className="acct-seal-cell" />
      ))}
    </svg>
  );
}

/**
 * Hovering an account highlights every occurrence of the same account on the page, which makes it easy to follow one person through a table.
 * Implemented with one dynamic style rule, without triggering a React re-render.
 */
let hlStyle: HTMLStyleElement | null = null;
function highlight(id: Hex | null) {
  if (typeof document === 'undefined') return;
  if (!hlStyle) {
    hlStyle = document.createElement('style');
    document.head.appendChild(hlStyle);
  }
  hlStyle.textContent = id ? `.acct-ref[data-acct="${id}"]{background:var(--qing-soft);box-shadow:0 0 0 3px var(--qing-soft);border-radius:3px}` : '';
}

/**
 * Account reference: seal + label or the abbreviated account. The user's own account shows as "you".
 * An account is a Taproot address (D-092): the abbreviation and the hover text both use the address, with the hex only as a second line; contracts have hex only.
 */
export function AccountRef({ id, short = false, noLink = false, showKey = false }: { id: Hex; short?: boolean; noLink?: boolean; showKey?: boolean }) {
  const sim = useChain();
  const me = useMe();
  const t = useT();
  const isContract = sim.isContract(id);
  const isMe = me === id;
  const label = isMe ? t.common.you : sim.labels.get(id);
  const addr = isContract ? '' : sim.addressOf(id);
  const shortId = isContract || !addr ? shortHash(id, 6, 4) : shortAddress(addr, short ? 6 : 8, short ? 4 : 6);
  const body = (
    <>
      <AccountSeal id={id} />
      <span className="acct-ref-text">
        {label ? (
          <>
            <span className={`acct-ref-label${isMe ? ' acct-ref-me' : ''}`}>{label}</span>
            {showKey && <span className="acct-ref-addr mono">{shortId}</span>}
          </>
        ) : (
          <span className="acct-ref-addr mono">{shortId}</span>
        )}
      </span>
    </>
  );
  const title = isContract ? t.ui.contractTitle(id) : t.ui.accountTitle(addr || id) + (addr ? `\n${t.ui.accountHex(id)}` : '');
  const to: Route = isContract ? { name: 'contract', id } : { name: 'account', id };
  const hover = {
    'data-acct': id,
    onMouseEnter: () => highlight(id),
    onMouseLeave: () => highlight(null),
    onFocus: () => highlight(id),
    onBlur: () => highlight(null),
  };
  if (noLink) {
    return (
      <span className="acct-ref" title={title} {...hover}>
        {body}
      </span>
    );
  }
  return (
    <Link to={to} className="acct-ref" title={title} {...hover}>
      {body}
    </Link>
  );
}

/**
 * The contract that issued a contract's asset, by its ref: anyone can issue an asset under any name, and two assets of one symbol
 * differ by their issuers (the review of M33). Nothing for KSA, which no contract issues
 */
export function AssetIssuer({ asset, className }: { asset: AssetMeta; className?: string }) {
  const t = useT();
  if (asset.issuer === null || asset.id === KSA_ASSET_ID) return null;
  // A KS-20 token is its own contract (D-123): its standard, then the contract
  return (
    <span className={`asset-issuer${className ? ` ${className}` : ''}`}>
      {asset.standard ? `${asset.standard} ·` : t.ui.issuedBy} <AccountRef id={asset.issuer} short />
    </span>
  );
}

/** An asset by its symbol, linked to its page (D-123): a built-in asset, a KS-20 token or a KS-721 collection */
export function AssetLink({ asset, className }: { asset: { id: Hex; symbol: string }; className?: string }) {
  return (
    <Link to={{ name: 'asset', id: asset.id }} className={`asset-link${className ? ` ${className}` : ''}`}>
      {asset.symbol}
    </Link>
  );
}

/** The warning beside a contract's asset named like KSA or bitcoin, whose symbol is then the one its ID gives (`nativeLookalike`) */
export function LookalikeNote({ asset, className }: { asset: Pick<AssetMeta, 'lookalike'>; className?: string }) {
  const t = useT();
  if (!asset.lookalike) return null;
  return (
    <span className={`asset-warn${className ? ` ${className}` : ''}`}>
      <IconAlert size={13} />
      <span>{t.ui.lookalike(asset.lookalike)}</span>
    </span>
  );
}

/** Block reference. A parallel block shares its number with the chain block at the same height; a prime is appended to tell them apart (#1,024′) */
export function BlockRef({ height, hash }: { height: number; hash?: Hex }) {
  const sim = useChain();
  const t = useT();
  const side = hash ? sim.getBlock(hash)?.side : false;
  return (
    <Link to={{ name: 'block', id: hash ?? String(height) }} className={`block-ref mono${side ? ' block-ref--side' : ''}`} title={side ? t.status.sideBlock(height.toLocaleString('en-US')) : undefined}>
      #{height.toLocaleString('en-US')}
      {side && (
        <>
          <span aria-hidden="true">′</span>
          <span className="sr-only">{t.ui.sideBlockSr}</span>
        </>
      )}
    </Link>
  );
}

export function BtcRef({ height, atMost }: { height: number; /** At this height or below (`BtcTx.heightAtMost`) */ atMost?: boolean }) {
  const link = (
    <Link to={{ name: 'btc', height }} className="btc-ref mono">
      BTC #{height.toLocaleString('en-US')}
    </Link>
  );
  return atMost ? <span className="nobr">≤&nbsp;{link}</span> : link;
}
