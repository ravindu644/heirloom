// A way back in (protocol section 10): the owner's three calls, the two for whoever holds the
// link, and the part that must not lose work. The test plays the server; see world.ts.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Cell } from '../core/merge.ts';
import { cellKey } from '../core/merge.ts';
import { T0 } from './fakes.ts';
import type { ResetView } from './resets.ts';
import { LAP, MIN, world } from './world.ts';

const DAY = 24 * 60 * MIN;
const SERVER = 'https://heirloom.test';
const open = (username: string, created: number): ResetView => ({ username, created, expires: created + DAY });
const refusal = (status: number, error: string, retryAfter?: string) => ({ status, body: { error }, ...(retryAfter && { retryAfter }) });
type Device = Awaited<ReturnType<ReturnType<typeof world>['device']>>;

// The owner's device, and a server that has these accounts and these resets open.
async function owner(held: ResetView[] = [], names = ['sam', 'dilu']) {
  const w = world();
  const d = await w.device('laptop');
  await d.connect('owner');
  let made = 0;
  w.server.reply = (path, body) => {
    if (path === '/api/resets/list') return { status: 200, body: { resets: held } };
    if (path !== '/api/resets/create' && path !== '/api/resets/revoke') return { status: 200, body: {} };
    if (body.username === 'ravi' && path === '/api/resets/create') return refusal(400, 'bad_request');
    if (!names.includes(body.username) && body.username !== 'ravi') return refusal(404, 'unknown');
    const at = held.findIndex((it) => it.username === body.username);
    if (at >= 0) held.splice(at, 1);
    if (path === '/api/resets/revoke') return { status: 200, body: {} };
    const reset = { ...open(body.username, w.time.now()), reset: `link${++made}` };
    held.push(open(body.username, w.time.now()));
    return { status: 200, body: { reset } };
  };
  // Read through a function: an assert on a signal's value narrows it for the rest of the test.
  const list = () => d.resets.open.value;
  return { w, d, resets: d.resets, list, held, asked: () => w.server.requests.map((request) => request.path.replace('/api/resets/', '')) };
}

