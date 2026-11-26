// A server anyone can run (protocol section 10): set up from the browser, invite links made in
// Settings, and admins the owner decides. Each test starts a fresh server of its own, with its own
// data and port: the run's shared server already has accounts, and its first one is long taken.
import type { Page } from '@playwright/test';
import { PASSWORD } from '../sync/harness.ts';
import { startServer } from '../server.ts';
import type { Server } from '../server.ts';
import { selectable, startButton } from './app.ts';
import { test as base, expect } from './devices.ts';


const test = base.extend<{ fresh: (addr?: string) => Promise<Server> }>({
  fresh: async ({}, use) => {
    const started: Server[] = [];
    await use(async (addr) => {
      const server = await startServer(addr);
      started.push(server);
      return server;
    });
    for (const server of started) await server.stop();
  },
});

const device = () => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
async function api(server: Server, path: string, body: object) {
  const res = await fetch(server.url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}
// A token for an account, as a device of it would hold one.
async function tokenOf(server: Server, username: string) {
  const id = device();
  const { body } = await api(server, '/api/login', { username, password: PASSWORD, device: id });
  return { token: body.token as string, device: id };
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, name: string) => page.getByRole('textbox', { name: new RegExp(`^${name}\\b`) });

// Sets a fresh server up from the browser: the account made is its owner.
async function setUp(page: Page, server: Server, username: string) {
  await page.goto(server.url);
  await expect(page.getByRole('heading', { name: 'Set up this server', level: 1 })).toBeVisible();
  await expect(page.getByText('There is no account here yet. The first one runs this server: it can invite people, and decides who else can.')).toBeVisible();
  await field(page, 'Username').fill(username);
  await field(page, 'Password').fill(PASSWORD);
  await button(page, 'Set up').click();
  await expect(startButton(page)).toBeVisible();
}
const settings = async (page: Page, username: string) => {
  await page.getByRole('link', { name: `Settings, signed in as ${username}` }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
};
const panel = (page: Page, title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, level: 2, exact: true }) });

