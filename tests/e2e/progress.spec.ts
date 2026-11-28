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
type Loc = ReturnType<Page['locator']>;
/** The day's cards, one per task, in the order of each task's first lap. */
const cards = (day: Loc) => day.getByRole('listitem');
/** A task's card, by the task's title as it stands on the card. */
const cardOf = (day: Loc, title: string) => cards(day).filter({ has: day.page().locator('[class*="_title_"]').getByText(title, { exact: true }) });
/** What a card says: its title, its time today ('' with nothing counted), and the line under its sliver. */
const cardSays = async (card: Loc) => ({
  title: (await card.locator('[class*="_title_"]').first().innerText()).trim(),
  time: (await card.locator('[class*="_time_"]').count()) ? (await card.locator('[class*="_time_"]').innerText()).trim() : '',
  sum: (await card.locator('[class*="_sum_"]').innerText()).trim(),
});
/** A card's arrow, named by its task (and its time). */
const arrowOf = (card: Loc, title: string) => card.getByRole('button', { name: new RegExp(`^${title}(, |$)`) });
/** Opens a card with its arrow, as a tap or a click. */
async function openCard(card: Loc, title: string, touch = false) {
  const arrow = arrowOf(card, title);
  await expect(arrow).toHaveAttribute('aria-expanded', 'false');
  await (touch ? arrow.tap() : arrow.click());
  await expect(arrow).toHaveAttribute('aria-expanded', 'true');
}
/** The facts of each lap line of an opened card, top to bottom. */
const facts = (card: Loc) => card.locator('[class*="_facts_"]').allInnerTexts().then((all) => all.map((t) => t.replace(/\s+/g, ' ').trim()));
/** The day's focus at the top of the panel. */
const figure = (day: ReturnType<Page['locator']>) => day.locator('[class*="_big_"] b');
/** To the nearest minute, as the day panel shows a clock time. */
const near = (ms: number) => Math.round(ms / MIN) * MIN;
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
  // Four laps for no task: one card, "Nothing in particular", that says four laps.
  await expect(cards(panel(a.page, `${long(four)}, lap by lap`))).toHaveCount(1);
  await expect(cardOf(panel(a.page, `${long(four)}, lap by lap`), 'Nothing in particular')).toContainText('4 laps.');

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
  await expect(cards(panel(a.page, 'Today, lap by lap'))).toHaveCount(1);
});

