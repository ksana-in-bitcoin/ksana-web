/**
 * JSON-RPC calls made together go to their server as one batch (JSON-RPC 2.0, section 6), each still answered on its own. The
 * page's first load asks the node for its network and its tip, then for sixty blocks and their settlements: one call to a request,
 * twelve in flight, the blocks alone took six round trips, which a phone's network makes slow (on the live signet 1.1 s, against
 * 0.3 s for the sixty in one batch).
 *
 * `batchingFetch` stands in for `fetch` under the SDK's clients (`RpcClientOptions.fetch`). A call waits for the end of the task
 * that made it, so that the calls the page makes together go out together, at most `MAX_BATCH` to a request. Each answer is handed
 * back as a response of its own, with the call's own ID, and the client reads it as before; an answer to the whole batch that is
 * not JSON-RPC (a proxy's "502 Bad Gateway") is handed to each call as it came. A batch its server finds too long, or whose
 * answers it finds too large (jsonrpsee's -32010 and -32011, past 10 MB by default), goes again in halves, and the address's
 * batches keep to the size of those halves from then on. A server that answers a batch with anything else than a list of answers
 * takes single calls only: it is sent each call on its own, from then on, and `batches` says so, for the reads that went wide on
 * batches to keep to fewer calls in flight. The calls it was sent together, made a batch's worth at a time, go again one by one, at
 * most `SINGLES` in flight, the rest waiting their turn. A call whose signal aborts (the client's timeout) fails at once; its batch is dropped
 * only once every call in it has. Once the batch's headers are in, its calls' signals no longer abort them: unlike a direct SDK
 * request, whose timeout includes its response body, a batch uses a separate deadline for downloading all its answers. The
 * answers then have a minute to arrive
 * (`ANSWERS_MS`): a body that stalls fails its calls rather than hold them, and the page's syncs behind them, for good. A call
 * that goes again after its batch's answer (in a half of a batch too large, or alone where the answer left it out or the server
 * took no batch) heeds its signal again: one whose timeout passed meanwhile fails then, unsent, as its answer had not begun.
 */

/** Calls to a request at most: the first load's sixty blocks and the genesis block go in one */
export const MAX_BATCH = 64;

/**
 * Calls in flight at once to a server that takes no batch, as the calls made for a batch go again one by one: as many as the page's
 * own reads keep in flight there (`HISTORY_CONCURRENCY` in `chain.ts`), not a batch's worth at once
 */
const SINGLES = 12;

/** How long a batch's answers have to arrive once their headers are in: 64 blocks over a slow phone link take seconds, not a minute */
const ANSWERS_MS = 60_000;

/** jsonrpsee's answers to a batch it found too large: the request (-32007), its length (-32010), its answers (-32011) */
const TOO_LARGE = new Set([-32007, -32010, -32011]);

/** `fetch` for the SDK's clients, and whether an address's calls still go in batches */
export type BatchingFetch = typeof fetch & {
  /** False once the server at `url` has taken no batch: its calls then go one by one */
  batches(url: string): boolean;
};

