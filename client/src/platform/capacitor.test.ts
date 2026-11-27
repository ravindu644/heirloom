// The phone's notifier against a fake notifications plugin and a fake Countdown plugin, recording
// every bridge call in order. What the native drawer does with a plan is ShadeTest's (android/app/src/test).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { T0, fakeTime, settle } from '../sync/fakes.ts';
import { OLD_IDS, createCapacitorNotifier, whenResumed } from './capacitor.ts';
import type { Alarms, Countdown } from './capacitor.ts';
import { FOLLOWS, heldTaps } from './notifier.ts';
import { createWebNotifier } from './web.ts';

const MIN = 60_000;
type Grant = 'granted' | 'denied' | 'prompt';

function rig({ display = 'granted' as Grant, exact = 'granted' as Grant, answer = 'granted' as Grant, failures = 0, hidden = false, remind = undefined as string | undefined, rings = true, moved = false } = {}) {
  const time = fakeTime();
  // The page: the browser's own notifier on the same fake clock, its bell heard only in view.
  const app = { hidden, resume: [] as (() => void)[] };
  const pageRings: number[] = [];
  const page = createWebNotifier({
    now: time.now,
    schedule: time.schedule,
    hidden: () => app.hidden,
    onShow: (look) => app.resume.push(look),
    bell: () => app.hidden || pageRings.push(time.now()),
  });
  const calls: string[] = [];
  const scheduled: any[] = [];
  const warned: unknown[] = [];
  const state = { display, exact, rings };
  // What the Countdown plugin was sent, method and options, in order.
  const sent: [string, any][] = [];
  // What the plugin holds, by id, as getPending gives it back.
  const held = new Map<number, any>();
  const alarms = {
    async createChannel(channel: any) {
      calls.push(`channel ${channel.id} ${channel.importance}`);
    },
    async schedule(options: any) {
      calls.push('schedule');
      if (failures-- > 0) throw new Error('bridge gone');
      scheduled.push(...options.notifications);
      for (const n of options.notifications) held.set(n.id, n);
      return { notifications: [] };
    },
    async cancel(options: any) {
      calls.push('cancel');
      for (const n of options.notifications) held.delete(n.id);
    },
    async getPending() {
      return { notifications: [...held.values()] };
    },
    async removeDeliveredNotificationsById(options: any) {
      calls.push(`remove ${options.ids.join(',')}`);
    },
    async checkPermissions() {
      return { display: state.display };
    },
    async requestPermissions() {
      calls.push('ask');
      await settle(); // the prompt is up for a while: plans made meanwhile see no permission yet
      state.display = answer;
      return { display: state.display };
    },
    async checkExactNotificationSetting() {
      return { exact_alarm: state.exact };
    },
  } as unknown as Alarms;
  const countdown: Countdown = {
    async plan(options) {
      calls.push('plan');
      if (failures-- > 0) throw new Error('bridge gone');
      sent.push(['plan', options]);
      return { rings: state.rings };
    },
    async call(options) {
      sent.push(['call', options]);
    },
    async keep(options) {
      sent.push(['keep', options]);
    },
    async background() {
      return { unrestricted: false };
    },
    async askUnrestricted() {
      sent.push(['ask', null]);
    },
    async preview(options) {
      sent.push(['preview', options]);
    },
    async addListener(_event, heard) {
      tap = heard;
    },
  };
  // What ActionActivity hands the page when a button is tapped.
  let tap: (data: { act: string; run?: string | null }) => void = () => {};
  const notifier = createCapacitorNotifier({
    alarms,
    countdown,
    now: time.now,
    channels: { countdown: 'Time left', remind },
    warn: (error) => warned.push(error),
    page,
    onResume: (run) => app.resume.push(run),
    moved,
  });
  const resume = () => app.resume.forEach((run) => run());
  const ring = (inMs: number, during?: string) => ({ at: T0 + inMs, title: 'Time for a break', body: '5 minutes', during });
  const done = async () => {
    for (let i = 0; i < 20; i++) await settle();
  };
  const plans = () => sent.filter(([what]) => what === 'plan').map(([, options]) => options);
  return { time, calls, scheduled, warned, state, notifier, ring, done, app, pageRings, resume, held, sent, plans, tapped: (act: string, run: string | null = null) => tap({ act, run }) };
}


