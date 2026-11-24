// The wire: contracts/protocol.md sections 4 and 5. A WebSocket with a ping, and POST /api/sync
// when a proxy will not let one through. Either way the engine sees the same messages, and it
// alone decides what they mean. Everything from the environment is handed in, so this runs in
// the browser, in Node against a real server, and in tests that never wait.

import type { Cell } from '../core/merge.ts';

export type ServerMessage =
  | { type: 'welcome'; server_time: number; head: number }
  | { type: 'cells'; from: number; to: number; cells: Cell[] }
  | { type: 'ack'; batch: string; from: number; cursor: number }
  | { type: 'nack'; batch: string; reason: string; server_time: number }
  | { type: 'bye'; reason: string }
  | { type: 'room'; room: string; members: unknown[] };

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
  init: { method: string; headers: Record<string, string>; body: string },
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
  hello(): { token: string; device: string; cursor: number };
  /** `welcome` means a path to the server is open; after `down` nothing arrives until the next one. */
  message(msg: ServerMessage): void;
  down(): void;
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
}

export type Connect = (handlers: Handlers) => Transport;

export const PING_MS = 25000;
export const POLL_MS = 5000;
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

export function connect(wire: Wire, on: Handlers): Transport {
  // A browser's fetch must not be called as a method of another object.
  const post = wire.fetch;
  let running = false;
  let ws: Socket | null = null;
  let live = false; // this socket has said welcome
  let failures = 0; // socket attempts in a row that never did
  let waitingPong = false;
  let cancelRetry = never;
  let cancelPing = never;

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
  }

  function receive(msg: any, helloSent: number) {
    if (msg.type === 'pong') {
      waitingPong = false;
      return on.time(msg.server_time - (msg.t + wire.now()) / 2);
    }
    if (msg.type === 'ping') return ws?.send(JSON.stringify({ type: 'pong', t: msg.t }));
    if (msg.type === 'welcome') {
      live = true;
      failures = 0;
      stopPolling();
      on.time(msg.server_time - (helloSent + wire.now()) / 2);
      cancelPing = wire.schedule(ping, PING_MS);
    }
    if (msg.type === 'bye' && msg.reason === 'token') stop();
    on.message(msg);
  }

  function ping() {
    // No pong since the last ping: the socket is dead and nobody told us. Phones do this.
    if (waitingPong) return lost();
    waitingPong = true;
    try {
      ws?.send(JSON.stringify({ type: 'ping', t: wire.now() }));
    } catch {
      return lost();
    }
    cancelPing = wire.schedule(ping, PING_MS);
  }

  function drop() {
    const sock = ws;
    ws = null;
    live = false;
    waitingPong = false;
    cancelPing();
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
      const res = await post(wire.url + '/api/sync', { ...JSON_POST, body: JSON.stringify(body) });
      if (mine !== polls) return;
      if (res.status === 401) {
        stop();
        return on.message({ type: 'bye', reason: 'token' });
      }
      if (!res.ok) throw new Error(`sync answered ${res.status}`);
      reply = await res.json();
    } catch {
      if (mine !== polls) return;
      posting = false;
      pollFailures += 1;
      if (pollUp) on.down();
      pollUp = false;
      cancelPoll = wire.schedule(poll, backoffMs(pollFailures, wire.random()));
      return;
    }
    if (mine !== polls) return;
    pollFailures = 0;
    on.time(reply.server_time - (sent + wire.now()) / 2);
    const steps: ServerMessage[] = [{ type: 'cells', from: reply.from, to: reply.to, cells: reply.cells ?? [] }];
    // The engine pushes its outbox again on every welcome, so it gets one per stretch of working polls, not one per poll.
    if (!pollUp) steps.unshift({ type: 'welcome', server_time: reply.server_time, head: reply.head });
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
      if (polling) poll();
      else open();
    },
    wake() {
      if (!running || live) return;
      failures = 0;
      open();
      if (polling) poll();
    },
  };
}
