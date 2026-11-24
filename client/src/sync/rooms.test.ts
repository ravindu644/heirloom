// Rooms on the real engine against a scripted server: see world.ts for the devices. The test
// plays the server both ways: it hands the device room messages, and answers its requests.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { T0, settle } from './fakes.ts';
import { MIN, OFFSET, world } from './world.ts';

type World = ReturnType<typeof world>;
type Device = Awaited<ReturnType<World['device']>>;

const ME = 'a_me';
const SACHI = 'a_sachi';
const NIMAL = 'a_nimal';

const member = (id: string, name: string, over: object = {}) => ({
  id, name, you: id === ME, away: false, phase: 'idle', set_index: 0, ends_at: null, paused: false, task: null,
  today_ms: 0, today_laps: 0, week_ms: 0, last: null, ...over,
});
const room = (id: string, members: object[], over: object = {}) => ({
  type: 'room' as const, room: id, name: 'Sachi and me', code: 'K7QW3RXM', target_ms: 0, ranked: false, server_time: T0, members, ...over,
});
// The server tells the device about a room.
const say = (d: Device, msg: ReturnType<typeof room> | { type: 'room'; room: string; gone: true }) => d.wire().handlers.message(msg);
const lastLap = (cheers: string[] = []) => ({ run: 'run-7f3a', ended: T0 - 5 * MIN, cheers });
const cheers = (w: World) => w.server.requests.filter((request) => request.path === '/api/rooms/cheer');

async function one() {
  const w = world();
  const d = await w.device('a');
  return { w, d, r: d.rooms };
}

