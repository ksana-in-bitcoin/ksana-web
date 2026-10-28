import type { Messages } from '..';
import { latinGap } from '../spacing';

/** A sentence-initial parameter is followed directly by kana: a space is kept only after a Latin-script ending */
const head = (s: string) => latinGap(s).trimStart();

/** Japanese: receive page */
const receive: Messages['receive'] = {
  title: '受け取り',
  one: 'この 1 つのアドレスで KSA、コントラクト資産、BTC をすべて受け取れます。',
  card: '受け取り情報',
  qr: 'アドレスの QR コード',
  address: (net: string) => `アドレス · Taproot · ${net}`,
  hex: 'アカウント（16 進数）· コントラクトの引数用',
  checkEdges: '先頭と末尾の 8 桁を確認：',
  copyAddress: 'アドレスをコピー',
  copyHex: '16 進数のアカウントをコピー',
  btcUse: '受け取った BTC はパス C のマイナー手数料にも使えます。',

  rules: {
    title: 'どちらの確認で着金とみなすか',
    below: (amount: string) => `${amount}\u00a0KSA 未満：高速確認で十分`,
    above: 'しきい値以上：BTC 確定まで待つ',
    /** eta is a formatted estimate (~2 min) */
    aboveEta: (net: string, eta: string) => `${net} では${eta}、メインネットでは約 110 分`,
    edit: 'しきい値を変更',
  },
  faucet: 'devnet のフォーセットから受け取る',
  faucetHosted: (net: string) => `${net} のフォーセットからテスト用 KSA を受け取る`,
  faucetFailed: 'フォーセットから KSA が送られませんでした',
  faucetWhy: {
    claimed: (wait: string) => `このアカウントはテスト用 KSA を受け取り済みです。${wait}後にもう一度申請できます`,
    tooOften: (wait: string) => `この接続からのリクエストが多すぎます。${wait}後にもう一度お試しください`,
    busy: (wait: string) => `フォーセットが混み合っています。${wait}後にもう一度お試しください`,
    today: 'この接続からの今日の申請が多すぎます。しばらくしてからもう一度お試しください',
    empty: 'フォーセットのテスト用 KSA がなくなりました。しばらくしてからもう一度お試しください',
    down: 'フォーセットは現在利用できません。しばらくしてからもう一度お試しください',
    noAnswer: 'フォーセットから応答がありません。接続を確認して、もう一度お試しください',
  },
  back: 'ウォレットに戻る',

  recent: {
    title: '最近の受け取り',
    empty: 'まだ送金を受け取っていません',
    emptyFaucet: 'アドレスを相手に送るか、フォーセットから受け取ってください。',
    emptyShare: 'アドレスを相手に送ってください。',
    from: (who: string) => `${head(who)}から`,
    big: '高額 · BTC 確定待ち',
    final: '着金とみなせます',
    belowThreshold: '設定したしきい値により着金とみなせます',
  },
};

export default receive;
