import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Traditional Chinese (Taiwan): contract page */
const contract: Messages['contract'] = {
  deployed: (by: ReactNode, at: ReactNode) => (
    <>
      由 {by} 部署於 {at}
    </>
  ),
  seeking: '正在尋找部署…',
  rpcNote: '節點不提供合約的中繼資料；唯讀呼叫可用 ksana-cli 或 SDK。',
  playground: '在 Playground 中開啟',
  playgroundHint: '範例合約在 Playground 開啟它自己的介面；其他合約貼上原始碼裡的 ABI 就能呼叫',
  /** Node data source: the calls and asset transfers to the contract, from the node's listing (D-111) */
  history: '呼叫與轉入',
  noHistory: '沒有呼叫或轉入',

  idHint: 'sha256(部署者 ‖ nonce ‖ code_hash)',
  code: '程式碼',
  codeBytes: (n: string) => `${n} 位元組`,
  deployOp: '部署操作',
  methods: '方法',
  issued: '發行的資產',
  supply: '總量',
  holdings: '合約持有',

  read: {
    title: '唯讀呼叫',
    eyebrow: '不上鏈，不收費',
    method: '方法',
    arg: '參數',
    call: '呼叫',
    ok: '回傳',
    error: '錯誤',
  },
  argHint: {
    balance_of: 'account：地址或 64 碼十六進位',
    claimed: 'account：地址或 64 碼十六進位',
    quote: 'amount_in：KSA 數量',
    get_lock: 'lock：鎖定編號',
    lock_of_script: 'script：十六進位的付款腳本',
    balance: 'seller：地址或 64 碼十六進位',
    lock_count: 'seller：地址或 64 碼十六進位',
    locks_of: 'seller：地址或 64 碼十六進位',
  },
  result: {
    notIssued: '資產尚未發行',
    needAccount: '參數 account 需要 Taproot 地址或 64 碼十六進位',
    needAmount: (decimals: number) => `參數 amount_in 需要正的 KSA 數量，最多 ${decimals} 位小數`,
    needLock: '參數 lock 需要鎖定編號，即從 0 起的整數',
    noLock: '沒有這個編號的鎖定：合約會讓這次呼叫失敗',
    needScript: '參數 script 需要十六進位的付款腳本',
    needSeller: '參數 seller 需要 Taproot 地址或 64 碼十六進位',
    notSimulated: '模擬器不回答這個方法；在節點上由合約回答',
    quote: (ksaIn: string, tknOut: string) => `${ksaIn}\u00a0KSA → ${tknOut}\u00a0TKN（含 0.3% 手續費）`,
  },

  recent: '最近呼叫',
  noCalls: '沒有找到呼叫',
};

export default contract;
