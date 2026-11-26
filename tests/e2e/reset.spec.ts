// A way back in (protocol section 10, its last block): the owner makes a link in Settings that
// sets a new password, once; whoever holds it uses it signed out, and every device of the account
// is signed out with nothing it had not sent lost. Each test starts a fresh server of its own, so
// its owner is one a test can sign in as, and reset. The 24 hours are the Go tests'.
import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { device as nodeDevice, inStep, PASSWORD, startServer, until } from '../sync/harness.ts';
import type { Server } from '../sync/harness.ts';
import { go, quickAdd, onDisk, signIn, startButton, statusLine } from './app.ts';
import { test as base, expect } from './devices.ts';
import type { Device } from './devices.ts';
import { ADDR, appUrl } from './server.ts';

const test = base.extend<{ fresh: () => Promise<Server> }>({
  fresh: async ({}, use) => {
    const started: Server[] = [];
    await use(async () => {
      const server = await startServer();
      started.push(server);
      return server;
    });
    for (const server of started) await server.stop();
  },
});

const BIN = join(import.meta.dirname, '../../server/bin/heirloomd');
const OWNER = 'the owner password';
const NEW = 'a brand new password';
const said = {
  dead: 'This link no longer works. Ask whoever gave it to you for a new one.',
  refused: 'The server signed this laptop out. Your laps are safe on it.',
  forgot: 'Forgot your password? Whoever runs this server can give you a link that sets a new one. If that is you, run heirloomd -reset with your username on the server.',
  forgotApp: 'Forgot your password? Whoever runs this server can give you a link. It opens in a browser: set the new password there, then sign in here.',
};

const deviceId = () => randomBytes(8).toString('hex');
async function api(server: Server, path: string, body: object) {
  const res = await fetch(server.url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}
async function tokenOf(server: Server, username: string, password: string) {
  const id = deviceId();
  const { status, body } = await api(server, '/api/login', { username, password, device: id });
  return { status, token: body.token as string, device: id };
}
/** A fresh server whose first account, `owner`, owns it, and these members, each with PASSWORD. */
async function serverWith(fresh: () => Promise<Server>, ...members: string[]) {
  const server = await fresh();
  expect((await api(server, '/api/register', { username: 'owner', password: OWNER, device: deviceId() })).status).toBe(200);
  for (const username of members) expect((await api(server, '/api/register', { invite: server.invite(), username, password: PASSWORD, device: deviceId() })).status).toBe(200);
  return server;
}
/** A reset made over the API by the owner: its last part. */
async function resetFor(server: Server, username: string) {
  const { body } = await api(server, '/api/resets/create', { ...(await tokenOf(server, 'owner', OWNER)), username });
  return body.reset.reset as string;
}
const linkOf = (server: Server, reset: string) => `${server.url}/#/reset/${reset}`;
const look = (server: Server, reset: string) => api(server, '/api/reset/look', { reset });
/** What the server makes of a device's token: 403 from a member's that it takes (inviting is not theirs), 401 `token` from one it does not. */
const tokenSays = async (server: Server, held: { token: string; device: string }) => (await api(server, '/api/invites/list', held)).status;

/** Signs in on this browser, ready on Focus, and returns the token and device the sign in was given. */
async function signInAt(page: Page, server: Server, username: string, password = PASSWORD) {
  await page.goto(server.url);
  const login = page.waitForResponse((r) => r.url().endsWith('/api/login'));
  await signIn(page, username, password);
  const res = await login;
  const held = { token: (await res.json()).token as string, device: JSON.parse(res.request().postData()!).device as string };
  await expect(startButton(page)).toBeVisible();
  return held;
}
const settings = async (page: Page, username: string) => {
  await page.getByRole('link', { name: `Settings, signed in as ${username}` }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
};
const panel = (page: Page, title: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, level: 2, exact: true }) });
const newPassword = (page: Page) => page.getByRole('textbox', { name: /^New password/ });
/** A device the reset signed out, signed in again from Settings with the new password. */
async function signInAgain(page: Page, username: string) {
  await settings(page, username);
  await panel(page, 'Account').getByRole('button', { name: 'Sign in again' }).click();
  await signIn(page, username, NEW);
  await expect(statusLine(page)).toHaveText('', { timeout: 5000 });
}

