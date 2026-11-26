// Rooms (protocol section 15): the client's Rooms on real engines against the real server. The
// server's own tests cover its side; these prove the two sides agree, and that privacy holds.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { localDay } from '../../client/src/core/stats.ts';
import type { RoomMessage } from '../../client/src/sync/engine.ts';
import { createFocus } from '../../client/src/sync/focus.ts';
import { createRooms } from '../../client/src/sync/rooms.ts';
import type { MemberView } from '../../client/src/sync/rooms.ts';
import { account, device, inStep, offline, online, restart, signedIn, sleep, startServer, stopAll, until } from './harness.ts';
import type { Device, Server } from './harness.ts';

let server: Server;
before(async () => {
  server = await startServer();
});
after(async () => {
  await stopAll();
  await server.stop();
});

const schedule = (run: () => void, ms: number) => {
  const t = setTimeout(run, ms);
  return () => clearTimeout(t);
};
let runs = 0;

// One person's device with what the app puts on it, and everything it heard about rooms.
async function wire(d: Device, utcOffsetMin = 0, connected = true) {
  const heard: RoomMessage[] = [];
  d.engine.onRoom((msg) => void heard.push(structuredClone(msg)));
  const focus = createFocus(d.engine, { utcOffsetMin: () => utcOffsetMin, runId: () => `run-${++runs}`, schedule });
  const rooms = createRooms(d.engine, { schedule });
  if (connected) await until(() => inStep(d.engine), 5000, 'the device did not come up');
  return { d, focus, rooms, heard, id: d.engine.account.value!.account, name: d.engine.account.value!.username };
}
type Person = Awaited<ReturnType<typeof wire>>;

let names = 0;
const person = async (tag: string, utcOffsetMin = 0) => wire(await account(server, `${tag}${++names}`, { utcOffsetMin }), utcOffsetMin);
const close = (...people: Person[]) => people.forEach((p) => (p.focus.close(), p.rooms.close()));

// The room as `p` sees it, and one member of it.
const roomOf = (p: Person, room: string) => p.rooms.list.value.find((r) => r.id === room);
const seen = (p: Person, room: string, of: Person): MemberView | undefined => roomOf(p, room)?.members.find((m) => m.id === of.id);

// A room made by the first, joined by code by the rest.
async function together(first: Person, ...rest: Person[]) {
  const made = await first.rooms.create('study hall');
  assert.equal(made.ok, true);
  const room = (made as { room: string }).room;
  await until(() => !!roomOf(first, room)?.code, 2000, 'the maker never got the room message');
  const code = roomOf(first, room)!.code;
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  for (const p of rest) assert.deepEqual(await p.rooms.join(code.toLowerCase()), { ok: true, room });
  const all = [first, ...rest];
  await until(() => all.every((p) => all.every((q) => !!seen(p, room, q))), 2000, 'not every member sees every member');
  return { room, code };
}

// How long until `ok` holds on every one of `people`, in ms. Fails past a second.
const within = (what: string, people: Person[], ok: (p: Person) => boolean, ms = 1000) =>
  until(() => people.every(ok), ms, `${what}: not seen within ${ms} ms`);

const shortLaps = async (p: Person, work_ms = 3000) => {
  p.d.engine.write('settings', 'current', { work_ms, short_ms: 60000 });
  await until(() => inStep(p.d.engine), 2000, 'settings not sent');
};

