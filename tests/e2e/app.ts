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
  await page.getByLabel('Invite', { exact: true }).fill(invite);
  await page.getByLabel('Username').fill(name);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
}

/** Focus's one start, before a lap: it names no number (the lap line over the digits does). */
export const startButton = (page: Page) => page.getByRole('button', { name: 'Start the lap', exact: true });
/** After a bell or in a break: the lap that comes next, started at once. */
export const startNow = (page: Page) => page.getByRole('button', { name: 'Start the next lap now', exact: true });

/** What a ready Focus screen shows: its start, under the line that names the lap a tap starts. */
export async function ready(page: Page, lap = 1) {
  await expect(startButton(page)).toBeVisible();
  await expect(page.getByText(`Lap ${lap} of 4 in this set, next`).filter({ visible: true }).first()).toBeVisible();
}

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

/** A new account seeded from Node, then signed in on this browser and ready. */
export async function signedInto(d: { page: Page }, tag: string, seed: (node: Device) => void = () => {}, lengths: Parameters<typeof accountWith>[1] = {}) {
  const name = username(tag);
  const node = await accountWith(name, lengths);
  seed(node);
  await until(() => node.engine.unsent.value === 0 && node.engine.sync.value === 'in-step', 10000, 'not sent');
  await signIn(d.page, name);
  await ready(d.page);
  return { name, node };
}

/** The colour the server holds for an account's project, by its name. */
export const colourOf = async (name: string, project: string) => [...(await serverRows(server, name, 'project')).values()].find((r) => r.name === project)?.color as string | undefined;

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

/** A task's row on Today, found by its box: the row the box stands in, with its words, squares, count and control. */
export const taskRow = (page: Page, title: string) =>
  // Not the inert copy a row leaves behind for a moment as it goes. The box and the words are one
  // piece inside the row, so the row is the nearest box whose class is the kit's row.
  page
    .locator(`[role="checkbox"][aria-label=${JSON.stringify(`Done: ${title}`)}]:not([inert] *)`)
    .locator('xpath=ancestor::div[starts-with(@class, "_row_") or contains(@class, " _row_")][1]');

/** A task row's squares, oldest first: 1 for a lap that rang, a share for one stopped or running, 0 for one to come. */
export const squaresOf = (row: ReturnType<typeof taskRow>) =>
  row.locator('i[style*="--share"]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).style.getPropertyValue('--share'))));

/** The titles of every task row on the screen, top to bottom. */
export const titles = (page: Page) =>
  page
    .getByRole('checkbox', { name: /^Done: / })
    // A row on its way out stays a moment as an inert copy: it is not a row of the list.
    .evaluateAll((els) => els.filter((el) => !el.closest('[inert]')).map((el) => el.getAttribute('aria-label')!.slice('Done: '.length)));

/** A list on Today, by the start of its heading (Later today carries its count): Next, Later today, Upcoming, Done. */
export const list = (page: Page, heading: string) => page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`^${heading}`) }) });

/** Waits until nothing moves: every animation and transition finished, then two frames drawn. */
export const settle = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 30));
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

/** Scrolls whatever holds `locator` so it stands in the middle of the screen: part way down, where pages jumped. */
export const midScreen = (locator: ReturnType<Page['locator']>) => locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));

/**
 * DESIGN.md, Motion: "What you tapped stays under your finger." Reads where `control` is on the
 * screen, does `act` (the tap), waits for the redraw and for motion to end, and fails if the
 * control, or `after` when the tap puts something else in its place, moved more than 1px.
 */
export async function staysPut(page: Page, control: ReturnType<Page['locator']>, act: () => Promise<void>, after?: ReturnType<Page['locator']>) {
  const before = await control.boundingBox();
  expect(before, 'the control is not on the screen to be tapped').not.toBeNull();
  await act();
  await settle(page);
  const target = after ?? control;
  await expect(target).toBeVisible();
  const now = (await target.boundingBox())!;
  const moved = { x: Math.round((now.x - before!.x) * 10) / 10, y: Math.round((now.y - before!.y) * 10) / 10 };
  // What takes a control's place may be another width, laid from either side: one edge keeps the place.
  const right = Math.round((now.x + now.width - before!.x - before!.width) * 10) / 10;
  const across = Math.abs(moved.x) <= 1 || (after !== undefined && Math.abs(right) <= 1);
  expect(across && Math.abs(moved.y) <= 1, `${after ? 'what took its place' : 'the control'} moved ${moved.x}px across (its right edge ${right}px) and ${moved.y}px down`).toBe(true);
}

/** A colour token as rgb, as the page draws it now (light or dark). */
export const token = (page: Page, name: string) =>
  page.evaluate((name) => {
    const probe = document.body.appendChild(document.createElement('i'));
    probe.style.backgroundColor = `var(${name})`;
    const c = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return c;
  }, name);

/** Whether text in an element can be selected, as the browser decides it: `auto` takes the parent's, and a field is a field. */
export const selectable = (locator: ReturnType<Page['locator']>) =>
  locator.first().evaluate((el) => {
    if (el.matches('input, textarea')) return getComputedStyle(el).userSelect !== 'none';
    for (let n: Element | null = el; n; n = n.parentElement) {
      const v = getComputedStyle(n).userSelect;
      if (v === 'none') return false;
      if (v !== 'auto') return true;
    }
    return true;
  });
