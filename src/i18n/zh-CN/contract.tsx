import type { ReactNode } from 'react';

/** Contract page */
export default {
  /** by: the deployer's account link; at: the block link */
  deployed: (by: ReactNode, at: ReactNode) => (
    <>
      由 {by} 部署于 {at}
    </>
  ),
  /** Node data source: the deployment is being looked for in the node's listing (D-111), in its place under the title */
  seeking: '正在查找部署…',
  /** Node data source: the node doesn't serve contract metadata */
  rpcNote: '节点不提供合约的元数据；只读调用可用 ksana-cli 或 SDK。',
  /** Node data source on the signet: the contract opened in the contract playground (D-119), in a new tab */
  playground: '在 Playground 中打开',
  playgroundHint: '示例合约在 Playground 打开它自己的界面；其他合约贴上源码里的 ABI 就能调用',
  /** Node data source: the calls and asset transfers to the contract, from the node's listing (D-111) */
  history: '调用与转入',
  noHistory: '没有调用或转入',

  idHint: 'sha256(部署者 ‖ nonce ‖ code_hash)',
  code: '代码',
  /** n is a formatted byte count */
  codeBytes: (n: string) => `${n} 字节`,
  deployOp: '部署操作',
  methods: '方法',
  issued: '发行的资产',
  supply: '总量',
  holdings: '合约持有',

  read: {
    title: '只读调用',
    eyebrow: '不上链，不收费',
    method: '方法',
    arg: '参数',
    call: '调用',
    ok: '返回',
    error: '错误',
  },
  /** Placeholders of the argument input, keyed by method name */
  argHint: {
    balance_of: 'account：地址或 64 位十六进制',
    claimed: 'account：地址或 64 位十六进制',
    quote: 'amount_in：KSA 数量',
    get_lock: 'lock：锁定编号',
    lock_of_script: 'script：十六进制的付款脚本',
    balance: 'seller：地址或 64 位十六进制',
    lock_count: 'seller：地址或 64 位十六进制',
    locks_of: 'seller：地址或 64 位十六进制',
  },
  /** Read-only call results and errors */
  result: {
    notIssued: '资产尚未发行',
    needAccount: '参数 account 需要 Taproot 地址或 64 位十六进制',
    /** The KSA amount a quote takes: `decimals` is the KSA's */
    needAmount: (decimals: number) => `参数 amount_in 需要正的 KSA 数量，最多 ${decimals} 位小数`,
    needLock: '参数 lock 需要锁定编号，即从 0 起的整数',
    noLock: '没有这个编号的锁定：合约会让这次调用失败',
    needScript: '参数 script 需要十六进制的付款脚本',
    needSeller: '参数 seller 需要 Taproot 地址或 64 位十六进制',
    /** A read-only method of a demo contract the simulator does not model */
    notSimulated: '模拟器不回答这个方法；在节点上由合约回答',
    /** Formatted KSA input and TKN output */
    quote: (ksaIn: string, tknOut: string) => `${ksaIn}\u00a0KSA → ${tknOut}\u00a0TKN（含 0.3% 手续费）`,
  },

  recent: '最近调用',
  noCalls: '没有找到调用',
};
