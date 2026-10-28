import type { Messages } from '..';

/** Wallet settings page (pages/wallet/Settings.tsx) */
const settings: Messages['settings'] = {
  title: '設定',
  lead: 'これらの設定はこのブラウザにだけ保存されます。',
  appearance: '外観',
  hideHint: '残高と金額を •••• で表示します。人前でウォレットを開くときに。',
  wallet: {
    connected: '接続中',
    demo: 'デモアカウント（ブラウザ内シミュレーター）',
    none: 'ウォレットはまだ接続されていません。',
    disconnected: 'ウォレットを切断しました',
  },
  about: {
    title: 'このページについて',
    build: 'ビルド',
    unknownBuild: '不明：git チェックアウトからビルドされていません',
    chain: 'チェーン',
    repo: 'ソースコード',
    verifyHint: 'このページを検証するには、同じコミットから再ビルドして成果物の sha256 を比較します。手順は README.md の「Verify this page」（このページの検証）にあります。',
  },
};

export default settings;
