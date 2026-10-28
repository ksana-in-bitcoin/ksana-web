import type { Messages } from '..';

/** Wallet settings page (pages/wallet/Settings.tsx) */
const settings: Messages['settings'] = {
  title: '設定',
  lead: '這些設定只保存在本瀏覽器裡。',
  appearance: '外觀',
  hideHint: '餘額與金額顯示為 ••••，適合在公開場合打開錢包。',
  wallet: {
    connected: '已連接',
    demo: '示範帳戶（瀏覽器內模擬器）',
    none: '還沒有連接錢包。',
    disconnected: '已斷開錢包',
  },
  about: {
    title: '關於',
    build: '建置',
    unknownBuild: '未知：不是從 git 檢出建置的',
    chain: '鏈',
    repo: '原始碼',
    verifyHint: '核對本頁：用同一提交號重新建置，比較產物的 sha256，步驟見 README.md 的「Verify this page」。',
  },
};

export default settings;
