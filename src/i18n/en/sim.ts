import type { Messages } from '..';

/** Text produced by the in-browser simulator: receipts, submit errors, event log, settlement notes, built-in account and asset names */
const sim: Messages['sim'] = {
  label: {
    faucet: 'devnet faucet',
    operator: 'devnet operator',
    demo: 'Demo account',
    share: 'Block share account',
    seller: 'KSA seller',
    contract: (name: string) => `Contract · ${name}`,
    tknContract: 'TKN token',
    ammContract: 'AMM',
    triggerContract: 'BTC payment trigger',
    exchangeContract: 'KSA exchange',
  },
  /** Names of the built-in contracts and assets */
  name: {
    tknContract: 'Example token TKN',
    ammContract: 'Constant-product AMM (KSA/TKN)',
    triggerContract: 'Issuance on BTC payment',
    exchangeContract: 'KSA exchange (BTC for KSA)',
    tknAsset: 'Example token',
    passAsset: 'BTC payment proof',
  },

  /** Rejected by this node on submit (shown on the Send page) */
  reject: {
    tooLarge: (size: number) => `Operation too large: ${size} bytes (limit 64 KiB)`,
    nativeGas: (max: string) => `Path C max_gas can’t exceed ${max}`,
    feeLow: (min: string) => `Sponsor fee can’t be below ${min}\u00a0KSA`,
    ksa: 'Not enough KSA for the sponsor fee',
    noUtxo: 'No usable BTC UTXO for the miner fee',
    lockNotOpen: 'The lock isn’t Open',
    lockMissing: 'Lock not found',
    sats: 'Payment must be greater than 0',
    notBeneficiary: 'Only the lock’s beneficiary account can top up',
    nonceUsed: (nonce: string) => `Nonce ${nonce} is already used`,
  },

  /** Failure and skip reasons in receipts */
  exec: {
    skipped: (reason: string) => `Skipped: ${reason}`,
    unaccepted: 'Not yet merged into the main chain',
    thisBlock: 'this block',
    duplicate: (where: string) => `Duplicate: already executed in ${where}`,
    nonceConflict: (cur: string, op: string) => `nonce conflict: account is at ${cur}, operation has ${op}`,
    ksaShort: 'Not enough KSA for the sponsor fee',
    unknownOp: 'Unknown operation',
    nonceMismatch: (cur: string, op: string) => `nonce mismatch: account is at ${cur}, operation has ${op}`,
    outOfGas: (max: string) => `Execution exceeded max_gas (${max})`,
    trap: 'Contract trap: unreachable',
    noAsset: 'Asset doesn’t exist',
    balanceShort: (symbol: string) => `Insufficient ${symbol} balance`,
    noContract: 'Contract doesn’t exist',
    liquidityShort: 'Insufficient balance to add liquidity',
    slippage: (out: string, min: string) => `Slippage exceeded: would get ${out}, below min_out ${min}`,
    headerShallow: (min: number, h: string, depth: number) => `btc_header can only read blocks at depth ≥ ${min}; BTC #${h} is at depth ${depth}`,
    lockNotOpen: 'The lock isn’t Open',
    alreadyUnlocked: 'The unlock cursor is already past this position',
    unlockNotSettled: 'The target block isn’t in the settled closure yet',
    mergedUnlock: 'A parallel block’s unlock entry isn’t executed; only the chain block’s own unlock entry moves the cursor',
    fundsShort: (symbol: string) => `Not enough ${symbol} for the attached funds`,
    noMethod: (method: string) => `The contract has no ${method} method`,
    lockInvalid: 'Invalid lock: amount and price must be positive, and the expiry must be after the anchor height',
    scriptUsed: 'This payment script is already used by another lock',
    exchangeShort: 'Not enough available balance in the exchange contract',
    notNative: 'Only a path C operation can claim a lock',
    noPayment: 'The transaction has no output paying the lock’s address',
    notSeller: 'Only the seller can release the lock',
    notExpired: (h: string) => `The lock can’t be released until after BTC #${h}`,
  },

  /** Why an operation was removed from the mempool */
  dropped: {
    nonceUsed: (nonce: string) => `nonce ${nonce} was used by another operation from the same account`,
  },

  /** Notes on BTC transactions */
  note: {
    commit: 'Commit transaction',
    reveal: 'Reveal transaction',
    carriedBodies: (n: number) => `Carries ${n} block ${n === 1 ? 'body' : 'bodies'}`,
    rebuiltOffline: 'Producer offline; rebuilt by another node',
    carriedElsewhere: 'Its payload is already on chain in another transaction; not broadcast',
  },

  /** Event log (regtest console and toasts) */
  event: {
    /** Lowercase: also inserted mid-sentence (receipts, the events below) */
    sideBlock: (hash: string, h: string) => `parallel block ${hash} (#${h})`,
    backlogOn: (block: string, n: number) => `Settlement backlog: ${block} has waited ${n} BTC ${n === 1 ? 'block' : 'blocks'}; fast paths paused`,
    backlogOff: 'Settlement backlog cleared; fast paths resumed',
    merged: (h: string, n: number) => `#${h} merged ${n} parallel ${n === 1 ? 'block' : 'blocks'}`,
    /** Appended to the line above */
    mergedSkipped: (n: number) => `, skipping ${n} duplicate or conflicting ${n === 1 ? 'entry' : 'entries'}`,
    rescue: (block: string) => `Settlement for ${block} invalidated; rescue settlement started`,
    headers: (n: number) => `Republished ${n} block ${n === 1 ? 'header' : 'headers'}`,
    settledTo: (h: string) => `Settled up to #${h}`,
    finalTo: (h: string) => `BTC final up to #${h}`,
    btcBlock: (h: string, n: number) => `BTC #${h} mined with ${n} Ksana ${n === 1 ? 'transaction' : 'transactions'}`,
    mined: (n: number) => `regtest: mined ${n} BTC ${n === 1 ? 'block' : 'blocks'} manually`,
    faucet: 'Faucet: sent 5,000\u00a0KSA and 0.1\u00a0BTC',
    unlock: (h: string, amount: string) => `Unlocked up to #${h}, ${amount}\u00a0KSA in total`,
    emptyWeight: (w: number) => `Empty-block weight ×${w}`,
    topUp: (sats: string, ksa: string) => `Top-up: paid ${sats}\u00a0sats, claimed ${ksa}\u00a0KSA`,
    censorOn: 'Scenario: producers stop including this account',
    censorOff: 'Scenario: producers include this account again',
    feeSpikeOn: 'Scenario: BTC fee rate jumps to 40\u00a0sat/vB; settlements get stuck',
    feeSpikeOff: 'Scenario: BTC fee rate back to normal',
    cpfpMany: (n: number) => `Bumped ${n} stuck ${n === 1 ? 'transaction' : 'transactions'} with CPFP via P2A anchors`,
    cpfpOne: 'Bumped a stuck transaction with CPFP',
    offline: (name: string) => `Scenario: ${name} goes offline`,
    online: 'Scenario: producer back online',
  },
};

export default sim;
