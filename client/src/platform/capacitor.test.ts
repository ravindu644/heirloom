// The phone's notifier against a fake notifications plugin and a fake countdown, recording every
// bridge call in order, so what Android is asked to do can be read straight off the log.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { T0, fakeTime, settle } from '../sync/fakes.ts';
import { RING_ID, createCapacitorNotifier, whenResumed } from './capacitor.ts';
import type { Alarms, Countdown } from './capacitor.ts';
import { createWebNotifier } from './web.ts';

const MIN = 60_000;
type Grant = 'granted' | 'denied' | 'prompt';

function rig({ display = 'granted' as Grant, exact = 'granted' as Grant, answer = 'granted' as Grant, failures = 0, hidden = false, remind = undefined as string | undefined } = {}) {
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
  const shown: any[] = [];
  const warned: unknown[] = [];
  const state = { display, exact };
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
    async show(options) {
      calls.push('countdown');
      shown.push(options);
    },
    async clear() {
      calls.push('clear');
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
    channels: { ring: 'Bell', countdown: 'Time left', remind },
    warn: (error) => warned.push(error),
    page,
    onResume: (run) => app.resume.push(run),
  });
  const resume = () => app.resume.forEach((run) => run());
  const ring = (inMs: number, during?: string) => ({ at: T0 + inMs, title: 'Time for a break', body: '5 minutes', during });
  const done = async () => {
    for (let i = 0; i < 20; i++) await settle();
  };
  return { time, calls, scheduled, shown, warned, state, notifier, ring, done, app, pageRings, resume, held, tapped: (act: string, run: string | null = null) => tap({ act, run }) };
}

