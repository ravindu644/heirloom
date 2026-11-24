// The demo's Habits, Rooms and Settings: made-up data held in memory behind the real interfaces,
// so the three screens can be used and photographed with no server. A habit's week, record and
// streak are worked out by the real core/habits.ts; only the check-ins are made up. Not part of
// the build.

import { computed, signal } from '@preact/signals';
import { habitDays } from '../core/habits.ts';
import { addDays } from '../core/progress.ts';
import type { HabitView, Habits } from '../sync/habits.ts';
import type { MemberView, RoomResult, RoomView, Rooms } from '../sync/rooms.ts';
import type { Mark, Settings, SettingsView } from '../sync/settings.ts';
import { DAY } from './demo-today.ts';

const MIN = 60000;
const HOUR = 60 * MIN;

export interface DemoHabit {
  id: string;
  title: string;
  days?: number;
  target?: number;
  remind?: string;
  /** Check-ins by day. */
  counts: Record<string, number>;
  archived?: boolean;
  deleted?: boolean;
}

/** `n` days done up to yesterday, leaving out those `skip` days back; today's own count is `today`. */
const ran = (n: number, today = 0, skip: number[] = [], each = 1): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (let back = 1; back <= n; back++) if (!skip.includes(back)) counts[addDays(DAY, -back)] = each;
  if (today) counts[DAY] = today;
  return counts;
};

// The habits of the mockup, and one that is counted through the day.
export const HABITS: DemoHabit[] = [
  { id: 'read', title: 'Read 10 pages of K&R', counts: ran(8, 1), remind: '21:30' },
  { id: 'commit', title: 'Push one commit', counts: ran(30, 0, [5, 12, 13, 14, 15, 20]) },
  { id: 'phone', title: 'Phone in the other room for the first lap', counts: ran(3, 1) },
  { id: 'walk', title: 'Walk after lunch', days: 0b0011111, counts: ran(20, 1, [3, 9]) },
  { id: 'water', title: 'A glass of water', target: 3, counts: { ...ran(6, 2, [4], 3), [addDays(DAY, -2)]: 1 } },
  { id: 'lights', title: 'Lights out by 00:30', counts: ran(1) },
  { id: 'old', title: 'Duolingo, one lesson', counts: ran(40, 0, [1, 2, 3, 4, 5, 6]), archived: true },
  { id: 'gone', title: 'Cold shower', counts: ran(4, 0, [1]), deleted: true },
];
export const MANY_HABITS: DemoHabit[] = [
  { id: 'long', title: 'Write down the one thing that went wrong in the last lap before starting the next one, even when nothing did', days: 0b0010101, counts: ran(9, 1, [2]) },
  ...['Read 10 pages of K&R', 'Push one commit', 'Stretch', 'Walk after lunch', 'Anki, 20 cards', 'Tidy the desk', 'Call home', 'Sinhala, one page', 'Lights out by 00:30'].map(
    (title, i): DemoHabit => ({ id: `h${i}`, title, counts: ran(5 + i * 3, i % 2, [i + 2]), target: i === 4 ? 2 : 1 }),
  ),
];

export function demoHabits(seed: DemoHabit[], week: { now: number; before: number }): Habits {
  const all = signal(seed);
  let ids = 0;
  const change = (id: string, fields: Partial<DemoHabit>) => void (all.value = all.value.map((habit) => (habit.id === id ? { ...habit, ...fields } : habit)));
  const view = (habit: DemoHabit): HabitView => {
    const days = habit.days ?? 127;
    const target = habit.target ?? 1;
    return { id: habit.id, title: habit.title, days, target, remind: habit.remind ?? null, ...habitDays({ days, target }, new Map(Object.entries(habit.counts)), DAY) };
  };
  const bump = (id: string, by: number) => {
    const habit = all.value.find((one) => one.id === id);
    if (!habit) return;
    const count = Math.max(0, (habit.counts[DAY] ?? 0) + by);
    change(id, { counts: Object.fromEntries(Object.entries({ ...habit.counts, [DAY]: count }).filter(([, n]) => n > 0)) });
    tapped.value += by;
  };
  const tapped = signal(0);
  const list = computed(() => all.value.filter((habit) => !habit.archived && !habit.deleted).map(view));
  return {
    list,
    archived: computed(() => all.value.filter((habit) => habit.archived && !habit.deleted).map(view)),
    deleted: computed(() => all.value.filter((habit) => habit.deleted).map(view)),
    today: computed(() => {
      const planned = list.value.filter((habit) => habit.today.planned);
      return { done: planned.filter((habit) => habit.today.done).length, planned: planned.length };
    }),
    week: () => ({ now: week.now + tapped.value, before: week.before }),
    add(title, days, target) {
      if (!title.trim()) return null;
      const id = `new-${++ids}`;
      all.value = [...all.value, { id, title: title.trim(), days, target, counts: {} }];
      return id;
    },
    edit: (id, fields) => change(id, { ...fields, title: fields.title?.trim() || all.value.find((habit) => habit.id === id)?.title, remind: fields.remind ?? undefined } as Partial<DemoHabit>),
    checkIn(id) {
      bump(id, 1);
      return `in-${++ids}`;
    },
    undo: (id) => bump(id, -1),
    remove: (id) => change(id, { deleted: true }),
    restore: (id) => change(id, { deleted: false }),
    move(id, before) {
      const moving = all.value.find((habit) => habit.id === id)!;
      const rest = all.value.filter((habit) => habit.id !== id);
      const at = before === null ? rest.length : rest.findIndex((habit) => habit.id === before);
      all.value = [...rest.slice(0, at), moving, ...rest.slice(at)];
    },
    wake() {},
  };
}

