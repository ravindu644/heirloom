// Invites and admins: two small facades over engine.request. The test plays the server.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InviteView } from './invites.ts';
import { T0 } from './fakes.ts';
import { world } from './world.ts';

const DAY = 86400000;
const SERVER = 'https://heirloom.test';
const said = (invite: string, created: number, expires = created + 7 * DAY) => ({ invite, created, expires });
const view = (invite: string, created: number, expires = created + 7 * DAY): InviteView => ({ invite, link: `${SERVER}/#/join/${invite}`, created, expires });
const refusal = (status: number, error: string, retryAfter?: string) => ({ status, body: { error }, ...(retryAfter && { retryAfter }) });

// A device whose account may invite, and a server holding `held`, answering as protocol section 10 says.
async function admin(held: ReturnType<typeof said>[] = [], role = 'admin') {
  const w = world();
  const d = await w.device('laptop');
  await d.connect(role);
  let made = 0;
  w.server.reply = (path, body) => {
    const at = held.findIndex((it) => it?.invite === body.invite);
    if (path === '/api/invites/list') return { status: 200, body: { invites: held } };
    if (path === '/api/invites/create') {
      held.push(said(`new${++made}`, w.time.now()));
      return { status: 200, body: { invite: held.at(-1)! } };
    }
    if (path === '/api/invites/renew') {
      if (at < 0) return refusal(404, 'unknown');
      // One that had run out comes back under a new name; one still good keeps its own.
      const dead = held[at]!.expires <= w.time.now();
      held[at] = dead ? said(`new${++made}`, w.time.now()) : { ...held[at]!, expires: w.time.now() + 7 * DAY };
      const renewed = held[at]!;
      held.sort((a, b) => a.created - b.created);
      return { status: 200, body: { invite: renewed } };
    }
    if (path === '/api/invites/revoke') {
      if (at >= 0) held.splice(at, 1);
      return { status: 200, body: {} };
    }
    return { status: 200, body: {} };
  };
  // Read through a function: an assert on a signal's value narrows it for the rest of the test.
  const open = () => d.invites.open.value;
  return { w, d, invites: d.invites, open, held, asked: () => w.server.requests.map((request) => request.path.replace('/api/invites/', '')) };
}

