// Progress (protocol section 13) in real browsers against the real engine and server. A year
// cannot be lived in a test, so a Node device of the account writes the history first: session
// rows with past times, tasks, projects, a day's note. Every expected sentence is worked out here
// from what was seeded, never read off the screen's own figures.
import type { Page } from '@playwright/test';
import { streakWindow } from '../../client/src/core/streak.ts';
import { localDay } from '../../client/src/core/stats.ts';
import { serverRows, until } from '../sync/harness.ts';
import type { Device as Node } from '../sync/harness.ts';
import { accountWith, go, ready, server, signIn, startButton, username } from './app.ts';
import { expect, test } from './devices.ts';
import type { Device } from './devices.ts';

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LAP = 25 * MIN;
// This machine's zone, which the browsers share: east of UTC in minutes.
const OFF = -new Date().getTimezoneOffset();
const dayOf = (ms: number) => localDay(ms, OFF);
const midnight = (day: string) => Date.parse(`${day}T00:00:00Z`) - OFF * MIN;
const today = () => dayOf(Date.now());
const back = (days: number) => dayOf(midnight(today()) + 12 * HOUR - days * DAY);
const noon = (day: string) => midnight(day) + 12 * HOUR;

// Laps of today have to fit between midnight and now; near midnight they cannot.
const roomToday = () => {
  const since = Date.now() - midnight(today());
  return since > 2.5 * HOUR && since < 22 * HOUR;
};

let ids = 0;
type Lap = { started: number; ms?: number; outcome?: 'rang' | 'stopped' | 'void'; task?: string | null; device?: string; kind?: 'work' | 'short' };
function laps(node: Node, list: Lap[]) {
  const ids_: string[] = [];
  for (const { started, ms = LAP, outcome = 'rang', task = null, device = node.engine.device, kind = 'work' } of list) {
    const id = `seed-${++ids}`;
    ids_.push(id);
    node.engine.write('session', id, { kind, task, started, ended: started + ms, planned_ms: LAP, paused_ms: 0, outcome, device });
  }
  return ids_;
}
const sent = (node: Node) => until(() => node.engine.unsent.value === 0 && node.engine.sync.value === 'in-step', 10000, 'the history was not sent');

// An account with a seeded history, and laptops signed in to it, on Progress.
async function seeded(devices: Device[], tag: string, seed: (node: Node) => void, lengths: Parameters<typeof accountWith>[1] = {}) {
  const name = username(tag);
  const node = await accountWith(name, lengths);
  seed(node);
  await sent(node);
  for (const d of devices) {
    await signIn(d.page, name);
    // Ready for whichever lap of today the seed leaves next: `ready` alone means lap 1, true only of a frame before catching up.
    await expect(startButton(d.page)).toBeVisible();
    await go(d.page, 'Progress');
    await expect(d.page.getByText(/^Progress, week of /)).toBeVisible();
  }
  return { name, node };
}

