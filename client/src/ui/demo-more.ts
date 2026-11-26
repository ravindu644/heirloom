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
  /** A lap called for a few minutes from now: by a friend, by a friend with you in, or by you. */
  call?: 'theirs' | 'in' | 'mine';
  /** You are on a short break, not on the lap the four are drawn with. */
  onBreak?: boolean;
  /** Notes from others written since Notes was last open; and no notes at all. */
  newNotes?: number;
  noNotes?: boolean;
  /** Pictures for the friends who set one; `broken`, ones that fail to load. */
  pictures?: boolean | 'broken';
}

// A picture as a phone would make one, drawn from the tokens: a head and shoulders on a ground.
// The demo's only; a real one comes from the server by its hash.
const drawn = new Map<string, string>();
function picture(hash: string): string {
  const held = drawn.get(hash);
  if (held) return held;
  const tone = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const [ground, body, head] = [['--heat-1', '--rest', '--muted'], ['--raised', '--you', '--heat-3'], ['--heat-2', '--ink', '--heat-1'], ['--line', '--muted', '--heat-2']][hash.charCodeAt(1) % 4]!;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const pen = canvas.getContext('2d')!;
  pen.fillStyle = tone(ground!);
  pen.fillRect(0, 0, 96, 96);
  pen.fillStyle = tone(body!);
  pen.beginPath();
  pen.ellipse(48, 104, 40, 34, 0, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = tone(head!);
  pen.beginPath();
  pen.arc(48, 40, 20, 0, Math.PI * 2);
  pen.fill();
  const url = canvas.toDataURL();
  drawn.set(hash, url);
  return url;
}

const member = (id: string, name: string, more: Partial<MemberView> = {}): MemberView => ({
  id,
  name,
  you: false,
  picture: null,
  laps: [],
  runStart: null,
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
  // Laps of 25 minutes that began this many minutes ago.
  const ran = (...ago: number[]): [number, number][] => ago.map((m) => [at - m * MIN, at - m * MIN + 25 * MIN]);
  const pic = (id: string) => (seed.pictures ? (seed.pictures === 'broken' ? `x${id}` : `p${id}`) : null);
  const you = member('me', 'ravi', {
    you: true,
    picture: pic('me'),
    laps: ran(170, 140, 110, 80, 40),
    ...(seed.onBreak
      ? { phase: 'short' as const, ends_at: at + 2 * MIN + 58000 }
      : { phase: 'work' as const, ends_at: at + 18 * MIN + 42000, runStart: at - 6 * MIN - 18000 }),
    lap: 2,
    task: 'K&R 5.1 to 5.5: pointers and arrays',
    today_ms: 125 * MIN,
    today_laps: 5,
    week_ms: 325 * MIN,
    last: lap(1, 9, ['sachi']),
  });
  const four = [
    you,
    member('sachi', 'sachi', { picture: pic('sachi'), laps: ran(150, 120, 45), runStart: at - 14 * MIN, phase: 'work', lap: 3, ends_at: at + 11 * MIN + 5000, task: 'Linked lists: insert and delete', today_ms: 75 * MIN, today_laps: 3, week_ms: 6 * HOUR, last: lap(2, 14) }),
    member('dilan', 'dilan', { picture: pic('dilan'), laps: ran(200, 165, 95, 30), phase: 'short', lap: 4, ends_at: at + 3 * MIN + 20000, today_ms: 100 * MIN, today_laps: 4, week_ms: 4 * HOUR + 10 * MIN, last: lap(3, 2, ['me', 'sachi']) }),
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
  // The room's week, added up day by day: the demo's day is a Tuesday.
  const weekOf = (people: MemberView[]) => {
    const week = people.reduce((sum, m) => sum + m.week_ms, 0);
    const last = [5, 9.5, 14, 18, 21.5, 24, 27.5].map((h) => h * HOUR);
    return { days: [week * 0.45, week, null, null, null, null, null], last, ahead_ms: week - 8 * HOUR, you_ms: you.week_ms };
  };
  const call = () =>
    seed.call && {
      id: 'c1',
      by: seed.call === 'mine' ? who('me') : who('sachi'),
      at: Math.floor(at / MIN) * MIN + 8 * MIN,
      in: seed.call === 'mine' ? [who('me')] : seed.call === 'in' ? [who('sachi'), who('me')] : [who('sachi')],
      you: seed.call !== 'theirs',
      yours: seed.call === 'mine',
    };
  const notes = seed.noNotes
    ? []
    : [
        { id: 'n4', from: 'sachi', name: 'sachi', picture: pic('sachi'), you: false, at: at - 12 * MIN, text: 'Question 4 is the one with the enzyme graph.' },
        { id: 'n3', from: 'dilan', name: 'dilan', picture: pic('dilan'), you: false, at: at - 70 * MIN, text: 'Library closes at 18:00 today.' },
        { id: 'n2', from: 'me', name: 'ravi', picture: pic('me'), you: true, at: at - 3 * HOUR, text: 'Bringing my flashcards tomorrow.' },
        { id: 'n1', from: null, name: null, picture: null, you: false, at: at - 22 * HOUR, text: 'Out tomorrow morning, back after lunch.' },
      ];
  const room = (id: string, name: string, people: MemberView[], target: number): RoomView => ({
    id,
    name,
    week: weekOf(people),
    streak: { run: 12, marks: ['miss', 'kept', 'rest', 'kept', 'kept', 'kept', 'kept', 'kept', 'kept', 'rest', 'kept', 'kept', 'kept', 'open'] },
    call: call() || null,
    notes,
    newNotes: seed.newNotes ?? 0,
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
    remove: (id, gone) =>
      answer('', () => {
        change(id, (one) => ({ ...one, code: 'Q8ZR4TWE', members: one.members.filter((m) => m.id !== gone) }));
        return { ok: true };
      }),
    callLap: (id, when) =>
      answer('', () => {
        change(id, (one) => ({ ...one, call: when === null ? null : { id: 'c2', by: who('me'), at: when, in: [who('me')], you: true, yours: true } }));
        return { ok: true };
      }),
    setIn: (id, _call, isIn) =>
      answer('', () => {
        change(id, (one) => ({ ...one, call: one.call && { ...one.call, you: isIn, in: isIn ? [...one.call.in, who('me')] : one.call.in.filter((m) => m.id !== 'me') } }));
        return { ok: true };
      }),
    addNote: (id, text) =>
      answer(text, () => {
        change(id, (one) => ({ ...one, notes: [{ id: `n${one.notes.length + 9}`, from: 'me', name: 'ravi', picture: pic('me'), you: true, at: now(), text }, ...one.notes] }));
        return { ok: true };
      }),
    markNotesRead: (id) => change(id, (one) => ({ ...one, newNotes: 0 })),
    calledIn: signal([]),
    setPicture: () => answer('', () => ({ ok: true })),
    // A broken one is a picture the image cannot show: the initial stands in.
    picture: async (hash) => (hash.startsWith('x') ? 'data:image/webp;base64,AAAA' : picture(hash)),
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
