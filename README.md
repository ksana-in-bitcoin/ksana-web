# Ksana web wallet and block explorer

The block explorer and web wallet of [Ksana](https://github.com/ksana-in-bitcoin/ksana), a programmable chain on Bitcoin. It
runs on the public signet at <https://signet.ksana.network/>. The page builds on the Ksana repository, pinned as the git
submodule `core/`: it uses its TypeScript SDK (`core/sdk/ts`), and the decisions (D-xxx) and sections of the
specification (SPEC §…) cited here and in the code are those of `core/docs/DECISIONS.md` and `core/docs/SPEC.md`.

The design philosophy, visual language and interaction details are in [`docs/WEB_DESIGN.md`](docs/WEB_DESIGN.md); dependencies
and items pending confirmation are D-064 to D-071. An account is a Taproot address (D-092): the whole site uses this single
identifier, and wherever an account is entered, either the address or the 64-character hex is accepted.

The UI has two data sources:

- **devnet simulator** (default): an in-browser discrete-event simulator whose rules follow the implementation on the Ksana repository's
  `main`: PoW blocks about every 5 seconds, GHOSTDAG parallel blocks and merging (duplicate or conflicting entries are skipped), regtest
  BTC blocks (about every 30 seconds by default), path B / C, the commit / reveal pair of settlement transactions and settlement
  batching, the settled closure, BTC final, rising empty-block difficulty, cumulative unlock and block share, header republishing, the
  settlement backlog limit, and top-ups through the example exchange contract. Accounts are real Taproot addresses (via `@ksana/sdk`);
  block hashes, op_ids and signatures are illustrative values; reloading the page regenerates a chain.
- **Node RPC**: reads `ksana-node` and optionally `ksana-indexer` through the JSON-RPC client of `@ksana/sdk`; the wallet connects to Unisat
  or Xverse through the SDK's adapters; the BTC side (UTXOs, fee rates, broadcast) goes through a same-origin-proxied bitcoind RPC or the
  wallet's interface, see "Connecting a real node" below. Quantities the node cannot provide are shown as "—" with the reason; they are
  never filled in with simulated data.

UI languages: English, Simplified Chinese, Traditional Chinese, Japanese, Korean and Spanish (D-071). The page opens in English whatever
the browser's language (D-115); `?lang=zh-CN` in the address bar gives another, and so does the language menu in the top bar, the footer
and the settings, whose choice is kept on that device and comes before the English default (after `?lang=`).
The messages live in `src/i18n/<locale>/`; Simplified Chinese is the source language and defines the types. When changing copy, edit
`src/i18n/zh-CN/` first, then sync the other languages (`npm run typecheck` points out which message is missing); the copy guidelines
and term list are in `docs/WEB_DESIGN.md` §8.

## Running

Requires Node.js 20.19 or later (development and CI use 22). The page uses the TypeScript SDK of the core submodule via
`file:core/sdk/ts`, so check the submodule out and build the SDK first:

```bash
git clone --recurse-submodules https://github.com/ksana-in-bitcoin/ksana-web.git
cd ksana-web                 # in a clone made without --recurse-submodules: git submodule update --init
(cd core/sdk/ts && npm ci && npm run build)
npm ci
npm run dev          # local development, http://localhost:5173
npm test             # unit tests: simulator rule invariants, replay of recorded real-node responses, balance split, formatting, completeness of every locale's messages
npm run typecheck
npm run build        # production build, output in dist/, can be hosted statically as is
```

`npm run build:artifact` packs the app into a single HTML file (`dist-artifact/ksana-preview.html`, with fonts and scripts fully inlined
and no external requests), used to publish the online preview.

## Verify this page

The footer and "Settings → About" show the git commit hash the page was built from (`vite.config.ts` injects `__KSANA_COMMIT__` with
`define`: it takes the environment variable `KSANA_COMMIT` first, then CI's `GITHUB_SHA`, then asks the local
`git rev-parse --short=9 HEAD`; when none is available it is empty and the page shows nothing). To verify that a deployed page really
came from that commit of this repository, rebuild at the same commit and compare the output:

```bash
git checkout <commit>
git submodule update --init  # the core commit that <commit> pins
(cd core/sdk/ts && npm ci && npm run build)
npm ci
KSANA_COMMIT=<commit> npm run build
find dist -type f | sort | xargs sha256sum | sha256sum            # compare with the value published by the deployer
KSANA_COMMIT=<commit> npm run build:artifact
sha256sum dist-artifact/ksana-preview.html                         # the online preview is this single file
```

The build writes no timestamp; the output depends only on the sources (this repository's and the SDK of the core commit it
pins), the dependencies locked by `package-lock.json` and the Node version. Two builds at the same commit with the same Node major
version are byte-for-byte identical. If they differ, first compare the Node versions and whether `npm ci` used the same lock file.

## Connecting a real node

The network chip in the top bar opens the "Data source" panel: enter the node's JSON-RPC URL (optionally the indexer URL and the Bitcoin
RPC URL), choose devnet or signet, test the connection, then switch; you can also put
`?rpc=<node URL>&indexer=<indexer URL>&btc=<Bitcoin RPC>&chain=devnet|signet` in the address bar, for that visit. A choice made in
the panel is saved locally, one in a link is not, and a copy published with `deployment.json` asks before it reads from a node a link
names; `?source=sim` opens the simulator for the visit.

