// The browser notifier and the bell against a clock that moves only when told and a fake
// Notification, so throttled tabs and denied permissions take no time and no browser.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { T0, fakeTime, settle } from '../sync/fakes.ts';
import { REST_MS, bellOnDemand, createBell } from './sound.ts';
import { LATE_MS, createWebNotifier, whenVisible } from './web.ts';
import type { NotificationApi, WebEnv } from './web.ts';

const MIN = 60_000;

function rig({ permission = 'granted' as NotificationPermission, hidden = false, notifications = true } = {}, env: Partial<WebEnv> = {}) {
  const time = fakeTime();
  const page = { hidden, show: () => {} };
  const rings: number[] = [];
  const shown: { title: string; body?: string }[] = [];
  const asked: number[] = [];
  class FakeNotification {
    static permission = permission;
    static async requestPermission() {
      asked.push(time.now());
      return FakeNotification.permission;
    }
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, body: options?.body });
    }
  }
  const notifier = createWebNotifier({
    now: time.now,
    schedule: time.schedule,
    hidden: () => page.hidden,
    onShow: (look) => (page.show = look),
    bell: () => rings.push(time.now()),
    Notification: notifications ? (FakeNotification as NotificationApi) : undefined,
    ...env,
  });
  const ring = (inMs: number, title = 'Time for a break') => ({ at: T0 + inMs, title, body: '5 minutes' });
  return { time, page, rings, shown, asked, notifier, ring, FakeNotification };
}

describe('the web notifier', () => {
  it('rings at the time', () => {
    const { time, rings, notifier, ring } = rig();
    notifier.plan(ring(25 * MIN));
    time.advance(25 * MIN - 1);
    assert.deepEqual(rings, []);
    time.advance(1);
    assert.deepEqual(rings, [T0 + 25 * MIN]);
    time.advance(60 * MIN);
    assert.equal(rings.length, 1);
  });

  it('a new plan replaces the old one, and the old one never rings', () => {
    const { time, rings, notifier, ring } = rig();
    notifier.plan(ring(25 * MIN));
    time.advance(10 * MIN);
    notifier.plan(ring(30 * MIN)); // extended by five minutes on another device
    time.advance(60 * MIN);
    assert.deepEqual(rings, [T0 + 30 * MIN]);
  });

  it('planning the same ring again keeps it, even within a moment of the bell', () => {
    const { time, rings, notifier, ring } = rig();
    notifier.plan(ring(25 * MIN));
    time.advance(25 * MIN - 500);
    notifier.plan(ring(25 * MIN));
    time.advance(MIN);
    assert.deepEqual(rings, [T0 + 25 * MIN]);
  });

  it('null cancels', () => {
    const { time, rings, notifier, ring } = rig();
    notifier.plan(ring(25 * MIN));
    time.advance(5 * MIN);
    notifier.plan(null); // paused
    time.advance(60 * MIN);
    assert.deepEqual(rings, []);
  });

  it('a plan in the past, or within a moment of now, does not ring', () => {
    const { time, page, rings, notifier, ring } = rig();
    notifier.plan(ring(-60 * MIN)); // the app opened an hour after the bell
    notifier.plan(ring(200)); // finish tapped: the phase ends now
    time.advance(60 * MIN);
    page.show();
    assert.deepEqual(rings, []);
  });

  it('a hidden page with permission gets the bell and a notification', () => {
    const { time, rings, shown, notifier, ring } = rig({ hidden: true });
    notifier.plan(ring(25 * MIN));
    time.advance(25 * MIN);
    assert.equal(rings.length, 1);
    assert.deepEqual(shown, [{ title: 'Time for a break', body: '5 minutes' }]);
  });

  it('a visible page gets only the bell', () => {
    const { time, rings, shown, notifier, ring } = rig({ hidden: false });
    notifier.plan(ring(25 * MIN));
    time.advance(25 * MIN);
    assert.equal(rings.length, 1);
    assert.deepEqual(shown, []);
  });

  it('without permission, or without notifications at all, the bell rings and nothing throws', () => {
    for (const opts of [{ permission: 'denied' as const }, { permission: 'default' as const }, { notifications: false }]) {
      const { time, rings, shown, notifier, ring } = rig({ hidden: true, ...opts });
      notifier.plan(ring(25 * MIN));
      time.advance(25 * MIN);
      assert.equal(rings.length, 1);
      assert.deepEqual(shown, []);
    }
  });

  it('a constructor that throws, as Chrome on Android does, still leaves the bell', () => {
    class Refusing {
      static permission = 'granted' as const;
      static requestPermission = async () => 'granted' as const;
      constructor() {
        throw new TypeError('Illegal constructor');
      }
    }
    const { time, rings, notifier, ring } = rig({ hidden: true }, { Notification: Refusing });
    notifier.plan(ring(MIN));
    assert.doesNotThrow(() => time.advance(MIN));
    assert.equal(rings.length, 1);
  });

  it('a throttled timer that fires late rings once, and the look on showing the tab does not ring again', () => {
    const { time, page, rings, notifier, ring } = rig({ hidden: true });
    notifier.plan(ring(25 * MIN));
    // The tab was throttled: nothing ran at the bell, then the clock is 40 s past it.
    time.jump(25 * MIN + 40_000);
    page.show();
    assert.deepEqual(rings, [T0 + 25 * MIN + 40_000]);
    time.advance(MIN); // the held-back timer finally runs
    page.show();
    assert.equal(rings.length, 1);
  });

  it('a held-back ring rings before a new plan replaces it', () => {
    const { time, rings, notifier, ring } = rig({ hidden: true });
    notifier.plan(ring(25 * MIN));
    time.jump(25 * MIN + 10_000);
    notifier.plan(ring(30 * MIN)); // another device started the break before this tab woke
    time.advance(10 * MIN);
    assert.deepEqual(rings, [T0 + 25 * MIN + 10_000, T0 + 30 * MIN]);
  });

  it('a ring far past its time, after the laptop slept, stays quiet', () => {
    const { time, page, rings, notifier, ring } = rig();
    notifier.plan(ring(25 * MIN));
    time.jump(25 * MIN + LATE_MS + 1);
    page.show();
    time.advance(MIN);
    assert.deepEqual(rings, []);
  });

  it('a timer that fires early by the wall clock waits for the real time', () => {
    // The clock was set back a minute after planning, so the timer runs a minute before the bell.
    let early = MIN;
    const { time, rings, notifier, ring } = rig({}, { schedule: (run, ms) => time.schedule(run, ms - early + (early = 0)) });
    notifier.plan(ring(25 * MIN));
    time.advance(24 * MIN);
    assert.deepEqual(rings, []);
    time.advance(MIN);
    assert.deepEqual(rings, [T0 + 25 * MIN]);
  });

  it('allow reports granted, denied and unsupported, and asks only when it can still ask', async () => {
    assert.equal(await rig({ permission: 'granted' }).notifier.allow(), true);
    assert.equal(await rig({ permission: 'denied' }).notifier.allow(), false);
    assert.equal(await rig({ notifications: false }).notifier.allow(), false);

    const yes = rig({ permission: 'default' });
    yes.FakeNotification.requestPermission = async () => (yes.FakeNotification.permission = 'granted');
    assert.equal(await yes.notifier.allow(), true);

    const no = rig({ permission: 'default' });
    no.FakeNotification.requestPermission = async () => (no.FakeNotification.permission = 'denied');
    assert.equal(await no.notifier.allow(), false);

    const denied = rig({ permission: 'denied' });
    await denied.notifier.allow();
    assert.deepEqual(denied.asked, []);
  });
});

