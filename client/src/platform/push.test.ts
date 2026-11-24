// Web Push on the browser's notifier: a fake push manager, a fake server and a fake service
// worker's messages, on a clock that moves only when told.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { T0, fakeTime, settle } from '../sync/fakes.ts';
import type { Manager, Subscription, Words } from './push.ts';
import { createWebNotifier } from './web.ts';
import type { NotificationApi } from './web.ts';

const MIN = 60_000;
const WORDS: Words = {
  lap: ['Lap 1 of 4, done.', 'Lap 2 of 4, done.', 'Lap 3 of 4, done.', 'A full set.'],
  take: ['Take five.', 'Take five.', 'Take five.', 'Take fifteen.'],
  next: ['Lap 1 is next.', 'Lap 2 is next.', 'Lap 3 is next.', 'Lap 4 is next.'],
  break: 'Break over.',
};

interface Options {
  permission?: NotificationPermission;
  hidden?: boolean;
  worker?: boolean;
  answer?: 'ok' | 'offline';
  memory?: { value: unknown };
  browser?: { endpoint: string | null; breaks?: boolean };
  words?: Words;
}

function rig({ permission = 'granted', hidden = false, worker = true, answer = 'ok', memory = { value: undefined }, browser = { endpoint: null }, words = WORDS }: Options = {}) {
  const time = fakeTime();
  const page = { hidden, show: () => {} };
  const rings: number[] = [];
  const shown: string[] = [];
  const requests: [string, any][] = [];
  const unsubscribed: string[] = [];
  const asked: PushSubscriptionOptionsInit[] = [];
  const warned: unknown[] = [];
  let hear: (data: unknown) => void = () => {};
  const sub = (endpoint: string): Subscription => ({
    toJSON: () => ({ endpoint, keys: { p256dh: 'BP', auth: 'au' } }),
    unsubscribe: async () => {
      unsubscribed.push(endpoint);
      browser.endpoint = null;
      return true;
    },
  });
  const manager: Manager = {
    getSubscription: async () => (browser.endpoint ? sub(browser.endpoint) : null),
    subscribe: async (options) => {
      if (browser.breaks) throw new DOMException('push service unreachable', 'AbortError');
      asked.push(options);
      browser.endpoint = 'https://push.example/new';
      return sub(browser.endpoint);
    },
  };
  class FakeNotification {
    static permission = permission;
    static async requestPermission() {
      return (FakeNotification.permission = 'granted');
    }
    constructor(title: string) {
      shown.push(title);
    }
  }
  const notifier = createWebNotifier({
    now: time.now,
    schedule: time.schedule,
    hidden: () => page.hidden,
    onShow: (look) => (page.show = look),
    bell: () => rings.push(time.now()),
    Notification: FakeNotification as NotificationApi,
    push: {
      manager: async () => (worker ? manager : undefined),
      key: async () => 'AQID',
      request: async (path, body) => {
        requests.push([path, body]);
        return answer === 'ok' ? { ok: true } : { ok: false };
      },
      remembered: () => memory.value,
      remember: (sent) => void (memory.value = sent),
      words,
      warn: (error) => warned.push(error),
      onMessage: (h) => void (hear = h),
    },
  });
  const done = async () => {
    for (let i = 0; i < 20; i++) await settle();
  };
  const ring = (inMs: number, run = 'r1') => ({ at: T0 + inMs, title: 'Lap 1 of 4, done.', body: 'Take five.', push: { run, at: 5_000_000 + inMs } });
  const rang = (inMs: number, run = 'r1', shownByWorker?: boolean) =>
    hear({ t: 'rang', run, at: 5_000_000 + inMs, ...(shownByWorker === undefined ? {} : { shown: shownByWorker }) });
  const subscribes = () => requests.filter(([path]) => path === '/api/push/subscribe');
  return { time, page, rings, shown, requests, unsubscribed, asked, warned, memory, browser, notifier, done, ring, rang, subscribes, FakeNotification };
}