describe('the phone notifier', () => {
  it('makes its two channels first: a loud one for the bell, a quiet one for the countdown', async () => {
    const { calls, done } = rig();
    await done();
    assert.deepEqual(calls, ['channel ring 4', 'channel countdown 2']);
  });

  it('schedules one exact alarm that fires in Doze, with the words and the countdown', async () => {
    const { calls, scheduled, shown, notifier, ring, done } = rig();
    notifier.plan(ring(25 * MIN, 'Lap 2 of 4'));
    await done();
    assert.deepEqual(calls.slice(2), ['cancel', 'schedule', 'countdown']);
    assert.equal(scheduled.length, 1);
    const [n] = scheduled;
    assert.equal(n.id, RING_ID);
    assert.equal(n.channelId, 'ring');
    assert.equal(n.title, 'Time for a break');
    assert.equal(n.body, '5 minutes');
    assert.equal(n.schedule.allowWhileIdle, true);
    assert.equal(n.schedule.at.getTime(), T0 + 25 * MIN);
    assert.notEqual(n.isExactNotification, false);
    assert.deepEqual(shown, [{ title: 'Lap 2 of 4', end: T0 + 25 * MIN, channel: 'countdown' }]);
  });

  it('a new plan cancels the old alarm and schedules the new one, on the same id', async () => {
    const { calls, scheduled, notifier, ring, done } = rig();
    notifier.plan(ring(25 * MIN));
    notifier.plan(ring(30 * MIN));
    await done();
    assert.deepEqual(calls.slice(2), ['cancel', 'schedule', 'clear', 'cancel', 'schedule', 'clear']);
    assert.deepEqual(
      scheduled.map((n) => [n.id, n.schedule.at.getTime()]),
      [
        [RING_ID, T0 + 25 * MIN],
        [RING_ID, T0 + 30 * MIN],
      ],
    );
  });

  it('null cancels the alarm and takes the countdown away', async () => {
    const { calls, notifier, ring, done } = rig();
    notifier.plan(ring(25 * MIN, 'Lap 1 of 4'));
    notifier.plan(null);
    await done();
    assert.deepEqual(calls.slice(-2), ['cancel', 'clear']);
  });

  it('the first plan always runs, even null: an alarm from the app’s last life must not ring for a stopped timer', async () => {
    const { calls, notifier, done } = rig();
    notifier.plan(null);
    await done();
    assert.deepEqual(calls.slice(2), ['cancel', 'clear']);
  });

  it('the same plan twice is one alarm', async () => {
    const { scheduled, notifier, ring, done } = rig();
    notifier.plan(ring(25 * MIN, 'Lap 1 of 4'));
    notifier.plan(ring(25 * MIN, 'Lap 1 of 4'));
    await done();
    notifier.plan(ring(25 * MIN, 'Lap 1 of 4'));
    await done();
    assert.equal(scheduled.length, 1);
  });

  it('a plan in the past, or within a moment of now, schedules nothing and cancels what was there', async () => {
    const { calls, scheduled, notifier, ring, done } = rig();
    notifier.plan(ring(25 * MIN));
    await done();
    notifier.plan(ring(-60 * MIN));
    notifier.plan(ring(200));
    await done();
    assert.equal(scheduled.length, 1);
    assert.deepEqual(calls.slice(-2), ['cancel', 'clear']);
  });

  it('without permission to notify, or without exact alarms, it schedules nothing and never asks', async () => {
    for (const lacking of [{ display: 'prompt' as Grant }, { display: 'denied' as Grant }, { exact: 'denied' as Grant }]) {
      const { calls, scheduled, notifier, ring, done } = rig(lacking);
      notifier.plan(ring(25 * MIN, 'Lap 1 of 4'));
      await done();
      assert.equal(scheduled.length, 0);
      assert.ok(!calls.includes('ask'));
      assert.deepEqual(calls.slice(-2), ['cancel', 'clear']);
    }
  });

  it('the start that asks for permission still gets its bell once it is given', async () => {
    const { scheduled, notifier, ring, done } = rig({ display: 'prompt' });
    // main.tsx: `void notifier.allow(), focus.start(task)`; the plan lands while the prompt is up.
    const allowed = notifier.allow();
    notifier.plan(ring(25 * MIN, 'Lap 1 of 4'));
    assert.equal(await allowed, true);
    await done();
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].schedule.at.getTime(), T0 + 25 * MIN);
  });

  it('allow is false when exact alarms are off, and false when the person says no', async () => {
    assert.equal(await rig({ exact: 'denied' }).notifier.allow(), false);
    assert.equal(await rig({ display: 'prompt', answer: 'denied' }).notifier.allow(), false);
    assert.equal(await rig().notifier.allow(), true);
  });

  it('a bridge call that fails is reported, and the next plan still runs', async () => {
    const { scheduled, warned, notifier, ring, done } = rig({ failures: 1 });
    notifier.plan(ring(25 * MIN));
    notifier.plan(ring(30 * MIN));
    await done();
    assert.equal(warned.length, 1);
    assert.deepEqual(
      scheduled.map((n) => n.schedule.at.getTime()),
      [T0 + 30 * MIN],
    );
  });

  it('whole milliseconds reach the native side, which reads the end as a long', async () => {
    const { scheduled, shown, notifier, done } = rig();
    notifier.plan({ at: T0 + 25 * MIN + 0.6, title: 't', body: 'b', during: 'Lap 1 of 4' });
    await done();
    assert.equal(scheduled[0].schedule.at.getTime(), T0 + 25 * MIN + 1);
    assert.equal(shown[0].end, T0 + 25 * MIN + 1);
  });

  it('without permission, the page rings the bell once if it is on screen at the time', async () => {
    const { time, pageRings, notifier, ring, done } = rig({ display: 'denied' });
    notifier.plan(ring(25 * MIN));
    await done();
    time.advance(60 * MIN);
    assert.deepEqual(pageRings, [T0 + 25 * MIN]);
  });

  it('without permission and out of sight, nothing rings, then or on coming back', async () => {
    const { time, app, pageRings, scheduled, notifier, ring, done, resume } = rig({ display: 'denied', hidden: true });
    notifier.plan(ring(25 * MIN));
    await done();
    time.advance(25 * MIN + 30_000);
    app.hidden = false;
    resume();
    await done();
    time.advance(60 * MIN);
    assert.deepEqual(pageRings, []);
    assert.equal(scheduled.length, 0);
  });

  it('permission given in settings while away: coming back schedules the pending bell, once', async () => {
    const { time, state, scheduled, pageRings, notifier, ring, done, resume } = rig({ display: 'denied' });
    notifier.plan(ring(25 * MIN, 'Lap 1 of 4'));
    await done();
    assert.equal(scheduled.length, 0);
    time.advance(5 * MIN);
    state.display = 'granted';
    resume();
    resume();
    await done();
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].schedule.at.getTime(), T0 + 25 * MIN);
    // Android has it now: the page keeps quiet at the bell.
    time.advance(60 * MIN);
    assert.deepEqual(pageRings, []);
  });

  it('with permission, the notification is the bell and the page does not ring a second one', async () => {
    const { time, scheduled, pageRings, notifier, ring, done } = rig();
    notifier.plan(ring(25 * MIN));
    await done();
    time.advance(60 * MIN);
    assert.equal(scheduled.length, 1);
    assert.deepEqual(pageRings, []);
  });
});

