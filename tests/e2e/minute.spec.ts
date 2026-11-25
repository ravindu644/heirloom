// A run leaves a row only after a minute of running (protocol section 11), so this waits a real
// minute. Two accounts share the wait: one stops and logs (a part square on its task), the other
// sets its lap aside.
import { accountWith, go, ready, sessionsWhen, signIn, squaresOf, taskRow, username } from './app.ts';
import { expect, test } from './devices.ts';

test('a minute in, stop and log keeps a stopped row on both laptops; not counting it keeps a void row', async ({ deviceA: a, deviceB: b, deviceC: c }) => {
  test.setTimeout(120000);
  const logged = username('logged');
  const aside = username('aside');
  // The lap that is stopped is on a task: Start lap 1 starts on today's next task.
  const node = await accountWith(logged);
  node.engine.write('task', 'proofs', { title: 'proofs', estimate: 2, order: 'V' });
  await accountWith(aside);
  for (const [d, name] of [[a, logged], [b, logged], [c, aside]] as const) {
    await signIn(d.page, name);
    await ready(d.page);
  }

  await a.page.getByRole('button', { name: 'Start lap 1' }).click();
  await c.page.getByRole('button', { name: 'Start lap 1' }).click();
  await expect(b.page.getByRole('button', { name: 'Pause' })).toBeVisible();
  // The button says what a tap keeps, and changes when there is a minute to keep.
  await expect(a.page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  const stop = a.page.getByRole('button', { name: 'Stop and log 1 min' });
  await expect(stop).toBeVisible({ timeout: 70000 });

  await stop.click();
  // In the page twice, one copy display: none at any width (with the digits, or by the button on a phone).
  await expect(a.page.getByText('Stopped. 1 minute kept.').filter({ visible: true })).toBeVisible();
  await ready(b.page);
  const [kept] = await sessionsWhen(logged, (rows) => rows.length > 0);
  expect(kept).toMatchObject({ kind: 'work', outcome: 'stopped', paused_ms: 0 });
  expect((kept!.ended as number) - (kept!.started as number)).toBeGreaterThanOrEqual(60000);
  expect(kept).toMatchObject({ task: 'proofs' });
  // On Today the stopped minute is a part of a square, and no lap: "0 of 2".
  await go(b.page, 'Today');
  const row = taskRow(b.page, 'proofs');
  await expect(row).toContainText('0 of 2');
  const [part, empty] = await squaresOf(row);
  expect(part, 'a minute of a 25 minute lap').toBeCloseTo(((kept!.ended as number) - (kept!.started as number)) / 1500000, 3);
  expect(empty).toBe(0);

  await c.page.getByRole('button', { name: "Don't count this lap" }).click();
  await expect(c.page.getByText('Not counted. The lap stays in your timeline and adds nothing to your day, week or streak.').filter({ visible: true })).toBeVisible();
  const [voided] = await sessionsWhen(aside, (rows) => rows.length > 0);
  expect(voided).toMatchObject({ kind: 'work', outcome: 'void' });
  expect((voided!.ended as number) - (voided!.started as number)).toBeGreaterThanOrEqual(60000);
});
