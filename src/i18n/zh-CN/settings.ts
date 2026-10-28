/** Wallet settings page (pages/wallet/Settings.tsx): theme, language, incoming confirmation, data source, wallet connection */
export default {
  title: '设置',
  lead: '这些设置只保存在本浏览器里。',
  appearance: '外观',
  /** Description under the "Hide balances" switch */
  hideHint: '余额与金额显示为 ••••，适合在公开场合打开钱包。',
  wallet: {
    connected: '已连接',
    demo: '演示账户（浏览器内模拟器）',
    none: '还没有连接钱包。',
    disconnected: '已断开钱包',
  },
  /** About: build fingerprint (commit hash), chain and repository */
  about: {
    title: '关于',
    build: '构建',
    unknownBuild: '未知：不是从 git 检出构建的',
    chain: '链',
    repo: '源码',
    verifyHint: '核对本页：用同一提交号重新构建，比较产物的 sha256，步骤见 README.md 的「Verify this page」。',
  },
};