const STATE = { phase: 'work', run: 'run-7', task: null, started: T0, paused_at: null, paused_ms: 0, planned_ms: 25 * MIN, set_index: 1 } as const;
const STAMP = '2026-11-24T04:30:00.000Z-0000-a1b2c3d4e5f60718';
const cell = { stamp: STAMP, state: STATE };

describe('the phone notifier', () => {
  it('makes its channels first, which the native side posts on; the old ring channel is no longer made', async () => {
    const { calls, done } = rig({ remind: 'Reminders' });
    await done();
    // The bell's own silent channel is the native side's (Shade.channels), which deletes "ring".
    assert.deepEqual(calls, ['channel countdown 2', 'channel remind 3']);
  });

  it('the first start of this build cancels the bell and the call the notifications plugin held, once', async () => {
    const first = rig({ moved: true });
    await first.done();
    assert.deepEqual(first.calls, ['channel countdown 2', 'cancel']);
    assert.deepEqual(OLD_IDS, [1, 2, 7402]);
    const later = rig();
    await later.done();
    assert.ok(!later.calls.includes('cancel'));
  });

  it('hands the native side the timer cell with the plan, in whole ms', async () => {
    const { notifier, plans, ring, done } = rig();
    notifier.plan({ ...ring(25 * MIN, 'Lap 2 today'), at: T0 + 25 * MIN + 0.4 }, cell);
    await done();
    assert.deepEqual(plans(), [{ stamp: STAMP, state: STATE, ring: { ...ring(25 * MIN, 'Lap 2 today'), at: T0 + 25 * MIN }, off: false }]);
  });

  it('the first plan always goes, even null, and the same plan twice goes once', async () => {
    const { notifier, plans, ring, done } = rig();
    notifier.plan(null);
    notifier.plan(ring(25 * MIN), cell);
    notifier.plan(ring(25 * MIN), cell);
    await done();
    assert.deepEqual(plans().map((p) => p.ring?.at ?? null), [null, T0 + 25 * MIN]);
    assert.equal(plans()[0].stamp, null);
  });

  it('a new stamp for the same plan goes again: the native side keeps the newer feed', async () => {
    const { notifier, plans, ring, done } = rig();
    notifier.plan(ring(25 * MIN), cell);
    notifier.plan(ring(25 * MIN), { ...cell, stamp: STAMP.replace('30:00', '30:01') });
    await done();
    assert.equal(plans().length, 2);
  });

  it('when Android will not ring it, the page rings once if it is on screen at the time', async () => {
    const { time, pageRings, notifier, ring, done } = rig({ rings: false });
    notifier.plan(ring(25 * MIN), cell);
    await done();
    time.advance(25 * MIN);
    assert.deepEqual(pageRings, [T0 + 25 * MIN]);
  });

  it('when Android rings it, the page does not ring a second one', async () => {
    const { time, pageRings, notifier, ring, done } = rig();
    notifier.plan(ring(25 * MIN), cell);
    await done();
    time.advance(30 * MIN);
    assert.deepEqual(pageRings, []);
  });

  it('a bridge call that fails is reported, and the next plan still goes', async () => {
    const { notifier, plans, warned, ring, done } = rig({ failures: 1 });
    notifier.plan(ring(25 * MIN), cell);
    notifier.plan(ring(30 * MIN), cell);
    await done();
    assert.equal(warned.length, 1);
    assert.deepEqual(plans().map((p) => p.ring.at), [T0 + 30 * MIN]);
  });

  it('a bridge that fails to take the plan leaves the bell to the page, if it is on screen', async () => {
    const { time, pageRings, notifier, warned, ring, done } = rig({ failures: 1 });
    notifier.plan(ring(25 * MIN), cell);
    await done();
    time.advance(25 * MIN);
    assert.equal(warned.length, 1);
    assert.deepEqual(pageRings, [T0 + 25 * MIN]);
  });

  it('the start that asks for permission plans again once it is given', async () => {
    const { notifier, plans, ring, done } = rig({ display: 'prompt' });
    notifier.plan(ring(25 * MIN), cell);
    assert.equal(await notifier.allow(), true);
    await done();
    assert.equal(plans().length, 2);
  });

  it('allow is false when exact alarms are off, and false when the person says no', async () => {
    assert.equal(await rig({ display: 'prompt', exact: 'denied' }).notifier.allow(), false);
    assert.equal(await rig({ display: 'prompt', answer: 'denied' }).notifier.allow(), false);
  });

  it('coming back to the app plans again: permission may have been given in settings', async () => {
    const { notifier, plans, ring, done, resume } = rig();
    notifier.plan(ring(25 * MIN), cell);
    await done();
    resume();
    await done();
    assert.equal(plans().length, 2);
  });
});

