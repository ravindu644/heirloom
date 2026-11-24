// The wire against a fake socket, a fake fetch and a clock that moves only when told.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { T0, fakeSockets, fakeTime, settle } from './fakes.ts';
import { PING_MS, POLL_MS, backoffMs, connect, smoothOffset } from './transport.ts';
import type { Fetch, Push, ServerMessage } from './transport.ts';

function rig(random = 1) {
  const time = fakeTime();
  const sockets = fakeSockets();
  const seen: (ServerMessage | 'down')[] = [];
  const samples: number[] = [];
  const posts: any[] = [];
  // What the engine would do when a message arrives, when a test needs it to do something.
  const react: { to?: (msg: ServerMessage) => void } = {};
  const hello = { token: 'tok', device: 'a1b2c3d4e5f60718', cursor: 0 };
  // Each POST waits here until the test answers it.
  const replies: ((reply: { status: number; body: object } | 'unreachable') => void)[] = [];
  const fetch: Fetch = (url, init) => {
    posts.push({ url, ...JSON.parse(init.body) });
    return new Promise((resolve, reject) => {
      replies.push((reply) =>
        reply === 'unreachable'
          ? reject(new TypeError('fetch failed'))
          : resolve({
              ok: reply.status === 200,
              status: reply.status,
              headers: { get: () => null },
              json: async () => reply.body,
            }),
      );
    });
  };
  const answer = async (reply: Parameters<(typeof replies)[number]>[0]) => {
    replies.shift()!(reply);
    await settle();
  };
  const transport = connect(
    { url: 'https://heirloom.test', now: time.now, schedule: time.schedule, random: () => random, WebSocket: sockets.FakeSocket, fetch },
    { hello: () => ({ ...hello }), message: (msg) => (seen.push(msg), react.to?.(msg)), down: () => seen.push('down'), time: (s) => samples.push(s) },
  );
  return { time, sockets, seen, samples, posts, hello, answer, transport, react };
}

// Opens the socket and gets it welcomed.
function welcomed(r: ReturnType<typeof rig>, head = 0) {
  r.transport.start();
  r.sockets.last().accept();
  r.sockets.last().say({ type: 'welcome', server_time: r.time.now(), head });
}

describe('backoff and offset arithmetic', () => {
  it('backoff doubles from 1 s to a 30 s cap, and jitter takes off up to half', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map((n) => backoffMs(n, 1)), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    assert.deepEqual([1, 2, 6].map((n) => backoffMs(n, 0)), [500, 1000, 15000]);
    assert.equal(backoffMs(3, 0.5), 3000);
  });

  it('the first sample is the offset, later ones move it a quarter of the way, a jump is taken whole', () => {
    assert.equal(smoothOffset(null, 140), 140);
    assert.equal(smoothOffset(140, 180), 150);
    assert.equal(smoothOffset(150, 110), 140);
    assert.equal(smoothOffset(140, 2140), 640);
    assert.equal(smoothOffset(140, 2141), 2141);
    assert.equal(smoothOffset(140, -3600000), -3600000);
  });
});