const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const panel = (page: Page, title: string | RegExp) => page.locator('section').filter({ has: page.getByRole('heading', { name: title, level: 2 }) });
const words = (locator: ReturnType<Page['locator']>) => locator.innerText().then((text) => text.replace(/\s+/g, ' ').trim());
/** A lap's row in a day, lap by lap: every lap's row has a "Day so far" cell, empty when it is not counted; a task done has none. */
const lapRows = (day: ReturnType<Page['locator']>) => day.getByRole('listitem').filter({ has: day.page().locator('[class*="_split_"]') });
/** The "Day so far" of each lap row shown, top to bottom: '' for a lap not counted. */
const splits = (day: ReturnType<Page['locator']>) => lapRows(day).locator('[class*="_split_"]').allInnerTexts().then((all) => all.map((t) => t.trim()));
/** The day's focus at the top of the panel. */
const figure = (day: ReturnType<Page['locator']>) => day.locator('[class*="_big_"] b');
const wall = (ms: number) => {
  const at = new Date(ms);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

test('a first day with nothing: the first-week words, no year, one sentence each for what will show', async ({ deviceA: a }) => {
  await seeded([a], 'pfirst', () => {});
  await expect(heading(a.page)).toHaveText('Your first week starts with the next lap.');
  await expect(a.page.getByText('Last week has nothing to race. This week becomes the one to beat.')).toBeVisible();
  await expect(a.page.getByText('The year starts with your first lap: one square a day, darker the more laps it held.')).toBeVisible();
  await expect(a.page.getByText('A day counts with one lap run to its bell. The first two days you miss in a week are rest days: they do not break it.')).toBeVisible();
  await expect(a.page.getByText('Nothing has run today yet. The first lap starts on Focus.')).toBeVisible();
  await expect(a.page.getByRole('slider')).toHaveCount(0);
  await expect(a.page.getByRole('img', { name: 'This week 0m so far.' })).toBeVisible();
});

// Last week: three laps on this weekday before this time, one after it. This week: `mine` laps today.
function race(mine: number) {
  return (node: Node) => {
    const now = Date.now();
    const start = now - 2 * HOUR;
    laps(node, [0, 1, 2].map((k) => ({ started: start - 7 * DAY + k * 26 * MIN - 30 * MIN })));
    laps(node, [{ started: now - 7 * DAY + HOUR }]);
    laps(node, Array.from({ length: mine }, (_, k) => ({ started: start + k * 26 * MIN - 30 * MIN })));
  };
}

for (const [mine, said] of [
  [1, '2 laps behind last week. Last week ended on 1h 40m.'],
  [3, 'Level with last week. Last week ended on 1h 40m.'],
  [4, '25 minutes ahead of last week. Last week ended on 1h 40m.'],
] as const) {
  test(`this week against last: ${mine} lap${mine === 1 ? '' : 's'} today against 3 by this time last week says "${said}"`, async ({ deviceA: a }) => {
    test.skip(!roomToday(), 'within 2.5 hours after local midnight or 2 before it, today cannot hold the seeded laps');
    await seeded([a], 'prace', race(mine));
    // By hand: last week 3 laps (75 minutes) by now and one more after, 100 in all; this week `mine` laps.
    const you = mine * 25;
    const gap = 75 - you;
    // With no lap running the headline says the gap once, then how last week ended.
    const expected = gap > 0 ? `${Math.ceil(gap / 25)} laps behind last week. Last week ended on 1h 40m.` : gap === 0 ? 'Level with last week. Last week ended on 1h 40m.' : `${-gap} minutes ahead of last week. Last week ended on 1h 40m.`;
    expect(expected).toBe(said);
    await expect(heading(a.page)).toHaveText(said);
    const weekday = new Date(Date.now() + OFF * MIN).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
    await expect(a.page.getByText(`Last week had 1h 15m by this time on ${weekday}.`)).toBeVisible();
    const yours = you >= 60 ? `${Math.floor(you / 60)}h ${you % 60}m` : `${you}m`;
    await expect(a.page.getByRole('img', { name: `This week ${yours} so far. Last week 1h 15m by now, 1h 40m in all.` })).toBeVisible();
  });
}

// One lap a day at noon on each day `from` days back to yesterday, except the days given.
const daily = (from: number, except: string[]) => (node: Node) =>
  laps(
    node,
    Array.from({ length: from }, (_, i) => back(from - i))
      .filter((d) => !except.includes(d))
      .map((d) => ({ started: noon(d) })),
  );

// The Monday of last week, as a day.
const lastMonday = () => {
  const weekday = (new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7;
  return back(weekday + 7);
};
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

for (const misses of [2, 3]) {
  test(`the streak with ${misses} empty days in last week ${misses === 2 ? 'reads as a run' : 'reads as days kept of the last 45, and names no miss'}`, async ({ deviceA: a }) => {
    const empty = [1, 2, 3].slice(0, misses).map((n) => plus(lastMonday(), n));
    const from = 20;
    await seeded([a], 'pstreak', daily(from, empty));
    const kept = Array.from({ length: from }, (_, i) => back(from - i)).filter((d) => !empty.includes(d));
    // The fixture's rule (contracts/fixtures/streak.json runs through this function in core's tests).
    const rule = streakWindow(today(), kept);
    expect(rule.missed).toBe(misses === 3);
    const streak = panel(a.page, 'Streak');
    const count = await words(streak.locator('p').first());
    if (misses === 2) expect(count).toBe(`${rule.streak} days in a row`);
    else expect(count).toBe(`${rule.kept} of the last ${rule.of} days`);
    expect(await words(streak)).not.toMatch(/miss|broke|lost|fail/i);
  });
}

test('the year: a seeded day\'s square says its time and laps; the keyboard and a tap both open its timeline; 4 laps is a darker square than 1', async ({ deviceA: a }) => {
  const four = back(9);
  const one = back(5);
  await seeded([a], 'pyear', (node) => {
    laps(node, [0, 1, 2, 3].map((k) => ({ started: noon(four) + k * 26 * MIN })));
    laps(node, [{ started: noon(one) }]);
  });
  const year = a.page.getByRole('slider', { name: 'The days since your first lap. Arrow keys choose a day.' });
  const long = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
  const say = (day: string, text: string) => `${long(day)}: ${text}`;

  // The keyboard: End is today, each Left a week back, each Up a day back.
  await year.focus();
  await a.page.keyboard.press('End');
  const daysBack = 9;
  for (let i = 0; i < Math.floor(daysBack / 7); i++) await a.page.keyboard.press('ArrowLeft');
  for (let i = 0; i < daysBack % 7; i++) await a.page.keyboard.press('ArrowUp');
  await expect(year).toHaveAttribute('aria-valuetext', say(four, '1h 40m, 4 laps'));
  await expect(a.page.getByRole('heading', { name: `${long(four)}, lap by lap` })).toBeVisible();
  await expect(lapRows(panel(a.page, `${long(four)}, lap by lap`))).toHaveCount(4);

  // A tap on the other day's square.
  const cells = year.locator('i[class*="level"]');
  const index = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${four}T00:00:00Z`)) / DAY);
  await cells.nth(index(one)).click();
  await expect(year).toHaveAttribute('aria-valuetext', say(one, '25m, 1 lap'));
  await expect(a.page.getByRole('heading', { name: `${long(one)}, lap by lap` })).toBeVisible();

  const levelOf = async (day: string) => Number((await cells.nth(index(day)).getAttribute('class'))!.match(/level(\d)/)![1]);
  expect(await levelOf(four)).toBe(2);
  expect(await levelOf(one)).toBe(1);
  const colour = (day: string) => cells.nth(index(day)).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await colour(four)).not.toBe(await colour(one));
});

test('live: with Progress open on A, a lap that rings on B moves A\'s figures without a reload', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await seeded([a], 'plive', () => {}, { work_ms: 3000, short_ms: 60000 });
  await signIn(b.page, name);
  await ready(b.page);
  const since = panel(a.page, 'Since your first lap');
  await expect(since).toContainText('The year starts with your first lap');
  await startButton(b.page).click();
  await expect(b.page.getByRole('button', { name: 'Start 1 min break' })).toBeVisible({ timeout: 8000 });
  await expect(since).toContainText('of focus, 1 lap', { timeout: 3000 });
  await expect(since).toContainText('One square so far. Every day with a lap adds the next.');
  await expect(lapRows(panel(a.page, 'Today, lap by lap'))).toHaveCount(1);
});

test('today, lap by lap: each counted lap\'s Day so far is the running total and the last is the figure at the top; a lap not counted has none; a task done at its time and no habit check-in; Don\'t count it and Count it again move the splits on both laptops', async ({ deviceA: a, deviceB: b }) => {
  test.skip(!roomToday(), 'within 2.5 hours after local midnight or 2 before it, today cannot hold the seeded laps');
  const start = Date.now() - 2 * HOUR;
  let pair: string[] = [];
  const { name } = await seeded([a, b], 'pday', (node) => {
    laps(node, [{ started: start, outcome: 'void' }]);
    laps(node, [{ started: start + 30 * MIN, ms: 12 * MIN, outcome: 'stopped' }]);
    // Between the stopped lap and the pair: a task done.
    node.engine.write('task', 'essay', { title: 'essay outline', order: 'V', done: start + 45 * MIN });
    // The same 25 minutes, 10 of them shared, on this device and another.
    pair = laps(node, [{ started: start + 50 * MIN }, { started: start + 65 * MIN, device: 'abcdef0123456789' }]);
    // After the pair: a habit checked in.
    node.engine.write('habit', 'walk', { title: 'walk after lunch', days: 127, target: 1, order: 'V' });
    node.engine.write('checkin', 'c1', { habit: 'walk', day: today(), at: start + 100 * MIN });
  });
  const day = (page: Page) => panel(page, 'Today, lap by lap');
  await expect(a.page.getByRole('heading', { name: 'Today, lap by lap', level: 2 })).toBeVisible();

  // In the order the day ran: the laps and the task done between them. The habit checked in after is not there.
  const rows = day(a.page).getByRole('listitem');
  await expect(rows).toHaveCount(5);
  const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  expect(texts[0]).toContain('Lap, not counted');
  expect(texts[0]).toContain('25 minutes');
  expect(texts[1]).toContain('Stopped lap');
  expect(texts[1]).toContain('12 minutes');
  expect(texts[2]).toBe(`${wall(start + 45 * MIN)} Done: essay outline`);
  for (const i of [3, 4]) expect(texts[i]).toContain('ran on two devices');
  await expect(day(a.page).getByText('walk after lunch')).toHaveCount(0);

  // Day so far: none for the lap not counted, then 12, 12 + 25, and the second of the pair adds
  // only its 15 minutes not shared. The last is the figure at the top. A stopped lap is a lap: three.
  for (const page of [a.page, b.page]) {
    await expect.poll(() => splits(day(page))).toEqual(['', '12m', '37m', '52m']);
    await expect(figure(day(page))).toHaveText('52m');
    await expect(day(page)).toContainText('focused today, in 3 laps');
  }

  const at = wall(start + 65 * MIN);
  await day(a.page).getByRole('button', { name: `Don't count it, the lap at ${at}` }).click();
  // What it did is said on the bar, with its Undo.
  const bar = a.page.getByRole('status').filter({ hasText: 'off today' });
  await expect(bar).toContainText('15 minutes off today.');
  await expect(bar.getByRole('button', { name: 'Undo' })).toBeVisible();
  for (const page of [a.page, b.page]) {
    await expect(day(page).getByText('ran on two devices')).toHaveCount(0, { timeout: 2000 });
    await expect(lapRows(day(page)).nth(3)).toContainText('Lap, not counted');
    await expect.poll(() => splits(day(page))).toEqual(['', '12m', '37m', '']);
    await expect(figure(day(page))).toHaveText('37m');
    await expect(day(page)).toContainText('focused today, in 2 laps');
  }
  const outcome = async () => (await serverRows(server, name, 'session')).get(pair[1]!)?.outcome;
  await expect.poll(outcome).toBe('void');

  // The way back is offered at once, and stays: Count it again, never a passing Undo. Its split comes back.
  await day(a.page).getByRole('button', { name: `Count it again, the lap at ${at}` }).click();
  await expect.poll(outcome).toBe('rang');
  for (const page of [a.page, b.page]) {
    await expect.poll(() => splits(day(page))).toEqual(['', '12m', '37m', '52m']);
    await expect(figure(day(page))).toHaveText('52m');
  }
  await expect(day(b.page).getByText('ran on two devices')).toHaveCount(2);
});

test('a lap across midnight: today shows only its part after 00:00, with its real times, and says where its first minutes count', async ({ deviceA: a }) => {
  const since = Date.now() - midnight(today());
  test.skip(since < 30 * MIN, 'the lap across midnight must have ended before now');
  // From 23:50 last night to 00:15: ten minutes yesterday, fifteen today.
  const started = midnight(today()) - 10 * MIN;
  await seeded([a], 'pmidnight', (node) => laps(node, [{ started }]));
  const day = panel(a.page, 'Today, lap by lap');
  const row = lapRows(day);
  await expect(row).toHaveCount(1);
  const weekday = new Date(`${back(1)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  await expect(row).toContainText(`${wall(started)} to ${wall(started + LAP)}`);
  await expect(row).toContainText('15 minutes today');
  await expect(row).toContainText(`Began on ${weekday}. Its first 10 minutes count there.`);
  await expect.poll(() => splits(day)).toEqual(['15m']);
  await expect(figure(day)).toHaveText('15m');
});

test('the look back: a line typed key by key is saved with no button, shows on B, and is there after a reload offline', async ({ deviceA: a, deviceB: b }) => {
  const { name } = await seeded([a, b], 'pnote', () => {});
  const field = (page: Page) => page.getByLabel('A line about today');
  await field(a.page).pressSequentially('slept badly, still did two laps');
  await expect(field(a.page)).toHaveValue('slept badly, still did two laps');
  await expect(field(b.page)).toHaveValue('slept badly, still did two laps', { timeout: 2000 });
  await expect.poll(async () => (await serverRows(server, name, 'day')).get(today())?.note).toBe('slept badly, still did two laps');

  await a.setOffline(true);
  await a.page.reload();
  await expect(field(a.page)).toHaveValue('slept badly, still did two laps');
});

test('by project and estimates: one project up, one down, a task over its estimate and one under, as worked out by hand', async ({ deviceA: a }) => {
  await seeded([a], 'pprojects', (node) => {
    node.engine.write('project', 'thesis', { name: 'Thesis', color: 'you', order: 'V' });
    node.engine.write('project', 'reading', { name: 'Reading', color: 'rest', order: 'W' });
    node.engine.write('task', 't-thesis', { title: 'chapter 2', project: 'thesis', order: 'V' });
    node.engine.write('task', 't-reading', { title: 'papers', project: 'reading', order: 'W' });
    // Thesis: 3 laps in the last 7 days, 1 in the 7 before. Reading: 1, and 3 before.
    laps(node, [0, 1, 2].map((k) => ({ started: noon(back(1)) + k * 26 * MIN, task: 't-thesis' })));
    laps(node, [{ started: noon(back(8)), task: 't-thesis' }]);
    laps(node, [{ started: noon(back(2)), task: 't-reading' }]);
    laps(node, [0, 1, 2].map((k) => ({ started: noon(back(9)) + k * 26 * MIN, task: 't-reading' })));
    // Two tasks done with estimates: 3 laps run on a guess of 2, and 2 on a guess of 4.
    node.engine.write('task', 't-over', { title: 'slides', estimate: 2, done: noon(back(3)) + 3 * HOUR, order: 'X' });
    node.engine.write('task', 't-under', { title: 'abstract', estimate: 4, done: noon(back(4)) + 3 * HOUR, order: 'Y' });
    laps(node, [0, 1, 2].map((k) => ({ started: noon(back(3)) + k * 26 * MIN, task: 't-over' })));
    laps(node, [0, 1].map((k) => ({ started: noon(back(4)) + k * 26 * MIN, task: 't-under' })));
  });
  const projects = panel(a.page, 'Last 7 days by project');
  const line = (project: string) => projects.getByRole('listitem').filter({ hasText: project });
  await expect(line('Thesis')).toContainText('1h 15m');
  await expect(line('Thesis')).toContainText('3 laps, up 50m on the week before');
  await expect(line('Reading')).toContainText('25m');
  await expect(line('Reading')).toContainText('1 lap, down 50m on the week before');
  // By hand: (3 + 2) laps run over (2 + 4) guessed is 0.83.
  const estimates = panel(a.page, 'Estimates');
  await expect(estimates).toContainText(`A task takes about ${(5 / 6).toFixed(1)} laps for each one you estimate.`);
  await expect(estimates.getByRole('listitem').filter({ hasText: 'slides' })).toContainText('3 of 2');
  await expect(estimates.getByRole('listitem').filter({ hasText: 'abstract' })).toContainText('2 of 4');
});

test('at 412 and 471 wide, with half a year of history, nothing scrolls sideways but the year inside its panel', async ({ deviceA: a }) => {
  await seeded([a], 'pwide', daily(200, []));
  for (const width of [412, 471]) {
    await a.page.setViewportSize({ width, height: 915 });
    await a.page.waitForTimeout(200);
    const page = await a.page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
    expect(page.scroll, `the page scrolls sideways at ${width}`).toBeLessThanOrEqual(page.view);
    // The year is wider than its place, and scrolls inside it.
    const year = await a.page.getByRole('slider').evaluate((el) => {
      const inner = [...el.querySelectorAll('div')].find((d) => d.scrollWidth > d.clientWidth + 1);
      return inner ? { scroll: inner.scrollWidth, view: inner.clientWidth, right: el.getBoundingClientRect().right } : null;
    });
    expect(year, `the year does not scroll inside its panel at ${width}`).not.toBeNull();
    expect(year!.right).toBeLessThanOrEqual(width);
  }
});
