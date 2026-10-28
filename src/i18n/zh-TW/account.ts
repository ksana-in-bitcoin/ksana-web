import type { Messages } from '..';
import { latinGap } from '../spacing';

/** Traditional Chinese (Taiwan): account page */
const account: Messages['account'] = {
  mine: '我的帳戶',
  producerFee: (fee: string) => `出塊者 · 最低代付 ${fee}\u00a0KSA`,
  censored: '出塊者不收錄其快速路徑操作（示範情境）',
  sendTo: '向此帳戶轉帳',

  address: '地址',
  copyAddress: '複製地址',
  hex: '帳戶（十六進位）',
  copyHex: '複製十六進位帳戶',
  addrNote: '地址與十六進位是同一個帳戶的兩種寫法；合約只有十六進位。',

  noAssets: '沒有資產',
  balanceCaption: '資產餘額',
  available: '可用',
  lockedFees: '待解鎖的獎勵與手續費',
  lockedFeesHint: '所在區塊寫入比特幣後解鎖',
  unlockedTotal: '已解鎖（累計）',

  nonceHint: '下一筆操作要用的 nonce',
  sent: '發出的操作',
  policy: '本機策略',
  policyValue: (fee: string) => `路徑 B 最低代付 ${fee}\u00a0KSA`,

  history: '操作紀錄',
  direction: '方向',
  out: '發出',
  noRecords: '沒有紀錄',

  locked: {
    title: '獎勵與手續費的鎖定與解鎖',
    caption: '鎖定的出塊獎勵與手續費',
    fee: '獎勵與手續費',
    unlocked: '已解鎖',
    settled: '已結算，等待解鎖條目',
    waiting: '鎖定中：等待寫入比特幣',
    carriedFor: (producer: string) => `代${latinGap(producer)}攜帶`,
  },
};

export default account;
