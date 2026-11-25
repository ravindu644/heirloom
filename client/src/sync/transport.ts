// The wire: contracts/protocol.md sections 4 and 5. A WebSocket with a ping, and POST /api/sync
// when a proxy will not let one through. Either way the engine sees the same messages, and it
// alone decides what they mean. Everything from the environment is handed in, so this runs in
// the browser, in Node against a real server, and in tests that never wait.

import type { Cell } from '../core/merge.ts';

export type ServerMessage =
  // `role` left out is an older server, whose accounts are all members. Null is not on the wire:
  // it is a POST reply standing in for a welcome, which does not say.
  | { type: 'welcome'; server_time: number; head: number; rooms?: string[]; role?: string | null }
  | { type: 'cells'; from: number; to: number; cells: Cell[] }
  | { type: 'ack'; batch: string; from: number; cursor: number }
  | { type: 'nack'; batch: string; reason: string; server_time: number }
  | { type: 'bye'; reason: string }
  // The owner has just changed the account's role. Also what a POST reply's role becomes, after the first.
  | { type: 'role'; role: string }
  // One room as the server sees it now: protocol section 15. sync/rooms.ts reads the rest of it.
  | ({ type: 'room'; room: string } & Record<string, unknown>)
  // Not on the wire: every room the account is in, as a welcome or a POST reply named them.
  | { type: 'rooms'; rooms: string[] };

export interface Push {
  type: 'push';
  batch: string;
  cells: Cell[];
}

/** The part of a WebSocket this uses. The browser's and Node's both fit. */
export interface Socket {
  send(data: string): void;
  close(): void;
  onopen: ((event: any) => any) | null;
  onmessage: ((event: any) => any) | null;
  onclose: ((event: any) => any) | null;
  onerror: ((event: any) => any) | null;
}

/** The part of `fetch` this uses. */
export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<any>;
}>;

export interface Wire {
  /** The server, `https://host` with no slash at the end. */
  url: string;
  /** The device's own clock in ms, uncorrected. */
  now(): number;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
  /** 0 to 1, for the jitter. */
  random(): number;
  WebSocket: new (url: string) => Socket;
  fetch: Fetch;
}

export interface Handlers {
  /** Asked at every hello and every POST, so the cursor sent is always the current one. */
  hello(): { token: string; device: string; cursor: number; utc_offset_min: number };
  /** `welcome` means a path to the server is open; after `down` nothing arrives until the next one. */
  message(msg: ServerMessage): void;
  down(): void;
  /** An attempt to reach the server has ended without a welcome: a socket that failed or never answered, a POST that failed, or the device saying it is offline. */
  failed(): void;
  /** One measurement of server time minus device time, in ms. */
  time(sample: number): void;
}

export interface Transport {
  start(): void;
  /** Closes everything and stops trying. Nothing is delivered after this. */
  stop(): void;
  /** Sends a push if a path is open. A push that is lost is the engine's to send again after the next `welcome`. */
  send(push: Push): void;
  /** Closes the socket and says hello again: the engine saw that it missed something. */
  again(): void;
  /** Tries now instead of waiting out the backoff: the network came back, or the app came to the front. */
  wake(): void;
  /** The device says the network is gone: whatever path was open is lost now, without waiting for a ping to find out. */
  offline(): void;
}

export type Connect = (handlers: Handlers) => Transport;

export const PING_MS = 25000;
/**
 * How long a pong may take. Ten seconds, not five: over a bad mobile link TCP sends a lost packet
 * again after 1 s, then 2, then 4, so a pong that lost three in a row is still on its way at 7 s.
 * Dropping the socket for that costs a new handshake on the very link that can least afford one,
 * and an "offline" that was not true. A dead socket is found 10 s after the ping, 35 s at worst.
 */
export const PONG_MS = 10000;
export const POLL_MS = 5000;
/** How long a new socket has to say welcome. A proxy may accept the socket and then pass nothing on. */
export const HELLO_MS = 10000;
/** How long one POST may take. A request that hangs must not stop the polling for as long as the browser lets it. */
export const POST_MS = 20000;
/** Socket attempts in a row with no welcome before POST takes over. */
export const SOCKET_TRIES = 3;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30000;
const OFFSET_JUMP_MS = 2000;

/** Wait before try number `failures + 1`: doubling from 1 s to 30 s, then half to all of it, so a restarted server is not hit by every device at once. */
export const backoffMs = (failures: number, random: number): number =>
  Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (failures - 1)) * (0.5 + random / 2);