describe('subscribing to push', () => {
  it('subscribes once permission is given, and sends the browser’s object and the words unchanged', async () => {
    const { notifier, done, requests, asked, subscribes } = rig({ permission: 'default' });
    await done();
    assert.deepEqual(requests, []);
    assert.equal(await notifier.allow(), true);
    await done();
    assert.equal(asked.length, 1);
    assert.equal(asked[0]!.userVisibleOnly, true);
    assert.deepEqual([...(asked[0]!.applicationServerKey as Uint8Array)], [1, 2, 3]);
    assert.deepEqual(subscribes(), [
      ['/api/push/subscribe', { subscription: { endpoint: 'https://push.example/new', keys: { p256dh: 'BP', auth: 'au' } }, words: WORDS }],
    ]);
    await notifier.allow();
    await done();
    assert.equal(subscribes().length, 1);
  });

  it('does not subscribe, or ask, without permission or without a service worker', async () => {
    for (const options of [{ permission: 'default' as const }, { permission: 'denied' as const }, { worker: false }]) {
      const { done, requests, asked } = rig(options);
      await done();
      assert.deepEqual([requests, asked], [[], []]);
    }
    const { notifier, done, requests } = rig({ worker: false });
    await notifier.allow();
    await done();
    assert.deepEqual(requests, []);
  });

  it('at start, sends again only what the server does not have: a new subscription, or new words', async () => {
    const memory = { value: undefined as unknown };
    const first = rig({ memory, browser: { endpoint: 'https://push.example/a' } });
    await first.done();
    assert.equal(first.subscribes().length, 1);

    const same = rig({ memory, browser: { endpoint: 'https://push.example/a' } });
    await same.done();
    assert.equal(same.subscribes().length, 0);

    const moved = rig({ memory, browser: { endpoint: 'https://push.example/b' } });
    await moved.done();
    assert.equal(moved.subscribes()[0]![1].subscription.endpoint, 'https://push.example/b');

    const reworded = rig({ memory, browser: { endpoint: 'https://push.example/b' }, words: { ...WORDS, break: 'Breather over.' } });
    await reworded.done();
    assert.equal(reworded.subscribes()[0]![1].words.break, 'Breather over.');
  });

  it('a server that answers offline, or a browser that throws, leaves the bell working and tries again next start', async () => {
    const memory = { value: undefined as unknown };
    const offline = rig({ memory, answer: 'offline' });
    offline.notifier.plan(offline.ring(MIN));
    await offline.done();
    offline.time.advance(MIN);
    assert.equal(offline.rings.length, 1);
    assert.equal(memory.value, undefined);

    const broken = rig({ memory, browser: { endpoint: null, breaks: true } });
    broken.notifier.plan(broken.ring(MIN));
    await broken.done();
    broken.time.advance(MIN);
    assert.equal(broken.rings.length, 1);
    assert.equal(broken.warned.length, 1);

    const next = rig({ memory });
    await next.done();
    assert.equal(next.subscribes().length, 1);
    assert.equal(typeof memory.value, 'string');
  });
});

