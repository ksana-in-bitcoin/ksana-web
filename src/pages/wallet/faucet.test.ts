import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimFromFaucet, FaucetError } from '../../app/deployment';
import { setLocale, t } from '../../i18n';
import { fmtRoughDuration } from '../../lib/format';
import { explainFaucetError } from './Faucet';

/** The faucet answering as core/signet/services/faucet.mjs does: a status, its JSON or a proxy's page, and the seconds of its Retry-After */
function answer(status: number, body: unknown, retryAfter?: number) {
  const headers = retryAfter === undefined ? undefined : { 'retry-after': String(retryAfter) };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })));
}

/** A claim as the wallet's button makes it: the op it sent, or what the toast says */
const claim = () => claimFromFaucet('/faucet', 'ab'.repeat(32)).then((opId) => `sent ${opId}`, explainFaucetError);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("The faucet's refusals", () => {
  it('say why in the page’s words, with the wait the faucet asks for', async () => {
    answer(429, { error: 'this account already received KSA; it can ask again in 23 hour(s)' }, 81_300);
    expect(await claim()).toBe('This account already received its test KSA; it can ask again in 22\u00a0h\u00a035\u00a0min');
    answer(429, { error: 'the faucet is busy; try again in a few minutes' }, 300);
    expect(await claim()).toBe('The faucet is busy; try again in 5\u00a0min');
    answer(503, { error: 'the faucet has many transfers waiting for a block; try again in a minute' }, 60);
    expect(await claim()).toBe('The faucet is busy; try again in 1\u00a0min');
    answer(429, { error: 'too many requests from this address; slow down' }, 60);
    expect(await claim()).toBe('Too many requests from this connection; try again in 1\u00a0min');
  });

  it('give no wait where the faucet’s is not the one to wait for', async () => {
    // A connection's claims of the day come back one every 288 minutes, where the faucet asks for an hour
    answer(429, { error: 'this address has asked too often today' }, 3_600);
    expect(await claim()).toBe('This connection has asked for test KSA too often today; try again later');
    answer(503, { error: 'the faucet is empty' });
    expect(await claim()).toBe('The faucet has run out of test KSA; try again later');
    // A Retry-After that is no number of seconds gives no wait, and the refusal is the faucet's own words
    answer(429, { error: 'too many requests from this address; slow down' }, Infinity);
    expect(await claim()).toBe('too many requests from this address; slow down');
  });

  it('say a faucet that does not work or does not answer, and anything else in its own words', async () => {
    answer(502, { error: 'the node is unavailable' });
    expect(await claim()).toBe('The faucet is not working right now; try again later');
    answer(502, '<html>Bad Gateway</html>');
    expect(await claim()).toBe('The faucet is not working right now; try again later');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Load failed'))));
    expect(await claim()).toBe('The faucet did not answer; check the connection and try again');
    answer(400, { error: 'that is the faucet itself' });
    expect(await claim()).toBe('that is the faucet itself');
    // A refusal with no wait to give is its own words
    answer(429, { error: 'this account already received KSA; it can ask again in 1 hour(s)' });
    expect(await claim()).toBe('this account already received KSA; it can ask again in 1 hour(s)');
    answer(200, { op_id: 'cd'.repeat(32), to: 'ab'.repeat(32), amount: '10000000000', nonce: '7' });
    expect(await claim()).toBe(`sent ${'cd'.repeat(32)}`);
  });

  it('keep the status and the wait they came with, and follow the page’s language', async () => {
    answer(429, { error: 'this account already received KSA; it can ask again in 2 hour(s)' }, 4_000);
    const e = await claimFromFaucet('/faucet', 'ab'.repeat(32)).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FaucetError);
    expect(e).toMatchObject({ status: 429, retryAfter: 4_000 });
    const english = explainFaucetError(e);
    try {
      expect(await setLocale('zh-CN', false)).toBe(true);
      expect(explainFaucetError(e)).toBe(t().receive.faucetWhy.claimed(fmtRoughDuration(4_000_000).replace(/ /g, '\u00a0')));
      expect(explainFaucetError(e)).not.toBe(english);
    } finally {
      await setLocale('en', false);
    }
  });
});
