import type { Messages } from '..';

/** Wallet settings page (pages/wallet/Settings.tsx) */
const settings: Messages['settings'] = {
  title: 'Settings',
  lead: 'These settings are kept in this browser only.',
  appearance: 'Appearance',
  hideHint: 'Balances and amounts show as ••••, for opening the wallet in public.',
  wallet: {
    connected: 'Connected',
    demo: 'Demo account (in-browser simulator)',
    none: 'No wallet connected yet.',
    disconnected: 'Wallet disconnected',
  },
  about: {
    title: 'About',
    build: 'Build',
    unknownBuild: 'Unknown: not built from a git checkout',
    chain: 'Chain',
    repo: 'Source',
    verifyHint: 'To verify this page, rebuild from the same commit and compare the sha256 of the output; the steps are in README.md under “verify this page”.',
  },
};

export default settings;
