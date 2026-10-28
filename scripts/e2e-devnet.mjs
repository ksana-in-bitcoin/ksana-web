// Chromium end-to-end check: walks through every page of the web wallet and the explorer against the local devnet (core/crates/ksana-node/tests/web_devnet.rs) and the Vite proxy.
// Not part of npm test; build core/sdk/ts first (playwright-core is installed with the devDependencies of core/sdk/ts) and install Chromium:
//   (cd core/sdk/ts && npm ci && npm run build && npx playwright-core install --only-shell chromium)
//   (cd core && cargo build -p ksana-indexer && cargo test -p ksana-node --test web_devnet -- --ignored --nocapture)   # prints alice's private key and the mock bitcoind URL
//   KSANA_RPC=http://127.0.0.1:18545 KSANA_INDEXER=http://127.0.0.1:18548 KSANA_BTC=<mock bitcoind> npm run dev
//   ALICE_KEY=<private key> KSANA_BTC=<mock bitcoind> [EXCHANGE=<exchange contract> LOCK=<lock id>] [TOKEN_WASM=<token.wasm>] node scripts/e2e-devnet.mjs [overview connect wallet sendB sendC sendToken topup explorer]
// Without stage names every stage runs; the top-up stage needs EXCHANGE and LOCK (see docs/WEB_DESIGN.md §5.5), the token stage TOKEN_WASM, the reference KS-20 token's module, which it deploys as alice
// (cargo rustc --release --locked --manifest-path core/contracts/Cargo.toml --target wasm32-unknown-unknown --package token --crate-type cdylib, then core/contracts/target/wasm32-unknown-unknown/release/token.wasm).
// Screenshots are written to $SHOTS (default: ksana-web-e2e under the system temp directory).
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '../core/sdk/ts/node_modules/playwright-core/index.mjs';
import * as sdk from '../core/sdk/ts/dist/src/index.js';

const BASE = process.env.KSANA_WEB ?? 'http://localhost:5173';
const RPC = process.env.KSANA_RPC ?? 'http://127.0.0.1:18545';
const BTC = process.env.KSANA_BTC;
const KEY = process.env.ALICE_KEY;
const EXCHANGE = process.env.EXCHANGE ?? '';
const LOCK = BigInt(process.env.LOCK ?? '0');
const TOKEN_WASM = process.env.TOKEN_WASM ?? '';
const SHOTS = process.env.SHOTS ?? join(tmpdir(), 'ksana-web-e2e');
const stages = new Set(process.argv.slice(2));
const want = (s) => stages.size === 0 || stages.has(s);
if (!KEY) throw new Error('ALICE_KEY is required (the alice private key printed by web_devnet)');
if (!BTC) throw new Error('KSANA_BTC is required (the mock bitcoind URL printed by web_devnet)');
mkdirSync(SHOTS, { recursive: true });

const rpc = new sdk.KsanaRpcClient(RPC);
const enc = new TextEncoder();
const alice = sdk.accountOf(sdk.fromHex(KEY, 32));
const aliceHex = sdk.toHex(alice);
const aliceAddr = sdk.accountToAddress(alice, 'regtest');
const bob = sdk.accountOf(sdk.sha256(enc.encode('ksana/node-test/bob')));
const bobAddr = sdk.accountToAddress(bob, 'regtest');
const btc = async (method, params = []) => {
  const r = await fetch(BTC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ headless: true });
