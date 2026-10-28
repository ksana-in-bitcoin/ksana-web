import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Japanese: account page */
const account: Messages['account'] = {
  mine: 'マイアカウント',
  producerFee: (fee: string) => `ブロック生成者 · 最低代払い ${fee}\u00a0KSA`,
  censored: '高速パスのオペレーションが取り込まれない（デモシナリオ）',
  sendTo: 'このアカウントに送金',

  address: 'アドレス',
  copyAddress: 'アドレスをコピー',
  hex: 'アカウント（16 進数）',
  copyHex: '16 進数のアカウントをコピー',
  addrNote: 'アドレスと 16 進数は同じアカウントの 2 つの表記で、コントラクトには 16 進数しかありません。',

  noAssets: '資産はありません',
  balanceCaption: '資産残高',
  available: '利用可能',
  lockedFees: 'ロック中の報酬と手数料',
  lockedFeesHint: '所属ブロックがビットコインに記録されるとロック解除されます',
  unlockedTotal: 'ロック解除済み（累計）',

  nonceHint: '次のオペレーションが使うべき nonce',
  sent: '送信したオペレーション',
  policy: 'ローカルポリシー',
  policyValue: (fee: string) => `パス B の最低代払い ${fee}\u00a0KSA`,

  history: 'オペレーション履歴',
  direction: '方向',
  out: '送信',
  noRecords: '記録はありません',

  locked: {
    title: '報酬と手数料のロックと解除',
    caption: 'ロックされたブロック報酬と手数料',
    fee: '報酬と手数料',
    unlocked: 'ロック解除済み',
    settled: '決済済み、ロック解除エントリ待ち',
    waiting: 'ロック中：ビットコインへの記録待ち',
    carriedFor: (producer: string) => `${latinGap(producer).trimStart()}の代わりに同梱`,
  },
};

export default account;