/** The offset to keep after one more sample. One slow pong moves it a quarter of the way; a real jump (the user set the clock) is taken whole. */
export const smoothOffset = (held: number | null, sample: number): number =>
  held === null || Math.abs(sample - held) > OFFSET_JUMP_MS ? sample : held + (sample - held) / 4;

const JSON_POST = { method: 'POST', headers: { 'content-type': 'application/json' } };
const never = () => {};

/**
 * One POST of JSON that may take `ms` and no longer. When the limit wins the request is aborted,
 * not just forgotten: a browser keeps six connections to a host, and six requests left hanging
 * would hold every later one in a queue behind them. Rejects when there is no answer.
 */
export const postJson = (wire: Pick<Wire, 'fetch' | 'schedule'>, url: string, body: object, ms: number) =>
  askJson(wire, url, { ...JSON_POST, body: JSON.stringify(body) }, ms);

/** How long a server has to say who it is. Short: someone is waiting on an address they just typed. */
export const HEALTH_MS = 5000;

/** `GET <server>/healthz`: what the server says of itself, or null when what answered was not JSON. Throws when nothing answered in time. */
export const health = async (wire: Pick<Wire, 'fetch' | 'schedule'>, server: string): Promise<any> =>
  // ponytail: Fetch says every call has a body and a GET has none. Widening the type would stop
  // the fakes of other lanes compiling; they all read the body only on the paths they know.
  (await askJson(wire, server + '/healthz', { method: 'GET', headers: {} } as Parameters<Fetch>[1], HEALTH_MS)).data;