export interface DemoRoom {
  /** None, one room, or two to move between. */
  rooms?: 'none' | 'one' | 'two';
  /** Who is in it: just you, the four of the mockup, or eight. */
  members?: 'alone' | 'four' | 'eight';
  name?: string;
  ranked?: boolean;
  stale?: boolean;
  target?: number;
  /** Who cheered your latest lap, for the Focus result. */
  cheered?: string[];
}

const member = (id: string, name: string, more: Partial<MemberView> = {}): MemberView => ({
  id,
  name,
  you: false,
  away: false,
  phase: 'idle',
  lap: 1,
  ends_at: null,
  paused: false,
  task: null,
  today_ms: 0,
  today_laps: 0,
  week_ms: 0,
  last: null,
  ...more,
});

export function demoRooms(seed: DemoRoom, now: () => number, prefs: { all: { value: SettingsView }; set(fields: Partial<SettingsView>): boolean }): Rooms {
  const at = now();
  const lap = (n: number, ago: number, cheers: string[] = []) => ({ run: `run-${n}`, ended: at - ago * MIN, cheers, cheered: cheers.includes('me') });
  const you = member('me', 'ravi', {
    you: true,
    phase: 'work',
    lap: 2,
    ends_at: at + 18 * MIN + 42000,
    task: 'K&R 5.1 to 5.5: pointers and arrays',
    today_ms: 125 * MIN,
    today_laps: 5,
    week_ms: 325 * MIN,
    last: lap(1, 9, ['sachi']),
  });
  const four = [
    you,
    member('sachi', 'sachi', { phase: 'work', lap: 3, ends_at: at + 11 * MIN + 5000, task: 'Linked lists: insert and delete', today_ms: 75 * MIN, today_laps: 3, week_ms: 6 * HOUR, last: lap(2, 14) }),
    member('dilan', 'dilan', { phase: 'short', lap: 4, ends_at: at + 3 * MIN + 20000, today_ms: 100 * MIN, today_laps: 4, week_ms: 4 * HOUR + 10 * MIN, last: lap(3, 2, ['me', 'sachi']) }),
    member('amaya', 'amaya', { away: true, today_ms: 50 * MIN, today_laps: 2, week_ms: 2 * HOUR + 5 * MIN }),
  ];
  const eight = [
    ...four.slice(0, 3),
    member('long', 'kavindu', {
      phase: 'work',
      lap: 1,
      ends_at: at + 24 * MIN,
      task: 'Operating systems: three easy pieces, chapter 26, concurrency and threads, with every homework question at the end worked through on paper',
      today_ms: 25 * MIN,
      today_laps: 1,
      week_ms: 3 * HOUR,
      last: lap(4, 30),
    }),
    member('nethmi', 'nethmi', { phase: 'work', lap: 2, paused: true, today_ms: 60 * MIN, today_laps: 2, week_ms: 5 * HOUR }),
    member('isuru', 'isuru_the_night_owl_of_block_c', { phase: 'long', lap: 4, ends_at: at + 11 * MIN, today_ms: 200 * MIN, today_laps: 8, week_ms: 9 * HOUR, last: lap(5, 4) }),
    member('tharu', 'tharu', { today_ms: 0, today_laps: 0, week_ms: 45 * MIN }),
    four[3]!,
  ];
  const members = seed.members === 'alone' ? [{ ...you, last: lap(1, 9) }] : seed.members === 'eight' ? eight : four;
  const room = (id: string, name: string, people: MemberView[], target: number): RoomView => ({
    id,
    name,
    code: id === 'r1' ? 'K7QW3RXM' : 'P4HN8TDC',
    target_ms: target * HOUR,
    week_ms: people.reduce((sum, m) => sum + m.week_ms, 0),
    ranked: seed.ranked ?? false,
    members: seed.ranked ? people.toSorted((a, b) => b.week_ms - a.week_ms) : people,
  });
  const list = signal<RoomView[]>(
    seed.rooms === 'none'
      ? []
      : [room('r1', seed.name ?? 'Second years', members, seed.target ?? 20), ...(seed.rooms === 'two' ? [room('r2', 'Sachi and me', four.slice(0, 2), 0)] : [])],
  );
  const stale = signal(seed.stale ?? false);
  // The demo's server: a little late, and it refuses what the real one would. A name or code that
  // is an error's code gets that error, so each sentence can be read.
  const answer = async (word: string, then: () => RoomResult): Promise<RoomResult> => {
    await new Promise((done) => setTimeout(done, 300));
    if (stale.value) return { ok: false, error: 'offline' };
    if (['code', 'full', 'slow_down', 'room'].includes(word.toLowerCase())) return { ok: false, error: word.toLowerCase() };
    return then();
  };
  const change = (id: string, with_: (room: RoomView) => RoomView) => void (list.value = list.value.map((one) => (one.id === id ? with_(one) : one)));
  return {
    list,
    stale,
    hidden: computed(() => prefs.all.value.rooms_hidden),
    shareTask: computed(() => prefs.all.value.share_task),
    cheered: signal(seed.cheered ?? []),
    create: (name) =>
      answer(name, () => {
        list.value = [...list.value, room(`r${list.value.length + 3}`, name, [{ ...you, last: null }], 0)];
        return { ok: true, room: list.value.at(-1)!.id };
      }),
    join: (code) =>
      answer(code, () => {
        list.value = [...list.value, room(`r${list.value.length + 3}`, 'Sachi and me', four.slice(0, 2), 0)];
        return { ok: true, room: list.value.at(-1)!.id };
      }),
    leave: (id) =>
      answer('', () => {
        list.value = list.value.filter((one) => one.id !== id);
        return { ok: true };
      }),
    update: (id, fields) =>
      answer(fields.name ?? '', () => {
        change(id, (one) => ({ ...one, ...fields, members: fields.ranked ? one.members.toSorted((a, b) => b.week_ms - a.week_ms) : one.members }));
        return { ok: true };
      }),
    cheer: (id, to) =>
      change(id, (one) => ({ ...one, members: one.members.map((m) => (m.id === to && m.last && !m.you ? { ...m, last: { ...m.last, cheers: [...m.last.cheers, 'me'], cheered: true } } : m)) })),
    setHidden: (rooms_hidden) => void prefs.set({ rooms_hidden }),
    setShareTask: (share_task) => void prefs.set({ share_task }),
  };
}

