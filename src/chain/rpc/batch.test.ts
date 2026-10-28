import { describe, expect, it } from 'vitest';
import { JsonRpcClient, KsanaRpcClient, RpcError, RpcTransportError } from '@ksana/sdk';
import { batchingFetch } from './batch';

interface Rpc {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown[];
}

/**
 * A server in memory: it answers each call with its method and first parameter (`echo`), a list with a list in reverse order,
 * and records the bodies it was sent; `answer` replaces how it answers a request
 */
function server(answer?: (body: unknown) => Response | Promise<Response>) {
  const sent: unknown[] = [];
  const urls: string[] = [];
  const echo = (call: Rpc) => ({ jsonrpc: '2.0', id: call.id, result: `${call.method}:${String(call.params?.[0])}` });
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Rpc | Rpc[];
    sent.push(body);
    urls.push(String(input));
    if (answer) return answer(body);
    const reply = Array.isArray(body) ? body.map(echo).reverse() : echo(body);
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  return { fetch, sent, urls };
}

const call = (id: number | string, method: string, ...params: unknown[]): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
});

const read = async (r: Response) => (await r.json()) as { id: unknown; result?: unknown; error?: { code: number } };

describe('Calls made together go out as one JSON-RPC batch', () => {
  it('keeps signed submissions out of batches and their fallback replays', async () => {
    const s = server(async (body) => new Response(JSON.stringify(Array.isArray(body)
      ? { jsonrpc: '2.0', id: null, error: { code: -32005, message: 'no batches' } }
      : { jsonrpc: '2.0', id: (body as Rpc).id, result: (body as Rpc).method }), { status: 200 }));
    const f = batchingFetch(s.fetch);
    await Promise.all([f('/rpc', call(1, 'ksana_getAccount')), f('/rpc', call(2, 'ksana_submitOp', 'signed-bytes')),
      f('/rpc', call(3, 'ksana_getChainInfo'))]);
    const batches = s.sent.filter(Array.isArray) as Rpc[][];
    const submissions = s.sent.flatMap((body) => Array.isArray(body) ? body : [body]) as Rpc[];
    expect(submissions.filter((message) => message.method === 'ksana_submitOp')).toHaveLength(1);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.some((message) => message.method === 'ksana_submitOp')).toBe(false);
  });

  it('does not retry an uncertain signed submission and honors an already-aborted signal', async () => {
    const failure = new Error('response lost');
    const s = server(async () => { throw failure; });
    const f = batchingFetch(s.fetch);
    await expect(f('/rpc', call(1, 'ksana_submitOp', 'signed-bytes'))).rejects.toBe(failure);
    expect(s.sent).toHaveLength(1);
    const controller = new AbortController(); controller.abort();
    await expect(f('/rpc', { ...call(2, 'ksana_submitOp', 'other-bytes'), signal: controller.signal })).rejects.toThrow();
    expect(s.sent).toHaveLength(1);
  });

  it('each call gets its own answer, with its own ID, whatever order the server answers in', async () => {
    const s = server();
    const f = batchingFetch(s.fetch);
    const answers = await Promise.all([f('/rpc', call(7, 'a', 1)), f('/rpc', call(7, 'b', 2)), f('/rpc', call('x', 'c', 3))].map(async (p) => read(await p)));
    expect(answers).toEqual([
      { jsonrpc: '2.0', id: 7, result: 'a:1' },
      { jsonrpc: '2.0', id: 7, result: 'b:2' },
      { jsonrpc: '2.0', id: 'x', result: 'c:3' },
    ]);
    // one request, the calls numbered by the batch (two of them shared an ID)
    expect(s.sent).toEqual([
      [
        { jsonrpc: '2.0', id: 0, method: 'a', params: [1] },
        { jsonrpc: '2.0', id: 1, method: 'b', params: [2] },
        { jsonrpc: '2.0', id: 2, method: 'c', params: [3] },
      ],
    ]);
  });

  it('under the SDK client: sixty blocks asked at once take one request; a call made later, alone, is no list', async () => {
    const s = server(async (body) => {
      const block = (call: Rpc) => ({ jsonrpc: '2.0', id: call.id, error: { code: -32004, message: `block ${String(call.params?.[0])} not found` } });
      return new Response(JSON.stringify(Array.isArray(body) ? body.map(block) : block(body as Rpc)), { status: 200 });
    });
    const node = new KsanaRpcClient('http://node.test/rpc', { fetch: batchingFetch(s.fetch) });
    const heights = Array.from({ length: 60 }, (_, i) => 100 + i);
    const results = await Promise.allSettled(heights.map((h) => node.getBlock(h)));
    expect(s.sent).toHaveLength(1);
    expect((s.sent[0] as Rpc[]).map((c) => c.params?.[0])).toEqual(heights.map(String));
    // each error is the client's own, naming its block
    results.forEach((r, i) => {
      expect(r.status).toBe('rejected');
      const e = (r as PromiseRejectedResult).reason as RpcError;
      expect(e).toBeInstanceOf(RpcError);
      expect(e.code).toBe(-32004);
      expect(e.message).toContain(`block ${100 + i} not found`);
    });
    await node.getBlock(7).catch(() => undefined);
    expect(Array.isArray(s.sent[1])).toBe(false);
  });

  it('more calls than a batch takes go in several; each address gets its own', async () => {
    const s = server();
    const f = batchingFetch(s.fetch, 4);
    const asked = [...Array.from({ length: 9 }, (_, i) => f('/rpc', call(i, 'n', i))), f('/indexer', call(1, 'i', 0)), f('/indexer', call(2, 'i', 1))];
    await Promise.all(asked);
    const sizes = s.sent.map((b, i) => `${s.urls[i]}:${Array.isArray(b) ? b.length : 'one'}`);
    expect(sizes.sort()).toEqual(['/indexer:2', '/rpc:4', '/rpc:4', '/rpc:one']);
  });

  it('a server that answers a batch with one error takes single calls: each is sent alone, then and from then on', async () => {
    const s = server(async (body) =>
      Array.isArray(body)
        ? new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32005, message: 'Batched requests are not supported by this server' } }), { status: 200 })
        : new Response(JSON.stringify({ jsonrpc: '2.0', id: (body as Rpc).id, result: (body as Rpc).method }), { status: 200 }),
    );
    const f = batchingFetch(s.fetch);
    expect(f.batches('/rpc')).toBe(true);
    expect(await Promise.all([f('/rpc', call(1, 'a')), f('/rpc', call(2, 'b'))].map(async (p) => (await read(await p)).result))).toEqual(['a', 'b']);
    expect(s.sent.map(Array.isArray)).toEqual([true, false, false]);
    expect(f.batches('/rpc')).toBe(false);
    await Promise.all([f('/rpc', call(3, 'c')), f('/rpc', call(4, 'd'))]);
    expect(s.sent.map(Array.isArray)).toEqual([true, false, false, false, false]);
  });

  it('the calls of a batch its server refused go again one by one, twelve at most in flight; one waiting its turn heeds its signal', async () => {
    let inFlight = 0;
    let most = 0;
    let open = () => {};
    const gate = new Promise<void>((r) => (open = r));
    const s = server(async (body) => {
      if (Array.isArray(body)) return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32005, message: 'Batched requests are not supported by this server' } }), { status: 200 });
      inFlight += 1;
      most = Math.max(most, inFlight);
      await gate;
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: (body as Rpc).id, result: (body as Rpc).method }), { status: 200 });
    });
    const f = batchingFetch(s.fetch);
    const names = Array.from({ length: 30 }, (_, i) => `m${i}`);
    const controller = new AbortController();
    const calls = names.map((m, i) => f('/rpc', { ...call(i, m), ...(i === 20 ? { signal: controller.signal } : {}) }));
    // the list, then the first twelve alone, held by the server
    for (let i = 0; i < 100 && s.sent.length < 13; i++) await new Promise((r) => setTimeout(r, 1));
    expect(s.sent.map(Array.isArray)).toEqual([true, ...Array.from({ length: 12 }, () => false)]);
    controller.abort();
    await expect(calls[20]).rejects.toMatchObject({ name: 'AbortError' });
    open();
    const answers = await Promise.allSettled(calls.map(async (p) => (await read(await p)).result));
    expect(answers.map((a) => (a.status === 'fulfilled' ? a.value : 'failed'))).toEqual(names.map((m, i) => (i === 20 ? 'failed' : m)));
    expect(most).toBe(12);
    // each call once, the one that aborted while it waited never
    expect(s.sent.filter((b) => !Array.isArray(b)).map((b) => (b as Rpc).method)).toEqual(names.filter((_, i) => i !== 20));
  });

  it('a batch its server finds too large goes again in halves, and the address keeps its batches, of that size', async () => {
    // jsonrpsee answers a batch whose answers pass its limit with one error: here, any of more than two calls
    const s = server(async (body) => {
      if (Array.isArray(body) && body.length > 2) {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32011, message: 'The batch response was too large' } }), { status: 200 });
      }
      const echo = (c: Rpc) => ({ jsonrpc: '2.0', id: c.id, result: c.method });
      return new Response(JSON.stringify(Array.isArray(body) ? body.map(echo) : echo(body as Rpc)), { status: 200 });
    });
    const f = batchingFetch(s.fetch);
    const names = ['a', 'b', 'c', 'd', 'e'];
    const answers = await Promise.all(names.map(async (m, i) => (await read(await f('/rpc', call(i, m)))).result));
    expect(answers).toEqual(names);
    // five, then three and two, then two and one
    expect(s.sent.map((b) => (Array.isArray(b) ? b.length : 'one')).sort()).toEqual([2, 2, 3, 5, 'one']);
    expect(f.batches('/rpc')).toBe(true);
    await Promise.all([f('/rpc', call(1, 'a')), f('/rpc', call(2, 'b'))]);
    expect(Array.isArray(s.sent[s.sent.length - 1])).toBe(true);
    // six calls made together go in batches of the size the server took, none refused
    const before = s.sent.length;
    await Promise.all(['f', 'g', 'h', 'i', 'j', 'k'].map((m, i) => f('/rpc', call(i, m))));
    expect(s.sent.slice(before).map((b) => (Array.isArray(b) ? b.length : 'one'))).toEqual([2, 2, 2]);
  });

  it('a server that finds even two calls too large an answer takes single calls from then on', async () => {
    const s = server(async (body) => {
      if (Array.isArray(body)) return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32011, message: 'The batch response was too large' } }), { status: 200 });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: (body as Rpc).id, result: (body as Rpc).method }), { status: 200 });
    });
    const f = batchingFetch(s.fetch);
    const answers = await Promise.all(['a', 'b', 'c'].map(async (m, i) => (await read(await f('/rpc', call(i, m)))).result));
    expect(answers).toEqual(['a', 'b', 'c']);
    expect(f.batches('/rpc')).toBe(false);
    const before = s.sent.length;
    await Promise.all([f('/rpc', call(1, 'd')), f('/rpc', call(2, 'e'))]);
    expect(s.sent.slice(before).map(Array.isArray)).toEqual([false, false]);
  });

  it("a proxy's error page is each call's answer, as it would have been alone, and the next calls go in a batch again", async () => {
    let down = true;
    const up = server();
    const s = server((body) => (down ? new Response('Bad Gateway', { status: 502, headers: { 'content-type': 'text/plain' } }) : up.fetch('/rpc', { method: 'POST', body: JSON.stringify(body) })));
    const node = new KsanaRpcClient('/rpc', { fetch: batchingFetch(s.fetch) });
    const failed = await Promise.allSettled([node.estimateFee(), node.getChainInfo()]);
    for (const r of failed) {
      const e = (r as PromiseRejectedResult).reason as RpcTransportError;
      expect(e).toBeInstanceOf(RpcTransportError);
      expect(e.status).toBe(502);
      expect(e.message).toMatch(/HTTP 502, response is not JSON/);
    }
    down = false;
    const f = batchingFetch(s.fetch);
    await Promise.all([f('/rpc', call(1, 'a')), f('/rpc', call(2, 'b'))]);
    expect(s.sent.map(Array.isArray)).toEqual([true, true]);
    expect(f.batches('/rpc')).toBe(true);
  });

  it('a call missing from the answer is asked alone', async () => {
    const s = server(async (body) => {
      if (!Array.isArray(body)) return new Response(JSON.stringify({ jsonrpc: '2.0', id: (body as Rpc).id, result: 'alone' }), { status: 200 });
      return new Response(JSON.stringify([{ jsonrpc: '2.0', id: 0, result: 'batched' }]), { status: 200 });
    });
    const f = batchingFetch(s.fetch);
    const answers = await Promise.all([f('/rpc', call(5, 'a')), f('/rpc', call(6, 'b'))].map(async (p) => read(await p)));
    expect(answers).toEqual([
      { jsonrpc: '2.0', id: 5, result: 'batched' },
      { jsonrpc: '2.0', id: 6, result: 'alone' },
    ]);
  });

  it('a call whose signal aborts fails at once and leaves the batch to the others; the batch is dropped once all have', async () => {
    const aborted: boolean[] = [];
    let release = () => {};
    // the server answers once released
    const s = server(
      (body) =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(JSON.stringify((body as Rpc[]).map((c) => ({ jsonrpc: '2.0', id: c.id, result: c.method }))), { status: 200 }));
        }),
    );
    const watched = (async (input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => aborted.push(true));
      return s.fetch(input, init);
    }) as typeof fetch;
    const f = batchingFetch(watched);
    const first = new AbortController();
    const a = f('/rpc', { ...call(1, 'a'), signal: first.signal });
    const b = f('/rpc', call(2, 'b'));
    await new Promise((r) => setTimeout(r, 10));
    first.abort();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    expect(aborted).toEqual([]);
    release();
    expect((await read(await b)).result).toBe('b');
    // both abort: the request is dropped
    const c1 = new AbortController();
    const c2 = new AbortController();
    const c = f('/rpc', { ...call(3, 'c'), signal: c1.signal });
    const d = f('/rpc', { ...call(4, 'd'), signal: c2.signal });
    await new Promise((r) => setTimeout(r, 10));
    c1.abort();
    c2.abort();
    await expect(Promise.allSettled([c, d])).resolves.toMatchObject([{ status: 'rejected' }, { status: 'rejected' }]);
    expect(aborted).toEqual([true]);
    // a signal aborted before the call is made: nothing is sent
    const before = s.sent.length;
    await expect(f('/rpc', { ...call(5, 'e'), signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 10));
    expect(s.sent.length).toBe(before);
  });

  it("a batch uses its own body deadline after headers, independently of each call's timeout", async () => {
    const later = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const answers = (body: unknown) => JSON.stringify((body as Rpc[]).map((c) => ({ jsonrpc: '2.0', id: c.id, result: c.method })));
    // the headers at once, the answers 300 ms later: past the client's 100 ms, but within the batch's own body deadline
    const slowBody = server(async (body) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          void later(300).then(() => {
            controller.enqueue(new TextEncoder().encode(answers(body)));
            controller.close();
          });
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const client = new JsonRpcClient('http://node.test/rpc', { fetch: batchingFetch(slowBody.fetch), timeoutMs: 100 });
    expect(await Promise.all([client.request('a'), client.request('b')])).toEqual(['a', 'b']);
    expect(slowBody.sent).toHaveLength(1);
    // the headers 300 ms later: the calls time out, as they would alone
    const slowHeaders = server(async (body) => {
      await later(300);
      return new Response(answers(body), { status: 200 });
    });
    const late = new JsonRpcClient('http://node.test/rpc', { fetch: batchingFetch(slowHeaders.fetch), timeoutMs: 100 });
    const failed = await Promise.allSettled([late.request('a'), late.request('b')]);
    for (const r of failed) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(RpcTransportError);
  });

  it("a batch's answers that stall past their time fail its calls, and cancel the request", async () => {
    let cancelled = false;
    // the headers at once, then nothing more
    const stalled = server(async () => new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const watched = (async (input: RequestInfo | URL, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', () => (cancelled = true));
      return stalled.fetch(input, init);
    }) as typeof fetch;
    const client = new JsonRpcClient('http://node.test/rpc', { fetch: batchingFetch(watched, 64, 200), timeoutMs: 100 });
    const failed = await Promise.allSettled([client.request('a'), client.request('b')]);
    for (const r of failed) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(RpcTransportError);
      expect(String((r as PromiseRejectedResult).reason)).toMatch(/took over 0.2 s/);
    }
    expect(cancelled).toBe(true);
  });

  it('a call its batch\'s answer left out goes alone, unless its timeout passed while that answer arrived: then it fails, unsent', async () => {
    const later = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // the headers at once, and 300 ms later the answer to the first call alone; a call alone is answered at once
    const s = server(async (body) => {
      if (!Array.isArray(body)) return new Response(JSON.stringify({ jsonrpc: '2.0', id: (body as Rpc).id, result: 'alone' }), { status: 200 });
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          void later(300).then(() => {
            controller.enqueue(new TextEncoder().encode(JSON.stringify([{ jsonrpc: '2.0', id: 0, result: 'batched' }])));
            controller.close();
          });
        },
      });
      return new Response(stream, { status: 200 });
    });
    const client = new JsonRpcClient('http://node.test/rpc', { fetch: batchingFetch(s.fetch), timeoutMs: 100 });
    const [a, b] = await Promise.allSettled([client.request('a'), client.request('b')]);
    expect(a).toEqual({ status: 'fulfilled', value: 'batched' });
    expect((b as PromiseRejectedResult).reason).toBeInstanceOf(RpcTransportError);
    expect(s.sent).toHaveLength(1);
    // within its timeout, it goes alone
    const quick = new JsonRpcClient('http://node.test/rpc', { fetch: batchingFetch(s.fetch), timeoutMs: 1000 });
    expect(await Promise.all([quick.request('a'), quick.request('b')])).toEqual(['batched', 'alone']);
  });

  it('what is no single JSON-RPC call goes as it came', async () => {
    const s = server(async () => new Response('[]', { status: 200 }));
    const f = batchingFetch(s.fetch);
    await Promise.all([f('/rpc', { method: 'POST', body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'a' }]) }), f('/rpc', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notify' }) })]);
    expect(s.sent).toEqual([[{ jsonrpc: '2.0', id: 1, method: 'a' }], { jsonrpc: '2.0', method: 'notify' }]);
  });
});
