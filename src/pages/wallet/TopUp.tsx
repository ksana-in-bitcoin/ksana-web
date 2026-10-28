/**
 * Top-up: buy KSA with BTC (D-078, D-085). The exchange is not a protocol feature but the lock flow of the example contract
 * ksa-exchange: the seller locks an amount of KSA and fixes the beneficiary account, the price per sat, the payment address and the
 * expiry height; before expiry the buyer pays the payment address, with the same BTC transaction carrying the claim operation
 * (one-time key signature, bound to the first input, D-086); after NATIVE_CONFIRMATIONS confirmations it is force-included and the
 * KSA is credited to the buyer's account.
 *
 * Simulator: lists the locks made out to this account, and the payment goes straight into the simulated BTC mempool; node data
 * source: enter the exchange contract and lock ID to read the lock, the wallet signs the PSBT's inputs, and the transaction is
 * broadcast through the Bitcoin RPC or the wallet (wallet/native.ts). A link may name the exchange and the lock
 * (`#/wallet/topup?exchange=<contract>&lock=<id>`, as the points page links the lock its seller made, D-126): the page opens
 * on that lock.
 */
import { useEffect, useId, useState } from 'react';
import { ChainMismatchError, RpcError, claimArgs, toHex } from '@ksana/sdk';
import { explainChainMismatch, explainRpcError } from '../../app/SourcePanel';
import { toast, watchOp } from '../../app/prefs';
import { type Route, useEntryState } from '../../app/router';
import { loadPref, savePref, useChain, useNow } from '../../app/store';
import { nativeTxFee } from '../../chain/fees';
import { KSA_ASSET_ID, KSA_DECIMALS, PARAMS } from '../../chain/params';
import type { ExchangeLockView } from '../../chain/model';
import type { RpcChain } from '../../chain/rpc/chain';
import type { Hex } from '../../chain/types';
import { nativeConfsOf, opProgress, txRoute } from '../../chain/views';
import { Tracker } from '../../components/Tracker';
import { AccountRef, CopyButton, Hash } from '../../components/Refs';
import { Amount, Sats } from '../../components/Values';
import { Banner, Button, ButtonLink, Empty, PageHead, Section, keepClear } from '../../components/ui';
import { useT } from '../../i18n';
import { fmtAmount, fmtInt, fmtSats, parseCount } from '../../lib/format';
import { type ConnectedWallet, WalletSwitchedError, afterSigning, isWalletRejection, useConnectedWallet } from '../../wallet/connect';
import { useMe } from '../../wallet/model';
import { MAX_FEE_RATE, type NativeSubmission, type UtxoChoice, coverage, coveredOnceConfirmed, loadUtxos, offeredFeeRate, spendable, submitTopUp, unconfirmed } from '../../wallet/native';
import { Wallet } from './Wallet';

const HEX64 = /^[0-9a-fA-F]{64}$/;
/** The expiry safety margin of the SDK's buildTopUp: it refuses when the current height plus the margin reaches the expiry height */
const EXPIRY_MARGIN = 3;

export function TopUp({ route }: { route: Extract<Route, { name: 'topup' }> }) {
  const me = useMe();
  if (!me) return <Wallet />;
  return <TopUpBody me={me} link={route} />;
}

/** The sats needed to get all of the locked KSA (same as the contract and the SDK: rounded up) */
const satsForAllOf = (lock: ExchangeLockView) => (lock.price > 0n ? (lock.ksa + lock.price - 1n) / lock.price : 0n);

interface Sent extends Partial<NativeSubmission> {
  opId: Hex;
  payBy?: number;
  ksa: bigint;
}

