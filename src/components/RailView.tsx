import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../app/router';
import { prefersReducedMotion, useChain, useNow } from '../app/store';
import { blockStage, btcBlockSealed, btcNetworkOf, currentSettlement, emptyShare, laneIdle, laneQuiet, STAGE_LABEL, type Stage } from '../chain/views';
import { BTC_FINAL_DATA_CONFS, PARAMS } from '../chain/params';
import type { Block, BtcBlock } from '../chain/types';
import { fmtInt, timeAgo } from '../lib/format';
import { labelStep, spacedHeights } from '../lib/labels';
import { StatusMark } from './Status';
import { Tabs } from './ui';
import { useT } from '../i18n';

/** A BTC block whose time is known */
type TimedBtcBlock = BtcBlock & { time: number };

/**
 * Dual-rail view: the upper rail is the fast lane, the lower rail is Bitcoin, and the x-axis is time (now is at the right edge).
 * The height of a fast-lane block's bar is its entry count; settlement transactions are threads hanging from a fast-lane block down to a BTC block.
 * Parallel blocks (GHOSTDAG, D-063) are drawn on a tributary below the fast lane, with a thin line flowing into the chain block that merges them.
 * The background has three zones: BTC-final (zhu), on Bitcoin (mo), fast-confirmed (qing).
 */

const H = 236;
const FAST_Y = 104;
/** The tributary that parallel blocks sit on */
const SIDE_Y = FAST_Y + 30;
const BTC_Y = 176;
const AXIS_Y = 222;
const LEFT = 92;
const RIGHT_PAD = 56;
/** The fade over the left edge, where blocks leave the view */
const FADE_W = 28;

/** A time window, in seconds */
type Scale = '90' | '240' | '720' | '1800' | '10800';

/** BTC blocks this far apart or more (signet, mainnet) make the short windows show none at all */
const SLOW_BTC_MS = 120_000;

/** The windows the rail offers: the simulator's and devnet's BTC blocks come in seconds, signet's every ten minutes */
function scalesOf(btcIntervalMs: number): Scale[] {
  return btcIntervalMs >= SLOW_BTC_MS ? ['240', '1800', '10800'] : ['90', '240', '720'];
}

/**
 * The window shown until one is picked. Where BTC blocks come seconds apart it reaches the BTC-final boundary, about
 * BTC_FINAL_DATA_CONFS + 1 BTC blocks back (D-114): 4 minutes with devnet's 10-second blocks, 12 with the simulator's 30-second
 * ones; a phone keeps 90 seconds. With BTC's ten minutes an idle fast lane, whose empty blocks come minutes apart (two-speed
 * difficulty, D-084, D-090), gets three hours, which reach past the final boundary
 */
function autoScale(btcIntervalMs: number, idle: boolean, narrow: boolean): Scale {
  if (btcIntervalMs < SLOW_BTC_MS) return narrow ? '90' : (BTC_FINAL_DATA_CONFS + 1) * btcIntervalMs * 1.5 <= 240_000 ? '240' : '720';
  if (idle) return '10800';
  return narrow ? '240' : '1800';
}

/** Axis ticks at least 64 px apart, at most six intervals, on whole seconds for windows up to two minutes and whole minutes above */
function axisStep(windowSec: number, pxPerSec: number): number {
  const steps = windowSec <= 120 ? [15, 30, 45, 60] : [60, 120, 180, 300, 600, 900, 1800, 3600];
  return steps.find((s) => windowSec % s === 0 && s * pxPerSec >= 64 && windowSec / s <= 6) ?? windowSec;
}

/** The width of a boundary label in its 11 px monospace face: 0.6 em a character, a full em for a CJK or Hangul one, which the face lacks */
function labelWidth(text: string): number {
  let w = 0;
  for (const c of text) w += /[\u1100-\u115f\u2e80-\u9fff\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]/.test(c) ? 11 : 6.6;
  return w;
}

/**
 * Where a boundary's label goes, for its line at `x` on a rail `width` wide: right of the line, or left of it where it would run past
 * the right edge (a boundary near now: "Settled #1,880" ran off a phone's screen). `from` and `to` are the room it takes
 */
export function boundaryLabel(x: number, text: string, barW: number, width: number): { x: number; anchor: 'start' | 'end'; from: number; to: number } {
  const w = labelWidth(text);
  const right = x + barW / 2 + 5;
  if (right + w <= width - 4) return { x: right, anchor: 'start', from: right, to: right + w };
  const end = x + barW / 2 - 3;
  return { x: end, anchor: 'end', from: end - w, to: end };
}

