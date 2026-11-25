// Accounts through the screens (protocol section 10), and the API from another origin, which is
// what the phone app is.
import { PASSWORD } from '../sync/harness.ts';
import { accountWith, go, join, ready, server, signIn, startButton, statusLine, username } from './app.ts';
import { ADDR } from './server.ts';
import { expect, test } from './devices.ts';

test('join with an invite on A, sign in on B; a wrong password and a used invite each say so', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  const name = username('join');
  const invite = server.invite();
  await join(a.page, invite, name);
  await ready(a.page);

  await signIn(b.page, name, 'not the password');
  await expect(b.page.getByRole('alert')).toHaveText('That username and password do not match.');
  await signIn(b.page, name);
  await ready(b.page);

  await join(c.page, invite, username('again'));
  await expect(c.page.getByRole('alert')).toHaveText('That invite is not known here, or it was used, taken back or ran out. A link works once.');

  // One account on both: a lap started on A is on B.
  await startButton(a.page).click();
  await expect(b.page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 1000 });
});

test('sign out with nothing unsent goes back to sign in, and signing in again catches up from the server', async ({ deviceA: a, deviceB: b }) => {
  const name = username('signout');
  await accountWith(name);
  for (const d of [a, b]) {
    await signIn(d.page, name);
    await ready(d.page);
  }
  await startButton(a.page).click();
  await expect(b.page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(statusLine(a.page)).toHaveText('');

  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  await a.page.getByRole('button', { name: 'Sign out' }).click();
  await expect(a.page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // While A is away, B pauses: A can only know that from the server.
  await b.page.getByRole('button', { name: 'Pause' }).click();
  await signIn(a.page, name);
  // Signing in again opens where signing out was done, Settings; the lap is on Focus.
  await go(a.page, 'Focus');
  await expect(a.page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 5000 });
  await expect(a.page.getByText('Lap 1 of 4 in this set, paused')).toBeVisible();
});

test('a page from another origin can sign in over the API and open the socket, as the phone app will', async ({ browser }) => {
  const name = username('origin');
  await accountWith(name);
  // Without the rail's socket routing, so the socket really goes from this origin to the server.
  const context = await browser.newContext();
  const page = await context.newPage();
  const api = `http://${ADDR}`;
  // localhost and 127.0.0.1 are different origins: the page is not the server's.
  await page.goto(`http://localhost:${ADDR.split(':')[1]}/healthz`);
  const said = await page.evaluate(
    async ({ api, name, password }) => {
      const device = '0123456789abcdef';
      const res = await fetch(`${api}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: name, password, device }),
      });
      const login = await res.json();
      const ws = new WebSocket(`${api.replace('http', 'ws')}/api/ws`);
      const first = await new Promise<string>((resolve, reject) => {
        ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token: login.token, device, cursor: 0, client_time: Date.now() }));
        ws.onmessage = (e) => resolve(JSON.parse(e.data).type);
        ws.onerror = () => reject(new Error('the socket failed'));
      });
      ws.close();
      return { origin: location.origin, status: res.status, username: login.username, first };
    },
    { api, name, password: PASSWORD },
  );
  expect(said).toEqual({ origin: `http://localhost:${ADDR.split(':')[1]}`, status: 200, username: name, first: 'welcome' });
  await context.close();
});

test('an invite link put into a sign-in tab that is already open opens the join form with the invite in hand', async ({ deviceA: a }) => {
  await a.page.goto('/');
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  const invite = server.invite();
  await a.page.evaluate((invite) => (location.hash = `#/join/${invite}`), invite);
  await expect(a.page.getByRole('heading', { name: 'Join with an invite', level: 1 })).toBeVisible();
  await expect(a.page.getByText(`This link is your invite to ${ADDR}. Choose a username and a password.`)).toBeVisible();
  await expect(a.page.getByLabel('Invite', { exact: true })).toHaveCount(0);
  await a.page.getByLabel('Username').fill(username('hashjoin'));
  await a.page.getByLabel('Password').fill(PASSWORD);
  await a.page.getByRole('button', { name: 'Join', exact: true }).click();
  await ready(a.page);
});

test('the join form will not send an empty invite: spaces, or a link with nothing after join, are refused in words', async ({ deviceA: a }) => {
  await a.page.goto('/');
  await a.page.getByRole('button', { name: 'I have an invite' }).click();
  await a.page.getByLabel('Username').fill(username('noinvite'));
  await a.page.getByLabel('Password').fill(PASSWORD);
  for (const empty of ['   ', `http://${ADDR}/#/join/`]) {
    await a.page.getByLabel('Invite', { exact: true }).fill(empty);
    await a.page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(a.page.getByRole('alert')).toHaveText('There is no invite in that. Paste the whole link, or its last part.');
    await expect(a.page.getByRole('heading', { name: 'Join with an invite', level: 1 })).toBeVisible();
  }
});