async function askJson(wire: Pick<Wire, 'fetch' | 'schedule'>, url: string, init: Parameters<Fetch>[1], ms: number) {
  // A browser's fetch must not be called as a method of another object.
  const ask = wire.fetch;
  const abort = new AbortController();
  let cancel = never;
  const answered = (async () => {
    const res = await ask(url, { ...init, signal: abort.signal });
    return { ok: res.ok, status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
  })();
  // If the limit wins, whatever this request does later is nobody's business.
  answered.catch(() => {});
  const limit = new Promise<never>((_, reject) => {
    cancel = wire.schedule(() => {
      abort.abort();
      reject(new Error('no answer in time'));
    }, ms);
  });
  try {
    return await Promise.race([answered, limit]);
  } finally {
    cancel();
  }
}

export function connect(wire: Wire, on: Handlers): Transport {
  let running = false;
  let ws: Socket | null = null;
  let live = false; // this socket has said welcome
  let failures = 0; // socket attempts in a row that never did
  let cancelPong = never;
  let cancelRetry = never;
  let cancelPing = never;
  let cancelHello = never;

  let polling = false;
  let polls = 0; // goes up when polling stops, so a reply still in the air is dropped
  let pollUp = false;
  let pollFailures = 0;
  let posting = false;
  let queued: Push | null = null;
  let cancelPoll = never;

  function open() {
    drop();
    cancelRetry();
    let sent = 0;
    let sock: Socket;
    try {
      sock = ws = new wire.WebSocket(wire.url.replace(/^http/, 'ws') + '/api/ws');
    } catch {
      return lost();
    }
    sock.onopen = () => {
      sent = wire.now();
      sock.send(JSON.stringify({ type: 'hello', ...on.hello(), client_time: sent }));
    };
    sock.onmessage = (event) => {
      if (sock !== ws) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg && typeof msg.type === 'string') receive(msg, sent);
    };
    sock.onclose = sock.onerror = () => {
      if (sock === ws) lost();
    };
    // From the moment it is made, so one that never opens is caught as well.
    cancelHello = wire.schedule(() => {
      if (sock === ws) lost();
    }, HELLO_MS);
  }

  function receive(msg: any, helloSent: number) {
    if (msg.type === 'pong') {
      cancelPong();
      return on.time(msg.server_time - (msg.t + wire.now()) / 2);
    }
    if (msg.type === 'ping') return ws?.send(JSON.stringify({ type: 'pong', t: msg.t }));
    if (msg.type === 'welcome') {
      live = true;
      failures = 0;
      cancelHello();
      stopPolling();
      on.time(msg.server_time - (helloSent + wire.now()) / 2);
      cancelPing = wire.schedule(ping, PING_MS);
    }
    if (msg.type === 'bye' && msg.reason === 'token') stop();
    on.message(msg);
  }

  function ping() {
    try {
      ws?.send(JSON.stringify({ type: 'ping', t: wire.now() }));
    } catch {
      return lost();
    }
    // No pong in time: the socket is dead and nobody told us. Phones do this, and so does Wi-Fi
    // that is up but goes nowhere. Dropping the socket cancels this, so it never outlives its ping.
    cancelPong = wire.schedule(lost, PONG_MS);
    cancelPing = wire.schedule(ping, PING_MS);
  }

  function drop() {
    const sock = ws;
    ws = null;
    live = false;
    cancelPong();
    cancelPing();
    cancelHello();
    if (!sock) return;
    sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
    try {
      sock.close();
    } catch {
      // Closing a socket that never opened may throw. It is gone either way.
    }
  }

  function lost() {
    const wasLive = live;
    drop();
    if (!running) return;
    failures += 1;
    if (wasLive) on.down();
    else on.failed();
    if (failures >= SOCKET_TRIES && !polling) {
      polling = true;
      poll();
    }
    // Keeps trying while polling too: the socket is the better path whenever it works.
    cancelRetry = wire.schedule(open, backoffMs(failures, wire.random()));
  }

  function stopPolling() {
    polling = pollUp = posting = false;
    polls += 1;
    pollFailures = 0;
    queued = null;
    cancelPoll();
  }

  async function poll() {
    cancelPoll();
    if (!polling || posting) return;
    posting = true;
    const mine = polls;
    const push = queued;
    queued = null;
    const sent = wire.now();
    let reply;
    try {
      const body = { ...on.hello(), client_time: sent, ...(push && { push: { batch: push.batch, cells: push.cells } }) };
      const res = await postJson(wire, wire.url + '/api/sync', body, POST_MS);
      if (mine !== polls) return;
      if (res.status === 401) {
        stop();
        return on.message({ type: 'bye', reason: 'token' });
      }
      if (!res.ok || !res.data) throw new Error(`sync answered ${res.status}`);
      reply = res.data;
    } catch {
      if (mine !== polls) return;
      posting = false;
      pollFailures += 1;
      if (pollUp) on.down();
      else on.failed();
      pollUp = false;
      cancelPoll = wire.schedule(poll, backoffMs(pollFailures, wire.random()));
      return;
    }
    if (mine !== polls) return;
    pollFailures = 0;
    on.time(reply.server_time - (sent + wire.now()) / 2);
    const steps: ServerMessage[] = [{ type: 'cells', from: reply.from, to: reply.to, cells: reply.cells ?? [] }];
    // The engine pushes its outbox again on every welcome, so it gets one per stretch of working polls, not one per poll.
    if (!pollUp) steps.unshift({ type: 'welcome', server_time: reply.server_time, head: reply.head, role: reply.role ?? null });
    // No socket is open for the server to say a changed role on, so every reply says it.
    else if (typeof reply.role === 'string') steps.unshift({ type: 'role', role: reply.role });
    // The rooms ride in the reply as they would arrive on a socket: one message each.
    for (const room of reply.rooms ?? []) steps.push({ ...room, type: 'room' });
    // The array is the whole set, so it also says which rooms are no more. No array says nothing.
    if (Array.isArray(reply.rooms)) steps.push({ type: 'rooms', rooms: reply.rooms.map((room: { room: string }) => room.room) });
    if (reply.ack) steps.push({ type: 'ack', ...reply.ack });
    if (reply.nack) steps.push({ type: 'nack', ...reply.nack });
    // Up before the welcome is handed over: the engine answers a welcome with a push, and it must be taken.
    pollUp = true;
    for (const step of steps) {
      // A handler may have stopped us or moved us back to the socket.
      if (mine === polls) on.message(step);
    }
    if (mine !== polls) return;
    // Only now: a push sent from inside a handler waits for the next POST, whose cursor is past this reply.
    posting = false;
    // More pages, or a push that came in while this one was out: ask again now.
    if (queued || reply.to < reply.head) poll();
    else cancelPoll = wire.schedule(poll, POLL_MS);
  }

  function stop() {
    running = false;
    cancelRetry();
    drop();
    stopPolling();
  }

  return {
    start() {
      if (running) return;
      running = true;
      failures = 0;
      open();
    },
    stop,
    send(push) {
      if (live) {
        try {
          ws?.send(JSON.stringify(push));
        } catch {
          lost();
        }
      } else if (pollUp) {
        queued = push;
        poll();
      }
    },
    again() {
      if (!running) return;
      if (polling) return void poll();
      // The engine is told: if the new socket fails, it must not go on thinking it is connected.
      if (live) on.down();
      open();
    },
    wake() {
      if (!running || live) return;
      failures = 0;
      open();
      if (polling) poll();
    },
    offline() {
      if (live) return lost();
      // On the POST path there is no socket to drop. The next poll that works says welcome again.
      if (pollUp) on.down();
      // And if nothing was up yet, the question "is there a connection" has its answer all the same.
      else on.failed();
      pollUp = false;
    },
  };
}
