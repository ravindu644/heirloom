// The phone app's choice of server: what may be typed, what is asked of the address, and that
// nothing is kept unless a heirloom server answered there.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { memoryStores } from '../store/memory.ts';
import type { OpenStore } from '../store/store.ts';
import { fakeTime, settle } from './fakes.ts';
import { createServerChoice, inviteIn, isPlain } from './server.ts';
import { HEALTH_MS } from './transport.ts';
import type { Fetch } from './transport.ts';
import { world } from './world.ts';

const HEIRLOOM = { ok: true, version: '1.0.0', sqlite: '3.51.3' };

// The app on a phone, and the network around it: what each origin says at /healthz. An origin
// not named does not answer; 'hangs' takes the request and says nothing; 'page' answers with something that is not JSON.
async function phone(servers: Record<string, unknown> = {}, options: { stores?: OpenStore; first?: string } = {}) {
  const time = fakeTime();
  const stores = options.stores ?? memoryStores();
  const asked: string[] = [];
  const signals: AbortSignal[] = [];
  const reloads = { count: 0 };
  const fetch: Fetch = async (url, init) => {
    // A GET with a body makes a real fetch throw, so it is part of what is asked.
    asked.push(`${init.method} ${url}${init.body === undefined ? '' : ' with a body'}`);
    signals.push(init.signal!);
    const said = servers[new URL(url).origin];
    if (said === undefined) throw new TypeError('fetch failed');
    if (said === 'hangs') return new Promise(() => {});
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => (said === 'page' ? JSON.parse('<!doctype html>') : said) };
  };
  const start = () => createServerChoice({ fetch, schedule: time.schedule, openStore: stores, reload: () => void reloads.count++, ...(options.first !== undefined && { first: options.first }) });
  const choice = await start();
  /** Types it. An address that is taken never answers: 'taken' stands for that. */
  const choose = async (typed: string) => {
    let answer: string = 'taken';
    void choice.choose(typed).then((refusal) => (answer = refusal));
    for (let i = 0; i < 5; i++) await settle();
    return answer;
  };
  /** The app after it started again: what it finds kept. */
  return { time, stores, asked, signals, reloads, choice, choose, restarted: start };
}

describe('an address is typed', () => {
  const accepted: [typed: string, answers: string, invite?: string][] = [
    ['heirloom.example', 'https://heirloom.example'],
    ['heirloom.example:8443', 'https://heirloom.example:8443'],
    ['192.168.1.20:8787', 'http://192.168.1.20:8787'],
    ['https://heirloom.example', 'https://heirloom.example'],
    ['https://heirloom.example/', 'https://heirloom.example'],
    ['http://192.168.1.20:8787', 'http://192.168.1.20:8787'],
    ['http://192.168.1.20:8787/', 'http://192.168.1.20:8787'],
    ['  HTTP://Pi.Local:8787/ \n', 'http://pi.local:8787'],
    ['http://[::1]:8787', 'http://[::1]:8787'],
    ['https://heirloom.example:443', 'https://heirloom.example'],
    ['https://heirloom.example/#/join/k3J9_x-Q', 'https://heirloom.example', 'k3J9_x-Q'],
    ['http://192.168.1.20:8787/#/join/k3J9', 'http://192.168.1.20:8787', 'k3J9'],
    ['192.168.1.20:8787/#/join/k3J9', 'http://192.168.1.20:8787', 'k3J9'],
    // A link as a chat app or a mail may hand it over.
    ['https://heirloom.example/#/join/k3J9/', 'https://heirloom.example', 'k3J9'],
    ['https://heirloom.example/#/join/k3J9?from=mail', 'https://heirloom.example', 'k3J9'],
  ];
  for (const [typed, origin, invite] of accepted) {
    it(`${JSON.stringify(typed)} is ${origin}${invite ? ` and the invite ${invite}` : ''}: kept, and the app starts again`, async () => {
      const p = await phone({ [origin]: HEIRLOOM });
      assert.equal(await p.choose(typed), 'taken');
      assert.equal(p.reloads.count, 1);
      const next = await p.restarted();
      assert.equal(next.address, origin);
      assert.equal(next.heldInvite(), invite ?? null);
    });
  }

  const refused = [
    '',
    '   ',
    'my server',
    'ftp://heirloom.example',
    'heirloom.example/some/page',
    'https://heirloom.example/some/page',
    'https://heirloom.example/?next=1',
    'heirloom.example?next=1',
    // A URL drops a tab or a line break inside a host and reads on. What was typed is not an address.
    'heir\tloom.example',
    'heirloom\n.example',
    'https://heirloom.example/#/focus',
    'https://heirloom.example/#/join/',
    'https://heirloom.example/#/join/a/b',
    'ravi@heirloom.example',
    'https://ravi:secret@heirloom.example',
    'heirloom.example:port',
    'heirloom.example:99999',
    'https://',
    '/#/join/k3J9',
  ];
  for (const typed of refused) {
    it(`${JSON.stringify(typed)} is invalid: nothing is asked of anyone, nothing kept, no new start`, async () => {
      // Whatever it might be read as, a heirloom server would answer there.
      const everywhere = new Proxy({}, { get: () => HEIRLOOM });
      const p = await phone(everywhere);
      assert.equal(await p.choose(typed), 'invalid');
      assert.deepEqual(p.asked, []);
      assert.equal(p.reloads.count, 0);
      assert.equal((await p.restarted()).address, null);
    });
  }
});

