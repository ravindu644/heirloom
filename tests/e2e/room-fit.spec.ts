// Rooms, the fit (roadmap section 23; DESIGN.md "People.", "A person's report", "A person's
// circle"): each person a panel with a lane that has room, Cheer as a round button after a lap
// rang, a person's report that agrees with their own screens, and a circle with their colour and
// letters when they have no picture.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Device as Node } from '../sync/harness.ts';
import { accountWith, go, ready, settle, signIn, startButton, token, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

const PHONE = { width: 412, height: 915 };
const SIDEWAYS = { width: 915, height: 412 };
const NARROW_LAPTOP = { width: 980, height: 800 };
const JUST_UNDER = { width: 970, height: 800 };
const LAPTOP = { width: 1440, height: 900 };
const MIN = 60000;
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const panels = (page: Page) => page.getByRole('region', { name: 'Who is focusing now' }).locator('article');
const panelOf = (page: Page, who: string) => panels(page).filter({ has: page.locator('p b').getByText(who, { exact: true }) });
const lap = (node: Node, id: string, started: number, ms = 25 * MIN) =>
  node.engine.write('session', id, { kind: 'work', task: null, started, ended: started + ms, planned_ms: ms, paused_ms: 0, outcome: 'rang', device: node.engine.device });

async function person(d: Device, name: string, seed: (node: Node) => void = () => {}, lengths: Parameters<typeof accountWith>[1] = {}) {
  const node = await accountWith(name, lengths);
  seed(node);
  await d.page.setViewportSize(PHONE);
  await signIn(d.page, name);
  await ready(d.page);
  return node;
}
/** A makes the room; the others join with its code. */
async function room(first: Device, ...rest: Device[]) {
  await go(first.page, 'Room');
  await first.page.getByLabel('Its name').fill('fit room');
  await button(first.page, 'Make the room').click();
  await button(first.page, 'Code and settings').click();
  const sheet = first.page.getByRole('dialog', { name: 'This room' });
  const code = (await sheet.getByRole('region', { name: 'The code to share' }).locator('p').first().innerText()).replace(/\s/g, '');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  for (const d of rest) {
    await go(d.page, 'Room');
    await d.page.getByLabel('The code a friend gave you').fill(code);
    await button(d.page, 'Join').click();
  }
  for (const d of [first, ...rest]) await expect(panels(d.page)).toHaveCount(rest.length + 1, { timeout: 5000 });
  return code;
}

// 1. Each person a panel, the lane with room.

/** A panel's words (the name's line) and its lane, as boxes. */
const parts = (page: Page, who: string) =>
  panelOf(page, who).evaluate((panel) => {
    const box = (el: Element | null) => {
      const r = el!.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width };
    };
    const time = panel.querySelector('[class*="_left_"]');
    const words = panel.querySelector('[class*="_words_"]');
    return { panel: box(panel), name: box(panel.querySelector('p b')), lane: box(panel.querySelector('[class*="_lane_"]')), time: time && box(time), words: words && box(words) };
  });

/** How many hours the row of hours shows, from two of its names and where they stand. */
const windowHours = (page: Page) =>
  page.getByRole('tabpanel').locator('[class*="_hours_"]').first().evaluate((row) => {
    const names = [...row.querySelectorAll<HTMLElement>('span')]
      .map((el) => ({ at: parseFloat(el.style.left), h: /^(\d\d):(\d\d)$/.exec(el.textContent ?? '') }))
      .filter((x) => x.h && !Number.isNaN(x.at))
      .map((x) => ({ at: x.at, min: Number(x.h![1]) * 60 + Number(x.h![2]) }));
    names.sort((x, y) => x.at - y.at);
    const [a, b] = [names[0], names.at(-1)];
    if (!a || !b || a === b) return null;
    // Across midnight the later name is the smaller clock: count forward round the day.
    return (((b.min - a.min) % 1440) + 1440) % 1440 / 60 / ((b.at - a.at) / 100);
  });

