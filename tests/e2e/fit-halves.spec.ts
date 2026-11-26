// Section 23's second pass (DESIGN.md "The browser's sign-in (and join, and set up) from 720px",
// "A person's circle", "People."): the browser's sign-in in two halves, a circle that never
// flashes its letters before its picture, and the People tab's hours and links.
import type { Page } from '@playwright/test';
import { brand, welcome as about } from '../../client/src/ui/strings.ts';
import { PASSWORD } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { startServer } from '../server.ts';
import { accountWith, go, ready, settle, signIn, token, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';
import { ADDR, appUrl, e2eServer } from './server.ts';

const PHONE = { width: 412, height: 915 };
const LAPTOP = { width: 1440, height: 900 };
const MIN = 60000;
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const welcomeOf = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: about.title, exact: true }) });
const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;

// 1. S1: the browser's sign-in in two halves from 720px.

/** The halves as drawn at this width: the welcome at left on the ground, the form at right on a surface its full height. */
async function halves(page: Page, heading: string) {
  const { width, height } = page.viewportSize()!;
  const half = width / 2;
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  await settle(page);
  // Signed out there is no sidebar: nothing to go to, and the mark alone at the top left, not covered.
  await expect(page.getByRole('navigation')).toHaveCount(0);
  const mark = page.getByRole('link', { name: brand, exact: true });
  const m = await box(mark);
  expect(m.x, 'the mark is not at the left').toBeLessThan(48);
  expect(Math.round((await box(mark.locator('svg'))).x), 'the mark\'s ink does not start 24px in').toBe(24);
  expect(m.y, 'the mark is not at the top').toBeLessThan(48);
  expect(await mark.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)));
  }), 'the mark is covered').toBe(true);

  const welcome = welcomeOf(page);
  const form = page.locator('form');
  const sheet = form.locator('..');
  const [w, f, s] = [await box(welcome), await box(form), await box(sheet)];
  // The left half from the frame's edge to the middle; the right half from the middle to the edge, its full height.
  expect([Math.round(w.x), Math.round(w.x + w.width)], 'the welcome is not the left half').toEqual([0, Math.round(half)]);
  expect([Math.round(s.x), Math.round(s.x + s.width)], 'the form\'s half is not the right half').toEqual([Math.round(half), width]);
  expect(s.y, 'the form\'s half does not start at the top').toBeLessThanOrEqual(1);
  expect(s.y + s.height, 'the form\'s half does not reach the bottom').toBeGreaterThanOrEqual(height - 1);
  expect(await sheet.evaluate((el) => getComputedStyle(el).backgroundColor), 'the form\'s half is not on surface').toBe(await token(page, '--surface'));
  expect(await welcome.evaluate((el) => getComputedStyle(el).backgroundColor), 'the welcome is not on the ground').toMatch(/^rgba\(0, 0, 0, 0\)$/);
  // The form at its 44ch, centred in its half.
  const ch44 = await form.evaluate((el) => {
    const probe = Object.assign(document.createElement('div'), { style: 'width:44ch;position:absolute;visibility:hidden' });
    el.append(probe);
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return w;
  });
  // 44ch, or on a narrow half the half less a 32px gutter each side.
  const wide = Math.min(ch44, half - 2 * 32);
  expect(Math.abs(f.width - wide), `the form is ${f.width}px, not ${wide}px (44ch is ${ch44}px)`).toBeLessThanOrEqual(1);
  expect(Math.abs(f.x + f.width / 2 - (half + half / 2)), 'the form is not centred in its half').toBeLessThanOrEqual(1);
  // The welcome's block centred in its half.
  const block = await box(welcome.locator('> div'));
  expect(Math.abs(block.x + block.width / 2 - half / 2), 'the welcome is not centred in its half').toBeLessThanOrEqual(1);
  // Both start 112px down: the drawing's top and the form heading's on one line.
  const [drawing, h1] = [await box(welcome.getByRole('img')), await box(page.getByRole('heading', { name: heading, level: 1 }))];
  expect(Math.round(drawing.y), 'the drawing does not start 112px down').toBe(112);
  expect(Math.round(h1.y), 'the form\'s heading does not start 112px down').toBe(112);
  // The title in headline-lg.
  const title = welcome.getByRole('heading', { name: about.title, level: 2 });
  expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe(await page.evaluate(() => {
    const probe = Object.assign(document.createElement('h2'), { style: 'font:var(--type-headline-lg)' });
    document.body.append(probe);
    const size = getComputedStyle(probe).fontSize;
    probe.remove();
    return size;
  }));
  return drawing;
}

