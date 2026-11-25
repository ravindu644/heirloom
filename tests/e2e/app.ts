// Driving the app as a person does, by role and by the words in client/src/ui/strings.ts, and
// reading what the server holds through a Node device of the same account.
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { account, PASSWORD, serverRows, until } from '../sync/harness.ts';
import type { Device } from '../sync/harness.ts';
import { e2eServer } from './server.ts';

export const server = e2eServer();

/** A username of its own for each test, so tests share the server and nothing else. */
export const username = (tag: string) => `${tag}_${Math.random().toString(36).slice(2, 10)}`;

export async function signIn(page: Page, name: string, password = PASSWORD) {
  if (!page.url().startsWith('http')) await page.goto('/');
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function join(page: Page, invite: string, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'I have an invite' }).click();
  await page.getByLabel('Invite code').fill(invite);
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
}

/** What a ready Focus screen shows: the button for the lap a tap starts. */
export const ready = (page: Page, lap = 1) => expect(page.getByRole('button', { name: `Start lap ${lap}`, exact: true })).toBeVisible();

/**
 * A new account made from Node, with these lap lengths in its settings: the Node device is the
 * account's first, so the browsers that sign in after get the settings with everything else.
 */
export async function accountWith(name: string, lengths: { work_ms?: number; short_ms?: number; long_ms?: number } = {}): Promise<Device> {
  const node = await account(server, name);
  if (Object.keys(lengths).length) node.engine.write('settings', 'current', lengths);
  await until(() => node.engine.unsent.value === 0 && node.engine.sync.value === 'in-step', 5000, 'settings were not sent');
  return node;
}

/** Session rows the server holds for an account. */
export const sessions = async (name: string) => [...(await serverRows(server, name, 'session')).values()];

/** Polls the server until `ok` holds for its session rows, and returns them. */
export async function sessionsWhen(name: string, ok: (rows: Record<string, unknown>[]) => boolean, ms = 10000) {
  const start = Date.now();
  for (;;) {
    const rows = await sessions(name);
    if (ok(rows)) return rows;
    if (Date.now() - start > ms) throw new Error(`the server's session rows never matched: ${JSON.stringify(rows)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** The big digits: "24:59". */
export const digits = (page: Page) => page.getByText(/^\d\d:\d\d$/);

/**
 * The app's own status line: the shell's, beside the screen, not one of the screens' own status
 * regions (the result, the Undo bar, the marks), whatever order the shell writes them in. Hidden
 * counts: on a screen that does not keep its space the line is hidden while it has nothing to say.
 */
export const statusLine = (page: Page) => page.locator('main').locator('xpath=../p[@role="status"]');

/**
 * Waits until at least `n` cells whose key starts with `prefix` (`checkin/`, `task/t1/done`) are
 * committed to this account's IndexedDB, read from the page. A reload sooner than that is a tab
 * closed mid-write, which no store survives.
 */
export async function onDisk(page: Page, prefix: string, n = 1) {
  await expect
    .poll(
      () =>
        page.evaluate(async (prefix) => {
          const name = (await indexedDB.databases()).map((d) => d.name).find((x) => x?.startsWith('heirloom-'));
          if (!name) return 0;
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(name);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          const keys = await new Promise<string[]>((resolve) => {
            const get = db.transaction('cells').objectStore('cells').getAllKeys();
            get.onsuccess = () => resolve(get.result.map(String));
          });
          db.close();
          return keys.filter((k) => k.startsWith(prefix)).length;
        }, prefix),
      { message: `${prefix} never reached IndexedDB`, timeout: 2000, intervals: [5, 10, 20] },
    )
    .toBeGreaterThanOrEqual(n);
}

/**
 * Call before the tap that starts a lap. Resolves with the ms from that tap until the running
 * timer cell is committed to this account's IndexedDB database, read from the page itself.
 */
export function timerOnDisk(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('heirloom-'));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name!);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tapped = await new Promise<number>((resolve) =>
      document.addEventListener('click', () => resolve(performance.now()), { capture: true, once: true }),
    );
    for (;;) {
      // A read transaction sees only what is committed.
      const cell = await new Promise<any>((resolve) => {
        const get = db.transaction('cells').objectStore('cells').get('timer/current/state');
        get.onsuccess = () => resolve(get.result);
      });
      if (cell?.value?.phase === 'work') {
        db.close();
        return performance.now() - tapped;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

/** A screen, by its link in the navigation. */
export const go = (page: Page, screen: 'Focus' | 'Today' | 'Progress' | 'Habits' | 'Room') =>
  page.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name: screen, exact: true }).click();

/** Quick add: one line, then Enter, as a person types it. */
export async function quickAdd(page: Page, text: string) {
  const box = page.getByLabel('Add a task', { exact: true });
  await box.fill(text);
  await box.press('Enter');
}

/** A task's row on Today, found by its box. */
export const taskRow = (page: Page, title: string) => page.getByRole('checkbox', { name: `Done: ${title}`, exact: true }).locator('xpath=..');

/** A task row's squares, oldest first: 1 for a lap that rang, a share for one stopped or running, 0 for one to come. */
export const squaresOf = (row: ReturnType<typeof taskRow>) =>
  row.locator('i[style*="--share"]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).style.getPropertyValue('--share'))));

/** The titles of every task row on the screen, top to bottom. */
export const titles = (page: Page) =>
  page.getByRole('checkbox', { name: /^Done: / }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')!.slice('Done: '.length)));

/** A list on Today, by the start of its heading (Later today carries its count): Next, Later today, Upcoming, Done. */
export const list = (page: Page, heading: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`^${heading}`) }) });
