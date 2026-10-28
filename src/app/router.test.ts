import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from './router';

const TXID = 'e875635d85438b3c4acbadfaf5267929cad8526fbf4a1a3952a07d8f1b545805';
const HASH = 'ab'.repeat(32);

describe('a BTC transaction’s address', () => {
  it('names the block that names the transaction, by height or by hash, and reads back the same', () => {
    for (const block of ['1899', HASH]) {
      const route: Route = { name: 'tx', id: TXID, block };
      expect(href(route)).toBe(`#/tx/${TXID}?block=${block}`);
      expect(parseRoute(href(route))).toEqual(route);
    }
    expect(href({ name: 'tx', id: TXID })).toBe(`#/tx/${TXID}`);
    expect(parseRoute(`#/tx/${TXID}`)).toEqual({ name: 'tx', id: TXID });
  });

  it('takes a hash in capitals, and leaves out a block that is neither a height nor a hash', () => {
    expect(parseRoute(`#/tx/${TXID}?block=${HASH.toUpperCase()}`)).toEqual({ name: 'tx', id: TXID, block: HASH });
    for (const bad of ['', 'latest', '-1', '1.5', 'ab'.repeat(31), `${HASH}00`]) expect(parseRoute(`#/tx/${TXID}?block=${bad}`)).toEqual({ name: 'tx', id: TXID });
  });
});

describe('a top-up’s address', () => {
  it('names the exchange contract and the lock to open the page on, and reads back the same', () => {
    const route: Route = { name: 'topup', exchange: HASH, lock: '7' };
    expect(href(route)).toBe(`#/wallet/topup?exchange=${HASH}&lock=7`);
    expect(parseRoute(href(route))).toEqual(route);
    expect(href({ name: 'topup' })).toBe('#/wallet/topup');
    expect(parseRoute('#/wallet/topup')).toEqual({ name: 'topup' });
  });

  it('takes a contract in capitals, and leaves out a contract or a lock that is not one', () => {
    expect(parseRoute(`#/wallet/topup?exchange=${HASH.toUpperCase()}&lock=0`)).toEqual({ name: 'topup', exchange: HASH, lock: '0' });
    for (const bad of ['', 'ab'.repeat(31), `${HASH}00`, 'zz'.repeat(32)]) expect(parseRoute(`#/wallet/topup?exchange=${bad}&lock=1`)).toEqual({ name: 'topup', lock: '1' });
    for (const bad of ['', '-1', '1.5', 'x', '1'.repeat(21)]) expect(parseRoute(`#/wallet/topup?exchange=${HASH}&lock=${bad}`)).toEqual({ name: 'topup', exchange: HASH });
  });
});