test('presence: a lap, a pause, a resume and a stop show on the other two within a second; a bell by time alone turns them idle', async (t) => {
  const [a, b, c] = [await person('pa'), await person('pb'), await person('pc')];
  const { room } = await together(a, b, c);
  const others = [b, c];

  a.focus.start();
  const endsAt = a.focus.view().ends_at;
  let ms = await within('start', others, (p) => seen(p, room, a)?.phase === 'work' && seen(p, room, a)?.ends_at === endsAt);
  t.diagnostic(`start: ${ms.toFixed(0)} ms`);
  for (const p of others) assert.equal(seen(p, room, a)?.lap, 1);

  a.focus.pause();
  ms = await within('pause', others, (p) => seen(p, room, a)?.paused === true && seen(p, room, a)?.ends_at === null);
  t.diagnostic(`pause: ${ms.toFixed(0)} ms`);
  a.focus.resume();
  const resumedEnd = a.focus.view().ends_at;
  ms = await within('resume', others, (p) => seen(p, room, a)?.paused === false && seen(p, room, a)?.ends_at === resumedEnd);
  t.diagnostic(`resume: ${ms.toFixed(0)} ms`);
  a.focus.stop();
  ms = await within('stop', others, (p) => seen(p, room, a)?.phase === 'idle');
  t.diagnostic(`stop: ${ms.toFixed(0)} ms`);

  // A short lap, and A drops off the network before its bell: nobody pushes anything at the bell.
  await shortLaps(a);
  a.focus.start();
  const bell = a.focus.view().ends_at!;
  await within('short lap', others, (p) => seen(p, room, a)?.ends_at === bell);
  offline(a.d);
  const quiet = others.map((p) => p.heard.length);
  await within('the bell', others, (p) => seen(p, room, a)?.phase === 'idle', bell - a.d.engine.now() + 300);
  const late = Date.now() - (bell - (a.d.engine.now() - Date.now()));
  t.diagnostic(`idle on the others ${late} ms after the bell, with ${others.map((p, i) => p.heard.length - quiet[i]!).join(' and ')} new room messages`);
  for (const p of others) assert.equal(seen(p, room, a)?.ends_at, null);
  close(a, b, c);
});

test('totals: laps rung by each show in the others\' view and the room\'s week is the sum; a member at another UTC offset counts their own day', async () => {
  const [a, b] = [await person('ta'), await person('tb')];
  // C's local time is 01:00: midnight was an hour ago there.
  const now = Date.now();
  const offsetMin = ((((Math.round((3600000 - (now % 86400000)) / 60000) % 1440) + 1440 + 720) % 1440) - 720);
  const c = await person('tc', offsetMin);
  const { room } = await together(a, b, c);

  await shortLaps(a);
  await shortLaps(b);
  a.focus.start();
  b.focus.start();
  await until(() => a.focus.view().over && b.focus.view().over, 6000, 'the laps did not ring');
  // B runs a second lap.
  b.focus.skipBreak();
  await until(() => b.focus.view().over, 6000, 'B\'s second lap did not ring');

  // C's two laps of 25 minutes: one that ended 10 minutes ago (today where C is), one that ended
  // 90 minutes ago (yesterday where C is, whatever day it is in UTC).
  const lap = 1500000;
  for (const [id, ago] of [['c-today', 10], ['c-yesterday', 90]] as const) {
    const ended = c.d.engine.now() - ago * 60000;
    c.d.engine.write('session', id, { kind: 'work', task: null, started: ended - lap, ended, planned_ms: lap, paused_ms: 0, outcome: 'rang', device: c.d.engine.device });
  }
  const cDay = (ms: number) => localDay(ms, offsetMin);
  const monday = (day: string) => {
    const d = new Date(`${day}T00:00:00Z`);
    return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  };
  const today = cDay(c.d.engine.now());
  const yesterdayEnded = c.d.engine.now() - 90 * 60000;
  const cWeek = lap + (monday(cDay(yesterdayEnded)) === monday(today) ? lap : 0);
  assert.notEqual(cDay(yesterdayEnded), today, 'the test\'s own setup: that lap must be yesterday where C is');

  const expected = new Map([
    [a.id, { today_ms: 3000, today_laps: 1, week_ms: 3000 }],
    [b.id, { today_ms: 6000, today_laps: 2, week_ms: 6000 }],
    [c.id, { today_ms: lap, today_laps: 1, week_ms: cWeek }],
  ]);
  // By member id: the members come in the live order, which is not what this is about.
  const byId = <T>(list: [string, T][]) => list.sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  const totals = (p: Person) => byId(roomOf(p, room)?.members.map((m) => [m.id, { today_ms: m.today_ms, today_laps: m.today_laps, week_ms: m.week_ms }] as [string, object]) ?? []);
  await until(
    () => [a, b, c].every((p) => JSON.stringify(totals(p)) === JSON.stringify(byId([...expected]))),
    5000,
    () => `totals never matched:\n  expected ${JSON.stringify(byId([...expected]))}\n${[a, b, c].map((p) => `  ${p.name} saw ${JSON.stringify(totals(p))}`).join('\n')}`,
  );
  for (const p of [a, b, c]) assert.equal(roomOf(p, room)?.week_ms, 3000 + 6000 + cWeek);
  close(a, b, c);
});