describe('the socket', () => {
  it('says hello first, with the token, the device, the cursor and its own time', () => {
    const r = rig();
    r.hello.cursor = 1042;
    r.transport.start();
    assert.equal(r.sockets.last().url, 'wss://heirloom.test/api/ws');
    r.sockets.last().accept();
    assert.deepEqual(r.sockets.last().sent, [
      { type: 'hello', token: 'tok', device: 'a1b2c3d4e5f60718', cursor: 1042, client_time: T0 },
    ]);
  });

  it('measures the offset from the welcome: server time minus the middle of the round trip', () => {
    const r = rig();
    r.transport.start();
    r.sockets.last().accept();
    r.time.jump(100);
    r.sockets.last().say({ type: 'welcome', server_time: T0 + 5050, head: 7 });
    assert.deepEqual(r.samples, [5000]);
    assert.deepEqual(r.seen, [{ type: 'welcome', server_time: T0 + 5050, head: 7 }]);
  });

  it('pings every 25 s and measures the offset from each pong', () => {
    const r = rig();
    welcomed(r);
    r.time.advance(PING_MS);
    assert.deepEqual(r.sockets.last().sent.at(-1), { type: 'ping', t: T0 + 25000 });
    r.time.jump(80);
    r.sockets.last().say({ type: 'pong', t: T0 + 25000, server_time: T0 + 25000 + 140 });
    assert.deepEqual(r.samples, [0, 100]);
    r.time.advance(PING_MS);
    assert.equal(r.sockets.last().sent.filter((m) => m.type === 'ping').length, 2);
    // A pong is the transport's business, not the engine's.
    assert.equal(r.seen.length, 1);
  });

  it('a ping with no pong by the next one means the socket is dead: down, then a new hello', () => {
    const r = rig();
    welcomed(r);
    r.time.advance(PING_MS);
    r.time.advance(PING_MS);
    assert.equal(r.sockets.all[0]!.closed, true);
    assert.equal(r.seen.at(-1), 'down');
    r.time.advance(1000);
    assert.equal(r.sockets.all.length, 2);
  });

  it('answers a ping from the server', () => {
    const r = rig();
    welcomed(r);
    r.sockets.last().say({ type: 'ping', t: 5 });
    assert.deepEqual(r.sockets.last().sent.at(-1), { type: 'pong', t: 5 });
  });

  it('passes on every other message, unknown types too, and drops what is not a message', () => {
    const r = rig();
    welcomed(r);
    r.sockets.last().say({ type: 'cells', from: 0, to: 1, cells: [] });
    r.sockets.last().say({ type: 'from-the-future', x: 1 });
    r.sockets.last().onmessage?.({ data: 'not json' });
    r.sockets.last().onmessage?.({ data: '[1,2]' });
    assert.deepEqual(r.seen.slice(1), [
      { type: 'cells', from: 0, to: 1, cells: [] },
      { type: 'from-the-future', x: 1 },
    ]);
  });

  it('reconnects after a drop with a growing wait, and each hello carries the cursor of that moment', () => {
    const r = rig();
    welcomed(r);
    r.hello.cursor = 9;
    r.sockets.last().fail();
    assert.equal(r.seen.at(-1), 'down');
    r.time.advance(999);
    assert.equal(r.sockets.all.length, 1);
    r.time.advance(1);
    assert.equal(r.sockets.all.length, 2);
    r.sockets.last().accept();
    assert.equal(r.sockets.last().sent[0].cursor, 9);
    // Refused before any welcome: the wait doubles, and the engine is not told "down" twice.
    r.sockets.last().fail();
    r.time.advance(1999);
    assert.equal(r.sockets.all.length, 2);
    r.time.advance(1);
    assert.equal(r.sockets.all.length, 3);
    assert.equal(r.seen.filter((m) => m === 'down').length, 1);
    // A welcome starts the count again.
    r.sockets.last().accept();
    r.sockets.last().say({ type: 'welcome', server_time: r.time.now(), head: 9 });
    r.sockets.last().fail();
    r.time.advance(1000);
    assert.equal(r.sockets.all.length, 4);
  });

  it('jitter spreads the reconnects', () => {
    const r = rig(0);
    welcomed(r);
    r.sockets.last().fail();
    r.time.advance(500);
    assert.equal(r.sockets.all.length, 2);
  });

  it('sends a push on the live socket', () => {
    const r = rig();
    welcomed(r);
    const push: Push = { type: 'push', batch: 'k3v9', cells: [] };
    r.transport.send(push);
    assert.deepEqual(r.sockets.last().sent.at(-1), push);
  });

  it('again() closes the socket and says hello from the current cursor, without waiting', () => {
    const r = rig();
    welcomed(r);
    r.hello.cursor = 3;
    r.transport.again();
    assert.equal(r.sockets.all[0]!.closed, true);
    assert.equal(r.sockets.all.length, 2);
    r.sockets.last().accept();
    assert.equal(r.sockets.last().sent[0].cursor, 3);
    // The old socket is disowned: nothing it says or does counts.
    r.sockets.all[0]!.say({ type: 'cells', from: 0, to: 9, cells: [] });
    r.sockets.all[0]!.fail();
    assert.equal(r.seen.length, 1);
  });

  it('wake() tries now instead of waiting out the backoff', () => {
    const r = rig();
    welcomed(r);
    r.sockets.last().fail();
    r.transport.wake();
    assert.equal(r.sockets.all.length, 2);
    // The wait that was running is cancelled, not left to open a third.
    r.time.advance(60000);
    assert.equal(r.sockets.all.length, 2);
  });

  it('bye with reason token: passed on, and no more reconnecting', () => {
    const r = rig();
    welcomed(r);
    r.sockets.last().say({ type: 'bye', reason: 'token' });
    assert.deepEqual(r.seen.at(-1), { type: 'bye', reason: 'token' });
    r.sockets.last().fail();
    r.time.advance(600000);
    assert.equal(r.sockets.all.length, 1);
  });

  it('stop() closes the socket and leaves no timer behind', () => {
    const r = rig();
    welcomed(r);
    r.transport.stop();
    assert.equal(r.sockets.last().closed, true);
    r.time.advance(600000);
    assert.equal(r.sockets.all.length, 1);
    assert.equal(r.sockets.last().sent.filter((m) => m.type === 'ping').length, 0);
  });
});

