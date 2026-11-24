// The local day as a signal that turns over by itself. Today and Progress each keep one.

import { signal } from '@preact/signals-core';
import { localDay } from '../core/stats.ts';
import type { Engine } from './engine.ts';

const DAY_MS = 86400000;

export interface DayEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. */
  utcOffsetMin(): number;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
}

export function createDay(engine: Pick<Engine, 'now'>, env: DayEnv) {
  const now = () => localDay(engine.now(), env.utcOffsetMin());
  const day = signal(now());
  let cancel = () => {};
  // The wait is to the next local midnight, checked again when it comes: a clock that was
  // corrected meanwhile may say it is not midnight yet. A sleeping laptop runs no timers, so this
  // is also what waking calls: the day as it is now, and a fresh wait for the midnight after it.
  function wake() {
    cancel();
    day.value = now();
    const midnight = Date.parse(day.peek()) + DAY_MS - env.utcOffsetMin() * 60000;
    cancel = env.schedule(wake, Math.min(Math.max(midnight - engine.now(), 1000), DAY_MS));
  }
  wake();
  return {
    /** The local day, `2026-11-24`. */
    day,
    /** The day by the clock this instant, whatever the signal still says. */
    now,
    wake,
    close: () => cancel(),
  };
}