test('privacy: a task title only while its owner shares it, gone from the very next message; a hidden member is away and still counts', async () => {
  const [a, b, c] = [await person('va'), await person('vb'), await person('vc')];
  const { room } = await together(a, b, c);
  a.d.engine.write('task', 'thesis', { title: 'secret thesis chapter' });

  // Not shared by default: a lap on the task shows no title.
  a.focus.start('thesis');
  await within('lap', [b], (p) => seen(p, room, a)?.phase === 'work');
  await sleep(300);
  assert.equal(seen(b, room, a)?.task, null);
  assert.ok(!JSON.stringify(b.heard).includes('secret thesis'), 'the title reached B while not shared');

  a.rooms.setShareTask(true);
  await within('sharing on', [b, c], (p) => seen(p, room, a)?.task === 'secret thesis chapter');
  const mark = b.heard.length;
  a.rooms.setShareTask(false);
  await until(() => b.heard.length > mark, 1000, 'no message after sharing went off');
  const next = b.heard[mark] as { room?: string; members?: { id: string; task: unknown }[] };
  assert.equal(next.room, room);
  assert.equal(next.members?.find((m) => m.id === a.id)?.task, null, 'the very next message still carried the title');
  await sleep(500);
  assert.ok(!JSON.stringify(b.heard.slice(mark)).includes('secret thesis'), 'the title came back after sharing went off');

  // C hides rooms, then runs a lap that rings: away to the others, and the lap still counts.
  c.rooms.setHidden(true);
  await within('hidden', [a, b], (p) => seen(p, room, c)?.away === true);
  await shortLaps(c);
  c.focus.start();
  await until(() => c.focus.view().over, 6000, 'C\'s lap did not ring');
  await within('a hidden member\'s lap counts', [a, b], (p) => seen(p, room, c)?.today_laps === 1, 3000);
  for (const p of [a, b]) {
    const m = seen(p, room, c)!;
    assert.deepEqual([m.away, m.phase, m.task, m.last, m.ends_at], [true, 'idle', null, null, null]);
    assert.equal(m.today_ms, 3000);
  }
  for (const msg of [...a.heard, ...b.heard].slice(-6)) {
    const raw = (msg as { members?: { id: string; away: boolean; phase: string; task: unknown; last: unknown }[] }).members?.find((m) => m.id === c.id);
    if (raw?.away) assert.deepEqual([raw.phase, raw.task, raw.last], ['idle', null, null], 'the server sent a hidden member\'s doings');
  }
  close(a, b, c);
});

test('privacy: an account outside the room hears nothing of it, cannot join without the code, cannot cheer, and cannot tell it exists', async () => {
  const [a, b] = [await person('oa'), await person('ob')];
  const d = await person('od');
  const { room, code } = await together(a, b);
  await shortLaps(a);
  a.focus.start();
  await until(() => !!seen(b, room, a)?.last || a.focus.view().over, 6000, 'A\'s lap did not ring');

  // What an outsider gets for the real room is what it gets for one that does not exist.
  const ask = (path: string, body: object) => d.d.engine.request(path, body);
  const fake = 'r_doesnotexist';
  const wrong = code.replace(/./, (ch) => (ch === 'A' ? 'B' : 'A'));
  assert.deepEqual(await ask('/api/rooms/join', { code: wrong }), { ok: false, error: 'code' });
  for (const [path, extra] of [['/api/rooms/update', { name: 'mine now' }], ['/api/rooms/leave', {}], ['/api/rooms/cheer', { to: a.id, run: 'run-1' }]] as const) {
    const real = await ask(path, { room, ...extra });
    const none = await ask(path, { room: fake, ...extra });
    assert.deepEqual(real, none, `${path} tells the real room from a made-up one`);
    assert.deepEqual(real, { ok: false, error: 'room' });
  }
  await sleep(500);
  assert.deepEqual(d.heard.filter((m) => m.type === 'room'), [], 'the outsider heard of the room');
  assert.equal(d.rooms.list.value.length, 0);
  assert.equal(roomOf(a, room)?.name, 'study hall', 'an outsider renamed the room');
  close(a, b, d);
});

