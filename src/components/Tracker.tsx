import { useRef } from 'react';
import { useNow } from '../app/store';
import type { OpProgress, StepView } from '../chain/views';
import { fmtClock, fmtDateTime, fmtEta } from '../lib/format';
import { Link } from './Refs';
import { StatusMark, Ticks } from './Status';
import { useT } from '../i18n';

/**
 * The life of an operation: from fast confirmation to BTC finality.
 * Path B: sign → fast-confirmed → settlement broadcast → written to Bitcoin → 6 BTC confirmations → BTC-final
 * Path C: sign and broadcast → BTC confirmation → forced inclusion (fast-confirmed) → block header lands on BTC → 6 BTC confirmations → BTC-final
 * (the six are BTC_FINALITY_CONFS, D-116; path A is gone, D-078)
 */
export function Tracker({ progress, compact = false }: { progress: OpProgress; compact?: boolean }) {
  const t = useT();
  const steps = progress.steps;
  const activeIdx = steps.findIndex((s) => s.state === 'active');
  const times = stepTimes(steps, useNow());
  const seen = useRef<Map<string, StepView['state']> | null>(null);
  const stamped = useRef(new Set<string>());
  stamps(seen.current, steps, stamped.current);
  seen.current = new Map(steps.map((s) => [s.key, s.state]));
  return (
    <ol className={`tracker${compact ? ' tracker--compact' : ''}`} aria-label={t.ui.progress}>
      {steps.map((s, i) => {
        const next = steps[i + 1];
        return (
        <li key={s.key} className={`tracker-step tracker-step--${s.state} tracker-step--${s.ink}`} aria-current={i === activeIdx ? 'step' : undefined}>
          <div className="tracker-rail" aria-hidden="true">
            {i > 0 && <span className={`tracker-seg tracker-seg--before tracker-seg--${segState(s)} tracker-seg--${s.ink}`} />}
            <Node step={s} stamp={stamped.current.has(s.key)} />
            {next && <span className={`tracker-seg tracker-seg--after tracker-seg--${segState(next)} tracker-seg--${next.ink}`} />}
          </div>
          <div className="tracker-body">
            <div className="tracker-label">{s.label}</div>
            {!compact && s.sub && (
              <div className="tracker-sub">
                <StepNote text={s.sub} stepRef={s.ref} />
              </div>
            )}
            {s.ticks && s.ticks.total > 1 && !compact && (
              <div className="tracker-ticks">
                <Ticks done={s.ticks.done} total={s.ticks.total} ink={s.ink === 'neutral' ? 'mo' : s.ink} />
              </div>
            )}
            <div className={`tracker-time num${s.stuck && s.state !== 'done' ? ' tracker-time--stuck' : ''}`}>
              {s.state === 'done' && s.at
                ? times[i]
                : s.stuck && (s.state === 'active' || s.state === 'todo')
                  ? t.ui.stuck
                  : (s.state === 'active' || s.state === 'todo') && s.eta !== undefined
                    ? fmtEta(s.eta)
                    : ''}
            </div>
          </div>
        </li>
        );
      })}
    </ol>
  );
}

/**
 * When the steps done happened: the clock, with the date where a step's day is not that of the step before it giving one, or today's
 * for the first (an operation four days old read "12:18:07" as if it were today's)
 */
export function stepTimes(steps: StepView[], now: number): (string | undefined)[] {
  let day = new Date(now).toDateString();
  return steps.map((s) => {
    if (s.state !== 'done' || !s.at) return undefined;
    const d = new Date(s.at).toDateString();
    if (d === day) return fmtClock(s.at);
    day = d;
    return fmtDateTime(s.at);
  });
}

/**
 * The steps whose mark comes down as the reader watches (`seal-stamp`), kept in `stamped`: those done since the tracker was first
 * drawn, `seen` holding the states it drew last (null before it was drawn). A step done before, as on the page of an operation final
 * hours ago, has its mark drawn still: its ink square and its seal came down each time such a page was opened, as if it had just
 * become final
 */
export function stamps(seen: ReadonlyMap<string, StepView['state']> | null, steps: readonly StepView[], stamped: Set<string>): Set<string> {
  if (seen) for (const s of steps) if (s.state === 'done' && seen.has(s.key) && seen.get(s.key) !== 'done') stamped.add(s.key);
  return stamped;
}

/**
 * A step's note, the words that name a block, a BTC block, a transaction or an account linked to its page: a height or an ID in the
 * data face and kept on one line ("BTC #326,327"), a note linked whole (a producer's name, a transaction named in words) wrapping as
 * a sentence
 */
function StepNote({ text, stepRef }: { text: string; stepRef: StepView['ref'] }) {
  if (!stepRef) return <>{text}</>;
  const part = stepRef.text !== undefined && text.includes(stepRef.text);
  const words = part && stepRef.text !== undefined ? stepRef.text : text;
  const at = text.indexOf(words);
  return (
    <>
      {text.slice(0, at)}
      <Link to={stepRef.to} className={`tracker-ref${part ? ' mono nobr' : ''}`}>
        {words}
      </Link>
      {text.slice(at + words.length)}
    </>
  );
}

function segState(s: StepView): 'done' | 'active' | 'todo' {
  if (s.state === 'done' || s.state === 'failed') return 'done';
  if (s.state === 'active') return 'active';
  return 'todo';
}

function Node({ step, stamp }: { step: StepView; stamp: boolean }) {
  const done = stamp ? 'tracker-node tracker-node--done tracker-node--stamp' : 'tracker-node tracker-node--done';
  if (step.state === 'failed') {
    return (
      <span className="tracker-node">
        <StatusMark stage={step.failMark ?? 'failed'} size={16} />
      </span>
    );
  }
  if (step.state === 'skipped') return <span className="tracker-node tracker-node--skipped" />;
  if (step.state === 'done' && step.mark) {
    return (
      <span className={done}>
        <StatusMark stage={step.mark} size={18} />
      </span>
    );
  }
  if (step.ink === 'zhu') {
    return (
      <span className={step.state === 'done' ? done : `tracker-node tracker-node--${step.state}`}>
        {step.state === 'done' ? <StatusMark stage="final" size={18} /> : <span className="tracker-shape tracker-shape--seal" />}
      </span>
    );
  }
  const shape = step.ink === 'mo' ? 'square' : 'circle';
  // Current step: solid shape + breathing glow; not started: a small neutral ring (no shape semantics, so it is not confused with the hollow square of "settlement broadcast")
  return (
    <span className={`tracker-node tracker-node--${step.state}`}>
      <span className={`tracker-shape tracker-shape--${shape} tracker-shape--${step.ink}`} />
    </span>
  );
}