test('S1: the browser\'s sign-in at 1440 and 1024 is two halves (no sidebar, the mark alone, the welcome at left, the form on surface at right at 44ch, both 112px down, the drawing\'s squares 56px and 40px); at 412 the form comes first and the welcome under it', async ({ deviceA: a }) => {
  for (const [width, cell] of [[1440, 56], [1024, 40]] as const) {
    await a.page.setViewportSize({ width, height: 900 });
    await a.page.goto('/');
    const drawing = await halves(a.page, 'Sign in');
    // Seven weeks of days and their gaps: 7.75 squares wide.
    expect(Math.abs(drawing.width - cell * 7.75), `the drawing's squares at ${width} are not ${cell}px`).toBeLessThanOrEqual(1);
  }
  await a.page.setViewportSize(PHONE);
  await a.page.goto('/');
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await settle(a.page);
  const [w, f] = [await box(welcomeOf(a.page)), await box(a.page.locator('form'))];
  expect(w.y, 'at 412 the welcome is not under the form').toBeGreaterThanOrEqual(f.y + f.height);
  expect(await a.page.locator('form').locator('..').evaluate((el) => getComputedStyle(el).backgroundColor), 'at 412 the form stands on a surface').not.toBe(await token(a.page, '--surface'));
});

test('S1 at 720: every signed-out screen\'s left edge is the mark\'s, 24px: the left half\'s drawing, title and sentence start there', async ({ deviceA: a }) => {
  await a.page.setViewportSize({ width: 720, height: 900 });
  await a.page.goto('/');
  await halves(a.page, 'Sign in');
  const welcome = welcomeOf(a.page);
  for (const [what, l] of [['the drawing', welcome.getByRole('img')], ['the title', welcome.getByRole('heading', { name: about.title })], ['the sentence', welcome.getByText(about.what, { exact: true })]] as const) {
    expect(Math.round((await box(l)).x), `at 720 ${what} does not start on the mark's edge`).toBe(24);
  }
});

