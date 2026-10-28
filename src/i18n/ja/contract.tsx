import type { ReactNode } from 'react';
import type { Messages } from '..';

/** Japanese: contract page */
const contract: Messages['contract'] = {
  /** by: the deployer's account link; at: the block link */
  deployed: (by: ReactNode, at: ReactNode) => (
    <>
      {by} が {at} でデプロイ
    </>
  ),
  seeking: 'デプロイを探しています…',
  rpcNote: 'ノードはコントラクトのメタデータを提供しないため、読み取り呼び出しには ksana-cli か SDK を使えます。',
  playground: 'Playground で開く',
  playgroundHint: 'サンプルのコントラクトは専用の画面で開きます。その他のコントラクトはソースの ABI を貼り付けると呼び出せます',
  /** Node data source: the calls and asset transfers to the contract, from the node's listing (D-111) */
  history: '呼び出しと入金',
  noHistory: '呼び出しも入金もありません',

  idHint: 'sha256(デプロイ者 ‖ nonce ‖ code_hash)',
  code: 'コード',
  codeBytes: (n: string) => `${n} バイト`,
  deployOp: 'デプロイのオペレーション',
  methods: 'メソッド',
  issued: '発行した資産',
  supply: '総量',
  holdings: 'コントラクトの保有',

  read: {
    title: '読み取り呼び出し',
    eyebrow: 'チェーンに載らず、手数料なし',
    method: 'メソッド',
    arg: '引数',
    call: '呼び出し',
    ok: '戻り値',
    error: 'エラー',
  },
  argHint: {
    balance_of: 'account：アドレスまたは 64 桁の 16 進数',
    claimed: 'account：アドレスまたは 64 桁の 16 進数',
    quote: 'amount_in：KSA の数量',
    get_lock: 'lock：ロック番号',
    lock_of_script: 'script：支払いスクリプト（16 進数）',
    balance: 'seller：アドレスまたは 64 桁の 16 進数',
    lock_count: 'seller：アドレスまたは 64 桁の 16 進数',
    locks_of: 'seller：アドレスまたは 64 桁の 16 進数',
  },
  result: {
    notIssued: '資産はまだ発行されていません',
    needAccount: '引数 account には Taproot アドレスまたは 64 桁の 16 進数が必要です',
    needAmount: (decimals: number) => `引数 amount_in には正の KSA 数量（小数点以下 ${decimals} 桁まで）が必要です`,
    needLock: '引数 lock にはロック番号（0 以上の整数）が必要です',
    noLock: 'この番号のロックはありません：コントラクトは呼び出しを失敗させます',
    needScript: '引数 script には 16 進数の支払いスクリプトが必要です',
    needSeller: '引数 seller には Taproot アドレスまたは 64 桁の 16 進数が必要です',
    notSimulated: 'シミュレーターはこのメソッドに応答しません。ノードではコントラクトが応答します',
    quote: (ksaIn: string, tknOut: string) => `${ksaIn}\u00a0KSA → ${tknOut}\u00a0TKN（手数料 0.3% 込み）`,
  },

  recent: '最近の呼び出し',
  noCalls: '呼び出しは見つかりません',
};

export default contract;