// the page runs in English (?lang=en): the locators below match the English messages (src/i18n/en)
const ctx = await browser.newContext({ viewport: { width: 1280, height: 960 }, locale: 'en-US' });
const page = await ctx.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${String(e).slice(0, 300)}`));
page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
let shotNo = 0;
const shot = async (name) => { shotNo++; await page.screenshot({ path: `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name}.png`, fullPage: true }); };
const alerts = async (label) => {
  const texts = await page.locator('[role=alert]').allInnerTexts();
  if (texts.length) log(`  alerts on ${label}:`, texts.map((x) => x.replace(/\s+/g, ' ').slice(0, 160)));
};
const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await sleep(400); };
const waitOp = async (id, timeoutMs = 90_000) => {
  const t0 = Date.now();
  for (;;) {
    // a path C op is unknown to the node (unknown operation) until its carrying transaction is confirmed on BTC; keep waiting
    const st = await rpc.getOpStatus(sdk.fromHex(id, 32)).catch((e) => ({ status: `unknown (${String(e.message ?? e).slice(0, 40)})` }));
    if (st.status !== 'pending' && st.status !== 'skipped' && !st.status.startsWith('unknown')) return st;
    if (Date.now() - t0 > timeoutMs) throw new Error(`op ${id} still ${st.status}`);
    await sleep(1000);
  }
};
const clickCta = async () => {
  const cta = page.locator('button.summary-cta');
  await cta.scrollIntoViewIfNeeded();
  await cta.click({ timeout: 10_000 }).catch(async (e) => { log('summary-cta click failed, forcing:', String(e).slice(0, 120)); await cta.click({ force: true }); });
  await page.waitForSelector('button:has-text("Sign and submit")', { timeout: 10_000 });
};
const opLinkId = async () => {
  const href = await page.locator('a[href^="#/op/"]').first().getAttribute('href');
  return href?.slice('#/op/'.length) ?? null;
};
const txLinkId = async () => {
  const href = await page.locator('a[href^="#/tx/"]').first().getAttribute('href');
  return href?.slice('#/tx/'.length) ?? null;
};
// The send page's result links its own operation and transaction in its head: a toast or the wallet's activity may link others first
const sentLinkId = async (kind) => {
  const href = await page.locator(`.page-meta a[href^="#/${kind}/"]`).first().getAttribute('href');
  return href?.slice(`#/${kind}/`.length) ?? null;
};
const balance = async () => { const a = await rpc.getAccount(alice); return BigInt(a.balances?.find?.((b) => b.asset === 1 || b.asset === '1')?.amount ?? a.ksa ?? 0); };
const accountInfo = async () => rpc.getAccount(alice);