describe('which scheme', () => {
  it('none typed: https is tried first, and http is not asked when https answers', async () => {
    const p = await phone({ 'https://heirloom.example': HEIRLOOM, 'http://heirloom.example': HEIRLOOM });
    assert.equal(await p.choose('heirloom.example'), 'taken');
    assert.deepEqual(p.asked, ['GET https://heirloom.example/healthz']);
    assert.equal((await p.restarted()).address, 'https://heirloom.example');
  });

  it('none typed and nothing on https: http is tried next, and taken', async () => {
    const p = await phone({ 'http://192.168.1.20:8787': HEIRLOOM });
    assert.equal(await p.choose('192.168.1.20:8787'), 'taken');
    assert.deepEqual(p.asked, ['GET https://192.168.1.20:8787/healthz', 'GET http://192.168.1.20:8787/healthz']);
    assert.equal((await p.restarted()).address, 'http://192.168.1.20:8787');
  });

  it('none typed, and https is some other site: http is still tried, and taken', async () => {
    const p = await phone({ 'https://heirloom.example': { hello: 'world' }, 'http://heirloom.example': HEIRLOOM });
    assert.equal(await p.choose('heirloom.example'), 'taken');
    assert.equal((await p.restarted()).address, 'http://heirloom.example');
  });

  it('a typed scheme is the only one tried: http is not swapped for https, nor https for http', async () => {
    const both = { 'https://heirloom.example': HEIRLOOM, 'http://heirloom.example': HEIRLOOM };
    const plain = await phone(both);
    assert.equal(await plain.choose('http://heirloom.example'), 'taken');
    assert.deepEqual(plain.asked, ['GET http://heirloom.example/healthz']);
    const onlyPlain = await phone({ 'http://heirloom.example': HEIRLOOM });
    assert.equal(await onlyPlain.choose('https://heirloom.example'), 'unreachable');
    assert.deepEqual(onlyPlain.asked, ['GET https://heirloom.example/healthz']);
  });
});