for (const [how, touch] of [['a finger at 412', true], ['a mouse at 1440', false]] as const) {
  test(`${how}: today, one card per task in the order of its first lap, each with its own time; done is "Done at" in its card, a task done with no lap is a card of its own; open, Don't count it drops the card's time and the figure, Count it again brings both back, on both devices`, async ({ deviceA, deviceB: b, phone }) => {
    test.skip(!roomToday(), 'within 2.5 hours after local midnight or 2 before it, today cannot hold the seeded laps');
    const a = touch ? phone : deviceA;
    if (!touch) await a.page.setViewportSize({ width: 1440, height: 900 });
    const start = Date.now() - 2 * HOUR;
    let second: string[] = [];
    const { name } = await seeded([a, b], touch ? 'pcardt' : 'pcardm', (node) => {
      node.engine.write('task', 'essay', { title: 'essay', order: 'V', done: start + 80 * MIN });
      node.engine.write('task', 'reading', { title: 'reading', order: 'W' });
      node.engine.write('task', 'mail', { title: 'reply to Sam', order: 'X', done: start + 85 * MIN });
      laps(node, [{ started: start, task: 'essay' }]);
      laps(node, [{ started: start + 30 * MIN, ms: 12 * MIN, outcome: 'stopped', task: 'reading' }]);
      second = laps(node, [{ started: start + 50 * MIN, task: 'essay' }]);
    });
    const day = (page: Page) => panel(page, 'Today, lap by lap');
    await expect(a.page.getByRole('heading', { name: 'Today, lap by lap', level: 2 })).toBeVisible();

    // Three cards and nothing else: no row of its own for a task done.
    await expect(cards(day(a.page))).toHaveCount(3);
    const all = await Promise.all([0, 1, 2].map((i) => cardSays(cards(day(a.page)).nth(i))));
    expect(all).toEqual([
      { title: 'essay', time: '50m', sum: `2 laps. Done at ${wall(near(start + 80 * MIN))}.` },
      { title: 'reading', time: '12m', sum: '1 stopped lap.' },
      { title: 'reply to Sam', time: '', sum: `No lap today. Done at ${wall(near(start + 85 * MIN))}.` },
    ]);
    for (const p of [a.page, b.page]) {
      await expect(figure(day(p))).toHaveText('1h 2m');
      await expect(day(p)).toContainText('focused today, in 3 laps');
    }
    // Closed, no lap line shows.
    expect(await facts(day(a.page))).toEqual([]);

    // Opened: one line per lap, in order.
    const essay = cardOf(day(a.page), 'essay');
    await openCard(essay, 'essay', touch);
    await expect.poll(() => facts(essay)).toEqual([
      `${wall(near(start))} to ${wall(near(start + 25 * MIN))}, 25 minutes`,
      `${wall(near(start + 50 * MIN))} to ${wall(near(start + 75 * MIN))}, 25 minutes`,
    ]);

    // Don't count the second: the card's time and the figure drop, here and on B.
    const at = wall(start + 50 * MIN);
    const notCount = essay.getByRole('button', { name: `Don't count it, the lap at ${at}` });
    await (touch ? notCount.tap() : notCount.click());
    await expect(a.page.getByRole('status').filter({ hasText: 'off today' })).toContainText('25 minutes off today');
    await expect.poll(() => facts(essay)).toEqual([
      `${wall(near(start))} to ${wall(near(start + 25 * MIN))}, 25 minutes`,
      `${wall(near(start + 50 * MIN))} to ${wall(near(start + 75 * MIN))}, 25 minutes, not counted`,
    ]);
    await expect(essay.getByRole('button', { name: `Count it again, the lap at ${at}` })).toBeVisible();
    await expect.poll(() => cardSays(essay)).toEqual({ title: 'essay', time: '25m', sum: `2 laps, 1 not counted. Done at ${wall(near(start + 80 * MIN))}.` });
    for (const p of [a.page, b.page]) {
      await expect(figure(day(p))).toHaveText('37m');
      await expect(day(p)).toContainText('focused today, in 2 laps');
    }
    await expect(cardOf(day(b.page), 'essay').locator('[class*="_time_"]')).toHaveText('25m');
    const outcome = async () => (await serverRows(server, name, 'session')).get(second[0]!)?.outcome;
    await expect.poll(outcome).toBe('void');

    // The way back stays on the line: Count it again, and both come back.
    const again = essay.getByRole('button', { name: `Count it again, the lap at ${at}` });
    await (touch ? again.tap() : again.click());
    await expect.poll(outcome).toBe('rang');
    await expect.poll(() => cardSays(essay)).toEqual({ title: 'essay', time: '50m', sum: `2 laps. Done at ${wall(near(start + 80 * MIN))}.` });
    for (const p of [a.page, b.page]) await expect(figure(day(p))).toHaveText('1h 2m');
  });
}

