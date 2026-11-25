import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signal } from '@preact/signals';
import { followLaps, picked } from './choice.ts';

test('Focus stays on the task of the last lap, wherever it was started, until another is chosen', () => {
  const state = signal<{ phase: string; run: string | null; task: string | null }>({ phase: 'idle', run: null, task: null });
  followLaps({ state }, () => '2026-11-24');
  assert.equal(picked.value, null);
  // A lap started anywhere makes its task the choice.
  state.value = { phase: 'work', run: 'w1', task: 'essay' };
  assert.deepEqual(picked.value, { day: '2026-11-24', task: 'essay' });
  // Its break, the end of that, a stop: the choice stays.
  state.value = { phase: 'short', run: 'b1', task: null };
  state.value = { phase: 'idle', run: null, task: null };
  assert.deepEqual(picked.value, { day: '2026-11-24', task: 'essay' });
  // Another chosen by hand holds while the old lap still stands rung or paused.
  state.value = { phase: 'work', run: 'w2', task: 'essay' };
  const drills = { day: '2026-11-24', task: 'drills' };
  picked.value = drills;
  state.value = { phase: 'work', run: 'w2', task: 'essay' };
  assert.equal(picked.value, drills);
  // "Nothing in particular" chosen by hand holds until the lap it was chosen for starts.
  state.value = { phase: 'idle', run: null, task: null };
  const nothing = { day: '2026-11-24', task: null };
  picked.value = nothing;
  assert.equal(picked.value, nothing);
  state.value = { phase: 'work', run: 'w3', task: null };
  assert.equal(picked.value, null);
});

test('a first lap started with an empty list leaves no choice: tasks added after it are what Focus offers', () => {
  const state = signal<{ phase: string; run: string | null; task: string | null }>({ phase: 'idle', run: null, task: null });
  followLaps({ state }, () => '2026-11-24');
  picked.value = null;
  state.value = { phase: 'work', run: 'first', task: null };
  state.value = { phase: 'idle', run: null, task: null };
  // Nothing kept, so the screen falls back to Today's next, whatever is added from here on.
  assert.equal(picked.value, null);
});