describe('ring here, on the phone', () => {
  it('off cancels the alarm and clears the countdown, plans nothing while off, and on again schedules the bell', async () => {
    const { calls, scheduled, notifier, ring, done } = rig();
    notifier.plan(ring(25 * MIN, 'Lap 1 of 4'));
    await done();
    notifier.ringHere(false);
    await done();
    assert.deepEqual(calls.slice(-2), ['cancel', 'clear']);
    notifier.plan(ring(30 * MIN, 'Lap 1 of 4'));
    await done();
    assert.equal(scheduled.length, 1);
    notifier.ringHere(true);
    await done();
    assert.deepEqual(
      scheduled.map((n) => n.schedule.at.getTime()),
      [T0 + 25 * MIN, T0 + 30 * MIN],
    );
  });

  it('off, the page keeps quiet too, even without permission', async () => {
    const { time, pageRings, notifier, ring, done } = rig({ display: 'denied' });
    notifier.plan(ring(25 * MIN));
    notifier.ringHere(false);
    await done();
    time.advance(60 * MIN);
    assert.deepEqual(pageRings, []);
  });
});

describe('the countdown and its buttons', () => {
  const ACTIONS = { pause: 'Pause', resume: 'Resume', stop: 'Stop', run: 'run-7' };
  const lap = (inMs: number, during = 'Lap 1 of 4') => ({ at: T0 + inMs, title: 'Lap 1 of 4, done.', body: 'Take five.', during, actions: ACTIONS });
  const still = { paused: true as const, during: 'Lap 1 of 4, paused', left: '12:34 left', actions: ACTIONS };

  it('while a lap runs, the countdown carries Pause and Stop, worded by the caller', async () => {
    const { notifier, done, shown } = rig();
    notifier.plan(lap(25 * MIN));
    await done();
    assert.deepEqual(shown.at(-1), {
      title: 'Lap 1 of 4',
      end: T0 + 25 * MIN,
      channel: 'countdown',
      actions: [
        { act: 'pause', label: 'Pause', run: 'run-7' },
        { act: 'stop', label: 'Stop', run: 'run-7' },
      ],
    });
  });

  it('paused: the bell is taken back and a still notification offers Resume and Stop; resuming arms it again', async () => {
    const { notifier, done, shown, held, calls, scheduled } = rig();
    notifier.plan(lap(25 * MIN));
    await done();
    notifier.plan(still);
    await done();
    assert.ok(!held.has(RING_ID));
    assert.deepEqual(shown.at(-1), {
      title: 'Lap 1 of 4, paused',
      text: '12:34 left',
      channel: 'countdown',
      actions: [
        { act: 'resume', label: 'Resume', run: 'run-7' },
        { act: 'stop', label: 'Stop', run: 'run-7' },
      ],
    });
    assert.equal(calls.at(-1), 'countdown');
    notifier.plan(lap(30 * MIN));
    await done();
    assert.equal(scheduled.at(-1).schedule.at.getTime(), T0 + 30 * MIN);
    assert.equal(shown.at(-1).end, T0 + 30 * MIN);
  });

  it('a stop clears the still one too', async () => {
    const { notifier, done, calls } = rig();
    notifier.plan(still);
    await done();
    notifier.plan(null);
    await done();
    assert.equal(calls.at(-1), 'clear');
  });

  it('the same bell with another line redraws the countdown only: the alarm is not touched', async () => {
    const { notifier, done, shown, calls } = rig();
    notifier.plan(lap(25 * MIN, 'Lap 1 of 4'));
    await done();
    const before = calls.length;
    notifier.plan(lap(25 * MIN, 'Lap 1 of 4, on the intro'));
    await done();
    assert.deepEqual(calls.slice(before), ['countdown']);
    assert.equal(shown.at(-1).title, 'Lap 1 of 4, on the intro');
  });

  it('other words for the bell itself set the same alarm again, at the same moment, on the same id', async () => {
    const { notifier, done, scheduled } = rig();
    notifier.plan(lap(25 * MIN));
    await done();
    notifier.plan({ ...lap(25 * MIN), body: 'Take ten.' });
    await done();
    assert.deepEqual(
      scheduled.map((n) => [n.id, n.schedule.at.getTime(), n.body]),
      [
        [RING_ID, T0 + 25 * MIN, 'Take five.'],
        [RING_ID, T0 + 25 * MIN, 'Take ten.'],
      ],
    );
  });

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

  it('ring here off: no still notification either', async () => {
    const { notifier, done, calls } = rig();
    notifier.ringHere(false);
    notifier.plan(still);
    await done();
    assert.ok(!calls.includes('countdown'));
  });
});