test('a lap across midnight: its card holds today\'s part, and open, its facts read "23:50 <weekday> to 00:15, 15 of 25 minutes today"', async ({ deviceA: a }) => {
  const since = Date.now() - midnight(today());
  test.skip(since < 30 * MIN, 'the lap across midnight must have ended before now');
  // From 23:50 last night to 00:15: ten minutes yesterday, fifteen today.
  const started = midnight(today()) - 10 * MIN;
  await seeded([a], 'pmidnight', (node) => laps(node, [{ started }]));
  const day = panel(a.page, 'Today, lap by lap');
  await expect(cards(day)).toHaveCount(1);
  const card = cardOf(day, 'Nothing in particular');
  const weekday = new Date(`${back(1)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  await expect.poll(() => cardSays(card)).toEqual({ title: 'Nothing in particular', time: '15m', sum: `1 lap, from ${wall(started)} ${weekday}.` });
  await expect(figure(day)).toHaveText('15m');
  await openCard(card, 'Nothing in particular');
  await expect.poll(() => facts(card)).toEqual([`${wall(started)} ${weekday} to ${wall(started + LAP)}, 15 of 25 minutes today`]);
});

test('a lap of 15 m 30 s from hh:mm:20 reads hh:mm to hh:mm+16, 16 minutes, and with a lap of 10 after it the card\'s time and the figure at the top say 26m', async ({ deviceA: a }) => {
  test.skip(!roomToday(), 'within 2.5 hours after local midnight or 2 before it, today cannot hold the seeded laps');
  // A whole minute an hour back, then 20 s into it: the start rounds down, the end (at :50) up.
  const minute = Math.floor((Date.now() - HOUR) / MIN) * MIN;
  const first = minute + 20 * 1000;
  const second = minute + 30 * MIN + 40 * 1000;
  await seeded([a], 'pround', (node) => laps(node, [{ started: first, ms: 15.5 * MIN }, { started: second, ms: 10 * MIN }]));
  const day = panel(a.page, 'Today, lap by lap');
  const card = cardOf(day, 'Nothing in particular');
  await expect(card).toHaveCount(1);
  await expect(card.locator('[class*="_time_"]')).toHaveText('26m');
  await expect(figure(day)).toHaveText('26m');
  await openCard(card, 'Nothing in particular');
  await expect.poll(() => facts(card)).toEqual([
    `${wall(minute)} to ${wall(minute + 16 * MIN)}, 16 minutes`,
    `${wall(minute + 31 * MIN)} to ${wall(minute + 41 * MIN)}, 10 minutes`,
  ]);
});

test('two tasks overlapping on two devices: each card is its laps\' own minutes, as its open line says (30m and 15m), and the figure at the top is the union, 35m', async ({ deviceA: a }) => {
  test.skip(!roomToday(), 'within 2.5 hours after local midnight or 2 before it, today cannot hold the seeded laps');
  // As 10:00 to 10:30 for A on this device and 10:20 to 10:35 for B on another, two hours back.
  const t = Math.floor((Date.now() - 2 * HOUR) / MIN) * MIN;
  await seeded([a], 'poverlap', (node) => {
    node.engine.write('task', 'ta', { title: 'task A', order: 'V' });
    node.engine.write('task', 'tb', { title: 'task B', order: 'W' });
    laps(node, [{ started: t, ms: 30 * MIN, task: 'ta' }]);
    laps(node, [{ started: t + 20 * MIN, ms: 15 * MIN, task: 'tb', device: 'abcdef0123456789' }]);
  });
  const day = panel(a.page, 'Today, lap by lap');
  await expect(cards(day)).toHaveCount(2);
  const A = cardOf(day, 'task A');
  const B = cardOf(day, 'task B');
  await expect(A.locator('[class*="_time_"]')).toHaveText('30m');
  await expect(B.locator('[class*="_time_"]')).toHaveText('15m');
  await expect(figure(day)).toHaveText('35m');
  // Open, each line says the same minutes as its card.
  await openCard(A, 'task A');
  await expect.poll(() => facts(A)).toEqual([expect.stringMatching(new RegExp(`^${wall(t)} to ${wall(t + 30 * MIN)}, 30 minutes`))]);
  await openCard(B, 'task B');
  await expect.poll(() => facts(B)).toEqual([expect.stringMatching(new RegExp(`^${wall(t + 20 * MIN)} to ${wall(t + 35 * MIN)}, 15 minutes`))]);
});

test('a task done with no lap today is a card with nothing to open: no arrow, and a tap on its title opens nothing', async ({ deviceA: a }) => {
  test.skip(!roomToday(), 'within 2.5 hours after local midnight or 2 before it, today cannot hold the seeded laps');
  const done = Date.now() - HOUR;
  await seeded([a], 'pdoneonly', (node) => {
    node.engine.write('task', 'lap', { title: 'reading', order: 'V' });
    laps(node, [{ started: Date.now() - 2 * HOUR, task: 'lap' }]);
    node.engine.write('task', 'mail', { title: 'reply to Sam', order: 'W', done });
  });
  const day = panel(a.page, 'Today, lap by lap');
  const card = cardOf(day, 'reply to Sam');
  await expect.poll(() => cardSays(card)).toEqual({ title: 'reply to Sam', time: '', sum: `No lap today. Done at ${wall(near(done))}.` });
  await expect(card.locator('[aria-expanded]'), 'a card with no lap has an arrow').toHaveCount(0);
  await expect(card.getByRole('button')).toHaveCount(0);
  await card.locator('[class*="_title_"]').getByText('reply to Sam', { exact: true }).click();
  await a.page.waitForTimeout(300);
  await expect(a.page.locator('dialog[open]')).toHaveCount(0);
  expect(await facts(card)).toEqual([]);
  // The card with a lap still opens.
  await openCard(cardOf(day, 'reading'), 'reading');
});

test('a past day opened from the year with a task done and no lap: its card reads "No lap that day. Done at HH:MM."', async ({ deviceA: a }) => {
  const first = back(9);
  const quiet = back(5);
  const done = noon(quiet) + 37 * MIN;
  await seeded([a], 'ppastdone', (node) => {
    laps(node, [{ started: noon(first) }]);
    node.engine.write('task', 'mail', { title: 'reply to Sam', order: 'V', done });
  });
  const year = a.page.getByRole('slider', { name: 'The days since your first lap. Arrow keys choose a day.' });
  const long = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
  const cells = year.locator('i[class*="level"]');
  await cells.nth(Math.round((Date.parse(`${quiet}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY)).click();
  const day = panel(a.page, `${long(quiet)}, lap by lap`);
  await expect(a.page.getByRole('heading', { name: `${long(quiet)}, lap by lap`, level: 2 })).toBeVisible();
  const card = cardOf(day, 'reply to Sam');
  await expect.poll(() => cardSays(card)).toEqual({ title: 'reply to Sam', time: '', sum: `No lap that day. Done at ${wall(near(done))}.` });
  await expect(card.locator('[aria-expanded]')).toHaveCount(0);
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
