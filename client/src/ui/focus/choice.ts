import { effect, signal } from '@preact/signals';
import type { ReadonlySignal } from '@preact/signals';

/**
 * The task Start will begin, when that is not simply Today's next one: null inside is a lap for
 * nothing in particular, chosen by hand for the lap to come. It is the screen's own, synced
 * nowhere, and is kept while the app is open. A lap on a task leaves that task as the choice,
 * wherever the lap was started, until another is chosen; the screen lets it go when the task is
 * done or deleted, or the day turns. A lap for nothing leaves no choice behind, and Focus goes
 * back to Today's next: a first lap started with an empty list must not hold the day to no task.
 */
export const picked = signal<{ day: string; task: string | null } | null>(null);

// A lap may start from Today's row, from another device, or by itself after a break. So the
// timer is watched for the app's life, not the screen's, from the first time the screen is shown.
let watched: unknown;
let unwatch = () => {};
export function followLaps(timer: { state: ReadonlySignal<{ phase: string; run: string | null; task: string | null }> }, day: () => string) {
  if (watched === timer) return;
  unwatch();
  watched = timer;
  let seen: string | null | undefined;
  unwatch = effect(() => {
    const { phase, run, task } = timer.state.value;
    // Only a run not seen before is a lap starting: one that stands paused or rung leaves a
    // choice made after it alone.
    if (phase === 'work' && run !== seen) picked.value = task === null ? null : { day: day(), task };
    seen = run;
  });
}