describe('the worker’s rang', () => {
  it('for the planned run, with the notification shown, forgets the plan: the late timer stays quiet', async () => {
    const { time, page, notifier, rang, ring, rings, shown } = rig({ hidden: true });
    notifier.plan(ring(25 * MIN));
    time.jump(25 * MIN);
    rang(25 * MIN, 'r1', true);
    time.advance(MIN);
    page.show();
    assert.deepEqual([rings, shown], [[], []]);
  });

  it('for another run, or another end of this one, changes nothing', async () => {
    const { time, notifier, rang, ring, rings } = rig({ hidden: true });
    notifier.plan(ring(25 * MIN));
    rang(25 * MIN, 'r0', true);
    rang(20 * MIN, 'r1', true);
    time.advance(25 * MIN);
    assert.equal(rings.length, 1);
  });

  it('visible: the page rings on time and a later rang adds nothing', async () => {
    const { time, notifier, rang, ring, rings, shown } = rig();
    notifier.plan(ring(25 * MIN));
    time.advance(25 * MIN);
    rang(25 * MIN, 'r1', false);
    assert.deepEqual([rings.length, shown], [1, []]);
  });

  it('visible: a push that beats the page’s timer rings the page then, and only then', async () => {
    const { time, notifier, rang, ring, rings, shown } = rig();
    notifier.plan(ring(25 * MIN));
    time.advance(25 * MIN - 300);
    rang(25 * MIN, 'r1', false);
    time.advance(MIN);
    assert.deepEqual([rings, shown], [[T0 + 25 * MIN - 300], []]);
  });

  it('hidden, tab open: the page’s timer first rings and notifies; the rang after it adds nothing', async () => {
    const { time, notifier, rang, ring, rings, shown } = rig({ hidden: true });
    notifier.plan(ring(25 * MIN));
    time.advance(25 * MIN);
    rang(25 * MIN, 'r1', true);
    assert.deepEqual([rings.length, shown.length], [1, 1]);
  });

  it('laptop asleep: on waking, whichever looks first rings once', async () => {
    const pushFirst = rig({ hidden: true });
    pushFirst.notifier.plan(pushFirst.ring(25 * MIN));
    pushFirst.time.jump(25 * MIN + 30_000);
    pushFirst.rang(25 * MIN, 'r1', true);
    pushFirst.page.hidden = false;
    pushFirst.page.show();
    pushFirst.time.advance(MIN);
    assert.deepEqual(pushFirst.rings, []);

    const pageFirst = rig({ hidden: true });
    pageFirst.notifier.plan(pageFirst.ring(25 * MIN));
    pageFirst.time.jump(25 * MIN + 30_000);
    pageFirst.page.hidden = false;
    pageFirst.page.show();
    pageFirst.rang(25 * MIN, 'r1', false);
    pageFirst.time.advance(MIN);
    assert.equal(pageFirst.rings.length, 1);
  });

  it('from a worker that does not say whether it showed one: visible rings, hidden forgets', async () => {
    const visible = rig();
    visible.notifier.plan(visible.ring(25 * MIN));
    visible.time.advance(25 * MIN - 300);
    visible.rang(25 * MIN);
    assert.equal(visible.rings.length, 1);

    const hidden = rig({ hidden: true });
    hidden.notifier.plan(hidden.ring(25 * MIN));
    hidden.rang(25 * MIN);
    hidden.time.advance(MIN * 30);
    assert.equal(hidden.rings.length, 0);
  });
});

describe('ring here, and the account', () => {
  it('off plans nothing and unsubscribes both ways; on again plans and subscribes', async () => {
    const { time, notifier, ring, rings, requests, unsubscribed, memory, done, subscribes } = rig({ browser: { endpoint: 'https://push.example/a' } });
    await done();
    assert.equal(subscribes().length, 1);
    notifier.plan(ring(25 * MIN));
    notifier.ringHere(false);
    await done();
    assert.deepEqual(requests.at(-1), ['/api/push/unsubscribe', {}]);
    assert.deepEqual(unsubscribed, ['https://push.example/a']);
    assert.equal(memory.value, null);
    time.advance(20 * MIN);
    assert.deepEqual(rings, []);

    notifier.ringHere(true);
    await done();
    assert.equal(subscribes().length, 2);
    time.advance(5 * MIN);
    assert.deepEqual(rings, [T0 + 25 * MIN]);
  });

  it('a plan made while off does not ring, and is the one planned when switched on', async () => {
    const { time, notifier, ring, rings } = rig();
    notifier.ringHere(false);
    notifier.plan(ring(25 * MIN));
    time.advance(25 * MIN);
    assert.deepEqual(rings, []);
    notifier.plan(ring(40 * MIN));
    time.advance(5 * MIN);
    notifier.ringHere(true);
    time.advance(10 * MIN);
    assert.deepEqual(rings, [T0 + 40 * MIN]);
  });

  it('switched off with a bell held back by the throttle, it does not ring it', async () => {
    const { time, notifier, ring, rings, page } = rig({ hidden: true });
    notifier.plan(ring(25 * MIN));
    time.jump(25 * MIN + 10_000);
    notifier.ringHere(false);
    page.show();
    time.advance(MIN);
    assert.deepEqual(rings, []);
  });

  it('sign out unsubscribes the browser’s object and leaves the server to drop its row; sign in subscribes again', async () => {
    const memory = { value: undefined as unknown };
    const { notifier, requests, unsubscribed, done, subscribes } = rig({ memory, browser: { endpoint: 'https://push.example/a' } });
    await done();
    notifier.account('out');
    await done();
    assert.deepEqual(unsubscribed, ['https://push.example/a']);
    assert.ok(!requests.some(([path]) => path === '/api/push/unsubscribe'));
    // The next account's database has nothing remembered.
    memory.value = undefined;
    notifier.account('in');
    await done();
    assert.equal(subscribes().length, 2);
  });
});
