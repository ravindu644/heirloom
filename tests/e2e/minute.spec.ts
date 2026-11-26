// One Stop (DESIGN.md, Voice 4): a lap stopped a minute in says how far it ran, keeps a stopped row
// on both laptops, is a lap on its task ("1 of 2") and a part square as full as it ran. This waits
// a real minute, for the line that names the minutes.
import { accountWith, go, ready, sessionsWhen, signIn, squaresOf, startButton, taskRow, username } from './app.ts';
import { expect, test } from './devices.ts';

test('a minute in, Stop keeps a stopped row on both laptops; it is a lap on its task, a part square, and lap 2 is next', async ({ deviceA: a, deviceB: b }) => {
  test.setTimeout(120000);
  const name = username('logged');
  // The lap that is stopped is on a task: Focus's start begins today's next task.
  const node = await accountWith(name);
  node.engine.write('task', 'proofs', { title: 'proofs', estimate: 2, order: 'V' });
  for (const d of [a, b]) {
    await signIn(d.page, name);
    await ready(d.page);
  }

  await startButton(a.page).click();
  await expect(b.page.getByRole('button', { name: 'Pause' })).toBeVisible();
  // One Stop, and its name does not change while the lap runs.
  const stop = a.page.getByRole('button', { name: 'Stop', exact: true });
  await expect(stop).toBeVisible();
  await expect(a.page.getByText(/^\d\d:\d\d$/).filter({ hasText: /^23:5\d$/ })).toBeVisible({ timeout: 70000 });
  await expect(stop).toBeVisible();
  await expect(a.page.getByRole('button', { name: /^Stop and log/ })).toHaveCount(0);
  await expect(a.page.getByRole('button', { name: "Don't count this lap" })).toHaveCount(0);

  await stop.click();
  await expect(a.page.getByText('Lap 1 today stopped at 1 min.').filter({ visible: true })).toBeVisible();
  for (const d of [a, b]) await ready(d.page);
  const [kept] = await sessionsWhen(name, (rows) => rows.length > 0);
  expect(kept).toMatchObject({ kind: 'work', outcome: 'stopped', paused_ms: 0, task: 'proofs' });
  expect((kept!.ended as number) - (kept!.started as number)).toBeGreaterThanOrEqual(60000);
  // On Today the stopped lap is a lap, "1 of 2", and a part of a square as full as it ran.
  await go(b.page, 'Today');
  const row = taskRow(b.page, 'proofs');
  await expect(row).toContainText('1 of 2');
  const [part, empty] = await squaresOf(row);
  expect(part, 'a minute of a 25 minute lap').toBeCloseTo(((kept!.ended as number) - (kept!.started as number)) / 1500000, 3);
  expect(empty).toBe(0);
});