The page's network must be the node's (A2-11, D-106): the page reads the node's chain ID (`ksana_getChainInfo`) when testing the
connection, before the first sync and again before the wallet signs anything, and refuses a node on the other network (devnet 1001,
signet 1002), on mainnet (1000; not supported by this page yet) or on no Ksana network. A signet node therefore needs signet chosen in
the panel, or `chain=signet` in the address bar (without `chain` the page assumes devnet); when they differ, the connecting screen says
which network the node is on and offers to switch to it. The Bitcoin RPC must be on that network's BTC network too (regtest for devnet,
signet for signet): before listing the wallet's UTXOs, before broadcasting and before path C or a top-up is signed, the page reads
bitcoind's `getblockchaininfo` and refuses another `chain`, since a `raw()` scan finds the same script on every network and the
transaction would go where the node never looks. On the signet page, when the Bitcoin RPC's URL also serves an Esplora interface
(`<url>/esplora`, as the public signet's `/btc` proxy does), the UTXOs come from its `address/<address>/utxo` once its
`block-height/0` is signet's genesis block, since a scan takes 30 to 50 seconds there (the public signet's proxy refuses it, D-107);
without one the page scans (D-108).

- For the browser to reach the node cross-origin, the node must allow the page's origin with `--rpc-cors` (for example
  `--rpc-cors http://localhost:5173`). `ksana-indexer` has no CORS setting (D-070), and bitcoind's RPC needs credentials and sends no CORS
  headers either, so both can only be reached through a same-origin proxy. During development the easiest way is to let Vite proxy all
  three: the node, the indexer and bitcoind need no configuration changes, and bitcoind's credentials stay on the proxy side:

  ```bash
  KSANA_RPC=http://127.0.0.1:18545 KSANA_INDEXER=http://127.0.0.1:18548 KSANA_BTC=http://ksana:ksana@127.0.0.1:18443 npm run dev
  # open http://localhost:5173/?rpc=/rpc&indexer=/indexer&btc=/btc
  ```

  The ports are the same as in `core/devnet/docker-compose.yml` (node 18545, indexer 18548, bitcoind 18443). For a production deployment,
  reverse-proxy `/rpc`, `/indexer` and `/btc` to the node, the indexer and bitcoind (`/btc` only needs `getblockchaininfo`, which from
  Bitcoin Core 23 gives the time of the tip's block too, `scantxoutset`, `estimatesmartfee` and `sendrawtransaction`; for signet it may also serve Esplora's `block-height/0` and
  `address/<address>/utxo` under `/btc/esplora` and then leave `scantxoutset` out, as the public signet's does, D-107, D-108).
- Without docker and bitcoind, you can start a local devnet with the mock bitcoind from the node tests (two producing nodes, an indexer,
  BTC block production and path B transfer traffic):

  ```bash
  cd core
  cargo build -p ksana-indexer
  cargo test -p ksana-node --test web_devnet -- --ignored --nocapture
  ```

  It prints alice's private key, account and address to stderr; alice's and bob's addresses each hold 10 confirmed UTXOs of 150,000 sats
  (the first 3 are printed as `txid:vout:sats` and can be entered by hand when no Bitcoin RPC is connected). It also prints the mock
  bitcoind's URL (for `KSANA_BTC`) and the op_id of each transfer in the traffic.
- End-to-end check: `scripts/e2e-devnet.mjs` uses Chromium (the playwright-core in `core/sdk/ts`) against this local devnet and the
  `npm run dev` proxy to walk through the overview, connecting the test-key wallet, editing the thresholds in place on the settings and
  receive pages, path B / C transfers (after which the send page lists the recently sent-to accounts), a KS-20 token's transfer (the
  reference token deployed from `TOKEN_WASM`, D-123), top-up and every explorer page; usage is at the top of the script. It is not part
  of `npm test`.