describe('the list', () => {
  it('a room appears from its message, and the next message for it updates it in place', async () => {
    const { d, r } = await one();
    assert.equal(r.list.value.length, 0);
    say(d, room('r_1', [
      member(ME, 'ravi', { today_ms: 50 * MIN, today_laps: 2, week_ms: 300 * MIN }),
      member(SACHI, 'sachi', { phase: 'work', set_index: 1, ends_at: T0 + 10 * MIN, task: 'Thinking in React', today_ms: 75 * MIN, today_laps: 3, week_ms: 360 * MIN, last: lastLap([NIMAL]) }),
    ], { target_ms: 600 * MIN }));
    assert.deepEqual(r.list.value, [{
      id: 'r_1', name: 'Sachi and me', code: 'K7QW3RXM', target_ms: 600 * MIN, week_ms: 660 * MIN, ranked: false,
      members: [
        { id: ME, name: 'ravi', you: true, away: false, phase: 'idle', lap: 1, ends_at: null, paused: false, task: null, today_ms: 50 * MIN, today_laps: 2, week_ms: 300 * MIN, last: null },
        { id: SACHI, name: 'sachi', you: false, away: false, phase: 'work', lap: 2, ends_at: T0 + 10 * MIN, paused: false, task: 'Thinking in React', today_ms: 75 * MIN, today_laps: 3, week_ms: 360 * MIN,
          last: { run: 'run-7f3a', ended: T0 - 5 * MIN, cheers: [NIMAL], cheered: false } },
      ],
    }]);
    // She pauses; the room is renamed.
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { phase: 'work', set_index: 1, paused: true })], { name: 'The C book club' }));
    assert.equal(r.list.value.length, 1);
    assert.equal(r.list.value[0]!.name, 'The C book club');
    assert.deepEqual([r.list.value[0]!.members[1]!.phase, r.list.value[0]!.members[1]!.paused, r.list.value[0]!.members[1]!.ends_at], ['work', true, null]);
  });

  it('`gone` removes the room; two rooms are two entries, each its own', async () => {
    const { d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi')]));
    say(d, room('r_2', [member(ME, 'ravi'), member(NIMAL, 'nimal')], { name: 'Night owls', code: 'ZZ99ZZ99' }));
    assert.deepEqual(r.list.value.map((v) => [v.id, v.name, v.members.length]), [['r_1', 'Sachi and me', 1], ['r_2', 'Night owls', 2]]);
    say(d, { type: 'room', room: 'r_1', gone: true });
    assert.deepEqual(r.list.value.map((v) => v.id), ['r_2']);
    say(d, { type: 'room', room: 'never-heard-of', gone: true });
    assert.deepEqual(r.list.value.map((v) => v.id), ['r_2']);
  });

  it('members stay in the order they joined, side by side, unless the room is ranked: then by their week, most first', async () => {
    const { d, r } = await one();
    const three = [member(ME, 'ravi', { week_ms: 100 }), member(SACHI, 'sachi', { week_ms: 300 }), member(NIMAL, 'nimal', { week_ms: 100 })];
    say(d, room('r_1', three));
    assert.deepEqual(r.list.value[0]!.members.map((m) => m.name), ['ravi', 'sachi', 'nimal']);
    say(d, room('r_1', three, { ranked: true }));
    assert.equal(r.list.value[0]!.ranked, true);
    assert.deepEqual(r.list.value[0]!.members.map((m) => m.name), ['sachi', 'ravi', 'nimal'], 'level on the week: the order they joined');
    assert.equal(r.list.value[0]!.week_ms, 500);
  });

  it('a member\'s phase turns idle at `ends_at` with no new message: their bell went, and the server\'s word will follow', async () => {
    const { w, d, r } = await one();
    say(d, room('r_1', [
      member(ME, 'ravi'),
      member(SACHI, 'sachi', { phase: 'work', set_index: 2, ends_at: T0 + 10 * MIN, task: 'Hooks' }),
      member(NIMAL, 'nimal', { phase: 'short', ends_at: T0 + 3 * MIN }),
    ]));
    let changes = 0;
    const stop = r.list.subscribe(() => changes++);
    const phases = () => r.list.value[0]!.members.map((m) => [m.phase, m.ends_at, m.task]);
    w.time.advance(3 * MIN - 1);
    assert.deepEqual(phases(), [['idle', null, null], ['work', T0 + 10 * MIN, 'Hooks'], ['short', T0 + 3 * MIN, null]]);
    w.time.advance(1);
    assert.deepEqual(phases(), [['idle', null, null], ['work', T0 + 10 * MIN, 'Hooks'], ['idle', null, null]]);
    w.time.advance(7 * MIN);
    assert.deepEqual(phases(), [['idle', null, null], ['idle', null, null], ['idle', null, null]]);
    assert.equal(r.list.value[0]!.members[1]!.lap, 3, 'the lap of the set they are between');
    assert.equal(changes, 3, 'the signal itself changed at each bell');
    stop();
    assert.equal(w.time.waiting(), 0, 'and no wait is left when nobody is running');
  });

  it('someone who has hidden rooms is away: no phase, no task, no last lap, and their week still counts', async () => {
    const { d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi', { week_ms: 100 }), member(SACHI, 'sachi', { away: true, phase: 'work', ends_at: T0 + MIN, task: 'leaked', last: lastLap(), week_ms: 400 })]));
    const sachi = r.list.value[0]!.members[1]!;
    assert.deepEqual([sachi.away, sachi.phase, sachi.ends_at, sachi.task, sachi.last], [true, 'idle', null, null, null]);
    assert.equal(r.list.value[0]!.week_ms, 500);
  });

  it('a message with parts missing or wrong does not throw and shows what it can', async () => {
    const { d, r } = await one();
    d.wire().handlers.message({ type: 'room', room: 'r_odd', members: [{ id: SACHI, phase: 'napping', set_index: 'two', last: { cheers: 'none' } }, null, 7] } as never);
    d.wire().handlers.message({ type: 'room', room: 'r_bare' });
    assert.deepEqual(r.list.value.map((v) => [v.id, v.members.length, v.week_ms]), [['r_odd', 1, 0], ['r_bare', 0, 0]]);
    assert.deepEqual([r.list.value[0]!.members[0]!.phase, r.list.value[0]!.members[0]!.lap, r.list.value[0]!.members[0]!.last], ['idle', 1, null]);
  });

  it('after a restart while offline the list is the last word, marked stale; fresh again once connected', async () => {
    const { w, d } = await one();
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { phase: 'work', ends_at: T0 + 20 * MIN, week_ms: 90 * MIN })]));
    say(d, room('r_2', [member(ME, 'ravi')], { name: 'Night owls' }));
    say(d, { type: 'room', room: 'r_2', gone: true });
    assert.equal(d.rooms.stale.value, false);
    const before = d.rooms.list.value;
    const again = await w.restart(d, { online: false });
    assert.equal(again.rooms.stale.value, true);
    assert.deepEqual(again.rooms.list.value, before);
    // Half an hour offline: her lap must have rung by now.
    w.time.advance(30 * MIN);
    assert.equal(again.rooms.list.value[0]!.members[1]!.phase, 'idle');
    await again.connect();
    assert.equal(again.rooms.stale.value, false);
  });

  it('each account has its own rooms: signing in as someone else shows none of them', async () => {
    const { d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi')]));
    await d.engine.signIn('nimal', 'another password');
    assert.deepEqual(r.list.value, []);
  });
});

