// What the Habits screen is given. The lead wrote this interface so the ui lane and the core
// lane could build to it at the same time; the core lane fills in createHabits.
// Rules: contracts/protocol.md section 14, and section 8 for the streak.

import { batch, computed } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { asCheckIn, asDays, asHabit, asRemind, asReminds, asTarget, habitDays, weekAgainst } from '../core/habits.ts';
import type { CheckIn, Habit, HabitDay } from '../core/habits.ts';
import { stampMs } from '../core/hlc.ts';
import { newer } from '../core/merge.ts';
import { GONE, KEPT_MS } from '../core/real.ts';
import { addDays } from '../core/progress.ts';
import { localDay } from '../core/stats.ts';
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
  /**
   * The reminder times, `07:30`, sorted, at most `target` of them. Place k (the first is 1) is
   * for the k-th check-in of the day: it is shown on a planned day only while `today.count` is
   * under k.
   */
  reminds: string[];
  /** The first of `reminds`, or null. Kept for what still reads one time: `main.tsx` and the habit sheet. */
  remind: string | null;
  /** Today's check-ins (`count`) and whether today is planned and done. */
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
  /** When it was deleted, in ms, or null while it is alive. It goes for good 30 days after. */
  deleted: number | null;
}

export interface HabitEdit {
  title?: string;
  days?: number;
  target?: number;
  /** The whole list of reminder times. Sorted and cut at the target here; a list with an entry that is no time of day is ignored. */
  reminds?: string[];
  /** One time, or null for none: the same as a list of one or of none. `reminds` wins when both are given. */
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
  /** The local day, `2026-11-24`. It changes at midnight and on `wake()`. */
  readonly day: ReadonlySignal<string>;
  /** Check-ins this week so far and last week up to the same weekday and time. Call it on a tick. */
  week(): { now: number; before: number };

  /** A new habit at the end of the list. Returns its id, or null for an empty title. */
  add(title: string, days: number, target: number): string | null;
  edit(id: string, fields: HabitEdit): void;
  /** One check-in for today: one row, never a number changed. Returns the row's id. */
  checkIn(id: string): string | null;
  /** Takes back the latest check-in of today for this habit. */
  undo(id: string): void;
  /** To `deleted`, the shelf, for 30 days. */
  remove(id: string): void;
  restore(id: string): void;
  /** Deletes for good a habit that is on the shelf (`deleted`): on no screen again, and no way back. Anything else is left alone. */
  purge(id: string): void;
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

  // A build that knows only `remind` leaves the list alone when its person changes the time. So
  // a `remind` cell stamped after the `reminds` cell is that later edit, and is read in the
  // list's place: the last thing a person set is what every device reminds at. A device that
  // writes the list writes `remind` first, so its own pair never reads this way.
  function reminds(habit: Habit): string[] {
    const [one, list] = [engine.stamp('habit', habit.id, 'remind'), engine.stamp('habit', habit.id, 'reminds')];
    return one !== undefined && list !== undefined && newer(one, list) ? (habit.remind === null ? [] : [habit.remind]) : habit.reminds;
  }

  // The day a habit was made: its row holds no such time, so it is its oldest cell's stamp, the
  // first write. A row whose every field has been written again since reads as made then.
  function made(id: string): string | undefined {
    const ms = Object.keys(habitRows.value.get(id) ?? {}).map((field) => engine.stamp('habit', id, field)).filter((stamp) => stamp !== undefined).map((stamp) => stampMs(stamp));
    return ms.length ? localDay(Math.min(...ms), env.utcOffsetMin()) : undefined;
  }

  const model = computed(() => {
    const today = clock.day.value;
    const now = engine.now();
    const show = (habit: Habit): HabitView => ({
      id: habit.id,
      title: habit.title,
      days: habit.days,
      target: habit.target,
      reminds: reminds(habit),
      remind: reminds(habit)[0] ?? null,
      deleted: habit.deleted,
      ...habitDays(habit, checkins.value.counts.get(habit.id) ?? empty, today, made(habit.id)),
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
      const target = (write.target as number | undefined) ?? held.target;
      // The list as given, or the one time as a list of one or none. With neither, the list
      // there is, when a lowered target has made it too long.
      let times = fields.reminds === undefined ? undefined : (asReminds(fields.reminds) ?? undefined);
      const one = asRemind(fields.remind);
      if (fields.reminds === undefined && (fields.remind === null || one !== null)) times = one === null ? [] : [one];
      if (times === undefined && reminds(held).length > target) times = reminds(held);
      if (times !== undefined) {
        // `remind` first, so the list is the newer cell of the two (see `reminds` above). An older build still reminds once, at the first time.
        write.remind = times[0] ?? null;
        write.reminds = times.slice(0, target);
      }
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

    purge(id) {
      if (model.peek().deleted.some((held) => held.id === id)) engine.write('habit', id, { deleted: GONE });
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

    day: clock.day,
    wake: clock.wake,
    close: clock.close,
    recomputed: () => passes,
  };
}
