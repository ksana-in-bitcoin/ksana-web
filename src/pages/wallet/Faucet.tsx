import { useState } from 'react';
import { useChain } from '../../app/store';
import { toast, watchOp } from '../../app/prefs';
import { claimFromFaucet, currentDeployment, FaucetError } from '../../app/deployment';
import type { Hex } from '../../chain/types';
import { Button } from '../../components/ui';
import { t, useT } from '../../i18n';
import { fmtRoughDuration } from '../../lib/format';

/** The hosted signet's KSA faucet (deployment.json, D-107) when the page is connected to that network; null otherwise */
export function useHostedFaucet(): string | null {
  const sim = useChain();
  const deployment = currentDeployment();
  return sim.kind === 'rpc' && deployment?.faucet && deployment.chain === sim.config.chain ? deployment.faucet : null;
}

/**
 * Why the faucet sent nothing, in the page's language, where its own words are English: an account that already received its KSA,
 * too many requests from one connection or a busy faucet, each with the wait the faucet asks for, a connection that asked too often
 * today, an empty faucet, a faucet that does not work or does not answer. Anything else is its own words
 */
export function explainFaucetError(e: unknown): string {
  const m = t().receive.faucetWhy;
  if (!(e instanceof FaucetError)) return e instanceof Error ? e.message : String(e);
  if (e.status === undefined) return m.noAnswer;
  // The faucet's words tell its refusals apart (core/signet/services/faucet.mjs). A connection's claims of the day come back one every
  // 288 minutes, where the faucet asks for an hour, so that wait is not given
  if (e.status === 429 && /too often today/i.test(e.message)) return m.today;
  if (e.status === 503 && /empty/i.test(e.message)) return m.empty;
  if ((e.status === 429 || e.status === 503) && e.retryAfter !== undefined) {
    // Whole on its line: "22 h" over "35 min" read as two waits
    const wait = fmtRoughDuration(e.retryAfter * 1000).replace(/ /g, '\u00a0');
    // An account's wait, the whole faucet's (busy, or its transfers waiting for a block), a connection's
    if (/already received/i.test(e.message)) return m.claimed(wait);
    if (e.status === 503 || /busy/i.test(e.message)) return m.busy(wait);
    return m.tooOften(wait);
  }
  return e.status >= 500 ? m.down : e.message;
}

/** Asks the hosted faucet for test KSA; once it has answered, the button says so instead of inviting a second request */
export function FaucetButton({ url, me, label, variant = 'secondary', size = 'md' }: { url: string; me: Hex; label: string; variant?: 'primary' | 'secondary'; size?: 'sm' | 'md' }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'claiming' | 'claimed'>('idle');
  return (
    <Button
      variant={variant}
      size={size}
      className="btn--wrap"
      disabled={state !== 'idle'}
      aria-busy={state === 'claiming'}
      onClick={() => {
        setState('claiming');
        claimFromFaucet(url, me)
          .then((opId) => {
            watchOp(opId);
            setState('claimed');
            toast({ tone: 'neutral', title: t.wallet.faucet.requested });
          })
          .catch((e: unknown) => {
            setState('idle');
            toast({ tone: 'warn', title: t.receive.faucetFailed, body: explainFaucetError(e) });
          });
      }}
    >
      {state === 'claimed' ? t.wallet.faucet.claimed : label}
    </Button>
  );
}
