/**
 * Traditional Chinese (Taiwan) messages. Exactly the same structure as Simplified Chinese (the source language, ../zh-CN), checked entry by entry by the Messages type.
 */
import type { Messages } from '..';
import common from './common';
import format from './format';
import status from './status';
import ui from './ui';
import shell from './shell';
import source from './source';
import overview from './overview';
import blocks from './blocks';
import block from './block';
import ops from './ops';
import op from './op';
import settlements from './settlements';
import tx from './tx';
import btc from './btc';
import verify from './verify';
import params from './params';
import account from './account';
import contract from './contract';
import wallet from './wallet';
import send from './send';
import receive from './receive';
import topup from './topup';
import settings from './settings';
import search from './search';
import sim from './sim';
import rpc from './rpc';
import asset from './asset';

const messages: Messages = {
  common,
  format,
  status,
  ui,
  shell,
  source,
  overview,
  blocks,
  block,
  ops,
  op,
  settlements,
  tx,
  btc,
  verify,
  params,
  account,
  contract,
  wallet,
  send,
  receive,
  topup,
  settings,
  search,
  sim,
  rpc,
  asset,
};

export default messages;
