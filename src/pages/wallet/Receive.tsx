import { useMemo, useState } from 'react';
import { encode } from 'uqr';
import { useChain, useNow } from '../../app/store';
import { toast, useWalletPrefs, watchOp } from '../../app/prefs';
import { BTC_FINAL_DATA_CONFS, KSA_ASSET_ID, PARAMS } from '../../chain/params';
import { opProgress } from '../../chain/views';
import type { Hex, OpRecord } from '../../chain/types';
import { useMe } from '../../wallet/model';
import { useConnectedWallet } from '../../wallet/connect';
import { EDGE_CHARS, fmtAmount, fmtEta, hrpOf, shortAddress, shortHash } from '../../lib/format';
import { GroupedAddress } from '../../components/Address';
import { HistoryReach } from '../../components/HistoryReach';
import { ThresholdForm } from '../../components/Threshold';
import { AccountSeal, CopyButton, Link } from '../../components/Refs';
import { StatusBadge, StatusMark } from '../../components/Status';
import { rowOpener } from '../../components/Table';
import { Amount, TimeAgo } from '../../components/Values';
import { Button, ButtonLink, Empty, PageHead, Section } from '../../components/ui';
import { useT } from '../../i18n';
import { FaucetButton, useHostedFaucet } from './Faucet';
import { Wallet } from './Wallet';

/** QR code: the modules are drawn as SVG, the colors follow the theme */
function Qr({ text, size = 208, label }: { text: string; size?: number; label: string }) {
  const { d, n } = useMemo(() => {
    const qr = encode(text.toUpperCase(), { ecc: 'M', border: 0 });
    let path = '';
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) path += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { d: path, n: qr.size };
  }, [text]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} className="qr-bg" />
      <path d={d} className="qr-fg" />
    </svg>
  );
}

/** The most recent transfers received that the page lists */
const INCOMING_ROWS = 8;

export function Receive() {
  const me = useMe();
  if (!me) return <Wallet />;
  return <ReceiveBody me={me} />;
}