describe('invites', () => {
  it('nothing is known until the server has answered once; then the open ones, oldest first, each with its whole link', async () => {
    const a = await admin([said('k3J9', T0 - 2 * DAY), said('Zq81', T0 - DAY)]);
    assert.equal(a.open(), null);
    await a.invites.refresh();
    assert.deepEqual(a.open(), [view('k3J9', T0 - 2 * DAY), view('Zq81', T0 - DAY)]);
    // Asked as whoever is signed in: the token and the device ride along.
    assert.deepEqual(a.w.server.requests, [{ path: '/api/invites/list', body: { token: 'token-laptop', device: a.d.engine.device }, from: 'laptop' }]);
  });

  it('a row the server sent that is not an invite is left out, not shown broken', async () => {
    const a = await admin([said('k3J9', T0), { invite: 7 } as never, null as never, { invite: 'x', created: 'now', expires: T0 } as never]);
    await a.invites.refresh();
    assert.deepEqual(a.open(), [view('k3J9', T0)]);
  });

  it('make answers with the new invite and its link, and it is in the list at once, last', async () => {
    const a = await admin([said('k3J9', T0 - DAY)]);
    await a.invites.refresh();
    assert.deepEqual(await a.invites.make(), { ok: true, invite: view('new1', T0) });
    assert.deepEqual(a.open(), [view('k3J9', T0 - DAY), view('new1', T0)]);
    assert.deepEqual(a.asked(), ['list', 'create'], 'the list was not asked for again');
    assert.deepEqual(a.w.server.requests[1]!.body, { token: 'token-laptop', device: a.d.engine.device });
  });

  it('renew of one still good moves its end and keeps its link and its place', async () => {
    const a = await admin([said('k3J9', T0 - 2 * DAY), said('Zq81', T0 - DAY)]);
    await a.invites.refresh();
    assert.deepEqual(await a.invites.renew('k3J9'), { ok: true, invite: view('k3J9', T0 - 2 * DAY, T0 + 7 * DAY) });
    assert.deepEqual(a.open(), [view('k3J9', T0 - 2 * DAY, T0 + 7 * DAY), view('Zq81', T0 - DAY)]);
    assert.deepEqual(a.w.server.requests[1]!.body, { invite: 'k3J9', token: 'token-laptop', device: a.d.engine.device });
  });

  it('renew of one that ran out while it was on screen gives a new link: the dead one leaves the list and the new one is in it', async () => {
    const a = await admin([said('k3J9', T0 - 8 * DAY), said('Zq81', T0 - DAY)]);
    // Heard while it was still good; the screen has shown it since. (This server's list does not drop what ran out.)
    await a.invites.refresh();
    assert.deepEqual(await a.invites.renew('k3J9'), { ok: true, invite: view('new1', T0) });
    assert.deepEqual(a.open(), [view('Zq81', T0 - DAY), view('new1', T0)]);
  });

  it('renew of one that was used or taken back elsewhere is `unknown`, and it leaves the list: it is not open', async () => {
    const a = await admin([said('k3J9', T0 - DAY), said('Zq81', T0)]);
    await a.invites.refresh();
    a.held.shift();
    assert.deepEqual(await a.invites.renew('k3J9'), { ok: false, error: 'unknown' });
    assert.deepEqual(a.open(), [view('Zq81', T0)]);
  });

  it('take back removes it at once; taking back one that is not there is fine too', async () => {
    const a = await admin([said('k3J9', T0 - DAY), said('Zq81', T0)]);
    await a.invites.refresh();
    assert.deepEqual(await a.invites.takeBack('k3J9'), { ok: true });
    assert.deepEqual(a.open(), [view('Zq81', T0)]);
    assert.deepEqual(a.w.server.requests.at(-1), { path: '/api/invites/revoke', body: { invite: 'k3J9', token: 'token-laptop', device: a.d.engine.device }, from: 'laptop' });
    assert.deepEqual(await a.invites.takeBack('k3J9'), { ok: true });
    assert.deepEqual(a.open(), [view('Zq81', T0)]);
  });

  it('a call that fails changes nothing and says why: full, the server\'s wait, no server at all', async () => {
    const a = await admin([said('k3J9', T0)]);
    await a.invites.refresh();
    const before = a.open();
    const answers = a.w.server.reply!;
    a.w.server.reply = () => refusal(409, 'full');
    assert.deepEqual(await a.invites.make(), { ok: false, error: 'full' });
    a.w.server.reply = () => refusal(429, 'slow_down', '30');
    assert.deepEqual(await a.invites.takeBack('k3J9'), { ok: false, error: 'slow_down', retry_after: 30 });
    a.w.server.reply = () => 'unreachable';
    assert.deepEqual(await a.invites.renew('k3J9'), { ok: false, error: 'offline' });
    await a.invites.refresh();
    assert.equal(a.open(), before, 'a list that could not be asked for again is still the one held');
    // A 200 that names no invite is not a success.
    a.w.server.reply = () => ({ status: 200, body: {} });
    assert.deepEqual(await a.invites.make(), { ok: false, error: 'server' });
    assert.equal(a.open(), before);
    a.w.server.reply = answers;
  });

  it('before the list has been heard, a make does not pass one invite off as the whole list', async () => {
    const a = await admin([said('k3J9', T0 - DAY)]);
    assert.equal((await a.invites.make()).ok, true);
    assert.equal(a.open(), null);
    await a.invites.refresh();
    assert.deepEqual(a.open(), [view('k3J9', T0 - DAY), view('new1', T0)]);
  });

  for (const call of ['refresh', 'make', 'renew', 'takeBack'] as const) {
    it(`forbidden on ${call}: the list is 'forbidden', and nothing is made, renewed or taken back while it is`, async () => {
      const a = await admin([said('k3J9', T0)]);
      await a.invites.refresh();
      // The owner made this account a member again; its devices hear at their next welcome.
      a.w.server.reply = () => refusal(403, 'forbidden');
      const answer = await a.invites[call]('k3J9');
      if (call !== 'refresh') assert.deepEqual(answer, { ok: false, error: 'forbidden' });
      assert.equal(a.open(), 'forbidden');
      const asked = a.asked().length;
      assert.deepEqual(await a.invites.make(), { ok: false, error: 'forbidden' });
      assert.deepEqual(await a.invites.renew('k3J9'), { ok: false, error: 'forbidden' });
      assert.deepEqual(await a.invites.takeBack('k3J9'), { ok: false, error: 'forbidden' });
      assert.equal(a.asked().length, asked, 'the server is not asked');
      assert.equal(a.open(), 'forbidden');
    });
  }

  it('a refresh while forbidden asks the server again: still no stays forbidden, and a yes is the list', async () => {
    const a = await admin([said('k3J9', T0)]);
    const answers = a.w.server.reply!;
    a.w.server.reply = () => refusal(403, 'forbidden');
    await a.invites.refresh();
    await a.invites.refresh();
    assert.deepEqual(a.asked(), ['list', 'list']);
    assert.equal(a.open(), 'forbidden');
    // Raised again, and no welcome since to say so.
    a.w.server.reply = answers;
    await a.invites.refresh();
    assert.deepEqual(a.open(), [view('k3J9', T0)]);
    assert.deepEqual(await a.invites.make(), { ok: true, invite: view('new1', T0) });
  });

  for (const how of ['a welcome', 'a role message'] as const) {
    it(`lowered and raised again before this device heard of either: ${how} naming the same role ends the forbidden`, async () => {
      const a = await admin([said('k3J9', T0)]);
      const answers = a.w.server.reply!;
      await a.invites.refresh();
      a.w.server.reply = () => refusal(403, 'forbidden');
      await a.invites.make();
      assert.equal(a.open(), 'forbidden');
      // The owner's Undo. The role here was admin all along.
      a.w.server.reply = answers;
      if (how === 'a welcome') await a.d.connect('admin');
      else a.d.role('admin');
      assert.equal(a.d.engine.role.peek(), 'admin');
      assert.equal(a.open(), null);
      assert.deepEqual(await a.invites.make(), { ok: true, invite: view('new1', T0) });
    });
  }

  it('a welcome that names the same role leaves a list that was heard as it is', async () => {
    const a = await admin([said('k3J9', T0)]);
    await a.invites.refresh();
    const before = a.open();
    await a.d.connect('admin');
    a.d.role('admin');
    assert.equal(a.open(), before);
  });

  it('forbidden ends when the role changes: made an admin again, the device may ask, and is answered', async () => {
    const a = await admin([said('k3J9', T0)]);
    const answers = a.w.server.reply!;
    a.w.server.reply = () => refusal(403, 'forbidden');
    await a.invites.refresh();
    assert.equal(a.open(), 'forbidden');
    await a.d.connect('member');
    assert.equal(a.open(), null);
    await a.d.connect('admin');
    a.w.server.reply = answers;
    await a.invites.refresh();
    assert.deepEqual(a.open(), [view('k3J9', T0)]);
  });

  it('each account has its own: the next to sign in here is not shown the last one\'s invites, not even by an answer on its way', async () => {
    // Made an admin since its last welcome: the server answers, though the device has not heard
    // of its role, so no change of role is there to clear the list when the account changes.
    const a = await admin([said('k3J9', T0)], 'member');
    await a.invites.refresh();
    assert.deepEqual(a.open(), [view('k3J9', T0)]);
    let answer = (_: { status: number; body: object }) => {};
    a.w.server.reply = () => new Promise((resolve) => (answer = resolve));
    const late = a.invites.refresh();
    await a.d.engine.signIn('sachi', 'another horse');
    assert.equal(a.open(), null);
    answer({ status: 200, body: { invites: [said('k3J9', T0)] } });
    await late;
    assert.equal(a.open(), null);
  });
});