test('leaving: the one who left hears "gone" once and nothing more; a device offline meanwhile drops the room when it comes back', async () => {
  const [a, b] = [await person('la'), await person('lb')];
  const b2 = await wire(await signedIn(server, b.name));
  const { room } = await together(a, b);
  await until(() => !!roomOf(b2, room), 2000, 'B\'s second device never got the room');

  offline(b2.d);
  const mark = b.heard.length;
  assert.deepEqual(await b.rooms.leave(room), { ok: true });
  await until(() => !roomOf(b, room), 1000, 'B still holds the room');
  const after = b.heard.slice(mark).filter((m) => m.type === 'room' && m.room === room);
  assert.deepEqual(after, [{ type: 'room', room, gone: true }]);

  a.focus.start();
  await within('A\'s lap', [a], (p) => seen(p, room, a)?.phase === 'work');
  await sleep(700);
  assert.equal(b.heard.slice(mark).filter((m) => m.type === 'room').length, 1, 'B heard of the room after leaving');

  // B's other device missed the "gone": the welcome's list of rooms tells it.
  assert.ok(roomOf(b2, room), 'the offline device should still hold its last word');
  online(b2.d);
  await until(() => !roomOf(b2, room), 3000, 'the device that was offline kept a room its account left');
  close(a, b, b2);
});

test('cheers: shown at once and reaching the others; twice is once; kept offline across a restart and sent once; for a lap set aside, dropped quietly', async () => {
  const [a, b, c] = [await person('ca'), await person('cb'), await person('cc')];
  const { room } = await together(a, b, c);
  await shortLaps(a);
  a.focus.start();
  await until(() => [b, c].every((p) => !!seen(p, room, a)?.last), 8000, 'A\'s rung lap never showed as last');
  const run = seen(b, room, a)!.last!.run;
  const cheersOf = (p: Person) => p.d.net.frames.filter((f) => f.msg.type === 'request' && f.msg.path === '/api/rooms/cheer');

  b.rooms.cheer(room, a.id);
  assert.equal(seen(b, room, a)?.last?.cheered, true, 'not shown at once');
  await within('B\'s cheer', [a, c], (p) => !!seen(p, room, a)?.last?.cheers.includes(b.id));
  await until(() => a.rooms.cheered.value.includes(b.name), 1000, 'A\'s Focus result would not name B');
  b.rooms.cheer(room, a.id);
  await sleep(300);
  assert.equal(cheersOf(b).length, 1, 'a second tap sent a second cheer');
  assert.deepEqual(seen(a, room, a)?.last?.cheers, [b.id]);
  // And on the server's side: the same cheer again is the same answer, and still one.
  assert.deepEqual(await b.d.engine.request('/api/rooms/cheer', { room, to: a.id, run }), { ok: true, data: {} });
  await sleep(300);
  assert.deepEqual(seen(c, room, a)?.last?.cheers, [b.id]);

  // C cheers in a tunnel, the app restarts there, and the cheer goes once the connection is back.
  offline(c.d);
  c.rooms.cheer(room, a.id);
  assert.equal(seen(c, room, a)?.last?.cheered, true);
  close(c);
  const c2 = await wire(await restart(server, c.d), 0, false);
  assert.equal(seen(c2, room, a)?.last?.cheered, true, 'the kept cheer is not shown after the restart');
  online(c2.d);
  await within('C\'s kept cheer', [a, b], (p) => !!seen(p, room, a)?.last?.cheers.includes(c.id), 3000);
  await sleep(300);
  assert.equal(cheersOf(c2).length, 1, 'the kept cheer was sent more than once');

  // B cheers offline a lap that A then sets aside: answered `run`, and dropped without a word.
  await shortLaps(a);
  a.focus.skipBreak();
  await until(() => seen(b, room, a)?.last?.run !== run && !!seen(b, room, a)?.last, 8000, 'A\'s second lap never showed');
  const second = seen(b, room, a)!.last!.run;
  offline(b.d);
  b.rooms.cheer(room, a.id);
  a.d.engine.write('session', second, { outcome: 'void' });
  await until(() => seen(c2, room, a)?.last?.run !== second, 3000, 'the lap set aside is still A\'s last');
  online(b.d);
  await until(() => cheersOf(b).length === 2, 3000, 'B never sent the kept cheer');
  await until(() => (b.d.engine.kept('cheers') as unknown[]).length === 0, 2000, 'the refused cheer was kept');
  close(a, b, c2);
});