describe('ring here, on the phone', () => {
  it('off sends the timer with no plan, so nothing is drawn; on again sends the bell', async () => {
    const { notifier, plans, ring, done } = rig();
    notifier.plan(ring(25 * MIN), cell);
    notifier.ringHere(false);
    notifier.ringHere(true);
    await done();
    // Off says why the plan is empty: the native side takes back even a bell already due.
    assert.deepEqual(plans().map((p) => [p.stamp, p.ring?.at ?? null, p.off]), [
      [STAMP, T0 + 25 * MIN, false],
      [STAMP, null, true],
      [STAMP, T0 + 25 * MIN, false],
    ]);
  });

  it('off, the page keeps quiet too, even when Android cannot ring', async () => {
    const { time, pageRings, notifier, ring, done } = rig({ rings: false });
    notifier.plan(ring(25 * MIN), cell);
    notifier.ringHere(false);
    await done();
    time.advance(60 * MIN);
    assert.deepEqual(pageRings, []);
  });
});

describe('the countdown\'s buttons', () => {
  it('a tap reaches the app with the run its button was drawn for; one made before it listens (it opened the app) keeps its run', async () => {
    const { notifier, tapped } = rig();
    tapped('pause', 'run-6');
    tapped('nonsense', 'run-6');
    const heard: [string, string | null][] = [];
    notifier.onAction((act, run) => heard.push([act, run]));
    tapped('stop', 'run-7');
    tapped('resume');
    assert.deepEqual(heard, [
      ['pause', 'run-6'],
      ['stop', 'run-7'],
      ['resume', null],
    ]);
  });

  it("the bell's answers reach the app as the countdown's buttons do", () => {
    const { notifier, tapped } = rig();
    const heard: [string, string | null][] = [];
    notifier.onAction((act, run) => heard.push([act, run]));
    for (const act of ['break', 'next', 'rest']) tapped(act, 'run-7');
    assert.deepEqual(heard, [
      ['break', 'run-7'],
      ['next', 'run-7'],
      ['rest', 'run-7'],
    ]);
  });

  it('a bell from Settings is played by the phone', async () => {
    const { notifier, sent, done } = rig();
    notifier.preview('struck');
    await done();
    assert.deepEqual(sent, [['preview', { sound: 'struck' }]]);
  });
});