describe('room requests', () => {
  it('create and join answer with the room; every request carries the token and the device', async () => {
    const { w, d, r } = await one();
    w.server.reply = (path) => ({ status: 200, body: path.endsWith('create') || path.endsWith('join') ? { room: 'r_new' } : {} });
    assert.deepEqual(await r.create('  The C book club  '), { ok: true, room: 'r_new' });
    assert.deepEqual(await r.join(' k7qw3rxm '), { ok: true, room: 'r_new' });
    assert.deepEqual(await r.update('r_new', { target_ms: 600 * MIN, ranked: true }), { ok: true });
    assert.deepEqual(await r.leave('r_new'), { ok: true });
    const base = { token: 'token-a', device: d.engine.device };
    assert.deepEqual(w.server.requests.map(({ path, body }) => ({ path, body })), [
      { path: '/api/rooms/create', body: { name: 'The C book club', ...base } },
      { path: '/api/rooms/join', body: { code: 'K7QW3RXM', ...base } },
      { path: '/api/rooms/update', body: { room: 'r_new', target_ms: 600 * MIN, ranked: true, ...base } },
      { path: '/api/rooms/leave', body: { room: 'r_new', ...base } },
    ]);
  });

  it('each request\'s errors come through as the server\'s codes', async () => {
    const { w, r } = await one();
    const fail = (status: number, error: string) => (w.server.reply = () => ({ status, body: { error } }));
    fail(404, 'code');
    assert.deepEqual(await r.join('NOSUCHRM'), { ok: false, error: 'code' });
    fail(409, 'full');
    assert.deepEqual(await r.join('K7QW3RXM'), { ok: false, error: 'full' });
    assert.deepEqual(await r.create('One too many'), { ok: false, error: 'full' });
    fail(404, 'room');
    assert.deepEqual(await r.leave('r_gone'), { ok: false, error: 'room' });
    assert.deepEqual(await r.update('r_gone', { name: 'x' }), { ok: false, error: 'room' });
    fail(400, 'bad_request');
    assert.deepEqual(await r.create(''), { ok: false, error: 'bad_request' });
    w.server.reply = () => 'unreachable';
    assert.deepEqual(await r.create('Tunnel'), { ok: false, error: 'offline' });
  });

  it('a request while offline answers `offline` at once, and nothing is sent then or later', async () => {
    const { w, d, r } = await one();
    d.disconnect();
    assert.deepEqual(await r.create('Later'), { ok: false, error: 'offline' });
    assert.deepEqual(await r.join('K7QW3RXM'), { ok: false, error: 'offline' });
    assert.deepEqual(await r.leave('r_1'), { ok: false, error: 'offline' });
    assert.deepEqual(await r.update('r_1', { ranked: true }), { ok: false, error: 'offline' });
    await d.connect();
    await settle();
    assert.deepEqual(w.server.requests, []);
  });

  it('a request the server never answers is given up and cancelled, like the account calls', async () => {
    const { w, r } = await one();
    w.server.reply = () => new Promise(() => {});
    let answer: unknown;
    void r.create('Hung').then((result) => (answer = result));
    await settle();
    w.time.advance(20000);
    await settle();
    assert.deepEqual(answer, { ok: false, error: 'offline' });
  });
});

