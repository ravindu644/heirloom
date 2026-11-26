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
// A member's lane by id: the list is in the live order, not the order they joined.
const lane = (r: Pick<Device['rooms'], 'list'>, id: string) => r.list.value[0]!.members.find((m) => m.id === id)!;
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
      id: 'r_1', name: 'Sachi and me', code: 'K7QW3RXM', target_ms: 600 * MIN, week_ms: 660 * MIN, ranked: false, keeper: null, youKeep: true,
      // Sachi is on a lap: she comes first.
      members: [
        { id: SACHI, name: 'sachi', you: false, picture: null, away: false, phase: 'work', lap: 2, ends_at: T0 + 10 * MIN, paused: false, task: 'Thinking in React', today_ms: 75 * MIN, today_laps: 3, week_ms: 360 * MIN, laps: [], runStart: null,
          // Nimal cheered and is not in this room: counted in `cheers`, and not among the names.
          last: { run: 'run-7f3a', ended: T0 - 5 * MIN, cheers: [NIMAL], cheered: false, cheerers: [] } },
        { id: ME, name: 'ravi', you: true, picture: null, away: false, phase: 'idle', lap: 1, ends_at: null, paused: false, task: null, today_ms: 50 * MIN, today_laps: 2, week_ms: 300 * MIN, laps: [], runStart: null, last: null },
      ],
      // An older server: no week by day, no streak, no call, no notes.
      week: null, streak: null, call: null, notes: [], newNotes: 0,
    }]);
    // She pauses; the room is renamed.
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { phase: 'work', set_index: 1, paused: true })], { name: 'The C book club' }));
    assert.equal(r.list.value.length, 1);
    assert.equal(r.list.value[0]!.name, 'The C book club');
    assert.deepEqual([lane(r, SACHI).phase, lane(r, SACHI).paused, lane(r, SACHI).ends_at], ['work', true, null]);
  });

  it('your own lane counts your lap in progress as far as it has run, as Today does, and moves on the minute with nobody sending', async () => {
    const { w, d, r } = await one();
    // The server's totals are of your rows: 75 minutes today, 7h 5m this week. The lap in progress is not in them.
    say(d, room('r_1', [member(ME, 'ravi', { today_ms: 75 * MIN, today_laps: 3, week_ms: 425 * MIN }), member(SACHI, 'sachi', { today_ms: 50 * MIN, week_ms: 100 * MIN })]));
    d.focus.start();
    w.time.advance(11 * MIN);
    const mine = () => lane(r, ME);
    // 1h 26m and 7h 16m, as Today and Progress say at the same moment.
    assert.deepEqual([mine().today_ms, mine().today_laps, mine().week_ms], [86 * MIN, 3, 436 * MIN]);
    assert.equal(mine().today_ms, d.focus.race().you_ms + 75 * MIN);
    assert.equal(r.list.value[0]!.week_ms, 536 * MIN, 'and so is the room\'s week');
    // It is read again at each whole minute: the minutes shown are never behind.
    const shown = () => [mine().today_ms, mine().week_ms].map((ms) => Math.floor(ms / MIN));
    w.time.advance(MIN - 1);
    assert.deepEqual(shown(), [86, 436]);
    w.time.advance(1);
    assert.deepEqual(shown(), [87, 437]);
    // Paused, it stays where it stopped.
    d.focus.pause();
    w.time.advance(5 * MIN);
    assert.deepEqual(shown(), [87, 437]);
    d.focus.resume();
    w.time.advance(MIN);
    assert.deepEqual(shown(), [88, 438]);
    // A friend's lap in progress is not in their figure: the message does not say how far it has run.
    assert.equal(lane(r, SACHI).today_ms, 50 * MIN);
  });

  it('a friend\'s lap in progress is in their figures from `run`, on since `server_time` while it counts; paused it stands; without it, the rows alone', async () => {
    const { w, d, r } = await one();
    const run = { ms: 14 * MIN, today: true, week: true };
    const sachi = (over: object) => member(SACHI, 'sachi', { phase: 'work', ends_at: T0 + 11 * MIN, today_ms: 50 * MIN, today_laps: 2, week_ms: 100 * MIN, run, ...over });
    const figures = () => [ME, SACHI].map((id) => [lane(r, id).today_ms, lane(r, id).week_ms]);
    say(d, room('r_1', [member(ME, 'ravi', { week_ms: 10 * MIN, run: { ms: 99 * MIN, today: true, week: true } }), sachi({})]));
    // You are counted from this device's own timer, never from `run`.
    assert.deepEqual(figures(), [[0, 10 * MIN], [64 * MIN, 114 * MIN]]);
    w.time.advance(3 * MIN);
    assert.deepEqual(figures(), [[0, 10 * MIN], [67 * MIN, 117 * MIN]], 'moved on at the minute with nobody sending');
    assert.equal(r.list.value[0]!.week_ms, 127 * MIN, 'and the room\'s week with it');

    // Begun yesterday and still running: in the week, not in today.
    say(d, room('r_1', [member(ME, 'ravi'), sachi({ run: { ...run, today: false }, ends_at: T0 + 20 * MIN })], { server_time: T0 + 3 * MIN }));
    assert.deepEqual(figures()[1], [50 * MIN, 114 * MIN]);

    // Paused: as far as it had run, and it stays there.
    say(d, room('r_1', [member(ME, 'ravi'), sachi({ paused: true, ends_at: null })], { server_time: T0 + 3 * MIN }));
    w.time.advance(5 * MIN);
    assert.deepEqual(figures()[1], [64 * MIN, 114 * MIN]);

    // No lap in progress, or an older server that does not send `run`: the rows alone.
    say(d, room('r_1', [member(ME, 'ravi'), sachi({ run: null })], { server_time: T0 + 8 * MIN }));
    assert.deepEqual(figures()[1], [50 * MIN, 100 * MIN]);
    const older = sachi({}) as Record<string, unknown>;
    delete older.run;
    say(d, room('r_1', [member(ME, 'ravi'), older], { server_time: T0 + 8 * MIN }));
    assert.deepEqual(figures()[1], [50 * MIN, 100 * MIN]);
  });

  it('a friend\'s lap in progress stops counting at their bell with no new message, and nothing is left waiting after it', async () => {
    const { w, d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { phase: 'work', ends_at: T0 + 5 * MIN, today_ms: 50 * MIN, week_ms: 100 * MIN, run: { ms: 20 * MIN, today: true, week: true } })]));
    let changes = 0;
    const stop = r.list.subscribe(() => changes++);
    w.time.advance(10 * MIN);
    const sachi = lane(r, SACHI);
    assert.deepEqual([sachi.phase, sachi.today_ms, sachi.week_ms], ['idle', 75 * MIN, 125 * MIN], '+25 to the bell, not +30');
    // Once on subscribing, then at each of the five minutes up to the bell, the bell being the fifth: none after it.
    assert.equal(changes, 6);
    assert.equal(w.time.waiting(), 0);
    stop();
  });

  it('the keeper: named, and only they may change the room; an older server names none, and then anyone may', async () => {
    const { d, r } = await one();
    const two = [member(ME, 'ravi'), member(SACHI, 'sachi')];
    const keeping = () => [r.list.value[0]!.keeper, r.list.value[0]!.youKeep];
    say(d, room('r_1', two, { keeper: SACHI }));
    assert.deepEqual(keeping(), ['sachi', false]);
    // Sachi leaves; the server hands the room to the member there longest, you, and says so.
    say(d, room('r_1', [member(ME, 'ravi')], { keeper: ME }));
    assert.deepEqual(keeping(), ['ravi', true]);
    say(d, room('r_1', two));
    assert.deepEqual(keeping(), [null, true]);
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

  it('the live order: on a lap, on a break, the rest, each by the week with the order they joined on a tie; ranked, by the week alone', async () => {
    const { w, d, r } = await one();
    const LINA = 'a_lina';
    const AMAYA = 'a_amaya';
    const five = [
      member(ME, 'ravi', { week_ms: 100 }),
      member(SACHI, 'sachi', { week_ms: 300 }),
      member(NIMAL, 'nimal', { phase: 'short', ends_at: T0 + 5 * MIN, week_ms: 50 }),
      member(LINA, 'lina', { phase: 'work', paused: true, week_ms: 20 }),
      member(AMAYA, 'amaya', { phase: 'work', ends_at: T0 + 20 * MIN, week_ms: 20 }),
    ];
    const names = () => r.list.value[0]!.members.map((m) => m.name);
    say(d, room('r_1', five));
    // Lina and Amaya are on laps (a paused lap is a lap), level on the week: the order they joined.
    assert.deepEqual(names(), ['lina', 'amaya', 'nimal', 'sachi', 'ravi']);
    say(d, room('r_1', five, { ranked: true }));
    assert.deepEqual(names(), ['sachi', 'ravi', 'nimal', 'lina', 'amaya']);
    assert.equal(r.list.value[0]!.week_ms, 490);
    // Unranked again: Nimal's break rings, and he is with the rest, by his week.
    say(d, room('r_1', five));
    w.time.advance(5 * MIN);
    assert.deepEqual(names(), ['lina', 'amaya', 'sachi', 'ravi', 'nimal']);
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
    const phases = () => [ME, SACHI, NIMAL].map((id) => lane(r, id)).map((m) => [m.phase, m.ends_at, m.task]);
    w.time.advance(3 * MIN - 1);
    assert.deepEqual(phases(), [['idle', null, null], ['work', T0 + 10 * MIN, 'Hooks'], ['short', T0 + 3 * MIN, null]]);
    w.time.advance(1);
    assert.deepEqual(phases(), [['idle', null, null], ['work', T0 + 10 * MIN, 'Hooks'], ['idle', null, null]]);
    w.time.advance(7 * MIN);
    assert.deepEqual(phases(), [['idle', null, null], ['idle', null, null], ['idle', null, null]]);
    assert.equal(lane(r, SACHI).lap, 3, 'the lap of the set they are between');
    assert.equal(changes, 3, 'the signal itself changed at each bell');
    stop();
    assert.equal(w.time.waiting(), 0, 'and no wait is left when nobody is running');
  });

  it('someone who has hidden rooms is away: no phase, no task, no last lap, and their week still counts', async () => {
    const { d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi', { week_ms: 100 }), member(SACHI, 'sachi', { away: true, phase: 'work', ends_at: T0 + MIN, task: 'leaked', last: lastLap(), week_ms: 400 })]));
    const sachi = lane(r, SACHI);
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
    assert.equal(lane(again.rooms, SACHI).phase, 'idle');
    await again.connect();
    assert.equal(again.rooms.stale.value, false);
  });

  it('a welcome names the account\'s rooms: one it does not name was left while this device was away, and goes with its waiting cheers', async () => {
    const { w, d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { last: lastLap() })]));
    say(d, room('r_2', [member(ME, 'ravi'), member(NIMAL, 'nimal', { last: lastLap() })], { name: 'Night owls' }));
    d.disconnect();
    r.cheer('r_1', SACHI);
    r.cheer('r_2', NIMAL);
    // Back online. Meanwhile the account left r_1 from another device.
    d.online = true;
    d.wire().handlers.message({ type: 'welcome', server_time: 0, head: 0, rooms: ['r_2'] });
    await settle();
    assert.deepEqual(r.list.value.map((v) => v.id), ['r_2']);
    assert.deepEqual(cheers(w).map((c) => [c.body.room, c.body.to]), [['r_2', NIMAL]], 'the cheer for the room that is gone was never sent');
    // And that is what is kept: a restart offline does not bring the room back.
    const again = await w.restart(d, { online: false });
    assert.deepEqual(again.rooms.list.value.map((v) => v.id), ['r_2']);
  });

  it('a welcome that names no rooms at all is an older server: nothing is dropped. An empty list means none', async () => {
    const { d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi')]));
    say(d, room('r_2', [member(ME, 'ravi')]));
    d.wire().handlers.down();
    d.wire().handlers.message({ type: 'welcome', server_time: 0, head: 0 });
    assert.deepEqual(r.list.value.map((v) => v.id), ['r_1', 'r_2']);
    d.wire().handlers.down();
    d.wire().handlers.message({ type: 'welcome', server_time: 0, head: 0, rooms: 'r_1' } as never);
    assert.deepEqual(r.list.value.map((v) => v.id), ['r_1', 'r_2'], 'not a list: not said');
    d.wire().handlers.down();
    d.wire().handlers.message({ type: 'welcome', server_time: 0, head: 0, rooms: [] });
    assert.deepEqual(r.list.value, []);
  });

  it('a POST reply\'s rooms are the whole set too: a room it did not name is dropped', async () => {
    const { d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi')]));
    say(d, room('r_2', [member(ME, 'ravi')]));
    // As the transport hands a reply on: each room, then the ids of all of them.
    say(d, room('r_2', [member(ME, 'ravi'), member(SACHI, 'sachi')]));
    d.wire().handlers.message({ type: 'rooms', rooms: ['r_2'] });
    assert.deepEqual(r.list.value.map((v) => [v.id, v.members.length]), [['r_2', 2]]);
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
    // The server's hashing line is full: the code, and the seconds it asked for.
    w.server.reply = () => ({ status: 429, body: { error: 'slow_down' }, retryAfter: '1' });
    assert.deepEqual(await r.join('K7QW3RXM'), { ok: false, error: 'slow_down', retry_after: 1 });
    fail(409, 'full');
    assert.deepEqual(await r.join('K7QW3RXM'), { ok: false, error: 'full' });
    assert.deepEqual(await r.create('One too many'), { ok: false, error: 'full' });
    fail(404, 'room');
    assert.deepEqual(await r.leave('r_gone'), { ok: false, error: 'room' });
    assert.deepEqual(await r.update('r_gone', { name: 'x' }), { ok: false, error: 'room' });
    // Not the keeper.
    fail(403, 'forbidden');
    assert.deepEqual(await r.update('r_1', { ranked: true }), { ok: false, error: 'forbidden' });
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
  const sachi = (d: Device) => lane(d.rooms, SACHI);

  it('online: shown at once, sent now, and still shown when the server\'s own message says it', async () => {
    const { w, d, r } = await one();
    withSachi(d);
    r.cheer('r_1', SACHI);
    assert.deepEqual(sachi(d).last, { run: 'run-7f3a', ended: T0 - 5 * MIN, cheers: [ME], cheered: true, cheerers: [{ id: ME, name: 'ravi' }] });
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

  it('a cheer the server answers `room` to is dropped the same way: the room is gone, or this account is out of it', async () => {
    const { w, d, r } = await one();
    withSachi(d);
    w.server.reply = () => ({ status: 404, body: { error: 'room' } });
    r.cheer('r_1', SACHI);
    await settle();
    assert.equal(sachi(d).last?.cheered, false);
    d.disconnect();
    await d.connect();
    await settle();
    assert.equal(cheers(w).length, 1, 'not tried again');
    const again = await w.restart(d);
    void again.rooms.list.value;
    await settle();
    assert.equal(cheers(w).length, 1, 'nor kept for after a restart');
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
    // Your own lap is not yours to cheer: not shown as cheered, not queued, not sent.
    r.cheer('r_1', ME);
    assert.equal(lane(r, ME).last?.cheered, false);
    assert.equal(d.engine.kept('cheers'), undefined);
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

describe('who cheered', () => {
  it('each lap says who cheered it by name, in the order they cheered, for every screen to say it the same way', async () => {
    const { d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { last: lastLap([NIMAL, 'a_left_the_room']) }), member(NIMAL, 'nimal')]));
    const last = () => lane(r, SACHI).last!;
    assert.deepEqual(last().cheerers, [{ id: NIMAL, name: 'nimal' }]);
    assert.deepEqual(last().cheers, [NIMAL, 'a_left_the_room'], 'the ids are all still there');
    r.cheer('r_1', SACHI);
    assert.deepEqual(last().cheerers, [{ id: NIMAL, name: 'nimal' }, { id: ME, name: 'ravi' }]);
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

describe('the week, the streak and the call, as the room says them', () => {
  it('the week day by day to today, last week whole, ahead of last week at this time, and your part', async () => {
    const { d, r } = await one();
    // Tuesday. Monday 60 minutes, today 30 so far; last week 30 a day, 45 by this time.
    say(d, room('r_1', [member(ME, 'ravi', { week_ms: 50 * MIN }), member(SACHI, 'sachi', { week_ms: 40 * MIN })], {
      days: [60, 30, 0, 0, 0, 0, 0].map((m) => m * MIN), last_days: Array(7).fill(30 * MIN), last_at_ms: 45 * MIN,
      streak: { run: 3, marks: ['none', 'kept', 'rest', 'napped', 'open'] },
    }));
    assert.deepEqual(r.list.value[0]!.week, {
      days: [60 * MIN, 90 * MIN, null, null, null, null, null],
      last: [30, 60, 90, 120, 150, 180, 210].map((m) => m * MIN),
      ahead_ms: 45 * MIN,
      you_ms: 50 * MIN,
    });
    assert.deepEqual(r.list.value[0]!.streak, { run: 3, marks: ['none', 'kept', 'rest', 'open'] }, 'a day before anything was kept keeps its place; a mark this build does not know is left out');
  });

  it('the call: who called, when, who is in, and whether you are; the calls you are in for the phone', async () => {
    const { d, r } = await one();
    const call = { id: 'c1', by: SACHI, at: T0 + 5 * MIN, in: [SACHI] };
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi')], { call }));
    assert.deepEqual(r.list.value[0]!.call, { id: 'c1', by: { id: SACHI, name: 'sachi' }, at: T0 + 5 * MIN, in: [{ id: SACHI, name: 'sachi' }], you: false, yours: false });
    assert.deepEqual(r.calledIn.value, []);
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi')], { call: { ...call, in: [SACHI, ME] } }));
    assert.equal(r.list.value[0]!.call!.you, true);
    assert.deepEqual(r.calledIn.value, [{ room: 'r_1', name: 'Sachi and me', call: 'c1', at: T0 + 5 * MIN, by: 'sachi' }]);
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi')], { call: null }));
    assert.deepEqual([r.list.value[0]!.call, r.calledIn.value], [null, []]);
  });

  it('saying you are in once the call has begun is answered `call`: the call is gone from the room at once', async () => {
    const { w, d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi')], { call: { id: 'c1', by: SACHI, at: T0 + MIN, in: [SACHI] } }));
    w.time.advance(MIN);
    w.server.reply = () => ({ status: 404, body: { error: 'call' } });
    assert.deepEqual(await r.setIn('r_1', 'c1', true), { ok: false, error: 'call' });
    const call = () => r.list.value[0]!.call;
    assert.equal(call(), null);
    // Any other failure leaves the call as it was.
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi')], { call: { id: 'c2', by: SACHI, at: T0 + 5 * MIN, in: [SACHI] } }));
    w.server.reply = () => ({ status: 404, body: { error: 'room' } });
    await r.setIn('r_1', 'c2', true);
    assert.equal(call()?.id, 'c2');
  });

  it('call, in, remove, a note and a picture are the requests the protocol names', async () => {
    const { w, d, r } = await one();
    w.server.reply = (path) => ({ status: 200, body: path === '/api/rooms/call' ? { call: 'c1' } : {} });
    assert.deepEqual(await r.callLap('r_1', T0 + 10 * MIN), { ok: true });
    await r.callLap('r_1', null);
    await r.setIn('r_1', 'c1', true);
    await r.remove('r_1', SACHI);
    await r.addNote('r_1', '  back at 4  ');
    await r.setPicture(new Uint8Array([1, 2, 3]));
    await r.setPicture(null);
    const sent = w.server.requests.map(({ path, body }) => [path, Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'token' && key !== 'device'))]);
    assert.deepEqual(sent, [
      ['/api/rooms/call', { room: 'r_1', at: T0 + 10 * MIN }],
      ['/api/rooms/call', { room: 'r_1', at: null }],
      ['/api/rooms/in', { room: 'r_1', call: 'c1', in: true }],
      ['/api/rooms/remove', { room: 'r_1', member: SACHI }],
      ['/api/rooms/note', { room: 'r_1', text: 'back at 4' }],
      ['/api/me/picture', { picture: 'AQID' }],
      ['/api/me/picture', { picture: null }],
    ]);
    void d;
  });
});

describe('lanes', () => {
  it('a friend\'s laps of today as the room says them, and the lap they are on from where it began; nothing for someone away', async () => {
    const { w, d, r } = await one();
    const laps = [[T0 - 3 * 60 * MIN, T0 - 155 * MIN], [T0 - 60 * MIN, T0 - 35 * MIN]];
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { phase: 'work', ends_at: T0 + 11 * MIN, laps, run: { ms: 14 * MIN, today: true, week: true } }), member(NIMAL, 'nimal', { away: true, laps })]));
    w.time.advance(MIN);
    assert.deepEqual([lane(r, SACHI).laps, lane(r, SACHI).runStart], [laps, T0 - 14 * MIN]);
    assert.deepEqual([lane(r, NIMAL).laps, lane(r, NIMAL).runStart], [[], null]);
    // An older server sends no laps: an empty lane.
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi')]));
    assert.deepEqual([lane(r, SACHI).laps, lane(r, SACHI).runStart], [[], null]);
  });

  it('your own lane is from your own rows and timer, whatever the message says: the lap you are on, then a lap once it ends', async () => {
    const { w, d, r } = await one();
    say(d, room('r_1', [member(ME, 'ravi', { laps: [[1, 2]], run: { ms: 99, today: true, week: true } })]));
    assert.deepEqual([lane(r, ME).laps, lane(r, ME).runStart], [[], null]);
    d.focus.start();
    w.time.advance(10 * MIN);
    assert.deepEqual([lane(r, ME).laps, lane(r, ME).runStart], [[], T0]);
    w.time.advance(15 * MIN);
    // The bell: a lap of today, and nothing running.
    assert.deepEqual([lane(r, ME).laps, lane(r, ME).runStart], [[[T0, T0 + 25 * MIN]], null]);
  });
});

describe('start together', () => {
  // Rooms is made first: a device's rooms hear only what comes after them.
  const called = (d: Device, at: number, inIt = [SACHI, ME]) => {
    void d.rooms.list.value;
    say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi')], { call: { id: 'c1', by: SACHI, at, in: inIt } }));
  };

  it('at the minute, an idle timer starts a lap with the call\'s run id, begun at that minute, on the task Focus would start', async () => {
    const { w, d } = await one();
    const task = d.today.add('pointers')!;
    called(d, T0 + 2 * MIN);
    void d.rooms.list.value;
    w.time.advance(2 * MIN - 1);
    assert.equal(d.focus.state.value.phase, 'idle');
    w.time.advance(1);
    const s = d.focus.state.value;
    assert.deepEqual([s.phase, s.run, s.started, s.task], ['work', 'call-c1', T0 + 2 * MIN, task]);
  });

  it('a timer on a lap or a break is left alone; so is one whose account is not in', async () => {
    const { w, d } = await one();
    d.focus.start();
    called(d, T0 + 2 * MIN);
    void d.rooms.list.value;
    w.time.advance(2 * MIN);
    assert.equal(d.focus.state.value.run, 'run-1');
    const other = await one();
    called(other.d, T0 + 2 * MIN, [SACHI]);
    void other.d.rooms.list.value;
    other.w.time.advance(2 * MIN);
    assert.equal(other.d.focus.state.value.phase, 'idle');
  });

  it('two devices of one account both start it: one lap, one row', async () => {
    const w = world();
    const a = await w.device('a');
    const b = await w.device('b');
    for (const d of [a, b]) {
      called(d, T0 + 2 * MIN);
      void d.rooms.list.value;
    }
    w.time.advance(2 * MIN);
    w.exchange(a, b);
    assert.deepEqual([a.focus.state.value.run, b.focus.state.value.run], ['call-c1', 'call-c1']);
    w.time.advance(25 * MIN);
    w.exchange(a, b);
    for (const d of [a, b]) assert.deepEqual([d.sessions(), d.engine.rows('session').value.get('call-c1')?.outcome], [['call-c1'], 'rang']);
  });

  it('never before the last run here ended: a bell or a stop just after the call\'s minute, and the called lap begins there, so no minute counts twice', async () => {
    // A lap whose bell went 30 s after the call's minute, and the device heard of the call 40 s after it.
    const { w, d } = await one();
    w.time.advance(30000);
    d.focus.start();
    void d.rooms.list.value;
    w.time.advance(25 * MIN + 10000);
    called(d, T0 + 25 * MIN);
    assert.deepEqual([d.focus.state.value.run, d.focus.state.value.started], ['call-c1', T0 + 25 * MIN + 30000]);
    // A lap stopped 20 s after the call's minute.
    const other = await one();
    other.d.focus.start();
    other.w.time.advance(2 * MIN + 20000);
    other.d.focus.stop();
    other.w.time.advance(20000);
    called(other.d, T0 + 2 * MIN);
    assert.deepEqual([other.d.focus.state.value.run, other.d.focus.state.value.started], ['call-c1', T0 + 2 * MIN + 20000]);
  });

  it('only from what the server has said on this connection: offline, or connected before the room is sent again, a kept call starts nothing', async () => {
    const { w, d } = await one();
    called(d, T0 + 2 * MIN);
    await d.engine.saved();
    const again = await w.restart(d, { online: false });
    void again.rooms.list.value;
    assert.equal(again.rooms.list.value[0]!.call?.id, 'c1', 'the kept call is still shown');
    w.time.advance(2 * MIN);
    assert.equal(again.focus.state.value.phase, 'idle', 'offline: it may have been taken back');
    await again.connect();
    assert.equal(again.focus.state.value.phase, 'idle', 'connected, and the room not said again yet');
    called(again, T0 + 2 * MIN);
    assert.equal(again.focus.state.value.run, 'call-c1', 'the server says the call is still open');
  });

  it('once per device: stopped in its first minute and the app opened again, it does not start again; opened after the minute, nothing starts', async () => {
    const { w, d } = await one();
    called(d, T0 + 2 * MIN);
    void d.rooms.list.value;
    w.time.advance(2 * MIN);
    d.focus.stop();
    await d.engine.saved();
    const again = await w.restart(d);
    called(again, T0 + 2 * MIN);
    void again.rooms.list.value;
    assert.equal(again.focus.state.value.phase, 'idle');
    const late = await one();
    late.w.time.advance(3 * MIN);
    called(late.d, T0 + 2 * MIN);
    void late.d.rooms.list.value;
    assert.equal(late.d.focus.state.value.phase, 'idle');
  });
});

describe('notes', () => {
  const NOTES = '/api/rooms/notes';
  const note = (id: string, from: string | null, at: number, text = 'hello') => ({ id, from, at, text });

  it('fetched when the room has a newer one; new are those from others since Notes was last open off a lap, and a lap keeps them new', async () => {
    const { w, d, r } = await one();
    let held = [note('n1', SACHI, T0 - MIN)];
    w.server.reply = (path) => ({ status: 200, body: path === NOTES ? { notes: held } : {} });
    const since = (id: string) => say(d, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi', { picture: 'ab'.repeat(32) })], { notes_since: id }));
    since('n1');
    await settle();
    assert.deepEqual(r.list.value[0]!.notes, [{ id: 'n1', from: SACHI, name: 'sachi', picture: 'ab'.repeat(32), you: false, at: T0 - MIN, text: 'hello' }]);
    assert.equal(r.list.value[0]!.newNotes, 1);
    // On a lap, opening Notes reads nothing: they fold away.
    d.focus.start();
    r.markNotesRead('r_1');
    held = [note('n2', SACHI, T0 + MIN), ...held];
    w.time.advance(MIN);
    since('n2');
    await settle();
    assert.equal(r.list.value[0]!.newNotes, 2);
    // The lap ends; Notes is open: none new. Your own line is never new to you, and one from someone who left has no name.
    w.time.advance(MIN);
    d.focus.stop();
    r.markNotesRead('r_1');
    assert.equal(r.list.value[0]!.newNotes, 0);
    held = [note('n4', null, T0 + 4 * MIN), note('n3', ME, T0 + 3 * MIN), ...held];
    since('n4');
    await settle();
    assert.deepEqual(r.list.value[0]!.notes.slice(0, 2).map((n) => [n.name, n.you]), [[null, false], ['ravi', true]]);
    assert.equal(r.list.value[0]!.newNotes, 1);
    assert.equal(w.server.requests.filter((q) => q.path === NOTES).length, 3, 'one fetch for each newer note, none for the same');
    // Read survives a restart.
    r.markNotesRead('r_1');
    await d.engine.saved();
    const again = await w.restart(d);
    say(again, room('r_1', [member(ME, 'ravi'), member(SACHI, 'sachi')], { notes_since: 'n4' }));
    await settle();
    assert.equal(again.rooms.list.value[0]!.newNotes, 0);
  });
});

describe('pictures', () => {
  it('fetched once with the token and kept by hash as a URL; one that cannot be had is asked for again next time', async () => {
    const { w, r } = await one();
    const hash = 'cd'.repeat(32);
    const gets = () => w.server.requests.filter((q) => q.path === `/api/pictures/${hash}`).length;
    w.server.reply = () => ({ status: 404, body: {} });
    assert.equal(await r.picture(hash), null);
    w.server.reply = null;
    const url = await r.picture(hash);
    assert.match(url ?? '', /^blob:/);
    assert.equal(await r.picture(hash), url);
    assert.equal(gets(), 2);
    assert.equal(await r.picture('not a hash'), null);
  });

  it('another account signing in starts with none: each picture is asked for again, under its token', async () => {
    const { w, d, r } = await one();
    const hash = 'ef'.repeat(32);
    await r.picture(hash);
    await d.engine.signIn('sam', 'another horse');
    await r.picture(hash);
    const gets = w.server.requests.filter((q) => q.path === `/api/pictures/${hash}`);
    assert.equal(gets.length, 2);
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