test('People: under 980px (an upright phone, sideways at 915, and 970) each person is a panel with the lane under the words across it; from 980px the words are a column beside the lane, 340px or more, with the time on the name\'s row at the column\'s end', async ({ deviceA: a, deviceB: b }) => {
  const [nameA, nameB] = [username('fa'), username('fb')];
  await person(a, nameA);
  await person(b, nameB);
  await room(a, b);
  // A on a lap, so A's panel carries the time left.
  await go(a.page, 'Focus');
  await startButton(a.page).click();
  await go(a.page, 'Room');

  await a.page.setViewportSize(PHONE);
  // On a lap, A moves to the top of the live order: measured once the panels have glided there.
  await expect.poll(() => panels(a.page).first().textContent()).toContain('You');
  await settle(a.page);
  for (const who of ['You', nameB]) {
    const p = await parts(a.page, who);
    expect(p.lane.width, `${who}'s lane at 412`).toBeGreaterThanOrEqual(300);
    expect(p.lane.y, `${who}'s lane is not under the words at 412`).toBeGreaterThanOrEqual(p.name.bottom - 1);
    expect(p.lane.x - p.panel.x, `${who}'s lane does not start at the panel's inner edge`).toBeLessThanOrEqual(17);
  }
  const hours = await windowHours(a.page);
  expect(hours, 'the hours row has no two names to read').not.toBeNull();
  expect(hours!, 'the phone\'s window is not about six hours').toBeGreaterThan(5.5);
  expect(hours!).toBeLessThan(6.5);
  // Two panels, apart.
  const [first, second] = [await parts(a.page, 'You'), await parts(a.page, nameB)];
  expect(Math.min(Math.abs(second.panel.y - first.panel.bottom), Math.abs(first.panel.y - second.panel.bottom)), 'the panels touch').toBeGreaterThanOrEqual(7);
  const phoneLane = first.lane.width;

  // Sideways at 915, and at 970 just under the switch: still stacked, the lane under the words and
  // across the panel, much wider than upright.
  for (const size of [SIDEWAYS, JUST_UNDER]) {
    await a.page.setViewportSize(size);
    await settle(a.page);
    for (const who of ['You', nameB]) {
      const p = await parts(a.page, who);
      expect(p.lane.y, `${who}'s lane is not under the words at ${size.width}`).toBeGreaterThanOrEqual(p.name.bottom - 1);
      expect(p.lane.width, `${who}'s lane does not span the panel at ${size.width}`).toBeGreaterThanOrEqual(p.panel.width - 2 * 16 - 2);
      expect(p.lane.width, `${who}'s lane at ${size.width} is not much wider than at 412`).toBeGreaterThan(phoneLane * 1.5);
    }
  }

  // From 980: the words a column at the left, the lane beside it, the time at the end of the name's row.
  for (const size of [NARROW_LAPTOP, LAPTOP]) {
    await a.page.setViewportSize(size);
    await settle(a.page);
    for (const who of ['You', nameB]) {
      const p = await parts(a.page, who);
      expect(p.lane.x, `${who}'s lane is not beside the words at ${size.width}`).toBeGreaterThanOrEqual(p.name.right - 1);
      expect(p.lane.width, `${who}'s lane at ${size.width}`).toBeGreaterThanOrEqual(340);
    }
    const you = await parts(a.page, 'You');
    expect(you.time, `no time on A's panel at ${size.width}`).not.toBeNull();
    expect(you.words, `no words column at ${size.width}`).not.toBeNull();
    expect(you.time!.y, `the time is under the name at ${size.width}`).toBeLessThan(you.name.bottom);
    expect(you.time!.bottom, `the time is not on the name's row at ${size.width}`).toBeGreaterThan(you.name.y);
    expect(Math.abs(you.time!.right - you.words!.right), `the time is not at the words column's right end at ${size.width}`).toBeLessThanOrEqual(2);
    expect(you.lane.x, `the lane is not after the words column at ${size.width}`).toBeGreaterThanOrEqual(you.words!.right - 1);
  }
});

// 2. Cheer.

test('Cheer is a round button named "Cheer <name>\'s lap", there only once their lap rang, and after a tap the line says who cheered', async ({ deviceA: a, deviceB: b }) => {
  const [nameA, nameB] = [username('ca'), username('cb')];
  await person(a, nameA);
  await person(b, nameB, undefined, { work_ms: 3000, short_ms: 60000 });
  await room(a, b);
  await go(a.page, 'Room');
  const cheer = panelOf(a.page, nameB).getByRole('button', { name: `Cheer ${nameB}'s lap`, exact: true });
  await expect(cheer, 'Cheer before any lap rang').toHaveCount(0);

  await go(b.page, 'Focus');
  await startButton(b.page).click();
  await expect(cheer, 'no Cheer once B\'s lap rang').toBeVisible({ timeout: 10000 });
  const box = (await cheer.boundingBox())!;
  expect(Math.round(box.width), 'Cheer is not 40px').toBe(40);
  expect(Math.round(box.height)).toBe(40);
  expect(await cheer.evaluate((el) => getComputedStyle(el).borderRadius), 'Cheer is not round').toMatch(/^(50%|[2-9]\d+px|\d{3,}px)$/);
  await cheer.click();
  await expect(panelOf(a.page, nameB)).toContainText('You cheered this lap.', { timeout: 3000 });
  // Cheered: no longer a button to press again.
  await expect(async () => {
    if ((await cheer.count()) > 0) await expect(cheer).toBeDisabled();
  }).toPass({ timeout: 3000 });
  await expect(panelOf(a.page, 'You').getByRole('button', { name: /^Cheer / }), 'a Cheer on one\'s own panel').toHaveCount(0);
});

// 3. A person's report.

