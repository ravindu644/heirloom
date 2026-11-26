// The demo's Habits, Rooms and Settings: made-up data held in memory behind the real interfaces,
// so the three screens can be used and photographed with no server. A habit's week, record and
// streak are worked out by the real core/habits.ts; only the check-ins are made up. Not part of
// the build.

import { computed, signal } from '@preact/signals';
import { habitDays } from '../core/habits.ts';
import { addDays } from '../core/progress.ts';
import type { AdminView, Admins } from '../sync/admins.ts';
import type { HabitView, Habits } from '../sync/habits.ts';
import type { InviteView, Invites } from '../sync/invites.ts';
import type { ResetView, Resets } from '../sync/resets.ts';
import type { MemberView, RoomResult, RoomView, Rooms } from '../sync/rooms.ts';
import type { ServerChoice, ServerRefusal } from '../sync/server.ts';
import type { Mark, Settings, SettingsView } from '../sync/settings.ts';
import { DAY } from './demo-today.ts';

const MIN = 60000;
const HOUR = 60 * MIN;
// When the demo's deleted habits went: two days back, so they are gone for good on 22 December.
const DELETED_AT = Date.parse('2026-11-22T10:00:00');

export interface DemoHabit {
  id: string;
  title: string;
  days?: number;
  target?: number;
  remind?: string;
  /** One time for each time a day it is done, in order. */
  reminds?: string[];
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

export function demoHabits(seed: DemoHabit[]): Habits {
  const all = signal(seed);
  let ids = 0;
  const change = (id: string, fields: Partial<DemoHabit>) => void (all.value = all.value.map((habit) => (habit.id === id ? { ...habit, ...fields } : habit)));
  const view = (habit: DemoHabit): HabitView => {
    const days = habit.days ?? 127;
    const target = habit.target ?? 1;
    return { id: habit.id, title: habit.title, days, target, reminds: habit.reminds ?? (habit.remind ? [habit.remind] : []), remind: habit.reminds?.[0] ?? habit.remind ?? null, deleted: habit.deleted ? DELETED_AT : null, ...habitDays({ days, target }, new Map(Object.entries(habit.counts)), DAY) };
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
    day: signal(DAY),
    archived: computed(() => all.value.filter((habit) => habit.archived && !habit.deleted).map(view)),
    deleted: computed(() => all.value.filter((habit) => habit.deleted).map(view)),
    today: computed(() => {
      const planned = list.value.filter((habit) => habit.today.planned);
      return { done: planned.filter((habit) => habit.today.done).length, planned: planned.length };
    }),
    // This week's check-ins so far, and last week's up to the same weekday: counted from the habits themselves.
    week() {
      void tapped.value;
      const monday = addDays(DAY, -((new Date(DAY).getUTCDay() + 6) % 7));
      const sum = (from: string, to: string) => all.value.filter((habit) => !habit.archived && !habit.deleted).reduce((n, habit) => n + Object.entries(habit.counts).reduce((m, [day, count]) => m + (day >= from && day <= to ? count : 0), 0), 0);
      return { now: sum(monday, DAY), before: sum(addDays(monday, -7), addDays(DAY, -7)) };
    },
    add(title, days, target) {
      if (!title.trim()) return null;
      const id = `new-${++ids}`;
      all.value = [...all.value, { id, title: title.trim(), days, target, counts: {} }];
      return id;
    },
    // One list of times, sorted, never longer than the times a day it is done: as the real one keeps it.
    edit(id, fields) {
      const held = all.value.find((habit) => habit.id === id)!;
      const target = fields.target ?? held.target ?? 1;
      const times = fields.reminds ?? (fields.remind === undefined ? (held.reminds ?? (held.remind ? [held.remind] : [])) : fields.remind === null ? [] : [fields.remind]);
      change(id, { ...fields, title: fields.title?.trim() || held.title, remind: undefined, reminds: [...times].sort().slice(0, target) } as Partial<DemoHabit>);
    },
    checkIn(id) {
      bump(id, 1);
      return `in-${++ids}`;
    },
    undo: (id) => bump(id, -1),
    remove: (id) => change(id, { deleted: true }),
    restore: (id) => change(id, { deleted: false }),
    purge: (id) => void (all.value = all.value.filter((habit) => habit.id !== id)),
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
  /** Who keeps the room: you (the default), a friend by name, or nobody named (an older server). */
  keeper?: 'you' | string | null;
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
  const who = (id: string) => ({ id, name: id === 'me' ? 'ravi' : id });
  const lap = (n: number, ago: number, cheers: string[] = []) => ({ run: `run-${n}`, ended: at - ago * MIN, cheers, cheered: cheers.includes('me'), cheerers: cheers.map(who) });
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
    keeper: seed.keeper === undefined || seed.keeper === 'you' ? 'ravi' : seed.keeper,
    youKeep: seed.keeper === undefined || seed.keeper === 'you' || seed.keeper === null,
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
      change(id, (one) => ({ ...one, members: one.members.map((m) => (m.id === to && m.last && !m.you ? { ...m, last: { ...m.last, cheers: [...m.last.cheers, 'me'], cheered: true, cheerers: [...m.last.cheerers, who('me')] } } : m)) })),
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

/** The phone app's server as the demo has it: an address, and one answer to whatever is typed. */
export interface DemoServer {
  address?: string;
  /** Why the next address is not taken. Left out, nothing answers. */
  refusal?: ServerRefusal;
  /** The question is never answered: the button stays busy. */
  busy?: boolean;
  /** The invite a pasted link carried in, held until it is used or refused. */
  held?: string;
}

export function demoServer(seed: DemoServer): ServerChoice {
  const address = seed.address ?? null;
  let held = seed.held ?? null;
  return {
    address,
    plain: !!address && address.startsWith('http://'),
    choose: (_typed) => new Promise((answer) => !seed.busy && setTimeout(() => answer(seed.refusal ?? 'unreachable'), 300)),
    heldInvite: () => held,
    forgetInvite: () => {
      held = null;
      console.info('demo: the held invite was let go');
    },
  };
}

const DAY_MS = 86400000;

/** Invite links held in memory. `'forbidden'` is an account that was an admin until a moment ago. */
export function demoInvites(seed: number | 'forbidden' | 'token', now: () => number): Invites {
  const origin = 'https://heirloom.example';
  let made = 0;
  const one = (invite: string, daysLeft: number): InviteView => ({ invite, link: `${origin}/#/join/${invite}`, created: now() - (7 - daysLeft) * DAY_MS, expires: now() + daysLeft * DAY_MS });
  const all = [one('k3J9xQ7mPa2f8Lw0', 6), one('Zt41bNc8RrV0e9Hd', 3), one('m0Qe77LsYpX2a4Ku', 1)];
  const open = signal<readonly InviteView[] | null | 'forbidden'>(seed === 'forbidden' ? 'forbidden' : all.slice(0, seed === 'token' ? 3 : seed));
  const list = () => (Array.isArray(open.value) ? (open.value as readonly InviteView[]) : []);
  const later = <T>(answer: T) => new Promise<T>((done) => setTimeout(() => done(answer), 200));
  return {
    open,
    refresh: async () => {},
    make() {
      // A device the server has signed out: every ask is refused with `token`.
      if (seed === 'token') return later({ ok: false, error: 'token' });
      const invite = one(['Hy6c2WfT9oDn5s1B', 'Qa8Lr3VxK7mE0jP4'][made++ % 2]!, 7);
      open.value = [...list(), invite];
      return later({ ok: true, invite });
    },
    renew(id) {
      const renewed = { ...list().find((invite) => invite.invite === id)!, expires: now() + 7 * DAY_MS };
      open.value = list().map((invite) => (invite.invite === id ? renewed : invite));
      return later({ ok: true, invite: renewed });
    },
    takeBack(id) {
      open.value = list().filter((invite) => invite.invite !== id);
      return later({ ok: true });
    },
  };
}

/**
 * The owner's reset links: `seed` open ones. A username that is nobody's here is `nobody_here`,
 * and `ravi`, the owner, is refused as the server refuses the owner. The page a link opens is
 * the engine's, passed in. Times are the real clock's, as the panel reads "until" against it.
 */
export function demoResets(seed: number, page: Pick<Resets, 'look' | 'use'>): Resets {
  const one = (username: string, hoursLeft: number): ResetView => ({ username, created: Date.now() - (24 - hoursLeft) * HOUR, expires: Date.now() + hoursLeft * HOUR });
  const open = signal<readonly ResetView[] | null>([one('dilan', 6), one('sachi', 20)].slice(0, seed));
  const later = <T>(answer: T) => new Promise<T>((done) => setTimeout(() => done(answer), 200));
  return {
    open,
    refresh: async () => {},
    create(username) {
      if (username === 'nobody_here') return later({ ok: false, error: 'unknown' });
      if (username === 'ravi') return later({ ok: false, error: 'bad_request' });
      const made = one(username, 24);
      const reset = 'q7XkVb3n0Pz8Lw2mRt5YcH1aJe9sKd4fUg6oNi0QxBy';
      open.value = [...open.value!.filter((it) => it.username !== username), made];
      return later({ ok: true, reset: { ...made, reset, link: `https://heirloom.example/#/reset/${reset}` } });
    },
    revoke(username) {
      open.value = open.value!.filter((it) => it.username !== username);
      return later({ ok: true });
    },
    ...page,
  };
}

/** The owner and whoever the owner has let invite. A username that is nobody's here is `nobody_here`. */
export function demoAdmins(seed: string[]): Admins {
  const list = signal<readonly AdminView[] | null>([{ username: 'ravi', role: 'owner' }, ...seed.map((username): AdminView => ({ username, role: 'admin' }))]);
  const later = <T>(answer: T) => new Promise<T>((done) => setTimeout(() => done(answer), 200));
  return {
    list,
    refresh: async () => {},
    raise(username) {
      if (username === 'nobody_here') return later({ ok: false, error: 'unknown' });
      if (username === 'ravi') return later({ ok: false, error: 'bad_request' });
      const admins = [...list.value!.slice(1).filter((one) => one.username !== username), { username, role: 'admin' as const }].sort((a, b) => a.username.localeCompare(b.username));
      list.value = [list.value![0]!, ...admins];
      return later({ ok: true });
    },
    lower(username) {
      list.value = list.value!.filter((one) => one.username !== username);
      return later({ ok: true });
    },
  };
}
