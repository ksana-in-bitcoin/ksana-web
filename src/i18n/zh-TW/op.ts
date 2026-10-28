import type { Messages } from '..';

/** Traditional Chinese (Taiwan): operation detail */
const op: Messages['op'] = {
  head: {
    mine: '你的操作',
    toMe: '轉給你',
    execFailed: '執行失敗',
    liveStatus: (status: string) => `目前狀態：${status}`,
  },

  banner: {
    failed: (reason: string) => `執行失敗：${reason}`,
    failedCharged: '手續費照扣，nonce 也已用掉，其餘變更已回滾。',
    failedNative: '狀態沒有改變，付給 BTC 礦工的手續費不退。',
    failedNativeUsed: 'nonce 已用掉，付給 BTC 礦工的手續費不退，其餘變更已回滾。',
    skipped: '被跳過：沒有執行，也沒有扣費',
    dropped: '已移出條目池：不會上鏈，也不扣費',
    waitedBody: '出塊者可以不收錄它；改走路徑 C 不需要出塊者。',
    resendNative: '用路徑 C 重新提交',
    large: '大額入帳：建議等到 BTC 最終',
    largeBody: '金額達到你設定的大額門檻。',
  },

  journey: {
    title: '從快軌確認到 BTC 最終',
    fastLatency: '從提交到快軌確認耗時',
  },

  vmop: {
    sigHash: '簽名雜湊',
    size: '編碼長度',
    bytes: (n: string) => `${n} 位元組`,
    cap: (n: string) => `上限 ${n}`,
    /** Before the gas an executed op used, under its max_gas */
    gasUsed: '已用',
    minerFee: (sats: string, rate: string) => `${sats}\u00a0聰（${rate}\u00a0sat/vB）`,
    name: '名稱',
    code: '程式碼',
    wasm: (n: string) => `${n} 位元組 WASM`,
  },

  exec: {
    title: '執行',
    block: '所在區塊',
    entry: (index: number) => `條目 #${index}`,
    accepted: '接受高度',
    fastDepth: '快軌深度',
    confs: (n: number) => `${n.toLocaleString('en-US')} 個確認`,
    events: '事件',
    nativeTx: '原生交易',
    closure: '已結算閉包',
  },

  raw: '原始資料（JSON）',
};

export default op;
