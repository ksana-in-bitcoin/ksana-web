import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../app/store';

/**
 * Ensō: the circle of Zen painting drawn in a single stroke, made in one instant, a symbol of completeness and eternity.
 * The stroke starts full and dries out towards its end, with a vermilion seal left at the bottom right, like the seal stamped at the
 * signature of a painting.
 */
function ensoPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number, wMax: number): string {
  const n = 72;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const f = t < 0.08 ? 0.82 + 2.25 * t : 1 - 0.8 * Math.pow((t - 0.08) / 0.92, 1.4);
    const w = wMax * f;
    const wobble = 0.28 * Math.sin(t * Math.PI * 3.2);
    const a = ((startDeg + sweepDeg * t) * Math.PI) / 180;
    const ro = r + wobble + w / 2;
    const ri = r + wobble - w / 2;
    outer.push([cx + ro * Math.cos(a), cy + ro * Math.sin(a)]);
    inner.push([cx + ri * Math.cos(a), cy + ri * Math.sin(a)]);
  }
  const fmt = (p: [number, number]) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  const first = outer[0] as [number, number];
  const capR = (wMax * 0.82) / 2;
  let d = `M ${fmt(first)}`;
  for (let i = 1; i < outer.length; i++) d += ` L ${fmt(outer[i] as [number, number])}`;
  for (let i = inner.length - 1; i >= 0; i--) d += ` L ${fmt(inner[i] as [number, number])}`;
  d += ` A ${capR.toFixed(2)} ${capR.toFixed(2)} 0 0 1 ${fmt(first)} Z`;
  return d;
}

const START = 100;
const SWEEP = 300;

/** The ensō's stroke and its seal in a 32 × 32 box: index.html draws the same mark while the page's scripts download (boot.test.ts) */
export const ENSO = (() => {
  const sealA = (70 * Math.PI) / 180;
  const sx = 16 + 11 * Math.cos(sealA);
  const sy = 16 + 11 * Math.sin(sealA);
  return { d: ensoPath(16, 16, 11, START, SWEEP, 3.6), seal: { x: (sx - 3.1).toFixed(2), y: (sy - 3.1).toFixed(2), transform: `rotate(-8 ${sx.toFixed(2)} ${sy.toFixed(2)})` } };
})();

export function EnsoMark({ size = 28, title = 'Ksana' }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title} className="enso-mark">
      <path d={ENSO.d} fill="var(--ink)" />
      <rect x={ENSO.seal.x} y={ENSO.seal.y} width="6.2" height="6.2" rx="0.8" fill="var(--zhu)" transform={ENSO.seal.transform} />
    </svg>
  );
}

/** The brand is "Ksana" in every language; it has no translated name */
export function Wordmark() {
  return (
    <span className="wordmark">
      <EnsoMark />
      <span className="wordmark-text">Ksana</span>
    </span>
  );
}

/**
 * Block clock: one full circle per fast-lane block.
 * When the circle is full and no block has arrived yet, the outer ring turns dashed to show the randomness of PoW block production
 * (about 5 seconds on average).
 */
export function BlockClock({ lastBlockAt, target, height, size = 18 }: { lastBlockAt: number; target: number; height: number; size?: number }) {
  const arcRef = useRef<SVGCircleElement>(null);
  const rootRef = useRef<SVGSVGElement>(null);
  const prevHeight = useRef(height);

  // The arc fills over one target interval, a device pixel at a time, and then stays full until the next block, which runs this
  // again: once it is full the overdue ring's own animation takes over and nothing here is redrawn (a loop left running restyled the
  // clock every frame, nearly all the time on signet, where an idle chain's blocks come minutes apart)
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const stepMs = reduced ? 1000 : target / (((2 * Math.PI * 7.5 * size) / 20) * (window.devicePixelRatio || 1));
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const paint = () => {
      const f = Math.min(1, (Date.now() - lastBlockAt) / target);
      arcRef.current?.setAttribute('stroke-dashoffset', String(1 - f));
      rootRef.current?.classList.toggle('overdue', f >= 1);
      if (f >= 1) return;
      if (stepMs < 20) raf = requestAnimationFrame(paint);
      else timer = setTimeout(() => (raf = requestAnimationFrame(paint)), stepMs);
    };
    paint();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [lastBlockAt, target, size]);

  useEffect(() => {
    if (height !== prevHeight.current) {
      prevHeight.current = height;
      const el = rootRef.current;
      if (!el) return;
      el.classList.remove('flash');
      void el.getBoundingClientRect();
      el.classList.add('flash');
    }
  }, [height]);

  return (
    <svg ref={rootRef} className="block-clock" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle className="block-clock-track" cx="10" cy="10" r="7.5" pathLength={1} />
      <circle
        ref={arcRef}
        className="block-clock-arc"
        cx="10"
        cy="10"
        r="7.5"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="1"
        transform="rotate(-90 10 10)"
      />
      <circle className="block-clock-dot" cx="10" cy="10" r="2.2" />
    </svg>
  );
}
