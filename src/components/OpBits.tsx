import { useChain } from '../app/store';
import { FAIL_LABEL } from '../chain/views';
import type { EntryRecord, OpRecord } from '../chain/types';
import { KSA_ASSET_ID } from '../chain/params';
import { fmtInt } from '../lib/format';
import { Amount } from './Values';
import { StatusMark } from './Status';
import { useT } from '../i18n';

/** What fee an operation paid: path B pays KSA, path C pays BTC miners */
export function FeeCell({ r }: { r: OpRecord }) {
  const sim = useChain();
  const t = useT();
  const ksa = sim.assets.get(KSA_ASSET_ID);
  if (r.op.fee.kind === 'Token' && ksa) return <Amount value={r.op.fee.amount} asset={ksa} size="sm" maxFrac={3} />;
  const tx = r.nativeTxid ? sim.getBtcTx(r.nativeTxid) : undefined;
  return (
    <span className="small soft" title={t.ui.minerFeeHint}>
      {t.ui.minerFee} {tx?.feeSat !== undefined ? `${fmtInt(tx.feeSat)}\u00a0${t.format.sats}` : '—'}
    </span>
  );
}

export function ResultCell({ e }: { e: Pick<EntryRecord, 'result'> }) {
  const t = useT();
  if (e.result.reason === 'skipped') {
    return (
      <span className="result result--skip" title={e.result.message}>
        <StatusMark stage="skipped" size={12} />
        {t.ui.skipped}
      </span>
    );
  }
  if (e.result.reason === 'unaccepted') {
    return (
      <span className="result result--wait" title={t.ui.awaitingMergeHint}>
        <StatusMark stage="unmerged" size={12} />
        {t.ui.awaitingMerge}
      </span>
    );
  }
  if (e.result.ok) {
    return (
      <span className="result result--ok">
        <span aria-hidden="true">✓</span> {t.ui.ok}
      </span>
    );
  }
  return (
    <span className="result result--fail" title={e.result.message}>
      <StatusMark stage="failed" size={12} />
      {FAIL_LABEL[e.result.reason ?? ''] ?? t.common.failed}
    </span>
  );
}

export function GasBar({ used, max }: { used: number; max: number }) {
  const f = max > 0 ? Math.min(1, used / max) : 0;
  return (
    <span className="gas" title={`${fmtInt(used)} / ${fmtInt(max)} gas`}>
      <span className="gas-num num">{fmtInt(used)}</span>
      <span className="gas-bar" aria-hidden="true">
        <span style={{ width: `${(f * 100).toFixed(1)}%` }} className={f >= 1 ? 'gas-full' : ''} />
      </span>
    </span>
  );
}
