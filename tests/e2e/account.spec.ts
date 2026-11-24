// Accounts through the screens (protocol section 10), and the API from another origin, which is
// what the phone app is.
import { PASSWORD } from '../sync/harness.ts';
import { accountWith, join, ready, server, signIn, statusLine, username } from './app.ts';
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
  await expect(c.page.getByRole('alert')).toHaveText('That invite is not known here, or it has been used. A code works once.');

  // One account on both: a lap started on A is on B.
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await expect(b.page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 1000 });
});

test('sign out with nothing unsent goes back to sign in, and signing in again catches up from the server', async ({ deviceA: a, deviceB: b }) => {
  const name = username('signout');
  await accountWith(name);
  for (const d of [a, b]) {
    await signIn(d.page, name);
    await ready(d.page);
  }
  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await expect(b.page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(statusLine(a.page)).toHaveText('');

  await a.page.getByRole('button', { name: 'Sign out' }).click();
  await expect(a.page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // While A is away, B pauses: A can only know that from the server.
  await b.page.getByRole('button', { name: 'Pause' }).click();
  await signIn(a.page, name);
  await expect(a.page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 5000 });
  await expect(a.page.getByText('Lap 1 of 4, paused')).toBeVisible();
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