describe('a bell whose time has come', () => {
  const lap = (inMs: number) => ({ at: T0 + inMs, title: 'Lap 1 of 4, done.', body: 'Take five.', during: 'Lap 1 of 4' });
  const rest = (inMs: number) => ({ at: T0 + inMs, title: 'Break over.', body: 'Lap 2 is next.', during: 'Short break' });

  it('is left to Android when the timer stops running at the bell, even if Android is late', async () => {
    const { time, notifier, done, held, calls } = rig();
    notifier.plan(lap(MIN));
    await done();
    // The page's own timer reaches the bell first: the lap stops running and plans nothing.
    time.jump(MIN + 800);
    notifier.plan(null);
    await done();
    assert.equal(held.get(RING_ID)?.title, 'Lap 1 of 4, done.');
    assert.equal(calls.at(-1), 'clear');
  });

  it('with the break started by itself, the break goes on the other id and the lap still rings', async () => {
    const { time, notifier, done, held } = rig();
    notifier.plan(lap(MIN));
    await done();
    time.jump(MIN + 800);
    notifier.plan(rest(MIN + 5 * MIN));
    await done();
    assert.equal(held.get(RING_ID)?.title, 'Lap 1 of 4, done.');
    assert.equal(held.get(RING_ID + 1)?.title, 'Break over.');
  });

  it('the break planned a moment after the lap planned nothing still goes on the other id', async () => {
    const { time, notifier, done, held } = rig();
    notifier.plan(lap(MIN));
    await done();
    time.jump(MIN + 300);
    notifier.plan(null);
    await done();
    time.jump(500);
    notifier.plan(rest(MIN + 5 * MIN));
    await done();
    assert.equal(held.get(RING_ID)?.title, 'Lap 1 of 4, done.');
    assert.equal(held.get(RING_ID + 1)?.title, 'Break over.');
  });

  it('a real stop before the bell still cancels, and the ids take turns so no more than two bells are ever held', async () => {
    const { time, notifier, done, held, scheduled } = rig();
    notifier.plan(lap(MIN));
    await done();
    time.jump(MIN + 800);
    notifier.plan(rest(6 * MIN));
    await done();
    time.jump(5 * MIN);
    // The break rang too; the next lap goes back on the first id, which clears the old bell from the shade.
    notifier.plan(lap(6 * MIN + 1000 + 25 * MIN));
    await done();
    assert.deepEqual(scheduled.map((n) => n.id), [RING_ID, RING_ID + 1, RING_ID]);
    // Stopped halfway through: that bell is taken back, the rung break is not touched.
    notifier.plan(null);
    await done();
    assert.ok(!held.has(RING_ID));
    assert.equal(held.get(RING_ID + 1)?.title, 'Break over.');
  });

  it('switching ring here off takes back even a bell whose time has come', async () => {
    const { time, notifier, done, held } = rig();
    notifier.plan(lap(MIN));
    await done();
    time.jump(MIN + 300);
    notifier.ringHere(false);
    await done();
    assert.ok(!held.has(RING_ID));
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

