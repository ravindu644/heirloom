// The phone app's build in a browser: it is not served by its server, so it asks which one
// (protocol section 10). The build and its static server are made by the run's globalSetup.
import type { Page } from '@playwright/test';
import { PASSWORD } from '../sync/harness.ts';
import { startServer } from '../server.ts';
import type { Server } from '../server.ts';
import { username } from './app.ts';
import { test as base, expect } from './devices.ts';
import { ADDR, appUrl, e2eServer } from './server.ts';

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

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, name: string) => page.getByRole('textbox', { name: new RegExp(`^${name}\\b`) });
const plain = 'This address is plain http. Anyone on the same network can read what is sent, the password too.';

async function choose(page: Page, typed: string) {
  await field(page, 'Server').fill(typed);
  await button(page, 'Use this server').click();
}

test('the first screen asks which server; a bad string, a dead port and something that is not heirloom each say their own sentence and keep nothing; the real address is kept and named, with Change only signed out', async ({ deviceA: a }) => {
  await a.page.goto(appUrl());
  await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
  await expect(a.page.getByText('heirloom keeps your laps on a server that you or a friend runs. Say where it is.')).toBeVisible();

  const refusals: [string, string][] = [
    ['not a server, really', 'That is not an address or an invite link. An address looks like 192.168.1.20:8787.'],
    ['127.0.0.1:1', 'Nothing answered at that address. Is this phone on the same network as the server?'],
    // The app's own static server answers, with a page and not heirloom's health.
    [appUrl(), 'Something answered there, but it is not heirloom. Check the address and its port.'],
  ];
  for (const [typed, said] of refusals) {
    await choose(a.page, typed);
    await expect(a.page.getByRole('alert')).toHaveText(said, { timeout: 10000 });
    await a.page.reload();
    await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
    await expect(field(a.page, 'Server'), `"${typed}" was kept`).toHaveValue('');
  }

  // The real server, typed without a scheme: kept, and named on the sign-in screen.
  await choose(a.page, ADDR);
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible({ timeout: 10000 });
  await expect(a.page.getByText(`Server: ${ADDR}`)).toBeVisible();
  await expect(button(a.page, 'Change')).toBeVisible();
  // Not for this machine itself.
  await expect(a.page.getByText(plain)).toHaveCount(0);
  await a.page.reload();
  await expect(a.page.getByText(`Server: ${ADDR}`)).toBeVisible();

  // Change opens the step again with the address in hand; Back returns.
  await button(a.page, 'Change').click();
  await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
  await expect(field(a.page, 'Server')).toHaveValue(`http://${ADDR}`);
  await button(a.page, 'Back').click();

  // Signed in, nothing offers to change the server.
  const name = username('appuser');
  const server = e2eServer();
  await a.page.getByRole('button', { name: 'I have an invite' }).click();
  await field(a.page, 'Invite').fill(server.invite());
  await field(a.page, 'Username').fill(name);
  await field(a.page, 'Password').fill(PASSWORD);
  await button(a.page, 'Join').click();
  await expect(a.page.getByRole('button', { name: /^Start lap 1$/ })).toBeVisible();
  await expect(button(a.page, 'Change')).toHaveCount(0);
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  await expect(a.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(button(a.page, 'Change')).toHaveCount(0);
});

test('a pasted invite link sets the server and opens the join form with the invite in hand', async ({ deviceA: a }) => {
  const server = e2eServer();
  const link = `http://${ADDR}/#/join/${server.invite()}`;
  await a.page.goto(appUrl());
  await choose(a.page, link);
  await expect(a.page.getByRole('heading', { name: 'Join with an invite', level: 1 })).toBeVisible({ timeout: 10000 });
  await expect(a.page.getByText(`This link is your invite to ${ADDR}. Choose a username and a password.`)).toBeVisible();
  await expect(field(a.page, 'Invite')).toHaveCount(0);
  const name = username('linked');
  await field(a.page, 'Username').fill(name);
  await field(a.page, 'Password').fill(PASSWORD);
  await button(a.page, 'Join').click();
  await expect(a.page.getByRole('button', { name: /^Start lap 1$/ })).toBeVisible();
});

test('plain http is said once on the server step, once on the app\'s sign in, and once in Settings\' Account, for a server on the network', async ({ fresh, deviceA: a }) => {
  // 127.0.0.2 is this machine too, but not a name the app counts as local: it stands for a LAN address.
  const host = `127.0.0.2:${18900 + Math.floor(Math.random() * 90)}`;
  await fresh(host);
  await a.page.goto(appUrl());
  await choose(a.page, `http://${host}`);
  // A fresh server: the app's own first screen sets it up.
  await expect(a.page.getByRole('heading', { name: 'Set up this server', level: 1 })).toBeVisible({ timeout: 10000 });
  await expect(a.page.getByText(`Server: ${host}`)).toBeVisible();
  await expect(a.page.getByText(plain)).toHaveCount(1);

  await button(a.page, 'Change').click();
  await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
  await expect(a.page.getByText(plain)).toHaveCount(1);
  await button(a.page, 'Back').click();

  await field(a.page, 'Username').fill('owner');
  await field(a.page, 'Password').fill(PASSWORD);
  await button(a.page, 'Set up').click();
  await expect(a.page.getByRole('button', { name: /^Start lap 1$/ })).toBeVisible();
  await a.page.getByRole('link', { name: 'Settings, signed in as owner' }).click();
  await expect(a.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(a.page.getByText(plain)).toHaveCount(1);
});

test('the phone app keeps a pasted link\'s invite across a restart, until it is used', async ({ deviceA: a }) => {
  const server = e2eServer();
  await a.page.goto(appUrl());
  await choose(a.page, `http://${ADDR}/#/join/${server.invite()}`);
  await expect(a.page.getByRole('heading', { name: 'Join with an invite', level: 1 })).toBeVisible({ timeout: 10000 });
  // The app is closed and opened again at the join form: the invite is still in hand.
  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Join with an invite', level: 1 })).toBeVisible();
  await expect(a.page.getByText(`This link is your invite to ${ADDR}. Choose a username and a password.`)).toBeVisible();
  await expect(field(a.page, 'Invite')).toHaveCount(0);
  await field(a.page, 'Username').fill(username('kept'));
  await field(a.page, 'Password').fill(PASSWORD);
  await button(a.page, 'Join').click();
  await expect(a.page.getByRole('button', { name: /^Start lap 1$/ })).toBeVisible();
});
