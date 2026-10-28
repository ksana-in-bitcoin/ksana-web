import type { Messages } from '..';

/** Japanese: operation list */
const ops: Messages['ops'] = {
  title: 'オペレーション',
  tabs: {
    label: 'オペレーションの表示',
    latest: '最新',
    mempool: 'メンプール',
    pendingLocal: '取り込み待ち（本ページ）',
  },

  filter: {
    label: 'パスで絞り込み',
    all: 'すべてのパス',
    /** Filter option: A Merged */
    path: (path: string, label: string) => `${path} ${label}`,
    failedOnly: '失敗のみ',
    none: '条件に合うオペレーションはありません',
  },

  mempool: {
    localOnly: 'このページから送信し、まだ取り込まれていないオペレーションのみ表示します。',
    minFees: (list: string) => `ブロック生成者ごとの最低代払い手数料：${list}`,
    waited: '待機時間',
    note: '備考',
    emptyLocal: 'このページの取り込み待ちはありません',
    empty: 'メンプールは空です',
    total: (n: number) => `計 ${n} 件`,
    why: {
      nativeConfirmed: 'BTC で承認済み、次のブロックで強制取り込み',
      nativeWaiting: 'BTC の承認待ち',
      nativeConfs: (n: number, need: number) => `BTC 承認 ${n}/${need}、${need} 承認で強制取り込み`,
      backlog: '決済の滞留が上限に達し、高速パスは停止中',
      censored: 'ブロック生成者がこのアカウントを取り込まないため、パス C に切り替え可能',
      lowFee: (producers: string) => `${producers} の最低代払い手数料を下回るため、取り込むのは一部のブロック生成者のみ`,
      nonce: (nonce: string) => `nonce ${nonce} の取り込み待ち`,
      gone: '取り込み待ちではなくなりました',
    },
  },
};

export default ops;
