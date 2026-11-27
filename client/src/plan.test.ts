import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDLE, act, view } from './core/timer.ts';
import type { TimerState } from './core/timer.ts';
import { isPaused } from './platform/notifier.ts';
import { planFor } from './plan.ts';
import { result } from './ui/strings.ts';

const MIN = 60000;
const T0 = Date.UTC(2026, 10, 24, 10);
const lengths = { short_ms: 5 * MIN, long_ms: 15 * MIN };
const lapOn = (from: TimerState, task: string | null, now = T0) => act(from, { do: 'start', phase: 'work', run: 'w', task, planned_ms: 25 * MIN }, now);
const plan = (state: TimerState, now: number, on?: { title: string; laps: number; estimate: number | null }, ahead = 0, today = 1) =>
  planFor({ state, view: view(state, now), on, today, lengths, ahead });

test('nothing running plans nothing', () => {
  assert.equal(plan(IDLE, T0), null);
});

test('a lap on a task: the countdown and the bell both count the task, the title last', () => {
  const state = lapOn(IDLE, 'essay');
  const ring = plan(state, T0 + MIN, { title: 'Essay draft', laps: 0, estimate: 3 }, 2000);
  assert.ok(ring && !isPaused(ring));
  assert.equal(ring.during, 'Lap 1, 3 estimated: Essay draft');
  assert.equal(ring.title, 'Lap 1 done: Essay draft');
  assert.equal(ring.body, result.take(5 * MIN));
  assert.deepEqual(ring.actions, { pause: 'Pause', resume: 'Resume', stop: 'Stop', run: 'w' });
  // The end is moved from the server's clock to the device's.
  assert.equal(ring.at, T0 + 25 * MIN - 2000);
  assert.deepEqual(ring.push, { run: 'w', at: T0 + 25 * MIN });
});

test('the estimate changed while the lap runs: other words, the same bell', () => {
  const state = lapOn(IDLE, 'essay');
  const before = plan(state, T0 + MIN, { title: 'Essay draft', laps: 0, estimate: 4 });
  const after = plan(state, T0 + 2 * MIN, { title: 'Essay draft', laps: 0, estimate: 2 });
  assert.ok(before && !isPaused(before) && after && !isPaused(after));
  assert.equal(after.during, 'Lap 1, 2 estimated: Essay draft');
  assert.equal(after.at, before.at);
  assert.equal(after.title, before.title);
});

test('a task with no estimate, and a lap past the estimate, read plainly', () => {
  const state = lapOn(IDLE, 'essay');
  const none = plan(state, T0, { title: 'Essay draft', laps: 0, estimate: null });
  const past = plan(state, T0, { title: 'Essay draft', laps: 3, estimate: 2 });
  assert.equal(none?.during, 'Lap 1: Essay draft');
  assert.equal(past?.during, 'Lap 4, 2 estimated: Essay draft');
});

test('a lap for nothing in particular, or on a task this device does not hold open: the lap of the day, and no word of the set', () => {
  // The second lap of the set, the third of the day.
  const second = lapOn(act(lapOn(IDLE, null), { do: 'stop' }, T0 + MIN), null, T0 + 2 * MIN);
  const ring = plan(second, T0 + 3 * MIN, undefined, 0, 3);
  assert.ok(ring && !isPaused(ring));
  assert.equal(ring.during, 'Lap 3 today');
  assert.equal(ring.title, 'Lap done.');
  assert.doesNotMatch(JSON.stringify(ring), /set|of 4/);
});

test('a lap begun before midnight, on no task, is a lap of today: it ends today', () => {
  const ring = plan(lapOn(IDLE, null), T0 + MIN, undefined, 0, 1);
  assert.equal(ring?.during, 'Lap 1 today');
});

test('the fourth lap in a row earns the long break, at the length given', () => {
  const fourth: TimerState = { ...lapOn(IDLE, null), set_index: 3 };
  const ring = plan(fourth, T0);
  assert.ok(ring && !isPaused(ring));
  assert.equal(ring.body, result.take(15 * MIN));
});

test('paused: no bell, the time left standing still, Resume and Stop', () => {
  const state = act(lapOn(IDLE, 'essay'), { do: 'pause' }, T0 + 12 * MIN + 26000);
  const still = plan(state, T0 + 40 * MIN, { title: 'Essay draft', laps: 0, estimate: 3 });
  assert.ok(still && isPaused(still));
  assert.equal(still.during, 'Lap 1, 3 estimated: Essay draft');
  assert.equal(still.left, 'Paused, 12:34 left');
  assert.equal(still.actions?.resume, 'Resume');
  // Resumed, the bell is planned again, later by the pause.
  const again = plan(act(state, { do: 'resume' }, T0 + 40 * MIN), T0 + 40 * MIN, { title: 'Essay draft', laps: 0, estimate: 3 });
  assert.ok(again && !isPaused(again));
  assert.equal(again.at, T0 + 25 * MIN + (40 * MIN - 12 * MIN - 26000));
});

test('a break: its name, what is next said with its noun, and the way out worded as Focus words it', () => {
  const rest = act(lapOn(IDLE, 'essay'), { do: 'start', phase: 'short', run: 'b', task: null, planned_ms: 5 * MIN }, T0 + 25 * MIN);
  const ring = plan(rest, T0 + 26 * MIN);
  assert.ok(ring && !isPaused(ring));
  assert.equal(ring.during, 'Short break');
  assert.equal(ring.title, 'Break over.');
  assert.equal(ring.body, 'Time for the next lap.');
  assert.equal(ring.actions?.stop, 'Done for now');
});

test('a lap whose bell has gone and is not yet answered still has its plan, for the moment the alarm is due', () => {
  const state = lapOn(IDLE, null);
  const ring = plan(state, T0 + 26 * MIN);
  assert.ok(ring && !isPaused(ring));
  assert.equal(ring.at, T0 + 25 * MIN);
});
