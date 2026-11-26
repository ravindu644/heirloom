// About, the last block of Settings (roadmap section 19): the mark and "heirloom", one line, the
// version and the commit the build was made from, and the way to the source. The same for every
// role, and in the phone app's build. The commit is read here from git: the build that is tested
// (`make server` for the browser, this run's globalSetup for the phone app) was made from HEAD, so
// a commit made between the build and the run would fail this, as it should: the build is stale.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { PASSWORD, startServer } from '../sync/harness.ts';
import type { Server } from '../sync/harness.ts';
import { accountWith, signIn, startButton, username } from './app.ts';
import { test as base, expect } from './devices.ts';
import { ADDR, appUrl } from './server.ts';

const ROOT = join(import.meta.dirname, '../..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string;
const COMMIT = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const SOURCE = 'https://github.com/ravindu644/heirloom';

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

const deviceId = () => randomBytes(8).toString('hex');
async function api(server: Server, path: string, body: object) {
  const res = await fetch(server.url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

/** Settings' About, as a person reads it: the version line and the link, checked against the build's own facts. */
async function aboutIsRight(page: Page, name: string, who: string) {
  await page.getByRole('link', { name: `Settings, signed in as ${name}` }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  const version = page.getByText(/^Version /);
  await version.scrollIntoViewIfNeeded();
  await expect(version, `${who}: the version line`).toHaveText(`Version ${VERSION} (${COMMIT})`);
  const source = page.getByRole('link', { name: 'Source on GitHub', exact: true });
  await expect(source, `${who}: the link to the source`).toBeVisible();
  await expect(source).toHaveAttribute('href', SOURCE);
  // A new browsing context, and the page it opens gets no hold on this one.
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('rel', /\bnoopener\b/);
  // The last block of Settings: no block's heading comes after it.
  const after = await source.evaluate((link) =>
    [...document.querySelectorAll('main h2')].filter((h) => h.checkVisibility() && link.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING).map((h) => h.textContent),
  );
  expect(after, `${who}: About is not the last block of Settings`).toEqual([]);
}

test('About at the end of Settings says the version from package.json and the commit the build was made from, and links to the source in a new browsing context, for the owner, an admin and a member', async ({ fresh, deviceA: a, deviceB: b, deviceC: c }) => {
  const server = await fresh();
  const OWNER = 'the owner password';
  expect((await api(server, '/api/register', { username: 'owner', password: OWNER, device: deviceId() })).status).toBe(200);
  for (const name of ['ada', 'moss']) expect((await api(server, '/api/register', { invite: server.invite(), username: name, password: PASSWORD, device: deviceId() })).status).toBe(200);
  const device = deviceId();
  const { body } = await api(server, '/api/login', { username: 'owner', password: OWNER, device });
  expect((await api(server, '/api/admins/set', { token: body.token, device, username: 'ada', role: 'admin' })).status).toBe(200);

  for (const [d, name, password, who] of [
    [a, 'owner', OWNER, 'the owner'],
    [b, 'ada', PASSWORD, 'an admin'],
    [c, 'moss', PASSWORD, 'a member'],
  ] as const) {
    await d.page.goto(server.url);
    await signIn(d.page, name, password);
    await expect(startButton(d.page)).toBeVisible();
    await aboutIsRight(d.page, name, who);
  }
});

test('About in the phone app\'s build: the same version, commit and link', async ({ deviceA: a }) => {
  const name = username('aboutapp');
  await accountWith(name);
  await a.page.goto(appUrl());
  // Through the welcome to the server step, then sign in.
  await a.page.getByRole('button', { name: 'Connect to a server', exact: true }).click();
  await a.page.getByRole('textbox', { name: /^Server\b/ }).fill(ADDR);
  await a.page.getByRole('button', { name: 'Use this server', exact: true }).click();
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible({ timeout: 10000 });
  await signIn(a.page, name);
  await expect(startButton(a.page)).toBeVisible();
  await aboutIsRight(a.page, name, 'the phone app');
});
