// What the Habits screen is given. The lead wrote this interface so the ui lane and the core
// lane could build to it at the same time; the core lane fills in createHabits.
// Rules: contracts/protocol.md section 14, and section 8 for the streak.

import { batch, computed } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { asCheckIn, asDays, asHabit, asRemind, asTarget, habitDays, weekAgainst } from '../core/habits.ts';
import type { CheckIn, Habit, HabitDay } from '../core/habits.ts';
import { addDays } from '../core/progress.ts';
import { byOrder, keyBetween, moveKeys } from '../core/today.ts';
import { createDay } from './day.ts';
import type { Engine } from './engine.ts';

export type { HabitDay } from '../core/habits.ts';

export interface HabitView {
  id: string;
  title: string;
  /** Weekday mask: bit 0 Monday to bit 6 Sunday. */
  days: number;
  /** Check-ins that make a day done. */
  target: number;
  /** Local time of day for the reminder, `07:30`, or null. */
  remind: string | null;
  /** Today's check-ins and whether today is planned and done. */
  today: HabitDay;
  /** This week, Monday first. Days after today have count 0 and are not done. */
  week: HabitDay[];
  /** From the first check-in to today, oldest first, for the small heatmap. Empty before any. */
  record: HabitDay[];
  /** Done days since the last miss, and done of planned over the last 45 days of the record. */
  streak: number;
  kept: number;
  of: number;
  /** True when a miss lies inside those days: then the screen shows kept of, not the run. */
  missed: boolean;
}

export interface HabitEdit {
  title?: string;
  days?: number;
  target?: number;
  remind?: string | null;
  archived?: boolean;
}

export interface Habits {
  /** Habits that are neither archived nor deleted, in order. */
  readonly list: ReadonlySignal<HabitView[]>;
  /** Archived ones, for bringing back. */
  readonly archived: ReadonlySignal<HabitView[]>;
  /** Deleted in the last 30 days, newest first. */
  readonly deleted: ReadonlySignal<HabitView[]>;
  /** Of the habits planned for today: how many are done. */
  readonly today: ReadonlySignal<{ done: number; planned: number }>;
  /** Check-ins this week so far and last week up to the same weekday and time. Call it on a tick. */
  week(): { now: number; before: number };

  /** A new habit at the end of the list. Returns its id, or null for an empty title. */
  add(title: string, days: number, target: number): string | null;
  edit(id: string, fields: HabitEdit): void;
  /** One check-in for today: one row, never a number changed. Returns the row's id. */
  checkIn(id: string): string | null;
  /** Takes back the latest check-in of today for this habit. */
  undo(id: string): void;
  remove(id: string): void;
  restore(id: string): void;
  move(id: string, before: string | null): void;
  /** Re-checks the day now: call it when the app comes back to the front. */
  wake(): void;
}

export interface HabitsEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. */
  utcOffsetMin(): number;
  /** A new row id. */
  id(): string;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
}

const KEPT_MS = 30 * 86400000;

/**
 * `close()` stops the midnight timer. `recomputed()` says how many times every check-in has been
 * gone through: it is there for the test that proves this is not every tick.
 */