describe('a tap for a run the page has not heard of yet', () => {
  const rigTaps = (run: string | null) => {
    const state = { run, caughtUp: false };
    const done: string[] = [];
    const taps = heldTaps(() => state.run, () => state.caughtUp, (act) => done.push(act));
    return { state, done, taps };
  };

  it('waits for the page to catch up and is done once the run arrives: a lap the service drew while the app was closed', () => {
    const { state, done, taps } = rigTaps('run-1');
    taps.tap('pause', 'run-2');
    taps.look();
    assert.deepEqual(done, []);
    state.run = 'run-2';
    taps.look();
    state.caughtUp = true;
    taps.look();
    assert.deepEqual(done, ['pause']);
  });

  it('is dropped once the page has caught up and the run is still not the timer\'s', () => {
    const { state, done, taps } = rigTaps('run-1');
    taps.tap('stop', 'run-0');
    state.caughtUp = true;
    taps.look();
    state.run = 'run-0';
    taps.look();
    assert.deepEqual(done, []);
  });

  it('the timer\'s own run is done at once, and a stale one is dropped at once when the page is in step', () => {
    const { state, done, taps } = rigTaps('run-1');
    taps.tap('pause', 'run-1');
    state.caughtUp = true;
    taps.tap('stop', 'run-0');
    state.run = 'run-0';
    taps.look();
    assert.deepEqual(done, ['pause']);
  });
});

describe('"Done for now" on a bell whose next phase started by itself', () => {
  it('stops the phase that followed: its run is the bell\'s with the suffix', () => {
    const state = { run: 'run-7' + FOLLOWS, caughtUp: true };
    const done: string[] = [];
    const taps = heldTaps(() => state.run, () => state.caughtUp, (act) => done.push(act));
    taps.tap('rest', 'run-7');
    assert.deepEqual(done, ['rest']);
  });

  it('only "Done for now" matches the run that followed; the break or the next lap were already started', () => {
    const state = { run: 'run-7' + FOLLOWS, caughtUp: true };
    const done: string[] = [];
    const taps = heldTaps(() => state.run, () => state.caughtUp, (act) => done.push(act));
    taps.tap('break', 'run-7');
    taps.tap('next', 'run-7');
    taps.tap('rest', 'run-6');
    assert.deepEqual(done, []);
  });

  it('held while the page catches up to the phase that followed', () => {
    const state = { run: 'run-7', caughtUp: false };
    const done: string[] = [];
    const taps = heldTaps(() => state.run, () => state.caughtUp, (act) => done.push(act));
    state.run = 'run-6';
    taps.tap('rest', 'run-7');
    state.run = 'run-7' + FOLLOWS;
    state.caughtUp = true;
    taps.look();
    assert.deepEqual(done, ['rest']);
  });
});

describe('keeping step while closed', () => {
  const words = {
    bell: { lap: [], take: [], next: [], break: '' },
    during: { work: 'A lap', short: 'Short break', long: 'Long break' },
    actions: { pause: 'Pause', resume: 'Resume', stop: 'Stop', done: 'Done for now' },
    answer: { break: ['Take five', 'Take five', 'Take five', 'Take 15 minutes'], next: 'Start the next lap', rest: 'Done for now' },
    left: 'Paused, {t} left',
    note: { title: '{room}', body: '{name}: {text}' },
    call: { title: '{name} calls a lap at {time}', body: '{room}', in: "I'm in", out: "I'm out", youre: "You're in. It starts at {time}.", unreached: 'Could not reach your server.' },
    starts: { title: 'The lap together starts', body: '{room}', with: '{room}, with {name}' },
    keeping: 'heirloom is keeping in step',
    channels: { keep: 'Keeping in step', rooms: 'Rooms', bell: 'Bell' },
  };
  const link = { server: 'https://h.example', account: 'a_1', token: 't', device: 'd', cursor: 1042, on: true, words, ringing: { sound: 'school' as const, vibrate: true, silent: true }, auto: { break: false, work: false } };

  it('sends the link once per change, the cursor alone being none, and the plan again after it', async () => {
    const { notifier, sent, ring, done } = rig();
    notifier.plan(ring(25 * MIN), cell);
    notifier.keep(link);
    notifier.keep({ ...link, cursor: 1100 });
    notifier.keep({ ...link, on: false });
    notifier.keep(null);
    await done();
    assert.deepEqual(sent.map(([what, o]) => (what === 'keep' ? (o && o.on) : what)), ['plan', true, 'plan', false, 'plan', null, 'plan']);
  });

  it('asks Android whether heirloom may be stopped, and opens its request from a tap', async () => {
    const { notifier, sent, done } = rig();
    assert.deepEqual(await notifier.background(), { unrestricted: false });
    notifier.askUnrestricted();
    await done();
    assert.deepEqual(sent, [['ask', null]]);
  });
});

