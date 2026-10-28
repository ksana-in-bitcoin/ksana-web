import { useChain } from '../../app/store';
import { BUILD_COMMIT, REPO_URL, commitUrl } from '../../app/build';
import { PARAMS } from '../../chain/params';
import { setTheme, toast, updateWallet, useTheme, useWalletPrefs, type ThemePref } from '../../app/prefs';
import { navigate } from '../../app/router';
import { SourcePanel } from '../../app/SourcePanel';
import { useMe } from '../../wallet/model';
import { disconnectWallet, useConnectedWallet } from '../../wallet/connect';
import { LanguageSelect } from '../../components/LanguageSelect';
import { ThresholdForm } from '../../components/Threshold';
import { AccountSeal, CopyButton } from '../../components/Refs';
import { Button, ButtonLink, PageHead, Section, SpecList, Tabs } from '../../components/ui';
import { useT } from '../../i18n';

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];

/**
 * Wallet settings page: theme, language, receiving confirmations, data source and wallet connection gathered on one page (UI/UX
 * review §2.2 item 8).
 * These used to be scattered across the top bar, the footer, the home page and the regtest console; the entries in the top bar and
 * the footer stay, this is the one place to change them all. All settings are stored only in this browser.
 */
export function Settings() {
  const sim = useChain();
  const theme = useTheme();
  const prefs = useWalletPrefs();
  const wallet = useConnectedWallet();
  const me = useMe();
  const t = useT();
  const s = t.settings;
  const address = me ? sim.addressOf(me) || wallet?.account.address || '' : '';

  return (
    <div className="page narrow-page">
      <PageHead eyebrow={t.wallet.title} title={s.title} meta={s.lead} />

      <Section title={s.appearance}>
        <div className="settings-row">
          <span className="field-label">{t.shell.theme}</span>
          <Tabs label={t.shell.theme} value={theme} onChange={(v) => setTheme(v)} options={THEMES.map((p) => ({ value: p, label: t.shell.themes[p] }))} />
        </div>
        <div className="settings-row">
          <span className="field-label">{t.common.language}</span>
          <LanguageSelect />
        </div>
      </Section>

      <Section title={t.wallet.settings.title}>
        <ThresholdForm />
        <div className="stack gap-6">
          <label className="check">
            <input type="checkbox" checked={prefs.hideBalances} onChange={(e) => updateWallet({ hideBalances: e.target.checked })} />
            {t.wallet.home.hideBalances}
          </label>
          <p className="field-hint">{s.hideHint}</p>
        </div>
      </Section>

      <Section title={t.source.title}>
        <SourcePanel heading={false} />
      </Section>

      <Section title={t.wallet.title}>
        {me ? (
          <>
            <SpecList
              rows={[
                { label: s.wallet.connected, value: <span className="small">{sim.kind === 'sim' ? s.wallet.demo : (wallet?.name ?? '')}</span> },
                {
                  label: t.wallet.address,
                  value: (
                    <span className="addr-line mark-words">
                      <AccountSeal id={me} size={18} />
                      <span className="mono small break">{address || me}</span>
                      <CopyButton text={address || me} label={address ? t.wallet.copyAddress : t.wallet.copyAccountHex} />
                    </span>
                  ),
                },
                ...(sim.kind === 'rpc' ? [{ label: t.wallet.info.signing, value: <span className="small">{t.wallet.info.signingValue}</span> }] : []),
              ]}
            />
            <div className="row wrap">
              {/* A bordered button: a ghost one reads as plain text on a phone, which has no hover */}
              <Button
                onClick={() => {
                  if (sim.kind === 'rpc') disconnectWallet(sim);
                  else updateWallet({ connected: false });
                  toast({ tone: 'neutral', title: s.wallet.disconnected });
                  navigate({ name: 'wallet' });
                }}
              >
                {t.wallet.info.disconnect}
              </Button>
            </div>
          </>
        ) : (
          <div className="row wrap gap-8">
            <span className="small soft">{s.wallet.none}</span>
            <ButtonLink to={{ name: 'wallet' }} size="sm">
              {t.wallet.connect.title}
            </ButtonLink>
          </div>
        )}
      </Section>

      <Section title={s.about.title}>
        <SpecList
          rows={[
            {
              label: s.about.build,
              value: BUILD_COMMIT ? (
                <a className="link mono small" href={commitUrl(BUILD_COMMIT)} target="_blank" rel="noreferrer">
                  {BUILD_COMMIT}
                </a>
              ) : (
                <span className="small soft">{s.about.unknownBuild}</span>
              ),
            },
            {
              label: s.about.chain,
              value: <span className="small">{sim.kind === 'sim' ? `Ksana devnet · chain_id ${PARAMS.CHAIN_ID} · BTC regtest` : `Ksana ${sim.config.chain} · chain_id ${sim.sdkParams.chain_id} · BTC ${sim.network}`}</span>,
            },
            {
              label: s.about.repo,
              value: (
                <a className="link small" href={REPO_URL} target="_blank" rel="noreferrer">
                  {REPO_URL.replace(/^https:\/\//, '')}
                </a>
              ),
            },
          ]}
        />
        <p className="field-hint">{s.about.verifyHint}</p>
      </Section>
    </div>
  );
}