export function demoSettings(seed: Partial<SettingsView>, marks: Mark[]): Settings {
  const all = signal<SettingsView>({
    work_ms: 25 * MIN,
    short_ms: 5 * MIN,
    long_ms: 15 * MIN,
    auto_break: false,
    auto_work: false,
    sound: 'bell',
    celebrate: true,
    day_target: 8,
    share_task: false,
    rooms_hidden: false,
    ...seed,
  });
  const ringHere = signal(true);
  const shown = signal(marks);
  return {
    all,
    set(fields) {
      all.value = { ...all.value, ...fields };
      return true;
    },
    ringHere,
    setRingHere: (ring) => void (ringHere.value = ring),
    marks: computed(() => (all.value.celebrate ? shown.value : [])),
    seen: () => void (shown.value = []),
    exportAll: () => JSON.stringify({ heirloom: 1, exported: Date.now(), account: 'ravi', cells: [] }),
    // The real rules for what is refused; the count of what came in is made up.
    importAll(text) {
      let copy: { heirloom?: unknown; cells?: unknown };
      try {
        copy = JSON.parse(text);
      } catch {
        return { ok: false, error: 'not_json' };
      }
      if (copy?.heirloom !== 1 || !Array.isArray(copy.cells)) return { ok: false, error: 'not_heirloom' };
      return copy.cells.length === 0 ? { ok: false, error: 'empty' } : { ok: true, cells: 214 };
    },
  };
}