describe('an address that is not taken', () => {
  const refusal = async (servers: Record<string, unknown>, typed: string, expected: string) => {
    const p = await phone(servers);
    assert.equal(await p.choose(typed), expected);
    assert.equal(p.reloads.count, 0, 'the app is not started again');
    assert.equal((await p.restarted()).address, null, 'nothing is kept');
    assert.equal((await p.restarted()).heldInvite(), null, 'not the invite either');
  };

  it('nothing answers on https or http: unreachable', async () => {
    await refusal({}, 'heirloom.example/#/join/k3J9', 'unreachable');
  });

  it('something answers that is not a heirloom server: not-heirloom, whichever scheme it answered on', async () => {
    const others: unknown[] = [
      'page',
      { hello: 'world' },
      { ok: true },
      { version: '1.0.0' },
      { ok: 'true', version: '1.0.0' },
      { ok: true, version: 1 },
      { ok: false, version: '1.0.0' },
      null,
      [],
    ];
    for (const said of others) {
      await refusal({ 'https://example.com': said }, 'https://example.com/#/join/k3J9', 'not-heirloom');
      await refusal({ 'https://example.com': said }, 'example.com', 'not-heirloom');
      await refusal({ 'http://example.com': said }, 'example.com', 'not-heirloom');
    }
  });

  it('a server that takes the request and never answers is given up on, the request ended, and the next scheme tried', async () => {
    const p = await phone({ 'https://heirloom.example': 'hangs', 'http://heirloom.example': 'hangs' });
    let answer = 'waiting';
    void p.choice.choose('heirloom.example').then((refusal) => (answer = refusal));
    await settle();
    assert.deepEqual(p.asked, ['GET https://heirloom.example/healthz']);
    p.time.advance(HEALTH_MS - 1);
    await settle();
    assert.equal(p.asked.length, 1);
    p.time.advance(1);
    await settle();
    assert.equal(p.asked.length, 2, 'http is asked when https ran out of time');
    assert.equal(p.signals[0]!.aborted, true);
    assert.equal(answer, 'waiting');
    p.time.advance(HEALTH_MS);
    await settle();
    assert.equal(answer, 'unreachable');
    assert.equal(p.signals[1]!.aborted, true);
    assert.equal(p.time.waiting(), 0);
  });

  it('a refusal leaves the address in use as it was', async () => {
    const p = await phone({ 'https://heirloom.example': HEIRLOOM });
    await p.choose('heirloom.example');
    const next = await phone({}, { stores: p.stores });
    assert.equal(await next.choose('elsewhere.example'), 'unreachable');
    assert.equal(await next.choose('not an address'), 'invalid');
    assert.equal((await next.restarted()).address, 'https://heirloom.example');
  });
});

describe('with an account open on this device', () => {
  it('no address is taken: signed-in, before anything is asked. After a sign out it is, and the address outlives the next one', async () => {
    const w = world();
    const d = await w.device('phone');
    const p = await phone({ 'https://other.example': HEIRLOOM }, { stores: d.stores, first: 'https://heirloom.test' });
    assert.equal(await p.choose('other.example'), 'signed-in');
    assert.equal(await p.choose('not an address'), 'signed-in');
    assert.deepEqual(p.asked, []);
    assert.equal(p.reloads.count, 0);
    assert.equal((await p.restarted()).address, 'https://heirloom.test');

    assert.deepEqual(await d.engine.signOut(), { ok: true });
    assert.equal(await p.choose('other.example'), 'taken');
    assert.equal((await p.restarted()).address, 'https://other.example');
    // Signing in and out again deletes the account's database and nothing of the install's.
    await d.engine.signIn('ravi', 'correct horse');
    assert.equal(await p.choose('heirloom.example'), 'signed-in');
    await d.engine.signOut();
    assert.equal((await p.restarted()).address, 'https://other.example');
    d.close();
    await d.engine.stop();
  });
});

describe('an invite link', () => {
  it('gives the address and the invite, and the invite is held: read as often as asked, across restarts, until it is forgotten', async () => {
    const p = await phone({ 'https://heirloom.example': HEIRLOOM });
    assert.equal(p.choice.heldInvite(), null, 'none before a link was pasted');
    p.choice.forgetInvite();
    assert.equal(await p.choose('https://heirloom.example/#/join/k3J9'), 'taken');
    const next = await p.restarted();
    assert.equal(next.address, 'https://heirloom.example');
    assert.equal(next.heldInvite(), 'k3J9');
    assert.equal(next.heldInvite(), 'k3J9', 'reading it does not let it go');
    await settle();
    // Away to the password manager, and the app started again meanwhile.
    const back = await p.restarted();
    assert.equal(back.heldInvite(), 'k3J9');
    back.forgetInvite();
    assert.equal(back.heldInvite(), null);
    await settle();
    assert.equal((await p.restarted()).heldInvite(), null, 'and it stays forgotten');
  });

  it('an invite nobody took is not offered on another server: choosing a plain address clears it', async () => {
    const p = await phone({ 'https://heirloom.example': HEIRLOOM, 'https://other.example': HEIRLOOM });
    await p.choose('https://heirloom.example/#/join/k3J9');
    await p.choose('other.example');
    const next = await p.restarted();
    assert.equal(next.address, 'https://other.example');
    assert.equal(next.heldInvite(), null);
  });
});

