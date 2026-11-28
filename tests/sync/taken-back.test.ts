// A lap stopped about 2 s in is a start taken back (protocol section 11): no row, on any device
// or on the server, whichever way it was stopped. Found in a person's data: a 0 s "stopped" lap
// counted on Progress as one of "2 laps, 1m". Each path a lap can end by gets its own test.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createFocus } from '../../client/src/sync/focus.ts';
import { createToday } from '../../client/src/sync/today.ts';
import { heldTaps } from '../../client/src/platform/notifier.ts';
import { account, converge, inStep, offline, online, serverRows, signedIn, sleep, startServer, stopAll, until } from './harness.ts';
import type { Device, Server } from './harness.ts';

let server: Server;
before(async () => {
  server = await startServer();
});
// A test that fails never reaches its own close, and an open bell watch keeps Node running.
const open: { close(): void }[] = [];
after(async () => {
  for (const o of open) o.close();
  await stopAll();
  await server.stop();
});

const schedule = (run: () => void, ms: number) => {
  const t = setTimeout(run, ms);
  return () => clearTimeout(t);
};
let runs = 0;
let names = 0;
const keep = <T extends { close(): void }>(o: T) => (open.push(o), o);
const focusOn = (d: Device) => keep(createFocus(d.engine, { utcOffsetMin: () => 0, runId: () => `run-${++runs}`, schedule }));
const SOON = 2000;

/** The rows Progress counts: work, not set aside. */
const counted = (rows: Iterable<Record<string, unknown>>) => [...rows].filter((r) => r.kind === 'work' && r.outcome !== 'void');

/** Nothing counted on any of these devices, nor on the server, once they are in step. */
async function noLap(name: string, devices: Device[]) {
  await converge(devices);
  for (const [i, d] of devices.entries()) assert.deepEqual(counted(d.engine.rows('session').value.values()), [], `device ${i} counts a lap taken back`);
  assert.deepEqual(counted((await serverRows(server, name, 'session')).values()), [], 'the server counts a lap taken back');
}

async function one(tag: string) {
  const name = `${tag}${++names}`;
  const d = await account(server, name);
  await until(() => inStep(d.engine), 5000, 'the device did not come up');
  return { name, d, focus: focusOn(d) };
}

async function two(tag: string) {
  const { name, d: a, focus: fa } = await one(tag);
  const b = await signedIn(server, name);
  const fb = focusOn(b);
  await converge([a, b]);
  return { name, a, b, fa, fb };
}

test('control: a lap stopped at 61 s is a lap, so the check below can see one', async () => {
  const { name, d, focus } = await one('tb_control');
  focus.start();
  d.skew.ms = 61000;
  focus.stop();
  await converge([d]);
  assert.equal(counted((await serverRows(server, name, 'session')).values()).length, 1);
});

test('Stop on Focus, 2 s in: no lap', async () => {
  const { name, d, focus } = await one('tb_stop');
  focus.start();
  await sleep(SOON);
  focus.stop();
  assert.equal(focus.lastStop.value?.counted, false, 'Focus says the stop left a lap');
  await noLap(name, [d]);
});

test('the running lap\'s task ticked done, 2 s in: the lap ends, and is no lap', async () => {
  const { name, d, focus } = await one('tb_done');
  let ids = 0;
  const today = keep(createToday(d.engine, { utcOffsetMin: () => 0, id: () => `t${++ids}`, schedule, focus }));
  const id = today.add('Stranger Things: S05E01')!;
  focus.skipBreak(id);
  assert.equal(d.engine.timer.value.task, id);
  await sleep(SOON);
  today.setDone(id, true);
  assert.equal(d.engine.timer.value.phase, 'idle', 'done did not end the lap');
  await noLap(name, [d]);
});

test('Stop on the laptop and the phone at once, 2 s in: no lap on either, nor on the server', async () => {
  const { name, a, b, fa, fb } = await two('tb_both');
  fa.start();
  await until(() => b.engine.timer.value.run === a.engine.timer.value.run, 5000, 'the phone never heard the lap');
  await sleep(SOON);
  fa.stop();
  fb.stop();
  await noLap(name, [a, b]);
});