describe('cheering', () => {
  const withSachi = (d: Device, over: object = {}) => say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { last: lastLap(), ...over })]));
  const sachi = (d: Device) => d.rooms.list.value[0]!.members[1]!;

  it('online: shown at once, sent now, and still shown when the server\'s own message says it', async () => {
    const { w, d, r } = await one();
    withSachi(d);
    r.cheer('r_1', SACHI);
    assert.deepEqual(sachi(d).last, { run: 'run-7f3a', ended: T0 - 5 * MIN, cheers: [ME], cheered: true });
    await settle();
    assert.deepEqual(cheers(w).map((c) => c.body), [{ room: 'r_1', to: SACHI, run: 'run-7f3a', token: 'token-a', device: d.engine.device }]);
    assert.equal(sachi(d).last?.cheered, true, 'answered, and the message has not come yet');
    withSachi(d, { last: lastLap([NIMAL, ME]) });
    assert.deepEqual(sachi(d).last?.cheers, [NIMAL, ME]);
    assert.equal(cheers(w).length, 1);
  });

  it('the same cheer tapped twice, or again after it was sent, is one request', async () => {
    const { w, d, r } = await one();
    withSachi(d);
    r.cheer('r_1', SACHI);
    r.cheer('r_1', SACHI);
    await settle();
    r.cheer('r_1', SACHI);
    d.disconnect();
    await d.connect();
    await settle();
    assert.equal(cheers(w).length, 1);
    assert.deepEqual(sachi(d).last?.cheers, [ME]);
  });

  it('offline: shown at once, kept across a restart, and sent once when the connection returns', async () => {
    const { w, d } = await one();
    withSachi(d);
    d.disconnect();
    d.rooms.cheer('r_1', SACHI);
    await settle();
    assert.equal(sachi(d).last?.cheered, true);
    assert.deepEqual(cheers(w), []);
    const again = await w.restart(d, { online: false });
    assert.equal(sachi(again).last?.cheered, true, 'still shown after the restart');
    await settle();
    assert.deepEqual(cheers(w), []);
    await again.connect();
    await settle();
    assert.equal(cheers(w).length, 1);
    // The connection drops and returns again: it was answered, so it is not sent a second time.
    again.disconnect();
    await again.connect();
    await settle();
    assert.equal(cheers(w).length, 1);
    const once = await w.restart(again);
    void once.rooms.list.value;
    await settle();
    assert.equal(cheers(w).length, 1, 'nor after another restart');
  });

  it('a cheer the server answers `run` to is dropped quietly: that lap is gone', async () => {
    const { w, d, r } = await one();
    withSachi(d);
    w.server.reply = () => ({ status: 404, body: { error: 'run' } });
    r.cheer('r_1', SACHI);
    await settle();
    assert.equal(sachi(d).last?.cheered, false);
    d.disconnect();
    await d.connect();
    await settle();
    assert.equal(cheers(w).length, 1, 'not tried again');
  });

  it('a cheer the server fails on is kept, still shown, and sent again at the next connection', async () => {
    const { w, d, r } = await one();
    withSachi(d);
    w.server.reply = () => ({ status: 500, body: { error: 'server' } });
    r.cheer('r_1', SACHI);
    await settle();
    assert.equal(sachi(d).last?.cheered, true);
    assert.equal(cheers(w).length, 1);
    w.server.reply = () => 'unreachable';
    d.disconnect();
    await d.connect();
    await settle();
    assert.equal(cheers(w).length, 2);
    w.server.reply = null;
    d.disconnect();
    await d.connect();
    await settle();
    assert.equal(cheers(w).length, 3);
    d.disconnect();
    await d.connect();
    await settle();
    assert.equal(cheers(w).length, 3, 'answered at last, and done');
  });

  it('never two requests in the air for one cheer, however the connection flaps while the first is out', async () => {
    const { w, d, r } = await one();
    withSachi(d);
    let release = (_: { status: number; body: object }) => {};
    w.server.reply = () => new Promise((resolve) => (release = resolve));
    r.cheer('r_1', SACHI);
    await settle();
    d.disconnect();
    await d.connect();
    await settle();
    assert.equal(cheers(w).length, 1);
    release({ status: 200, body: {} });
    await settle();
    assert.equal(cheers(w).length, 1);
  });

  it('nothing to cheer: a member with no lap today, yourself, or a room that is gone', async () => {
    const { w, d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi', { last: lastLap() }), member(SACHI, 'sachi')]));
    r.cheer('r_1', SACHI);
    r.cheer('r_nowhere', SACHI);
    await settle();
    assert.deepEqual(cheers(w), []);
    // A cheer waiting for a room that then ends has nowhere to go.
    withSachi(d);
    d.disconnect();
    r.cheer('r_1', SACHI);
    say(d, { type: 'room', room: 'r_1', gone: true });
    await d.connect();
    await settle();
    assert.deepEqual(cheers(w), []);
  });
});