describe('the owner\'s resets', () => {
  it('nothing is known until the server has answered once; then the open ones, oldest first, and never a link', async () => {
    const o = await owner([open('sam', T0 - 60 * MIN), open('dilu', T0 - 120 * MIN), { username: 7 } as never, null as never]);
    assert.equal(o.list(), null);
    await o.resets.refresh();
    assert.deepEqual(o.list(), [open('dilu', T0 - 120 * MIN), open('sam', T0 - 60 * MIN)]);
    assert.deepEqual(o.w.server.requests, [{ path: '/api/resets/list', body: { token: 'token-laptop', device: o.d.engine.device }, from: 'laptop' }]);
  });

  it('create gives the link once, with when it runs out, and the list has the reset at once: asked by the name as the server holds it', async () => {
    const o = await owner([open('dilu', T0 - 60 * MIN)]);
    await o.resets.refresh();
    const made = await o.resets.create('  Sam ');
    assert.deepEqual(made, { ok: true, reset: { username: 'sam', created: T0, expires: T0 + DAY, reset: 'link1', link: `${SERVER}/#/reset/link1` } });
    assert.deepEqual(o.w.server.requests.at(-1), { path: '/api/resets/create', body: { username: 'sam', token: 'token-laptop', device: o.d.engine.device }, from: 'laptop' });
    assert.deepEqual(o.list(), [open('dilu', T0 - 60 * MIN), open('sam', T0)]);
    assert.deepEqual(o.asked(), ['list', 'create'], 'the list was not asked for again');
    assert.equal(JSON.stringify(o.list()).includes('link1'), false, 'the list never holds the link');
    // A second one for the same name: a new link, and one entry, the newer.
    o.w.time.advance(MIN);
    const again = await o.resets.create('sam');
    assert.equal(again.ok && again.reset.reset, 'link2');
    assert.deepEqual(o.list(), [open('dilu', T0 - 60 * MIN), open('sam', T0 + MIN)]);
  });

  it('revoke takes it out of the list at once; none open for that name is fine too', async () => {
    const o = await owner([open('sam', T0 - 60 * MIN), open('dilu', T0)]);
    await o.resets.refresh();
    assert.deepEqual(await o.resets.revoke(' SAM'), { ok: true });
    assert.deepEqual(o.w.server.requests.at(-1)!.body, { username: 'sam', token: 'token-laptop', device: o.d.engine.device });
    assert.deepEqual(o.list(), [open('dilu', T0)]);
    assert.deepEqual(await o.resets.revoke('sam'), { ok: true });
    assert.deepEqual(o.list(), [open('dilu', T0)]);
  });

  it('a call that fails changes nothing and says why: a name the server does not have, the owner named, not the owner, the server\'s wait, no connection', async () => {
    const o = await owner([open('sam', T0)]);
    await o.resets.refresh();
    const before = o.list();
    assert.deepEqual(await o.resets.create('nobody'), { ok: false, error: 'unknown' });
    assert.deepEqual(await o.resets.revoke('nobody'), { ok: false, error: 'unknown' });
    assert.deepEqual(await o.resets.create('ravi'), { ok: false, error: 'bad_request' });
    o.w.server.reply = () => refusal(403, 'forbidden');
    assert.deepEqual(await o.resets.create('sam'), { ok: false, error: 'forbidden' });
    assert.deepEqual(await o.resets.revoke('sam'), { ok: false, error: 'forbidden' });
    o.w.server.reply = () => refusal(429, 'slow_down', '30');
    assert.deepEqual(await o.resets.create('sam'), { ok: false, error: 'slow_down', retry_after: 30 });
    o.w.server.reply = () => 'unreachable';
    assert.deepEqual(await o.resets.create('sam'), { ok: false, error: 'offline' });
    assert.deepEqual(await o.resets.revoke('sam'), { ok: false, error: 'offline' });
    await o.resets.refresh();
    // A 200 that carries no link is not a success.
    o.w.server.reply = () => ({ status: 200, body: { reset: open('sam', T0) } });
    assert.deepEqual(await o.resets.create('sam'), { ok: false, error: 'server' });
    assert.equal(o.list(), before);
  });

  it('before the list has been heard, a create does not pass one reset off as the whole list', async () => {
    const o = await owner([open('dilu', T0 - 60 * MIN)]);
    assert.equal((await o.resets.create('sam')).ok, true);
    assert.equal(o.list(), null);
    await o.resets.refresh();
    assert.deepEqual(o.list(), [open('dilu', T0 - 60 * MIN), open('sam', T0)]);
  });

  it('each account has its own: the next to sign in here is not shown the last one\'s list, not even by an answer on its way', async () => {
    const o = await owner([open('sam', T0)]);
    await o.resets.refresh();
    let answer = (_: { status: number; body: object }) => {};
    o.w.server.reply = () => new Promise((resolve) => (answer = resolve));
    const late = o.resets.refresh();
    await o.d.engine.signIn('sachi', 'another horse');
    assert.equal(o.list(), null);
    answer({ status: 200, body: { resets: [open('sam', T0)] } });
    await late;
    assert.equal(o.list(), null);
  });
});

// A device with nobody signed in, as the one that opens the link is.
async function signedOut(w: ReturnType<typeof world>, name: string) {
  const d = await w.device(name);
  assert.deepEqual(await d.engine.signOut(), { ok: true });
  return d;
}