test('S1 holds for the join link and for setting up a fresh server; the reset page and the phone app\'s sign-in are not split', async ({ deviceA: a }) => {
  await a.page.setViewportSize(LAPTOP);
  await a.page.goto(`/#/join/${e2eServer().invite()}`);
  await halves(a.page, 'Join with an invite');

  const fresh = await startServer();
  try {
    await a.page.goto(fresh.url);
    await halves(a.page, 'Set up this server');
    // Its owner, a member, and a reset link for the member: the reset page stands alone.
    const api = (path: string, body: object) => fetch(fresh.url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const owner = await api('/api/register', { username: 'owner', password: PASSWORD, device: 'a1a1a1a1a1a1a1a1' });
    expect(owner.status).toBe(200);
    expect((await api('/api/register', { invite: fresh.invite(), username: 'sam', password: PASSWORD, device: 'b2b2b2b2b2b2b2b2' })).status).toBe(200);
    const reset = await api('/api/resets/create', { token: owner.body.token, device: 'a1a1a1a1a1a1a1a1', username: 'sam' });
    expect(reset.status, JSON.stringify(reset.body)).toBe(200);
    await a.page.goto(`${fresh.url}/#/reset/${reset.body.reset.reset}`);
    await expect(a.page.getByRole('heading', { name: 'A new password', level: 1 })).toBeVisible();
    await settle(a.page);
    await expect(welcomeOf(a.page), 'the reset page carries the welcome').toHaveCount(0);
    // One column on the mark's edge, its heading on the sign-in's line.
    const h1 = await box(a.page.getByRole('heading', { name: 'A new password', level: 1 }));
    expect(Math.round((await box(a.page.getByRole('link', { name: brand, exact: true }).locator('svg'))).x), 'the reset page\'s mark does not start 24px in').toBe(24);
    expect(Math.round(h1.x), 'the reset page\'s heading is not on the mark\'s edge').toBe(24);
    expect(Math.round(h1.y), 'the reset page\'s heading does not start 112px down').toBe(112);
    for (const l of [a.page.getByRole('textbox').first(), a.page.getByRole('button', { name: 'Set it and sign in' })]) expect(Math.round((await box(l)).x), 'the reset form is not on the mark\'s edge').toBe(24);
    expect(await a.page.locator('form').locator('..').evaluate((el) => getComputedStyle(el).backgroundColor), 'the reset page is split').not.toBe(await token(a.page, '--surface'));
  } finally {
    await fresh.stop();
  }

  // The phone app's sign-in, at a laptop's width: the form alone, as before.
  await a.page.goto(appUrl());
  const step = a.page.getByRole('heading', { name: 'Which server?', level: 1 });
  await expect(a.page.getByRole('heading', { name: about.title }).or(step)).toBeVisible();
  if (await a.page.getByRole('heading', { name: about.title }).isVisible()) await button(a.page, 'Connect to a server').click();
  await a.page.getByRole('textbox', { name: /^Server\b/ }).fill(`http://${ADDR}`);
  await button(a.page, 'Use this server').click();
  await expect(a.page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await settle(a.page);
  await expect(welcomeOf(a.page), 'the phone app\'s sign-in carries the welcome').toHaveCount(0);
  expect(await a.page.locator('form').locator('..').evaluate((el) => getComputedStyle(el).backgroundColor), 'the phone app\'s sign-in is split').not.toBe(await token(a.page, '--surface'));
});

// 2 and 3. The room: a circle, the hours, the links.

const panels = (page: Page) => page.getByRole('region', { name: 'Who is focusing now' }).locator('article');
const panelOf = (page: Page, who: string) => panels(page).filter({ has: page.locator('p b').getByText(who, { exact: true }) });
const ask = (node: Node, path: string, body: object) => node.engine.request(path, body);

async function person(d: Device, tag: string) {
  const name = username(tag);
  const node = await accountWith(name);
  await d.page.setViewportSize(PHONE);
  await signIn(d.page, name);
  await ready(d.page);
  return { name, node };
}
/** A makes the room; the others join with its code. Returns the room's id. */
async function room(first: { d: Device; node: Node }, ...rest: Device[]) {
  await go(first.d.page, 'Room');
  await first.d.page.getByLabel('Its name').fill('halves room');
  await button(first.d.page, 'Make the room').click();
  await button(first.d.page, 'Code and settings').click();
  const sheet = first.d.page.getByRole('dialog', { name: 'This room' });
  const code = (await sheet.getByRole('region', { name: 'The code to share' }).locator('p').first().innerText()).replace(/\s/g, '');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  for (const d of rest) {
    await go(d.page, 'Room');
    await d.page.getByLabel('The code a friend gave you').fill(code);
    await button(d.page, 'Join').click();
  }
  for (const d of [first.d, ...rest]) await expect(panels(d.page)).toHaveCount(rest.length + 1, { timeout: 5000 });
  const joined = await ask(first.node, '/api/rooms/join', { code });
  expect(joined.ok).toBe(true);
  return (joined as { data: { room: string } }).data.room;
}

test('People: the hours row stands about 8px above the first panel, never touching; "Call a lap together" is on the line under the last panel, right of "Make or join another room", its picker opens in place of the line, and it is gone while a call is open; nothing stands between the tabs and the hours', async ({ deviceA: a, deviceB: b }) => {
  const pa = await person(a, 'hl_a');
  await person(b, 'hl_b');
  const id = await room({ d: a, node: pa.node }, b);
  await go(a.page, 'Room');
  const another = button(a.page, 'Make or join another room');
  const call = button(a.page, 'Call a lap together');

  for (const size of [PHONE, LAPTOP]) {
    await a.page.setViewportSize(size);
    await settle(a.page);
    const at = size.width;
    // The hours: everything drawn in the row ends 7 to 9px above the first panel.
    const gap = await a.page.getByRole('region', { name: 'Who is focusing now' }).evaluate((people) => {
      const row = people.firstElementChild!;
      const bottom = Math.max(...[row, ...row.querySelectorAll('*')].map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.bottom));
      return people.querySelector('article')!.getBoundingClientRect().top - bottom;
    });
    expect(gap, `at ${at} the hours row stands ${gap}px above the first panel`).toBeGreaterThanOrEqual(7);
    expect(gap, `at ${at} the hours row stands ${gap}px above the first panel`).toBeLessThanOrEqual(9);
    // The tabs stand 16px (space-md) above the hours, with no lap started together.
    const above = await a.page.evaluate(() => {
      const row = document.querySelector('section[aria-label="Who is focusing now"]')!.firstElementChild!;
      const top = Math.min(...[row, ...row.querySelectorAll('*')].map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.top));
      return top - document.querySelector('[role="tablist"]')!.getBoundingClientRect().bottom;
    });
    expect(Math.abs(above - 16), `at ${at} the tabs stand ${above}px above the hours, not 16`).toBeLessThanOrEqual(1);
    // Nothing between the tabs and the hours.
    const between = await a.page.getByRole('tabpanel').evaluate((tab) => {
      const people = tab.querySelector('section')!;
      return [...tab.children].slice(0, [...tab.children].findIndex((el) => el.contains(people))).map((el) => (el as HTMLElement).innerText.trim()).join('');
    });
    expect(between, `at ${at} something stands between the tabs and the hours`).toBe('');
    // The line under the last panel: another room at its left, calling a lap at its right end.
    const [last, o, c] = [await box(panels(a.page).last()), await box(another), await box(call)];
    expect(o.y, `at ${at} "Make or join another room" is not under the last panel`).toBeGreaterThanOrEqual(last.y + last.height);
    expect(Math.abs(o.y + o.height / 2 - (c.y + c.height / 2)), `at ${at} the two links are not on one line`).toBeLessThanOrEqual(1);
    expect(c.x, `at ${at} "Call a lap together" is not right of "Make or join another room"`).toBeGreaterThanOrEqual(o.x + o.width);
    expect(Math.abs(c.x + c.width - (last.x + last.width)), `at ${at} "Call a lap together" does not end at the panels' right edge`).toBeLessThanOrEqual(1);
  }

  // Its picker opens in place of the line, on a phone scrolled to the end, and is brought into
  // view above the bottom bar; Not now brings the line back.
  await a.page.setViewportSize(PHONE);
  await settle(a.page);
  await a.page.evaluate(() => {
    for (const el of [document.scrollingElement!, ...document.querySelectorAll('main, main *')]) if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
  });
  await call.click();
  await settle(a.page);
  const bar = await box(a.page.getByRole('navigation', { name: 'Screens' }));
  for (const name of ['Call the lap', 'Not now']) {
    const b = await box(button(a.page, name));
    expect(b.y + b.height, `at 412 "${name}" ends at ${b.y + b.height}, under the bottom bar's top at ${bar.y}`).toBeLessThanOrEqual(bar.y + 0.5);
  }
  await expect(a.page.getByRole('button', { name: 'Not now', exact: true })).toBeVisible();
  await expect(another, 'the picker opened beside the line, not in its place').toHaveCount(0);
  await button(a.page, 'Not now').click();
  await expect(call).toBeVisible();

  // A call open: no way to call another, and the other room's link stays.
  const minute = Math.ceil((pa.node.engine.now() + 2 * MIN) / MIN) * MIN;
  const called = await ask(pa.node, '/api/rooms/call', { room: id, at: minute });
  expect(called.ok, JSON.stringify(called)).toBe(true);
  await expect(a.page.getByText(/^\d\d:\d\d You call a lap$/)).toBeVisible({ timeout: 5000 });
  await expect(call, '"Call a lap together" while a call is open').toHaveCount(0);
  await expect(another).toBeVisible();
});