describe('the bell', () => {
  it('before unlock, play is a quiet no-op and makes no audio context', () => {
    let made = 0;
    const bell = createBell(() => {
      made++;
      throw new Error('unreachable');
    });
    assert.doesNotThrow(() => bell.play());
    assert.equal(made, 0);
  });

  it('where audio cannot start, unlock and play stay quiet', () => {
    const bell = createBell(() => {
      throw new ReferenceError('AudioContext is not defined');
    });
    assert.doesNotThrow(() => {
      bell.unlock();
      bell.play();
    });
  });

  it('a context the browser keeps suspended does not play', () => {
    let strikes = 0;
    const ctx = {
      state: 'suspended',
      resume: () => Promise.reject(new Error('not allowed')),
      createOscillator: () => (strikes++, {}),
    } as unknown as AudioContext;
    const bell = createBell(() => ctx);
    bell.unlock();
    bell.play();
    assert.equal(strikes, 0);
  });
});

// Enough of an AudioContext for a strike, counting what the bell asks of it.
function fakeAudio() {
  const log = { made: 0, resumed: 0, suspended: 0, oscillators: 0 };
  const param = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const node = { frequency: param, gain: param, connect: (next: unknown) => next, start() {}, stop() {} };
  const make = () => {
    log.made++;
    return {
      currentTime: 0,
      destination: {},
      createOscillator: () => (log.oscillators++, node),
      createGain: () => node,
      resume: async () => void log.resumed++,
      suspend: async () => void log.suspended++,
    } as unknown as AudioContext;
  };
  return { log, make };
}

describe('the bell on demand (the phone)', () => {
  it('opens no audio until it rings, then strikes, and lets the stream go once the bell has died away', async () => {
    const time = fakeTime();
    const { log, make } = fakeAudio();
    const ring = bellOnDemand(make, time.schedule);
    assert.equal(log.made, 0);
    ring();
    await settle();
    assert.deepEqual([log.made, log.resumed, log.suspended], [1, 1, 0]);
    assert.ok(log.oscillators > 0);
    time.advance(REST_MS - 1);
    assert.equal(log.suspended, 0);
    time.advance(1);
    await settle();
    assert.equal(log.suspended, 1);
  });

  it('a second ring inside the rest keeps the stream open for that one too, on the same context', async () => {
    const time = fakeTime();
    const { log, make } = fakeAudio();
    const ring = bellOnDemand(make, time.schedule);
    ring();
    await settle();
    time.advance(REST_MS / 2);
    ring();
    await settle();
    time.advance(REST_MS - 1);
    assert.equal(log.suspended, 0);
    time.advance(1);
    await settle();
    assert.deepEqual([log.made, log.suspended], [1, 1]);
  });

  it('where audio cannot be made, a ring is quiet', () => {
    const ring = bellOnDemand(() => {
      throw new ReferenceError('AudioContext is not defined');
    }, fakeTime().schedule);
    assert.doesNotThrow(ring);
  });
});

describe('in front again, in the browser', () => {
  it('runs when the page comes back into view, not when it goes out of it', () => {
    const listeners: (() => void)[] = [];
    const doc = { hidden: true, addEventListener: (_: string, run: () => void) => listeners.push(run) };
    let runs = 0;
    whenVisible(doc as unknown as Document)(() => runs++);
    listeners.forEach((l) => l());
    assert.equal(runs, 0);
    doc.hidden = false;
    listeners.forEach((l) => l());
    assert.equal(runs, 1);
  });
});