// The owner makes a link in Settings and reads it off the screen, whole.
async function makeLink(page: Page) {
  const invites = panel(page, 'Invites');
  await button(invites as never, 'Make an invite link').click();
  const fresh = invites.getByRole('region', { name: 'The new link' });
  await expect(fresh).toBeVisible();
  const link = (await fresh.locator('p').first().innerText()).trim();
  expect(link).toMatch(/^http:\/\/[^/]+\/#\/join\/[A-Za-z0-9_-]+$/);
  return link;
}
// Joins by a link with only a username and a password.
async function joinBy(page: Page, link: string, username: string) {
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Join with an invite', level: 1 })).toBeVisible();
  await expect(field(page, 'Invite')).toHaveCount(0);
  await field(page, 'Username').fill(username);
  await field(page, 'Password').fill(PASSWORD);
  await button(page, 'Join').click();
}

test('a fresh server is set up from the browser: the first account is the owner; then it is an ordinary server, and a second setup is refused', async ({ fresh, deviceA: a, deviceB: b }) => {
  const server = await fresh();
  expect(await (await fetch(`${server.url}/healthz`)).json()).toMatchObject({ ok: true, setup: true });
  await setUp(a.page, server, 'owner');
  // The owner decides who the admins are; the panel says so.
  await settings(a.page, 'owner');
  await expect(panel(a.page, 'Admins')).toContainText('You decide who can invite.');
  await expect(panel(a.page, 'Admins')).toContainText('owner');

  expect(await (await fetch(`${server.url}/healthz`)).json()).not.toHaveProperty('setup');
  await b.page.goto(server.url);
  await expect(b.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(b.page.getByText('Set up this server')).toHaveCount(0);
  for (const invite of [undefined, '']) {
    const second = await api(server, '/api/register', { ...(invite === undefined ? {} : { invite }), username: 'usurper', password: PASSWORD, device: device() });
    expect(second.status, JSON.stringify(second.body)).not.toBe(200);
    expect(['invite', 'bad_request']).toContain(second.body.error);
  }
});

test('two browsers on a fresh server\'s setup at once: the second is told someone else set it up, and is left at an ordinary sign in', async ({ fresh, deviceA: a, deviceB: b }) => {
  const server = await fresh();
  for (const d of [a, b]) {
    await d.page.goto(server.url);
    await expect(d.page.getByRole('heading', { name: 'Set up this server', level: 1 })).toBeVisible();
  }
  await setUp(a.page, server, 'first');
  await field(b.page, 'Username').fill('second');
  await field(b.page, 'Password').fill(PASSWORD);
  await button(b.page, 'Set up').click();
  // Protocol section 10: either answer means somebody else has set this server up.
  await expect(b.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible({ timeout: 3000 });
  await expect(b.page.getByRole('alert')).toHaveText('Someone set this server up a moment ago. Sign in if that was you, or ask them for an invite.');
});

test('an invite link made in Settings: joined with only a username and a password; the member sees neither Invites nor Admins; the link is then gone and refused', async ({ fresh, deviceA: a, deviceB: b, deviceC: c }) => {
  const server = await fresh();
  await setUp(a.page, server, 'owner');
  await settings(a.page, 'owner');
  await expect(panel(a.page, 'Invites')).toContainText('A link makes one account, once, and runs out in 7 days.');
  const link = await makeLink(a.page);
  expect(link.startsWith(server.url)).toBe(true);
  // There to be copied: the one line on the screen that selects.
  expect(await selectable(panel(a.page, 'Invites').getByRole('region', { name: 'The new link' }).locator('p').first()), 'the invite link does not select').toBe(true);

  await joinBy(b.page, link, 'member');
  await expect(startButton(b.page)).toBeVisible();
  await settings(b.page, 'member');
  await expect(b.page.getByRole('heading', { name: 'Invites' })).toHaveCount(0);
  await expect(b.page.getByRole('heading', { name: 'Admins' })).toHaveCount(0);

  // After a refresh the used link is no longer in the owner's list.
  await a.page.reload();
  await settings(a.page, 'owner').catch(() => {});
  await expect(panel(a.page, 'Invites')).toContainText('No invite is open.');

  // The same link again: no longer good, and the ordinary form takes over.
  await joinBy(c.page, link, 'latecomer');
  await expect(c.page.getByRole('alert')).toHaveText('That invite is no longer good: it was used, taken back or ran out. Ask for a new link, or sign in if you have an account here.');
  await expect(field(c.page, 'Invite')).toBeVisible();
});

test('take back needs a second tap and the link is then refused; renew keeps the link and moves its day', async ({ fresh, deviceA: a, deviceB: b }) => {
  const server = await fresh();
  await setUp(a.page, server, 'owner');
  await settings(a.page, 'owner');
  const kept = await makeLink(a.page);
  const gone = await makeLink(a.page);
  const end = (link: string) => link.split('/').pop()!.slice(-6);
  const invites = panel(a.page, 'Invites');
  // The newest link stands in its own block until it is copied, and is then a row like the others
  // (DESIGN.md: a thing shown as new is not also drawn in the list under it).
  await a.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const newest = invites.getByRole('region', { name: 'The new link' });
  await newest.getByRole('button', { name: 'Copy the link' }).click();
  await expect(newest).toHaveCount(0);
  await expect(invites.getByRole('button', { name: `Take back, the invite ending ${end(gone)}` })).toBeVisible();

  // Renew: the same link, a later end.
  const { token, device: id } = await tokenOf(server, 'owner');
  const before = (await api(server, '/api/invites/list', { token, device: id })).body.invites.find((i: { invite: string }) => i.invite === kept.split('/').pop());
  await a.page.waitForTimeout(50);
  await invites.getByRole('button', { name: `Renew, the invite ending ${end(kept)}` }).click();
  await expect(invites.getByRole('status')).toHaveText(/^Good until .+\.$/);
  const after = (await api(server, '/api/invites/list', { token, device: id })).body.invites.find((i: { invite: string }) => i.invite === kept.split('/').pop());
  expect(after, 'the renewed link was replaced').toBeDefined();
  expect(after.expires).toBeGreaterThan(before.expires);

  // Take back: the first tap only asks; Keep the link keeps it; the second tap takes it.
  await invites.getByRole('button', { name: `Take back, the invite ending ${end(gone)}` }).click();
  await invites.getByRole('button', { name: `Keep the link, the invite ending ${end(gone)}` }).click();
  await expect(invites.getByRole('button', { name: `Take back, the invite ending ${end(gone)}` })).toBeVisible();
  await invites.getByRole('button', { name: `Take back, the invite ending ${end(gone)}` }).click();
  await invites.getByRole('button', { name: `Take it back, the invite ending ${end(gone)}` }).click();
  await expect(invites.getByRole('status')).toHaveText('Taken back. That link no longer works.');
  await expect(invites.getByRole('button', { name: new RegExp(`ending ${end(gone)}$`) })).toHaveCount(0);
  await joinBy(b.page, gone, 'tooslow');
  await expect(b.page.getByRole('alert')).toHaveText(/^That invite is no longer good/);
});

// Sam, a member of a fresh server set up by the owner on A, signed in on B and on Settings.
async function ownerAndSam(fresh: () => Promise<Server>, a: Page, b: Page) {
  const server = await fresh();
  await setUp(a, server, 'owner');
  await settings(a, 'owner');
  await joinBy(b, await makeLink(a), 'sam');
  await expect(startButton(b)).toBeVisible();
  await settings(b, 'sam');
  await expect(b.getByRole('heading', { name: 'Invites' })).toHaveCount(0);
  return server;
}
// A mark on the page and a count of sockets opened from now: a reload loses the one, a new connection adds to the other.
async function watchConnection(page: Page) {
  let opened = 0;
  page.on('websocket', () => void opened++);
  await page.evaluate(() => void ((window as unknown as { __same: boolean }).__same = true));
  return async () => ({ reloaded: !(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same === true)), opened });
}

test('a role changed by the owner reaches the open Settings at once: raised, Invites shows and Admins does not; lowered, Invites goes and the server says forbidden; Undo, it is back; an unknown name says so', async ({ fresh, deviceA: a, deviceB: b }) => {
  const server = await ownerAndSam(fresh, a.page, b.page);
  const since = await watchConnection(b.page);
  const admins = panel(a.page, 'Admins');
  await field(admins as never, 'Username').fill('nobody_here');
  await button(admins as never, 'Make an admin').click();
  await expect(admins.getByRole('alert')).toHaveText('Nobody by that name is on this server.');

  await field(admins as never, 'Username').fill('sam');
  await button(admins as never, 'Make an admin').click();
  await expect(admins.getByRole('listitem').filter({ hasText: 'sam' })).toContainText('admin');
  await expect(panel(b.page, 'Invites')).toBeVisible({ timeout: 2000 });
  await expect(b.page.getByRole('heading', { name: 'Admins' })).toHaveCount(0);
  await makeLink(b.page);

  await admins.getByRole('button', { name: 'Back to member: sam' }).click();
  await expect(admins.getByRole('status')).toContainText('sam is a member again.');
  await expect(b.page.getByRole('heading', { name: 'Invites' })).toHaveCount(0, { timeout: 2000 });
  const sam = await tokenOf(server, 'sam');
  expect(await api(server, '/api/invites/create', sam)).toEqual({ status: 403, body: { error: 'forbidden' } });

  await admins.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(admins.getByRole('listitem').filter({ hasText: 'sam' })).toContainText('admin');
  await expect(panel(b.page, 'Invites')).toBeVisible({ timeout: 2000 });
  expect(await since(), 'sam\'s page was reloaded, or opened a new connection').toEqual({ reloaded: false, opened: 0 });
});

test('a device that has not heard of its new role: lowered while its socket passes nothing, its panel asks, hears forbidden, and says inviting is no longer theirs, with nothing to press', async ({ fresh, deviceA: a, deviceB: b }) => {
  await ownerAndSam(fresh, a.page, b.page);
  const admins = panel(a.page, 'Admins');
  await field(admins as never, 'Username').fill('sam');
  await button(admins as never, 'Make an admin').click();
  await expect(panel(b.page, 'Invites')).toBeVisible({ timeout: 2000 });

  // Sam's socket stays open and passes nothing, as one that died without a word does: the role
  // message cannot arrive, and only a request over plain HTTP can learn of the change.
  b.silence(true);
  await admins.getByRole('button', { name: 'Back to member: sam' }).click();
  await expect(admins.getByRole('status')).toContainText('sam is a member again.');
  await b.page.waitForTimeout(500);
  await expect(panel(b.page, 'Invites'), 'the role reached a silenced socket').toBeVisible();

  // Opening Settings again asks for the invites, and the answer is forbidden.
  await b.page.getByRole('button', { name: 'Back', exact: true }).click();
  await settings(b.page, 'sam');
  const theirs = panel(b.page, 'Invites');
  await expect(theirs).toContainText('Inviting is no longer yours on this server. Whoever runs it changed that.');
  await expect(theirs.getByRole('button')).toHaveCount(0);
  b.silence(false);
});

test('nobody can change the owner: naming the owner is bad_request from the owner and forbidden from an admin', async ({ fresh, deviceA: a, deviceB: b }) => {
  const server = await fresh();
  await setUp(a.page, server, 'owner');
  await settings(a.page, 'owner');
  await joinBy(b.page, await makeLink(a.page), 'sam');
  await expect(startButton(b.page)).toBeVisible();
  const owner = await tokenOf(server, 'owner');
  expect(await api(server, '/api/admins/set', { ...owner, username: 'sam', role: 'admin' })).toEqual({ status: 200, body: {} });
  const sam = await tokenOf(server, 'sam');
  for (const role of ['member', 'admin']) {
    expect(await api(server, '/api/admins/set', { ...owner, username: 'owner', role })).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(await api(server, '/api/admins/set', { ...sam, username: 'owner', role })).toEqual({ status: 403, body: { error: 'forbidden' } });
  }
  expect((await api(server, '/api/admins/list', owner)).body.admins[0]).toEqual({ username: 'owner', role: 'owner', picture: null });
});

test('plain http is said once in Settings\' Account for a server on the network, and not for localhost', async ({ fresh, deviceA: a, deviceB: b }) => {
  const plain = 'This address is plain http. Anyone on the same network can read what is sent, the password too.';
  // 127.0.0.2 is this machine too, but not a name the app counts as local: it stands for a LAN address.
  const lan = await fresh(`127.0.0.2:${18900 + Math.floor(Math.random() * 90)}`);
  await setUp(a.page, lan, 'owner');
  await settings(a.page, 'owner');
  await expect(a.page.getByText(plain)).toHaveCount(1);
  const local = await fresh();
  await setUp(b.page, local, 'owner');
  await settings(b.page, 'owner');
  await expect(b.page.getByText(plain)).toHaveCount(0);
});