try {
  // ---- Open: node data source + test-key wallet ----
  await page.goto(`${BASE}/?rpc=/rpc&indexer=/indexer&btc=/btc&chain=devnet&lang=en&wallet=mock&key=${KEY}`);
  await page.locator('text=Latest blocks').first().waitFor({ timeout: 30_000 });
  await sleep(2500);
  if (page.url().includes('key=')) problems.push('private key still in URL after load: ' + page.url().replace(/key=[0-9a-f]+/, 'key=…'));
  log('overview url', page.url());
  await alerts('overview');
  if (want('overview')) await shot('overview');

  // ---- Connect the wallet ----
  if (want('connect') || want('wallet') || want('sendB') || want('sendC') || want('sendToken') || want('topup')) {
    await go('#/wallet');
    await page.waitForSelector('button.connect-card', { timeout: 15_000 });
    await page.locator('button.connect-card', { hasText: 'Test-key wallet' }).click();
    await page.waitForSelector('.wallet-chip', { timeout: 15_000 });
    await sleep(1500);
    const html = await page.content();
    log('wallet shows address:', html.includes(aliceAddr) || html.includes(aliceAddr.slice(0, 16)), 'shows hex:', html.includes(aliceHex));
    await alerts('wallet');
    await shot('wallet');
  }

  // ---- Other wallet pages: the settings page, editing the threshold in place on the receive page ----
  if (want('wallet')) {
    await go('#/wallet/settings');
    await sleep(800);
    const title = (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ');
    log('settings →', title.slice(0, 40), '| source panel:', await page.locator('.source-panel').count(), '| build:', await page.locator('.footer a .mono').count());
    await alerts('settings');
    await shot('settings');
    await go('#/wallet/receive');
    await sleep(800);
    await page.locator('button', { hasText: 'Change threshold' }).click();
    await page.waitForSelector('#large-threshold', { timeout: 5_000 });
    await page.fill('#large-threshold', '5000');
    await page.locator('.threshold button[type=submit]').click();
    await sleep(400);
    const rule = (await page.locator('.rule-title').first().innerText()).replace(/\s+/g, ' ');
    log('receive threshold →', rule.slice(0, 40), '| editor closed:', (await page.locator('#large-threshold').count()) === 0);
    await alerts('receive');
    await shot('receive');
  }

  // ---- Path B transfer ----
  if (want('sendB')) {
    const before = await accountInfo();
    await go('#/wallet/send');
    await page.waitForSelector('#send-to', { timeout: 15_000 });
    await page.fill('#send-to', bobAddr);
    await page.fill('#send-amount', '0.01');
    await sleep(800);
    await shot('sendB-form');
    await clickCta();
    await page.waitForSelector('button:has-text("Sign and submit")', { timeout: 10_000 });
    await shot('sendB-review');
    await page.locator('button', { hasText: 'Sign and submit' }).click();
    await page.waitForSelector('.page-meta a[href^="#/op/"]', { timeout: 30_000 });
    const id = await sentLinkId('op');
    log('path B op', id);
    const st = await waitOp(id);
    log('path B status', st.status, 'receipt ok', st.receipt?.success, 'block', st.block_hash ?? st.block);
    await sleep(4000);
    await shot('sendB-sent');
    const after = await accountInfo();
    log('nonce', before.nonce, '->', after.nonce);
    await alerts('sendB');
  }

  // ---- Path C transfer ----
  if (want('sendC')) {
    const before = await accountInfo();
    await go('#/wallet/send?path=C');
    await page.waitForSelector('#send-to', { timeout: 15_000 });
    await page.fill('#send-to', bobAddr);
    await page.fill('#send-amount', '0.02');
    await page.waitForSelector('text=/from Bitcoin RPC|from the wallet|entered (?:by hand|manually)/', { timeout: 30_000 });
    await sleep(1000);
    await shot('sendC-form');
    const cta = page.locator('button.summary-cta');
    if (await cta.isDisabled()) { await shot('sendC-disabled'); throw new Error('path C CTA disabled: ' + (await page.locator('.send-summary').innerText()).slice(0, 400)); }
    await clickCta();
    await shot('sendC-review');
    await page.locator('button', { hasText: 'Sign and submit' }).click();
    await page.waitForSelector('.page-meta a[href^="#/op/"]', { timeout: 60_000 });
    const id = await sentLinkId('op');
    const tx = await sentLinkId('tx');
    log('path C op', id, 'tx', tx);
    await shot('sendC-sent');
    if (tx) { try { const raw = await btc('getrawtransaction', [tx]); log('  tx known to bitcoind:', typeof raw === 'string' ? raw.length / 2 + ' bytes' : 'yes'); } catch (e) { log('  getrawtransaction:', e.message.slice(0, 200)); } }
    const st = await waitOp(id, 150_000);
    log('path C status', st.status, 'receipt ok', st.receipt?.success);
    await sleep(3000);
    await shot('sendC-done');
    const after = await accountInfo();
    log('nonce', before.nonce, '->', after.nonce);
    await alerts('sendC');
  }

  // ---- A KS-20 token (D-123): the reference token deployed as alice, then sent to bob from the send page, which has the node try the transfer first ----
  if (want('sendToken') && !TOKEN_WASM) log('skipping the token stage: no TOKEN_WASM');
  if (want('sendToken') && TOKEN_WASM) {
    const params = await rpc.getParams();
    const code = new Uint8Array(readFileSync(TOKEN_WASM));
    const u32le = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
    const u64le = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; };
    const u128le = (n) => sdk.concatBytes(u64le(n & ((1n << 64n) - 1n)), u64le(n >> 64n));
    const str = (s) => { const b = enc.encode(s); return sdk.concatBytes(u32le(b.length), b); };
    // init(name, symbol, decimals, supply): the deployer gets the supply; a symbol of its own on every run, so that the page's token is this run's
    const symbol = `E2E${String(Date.now()).slice(-5)}`;
    const initArgs = sdk.concatBytes(str(`E2E token ${symbol}`), str(symbol), new Uint8Array([6]), u128le(1_000_000_000_000n));
    const secret = sdk.fromHex(KEY, 32);
    const { nonce } = await rpc.getAccount(alice);
    const maxGas = 5_000_000n;
    const unsigned = { version: sdk.VMOP_VERSION, chain_id: params.chain_id, account: alice, nonce, max_gas: maxGas, action: { kind: 'Deploy', code, init_args: initArgs, funds: [] } };
    // The node's fee rate applied to the op's cost (the larger of its bytes and its max_gas in bytes, D-095), as core/sdk/ts/examples/token-swap pays it
    const estimate = await rpc.estimateFee();
    const bytes = BigInt(sdk.encodeVmOp(sdk.signedVmop({ ...unsigned, fee: { kind: 'Token', amount: 1n } }, secret)).length);
    const byGas = (maxGas * BigInt(params.max_block_data_bytes)) / params.block_gas_limit;
    const byRate = ((bytes > byGas ? bytes : byGas) * estimate.path_b.per_kib + 1023n) / 1024n;
    const fee = estimate.path_b.amount > byRate ? estimate.path_b.amount : byRate > 0n ? byRate : 1n;
    const deploy = sdk.signedVmop({ ...unsigned, fee: { kind: 'Token', amount: fee } }, secret);
    await rpc.submitOp(deploy);
    const deployed = await waitOp(sdk.toHex(sdk.opId(deploy)));
    if (!deployed.receipt?.success) throw new Error(`the token's deployment failed: ${deployed.receipt?.error}`);
    const token = sdk.toHex(sdk.sha256(sdk.concatBytes(alice, u64le(nonce), sdk.sha256(code))));
    log('token', symbol, token);
    // The wallet lists it once the node's index has it; the send page offers it with its balance
    await go('#/wallet');
    await page.waitForSelector(`text=${symbol}`, { timeout: 60_000 });
    await shot('sendToken-wallet');
    await go('#/wallet/send');
    await page.waitForSelector('#send-to', { timeout: 15_000 });
    const label = (await page.locator('#send-asset option').allInnerTexts()).find((o) => o.startsWith(symbol));
    if (!label) throw new Error('the send page does not offer the token: ' + (await page.locator('#send-asset').innerText()));
    await page.selectOption('#send-asset', { label });
    await page.fill('#send-to', bobAddr);
    await page.fill('#send-amount', '12.5');
    await page.locator('#send-amount').blur();
    // Ready once the node has tried the transfer; max_gas follows what it used
    await page.waitForSelector('button.summary-cta:not([disabled])', { timeout: 30_000 });
    const gas = await page.inputValue('#send-gas');
    log('token transfer max_gas', gas, '| hint:', (await page.locator('#send-gas-msg').textContent()).slice(0, 160));
    // 200,000 is the max_gas of a transfer the node could not try
    if (!(Number(gas) >= 50_000) || gas === '200000') throw new Error(`the token transfer's max_gas is ${gas}, not one from the node's try`);
    await shot('sendToken-form');
    await clickCta();
    if (!(await page.locator('.review-asset').innerText()).replace(/\s+/g, '').includes(token)) throw new Error('the review does not give the token ID');
    await shot('sendToken-review');
    await page.locator('button', { hasText: 'Sign and submit' }).click();
    await page.waitForSelector('.page-meta a[href^="#/op/"]', { timeout: 30_000 });
    const id = await sentLinkId('op');
    const st = await waitOp(id);
    log('token op', id, st.status, 'receipt ok', st.receipt?.success, st.receipt?.error ?? '');
    const bobHolds = await sdk.ks20BalanceOf(rpc, sdk.fromHex(token, 32), bob);
    if (bobHolds !== 12_500_000n) throw new Error(`bob holds ${bobHolds} base units of the token, not 12500000`);
    await sleep(3000);
    await shot('sendToken-sent');
    // The operation's page reads it as the token's transfer, and the token has a page of its own
    await go(`#/op/${id}`); await sleep(2500); await alerts('token op'); await shot('sendToken-op');
    await go(`#/asset/${token}`); await sleep(2500); await alerts('token page'); await shot('sendToken-asset');
    await alerts('sendToken');
  }

  // ---- Recent recipients (stored only in this browser): after the transfers above the send page should list bob ----
  if (want('sendB') || want('sendC')) {
    await go('#/wallet/send');
    await sleep(800);
    log('recent recipients:', await page.locator('.recent-chip').count());
  }

  // ---- Top-up ----
  if (want('topup') && !EXCHANGE) log('skipping the top-up stage: no EXCHANGE');
  if (want('topup') && EXCHANGE) {
    const lockBefore = await sdk.getLock(rpc, sdk.fromHex(EXCHANGE, 32), LOCK);
    const before = await accountInfo();
    // opened from the points page's link (D-126): both fields filled in and the lock read without a click
    await go(`#/wallet/topup?exchange=${EXCHANGE}&lock=${LOCK}`);
    await page.waitForSelector('text=You receive', { timeout: 30_000 });
    if ((await page.inputValue('#topup-exchange')) !== EXCHANGE.toLowerCase() || (await page.inputValue('#topup-lock')) !== LOCK.toString()) {
      throw new Error('the top-up link did not fill in the exchange and the lock');
    }
    await shot('topup-link');
    await go('#/wallet/topup');
    await page.waitForSelector('#topup-exchange', { timeout: 15_000 });
    await page.fill('#topup-exchange', EXCHANGE);
    await page.fill('#topup-lock', LOCK.toString());
    await page.locator('button', { hasText: /^Load$/ }).click();
    await page.waitForSelector('text=You receive', { timeout: 30_000 });
    await page.fill('#topup-sats', '1000');
    await page.waitForSelector('text=/from Bitcoin RPC|from the wallet|entered (?:by hand|manually)/', { timeout: 30_000 });
    await sleep(1000);
    await shot('topup-form');
    const pay = page.locator('button', { hasText: 'Sign and broadcast' });
    if (await pay.isDisabled()) { throw new Error('top-up submit disabled: ' + (await page.locator('main').innerText()).slice(0, 600)); }
    await pay.click();
    await page.waitForSelector('button:has-text("Top up again")', { timeout: 60_000 });
    const id = await opLinkId();
    const tx = await txLinkId();
    log('top-up op', id, 'tx', tx);
    await shot('topup-sent');
    const st = await waitOp(id, 150_000);
    log('top-up status', st.status, 'receipt ok', st.receipt?.success, st.receipt?.error ?? '');
    await sleep(3000);
    await shot('topup-done');
    const lockAfter = await sdk.getLock(rpc, sdk.fromHex(EXCHANGE, 32), LOCK);
    const after = await accountInfo();
    log('lock ksa', lockBefore.ksa, '->', lockAfter.ksa, 'state', lockAfter.state.kind);
    log('alice', JSON.stringify(before, (_, v) => (typeof v === 'bigint' ? v.toString() : v)), '->', JSON.stringify(after, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
    await alerts('topup');
  }

  // ---- Explorer pages ----
  if (want('explorer')) {
    const info = await rpc.getChainInfo();
    const tip = await rpc.getBlock('latest');
    const tipHash = typeof tip.hash === 'string' ? tip.hash : sdk.toHex(tip.hash);
    const pages = [['blocks', '#/blocks'], ['ops', '#/ops'], ['settlements', '#/settlements'], ['verify', '#/verify'], ['params', '#/params'], ['block-tip', `#/block/${tipHash}`], ['account-hex', `#/account/${aliceHex}`], ['account-addr', `#/account/${aliceAddr}`], ['search-addr', `#/search?q=${bobAddr}`], ['contract', `#/contract/${EXCHANGE || '00'.repeat(32)}`], ['notfound', '#/nothing/here']];
    for (const [name, hash] of pages) {
      await go(hash);
      await sleep(2500);
      await alerts(name);
      await shot(name);
      const title = (await page.locator('h1').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      log(name, '→', title.slice(0, 60));
    }
    // details of the first reveal transaction and the first operation
    await go('#/settlements'); await sleep(2000);
    const tx = await txLinkId(); if (tx) { await go(`#/tx/${tx}`); await sleep(2500); await alerts('tx'); await shot('tx-detail'); log('tx detail', tx); }
    await go('#/ops'); await sleep(2000);
    const op = await opLinkId(); if (op) { await go(`#/op/${op}`); await sleep(2500); await alerts('op'); await shot('op-detail'); log('op detail', op); }
    log('finalized', info.finalized?.height, 'tip', info.tip?.height);
  }
} catch (e) {
  log('FAILED:', String(e).slice(0, 300));
  await page.screenshot({ path: `${SHOTS}/failure.png`, fullPage: true }).catch(() => {});
  console.log((await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1500));
  process.exitCode = 1;
} finally {
  log('problems:', problems.length);
  for (const p of [...new Set(problems)].slice(0, 40)) console.log('  ', p);
  await browser.close();
}