/** A call as its client wrote it */
interface Message {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

interface Call {
  readonly message: Message;
  readonly init: RequestInit;
  readonly resolve: (response: Response) => void;
  readonly reject: (reason: unknown) => void;
  /** Its signal aborted it: it is not sent, or its answer is not awaited */
  aborted: boolean;
  /** Its batch's answer has begun to arrive (the headers are in): its signal no longer aborts it */
  answering?: boolean;
  /** Told when it aborts while its batch is on its way */
  dropped?: () => void;
}

/** The body of a single JSON-RPC call with an ID (not a notification, not a batch); undefined for anything else */
function messageOf(body: unknown): Message | undefined {
  if (typeof body !== 'string') return undefined;
  let message: unknown;
  try {
    message = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return undefined;
  const m = message as Partial<Message>;
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string' || (typeof m.id !== 'number' && typeof m.id !== 'string')) return undefined;
  return m as Message;
}

/** Whether a body is a JSON-RPC answer carrying an error: what a server that takes no batch answers one with */
function isRpcError(answer: unknown): boolean {
  return typeof answer === 'object' && answer !== null && (answer as { jsonrpc?: unknown }).jsonrpc === '2.0' && 'error' in answer;
}

/** The code of a JSON-RPC answer carrying an error; undefined for anything else */
function errorCode(answer: unknown): number | undefined {
  if (!isRpcError(answer)) return undefined;
  const code = (answer as { error?: { code?: unknown } | null }).error?.code;
  return typeof code === 'number' ? code : undefined;
}

/** Why a signal aborted, as `fetch` rejects with it (a browser older than `AbortSignal.reason` gives none) */
function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/** The next task: a message to the page itself, which a tab out of view does not hold back as it does a timer */
function nextTask(fn: () => void) {
  if (typeof MessageChannel === 'undefined') {
    setTimeout(fn, 0);
    return;
  }
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    channel.port1.close();
    fn();
  };
  channel.port2.postMessage(null);
}

export function batchingFetch(base: typeof fetch, max = MAX_BATCH, answersMs = ANSWERS_MS): BatchingFetch {
  /** The calls waiting for the end of the task, by address and headers */
  const queues = new Map<string, { url: string; calls: Call[] }>();
  /** The addresses and headers whose server took no batch, and the addresses */
  const single = new Set<string>();
  const singleUrls = new Set<string>();
  /** The calls to a request, by address and headers, where the server found a batch too large: the size of the halves it then took */
  const sizes = new Map<string, number>();

  /** A call about to go again heeds its signal again: false, and the call failed, where its timeout passed meanwhile */
  const heeds = (call: Call) => {
    call.answering = false;
    const signal = call.init.signal;
    if (!signal?.aborted) return true;
    call.aborted = true;
    call.reject(abortReason(signal));
    return false;
  };

  const alone = (url: string, call: Call) => {
    if (call.aborted || !heeds(call)) return;
    Promise.resolve()
      .then(() => base(url, call.init))
      .then(call.resolve, call.reject);
  };

  /** The calls made for a batch going one by one to a server that takes no batch, by address and headers: those waiting, and how many are in flight */
  const lines = new Map<string, { waiting: Call[]; sent: number }>();

  /** Calls one by one, at most `SINGLES` in flight to the address; one waiting its turn heeds its signal meanwhile */
  const oneByOne = (key: string, url: string, calls: Call[]) => {
    const line = lines.get(key) ?? { waiting: [], sent: 0 };
    lines.set(key, line);
    line.waiting.push(...calls.filter((call) => !call.aborted && heeds(call)));
    const next = () => {
      while (line.sent < SINGLES) {
        const call = line.waiting.shift();
        if (!call) break;
        if (call.aborted) continue;
        line.sent += 1;
        Promise.resolve()
          .then(() => base(url, call.init))
          .then(call.resolve, call.reject)
          .finally(() => {
            line.sent -= 1;
            next();
          });
      }
      if (!line.sent && !line.waiting.length) lines.delete(key);
    };
    next();
  };

  const send = async (key: string, url: string, calls: Call[]) => {
    if (!calls.length) return;
    if (single.has(key)) {
      oneByOne(key, url, calls);
      return;
    }
    if (calls.length === 1) {
      for (const call of calls) alone(url, call);
      return;
    }
    const controller = new AbortController();
    let live = calls.length;
    for (const call of calls) {
      call.dropped = () => {
        live -= 1;
        if (!live) controller.abort();
      };
    }
    const fail = (reason: unknown) => {
      for (const call of calls) call.reject(reason);
    };
    let response: Response;
    let text: string;
    let stall: ReturnType<typeof setTimeout> | undefined;
    try {
      // The calls' own IDs may repeat (two clients of one address count alike): the batch numbers them itself
      const body = JSON.stringify(calls.map((call, i) => ({ ...call.message, id: i })));
      response = await base(url, { method: 'POST', headers: calls[0]?.init.headers ?? {}, body, signal: controller.signal });
      for (const call of calls) call.answering = true;
      const answer = response;
      text = await new Promise<string>((resolve, reject) => {
        stall = setTimeout(() => {
          const reason = new DOMException(`The answers to a batch took over ${answersMs / 1000} s to arrive.`, 'TimeoutError');
          controller.abort(reason);
          reject(reason);
        }, answersMs);
        answer.text().then(resolve, reject);
      });
    } catch (e) {
      fail(e);
      return;
    } finally {
      clearTimeout(stall);
      for (const call of calls) delete call.dropped;
    }
    let answers: unknown;
    try {
      answers = JSON.parse(text);
    } catch {
      answers = undefined;
    }
    if (!Array.isArray(answers)) {
      // Too long or too large for its server: the halves go on their own, as batches still, and the address's batches keep to
      // their size (a size of one is single calls); the calls heed their signals again (one that aborted meanwhile fails now)
      const code = errorCode(answers);
      if (code !== undefined && TOO_LARGE.has(code)) {
        const size = Math.min(sizes.get(key) ?? max, Math.ceil(calls.length / 2));
        sizes.set(key, size);
        if (size <= 1) {
          single.add(key);
          singleUrls.add(url);
        }
        const again = calls.filter(heeds);
        const half = Math.ceil(again.length / 2);
        void send(key, url, again.slice(0, half));
        void send(key, url, again.slice(half));
        return;
      }
      if (response.ok || isRpcError(answers)) {
        single.add(key);
        singleUrls.add(url);
        oneByOne(key, url, calls);
        return;
      }
      const type = response.headers.get('content-type');
      for (const call of calls) call.resolve(new Response(text, { status: response.status, statusText: response.statusText, headers: type ? { 'content-type': type } : {} }));
      return;
    }
    const byId = new Map<number, object>();
    for (const answer of answers) {
      const id = typeof answer === 'object' && answer !== null ? (answer as { id?: unknown }).id : undefined;
      if (typeof id === 'number' && !byId.has(id)) byId.set(id, answer as object);
    }
    // No call answered: the server did not take the list as a batch
    if (!calls.some((_, i) => byId.has(i))) {
      single.add(key);
      singleUrls.add(url);
      oneByOne(key, url, calls);
      return;
    }
    calls.forEach((call, i) => {
      const answer = byId.get(i);
      if (!answer) {
        alone(url, call);
        return;
      }
      const body = JSON.stringify({ ...answer, id: call.message.id });
      call.resolve(new Response(body, { status: response.status, statusText: response.statusText, headers: { 'content-type': 'application/json' } }));
    });
  };

  const flush = (key: string) => {
    const queue = queues.get(key);
    queues.delete(key);
    if (!queue) return;
    const calls = queue.calls.filter((call) => !call.aborted);
    const size = sizes.get(key) ?? max;
    for (let i = 0; i < calls.length; i += size) void send(key, queue.url, calls.slice(i, i + size));
  };

  const batching: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : undefined;
    const message = init?.method === 'POST' ? messageOf(init.body) : undefined;
    if (url === undefined || !init || !message) return base(input, init);
    // A batch fallback can replay calls whose answer was missing. Signed submissions must never enter that retry path.
    if (message.method === 'ksana_submitOp') {
      if (init.signal?.aborted) return Promise.reject(abortReason(init.signal));
      return base(input, init);
    }
    const key = `${url}\n${JSON.stringify([...new Headers(init.headers)])}`;
    if (single.has(key)) return base(input, init);
    const signal = init.signal;
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    return new Promise<Response>((resolve, reject) => {
      const call: Call = { message, init, resolve, reject, aborted: false };
      signal?.addEventListener(
        'abort',
        () => {
          if (call.answering) return;
          call.aborted = true;
          reject(abortReason(signal));
          call.dropped?.();
        },
        { once: true },
      );
      const queue = queues.get(key);
      if (queue) queue.calls.push(call);
      else {
        queues.set(key, { url, calls: [call] });
        nextTask(() => flush(key));
      }
    });
  };
  return Object.assign(batching, { batches: (url: string) => !singleUrls.has(url) });
}