test('Stop on the other device, 2 s in, the first only hearing of it: no lap', async () => {
  const { name, a, b, fa, fb } = await two('tb_other');
  fa.start();
  await until(() => b.engine.timer.value.run === a.engine.timer.value.run, 5000, 'the phone never heard the lap');
  await sleep(SOON);
  fb.stop();
  await noLap(name, [a, b]);
});

test('the countdown notification\'s Stop, 2 s in, through the page\'s held taps: no lap', async () => {
  const { name, d, focus } = await one('tb_shade');
  // As main.tsx wires ActionActivity's tap to the page.
  const taps = heldTaps(() => focus.state.peek().run, () => d.engine.sync.peek() === 'in-step', (act) => (act === 'stop' ? focus.stop() : assert.fail(act)));
  focus.start();
  await sleep(SOON);
  taps.tap('stop', focus.state.peek().run);
  assert.equal(d.engine.timer.value.phase, 'idle', 'the tap did not stop the lap');
  await noLap(name, [d]);
});

test('the notification\'s Stop for a lap the phone\'s page has not heard of yet: held, done when it hears, and no lap', async () => {
  const { name, a, b, fa, fb } = await two('tb_held');
  offline(b);
  fa.start();
  const run = a.engine.timer.value.run;
  // The phone's service drew the laptop's lap and its Stop was tapped while the page was behind.
  const taps = heldTaps(() => fb.state.peek().run, () => b.engine.sync.peek() === 'in-step', (act) => (act === 'stop' ? fb.stop() : assert.fail(act)));
  await sleep(SOON);
  taps.tap('stop', run);
  online(b);
  await until(() => (taps.look(), b.engine.timer.value.run === null && b.engine.timer.value.phase === 'idle' && inStep(b.engine)), 8000, 'the held Stop was never done');
  await noLap(name, [a, b]);
});

test('Stop made offline 2 s in, sent later: no lap', async () => {
  const { name, a, b, fa, fb } = await two('tb_offline');
  fa.start();
  await until(() => b.engine.timer.value.run === a.engine.timer.value.run, 5000, 'the phone never heard the lap');
  offline(a);
  await sleep(SOON);
  fa.stop();
  // A while later, back on the network.
  await sleep(500);
  online(a);
  await noLap(name, [a, b]);
});

test('a lap started and stopped 2 s in, all offline, sent later: no lap', async () => {
  const { name, a, b, fa, fb } = await two('tb_offline_all');
  offline(a);
  fa.start();
  await sleep(SOON);
  fa.stop();
  online(a);
  await noLap(name, [a, b]);
});

test('a new lap started over a running one 2 s in: the first is no lap', async () => {
  const { name, d, focus } = await one('tb_over_lap');
  focus.start();
  const first = d.engine.timer.value.run;
  await sleep(SOON);
  focus.skipBreak(null);
  assert.notEqual(d.engine.timer.value.run, first);
  await noLap(name, [d]);
});

test('Start (the break or the next lap Focus names) over a running lap 2 s in: the first is no lap', async () => {
  const { name, d, focus } = await one('tb_over_start');
  focus.start();
  const first = d.engine.timer.value.run;
  await sleep(SOON);
  focus.start();
  assert.notEqual(d.engine.timer.value.run, first);
  await noLap(name, [d]);
});

test('the other device starts a lap over this one\'s, 2 s in: this one\'s, closed as replaced, is no lap', async () => {
  const { name, a, b, fa, fb } = await two('tb_replaced');
  fa.start();
  await until(() => b.engine.timer.value.run === a.engine.timer.value.run, 5000, 'the phone never heard the lap');
  await sleep(SOON);
  fb.skipBreak(null);
  await until(() => a.engine.timer.value.run === b.engine.timer.value.run, 5000, 'the laptop never heard the new lap');
  await noLap(name, [a, b]);
});
