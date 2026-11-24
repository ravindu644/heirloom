// The phone's notifier against a fake notifications plugin and a fake countdown, recording every
// bridge call in order, so what Android is asked to do can be read straight off the log.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { T0, fakeTime, settle } from '../sync/fakes.ts';
import { RING_ID, createCapacitorNotifier } from './capacitor.ts';
import type { Alarms, Countdown } from './capacitor.ts';

const MIN = 60_000;
type Grant = 'granted' | 'denied' | 'prompt';

function rig({ display = 'granted' as Grant, exact = 'granted' as Grant, answer = 'granted' as Grant, failures = 0 } = {}) {
  const time = fakeTime();
  const calls: string[] = [];
  const scheduled: any[] = [];
  const shown: any[] = [];
  const warned: unknown[] = [];
  const state = { display, exact };
  const alarms = {
    async createChannel(channel: any) {
      calls.push(`channel ${channel.id} ${channel.importance}`);
    },
    async schedule(options: any) {
      calls.push('schedule');
      if (failures-- > 0) throw new Error('bridge gone');
      scheduled.push(...options.notifications);
      return { notifications: [] };
    },
    async cancel() {
      calls.push('cancel');
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
  };
  const notifier = createCapacitorNotifier({
    alarms,
    countdown,
    now: time.now,
    channels: { ring: 'Bell', countdown: 'Time left' },
    warn: (error) => warned.push(error),
  });
  const ring = (inMs: number, during?: string) => ({ at: T0 + inMs, title: 'Time for a break', body: '5 minutes', during });
  const done = async () => {
    for (let i = 0; i < 20; i++) await settle();
  };
  return { time, calls, scheduled, shown, warned, state, notifier, ring, done };
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
});