describe('whoever holds the link', () => {
  it('look says whose password it sets, asked with no token; a link that is not good is `reset` and no more', async () => {
    const w = world();
    const d = await signedOut(w, 'phone');
    w.server.reply = (path, body) => (path === '/api/reset/look' && body.reset === 'q7Xk' ? { status: 200, body: { username: 'sam' } } : refusal(403, 'reset'));
    assert.deepEqual(await d.resets.look('q7Xk'), { ok: true, username: 'sam' });
    assert.deepEqual(w.server.requests, [{ path: '/api/reset/look', body: { reset: 'q7Xk' }, from: 'phone' }], 'the link and nothing else: no token, no device');
    assert.deepEqual(await d.resets.look('used-up'), { ok: false, error: 'reset' });
    w.server.reply = () => 'unreachable';
    assert.deepEqual(await d.resets.look('q7Xk'), { ok: false, error: 'offline' });
    w.server.reply = () => refusal(429, 'slow_down', '12');
    assert.deepEqual(await d.resets.look('q7Xk'), { ok: false, error: 'slow_down', retry_after: 12 });
    // A 200 that names nobody is not an answer.
    w.server.reply = () => ({ status: 200, body: {} });
    assert.deepEqual(await d.resets.look('q7Xk'), { ok: false, error: 'server' });
    assert.equal(d.engine.account.value, null);
  });

  it('use sets the password and signs this device in as a sign in does; a link that is not good, or used once already, leaves it signed out', async () => {
    const w = world();
    const d = await signedOut(w, 'phone');
    w.server.resets.set('q7Xk', 'sam');
    assert.deepEqual(await d.resets.use('not-a-link', 'a new password'), { ok: false, error: 'reset' });
    assert.equal(d.engine.account.value, null);
    assert.deepEqual(await d.resets.use('q7Xk', 'a new password'), { ok: true });
    assert.deepEqual(d.engine.account.value, { account: 'acct-sam', username: 'sam' });
    assert.equal(d.engine.sync.value, 'syncing');
    await d.connect();
    assert.equal(d.engine.sync.value, 'in-step');
    assert.deepEqual(d.wire().handlers.hello().token, 'token-phone');
    // Used up: the same link signs nobody in a second time.
    await d.engine.signOut();
    assert.deepEqual(await d.resets.use('q7Xk', 'another password'), { ok: false, error: 'reset' });
    assert.equal(d.engine.account.value, null);
  });
});

