import { STAGE_HINT, STAGE_LABEL, type IndexerState, type Stage } from '../chain/views';
import { useT } from '../i18n';
import { fmtInt } from '../lib/format';

/**
 * The shape language of certainty: from circle to square.
 *   ◌ pending (dashed circle) → ● fast-confirmed (solid qing circle, the Ksana instant) → ▢ settlement broadcast (rounded hollow square, ink being laid down)
 *   → ■ on Bitcoin (mo square) → ☑ six Bitcoin confirmations (the mo square with a check, the milestone shown first, D-116)
 *   → ▣ BTC-final (the vermilion seal with a meander-pattern border, stamped later)
 * Circles stand for the flowing moment, squares for what has settled. Shape works alongside color, so color-blind users can tell the states apart too.
 * Three side branches: parallel block awaiting merge (dashed qing circle), skipped (gamboge circle with a dash: not executed), dropped (grey circle with a slash).
 */
export function StatusMark({ stage, size = 12 }: { stage: Stage; size?: number }) {
  const s = size;
  const c = s / 2;
  let body: React.ReactNode;
  switch (stage) {
    case 'pending':
      body = <circle cx={c} cy={c} r={c - 1.4} fill="none" stroke="var(--ink-3)" strokeWidth="1.3" strokeDasharray="2 1.6" />;
      break;
    case 'fast':
      body = <circle cx={c} cy={c} r={c - 1} fill="var(--qing)" />;
      break;
    case 'broadcast':
      body = (
        <>
          <rect x="1.2" y="1.2" width={s - 2.4} height={s - 2.4} rx={s * 0.3} fill="none" stroke="var(--mo)" strokeWidth="1.3" />
          <circle cx={c} cy={c} r={s * 0.17} fill="var(--qing)" />
        </>
      );
      break;
    case 'on_btc':
      body = <rect x="1" y="1" width={s - 2} height={s - 2} rx="1" fill="var(--mo)" />;
      break;
    case 'deep':
      body = (
        <>
          <rect x="1" y="1" width={s - 2} height={s - 2} rx="1" fill="var(--mo)" />
          <path
            d={`M${s * 0.27} ${s * 0.52}L${s * 0.43} ${s * 0.68}L${s * 0.73} ${s * 0.36}`}
            fill="none"
            stroke="var(--on-ink)"
            strokeWidth={Math.max(1.3, s * 0.1)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
      break;
    case 'final':
      body = (
        <>
          <rect x="0.5" y="0.5" width={s - 1} height={s - 1} rx="1.2" fill="var(--zhu)" />
          <rect x="2.6" y="2.6" width={s - 5.2} height={s - 5.2} rx="0.4" fill="none" stroke="var(--on-zhu)" strokeWidth="1" />
        </>
      );
      break;
    case 'failed':
      body = (
        <>
          <circle cx={c} cy={c} r={c - 1.2} fill="none" stroke="var(--danger)" strokeWidth="1.4" />
          <path d={`M${s * 0.35} ${s * 0.35}L${s * 0.65} ${s * 0.65}M${s * 0.65} ${s * 0.35}L${s * 0.35} ${s * 0.65}`} stroke="var(--danger)" strokeWidth="1.4" strokeLinecap="round" />
        </>
      );
      break;
    case 'unmerged':
      body = (
        <>
          <circle cx={c} cy={c} r={c - 1.4} fill="none" stroke="var(--qing)" strokeWidth="1.3" strokeDasharray="2 1.6" />
          <circle cx={c} cy={c} r={s * 0.14} fill="var(--qing)" />
        </>
      );
      break;
    case 'skipped':
      body = (
        <>
          <circle cx={c} cy={c} r={c - 1.2} fill="none" stroke="var(--warn)" strokeWidth="1.4" />
          <path d={`M${s * 0.27} ${c}L${s * 0.73} ${c}`} stroke="var(--warn)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
      break;
    case 'dropped':
      body = (
        <>
          <circle cx={c} cy={c} r={c - 1.2} fill="none" stroke="var(--ink-3)" strokeWidth="1.3" />
          <path d={`M${s * 0.28} ${s * 0.72}L${s * 0.72} ${s * 0.28}`} stroke="var(--ink-3)" strokeWidth="1.3" strokeLinecap="round" />
        </>
      );
      break;
  }
  return (
    <svg className="status-mark" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      {body}
    </svg>
  );
}

export function StatusBadge({ stage, label, compact = false, size, large = false }: { stage: Stage; label?: string; compact?: boolean; size?: number; large?: boolean }) {
  return (
    <span className={`status status--${stage}${compact ? ' status--compact' : ''}${large ? ' status--lg' : ''}`} title={STAGE_HINT[stage]}>
      <StatusMark stage={stage} {...(size ? { size } : {})} />
      <span className={compact ? 'sr-only' : 'status-label'}>{label ?? STAGE_LABEL[stage]}</span>
    </span>
  );
}

/** Ticks: discrete progress such as confirmation counts and depths */
export function Ticks({ done, total, ink = 'qing', label }: { done: number; total: number; ink?: 'qing' | 'mo' | 'zhu' | 'warn' | 'danger'; label?: string }) {
  const items = [];
  for (let i = 0; i < total; i++) items.push(<i key={i} className={i < done ? 'on' : ''} />);
  return (
    <span className={`ticks ticks--${ink}`} role="img" aria-label={label ?? `${done} / ${total}`}>
      {items}
    </span>
  );
}

/** A meter for continuous quantities, e.g. data size 12.4 KiB / 80 KiB */
export function Meter({ value, max, ink = 'qing', label, marks = [0.25, 0.5, 0.75] }: { value: number; max: number; ink?: 'qing' | 'mo' | 'zhu' | 'warn' | 'danger'; label: string; marks?: number[] }) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className={`meter meter--${ink}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span className="meter-fill" style={{ width: `${(f * 100).toFixed(2)}%` }} />
      {marks.map((m) => (
        <span key={m} className="meter-mark" style={{ left: `${m * 100}%` }} />
      ))}
    </span>
  );
}

/**
 * The indexer in a few words, with its mark (`indexerState`): what its recent checks found at its height, or why there is nothing to
 * tell; `offNote` follows "No indexer"
 */
export function IndexerLine({ state, height, offNote }: { state: IndexerState; height: number; offNote?: string }) {
  const s = useT().shell.strip;
  if (state === 'off') {
    return (
      <>
        <span className="strip-muted">○</span> {s.noIndexer}
        {offNote && <> · {offNote}</>}
      </>
    );
  }
  if (state === 'none' || state === 'unreachable') {
    return (
      <>
        <span className={state === 'none' ? 'strip-muted' : 'strip-warn'}>○</span> {s.indexer[state]}
      </>
    );
  }
  if (state === 'stalled') {
    return (
      <>
        <span className="strip-warn">○</span> {s.indexer.stalled} <b>#{fmtInt(height)}</b>
      </>
    );
  }
  return (
    <>
      <span className={state === 'ok' ? 'strip-ok' : 'strip-alarm'}>{state === 'ok' ? '✓' : '✕'}</span> {s.indexer[state === 'forked' ? 'mismatch' : state]} <b>#{fmtInt(height)}</b>
    </>
  );
}