/** Every circle drawn on the page, from the first frame: whose, whether its letters can be seen, whether its picture is on. */
const watchFaces = () => {
  const seen: { who: string; letters: boolean; picture: boolean }[] = [];
  (window as unknown as { faces: typeof seen }).faces = seen;
  const last = new Map<string, string>();
  const look = () => {
    for (const i of document.querySelectorAll<HTMLElement>('i[class*="_face_"]')) {
      const who = i.closest('a[href="#/settings"]') ? 'header' : (i.closest('article')?.querySelector('p b')?.textContent ?? '');
      if (!who) continue;
      const style = getComputedStyle(i);
      const one = { who, letters: !!i.textContent && style.color !== 'rgba(0, 0, 0, 0)', picture: style.backgroundImage.startsWith('url(') };
      const key = JSON.stringify(one);
      if (last.get(who) !== key) seen.push(one);
      last.set(who, key);
    }
  };
  // A mutation is seen before the frame that paints it; each frame besides, for a style that changes alone.
  new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const frame = () => (look(), requestAnimationFrame(frame));
  requestAnimationFrame(frame);
};
const facesOf = (page: Page) => page.evaluate(() => (window as unknown as { faces: { who: string; letters: boolean; picture: boolean }[] }).faces);

test('a circle with a picture: after a reload, with pictures refused by the network, a member\'s circle and one\'s own header chip are drawn from the device and never show their letters; a third member whose picture cannot be had sees the letters', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  const pa = await person(a, 'pf_a');
  await person(b, 'pf_b');
  await person(c, 'pf_c');
  await room({ d: a, node: pa.node }, b);
  // A sets a picture from a small PNG in Settings.
  const png = Buffer.from(
    (await a.page.evaluate(() => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#c0392b';
      g.fillRect(0, 0, 64, 64);
      return canvas.toDataURL('image/png');
    })).split(',')[1]!,
    'base64',
  );
  await a.page.getByRole('link', { name: `Settings, signed in as ${pa.name}` }).click();
  await a.page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await go(a.page, 'Room');
  const drawn = (page: Page, who: string) => panelOf(page, who).locator('i[style*="background-image"]').first();
  await expect(drawn(a.page, 'You'), 'A\'s own panel never drew the picture').toBeVisible({ timeout: 5000 });
  await go(b.page, 'Room');
  await expect(drawn(b.page, pa.name), 'B never drew A\'s picture').toBeVisible({ timeout: 5000 });

  // Seen once: after a reload, with the network refusing every picture, it is there from the first frame.
  for (const [d, who] of [[a, 'You'], [b, pa.name]] as const) {
    await d.page.route('**/api/pictures/**', (r) => r.abort());
    await d.page.addInitScript(watchFaces);
    await d.page.reload();
    await expect(drawn(d.page, who)).toBeVisible({ timeout: 5000 });
    await d.page.waitForTimeout(1500);
    const faces = await facesOf(d.page);
    const theirs = faces.filter((f) => f.who === who);
    expect(theirs.length, `${who}'s circle was never seen`).toBeGreaterThan(0);
    expect(theirs.filter((f) => f.letters), `${who}'s letters showed after a reload: ${JSON.stringify(theirs)}`).toEqual([]);
    expect(theirs[0]!.picture, `${who}'s circle was first drawn without its picture: ${JSON.stringify(theirs)}`).toBe(true);
    // A's own chip in the header, the same.
    if (d === a) {
      const chip = faces.filter((f) => f.who === 'header');
      expect(chip.length, 'the header chip was never seen').toBeGreaterThan(0);
      expect(chip.filter((f) => f.letters), `the header chip showed its letters after a reload: ${JSON.stringify(chip)}`).toEqual([]);
    }
    // The watch works: B's circle, who has no picture, shows letters.
    if (d === b) expect(faces.filter((f) => f.who === 'You').some((f) => f.letters), 'B\'s own circle never showed letters: the watch saw nothing').toBe(true);
  }

  // C joins with the network refusing pictures: A's picture cannot be had, so A's letters stand in.
  await c.page.route('**/api/pictures/**', (r) => r.abort());
  const code = await (async () => {
    await button(a.page, 'Code and settings').click();
    const sheet = a.page.getByRole('dialog', { name: 'This room' });
    const read = (await sheet.getByRole('region', { name: 'The code to share' }).locator('p').first().innerText()).replace(/\s/g, '');
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    return read;
  })();
  await go(c.page, 'Room');
  await c.page.getByLabel('The code a friend gave you').fill(code);
  await button(c.page, 'Join').click();
  const circle = panelOf(c.page, pa.name).locator('i[class*="_face_"]').first();
  await expect(circle).toBeVisible({ timeout: 5000 });
  await expect.poll(() => circle.evaluate((el) => getComputedStyle(el).color), { timeout: 5000, message: 'A\'s picture failed to come and C sees a circle with no letters' }).not.toBe('rgba(0, 0, 0, 0)');
});