describe('the address in use', () => {
  it('is null before one is chosen, and the build\'s own address when it has one: only until one is kept', async () => {
    assert.equal((await phone()).choice.address, null);
    assert.equal((await phone({}, { first: '' })).choice.address, null);
    const p = await phone({ 'http://192.168.1.20:8787': HEIRLOOM }, { first: 'https://built.example' });
    assert.equal(p.choice.address, 'https://built.example');
    await p.choose('192.168.1.20:8787');
    assert.equal((await p.restarted()).address, 'http://192.168.1.20:8787');
  });

  it('the build\'s address is read as a typed one is: no slash left on its end, and null when it is not an address', async () => {
    const cases: [first: string, address: string | null][] = [
      ['http://192.168.1.20:8787/', 'http://192.168.1.20:8787'],
      ['HTTPS://Built.Example/', 'https://built.example'],
      [' https://built.example:443 ', 'https://built.example'],
      ['built.example', 'https://built.example'],
      ['https://built.example/app', null],
      ['https://built.example//', null],
      ['not an address', null],
      ['', null],
    ];
    for (const [first, address] of cases) assert.equal((await phone({}, { first })).choice.address, address, JSON.stringify(first));
  });

  it('plain is true for http to anything but this device itself', async () => {
    const cases: [address: string | undefined, plain: boolean][] = [
      ['http://192.168.1.20:8787', true],
      ['http://heirloom.example', true],
      ['http://localhost.example:8787', true],
      ['http://127.0.0.10', true],
      ['http://localhost:8787', false],
      ['http://localhost', false],
      ['http://127.0.0.1:8787', false],
      ['http://[::1]:8787', false],
      ['http://[::1]', false],
      ['http://[::10]:8787', true],
      ['https://heirloom.example', false],
      ['https://192.168.1.20:8787', false],
      [undefined, false],
    ];
    for (const [address, plain] of cases) {
      assert.equal((await phone({}, { ...(address && { first: address }) })).choice.plain, plain, String(address));
      // The same function answers for a browser's own origin.
      assert.equal(isPlain(address ?? null), plain, `isPlain(${address})`);
      if (!address) continue;
      // And the same for one that was typed and kept.
      const p = await phone({ [address]: HEIRLOOM });
      await p.choose(address);
      assert.equal((await p.restarted()).plain, plain, `${address}, chosen`);
    }
  });
});

describe('the invite in what was pasted', () => {
  it('is the last part of a link, with or without a slash or a query after it, or the invite by itself', () => {
    const cases: [pasted: string, invite: string | null][] = [
      ['k3J9_x-Q', 'k3J9_x-Q'],
      ['  k3J9\n', 'k3J9'],
      ['https://heirloom.example/#/join/k3J9', 'k3J9'],
      ['https://heirloom.example/#/join/k3J9/', 'k3J9'],
      ['https://heirloom.example/#/join/k3J9?from=mail', 'k3J9'],
      ['https://heirloom.example/#/join/k3J9/?from=mail', 'k3J9'],
      ['https://heirloom.example/?from=mail#/join/k3J9', 'k3J9'],
      ['http://192.168.1.20:8787/#/join/k3J9', 'k3J9'],
      ['heirloom.example/#/join/k3J9', 'k3J9'],
      ['#/join/k3J9', 'k3J9'],
      // Never an empty string: a fresh server reads an empty invite as its own setting up.
      ['', null],
      ['   ', null],
      ['/', null],
      ['https://heirloom.example/#/join/', null],
      ['https://heirloom.example/#/join', null],
      ['https://heirloom.example/', null],
      ['https://heirloom.example', null],
      ['https://heirloom.example/#/join/a/b', null],
      ['https://heirloom.example/#/join/k3J9 and some words', null],
      ['https://heirloom.example/#/join/k3J9?from=mail and some words', null],
      ['two words', null],
      ['k3J9!', null],
    ];
    for (const [pasted, invite] of cases) assert.equal(inviteIn(pasted), invite, JSON.stringify(pasted));
  });
});

describe('the test world plays a fresh server too', () => {
  it('its /healthz is the test\'s to answer, and its welcome says a role', async () => {
    const w = world();
    const d = await w.device('phone');
    assert.equal(await d.engine.needsSetup(), false);
    w.server.reply = (path) => ({ status: 200, body: path === '/healthz' ? { ...HEIRLOOM, setup: true } : {} });
    assert.equal(await d.engine.needsSetup(), true);
    assert.equal(d.engine.role.value, 'member');
    await d.connect('owner');
    assert.equal(d.engine.role.peek(), 'owner');
    d.close();
    await d.engine.stop();
  });
});
