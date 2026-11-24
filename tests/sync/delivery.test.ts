// What the review of section 0 asked for: nothing skipped while catching up, nothing sent twice or
// lost across a restart or a sign out, and no account seeing another's cells.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { account, converge, inStep, offline, online, restart, serverHolds, signedIn, sleep, startServer, stopAll, table, until } from './harness.ts';
import type { Device, Server } from './harness.ts';

let server: Server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await stopAll();
  await server.stop();
});

const stop = (...devices: Device[]) => Promise.all(devices.map((d) => d.engine.stop()));

// B comes back far behind with work of its own while A keeps writing, so B's push is acked with a
// `from` past the cursor it has reached. If B took that ack's cursor it would step over A's cells.
async function farBehind(t: { diagnostic(s: string): void }, name: string, comeBack: (b: Device) => void) {
  const a = await account(server, name);
  const b = await signedIn(server, name);
  await converge([a, b]);
  offline(b);
  for (let i = 0; i < 20; i++) b.engine.write('task', `b-${i}`, { title: `offline on B ${i}` });
  for (let i = 0; i < 1200; i++) a.engine.write('task', `a-${i}`, { title: `before ${i}` });
  await until(() => inStep(a.engine), 15000, 'A did not send its backlog');

  const mark = b.net.frames.length;
  comeBack(b);
  // A keeps writing while B catches up and pushes.
  for (let i = 0; i < 30; i++) {
    for (let j = 0; j < 20; j++) a.engine.write('task', `live-${i}-${j}`, { title: `during ${i}` });
    await sleep(10);
  }
  await converge([a, b], 20000);
  assert.deepEqual(table(b.engine.cells()), await serverHolds(server, name));
  assert.equal(b.engine.rows('task').value.size, 20 + 1200 + 600);

  // Did the race this test is for happen? An ack whose `from` is not the newest number B had seen.
  let seen = 0;
  let raced = 0;
  for (const { msg } of b.net.frames.slice(mark)) {
    // A POST reply's cells are applied before its ack, as frames on a socket would be.
    if (msg.type === 'cells' || msg.type === 'reply') seen = Math.max(seen, msg.to);
    const ack = msg.type === 'ack' ? msg : msg.type === 'reply' ? msg.ack : null;
    if (ack) raced += Number(ack.from !== seen);
  }
  t.diagnostic(`acks whose from was not B's cursor: ${raced}`);
  await stop(a, b);
  return b;
}

test('a device far behind pushes while A keeps writing, over the socket: none of A\'s cells skipped', async (t) => {
  const b = await farBehind(t, 'behind_ws', online);
  assert.ok(b.net.frames.some((f) => f.msg.type === 'push'), 'B never pushed over the socket');
});

test('the same over POST, with the socket refused', async (t) => {
  const b = await farBehind(t, 'behind_post', (d) => d.net.noSocket());
  const posts = b.net.frames.filter((f) => f.msg.type === 'post');
  assert.ok(posts.some((f) => f.msg.push?.cells.length), 'B never pushed over POST');
});

test('a device restarted from its disk with unsent edits sends them, once', async () => {
  const a = await account(server, 'restart');
  let b = await signedIn(server, 'restart');
  await converge([a, b]);
  offline(b);
  b.engine.write('task', 'kept', { title: 'Written before the restart', order: 'm' });
  b.engine.write('checkin', 'kept-checkin', { habit: 'read', day: '2026-11-24' });
  b = await restart(server, b);
  assert.equal(b.engine.unsent.value, 4, 'the restarted device lost its outbox');
  online(b);
  await converge([a, b]);
  assert.deepEqual(table(a.engine.cells()), await serverHolds(server, 'restart'));

  const pushed = () =>
    b.net.frames.filter((f) => f.msg.type === 'push').flatMap((f) => f.msg.cells.map((c: any) => `${c.dataset}/${c.row}/${c.field}`)).sort();
  assert.deepEqual(pushed(), ['checkin/kept-checkin/day', 'checkin/kept-checkin/habit', 'task/kept/order', 'task/kept/title']);

  // Started again with everything sent: nothing goes out a second time.
  b = await restart(server, b);
  assert.equal(b.engine.unsent.value, 0);
  await until(() => inStep(b.engine), 5000, 'B did not reconnect');
  await sleep(200);
  assert.equal(pushed().length, 4);
  await stop(a, b);
});

test('sign out is refused while offline with unsent work, and allowed once it is sent', async () => {
  const a = await account(server, 'signout');
  offline(a);
  a.engine.write('session', 'last-lap', { kind: 'work', outcome: 'rang' });
  assert.deepEqual(await a.engine.signOut(), { ok: false, error: 'unsent' });
  assert.equal(a.engine.account.value?.username, 'signout');
  assert.equal(a.engine.rows('session').value.get('last-lap')?.outcome, 'rang');

  online(a);
  await until(() => inStep(a.engine), 5000, 'A did not send its lap');
  assert.deepEqual(await a.engine.signOut(), { ok: true });
  assert.equal(a.engine.account.value, null);
  assert.ok((await serverHolds(server, 'signout')).some((line) => line.startsWith('session/last-lap/outcome')));
  await stop(a);
});

test('two accounts on one server never see each other\'s cells', async () => {
  const x = [await account(server, 'iso_x')];
  x.push(await signedIn(server, 'iso_x'));
  const y = [await account(server, 'iso_y')];
  y.push(await signedIn(server, 'iso_y'));
  // The same rows and fields in both accounts, so only the account keeps them apart.
  for (const [who, devices] of [['x', x], ['y', y]] as const) {
    devices.forEach((d, i) => d.engine.write('task', 'shared-id', { [`f${i}`]: `${who}${i}` }));
    devices[0]!.engine.write('timer', 'current', { state: who });
  }
  await converge(x);
  await converge(y);
  for (const [who, devices, name] of [['x', x, 'iso_x'], ['y', y, 'iso_y']] as const) {
    const held = await serverHolds(server, name);
    for (const d of devices) {
      assert.deepEqual(table(d.engine.cells()), held);
      for (const cell of d.engine.cells()) assert.match(String(cell.value), new RegExp(`^${who}`));
    }
  }
  await stop(...x, ...y);
});