describe('without a socket', () => {
  // Three socket attempts in a row that never reach a welcome.
  function blocked(r: ReturnType<typeof rig>) {
    r.transport.start();
    r.sockets.last().fail();
    r.time.advance(1000);
    r.sockets.last().fail();
    r.time.advance(2000);
    r.sockets.last().fail();
  }

  it('after three failed sockets it POSTs /api/sync, and the reply becomes welcome, cells and ack', async () => {
    const r = rig();
    r.hello.cursor = 1042;
    r.transport.start();
    r.sockets.last().fail();
    r.time.advance(1000);
    r.sockets.last().fail();
    assert.equal(r.posts.length, 0);
    r.time.advance(2000);
    r.sockets.last().fail();
    assert.deepEqual(r.posts, [
      { url: 'https://heirloom.test/api/sync', token: 'tok', device: 'a1b2c3d4e5f60718', cursor: 1042, client_time: T0 + 3000 },
    ]);
    r.time.jump(200);
    const cell = { stamp: '2026-11-24T04:30:00.000Z-0000-b2c3d4e5f6071829', dataset: 'task', row: 't', field: 'title', value: 'x' };
    await r.answer({ status: 200, body: { server_time: T0 + 3100 + 40, head: 1043, from: 1042, to: 1043, cells: [cell] } });
    assert.deepEqual(r.samples, [40]);
    assert.deepEqual(r.seen, [
      { type: 'welcome', server_time: T0 + 3140, head: 1043 },
      { type: 'cells', from: 1042, to: 1043, cells: [cell] },
    ]);
  });

  it('a push rides the next POST, and its ack comes back after the cells', async () => {
    const r = rig();
    blocked(r);
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 0, from: 0, to: 0, cells: [] } });
    const push: Push = { type: 'push', batch: 'k3v9', cells: [] };
    r.transport.send(push);
    assert.deepEqual(r.posts.at(-1).push, { batch: 'k3v9', cells: [] });
    await r.answer({
      status: 200,
      body: { server_time: r.time.now(), head: 2, from: 0, to: 2, cells: [], ack: { batch: 'k3v9', from: 0, cursor: 2 } },
    });
    // One welcome for the whole stretch of working polls: the engine pushes its outbox again on each.
    assert.deepEqual(r.seen.map((m) => (m === 'down' ? m : m.type)), ['welcome', 'cells', 'cells', 'ack']);
    assert.deepEqual(r.seen.at(-1), { type: 'ack', batch: 'k3v9', from: 0, cursor: 2 });
  });

  it('a push sent in answer to the welcome is taken, and goes in the next POST with the cursor this reply left', async () => {
    const r = rig();
    blocked(r);
    r.react.to = (msg) => {
      if (msg.type === 'welcome') r.transport.send({ type: 'push', batch: 'first', cells: [] });
      if (msg.type === 'cells') r.hello.cursor = msg.to;
    };
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 4, from: 0, to: 4, cells: [] } });
    assert.equal(r.posts.length, 2);
    assert.deepEqual(r.posts[1].push, { batch: 'first', cells: [] });
    assert.equal(r.posts[1].cursor, 4);
  });

  it('a nack comes through the same way', async () => {
    const r = rig();
    blocked(r);
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 0, from: 0, to: 0, cells: [] } });
    r.transport.send({ type: 'push', batch: 'b', cells: [] });
    const nack = { batch: 'b', reason: 'clock', server_time: T0 };
    await r.answer({ status: 200, body: { server_time: T0, head: 0, from: 0, to: 0, cells: [], nack } });
    assert.deepEqual(r.seen.at(-1), { type: 'nack', ...nack });
  });

  it('asks again at once while there are more pages, then every few seconds', async () => {
    const r = rig();
    blocked(r);
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 900, from: 0, to: 500, cells: [] } });
    assert.equal(r.posts.length, 2);
    r.hello.cursor = 500;
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 900, from: 500, to: 900, cells: [] } });
    assert.equal(r.posts.length, 2);
    r.time.advance(POLL_MS - 1);
    assert.equal(r.posts.length, 2);
    r.time.advance(1);
    assert.equal(r.posts.length, 3);
  });

  it('a POST that fails means down, a backoff, and a fresh welcome when it works again', async () => {
    const r = rig();
    blocked(r);
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 0, from: 0, to: 0, cells: [] } });
    r.time.advance(POLL_MS);
    await r.answer('unreachable');
    assert.equal(r.seen.at(-1), 'down');
    const before = r.posts.length;
    r.time.advance(1000);
    assert.equal(r.posts.length, before + 1);
    await r.answer({ status: 502, body: {} });
    r.time.advance(2000);
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 0, from: 0, to: 0, cells: [] } });
    assert.deepEqual(r.seen.slice(-2).map((m) => (m === 'down' ? m : m.type)), ['welcome', 'cells']);
    assert.equal(r.seen.filter((m) => m === 'down').length, 1);
  });

  it('401 is the bye of this path: passed on as bye token, and everything stops', async () => {
    const r = rig();
    blocked(r);
    await r.answer({ status: 401, body: { error: 'token' } });
    assert.deepEqual(r.seen, [{ type: 'bye', reason: 'token' }]);
    const sockets = r.sockets.all.length;
    r.time.advance(600000);
    assert.equal(r.posts.length, 1);
    assert.equal(r.sockets.all.length, sockets);
  });

  it('goes back to the socket when one works, and a reply still in the air is dropped', async () => {
    const r = rig();
    blocked(r);
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 0, from: 0, to: 0, cells: [] } });
    r.time.advance(POLL_MS);
    assert.equal(r.posts.length, 2);
    // The socket has kept trying in the background (4 s after the third failure). This time it works.
    assert.equal(r.sockets.all.length, 4);
    r.sockets.last().accept();
    r.sockets.last().say({ type: 'welcome', server_time: r.time.now(), head: 0 });
    const seen = r.seen.length;
    await r.answer({ status: 200, body: { server_time: r.time.now(), head: 5, from: 0, to: 5, cells: [] } });
    assert.equal(r.seen.length, seen);
    r.time.advance(POLL_MS * 4);
    assert.equal(r.posts.length, 2);
    // And a push now goes down the socket.
    r.transport.send({ type: 'push', batch: 'b', cells: [] });
    assert.equal(r.sockets.last().sent.at(-1).batch, 'b');
  });
});