function ReceiveBody({ me }: { me: Hex }) {
  const sim = useChain();
  const now = useNow();
  const prefs = useWalletPrefs();
  const wallet = useConnectedWallet();
  // The account is the Taproot address (D-092): this one address receives KSA, contract assets and BTC alike; under the node data source it is the same address the wallet gives
  const address = sim.addressOf(me) || wallet?.account.address || '';
  const hrp = hrpOf(address);
  const body = address.slice(hrp.length);
  const network = sim.kind === 'rpc' ? sim.network : 'regtest';
  const ksa = sim.assets.get(KSA_ASSET_ID);
  const threshold = BigInt(prefs.largeThreshold);
  const t = useT();
  const m = t.receive;
  // The large-amount threshold is edited right next to the receiving rules (UI/UX review §2.4), without going back to the home page
  const [editing, setEditing] = useState(false);
  // A hosted signet's faucet (deployment.json, D-107), for the network the page is connected to
  const faucetUrl = useHostedFaucet();

  const incoming: OpRecord[] = [];
  const acc = sim.peekAccount(me);
  if (acc) {
    for (let i = acc.opIds.length - 1; i >= 0 && incoming.length < INCOMING_ROWS; i--) {
      const r = sim.getOp(acc.opIds[i] as string);
      if (r && r.op.account !== me && r.op.action.kind === 'AssetTransfer' && r.op.action.to === me) incoming.push(r);
    }
  }

  return (
    <div className="page">
      <PageHead eyebrow={t.wallet.title} title={m.title} meta={m.one} />
      <div className="grid-2">
        <section className="receive-card panel" aria-label={m.card}>
          <Qr text={address} label={m.qr} />
          <div className="receive-addr">
            <div className="label">{m.address(network)}</div>
            <GroupedAddress address={address} size={4} />
            <div className="row wrap gap-8">
              <CopyButton text={address} label={m.copyAddress} showLabel />
              <AccountSeal id={me} size={20} />
              <span className="small soft">
                {m.checkEdges}
                {/* The two ends move to the next line together rather than part at the ellipsis */}
                <span className="nobr">
                  <b className="mono">{body.slice(0, EDGE_CHARS)}</b> … <b className="mono">{body.slice(-EDGE_CHARS)}</b>
                </span>
              </span>
            </div>
            <p className="small soft">{m.btcUse}</p>
            {/* Test KSA to this address: the faucet sits with the address it pays, not among the receiving rules */}
            {sim.kind === 'sim' ? (
              <div className="row wrap">
                <Button
                  onClick={() => {
                    const res = sim.faucet(me);
                    if (res.opId) watchOp(res.opId);
                    toast({ tone: 'neutral', title: t.wallet.faucet.requested });
                  }}
                >
                  {m.faucet}
                </Button>
              </div>
            ) : (
              faucetUrl && (
                <div className="row wrap">
                  <FaucetButton url={faucetUrl} me={me} label={m.faucetHosted(sim.config.chain)} />
                </div>
              )
            )}
            {/* The same account in hex form: for contract parameters */}
            <div className="receive-hex small">
              <span className="soft">{m.hex}</span>
              <span className="addr-line">
                <span className="mono key-hex">{me}</span>
                <CopyButton text={me} label={m.copyHex} />
              </span>
            </div>
          </div>
        </section>

        <Section title={m.rules.title}>
          <div className="receive-rules">
            <div className="rule">
              <StatusMark stage="fast" size={16} />
              <div>
                <div className="rule-title">{m.rules.below(ksa ? fmtAmount(threshold, ksa.decimals) : '—')}</div>
                <div className="small soft">{t.format.aboutSeconds(PARAMS.TARGET_BLOCK_TIME)}</div>
              </div>
            </div>
            <div className="rule">
              <StatusMark stage="final" size={16} />
              <div>
                <div className="rule-title">{m.rules.above}</div>
                <div className="small soft">
                  {/* devnet's BTC blocks come faster than mainnet's, so it adds mainnet's wait; signet's come as often as mainnet's */}
                  {sim.kind === 'rpc' && sim.config.chain !== 'devnet'
                    ? fmtEta(sim.btcIntervalMs * BTC_FINAL_DATA_CONFS)
                    : m.rules.aboveEta('devnet', fmtEta(sim.btcIntervalMs * BTC_FINAL_DATA_CONFS))}
                </div>
              </div>
            </div>
          </div>
          {editing && <ThresholdForm autoFocus onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />}
          <div className="row wrap">
            {!editing && (
              <Button onClick={() => setEditing(true)} aria-expanded={false}>
                {m.rules.edit}
              </Button>
            )}
            <ButtonLink to={{ name: 'wallet' }}>{m.back}</ButtonLink>
          </div>
        </Section>
      </div>

      <Section title={m.recent.title}>
        {/* The account's operations are listed from the node until the list is full, the way the wallet's activity is: a transfer
            received before the page loaded shows too, not only those in the blocks it loaded */}
        <HistoryReach of={me} full={incoming.length >= INCOMING_ROWS} />
        {incoming.length === 0 ? (
          !(sim.kind === 'rpc' && sim.history(me).loading) && (
            <Empty title={m.recent.empty}>{sim.kind === 'sim' || faucetUrl ? m.recent.emptyFaucet : m.recent.emptyShare}</Empty>
          )
        ) : (
          <ul className="incoming">
            {incoming.map((r) => {
              if (r.op.action.kind !== 'AssetTransfer') return null;
              const asset = sim.assets.get(r.op.action.asset);
              const p = opProgress(sim, r, now);
              const big = r.op.action.asset === KSA_ASSET_ID && r.op.action.amount >= threshold;
              const stage = p.status === 'failed' ? 'failed' : p.stage;
              return (
                <li key={r.id} className="row-link" onClick={rowOpener({ name: 'op', id: r.id })}>
                  <AccountSeal id={r.op.account} />
                  <div className="incoming-main">
                    <Link to={{ name: 'op', id: r.id }} className="incoming-amount">
                      +{asset ? <Amount value={r.op.action.amount} asset={asset} maxFrac={asset.decimals} privacy /> : null}
                    </Link>
                    <span className="small soft">
                      {/* The sender as an address, the way every other list names an account (D-092) */}
                      {m.recent.from(sim.labels.get(r.op.account) ?? senderOf(sim.addressOf(r.op.account), r.op.account))} · <TimeAgo at={r.submittedAt} />
                    </span>
                  </div>
                  <div className="incoming-status">
                    <StatusBadge stage={stage} />
                    {big && stage !== 'final' && stage !== 'failed' && <span className="tag tag--warn">{m.recent.big}</span>}
                    {stage === 'final' && <span className="small soft">{m.recent.final}</span>}
                    {!big && (stage === 'fast' || stage === 'broadcast' || stage === 'on_btc' || stage === 'deep') && <span className="small soft">{m.recent.belowThreshold}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** A short name for a sender with no label: its address, or the hex account when there is no address */
function senderOf(address: string, account: Hex): string {
  return address ? shortAddress(address, 6, 4) : shortHash(account, 8, 4);
}