describe('a called lap, on the phone', () => {
  const call = (inMs: number, body = 'Study club, with lina') => ({ id: 'c1', at: T0 + inMs + 0.3, title: 'The lap together starts', body });
  const calls = (sent: [string, any][]) => sent.filter(([what]) => what === 'call').map(([, o]) => o);

  it('goes to the native side in whole ms, once per change; nothing until main says', async () => {
    const { notifier, sent, done } = rig();
    notifier.ringHere(true);
    notifier.call(call(10 * MIN));
    notifier.call(call(10 * MIN));
    notifier.call(null);
    await done();
    assert.deepEqual(calls(sent), [{ ...call(10 * MIN), at: T0 + 10 * MIN }, null]);
  });

  it('ring here off takes it off, on again sets it; coming back sends it again', async () => {
    const { notifier, sent, done, resume } = rig();
    notifier.call(call(10 * MIN));
    notifier.ringHere(false);
    notifier.ringHere(true);
    resume();
    await done();
    assert.deepEqual(calls(sent).map((o) => o && o.id), ['c1', null, 'c1', 'c1']);
  });
});

describe('habit reminders, on the phone', () => {
  // T0 is Tuesday 24 November 2026, 10:00 in Colombo (the zone these tests run in).
  process.env.TZ = 'Asia/Colombo';
  const DAILY = 0b1111111;
  const habit = (id: string, time: string, days = DAILY, doneToday = false) => ({ habit: id, title: `${id}?`, body: 'Five minutes is enough.', time, days, doneToday });
  const reminders = (held: Map<number, any>) =>
    [...held.values()].filter((n) => n.id >= 100_000).map((n) => [new Date(n.schedule.at).toString().slice(0, 21), n.title]).sort();

  it('schedules each planned day of the next fourteen, on their own quiet-but-audible channel, as exact alarms', async () => {
    const { notifier, done, held, calls } = rig({ remind: 'Habits' });
    notifier.reminders([habit('walk', '18:00'), habit('read', '07:30', 0b0000001)]);
    await done();
    assert.ok(calls.includes('channel remind 3'));
    const got = reminders(held);
    // walk: today 18:00 and the 13 days after; read: Mondays only, 30 November and 7 December.
    assert.equal(got.filter(([, t]) => t === 'walk?').length, 14);
    assert.deepEqual(got.filter(([, t]) => t === 'read?').map(([at]) => at), ['Mon Dec 07 2026 07:30', 'Mon Nov 30 2026 07:30']);
    for (const n of [...held.values()].filter((n) => n.id >= 100_000)) {
      assert.equal(n.channelId, 'remind');
      // Exact: inexact ones came up to an hour late on the Samsung. The plugin's default is exact.
      assert.notEqual(n.isExactNotification, false);
      assert.equal(n.schedule.allowWhileIdle, true);
    }
  });

  it('today is left out once the habit is done, and kept while it is not', async () => {
    const { notifier, done, held, calls } = rig({ remind: 'Habits' });
    notifier.reminders([habit('walk', '18:00')]);
    await done();
    assert.ok(reminders(held).some(([at]) => at === 'Tue Nov 24 2026 18:00'));
    const before = calls.length;
    notifier.reminders([habit('walk', '18:00', DAILY, true)]);
    await done();
    assert.ok(!reminders(held).some(([at]) => at === 'Tue Nov 24 2026 18:00'));
    assert.equal(reminders(held).length, 13);
    // Only today's was touched: cancelled, taken out of the shade, nothing scheduled again.
    assert.equal(calls.slice(before).length, 2);
    assert.equal(calls.slice(before)[0], 'cancel');
    assert.match(calls.slice(before)[1]!, /^remove \d+$/);
  });

  it('the set is applied exactly: a habit gone loses its reminders, a changed time moves them', async () => {
    const { notifier, done, held } = rig({ remind: 'Habits' });
    notifier.reminders([habit('walk', '18:00'), habit('read', '07:30')]);
    await done();
    notifier.reminders([habit('walk', '19:15')]);
    await done();
    const got = reminders(held);
    assert.equal(got.length, 14);
    assert.ok(got.every(([at, title]) => title === 'walk?' && at.endsWith('19:15')));
  });

  it('the same set twice cancels and schedules nothing the second time', async () => {
    const { notifier, done, calls } = rig({ remind: 'Habits' });
    notifier.reminders([habit('walk', '18:00'), habit('read', '07:30')]);
    await done();
    const before = calls.length;
    notifier.reminders([habit('walk', '18:00'), habit('read', '07:30')]);
    await done();
    assert.deepEqual(calls.slice(before), []);
  });

  it('ring here off, or no permission, or no channel named: none are held', async () => {
    const off = rig({ remind: 'Habits' });
    off.notifier.reminders([habit('walk', '18:00')]);
    await off.done();
    off.notifier.ringHere(false);
    await off.done();
    assert.deepEqual(reminders(off.held), []);

    for (const options of [{ remind: 'Habits', display: 'denied' as Grant }, { remind: 'Habits', display: 'prompt' as Grant }, {}]) {
      const { notifier, done, held, calls } = rig(options);
      notifier.reminders([habit('walk', '18:00')]);
      await done();
      assert.deepEqual(reminders(held), []);
      assert.ok(!calls.includes('ask'));
    }
  });

  it('coming to the front rebuilds: the window moves on with the days', async () => {
    const { time, notifier, done, held, resume } = rig({ remind: 'Habits' });
    notifier.reminders([habit('walk', '18:00')]);
    await done();
    time.jump(3 * 24 * 60 * MIN);
    resume();
    await done();
    const future = [...held.values()].filter((n) => n.id >= 100_000 && new Date(n.schedule.at).getTime() > time.now());
    assert.equal(future.length, 14);
    assert.ok(reminders(held).some(([at]) => at === 'Thu Dec 10 2026 18:00'));
  });

  it('a reminder past its time today is still ours: kept while not done, cancelled and taken out of the shade once checked in', async () => {
    const { time, notifier, done, held, calls } = rig({ remind: 'Habits' });
    notifier.reminders([habit('walk', '10:30')]);
    await done();
    const today = [...held.values()].find((n) => new Date(n.schedule.at).getDate() === 24)!;
    // 10:31: Android may not have shown it yet (it was late on the Samsung), or it sits in the shade.
    time.jump(31 * MIN);
    const before = calls.length;
    notifier.reminders([habit('walk', '10:30')]);
    await done();
    assert.deepEqual(calls.slice(before), []);
    notifier.reminders([habit('walk', '10:30', DAILY, true)]);
    await done();
    assert.deepEqual(calls.slice(before), ['cancel', `remove ${today.id}`]);
    assert.ok(!held.has(today.id));
  });

  it('never schedules a reminder whose time has passed: the plugin would show it at once', async () => {
    const { time, notifier, done, held } = rig({ remind: 'Habits' });
    time.jump(31 * MIN);
    notifier.reminders([habit('walk', '10:30')]);
    await done();
    assert.ok(reminders(held).every(([at]) => !at.startsWith('Tue Nov 24')));
    assert.equal(reminders(held).length, 13);
  });

  it('a task reminder: scheduled once, and when the task is done or deleted, cancelled and out of the shade', async () => {
    const { time, notifier, done, held, calls } = rig({ remind: 'Reminders' });
    const task = { habit: 'task-1', title: 'Write the intro', body: '', time: '10:30', days: 127, doneToday: false, day: '2026-11-24' };
    notifier.reminders([habit('walk', '18:00'), task]);
    await done();
    const ours = [...held.values()].filter((n) => n.id >= 200_000);
    assert.deepEqual(ours.map((n) => [n.title, new Date(n.schedule.at).toString().slice(0, 21)]), [['Write the intro', 'Tue Nov 24 2026 10:30']]);
    assert.notEqual(ours[0].isExactNotification, false);
    // 10:31: it has fired and sits in the shade; the task is done, so it leaves the set.
    time.jump(31 * MIN);
    const before = calls.length;
    notifier.reminders([habit('walk', '18:00')]);
    await done();
    assert.deepEqual(calls.slice(before), ['cancel', `remove ${ours[0].id}`]);
    assert.equal(reminders(held).filter(([, t]) => t === 'walk?').length, 14);
  });

  it('several times a day: a check-in for one place takes only that one out of the shade; a place that goes is cancelled', async () => {
    const { time, notifier, done, held, calls } = rig({ remind: 'Reminders' });
    const places = (done1: boolean) => [habit('water#0', '10:20'), habit('water#1', '10:40', DAILY, done1), habit('water#2', '18:00')];
    notifier.reminders(places(false));
    await done();
    const today = (title: string, at: string) => [...held.values()].find((n) => n.title === title && new Date(n.schedule.at).toString().slice(16, 21) === at && new Date(n.schedule.at).getDate() === 24);
    const first = today('water#0?', '10:20')!;
    const second = today('water#1?', '10:40')!;
    // 10:45: both have been shown. The second place is checked in.
    time.jump(45 * MIN);
    let before = calls.length;
    notifier.reminders(places(true));
    await done();
    assert.deepEqual(calls.slice(before), ['cancel', `remove ${second.id}`]);
    assert.ok(held.has(first.id));
    // The third time is taken off the habit: all of its days go.
    before = calls.length;
    notifier.reminders(places(true).slice(0, 2));
    await done();
    assert.equal(calls.slice(before)[0], 'cancel');
    assert.ok(![...held.values()].some((n) => n.title === 'water#2?'));
  });

  it('ten habits planned every day fit, far under the 500 alarms Android allows an app', async () => {
    const { notifier, done, held } = rig({ remind: 'Habits' });
    notifier.reminders(Array.from({ length: 10 }, (_, i) => habit(`habit${i}`, `0${i}:30`)));
    await done();
    // Every time is before 10:00, so today's have passed: thirteen days each.
    assert.equal(reminders(held).length, 10 * 13);
    assert.equal(new Set([...held.keys()]).size, held.size);
  });
});

