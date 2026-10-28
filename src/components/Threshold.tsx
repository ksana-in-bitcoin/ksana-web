import { useState } from 'react';
import { useChain } from '../app/store';
import { updateWallet, useWalletPrefs } from '../app/prefs';
import { KSA_ASSET_ID } from '../chain/params';
import { amountNotation, commaQuestion, fieldAmount, parseAmount } from '../lib/format';
import { useT } from '../i18n';
import { Button } from './ui';

/**
 * Edit form for the large-amount threshold (WalletPrefs.largeThreshold): the receive page edits it in place next to the confirmation rules, and the wallet settings page uses it too.
 * The threshold is stored in KSA base units; here it is displayed and parsed according to the asset's decimals.
 */
export function ThresholdForm({ autoFocus, onSaved, onCancel }: { autoFocus?: boolean; onSaved?: () => void; onCancel?: () => void }) {
  const prefs = useWalletPrefs();
  const sim = useChain();
  const t = useT();
  const s = t.wallet.settings;
  const decimals = sim.assets.get(KSA_ASSET_ID)?.decimals ?? 0;
  // Without grouping commas: "10,000" in the field could as well be ten, and the field would ask which
  const [draft, setDraft] = useState(fieldAmount(BigInt(prefs.largeThreshold), decimals));
  const [saved, setSaved] = useState(false);
  const parsed = parseAmount(draft, decimals);
  const which = decimals > 0 ? commaQuestion(draft) : undefined;
  return (
    <form
      className="threshold"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed === null) return;
        updateWallet({ largeThreshold: parsed.toString() });
        // Written as the page writes it, as the field is when left: Enter saves it without leaving
        setDraft(fieldAmount(parsed, decimals));
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
        onSaved?.();
      }}
    >
      <label htmlFor="large-threshold" className="field-label">
        {s.threshold}
      </label>
      <div className="row gap-8">
        <div className="input-affix">
          <input
            id="large-threshold"
            className="input mono"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setDraft((text) => amountNotation(text, decimals > 0))}
            aria-invalid={parsed === null}
            aria-describedby="large-threshold-msg"
            autoFocus={autoFocus}
          />
          <span className="input-suffix">KSA</span>
        </div>
        <Button type="submit" size="md" disabled={parsed === null}>
          {saved ? s.saved : s.save}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        )}
      </div>
      <p id="large-threshold-msg" className={which ? 'field-error' : 'field-hint'}>
        {which ?? s.hint}
      </p>
    </form>
  );
}