describe('who cheered you', () => {
  it('the names of those who cheered your latest lap today, across rooms, each once', async () => {
    const { d, r } = await one();
    assert.deepEqual(r.cheered.value, []);
    say(d, room('r_1', [member(ME, 'ravi', { last: lastLap([SACHI, NIMAL]) }), member(SACHI, 'sachi'), member(NIMAL, 'nimal')]));
    say(d, room('r_2', [member(ME, 'ravi', { last: lastLap([SACHI, 'a_kasun']) }), member(SACHI, 'sachi'), member('a_kasun', 'kasun')], { name: 'Night owls' }));
    assert.deepEqual(r.cheered.value, ['sachi', 'nimal', 'kasun']);
    // A newer lap in one room's message: the cheers for the older lap are not for this one.
    say(d, room('r_1', [member(ME, 'ravi', { last: { run: 'run-newer', ended: T0, cheers: [NIMAL] } }), member(SACHI, 'sachi'), member(NIMAL, 'nimal')]));
    assert.deepEqual(r.cheered.value, ['nimal']);
  });
});

describe('settings', () => {
  it('hidden and share are ordinary cells: written offline, shown at once, synced like any edit', async () => {
    const { d, r } = await one();
    assert.deepEqual([r.hidden.value, r.shareTask.value], [false, false]);
    d.disconnect();
    r.setHidden(true);
    r.setShareTask(true);
    assert.deepEqual([r.hidden.value, r.shareTask.value], [true, true]);
    assert.deepEqual(d.engine.rows('settings').value.get('current'), { id: 'current', rooms_hidden: true, share_task: true });
    assert.equal(d.engine.unsent.value, 2);
    r.setHidden(false);
    assert.equal(r.hidden.value, false);
  });
});

describe('the offset the server is told', () => {
  it('the hello carries the device\'s offset from UTC', async () => {
    const { d } = await one();
    assert.equal(d.wire().handlers.hello().utc_offset_min, OFFSET);
  });

  it('when the offset changes while connected, the engine says hello again within one ping, with the new one', async () => {
    const { w, d } = await one();
    assert.equal(d.wire().handlers.hello().utc_offset_min, 330);
    // A pong on the same offset: nothing to say.
    d.wire().handlers.time(0);
    assert.equal(d.wire().agains, 0);
    // The person lands in Singapore.
    w.zone.min = 480;
    d.wire().handlers.time(0);
    assert.equal(d.wire().agains, 1);
    assert.equal(d.wire().handlers.hello().utc_offset_min, 480);
    // Told. The next pong does not ask for another hello.
    d.wire().handlers.time(0);
    assert.equal(d.wire().agains, 1);
  });
});

describe('closing', () => {
  it('close() leaves no timer waiting and hears no more messages', async () => {
    const { w, d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { phase: 'work', ends_at: T0 + 10 * MIN })]));
    assert.equal(w.time.waiting(), 1);
    r.close();
    assert.equal(w.time.waiting(), 0);
    say(d, { type: 'room', room: 'r_1', gone: true });
    assert.equal(r.list.value.length, 1);
  });
});