describe('admins', () => {
  const HASH = 'ab'.repeat(32);
  const RAVI = { username: 'ravi', role: 'owner', picture: HASH };
  const SAM = { username: 'sam', role: 'admin', picture: null };
  async function owner(held: { username: string; role: string; picture?: string | null }[] = [RAVI, SAM], members = ['dilu', 'anu']) {
    const w = world();
    const d = await w.device('laptop');
    await d.connect('owner');
    w.server.reply = (path, body) => {
      if (path === '/api/admins/list') return { status: 200, body: { admins: held } };
      if (path !== '/api/admins/set') return { status: 200, body: {} };
      if (body.username === 'ravi' || !['admin', 'member'].includes(body.role)) return refusal(400, 'bad_request');
      if (!members.includes(body.username) && !held.some((it) => it.username === body.username)) return refusal(404, 'unknown');
      return { status: 200, body: {} };
    };
    const list = () => d.admins.list.value;
    return { w, d, admins: d.admins, list };
  }

  it('nothing is known until the server has answered once; then the owner first and the admins by name', async () => {
    // A picture that is no hash is no picture: the initial, not a fetch of whatever it says.
    const o = await owner([{ username: 'sam', role: 'admin', picture: '../x' }, RAVI, { username: 'anu', role: 'admin' }, { username: 'x', role: 'member' }, null as never]);
    assert.equal(o.list(), null);
    await o.admins.refresh();
    assert.deepEqual(o.list(), [RAVI, { username: 'anu', role: 'admin', picture: null }, SAM]);
    assert.deepEqual(o.w.server.requests, [{ path: '/api/admins/list', body: { token: 'token-laptop', device: o.d.engine.device }, from: 'laptop' }]);
  });

  it('raise makes a member an admin: asked by the name as the server holds it, and in the list at once, in its place', async () => {
    const o = await owner();
    await o.admins.refresh();
    assert.deepEqual(await o.admins.raise(' Dilu '), { ok: true });
    assert.deepEqual(o.w.server.requests.at(-1)!.body, { username: 'dilu', role: 'admin', token: 'token-laptop', device: o.d.engine.device });
    // Its picture is not known until the next list.
    assert.deepEqual(o.list(), [RAVI, { username: 'dilu', role: 'admin', picture: null }, SAM]);
    // Already so is fine, and is not listed twice.
    assert.deepEqual(await o.admins.raise('dilu'), { ok: true });
    assert.equal(o.list()!.length, 3);
  });

  it('lower makes an admin a member again: gone from the list at once', async () => {
    const o = await owner();
    await o.admins.refresh();
    assert.deepEqual(await o.admins.lower('sam'), { ok: true });
    assert.deepEqual(o.w.server.requests.at(-1)!.body, { username: 'sam', role: 'member', token: 'token-laptop', device: o.d.engine.device });
    assert.deepEqual(o.list(), [RAVI]);
  });

  it('a name the server does not have is `unknown`, the owner cannot be lowered, no server is `offline`: the list stays as it was', async () => {
    const o = await owner();
    await o.admins.refresh();
    const before = o.list();
    assert.deepEqual(await o.admins.raise('nobody'), { ok: false, error: 'unknown' });
    assert.deepEqual(await o.admins.lower('ravi'), { ok: false, error: 'bad_request' });
    o.w.server.reply = () => 'unreachable';
    assert.deepEqual(await o.admins.raise('dilu'), { ok: false, error: 'offline' });
    assert.deepEqual(await o.admins.lower('sam'), { ok: false, error: 'offline' });
    await o.admins.refresh();
    o.w.server.reply = () => refusal(403, 'forbidden');
    assert.deepEqual(await o.admins.raise('dilu'), { ok: false, error: 'forbidden' });
    assert.equal(o.list(), before);
  });

  it('before the list has been heard, a raise does not pass one admin off as the whole list', async () => {
    const o = await owner();
    assert.deepEqual(await o.admins.raise('dilu'), { ok: true });
    assert.equal(o.list(), null);
  });

  it('each account has its own: the next to sign in here is not shown the last one\'s list, not even by an answer on its way', async () => {
    const o = await owner();
    await o.admins.refresh();
    let answer = (_: { status: number; body: object }) => {};
    o.w.server.reply = () => new Promise((resolve) => (answer = resolve));
    const late = o.admins.refresh();
    await o.d.engine.signIn('sachi', 'another horse');
    assert.equal(o.list(), null);
    answer({ status: 200, body: { admins: [RAVI] } });
    await late;
    assert.equal(o.list(), null);
  });
});