function TopUpBody({ me, link }: { me: Hex; link: { exchange?: string; lock?: string } }) {
  const sim = useChain();
  const now = useNow();
  const t = useT();
  const m = t.topup;
  const wallet = useConnectedWallet();
  const locksLabel = useId();
  const rpc = sim.kind === 'rpc';
  const ksaMeta = sim.assets.get(KSA_ASSET_ID) ?? { decimals: KSA_DECIMALS, symbol: 'KSA' };
  const btcHeight = sim.currentBtcHeight();

  // Locks: the simulator lists those made out to this account; the node data source reads one by contract and ID
  const mine = sim.kind === 'sim' ? sim.locksFor(me) : [];
  const [exchange, setExchange] = useState<string>(() => link.exchange ?? (sim.kind === 'sim' ? sim.exchangeContract : loadPref<string>('topup.exchange', '')));
  const [lockIdText, setLockIdText] = useState(link.lock ?? '');
  const [lock, setLock] = useState<ExchangeLockView | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const exchangeOk = HEX64.test(exchange);
  const lockId = parseCount(lockIdText);
  const lockIdOk = lockId !== null;

  // In the simulator a lock's state changes (claimed, released, expired): read the latest state on every render
  const live = lock ? (sim.kind === 'sim' ? sim.getLock(lock.exchange, lock.id) ?? lock : lock) : null;

  const load = async () => {
    if (!exchangeOk) {
      setLockError(m.lock.badExchange);
      return;
    }
    if (lockId === null) {
      setLockError(m.lock.badId);
      return;
    }
    const id = lockId;
    setLoading(true);
    setLockError(null);
    try {
      const found = sim.kind === 'sim' ? sim.getLock(exchange.toLowerCase(), id) : await sim.fetchLock(exchange.toLowerCase(), id);
      if (!found) setLockError(m.lock.notFound);
      else {
        setLock(found);
        if (rpc) savePref('topup.exchange', exchange.toLowerCase());
      }
    } catch (e) {
      // The node did not answer, or answered with an error: the lock may well be there, so the error says what failed (WEB_DESIGN 8.1)
      setLockError(m.lock.readFailed(sim.kind === 'rpc' ? explainRpcError(e, sim.config.url) : e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };
  // A link that names the exchange and the lock reads the lock as the page opens
  useEffect(() => {
    if (link.exchange && link.lock) void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Payment amount: defaults to the sats needed to get all of the KSA
  const [satsText, setSatsText] = useState('');
  const satsForAll = live ? satsForAllOf(live) : 0n;
  useEffect(() => {
    if (live) setSatsText(satsForAllOf(live).toString());
  }, [live?.exchange, live?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sats = parseCount(satsText) ?? 0n;
  const quote = live && sats > 0n ? (sats * live.price < live.ksa ? sats * live.price : live.ksa) : 0n;
  const partial = !!live && sats > 0n && sats < satsForAll;
  const over = !!live && sats > satsForAll;
  const blocksLeft = live ? live.expiry - btcHeight : 0;
  const tooLate = !!live && blocksLeft <= EXPIRY_MARGIN;
  const nearExpiry = !!live && !tooLate && blocksLeft <= PARAMS.NATIVE_CONFIRMATIONS + EXPIRY_MARGIN;
  const notMine = !!live && live.beneficiary !== me;

  // Fee: by the node's settlement fee rate, at most the page's cap (node data source, F-15), or the simulated market fee rate, for the
  // payment transaction as it is built (`buildTopUp`): the claim operation signed with its one-time key, the payment to the lock's
  // script and the change, with each input the coins take
  const est = sim.estimateFee();
  const feeRate = rpc ? offeredFeeRate(est.feerateSatVb) : est.market.feeRate;
  const feeCapped = rpc && est.feerateSatVb > MAX_FEE_RATE;
  const claimBytes = live ? sim.opSize('C', { kind: 'Call', contract: live.exchange, method: 'claim', args: rpc ? { borsh: toHex(claimArgs(live.id)) } : { lock: live.id } }) : 0;
  const feeOf = (inputs: number) => nativeTxFee(claimBytes, feeRate, inputs, [live?.script ? live.script.length / 2 : 34]);

  // Node data source: the UTXOs on the wallet address (Bitcoin RPC → Unisat → entered by hand)
  const [manual, setManual] = useState('');
  const [choice, setChoice] = useState<UtxoChoice | null>(null);
  const [utxoError, setUtxoError] = useState<string | null>(null);
  // The wallet switched to another account (wallet/connect.ts followWallet): the coins listed or typed for the last one go
  useEffect(() => {
    setChoice(null);
    setUtxoError(null);
    setManual('');
  }, [me]);
  useEffect(() => {
    if (!rpc || !wallet) return;
    let cancelled = false;
    setUtxoError(null);
    loadUtxos(sim as RpcChain, wallet, manual).then(
      (c) => {
        if (!cancelled) setChoice(c);
      },
      (e: unknown) => {
        if (!cancelled) setUtxoError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rpc, wallet, manual, sim.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Those it spends, apart from those waiting for a confirmation
  const coins = choice ? spendable(choice) : [];
  const waiting = choice ? unconfirmed(choice) : [];
  const available = coins.reduce((s, u) => s + u.valueSat, 0);
  const cover = coverage(coins, feeOf, Number(sats));
  // Short only until the coins waiting for a confirmation are confirmed
  const coverLater = !!choice && !cover.enough && waiting.length > 0 && coveredOnceConfirmed(choice, feeOf, Number(sats));
  const minerFee = feeOf(rpc && cover.enough ? cover.inputs : 1);

  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What was said of the last account goes once the page follows the wallet to another, unless a signing is ending: what that ended in
  // is said then (wallet/connect.ts afterSigning)
  useEffect(() => {
    if (!signing) setError(null);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  // Kept for the history entry: Back from the claim's page shows the result again, not the form
  const [sent, setSent] = useEntryState<Sent | null>('topup', null);
  // A result found on the way back is the page as it was left, not one that turned in place
  const [found, setFound] = useState(sent !== null);
  // The form came back from the result ("Top up again"), in place
  const [again, setAgain] = useState(false);

  const canPay = !!live && live.state === 'Open' && sats > 0n && !over && !tooLate && !notMine && !signing && (!rpc || (!!wallet && !!choice && cover.enough));

  const submit = async () => {
    if (!live) return;
    setSigning(true);
    setError(null);
    try {
      if (sim.kind === 'sim') {
        const res = sim.topUp(live.id, Number(sats), me);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        watchOp(res.opId);
        setSent({ opId: res.opId, ksa: quote });
        toast({ tone: 'neutral', title: m.sent.titleSim });
      } else {
        const w = wallet as ConnectedWallet;
        const res = await submitTopUp(sim, w, { exchange: live.exchange, lockId: live.id, sats, choice: choice as UtxoChoice, feeRate, allowPartial: partial });
        watchOp(res.opId);
        setSent({ ...res, ksa: res.ksa, payBy: res.payBy });
        // Nothing here could broadcast it: signed only, and the result hands the transaction back
        toast(res.broadcast.via === 'manual' ? { tone: 'warn', title: t.status.step.signedByHand } : { tone: 'neutral', title: m.sent.title });
      }
    } catch (caught) {
      const e = rpc && wallet ? await afterSigning(caught, wallet) : caught;
      const msg = e instanceof RpcError || e instanceof Error ? e.message : String(e);
      setError(
        e instanceof WalletSwitchedError ? msg : e instanceof ChainMismatchError ? explainChainMismatch(e) : isWalletRejection(msg) ? m.error.rejected(msg) : m.error.failed(msg),
      );
    } finally {
      setSigning(false);
    }
  };

  // A result found on the way back whose claim the page no longer knows (another data source) gives the form rather than a receipt
  if (sent && (!found || sim.getOp(sent.opId))) {
    const r = sim.getOp(sent.opId);
    // Handed back to be broadcast by hand, until the page sees the payment confirmed
    const byHand = sent.broadcast?.via === 'manual' && sim.getBtcTx(sent.broadcast.txid)?.status !== 'confirmed';
    // Keyed apart from the form, so that its head is a new one, which takes the top of the page and the focus
    return (
      <div className="page" key="paid">
        <PageHead eyebrow={t.wallet.title} title={!rpc ? m.sent.titleSim : byHand ? t.status.step.signedByHand : m.sent.title} meta={m.sent.then(nativeConfsOf(sim))} turned={!found} />
        <div className="panel panel-pad journey">
          {r && <Tracker progress={opProgress(sim, r, now)} />}
          <dl className="spec-list">
            <div className="spec-row">
              <dt>{m.sent.claim}</dt>
              <dd>
                <Hash value={sent.opId} to={{ name: 'op', id: sent.opId }} copy />
              </dd>
            </div>
            {sent.txid && (
              <div className="spec-row">
                <dt>{m.sent.tx}</dt>
                <dd>
                  <Hash value={sent.txid} to={txRoute(sim, sent.txid)} copy />
                </dd>
              </div>
            )}
            <div className="spec-row">
              <dt>{t.topup.pay.get}</dt>
              <dd>{m.sent.ksa(fmtAmount(sent.ksa, ksaMeta.decimals))}</dd>
            </div>
            {sent.payBy !== undefined && (
              <div className="spec-row">
                <dt>{m.lock.expiry}</dt>
                <dd>{m.sent.payBy(fmtInt(sent.payBy))}</dd>
              </div>
            )}
          </dl>
          {byHand && sent.broadcast?.via === 'manual' && (
            <Banner tone="warn" title={m.sent.manual} actions={<CopyButton text={sent.broadcast.rawHex} label={m.sent.copyRaw} showLabel />}>
              <code className="mono raw-hex">{sent.broadcast.rawHex}</code>
            </Banner>
          )}
        </div>
        <div className="row wrap gap-8">
          <Button
            onClick={() => {
              setSent(null);
              setFound(false);
              setAgain(true);
              setLock(null);
              setLockIdText('');
            }}
          >
            {m.sent.another}
          </Button>
          <ButtonLink to={{ name: 'wallet' }} variant="ghost">
            {m.sent.back}
          </ButtonLink>
        </div>
      </div>
    );
  }

  const lockCard = live && (
    <dl className="spec-list">
      <div className="spec-row">
        <dt>{m.lock.exchange}</dt>
        <dd>
          <Hash value={live.exchange} to={{ name: 'contract', id: live.exchange }} />
        </dd>
      </div>
      <div className="spec-row">
        <dt>{m.lock.id}</dt>
        <dd className="mono">{live.id.toString()}</dd>
      </div>
      <div className="spec-row">
        <dt>{m.lock.seller}</dt>
        <dd>
          <AccountRef id={live.seller} short />
        </dd>
      </div>
      <div className="spec-row">
        <dt>{m.lock.beneficiary}</dt>
        <dd>
          <AccountRef id={live.beneficiary} short />
          {notMine && <span className="field-error"> · {m.lock.notYours}</span>}
        </dd>
      </div>
      <div className="spec-row">
        <dt>{m.lock.ksa}</dt>
        <dd>
          <Amount value={live.ksa} asset={ksaMeta} />
        </dd>
      </div>
      <div className="spec-row">
        <dt>{m.lock.price}</dt>
        <dd>{m.lock.perSat(fmtAmount(live.price, ksaMeta.decimals))}</dd>
      </div>
      {live.address && (
        <div className="spec-row">
          <dt>{m.lock.payTo}</dt>
          <dd className="mono break">{live.address}</dd>
        </div>
      )}
      <div className="spec-row">
        <dt>{m.lock.expiry}</dt>
        <dd>{blocksLeft > 0 ? m.lock.blocksLeft(blocksLeft, fmtInt(live.expiry)) : m.lock.expired(fmtInt(live.expiry))}</dd>
      </div>
      <div className="spec-row">
        <dt>{t.common.status}</dt>
        <dd>
          {m.lock.state[live.state]}
          {live.state === 'Claimed' && live.paidSats !== undefined && live.ksaPaid !== undefined && <span className="soft"> · {m.lock.claimed(fmtSats(live.paidSats), fmtAmount(live.ksaPaid, ksaMeta.decimals))}</span>}
        </dd>
      </div>
    </dl>
  );

  return (
    <div className="page" key="form">
      <PageHead eyebrow={t.wallet.title} title={m.title} meta={m.one} turned={again} />
      <div className="grid-2">
        <Section title={m.lock.section}>
          {sim.kind === 'sim' && (
            <div className="stack gap-8">
              <div className="label" id={locksLabel}>{m.lock.mine}</div>
              {mine.length === 0 ? (
                <Empty title={m.lock.none} />
              ) : (
                <ul className="list-plain lock-list" aria-labelledby={locksLabel}>
                  {mine.map((l) => (
                    <li key={l.id.toString()}>
                      <button
                        type="button"
                        className={`lock-row${live?.id === l.id ? ' lock-row--active' : ''}`}
                        // The lock loaded is the current one: a row loads its lock, and picking it again leaves it loaded
                        aria-current={live?.id === l.id ? 'true' : undefined}
                        onClick={() => {
                          // The fields name the lock picked, as they do one loaded by its number
                          setExchange(l.exchange);
                          setLockIdText(l.id.toString());
                          setLock(l);
                          setLockError(null);
                        }}
                      >
                        <span className="mono soft">#{l.id.toString()}</span>
                        <span className="lock-row-terms">
                          <Amount value={l.ksa} asset={ksaMeta} size="sm" />
                          <span className="soft small">{m.lock.perSat(fmtAmount(l.price, ksaMeta.decimals))}</span>
                        </span>
                        <span className={`small ${l.state === 'Open' ? '' : 'soft'}`}>{m.lock.state[l.state]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="form-grid">
            <div className="field field--wide">
              <label htmlFor="topup-exchange" className="field-label">
                {m.lock.exchange}
              </label>
              <input
                id="topup-exchange"
                className="input mono"
                placeholder={m.lock.exchangePlaceholder}
                value={exchange}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(e) => setExchange(e.target.value.trim())}
                aria-invalid={!!exchange && !exchangeOk}
              />
            </div>
            <div className="field">
              <label htmlFor="topup-lock" className="field-label">
                {m.lock.id}
              </label>
              <div className="row gap-8">
                <input id="topup-lock" className="input mono" inputMode="numeric" placeholder="0" value={lockIdText} onChange={(e) => setLockIdText(e.target.value)} aria-invalid={!!lockIdText && !lockIdOk} />
                <Button onClick={() => void load()} disabled={loading || !exchange || !lockIdText}>
                  {loading ? m.lock.loading : m.lock.load}
                </Button>
              </div>
            </div>
          </div>
          {lockError && (
            <p className="field-msg">
              <span className="field-error">{lockError}</span>
            </p>
          )}
          {lockCard}
        </Section>

        <Section title={m.pay.section}>
          {!live ? (
            <Empty title={m.pay.needLock}>{m.pay.needLockHint}</Empty>
          ) : (
            <div className="stack gap-12">
              <div className="field">
                <label htmlFor="topup-sats" className="field-label">
                  {m.pay.amount}
                </label>
                <div className="input-affix">
                  <input id="topup-sats" className="input mono" inputMode="numeric" value={satsText} onChange={(e) => setSatsText(e.target.value)} aria-invalid={over || (!!satsText && sats <= 0n)} aria-describedby="topup-sats-msg" />
                  <span className="input-end" ref={keepClear}>
                    <button type="button" className="input-max" onClick={() => setSatsText(satsForAll.toString())}>
                      {m.pay.all}
                    </button>
                    <span className="input-suffix">{t.format.sats}</span>
                  </span>
                </div>
                <div id="topup-sats-msg" className="field-msg">
                  {sats <= 0n ? (
                    <span className="field-error">{m.pay.positive}</span>
                  ) : over ? (
                    <span className="field-error">{m.pay.over(fmtInt(satsForAll))}</span>
                  ) : partial ? (
                    <span className="field-warn">{m.pay.partial}</span>
                  ) : (
                    <span className="field-hint">{m.pay.forAll(fmtInt(satsForAll))}</span>
                  )}
                </div>
              </div>
              <dl className="spec-list">
                <div className="spec-row">
                  <dt>{m.pay.get}</dt>
                  <dd>
                    <Amount value={quote} asset={ksaMeta} size="lg" />
                  </dd>
                </div>
                <div className="spec-row">
                  <dt>{m.pay.minerFee}</dt>
                  <dd>
                    <Sats value={minerFee} size="sm" /> <span className="soft small">· {m.pay.rate(String(feeRate))}</span>
                    {feeCapped && <div className="field-warn small">{t.ui.feeRateCapped(String(est.feerateSatVb), String(MAX_FEE_RATE))}</div>}
                  </dd>
                </div>
                {rpc && (
                  <div className="spec-row">
                    <dt>{m.pay.utxo.label}</dt>
                    <dd>
                      {utxoError ? (
                        <span className="field-error">{utxoError}</span>
                      ) : !choice ? (
                        <span className="soft">{m.pay.utxo.loading}</span>
                      ) : choice.utxos.length === 0 ? (
                        <span className="field-warn">{m.pay.utxo.none}</span>
                      ) : (
                        <span>
                          {m.pay.utxo.available(fmtSats(available), coins.length)} <span className="soft small">· {m.pay.utxo.source[choice.source]}</span>
                          {waiting.length > 0 && (
                            <span className={`${coverLater ? 'field-warn' : 'soft'} small coins-waiting`}>{m.pay.utxo.unconfirmed(fmtSats(waiting.reduce((s, u) => s + u.valueSat, 0)), waiting.length)}</span>
                          )}
                          {sats > 0n && !over && !cover.enough && !coverLater && <span className="field-warn small coins-waiting">{m.pay.utxo.short(fmtSats(cover.need))}</span>}
                        </span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              {rpc && (!choice || choice.source === 'manual') && (
                <div className="field field--wide">
                  <label htmlFor="topup-manual" className="field-label">
                    {m.pay.utxo.manualLabel}
                  </label>
                  <textarea id="topup-manual" className="input mono" rows={3} placeholder={m.pay.utxo.manualPlaceholder} value={manual} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={(e) => setManual(e.target.value)} />
                  <div className="field-msg">
                    <span className="field-hint">{m.pay.utxo.manualHint}</span>
                  </div>
                </div>
              )}
              {live.state !== 'Open' ? (
                <Banner tone="warn" title={m.lock.state[live.state]} />
              ) : tooLate ? (
                <Banner tone="danger" title={m.pay.tooLate} />
              ) : nearExpiry ? (
                <Banner tone="warn" title={m.pay.nearExpiry(blocksLeft)} />
              ) : null}
              {error && <Banner tone="danger" title={error} />}
              <p className="small soft">{m.pay.how}</p>
              <div className="row wrap gap-8">
                <Button onClick={() => void submit()} disabled={!canPay} variant="primary">
                  {signing ? m.pay.signing : rpc ? m.pay.submit : m.pay.submitSim}
                </Button>
                {rpc && !wallet && <span className="field-warn">{m.pay.disconnected}</span>}
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