- Wallet: in node mode, connect Unisat or Xverse (the wallet must be switched to the same Bitcoin network as the node; the wallet's
  Taproot address is the account); OneKey, which provides Unisat's interface at `window.unisat`, is offered under its own name.
  A `tb1` address does not tell signet from testnet3 or testnet4, so the page also asks the wallet
  which network it is set to (Unisat `getChain`, Xverse `wallet_getNetwork`) when it connects and before path C or a top-up is signed,
  and refuses another one; Unisat's own UTXO list and broadcast are used only once it names the page's network. For local regtest
  integration, add `wallet=mock&key=<private-key>` to the address bar to use the
  test-key wallet (the SDK's MockUnisatWallet, the same as in `core/sdk/ts/examples/wallet-demo`); the private key stays only in this page's
  memory. On another network the page removes the key from the address bar without using it.
  - Path B (default): the wallet makes a BIP322 signature and the page submits it to the node.
  - Path C (offered when the account has no KSA, was refused, or has waited too long) and top-up (buying KSA with BTC through a lock in
    the example exchange contract): the page builds the BTC transaction, the wallet signs the PSBT inputs, and it is broadcast through the
    Bitcoin RPC or the wallet; when neither is available you are asked to enter `txid:vout:sats`, and the signed raw transaction is given
    to you to broadcast yourself.

How the data sources work, the quantities that cannot be derived, and the tests are in `docs/WEB_DESIGN.md` §7. The node responses used
by the replay tests are in `src/chain/rpc/fixtures/devnet.json`; how to re-record them is described at the top of
`src/chain/rpc/chain.test.ts`.

## Directory layout

```text
src/
├── app/            App shell: routing, theme and preferences (including recently sent-to accounts), status strip and bottom bar (wallet mode), toasts, data source panel, regtest console, build fingerprint
├── assets/fonts/   Heading serif (Song) font subset, a Latin file and a Han file (generated by scripts/subset-font.py, SIL OFL 1.1)
├── chain/
│   ├── params.ts   Protocol parameters (SPEC §13, Params on main) and node policy defaults
│   ├── types.ts    On-chain data model (block header v2, parallel blocks, skipped entries, commit / reveal transactions, carried block bodies)
│   ├── model.ts    Derived types shared by both data sources (fee estimates, backlog state, exchange locks)
│   ├── views.ts    Derives UI state from chain data: block stages, operation progress, search
│   ├── fees.ts     Virtual bytes and fees of settlement transactions and path C transactions (shared by the simulator and the node data source)
│   ├── source.ts   Data source type: simulator or node
│   ├── sim/        devnet simulator and its tests
│   └── rpc/        Node data source: conversion of RPC results into the UI model (including Taproot envelope parsing), chain following and inference, replay tests
├── wallet/         Wallet-side derivations (balances under the two kinds of confirmation, operations in progress), real wallet connections, the BTC side (UTXOs, broadcast)
├── components/     Status marks, the two-lane rail view, progress bars, tables, account seals, grouped addresses, the large-amount threshold form, the section switcher on the block page, etc.
├── pages/          Explorer pages and wallet pages (send, receive, top-up, settings)
├── lib/            Formatting, random numbers
└── styles/         Design tokens and styles
```

After adding Han characters to the UI copy, run `scripts/subset-font.py` to regenerate the heading font subset (usage is at the top of the
script); characters it does not cover fall back to the system Song (serif) font.

## regtest console

In simulator mode, click `devnet` in the top bar to open it (the same panel also switches the data source; the "Test funds" faucet is here
too). You can mine BTC blocks by hand and stage scenarios such as a BTC fee spike (settlement backlog), producer censorship and a producer
going offline, to see how the UI behaves under abnormal conditions. In development mode the simulator is also exposed on `window.__devnet`
for debugging.

## Contract playground

The contract playground is a page of its own, in the Ksana repository's
[`playground/`](https://github.com/ksana-in-bitcoin/ksana/blob/main/playground/README.md) (D-119), hosted at
<https://playground.ksana.network/> on the public signet: example contracts with a page each, edited, compiled, deployed and
used from the browser. This page links it, in a new tab, from the top navigation in a window at least 1200 px wide (below that the
top bar has no room for it in every language), from the footer, from the wallet's home (the card below the activity, which
with the footer leads there on a phone) and, under the node data source on the signet, from a contract's page: **Open in the playground** opens that contract there, an example's
on its own page and any other with forms from an ABI pasted there. A page in Simplified Chinese asks the playground for
Simplified Chinese with `?lang=zh-CN`. A copy of this page published for another network can name its own playground in
`deployment.json` (`"playground": "<URL>"`); its contract pages then link that one for the contracts of its network.

Signed `ksana_submitOp` calls bypass the batching transport: its fallback may replay read calls, but must not replay a write whose answer is missing. This is an application-level guard, not a guarantee of exactly-once HTTP delivery; the operation ID and protocol nonce remain necessary for deduplication.

`npm run check:build-context` installs and builds a temporary copy of this page with, of the core submodule, only
`core/sdk/ts`, as the JavaScript stage of the signet's image (`core/signet/Dockerfile`) builds it, then removes the copy. Run it
when changing asset imports or what the page takes from the core submodule; CI does not run it. It does not build or deploy a
Docker image, run a node, or use a wallet.

## License

Licensed under either of the [Apache License, Version 2.0](LICENSE-APACHE) or the [MIT license](LICENSE-MIT) at your
option. Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this
repository, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or
conditions. The heading font's subset in `src/assets/fonts/` is under the SIL Open Font License 1.1 (`OFL.txt` beside it).