describe('a reset is not a way to lose a lap', () => {
  // Welcomes the device and acks whatever it pushes, keeping every cell that was pushed.
  async function comeBack(d: Device, pushed: Cell[]) {
    d.online = true;
    d.wire().handlers.message({ type: 'welcome', server_time: 0, head: d.wire().handlers.hello().cursor });
    for (;;) {
      await d.engine.saved();
      const push = d.wire().sent.shift();
      if (!push) return;
      pushed.push(...push.cells);
      const from = d.wire().handlers.hello().cursor;
      d.wire().handlers.message({ type: 'ack', batch: push.batch, from, cursor: from + push.cells.length });
    }
  }

  it('the link is used on one device while another is offline with two unsent edits and a running lap: it comes back, is refused, signs in with the new password, and the edits and the lap\'s row go to the server once, the same on both', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    const task = a.today.add('pointers ~2')!;
    await a.settle();
    w.exchange(a, b);
    // B starts a lap, and then has no network. Two edits there, unsent.
    b.focus.start(task);
    await b.settle();
    w.exchange(a, b);
    b.disconnect();
    w.time.advance(5 * MIN);
    b.today.edit(task, { title: 'pointers, chapter 3' });
    const second = b.today.add('arrays')!;
    await b.engine.saved();
    const unsentThere = b.engine.unsent.value;
    assert.ok(unsentThere >= 2);

    // The reset is used on A. The server signs every other device of the account out.
    w.server.resets.set('q7Xk', 'ravi');
    assert.deepEqual(await a.resets.use('q7Xk', 'a new password'), { ok: true });
    await a.connect();

    // B is back on the network: its token is dead, and the server says so.
    const refusedWire = b.wire();
    refusedWire.handlers.message({ type: 'bye', reason: 'token' });
    assert.equal(b.engine.sync.value, 'signed-out');
    assert.equal(b.engine.account.value?.username, 'ravi', 'the data is still theirs');
    assert.equal(b.engine.unsent.value, unsentThere);
    assert.deepEqual(refusedWire.sent, [], 'nothing went out on the refused connection');
    assert.deepEqual(await b.engine.signOut(), { ok: false, error: 'unsent' }, 'and signing out with it unsent is refused');
    // The lap runs on and rings while B is signed out: its own lap, so it writes the row. Kept, with the rest.
    w.time.advance(LAP);
    assert.equal(b.session('run-1')?.outcome, 'rang');
    await b.engine.saved();
    // The app is closed and opened again before the person has the new password: still there.
    const again = await w.restart(b, { online: false });
    again.wire().handlers.message({ type: 'bye', reason: 'token' });
    assert.equal(again.today.list.value.some((t) => t.title === 'pointers, chapter 3'), true);
    const waiting = again.engine.unsent.value;
    assert.ok(waiting > unsentThere);

    // Signed in again as the same account, with the new password: everything is sent, each cell once.
    assert.deepEqual(await again.engine.signIn('ravi', 'a new password'), { ok: true });
    assert.equal(again.engine.unsent.value, waiting);
    const pushed: Cell[] = [];
    await comeBack(again, pushed);
    const keys = pushed.map(cellKey);
    assert.equal(new Set(keys).size, keys.length, 'no cell twice');
    assert.equal(keys.length, waiting);
    for (const key of [`task/${task}/title`, `task/${second}/title`, 'session/run-1/outcome', 'session/run-1/ended']) assert.ok(keys.includes(key), key);
    assert.equal(again.engine.unsent.value, 0);
    assert.equal(again.engine.sync.value, 'in-step');
    // And what the server now has reaches A: the same on both.
    a.receive(pushed);
    again.receive(a.engine.cells());
    assert.deepEqual(w.sorted(a.engine), w.sorted(again.engine));
    assert.equal(a.today.list.value.find((t) => t.id === task)?.title, 'pointers, chapter 3');
    assert.equal(a.session('run-1')?.outcome, 'rang');
    // Nothing is sent a second time at the next connection.
    again.disconnect();
    const more: Cell[] = [];
    await comeBack(again, more);
    assert.deepEqual(more, []);
  });

  it('the refused device signs in as someone else first: none of the first account\'s unsent work goes out under the second, and it is sent, once, when the first signs in again', async () => {
    const w = world();
    const d = await w.device('b');
    d.disconnect();
    const mine = d.today.add('ravi\'s, unsent')!;
    await d.engine.saved();
    const waiting = d.engine.unsent.value;
    d.wire().handlers.message({ type: 'bye', reason: 'token' });
    // Someone else signs in on this device.
    assert.deepEqual(await d.engine.signIn('sachi', 'another horse'), { ok: true });
    assert.equal(d.engine.account.value?.account, 'acct-sachi');
    assert.deepEqual(d.engine.cells(), [], 'another account, another database');
    assert.equal(d.engine.unsent.value, 0);
    const others: Cell[] = [];
    await comeBack(d, others);
    assert.deepEqual(others, []);
    d.engine.write('task', 'hers', { title: 'sachi\'s' });
    await comeBack(d, others);
    assert.deepEqual(others.map(cellKey), ['task/hers/title']);
    // The first account again, by a reset this time: its work is where it was left, and goes now.
    await d.engine.signOut();
    w.server.resets.set('q7Xk', 'ravi');
    assert.deepEqual(await d.engine.resetUse('q7Xk', 'a new password'), { ok: true });
    assert.equal(d.engine.account.value?.account, 'acct');
    assert.equal(d.engine.unsent.value, waiting);
    const sent: Cell[] = [];
    await comeBack(d, sent);
    assert.equal(sent.length, waiting);
    assert.ok(sent.some((cell) => cell.row === mine && cell.field === 'title'));
    assert.equal(sent.some((cell) => cell.row === 'hers'), false);
    assert.equal(d.engine.unsent.value, 0);
  });

  it('a link used on a device where another account is signed in is a sign in over it: that account\'s unsent work stays in its own database, and is not sent under the new one', async () => {
    const w = world();
    const d = await w.device('b');
    d.disconnect();
    d.today.add('ravi\'s, unsent');
    await d.engine.saved();
    const waiting = d.engine.unsent.value;
    w.server.resets.set('q7Xk', 'sam');
    assert.deepEqual(await d.resets.use('q7Xk', 'a new password'), { ok: true });
    assert.equal(d.engine.account.value?.username, 'sam');
    const sent: Cell[] = [];
    await comeBack(d, sent);
    assert.deepEqual(sent, []);
    assert.equal((await (await d.stores('heirloom-acct')).load()).outbox.length, waiting, 'ravi\'s edits wait in ravi\'s database');
  });
});