test('a tap on a panel opens that person\'s report with Back: Today\'s minutes and laps and the week say what their own Today and Progress say; Back returns to People; a person with no laps reads "No laps yet today."', async ({ deviceA: a, deviceB: b }) => {
  const now = Date.now();
  const [nameA, nameB] = [username('ra'), username('rb')];
  await person(a, nameA);
  // B: two laps earlier today, inside today wherever this runs (past 2 h after midnight).
  const since = now - new Date(new Date(now).toDateString()).getTime();
  test.skip(since < 150 * MIN, 'too near midnight for two laps earlier today');
  await person(b, nameB, (n) => (lap(n, 'b1', now - 130 * MIN), lap(n, 'b2', now - 90 * MIN)));
  await room(a, b);

  // What B's own screens say.
  await go(b.page, 'Today');
  const focused = (await b.page.locator('main dl > div').filter({ hasText: 'Focused' }).innerText()).replace(/\s+/g, ' ');
  const minutes = focused.match(/(?:\d+h )?\d+m/)![0];
  const laps = focused.match(/\d+ laps?/)![0];
  await go(b.page, 'Progress');
  await expect(b.page.getByText(/^Progress, week of /)).toBeVisible();
  const week = ((await b.page.getByRole('img', { name: /^This week .* so far\./ }).filter({ visible: true }).first().getAttribute('aria-label')) ?? '').match(/^This week ((?:\d+h )?\d+m) so far/)![1]!;

  // A taps B's panel: the report, with Back first.
  await go(a.page, 'Room');
  // The panel is one button over it all, named for what it opens.
  await a.page.getByRole('button', { name: `${nameB}: the day and the week`, exact: true }).click();
  await expect(a.page).toHaveURL(/#\/room\/[^/]+$/);
  const back = button(a.page, 'Back');
  await expect(back).toBeVisible();
  await expect(a.page.getByRole('tablist'), 'the report did not take the room\'s place').toHaveCount(0);
  const report = a.page.locator('main');
  await expect(report).toContainText(nameB);
  await expect(report, 'the report\'s minutes today').toContainText(minutes);
  await expect(report, 'the report\'s laps today').toContainText(laps);
  await expect(report, 'the report\'s week').toContainText(week);
  await back.click();
  await expect(a.page.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');
  await expect(panels(a.page)).toHaveCount(2);

  // B taps A, who has run no lap.
  await go(b.page, 'Room');
  await b.page.getByRole('button', { name: `${nameA}: the day and the week`, exact: true }).click();
  await expect(b.page.locator('main')).toContainText('No laps yet today.');
  await button(b.page, 'Back').click();
  await expect(panels(b.page)).toHaveCount(2);
});

// 4. A person's circle with no picture.

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, '../../contracts/fixtures/avatar.json'), 'utf8')) as { hues: string[]; cases: { username: string; hue: string; letters: string }[] };
/** contracts/fixtures/avatar.json's rule: FNV-1a 32-bit over the lowercased username's UTF-8 bytes, modulo 8. */
const hueOf = (name: string) => {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(name.toLowerCase())) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return fixture.hues[h % fixture.hues.length]!;
};
const lettersOf = (name: string) => {
  const parts = name.split(/[_.-]/).filter(Boolean);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name[0]!).toUpperCase();
};

test('a circle with no picture: the letters and the colour the avatar fixture gives each username, a colour and not a grey, and two usernames of different hues differ', async ({ deviceA: a, deviceB: b }) => {
  // The test's own reading of the rule first, against the contract's cases.
  for (const one of fixture.cases) expect([hueOf(one.username), lettersOf(one.username)], one.username).toEqual([one.hue, one.letters]);
  // Two names whose hues differ.
  const nameA = username('av');
  let nameB = username('av');
  while (hueOf(nameB) === hueOf(nameA)) nameB = username('av');
  await person(a, nameA);
  await person(b, nameB);
  await room(a, b);
  await go(a.page, 'Room');
  const circle = (who: string) => panelOf(a.page, who).locator('i[aria-hidden="true"]').first();
  for (const who of [nameA, nameB]) {
    const shown = who === nameA ? 'You' : who;
    await expect(circle(shown), `${who}'s letters`).toHaveText(lettersOf(who));
    const bg = await circle(shown).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg, `${who}'s circle is not ${hueOf(who)}`).toBe(await token(a.page, `--${hueOf(who)}`));
    const [r, g, bl] = bg.match(/\d+/g)!.map(Number);
    expect(r === g && g === bl, `${who}'s circle is grey: ${bg}`).toBe(false);
  }
  const [bgA, bgB] = [await circle('You').evaluate((el) => getComputedStyle(el).backgroundColor), await circle(nameB).evaluate((el) => getComputedStyle(el).backgroundColor)];
  expect(bgA, 'two usernames of different hues have one colour').not.toBe(bgB);
});