describe('can the phone ring', () => {
  it('true when allowed or not asked yet, false only when notifications or exact alarms are refused, and it never asks', async () => {
    const cases: [Grant, Grant, boolean][] = [
      ['granted', 'granted', true],
      ['prompt', 'granted', true],
      ['denied', 'granted', false],
      ['granted', 'denied', false],
      ['denied', 'denied', false],
    ];
    for (const [display, exact, expected] of cases) {
      const { notifier, calls } = rig({ display, exact });
      assert.equal(await notifier.canRing(), expected, `${display}, ${exact}`);
      assert.ok(!calls.includes('ask'));
    }
  });

  it('a bridge that fails is not a refusal', async () => {
    const { notifier, state, warned } = rig();
    Object.defineProperty(state, 'display', {
      get() {
        throw new Error('bridge gone');
      },
    });
    assert.equal(await notifier.canRing(), true);
    assert.equal(warned.length, 1);
  });
});

describe('in front again, on the phone', () => {
  it("is Capacitor's resume", () => {
    const seen: [string, () => void][] = [];
    let runs = 0;
    whenResumed({ addListener: (event, run) => seen.push([event, run]) })(() => runs++);
    assert.deepEqual(seen.map(([event]) => event), ['resume']);
    seen[0]![1]();
    assert.equal(runs, 1);
  });
});