/** The rows of a dataset the server holds, read by a new Node device of the account signed in with `password`. */
async function rowsAs(server: Server, username: string, password: string, dataset: string) {
  const d = await nodeDevice(server);
  try {
    const res = await d.engine.signIn(username, password);
    if (!res.ok) throw new Error(`sign in ${username}: ${res.error}`);
    await until(() => inStep(d.engine), 10000, `a new device of ${username} did not catch up`);
    return [...d.engine.rows(dataset).value.values()];
  } finally {
    await d.engine.stop();
  }
}

test('the owner makes a reset link in Settings: shown once, with Copy, and still there after a copy; drawn at once as a row that runs out at a time, and taken back from that row the block goes and the link is dead; an admin and a member have no such block, and the server refuses them', async ({ fresh, deviceA: a, deviceB: b, deviceC: c }) => {
  const server = await serverWith(fresh, 'sam', 'ada');
  expect((await api(server, '/api/admins/set', { ...(await tokenOf(server, 'owner', OWNER)), username: 'ada', role: 'admin' })).status).toBe(200);

  await signInAt(a.page, server, 'owner', OWNER);
  await settings(a.page, 'owner');
  const resets = panel(a.page, 'A way back in');
  await expect(resets).toContainText('For someone who forgot their password. The link sets a new one, once, and works for 24 hours. Using it signs their devices out. A new link for the same name ends the one before.');
  await resets.getByRole('textbox', { name: /^Username/ }).fill('Sam');
  await resets.getByRole('button', { name: 'Make a reset link', exact: true }).click();
  const made = resets.getByRole('region', { name: 'The new link' });
  await expect(made).toBeVisible();
  const link = (await made.locator('p').first().innerText()).replace(/\s/g, '');
  expect(link).toMatch(new RegExp(`^${server.url.replace(/[.]/g, '\\.')}/#/reset/[A-Za-z0-9_-]{40,}$`));
  await expect(made).toContainText('Give it to sam yourself. It is shown only now.');
  // It cannot be shown again, so a copy does not put it away.
  await a.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await made.getByRole('button', { name: 'Copy the link', exact: true }).click();
  await expect(resets.getByRole('status')).toHaveText('Copied.');
  await expect(made).toBeVisible();
  expect(await a.page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  // Drawn as a row at once too, so it can be taken back at once.
  const row = /sam\s*runs out at \d{1,2}:\d\d (today|tomorrow)/;
  await expect(resets).toContainText(row);
  await expect(resets.getByRole('button', { name: 'Take back, the link for sam' })).toBeVisible();
  expect((await look(server, link.split('/').pop()!)).body).toEqual({ username: 'sam' });

  // Settings opened again: the link is never shown again, and sam's row stays.
  await a.page.getByRole('button', { name: 'Back', exact: true }).click();
  await settings(a.page, 'owner');
  await expect(made).toHaveCount(0);
  await expect(resets).not.toContainText(link.split('/').pop()!);
  await expect(resets).toContainText(row);

  // A second link for sam replaces the first; taken back from its row while it is still shown as new, both are dead and the block goes.
  await resets.getByRole('textbox', { name: /^Username/ }).fill('sam');
  await resets.getByRole('button', { name: 'Make a reset link', exact: true }).click();
  await expect(made).toBeVisible();
  const second = (await made.locator('p').first().innerText()).replace(/\s/g, '').split('/').pop()!;
  expect((await look(server, link.split('/').pop()!)).body).toEqual({ error: 'reset' });
  await resets.getByRole('button', { name: 'Take back, the link for sam' }).click();
  await resets.getByRole('button', { name: 'Take it back, the link for sam' }).click();
  await expect(made).toHaveCount(0);
  await expect(resets.getByRole('button', { name: /the link for sam$/ })).toHaveCount(0);
  expect((await look(server, second)).body).toEqual({ error: 'reset' });

  for (const [d, name] of [[b, 'ada'], [c, 'sam']] as const) {
    const held = await signInAt(d.page, server, name);
    await settings(d.page, name);
    await expect(d.page.getByRole('heading', { name: 'A way back in' })).toHaveCount(0);
    for (const path of ['/api/resets/create', '/api/resets/list', '/api/resets/revoke']) {
      expect(await api(server, path, { ...held, username: 'owner' }), `${path} from ${name}`).toEqual({ status: 403, body: { error: 'forbidden' } });
    }
  }
});

test('a link opened signed out names whose password and where; a short one is refused in words, a good one signs in; both old devices are signed out at once, and their tokens refused. No work lost: an edit made offline on one of them reaches the server and every device once it signs in again with the new password', async ({ fresh, deviceA: a, deviceB: b, deviceC: c }) => {
  const server = await serverWith(fresh, 'sam');
  const atA = await signInAt(a.page, server, 'sam');
  const atB = await signInAt(b.page, server, 'sam');
  expect(await tokenSays(server, atA)).toBe(403);

  // B's edit, made with no network, waits on B alone.
  const title = 'Pointers, chapter 4';
  await go(b.page, 'Today');
  await b.setOffline(true);
  await quickAdd(b.page, title);
  await expect(b.page.getByRole('checkbox', { name: `Done: ${title}` })).toBeVisible();
  await onDisk(b.page, 'task/');

  const reset = await resetFor(server, 'sam');
  await c.page.goto(linkOf(server, reset));
  await expect(c.page.getByRole('heading', { name: 'A new password', level: 1 })).toBeVisible();
  await expect(c.page.getByText(`For sam, on ${new URL(server.url).host}.`)).toBeVisible();
  await expect(c.page.getByText('Your other devices will be signed out. Sign in on them with the new password.')).toBeVisible();
  await expect(c.page.getByRole('button', { name: 'Back to sign in' })).toBeVisible();
  // Read once and gone from the address bar: a link is a key.
  expect(c.page.url()).not.toContain(reset);
  await newPassword(c.page).fill('short');
  await c.page.getByRole('button', { name: 'Set it and sign in' }).click();
  await expect(c.page.getByRole('alert')).toHaveText('A password is 8 characters or more.');
  // Refused on the page: the link is still good.
  expect((await look(server, reset)).status).toBe(200);
  await newPassword(c.page).fill(NEW);
  await c.page.getByRole('button', { name: 'Set it and sign in' }).click();
  await expect(startButton(c.page)).toBeVisible();

  // A's socket is cut with bye: it hears at once, with nothing touched.
  await expect(statusLine(a.page)).toHaveText(said.refused, { timeout: 2000 });
  expect(await tokenSays(server, atA)).toBe(401);
  expect(await tokenSays(server, atB)).toBe(401);
  expect((await tokenOf(server, 'sam', PASSWORD)).status).toBe(401);

  // B comes back with its old token: refused, and its edit still on its screen.
  await b.setOffline(false);
  await expect(statusLine(b.page)).toHaveText(said.refused, { timeout: 10000 });
  await expect(b.page.getByRole('checkbox', { name: `Done: ${title}` })).toBeVisible();

  await signInAgain(b.page, 'sam');
  await expect.poll(async () => (await rowsAs(server, 'sam', NEW, 'task')).map((row) => row.title), { message: 'B\'s offline edit never reached the server', timeout: 10000 }).toContain(title);
  await go(c.page, 'Today');
  await expect(c.page.getByRole('checkbox', { name: `Done: ${title}` })).toBeVisible({ timeout: 5000 });
  await signInAgain(a.page, 'sam');
  await go(a.page, 'Today');
  await expect(a.page.getByRole('checkbox', { name: `Done: ${title}` })).toBeVisible({ timeout: 5000 });
});

test('a dead link says so and who to ask, with no field: used once, taken back in Settings with a second tap, or replaced by a newer one for the same name; the address bar never keeps it', async ({ fresh, deviceA: a, deviceB: b }) => {
  const server = await serverWith(fresh, 'sam', 'kit');
  const dead = async (page: Page, reset: string) => {
    expect((await look(server, reset)).body).toEqual({ error: 'reset' });
    await page.goto(linkOf(server, reset));
    // The live form folds away as the sentence folds in: its own alert region is empty.
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(said.dead);
    expect(page.url()).not.toContain(reset);
    await expect(newPassword(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  };

  // Used once.
  const used = await resetFor(server, 'sam');
  expect((await api(server, '/api/reset', { reset: used, password: NEW, device: deviceId() })).status).toBe(200);
  await dead(b.page, used);

  // Replaced: the newer one works, the older is dead.
  const older = await resetFor(server, 'kit');
  const newer = await resetFor(server, 'kit');
  await dead(b.page, older);
  expect((await look(server, newer)).body).toEqual({ username: 'kit' });

  // Taken back in Settings: the first tap only asks.
  await signInAt(a.page, server, 'owner', OWNER);
  await settings(a.page, 'owner');
  const resets = panel(a.page, 'A way back in');
  await resets.getByRole('button', { name: 'Take back, the link for kit' }).click();
  await resets.getByRole('button', { name: 'Keep the link, the link for kit' }).click();
  expect((await look(server, newer)).status).toBe(200);
  await resets.getByRole('button', { name: 'Take back, the link for kit' }).click();
  await resets.getByRole('button', { name: 'Take it back, the link for kit' }).click();
  await expect(resets.getByRole('status')).toHaveText('Taken back. That link no longer works.');
  await expect(resets.getByRole('button', { name: /the link for kit$/ })).toHaveCount(0);
  await dead(b.page, newer);
});

test('a link opened where an account is signed in: whose it is and that signing out brings the page back, no field, and the link is not used', async ({ fresh, deviceA: a }) => {
  const server = await serverWith(fresh, 'sam', 'kit');
  const held = await signInAt(a.page, server, 'kit');
  const reset = await resetFor(server, 'sam');
  await a.page.goto(linkOf(server, reset));
  await expect(a.page.getByText('This link sets a new password for sam. Sign out in Settings and this page comes back.')).toBeVisible();
  await expect(newPassword(a.page)).toHaveCount(0);
  expect(a.page.url()).not.toContain(reset);
  expect((await look(server, reset)).body).toEqual({ username: 'sam' });
  expect(await tokenSays(server, held)).toBe(403);
});

test('an unknown name in Settings is refused, and the owner\'s own with the heirloomd -reset sentence; heirloomd -reset beside the running server prints a link that works for the owner, and the owner\'s devices are signed out', async ({ fresh, deviceA: a, deviceB: b }) => {
  const server = await serverWith(fresh, 'sam');
  const atA = await signInAt(a.page, server, 'owner', OWNER);
  await settings(a.page, 'owner');
  const resets = panel(a.page, 'A way back in');
  await resets.getByRole('textbox', { name: /^Username/ }).fill('nobody_here');
  await resets.getByRole('button', { name: 'Make a reset link', exact: true }).click();
  await expect(resets.getByRole('alert')).toHaveText('Nobody by that name is on this server.');
  await resets.getByRole('textbox', { name: /^Username/ }).fill('owner');
  await resets.getByRole('button', { name: 'Make a reset link', exact: true }).click();
  await expect(resets.getByRole('alert')).toHaveText('Your own password is reset on the server itself: heirloomd -reset owner');
  await expect(resets.getByRole('region', { name: 'The new link' })).toHaveCount(0);

  // The reset alone on standard output, as -invite prints its invite.
  const reset = execFileSync(BIN, ['-data', server.data, '-reset', 'owner'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  expect(reset).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  await b.page.goto(linkOf(server, reset));
  await expect(b.page.getByText(`For owner, on ${new URL(server.url).host}.`)).toBeVisible();
  await newPassword(b.page).fill(NEW);
  await b.page.getByRole('button', { name: 'Set it and sign in' }).click();
  await expect(startButton(b.page)).toBeVisible();
  await settings(b.page, 'owner');
  await expect(panel(b.page, 'A way back in')).toBeVisible();

  await expect(statusLine(a.page)).toHaveText(said.refused, { timeout: 2000 });
  expect((await api(server, '/api/invites/list', atA)).status).toBe(401);
  expect((await tokenOf(server, 'owner', OWNER)).status).toBe(401);
  expect((await tokenOf(server, 'owner', NEW)).status).toBe(200);
});

test('the sign-in screen says where a forgotten password leads; the phone app\'s says the link opens in a browser, and a reset link pasted as an invite says so', async ({ deviceA: a, deviceB: b }) => {
  await a.page.goto('/');
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(a.page.getByText(said.forgot)).toBeVisible();
  // Not where nobody has a password yet to forget.
  await a.page.getByRole('button', { name: 'I have an invite' }).click();
  await expect(a.page.getByText(said.forgot)).toHaveCount(0);

  await b.page.goto(appUrl());
  const step = b.page.getByRole('heading', { name: 'Which server?', level: 1 });
  const welcome = b.page.getByRole('button', { name: 'Connect to a server', exact: true });
  await expect(welcome.or(step)).toBeVisible();
  if (await welcome.isVisible()) await welcome.click();
  await b.page.getByRole('textbox', { name: /^Server\b/ }).fill(ADDR);
  await b.page.getByRole('button', { name: 'Use this server', exact: true }).click();
  await expect(b.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible({ timeout: 10000 });
  await expect(b.page.getByText(said.forgotApp)).toBeVisible();
  await expect(b.page.getByText(said.forgot)).toHaveCount(0);
  // A reset link pasted where the app asks for an invite: it is for a browser.
  await b.page.getByRole('button', { name: 'I have an invite' }).click();
  await b.page.getByRole('textbox', { name: /^Invite\b/ }).fill(`http://${ADDR}/#/reset/q7XkVb3n0Pz8Lw2mRt5YcH1aJe9sKd4fUg6oNi0QxBy`);
  await b.page.getByRole('textbox', { name: /^Username\b/ }).fill('sachi');
  await b.page.getByRole('textbox', { name: /^Password\b/ }).fill(PASSWORD);
  await b.page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(b.page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText('This link sets a new password. Open it in a browser, set the password there, then sign in here.');
});

/**
 * Push with no push service: the browser's PushManager hands out a subscription made here, with a
 * real P-256 key (the server checks it) and an endpoint on a closed local port. No lap runs to a
 * bell in these tests, so the server never tries it; nothing is ever sent to a real push service.
 */
async function fakePush(d: Device, origin: string) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const keys = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
  await d.context.grantPermissions(['notifications'], { origin });
  await d.context.addInitScript((keys) => {
    // The headless shell says denied whatever was granted: a person who allowed notifications.
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
    let held: unknown = null;
    PushManager.prototype.getSubscription = async () => held as PushSubscription | null;
    PushManager.prototype.subscribe = async (options) => {
      const key = new Uint8Array(options!.applicationServerKey as ArrayBuffer).slice().buffer;
      held = { options: { applicationServerKey: key }, toJSON: () => ({ endpoint: 'https://127.0.0.1:9/heirloom-e2e', keys }), unsubscribe: async () => ((held = null), true) };
      return held as PushSubscription;
    };
  }, keys);
  // Each subscription the server took.
  const taken: number[] = [];
  d.page.on('response', (r) => void (r.url().endsWith('/api/push/subscribe') && r.status() === 200 && taken.push(Date.now())));
  return () => taken.length;
}
const workerReady = (page: Page) => page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

test('after a reset the browsers subscribe to push again: the one that used the link, and one the reset signed out once it signs in again', async ({ fresh, deviceA: a, deviceC: c }) => {
  const server = await serverWith(fresh, 'sam');
  const atA = await fakePush(a, server.url);
  const atC = await fakePush(c, server.url);

  await a.page.goto(server.url);
  await workerReady(a.page);
  await signInAt(a.page, server, 'sam');
  await expect.poll(atA, { message: 'A never subscribed at its first sign in' }).toBe(1);

  await c.page.goto(linkOf(server, await resetFor(server, 'sam')));
  await workerReady(c.page);
  await newPassword(c.page).fill(NEW);
  await c.page.getByRole('button', { name: 'Set it and sign in' }).click();
  await expect(startButton(c.page)).toBeVisible();
  await expect.poll(atC, { message: 'the browser that used the link never subscribed' }).toBe(1);

  // A's subscription went with its token. Signed in again, the server must hear of it again.
  await expect(statusLine(a.page)).toHaveText(said.refused, { timeout: 2000 });
  await signInAgain(a.page, 'sam');
  await expect.poll(atA, { message: 'A, signed in again after the reset, never subscribed again: the server holds no subscription for it, so a closed tab is not rung', timeout: 5000 }).toBe(2);
});
