// The phone app's build in a browser: it is not served by its server, so it asks which one
// (protocol section 10). The build and its static server are made by the run's globalSetup.
import type { Page } from '@playwright/test';
import { welcome } from '../../client/src/ui/strings.ts';
import { PASSWORD } from '../sync/harness.ts';
import { startServer } from '../server.ts';
import type { Server } from '../server.ts';
import { startButton, username } from './app.ts';
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

const WELCOME = welcome.title;

// To the server step from a page that has none kept: through the welcome when it is shown. The
// rules decide only that it is not shown again once an address is kept; the welcome test holds that.
async function toServerStep(page: Page, reload = false) {
  if (reload) await page.reload();
  else await page.goto(appUrl());
  const step = page.getByRole('heading', { name: 'Which server?', level: 1 });
  await expect(page.getByRole('heading', { name: WELCOME }).or(step)).toBeVisible();
  if (await page.getByRole('heading', { name: WELCOME }).isVisible()) await button(page, 'Connect to a server').click();
  await expect(step).toBeVisible();
}

async function choose(page: Page, typed: string) {
  await field(page, 'Server').fill(typed);
  await button(page, 'Use this server').click();
}

test('the first screen asks which server; a bad string, a dead port and something that is not heirloom each say their own sentence and keep nothing; the real address is kept and named, with Change only signed out', async ({ deviceA: a }) => {
  await toServerStep(a.page);
  const intro = a.page.getByText('heirloom keeps your laps on a server that you or a friend runs. Say where it is.');
  await expect(intro).toBeVisible();

  const refusals: [string, string][] = [
    ['not a server, really', 'That is not an address or an invite link. An address looks like 192.168.1.20:8787.'],
    ['127.0.0.1:1', 'Nothing answered at that address. Is this phone on the same network as the server?'],
    // The app's own static server answers, with a page and not heirloom's health.
    [appUrl(), 'Something answered there, but it is not heirloom. Check the address and its port.'],
  ];
  for (const [typed, said] of refusals) {
    await choose(a.page, typed);
    const alert = a.page.getByRole('alert');
    await expect(alert).toHaveText(said, { timeout: 10000 });
    // An error has its own line: the intro is still there to read, and the two do not overlap.
    await expect(intro).toBeVisible();
    const [e, i] = [(await alert.boundingBox())!, (await intro.boundingBox())!];
    expect(e.y >= i.y + i.height || i.y >= e.y + e.height, `"${said}" overlaps the intro`).toBe(true);
    await toServerStep(a.page, true);
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

  // Change opens the step again with the address in hand; Back leads to the welcome and keeps the
  // server, so the app opened again is on Sign in for it (the next test follows that path through).
  await button(a.page, 'Change').click();
  await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
  await expect(field(a.page, 'Server')).toHaveValue(`http://${ADDR}`);
  await button(a.page, 'Back').click();
  await expect(a.page.getByRole('heading', { name: WELCOME, level: 1 })).toBeVisible();
  await a.page.reload();
  await expect(a.page.getByText(`Server: ${ADDR}`)).toBeVisible();

  // Signed in, nothing offers to change the server.
  const name = username('appuser');
  const server = e2eServer();
  await a.page.getByRole('button', { name: 'I have an invite' }).click();
  await field(a.page, 'Invite').fill(server.invite());
  await field(a.page, 'Username').fill(name);
  await field(a.page, 'Password').fill(PASSWORD);
  await button(a.page, 'Join').click();
  await expect(startButton(a.page)).toBeVisible();
  await expect(button(a.page, 'Change')).toHaveCount(0);
  await a.page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  await expect(a.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(button(a.page, 'Change')).toHaveCount(0);
});

test('Change on Sign in, then Back: the welcome, whose Connect returns to the held address still in the field; nothing is changed until "Use this server", so the app opened again is on Sign in for the held server', async ({ deviceA: a }) => {
  await toServerStep(a.page);
  await choose(a.page, ADDR);
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible({ timeout: 10000 });
  await expect(a.page.getByText(`Server: ${ADDR}`)).toBeVisible();

  await button(a.page, 'Change').click();
  await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
  await expect(field(a.page, 'Server')).toHaveValue(`http://${ADDR}`);
  await button(a.page, 'Back').click();
  await expect(a.page.getByRole('heading', { name: WELCOME, level: 1 })).toBeVisible();
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toHaveCount(0);
  await button(a.page, 'Connect to a server').click();
  await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
  await expect(field(a.page, 'Server'), 'the held address is not in the field').toHaveValue(`http://${ADDR}`);

  // Left by Back, and the app closed and opened again: Sign in, for the server it held.
  await button(a.page, 'Back').click();
  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(a.page.getByText(`Server: ${ADDR}`)).toBeVisible();
  await expect(a.page.getByRole('heading', { name: WELCOME })).toHaveCount(0);
});

test('a pasted invite link sets the server and opens the join form with the invite in hand', async ({ deviceA: a }) => {
  const server = e2eServer();
  const link = `http://${ADDR}/#/join/${server.invite()}`;
  await toServerStep(a.page);
  await choose(a.page, link);
  await expect(a.page.getByRole('heading', { name: 'Join with an invite', level: 1 })).toBeVisible({ timeout: 10000 });
  await expect(a.page.getByText(`This link is your invite to ${ADDR}. Choose a username and a password.`)).toBeVisible();
  await expect(field(a.page, 'Invite')).toHaveCount(0);
  const name = username('linked');
  await field(a.page, 'Username').fill(name);
  await field(a.page, 'Password').fill(PASSWORD);
  await button(a.page, 'Join').click();
  await expect(startButton(a.page)).toBeVisible();
});

test('plain http is said once on the server step, once on the app\'s sign in, and once in Settings\' Account, for a server on the network', async ({ fresh, deviceA: a }) => {
  // 127.0.0.2 is this machine too, but not a name the app counts as local: it stands for a LAN address.
  const host = `127.0.0.2:${18900 + Math.floor(Math.random() * 90)}`;
  await fresh(host);
  await toServerStep(a.page);
  await choose(a.page, `http://${host}`);
  // A fresh server: the app's own first screen sets it up.
  await expect(a.page.getByRole('heading', { name: 'Set up this server', level: 1 })).toBeVisible({ timeout: 10000 });
  await expect(a.page.getByText(`Server: ${host}`)).toBeVisible();
  await expect(a.page.getByText(plain)).toHaveCount(1);

  await button(a.page, 'Change').click();
  await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
  await expect(a.page.getByText(plain)).toHaveCount(1);
  // Back leads to the welcome; the server is still the one held, and the app opened again sets it up.
  await button(a.page, 'Back').click();
  await expect(a.page.getByRole('heading', { name: WELCOME, level: 1 })).toBeVisible();
  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Set up this server', level: 1 })).toBeVisible();

  await field(a.page, 'Username').fill('owner');
  await field(a.page, 'Password').fill(PASSWORD);
  await button(a.page, 'Set up').click();
  await expect(startButton(a.page)).toBeVisible();
  await a.page.getByRole('link', { name: 'Settings, signed in as owner' }).click();
  await expect(a.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(a.page.getByText(plain)).toHaveCount(1);
});

test('the phone app keeps a pasted link\'s invite across a restart, until it is used', async ({ deviceA: a }) => {
  const server = e2eServer();
  await toServerStep(a.page);
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
  await expect(startButton(a.page)).toBeVisible();
});

test('the welcome: the phone app\'s first screen is the header, one drawing, its title and one sentence, and "Connect to a server" in the lower part of a 412 by 915 phone with nothing scrolled; it cuts nothing at 206; its button leads to the server step and Back returns; once an address is kept it is not shown again', async ({ deviceA: a }) => {
  await a.page.setViewportSize({ width: 412, height: 915 });
  await a.page.goto(appUrl());
  await expect(a.page.getByRole('heading', { name: WELCOME, level: 1 })).toBeVisible();
  await expect(a.page.getByText(welcome.what, { exact: true })).toBeVisible();
  // The shell's header: the mark and the name.
  await expect(a.page.getByRole('link', { name: 'heirloom', exact: true })).toBeVisible();
  for (const gone of ['Work in laps.', 'Race the you of last week', 'It is free. Everything you do is kept on a server', 'A lap is one stretch of focus', 'Plan the day in laps']) await expect(a.page.getByText(gone)).toHaveCount(0);
  // One drawing, said by its own words, and no key.
  expect(await a.page.getByRole('img').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual([welcome.drawn]);
  await expect(a.page.getByRole('listitem')).toHaveCount(0);
  // The whole of it on one phone screen, the button in its lower part, in reach of the thumb.
  const scroll = () => a.page.evaluate(() => [document.scrollingElement!, ...document.querySelectorAll('main')].filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => `${el.tagName} ${el.scrollHeight} in ${el.clientHeight}`));
  expect(await scroll(), 'the welcome does not fit a 412 by 915 phone').toEqual([]);
  const go = button(a.page, 'Connect to a server');
  await expect(go).toBeInViewport();
  const at = (await go.boundingBox())!;
  expect(at.y, 'the button is not in the lower part of the screen').toBeGreaterThan(915 / 2);
  expect(at.y + at.height).toBeLessThanOrEqual(915);
  // The drawing over the words, the words over the button.
  const [img, title] = [(await a.page.getByRole('img').boundingBox())!, (await a.page.getByRole('heading', { name: WELCOME }).boundingBox())!];
  expect(img.y + img.height <= title.y && title.y + title.height <= at.y, 'not drawing, then title, then button').toBe(true);
  // At 206 (a phone at 200%): nothing wider than the box it stands in.
  await a.page.setViewportSize({ width: 206, height: 457 });
  await a.page.waitForTimeout(200);
  const cut = await a.page.evaluate(() =>
    [...document.querySelectorAll('main *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const p = el.parentElement!.getBoundingClientRect();
        return r.width > 0 && (r.right > p.right + 0.5 || r.left < p.left - 0.5 || (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1);
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`),
  );
  expect(cut, 'at 206 something stands wider than its box').toEqual([]);
  await a.page.setViewportSize({ width: 412, height: 915 });
  await button(a.page, 'Connect to a server').click();
  await expect(a.page.getByRole('heading', { name: 'Which server?', level: 1 })).toBeVisible();
  await button(a.page, 'Back').click();
  await expect(a.page.getByRole('heading', { name: WELCOME })).toBeVisible();
  await button(a.page, 'Connect to a server').click();
  await choose(a.page, ADDR);
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible({ timeout: 10000 });
  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(a.page.getByRole('heading', { name: WELCOME })).toHaveCount(0);
});