interface Hover {
  x: number;
  y: number;
  title: string;
  lines: string[];
  stage: Stage;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(960);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function RailView() {
  const sim = useChain();
  const t = useT();
  const r = t.overview.rail;
  const now = useNow();
  const [boxRef, width] = useWidth<HTMLDivElement>();
  const narrow = width < 640;
  const scales = scalesOf(sim.btcIntervalMs);
  // Idle or busy for the window shown by default, with a margin around the half so that it does not flip with every block; two
  // empty blocks at the tip make it idle at once, so that the end of a burst of operations does not leave a short window empty
  const share = emptyShare(sim);
  const quiet = laneQuiet(sim);
  const [idleWindow, setIdleWindow] = useState(share > 0.5 || quiet);
  useEffect(() => {
    if (share > 0.7 || quiet) setIdleWindow(true);
    else if (share < 0.3) setIdleWindow(false);
  }, [share, quiet]);
  const [picked, setScale] = useState<Scale | null>(null);
  // A window picked for another data source's chain does not carry over
  const scale = picked !== null && scales.includes(picked) ? picked : autoScale(sim.btcIntervalMs, idleWindow, narrow);
  const windowSec = Number(scale);
  const left = narrow ? 12 : LEFT;
  const xNow = width - (narrow ? 34 : RIGHT_PAD);
  const pps = (xNow - left) / windowSec / 1000;
  const groupRef = useRef<SVGGElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // Re-layout whenever the chain data changes; between two layouts, pan with a transform instead of re-rendering every frame
  const refT = useMemo(() => Date.now(), [sim.version, now, windowSec, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const xOf = (t: number) => xNow - (refT - t) * pps;
  const tMin = refT - (windowSec + 30) * 1000;

  // Align the pan offset right after a re-layout so there is no one-frame jump
  useLayoutEffect(() => {
    const dx = -(Date.now() - refT) * pps;
    groupRef.current?.setAttribute('transform', `translate(${dx.toFixed(2)} 0)`);
  });

  // Pan a device pixel at a time, from the place the re-layout above has just set: a pan set every frame (60 to 120 times a second)
  // restyled and repainted the same picture in between, and a window of hours moves less than a device pixel between two re-layouts,
  // a second apart
  useEffect(() => {
    if (prefersReducedMotion() || !(pps > 0)) return;
    const stepMs = 1 / (pps * (window.devicePixelRatio || 1));
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      if (stepMs < 20) raf = requestAnimationFrame(pan);
      else timer = setTimeout(() => (raf = requestAnimationFrame(pan)), stepMs);
    };
    const pan = () => {
      const dx = -(Date.now() - refT) * pps;
      groupRef.current?.setAttribute('transform', `translate(${dx.toFixed(2)} 0)`);
      next();
    };
    next();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [refT, pps]);

  const blocks: Block[] = [];
  for (let i = sim.blocks.length - 1; i > 0; i--) {
    const b = sim.blocks[i];
    if (!b || b.time < tMin) break;
    blocks.push(b);
  }
  blocks.reverse();
  const sides = sim.sideBlocks.filter((o) => o.time >= tMin);
  const btcBlocks: TimedBtcBlock[] = [];
  for (let i = sim.btcBlocks.length - 1; i >= 0; i--) {
    const b = sim.btcBlocks[i] as BtcBlock;
    // The node data source leaves out the times its blocks do not tell: such a block has no place on the time axis
    if (b.time === undefined) continue;
    if (b.time < tMin - 60_000) break;
    btcBlocks.push(b as TimedBtcBlock);
  }
  btcBlocks.reverse();
  // Times read from the fast lane coincide for BTC blocks first seen by the same fast-lane block: an older box steps left of the newer one
  const btcX = new Map<number, number>();
  {
    let next = Infinity;
    for (let i = btcBlocks.length - 1; i >= 0; i--) {
      const b = btcBlocks[i] as TimedBtcBlock;
      const x = Math.min(xOf(b.time), next - 20);
      btcX.set(b.height, x);
      next = x;
    }
  }
  const mempoolX = xNow + 22;

  // The node data source may not have cached the block at a boundary (an older block); treat it as off the left edge of the viewport
  const finalBlock = sim.blocks[sim.finalHeight];
  const settledBlock = sim.blocks[sim.settledHeight];
  const xFinal = finalBlock ? xOf(finalBlock.time) : -Infinity;
  const xSettled = settledBlock ? xOf(settledBlock.time) : -Infinity;
  const edge = left - 40;
  const clampL = (x: number) => Math.max(edge, x);
  const finalOff = xFinal < left;
  const settledOff = xSettled < left;
  const mempoolSettlements = sim.pendingSettlements.length;

  const barH = (n: number) => (n === 0 ? 5 : Math.min(62, 10 + n * 4.2));

  // The room per block in view sets the bar width and how often heights are labeled: an idle chain's blocks are far apart
  const spacing = (xNow - left) / Math.max(1, blocks.length);
  const labelEvery = labelStep(spacing, sim.tip.header.height);

  // Label collision avoidance: from the newest to the oldest, a label only where it keeps its distance from the one drawn after it.
  // A label is drawn only where it starts clear of the fade at the left edge: half under it, "326,307" read "26,307"
  const fadeEnd = left + FADE_W * 0.7;
  const fastLabels = spacedHeights(
    blocks.filter((b) => b.header.height % labelEvery === 0).map((b) => ({ x: xOf(b.time), height: b.header.height })),
    38,
    fadeEnd,
  );
  const btcLabels = spacedHeights(
    btcBlocks.map((b) => ({ x: btcX.get(b.height) ?? xOf(b.time), height: b.height })),
    46,
    fadeEnd,
  );
  const barW = Math.max(2, Math.min(6, spacing * 0.36));
  const settledText = r.settled(fmtInt(sim.settledHeight));
  const finalText = sim.settledHeight === sim.finalHeight ? r.settledFinal(fmtInt(sim.finalHeight)) : r.final(fmtInt(sim.finalHeight));
  const settledLabel = boundaryLabel(xSettled, settledText, barW, width);
  const finalLabel = boundaryLabel(xFinal, finalText, barW, width);
  // The settled label steps down a line where it would run into the final one, or into the hint for a final boundary off the left
  // edge (which the time running on moves it towards between layouts, hence the margin)
  const settledLow = finalOff
    ? settledLabel.from < left + 4 + labelWidth(`← ${r.final(fmtInt(sim.finalHeight))}`) + 12
    : settledLabel.from < finalLabel.to + 17 && finalLabel.from < settledLabel.to + 17;

  const threads: { d: string; dashed: boolean; key: string; final: boolean }[] = [];
  const addThread = (b: Block, x1: number, y1: number) => {
    if (!b.needsSettlement) return;
    const tx = currentSettlement(sim, b);
    if (!tx || tx.status === 'built' || tx.status === 'invalid' || tx.status === 'replaced') return;
    let x2: number;
    let dashed = false;
    if (tx.status === 'confirmed' && tx.confirmedHeight !== undefined) {
      const bx = btcX.get(tx.confirmedHeight);
      if (bx === undefined) return;
      x2 = bx;
    } else {
      x2 = mempoolX;
      dashed = true;
    }
    const y2 = BTC_Y - 9;
    const my = (y1 + y2) / 2;
    const final = (b.acceptedHeight ?? Infinity) <= sim.finalHeight;
    threads.push({ d: `M${x1.toFixed(1)} ${y1} C${x1.toFixed(1)} ${my} ${x2.toFixed(1)} ${my} ${x2.toFixed(1)} ${y2}`, dashed, key: tx.txid, final });
  };
  for (const b of blocks) addThread(b, xOf(b.time), FAST_Y + 2);
  for (const o of sides) addThread(o, xOf(o.time), SIDE_Y + 4);

  // A parallel block flows into the chain block that merges it
  const merges = sides.map((o) => {
    const by = o.acceptedHeight !== undefined ? (sim.blocks[o.acceptedHeight] as Block | undefined) : undefined;
    const x1 = xOf(o.time);
    const skipped = o.entries.filter((e) => e.result.reason === 'skipped').length;
    if (!by) return { o, x1, d: null as string | null, skipped };
    const x2 = xOf(by.time);
    const d = `M${x1.toFixed(1)} ${SIDE_Y - 4} C${x1.toFixed(1)} ${FAST_Y + 12} ${x2.toFixed(1)} ${SIDE_Y - 6} ${x2.toFixed(1)} ${FAST_Y + 1}`;
    return { o, x1, d, skipped };
  });

  const showTip = (e: React.MouseEvent, h: Omit<Hover, 'x' | 'y'>) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ ...h, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  const axisTicks: { x: number; label: string }[] = [];
  const step = axisStep(windowSec, pps * 1000);
  for (let s = 0; s <= windowSec; s += step) {
    axisTicks.push({ x: xNow - s * 1000 * pps, label: s === 0 ? r.now : windowSec <= 120 ? t.format.axisSeconds(s) : t.format.axisMinutes(s / 60) });
  }
  // An idle fast lane's blocks come minutes apart, though an entry still gets into one in about the target time: the page says why
  const idle = laneIdle(sim);
  const slowestEmptyMin = Math.round((PARAMS.MAX_EMPTY_BLOCK_WEIGHT * PARAMS.TARGET_BLOCK_TIME) / 60);

  const ariaLabel = r.aria(fmtInt(sim.tip.header.height), fmtInt(sim.settledHeight), fmtInt(sim.finalHeight), fmtInt(sim.btcTip.height));

  return (
    <div className="rail" ref={boxRef}>
      <div className="rail-toolbar">
        <Legend />
        <Tabs<Scale>
          label={r.range}
          value={scale}
          onChange={setScale}
          options={scales.map((s) => ({ value: s, label: Number(s) <= 120 ? t.format.seconds(s) : Number(s) % 3600 === 0 ? t.format.hours(Number(s) / 3600) : t.format.minutes(Number(s) / 60) }))}
        />
      </div>
      {narrow && (
        <p className="rail-lanes small soft">
          {idle ? r.lanesIdle(<b>{r.fast}</b>, <b>{r.btc}</b>, PARAMS.TARGET_BLOCK_TIME) : r.lanes(<b>{r.fast}</b>, <b>{r.btc}</b>, PARAMS.TARGET_BLOCK_TIME)}
        </p>
      )}
      <svg className="rail-svg" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        <defs>
          <clipPath id="rail-clip">
            <rect x={left} y="0" width={Math.max(0, xNow - left + 46)} height={H} />
          </clipPath>
          <linearGradient id="rail-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--surface)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--surface)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Rail baselines and rail names */}
        <line x1={left} x2={xNow + 40} y1={FAST_Y} y2={FAST_Y} className="rail-line rail-line--fast" />
        <line x1={left} x2={xNow + 40} y1={BTC_Y} y2={BTC_Y} className="rail-line rail-line--btc" />
        {!narrow && (
          <g className="rail-names">
            <text x={12} y={FAST_Y - 18} className="rail-name">
              {r.fast}
            </text>
            <text x={12} y={FAST_Y - 2} className="rail-sub">
              {t.format.aboutSeconds(PARAMS.TARGET_BLOCK_TIME)}
            </text>
            <text x={12} y={BTC_Y - 18} className="rail-name">
              {r.btc}
            </text>
            <text x={12} y={BTC_Y - 2} className="rail-sub">
              {btcNetworkOf(sim)}
            </text>
          </g>
        )}

        <g clipPath="url(#rail-clip)">
          <g ref={groupRef}>
            {/* Three background zones: BTC-final / on Bitcoin / fast-confirmed */}
            <rect x={edge} y={18} width={Math.max(0, clampL(xFinal) - edge + barW / 2)} height={FAST_Y - 14} className="rail-zone rail-zone--final" />
            <rect x={clampL(xFinal) + barW / 2} y={18} width={Math.max(0, xSettled - clampL(xFinal))} height={FAST_Y - 14} className="rail-zone rail-zone--mo" />
            <rect x={clampL(xSettled) + barW / 2} y={18} width={Math.max(0, xNow + 120 - clampL(xSettled))} height={FAST_Y - 14} className="rail-zone rail-zone--qing" />

            {/* Settlement threads */}
            {threads.map((t) => (
              <path key={t.key} d={t.d} className={`rail-thread${t.dashed ? ' rail-thread--pending' : ''}${t.final ? ' rail-thread--final' : ''}`} />
            ))}

            {/* Parallel blocks: small circles on the tributary; once merged, a thin line flows into the chain block */}
            {merges.map(({ o, x1, d, skipped }) => {
              const merged = !!d;
              const by = o.acceptedHeight;
              return (
                <g
                  key={o.hash}
                  className={`rail-side${merged ? '' : ' rail-side--unmerged'}`}
                  onMouseMove={(e) =>
                    showTip(e, {
                      title: t.status.sideBlock(fmtInt(o.header.height)),
                      lines: [
                        `${sim.labels.get(o.header.producer) ?? t.common.producer} · ${r.entries(o.entries.length)}`,
                        merged ? t.status.step.mergedBy(fmtInt(by ?? 0)) : t.status.step.mergeWaiting,
                        ...(merged && skipped ? [r.skipped(skipped)] : []),
                      ],
                      stage: merged ? blockStage(sim, o) : 'unmerged',
                    })
                  }
                  onClick={() => navigate({ name: 'block', id: o.hash })}
                >
                  {d && <path d={d} className="rail-merge" />}
                  <rect x={x1 - 7} y={SIDE_Y - 8} width={14} height={16} className="rail-hit" />
                  <circle cx={x1} cy={SIDE_Y} r={3.6} className="rail-side-dot" />
                </g>
              );
            })}

            {/* Fast-lane blocks */}
            {blocks.map((b) => {
              const x = xOf(b.time);
              const n = b.entries.length;
              const h = barH(n);
              const stage = blockStage(sim, b);
              const forced = b.entries.some((e) => e.entry.kind === 'Forced');
              return (
                <g
                  key={b.hash}
                  className={`rail-block rail-block--${n === 0 ? 'empty' : stage}`}
                  onMouseMove={(e) =>
                    showTip(e, {
                      title: t.status.fastBlock(fmtInt(b.header.height)),
                      lines: [forced ? r.entriesForced(n) : r.entries(n), `${STAGE_LABEL[stage]} · ${timeAgo(b.time, Date.now())}`],
                      stage,
                    })
                  }
                  onClick={() => navigate({ name: 'block', id: String(b.header.height) })}
                >
                  <rect x={x - barW / 2 - 3} y={FAST_Y - 66} width={barW + 6} height={70} className="rail-hit" />
                  <rect x={x - barW / 2} y={FAST_Y - h} width={barW} height={h} rx={barW > 3 ? 1 : 0} className="rail-bar" />
                  {forced && <circle cx={x} cy={FAST_Y - h - 4} r={1.8} className="rail-forced" />}
                  {fastLabels.has(b.header.height) && (
                    <text x={x} y={FAST_Y + 15} className="rail-height">
                      {fmtInt(b.header.height)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Boundaries of the settled closure and of BTC finality; when the two coincide or sit too close, the labels are merged or staggered.
                Both lines go before both labels, so that a label turned left of its line, across the other boundary's, breaks that line with its
                halo rather than being crossed by it ("S|ettled #1,938") */}
            {!settledOff && sim.settledHeight !== sim.finalHeight && (
              <g className="rail-boundary rail-boundary--mo">
                <line x1={xSettled + barW / 2 + 1} x2={xSettled + barW / 2 + 1} y1={14} y2={FAST_Y} />
              </g>
            )}
            {!finalOff && (
              <g className="rail-boundary rail-boundary--zhu">
                <line x1={xFinal + barW / 2 + 1} x2={xFinal + barW / 2 + 1} y1={14} y2={FAST_Y} />
              </g>
            )}
            {!settledOff && sim.settledHeight !== sim.finalHeight && (
              <g className="rail-boundary rail-boundary--mo">
                <text x={settledLabel.x} y={settledLow ? 40 : 26} textAnchor={settledLabel.anchor}>
                  {settledText}
                </text>
              </g>
            )}
            {!finalOff && (
              <g className="rail-boundary rail-boundary--zhu">
                <text x={finalLabel.x} y={26} textAnchor={finalLabel.anchor}>
                  {finalText}
                </text>
              </g>
            )}

            {/* BTC blocks: those carrying Ksana data are solid mo blocks, and once that data is BTC-final, at BTC_FINAL_DATA_CONFS confirmations at the earliest, a vermilion seal is stamped on the corner */}
            {btcBlocks.map((b) => {
              const x = btcX.get(b.height) ?? xOf(b.time);
              const confs = sim.btcTip.height - b.height + 1;
              const sealed = btcBlockSealed(sim, b);
              const ksana = b.txids.length;
              return (
                <g
                  key={b.height}
                  className={`rail-btc${ksana ? ' rail-btc--data' : ''}`}
                  onMouseMove={(e) =>
                    showTip(e, {
                      title: `BTC #${fmtInt(b.height)}`,
                      // A node's page knows only some of the Ksana transactions on BTC
                      lines: [ksana ? r.ksanaTxs(ksana) : sim.kind === 'rpc' ? t.btc.noKnownTxs : r.noKsanaTxs, `${r.confs(confs)} · ${timeAgo(b.time, Date.now())}`],
                      stage: ksana ? (sealed ? 'final' : confs >= PARAMS.BTC_FINALITY_CONFS ? 'deep' : 'on_btc') : 'pending',
                    })
                  }
                  onClick={() => navigate({ name: 'btc', height: b.height })}
                >
                  <rect x={x - 8} y={BTC_Y - 9} width={16} height={18} rx={1.5} className="rail-btc-box" />
                  {sealed && ksana > 0 && <rect x={x + 2} y={BTC_Y - 13} width={7} height={7} rx={1} className="rail-btc-seal" />}
                  {btcLabels.has(b.height) && (
                    <text x={x} y={BTC_Y + 26} className="rail-btc-height">
                      {fmtInt(b.height)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>

        {/* Fade at the left edge, and hints for boundaries that have scrolled out of view */}
        <rect x={left} y={10} width={FADE_W} height={H - 30} fill="url(#rail-fade)" pointerEvents="none" />
        {(finalOff || settledOff) && (
          <g className="rail-offscreen">
            {settledOff && sim.settledHeight === sim.finalHeight ? (
              <text x={left + 4} y={26} className="rail-boundary-off rail-boundary-off--zhu">
                ← {r.settledFinal(fmtInt(sim.finalHeight))}
              </text>
            ) : settledOff ? (
              <text x={left + 4} y={26} className="rail-boundary-off rail-boundary-off--mo">
                ← {r.settled(fmtInt(sim.settledHeight))}
              </text>
            ) : (
              <text x={left + 4} y={26} className="rail-boundary-off rail-boundary-off--zhu">
                ← {r.final(fmtInt(sim.finalHeight))}
              </text>
            )}
          </g>
        )}

        {/* Now: the fast-lane block being formed and the BTC mempool */}
        <g className="rail-now">
          <line x1={xNow + 14} x2={xNow + 14} y1={12} y2={AXIS_Y - 14} className="rail-now-line" />
          <rect x={xNow + 14 - barW / 2 - 1} y={FAST_Y - 22} width={barW + 2} height={22} rx="1" className="rail-forming" />
          <rect x={mempoolX - 8} y={BTC_Y - 9} width={16} height={18} rx="1.5" className="rail-mempool" />
          {mempoolSettlements > 0 && (
            <text x={mempoolX} y={BTC_Y - 15} className="rail-mempool-count">
              {mempoolSettlements}
            </text>
          )}
        </g>

        {/* Time axis */}
        <g className="rail-axis">
          {axisTicks.map((t) => (
            <g key={t.label}>
              <line x1={t.x} x2={t.x} y1={AXIS_Y - 14} y2={AXIS_Y - 9} />
              <text x={t.x} y={AXIS_Y}>
                {t.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
      {!narrow && idle && <p className="rail-note small soft">{r.idle(PARAMS.TARGET_BLOCK_TIME, slowestEmptyMin)}</p>}
      {hover && (
        <div className="rail-tip" style={{ left: Math.min(hover.x + 14, width - 200), top: Math.max(4, hover.y - 64) }} role="status">
          <div className="rail-tip-title">
            <StatusMark stage={hover.stage} />
            {hover.title}
          </div>
          {hover.lines.map((l) => (
            <div key={l} className="rail-tip-line">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend() {
  const t = useT();
  const items: { stage: Stage; label: string }[] = [
    { stage: 'fast', label: t.status.stage.fast },
    { stage: 'broadcast', label: t.status.step.broadcast },
    { stage: 'on_btc', label: t.status.stage.on_btc },
    { stage: 'final', label: t.status.stage.final },
    { stage: 'unmerged', label: t.common.sideBlock },
  ];
  return (
    <ul className="legend" aria-label={t.overview.rail.legend}>
      {items.map((i) => (
        <li key={i.stage}>
          <StatusMark stage={i.stage} />
          {i.label}
        </li>
      ))}
      <li className="legend-note">{t.overview.rail.barHeight}</li>
    </ul>
  );
}