export function createHabits(engine: Engine, env: HabitsEnv): Habits & { close(): void; recomputed(): number } {
  const clock = createDay(engine, env);
  const habitRows = engine.rows('habit');
  const checkinRows = engine.rows('checkin');

  // The one pass over every check-in there is: how many are live on each day of each habit, and
  // which they are, by day. Worked out again only when a check-in row has changed and someone
  // asks. Habit rows, the day and the clock are not read here.
  let passes = 0;
  const checkins = computed(() => {
    passes += 1;
    const counts = new Map<string, Map<string, number>>();
    const byDay = new Map<string, CheckIn[]>();
    for (const [id, row] of checkinRows.value) {
      const checkin = asCheckIn(id, row);
      if (!checkin) continue;
      let days = counts.get(checkin.habit);
      if (!days) counts.set(checkin.habit, (days = new Map()));
      days.set(checkin.day, (days.get(checkin.day) ?? 0) + 1);
      const list = byDay.get(checkin.day);
      if (list) list.push(checkin);
      else byDay.set(checkin.day, [checkin]);
    }
    return { counts, byDay };
  });

  const habits = computed(() => {
    const all = new Map<string, Habit>();
    for (const [id, row] of habitRows.value) {
      const habit = asHabit(id, row);
      if (habit) all.set(id, habit);
    }
    return all;
  });
  const empty: ReadonlyMap<string, number> = new Map();

  const model = computed(() => {
    const today = clock.day.value;
    const now = engine.now();
    const show = (habit: Habit): HabitView => ({
      id: habit.id,
      title: habit.title,
      days: habit.days,
      target: habit.target,
      remind: habit.remind,
      ...habitDays(habit, checkins.value.counts.get(habit.id) ?? empty, today),
    });
    const all = [...habits.value.values()];
    const alive = all.filter((habit) => habit.deleted === null).sort(byOrder);
    const list = alive.filter((habit) => habit.archived === null).map(show);
    const planned = list.filter((habit) => habit.today.planned);
    return {
      list,
      archived: alive.filter((habit) => habit.archived !== null).map(show),
      deleted: all
        .filter((habit) => habit.deleted !== null && now - habit.deleted < KEPT_MS)
        .sort((a, b) => b.deleted! - a.deleted! || byOrder(a, b))
        .map(show),
      today: { done: planned.filter((habit) => habit.today.done).length, planned: planned.length },
    };
  });

  const habit = (id: string) => habits.peek().get(id);

  return {
    list: computed(() => model.value.list),
    archived: computed(() => model.value.archived),
    deleted: computed(() => model.value.deleted),
    today: computed(() => model.value.today),

    week() {
      void clock.day.value;
      const listed = new Set(model.value.list.map((view) => view.id));
      const now = engine.now();
      const today = clock.now();
      // Fourteen days of check-ins at most are looked at here, whatever the year holds.
      const mine = new Map<string, CheckIn[]>();
      for (let back = 0; back < 14; back++) {
        const day = addDays(today, -back);
        const list = checkins.value.byDay.get(day);
        if (list) mine.set(day, list.filter((checkin) => listed.has(checkin.habit)));
      }
      return weekAgainst(mine, today, now);
    },

    add(title, days, target) {
      const name = title.trim();
      if (!name) return null;
      const id = env.id();
      const last = [...habits.peek().values()].filter((other) => other.deleted === null).sort(byOrder).at(-1);
      engine.write('habit', id, { title: name, days: asDays(days) ?? 127, target: asTarget(target) ?? 1, order: keyBetween(last?.order || null, null) });
      return id;
    },

    edit(id, fields) {
      const held = habit(id);
      if (!held) return;
      const write: Record<string, unknown> = {};
      const title = fields.title?.trim();
      if (title) write.title = title;
      if (asDays(fields.days) !== null) write.days = fields.days;
      if (asTarget(fields.target) !== null) write.target = fields.target;
      if (fields.remind === null || asRemind(fields.remind) !== null) write.remind = fields.remind;
      if (fields.archived !== undefined && fields.archived !== (held.archived !== null)) write.archived = fields.archived ? engine.now() : null;
      if (Object.keys(write).length) engine.write('habit', id, write);
    },

    checkIn(id) {
      const held = habit(id);
      if (!held || held.deleted !== null) return null;
      // Its own row, under an id of its own: two devices that tap at once make two, and both count.
      const row = env.id();
      engine.write('checkin', row, { habit: id, day: clock.now(), at: engine.now() });
      return row;
    },

    undo(id) {
      const today = (checkins.peek().byDay.get(clock.now()) ?? []).filter((checkin) => checkin.habit === id);
      const latest = today.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1))[0];
      if (latest) engine.write('checkin', latest.id, { deleted: engine.now() });
    },

    remove(id) {
      if (habit(id)?.deleted === null) engine.write('habit', id, { deleted: engine.now() });
    },

    restore(id) {
      const held = habit(id);
      if (held && held.deleted !== null) engine.write('habit', id, { deleted: null });
    },

    move(id, before) {
      if (!habit(id)) return;
      // The list and the archive are both in key order, so one run of keys serves the two.
      const siblings = [...habits.peek().values()].filter((other) => other.deleted === null);
      // One turn, so one store transaction, also when a neighbour has to make room.
      batch(() => {
        for (const [row, order] of moveKeys(siblings, id, before)) engine.write('habit', row, { order });
      });
    },

    wake: clock.wake,
    close: clock.close,
    recomputed: () => passes,
  };
}
