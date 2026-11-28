// The demo's Progress: twelve believable weeks held in memory, the same ones the reference
// pictures were drawn from, run through the real rules of core/progress.ts. Only the history is
// made up; the streak, the year, the bests and the week are worked out as the app works them out.
// Not part of the build.

import { computed, signal } from '@preact/signals';
import { addDays, bests, since, streakView, weekRace } from '../core/progress.ts';
import type { Days } from '../core/progress.ts';
import type { DayView, Estimates, Moment, Progress, ProjectShare, TimelineEntry } from '../sync/progress.ts';
import type { ProjectView } from '../sync/today.ts';
import { DAY, PROJECTS } from './demo-today.ts';

const MIN = 60000;
const LAP = 25 * MIN;

export interface DemoRecord {
  /** How long the record is: a year, twelve weeks, this week only, or today only. */
  history?: 'year' | 'weeks' | 'week' | 'day' | 'none';
  /** Minutes of focus today before the lap in progress. */
  today?: number;
  /** Last week's Tuesday up to this time of day, in minutes. */
  ghostByNow?: number;
  /** Days to empty, on top of the rest days the record has: three in one week is a miss. */
  empty?: string[];
  /** Days to fill, so the last fortnight has no rest day. */
  fill?: string[];
  projects?: 'usual' | 'long' | 'many' | 'none';
  estimates?: boolean;
  /** Estimates for someone who has guessed only this week, with a task that repeats daily done twice and a lap stopped at 15 minutes. */
  firstGuesses?: boolean;
  note?: string;
  /** False: today's timeline is plain laps, not the scripted one with a break, a lap set aside, a stopped lap and a pair on two devices. */
  scripted?: boolean;
  /** How the lap in progress stands, when one runs: counting (the default) or held. */
  live?: 'running' | 'paused';
  /** Pinned rest days, as `settings.rest_days` holds them. */
  rest?: number;
  /** A lap from 23:46 the day before to 00:32 today, on both days' timelines. */
  midnight?: boolean;
  /** Today as one of two written days: the user's own (a lap from before midnight, a break, a stopped lap, a task done) or a full one (nine laps, one not counted, tasks done). */
  script?: 'real' | 'full' | 'long';
}

// The reference's days: the ones its words talk about are fixed, the rest come from the same
// seeded generator, so the totals here are the totals in the pictures.
function history(from = '2026-09-07', first = '2026-09-14'): Record<string, number> {
  const fixed: Record<string, number> = {
    '2026-11-10': 0, '2026-11-11': 0, '2026-11-12': 100, '2026-11-13': 150, '2026-11-14': 225, '2026-11-15': 50,
    '2026-11-16': 150, '2026-11-17': 200, '2026-11-18': 100, '2026-11-19': 0,
    '2026-11-20': 175, '2026-11-21': 250, '2026-11-22': 75,
    '2026-11-23': 200,
  };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const minutes: Record<string, number> = {};
  for (let i = 0; ; i++) {
    const day = addDays(from, i);
    if (day >= DAY) break;
    // The generator is stepped for the first week too, as the reference's is, and its days dropped.
    if (day < first) continue;
    if (day in fixed) minutes[day] = fixed[day]!;
    else {
      const r = rnd();
      const m = Math.round(1 + rnd() * 8 + (Math.min(i, 84) / 84) * 3) * 25;
      // The reference's rule was one rest day a week; the real one allows two. A third empty day
      // in a week would be a miss, and the plain record has none: it becomes a day of one lap.
      const week = Math.floor(i / 7);
      const empties = Object.entries(minutes).filter(([d, v]) => v === 0 && Math.floor((Date.parse(d) - Date.parse(from)) / 604800000) === week).length;
      minutes[day] = r < 0.18 ? (empties < 2 ? 0 : 25) : m;
    }
  }
  return minutes;
}

// A session as the demo writes it; what it gave the day is worked out by `dayOf`.
type Raw = Omit<TimelineEntry, 'day_ms' | 'split_ms' | 'off_ms' | 'began' | 'ends'>;

/**
 * A day as the core's `day()` gives it, from its sessions and moments: each counted lap's part
 * inside the day, less what laps before it already covered, and the running total after it.
 */
function dayOf(day: string, raw: Raw[], moments: Moment[]): DayView {
  const start = at(day, 0, 0);
  const end = at(addDays(day, 1), 0, 0);
  const counted = (entry: Raw) => entry.kind === 'work' && entry.outcome !== 'void';
  // The length of the union of some laps' parts inside the day: what the day would lose without one is the union less the union of the rest.
  const union = (list: Raw[]) => {
    let sum = 0;
    let reach = start;
    for (const one of [...list].sort((a, b) => a.started - b.started)) {
      const to = Math.min(one.ended, end);
      sum += Math.max(0, to - Math.max(one.started, reach));
      reach = Math.max(reach, to);
    }
    return sum;
  };
  const all = raw.filter(counted);
  let covered = start;
  let split = 0;
  let laps = 0;
  const sessions = [...raw]
    .sort((a, b) => a.started - b.started)
    .map((entry): TimelineEntry => {
      const counts = entry.kind === 'work' && entry.outcome !== 'void';
      const from = Math.max(entry.started, start, covered);
      const to = Math.min(entry.ended, end);
      const day_ms = counts ? Math.max(0, to - from) : 0;
      if (counts) {
        covered = Math.max(covered, to);
        split += day_ms;
        if (!entry.live && entry.ended <= end) laps++;
      }
      return {
        ...entry,
        day_ms,
        split_ms: counts ? split : null,
        off_ms: counts ? union(all) - union(all.filter((one) => one !== entry)) : 0,
        began: entry.started < start ? { day: addDays(day, -1), ms: counts ? start - entry.started : 0 } : null,
        ends: entry.ended > end ? { day: addDays(day, 1), ms: counts ? entry.ended - end : 0 } : null,
      };
    });
  const when = (item: TimelineEntry | Moment) => ('at' in item ? item.at : item.started);
  return { day, focus_ms: split, laps, items: [...sessions, ...moments].sort((a, b) => when(a) - when(b)) };
}

const NO_GUESSES: Estimates = { ratio: null, tasks: [], weeks: Array.from({ length: 8 }, (_, i) => ({ monday: addDays('2026-11-23', (i - 7) * 7), ratio: null })) };
const at = (day: string, hour: number, minute: number) => new Date(`${day}T00:00:00`).getTime() + (hour * 60 + minute) * MIN;
const project = (id: string) => PROJECTS.find((p) => p.id === id)!;

export function demoProgress(record: DemoRecord, lapNow: () => number): Progress {
  const kind = record.history ?? 'weeks';
  const minutes = kind === 'weeks' ? history() : kind === 'year' ? history('2025-11-17', '2025-11-17') : kind === 'week' ? { '2026-11-23': 200 } : {};
  for (const day of record.empty ?? []) minutes[day] = 0;
  for (const day of record.fill ?? []) minutes[day] = 100;
  const todayMin0 = record.today ?? (kind === 'none' ? 0 : 125);
  // Today and the day before are counted from their sessions, as the panel counts them, so the
  // year, the week and the day never give two answers; a lap taken out of the count or put back
  // moves them all, which is what a screen has to stand still under. Older days are laps from nine.
  const days = (): Days => {
    const out: Days = {};
    for (const [day, m] of Object.entries(minutes)) if (m > 0) out[day] = { focus_ms: m * MIN, laps: Math.floor(m / 25) };
    for (const day of [addDays(DAY, -1), DAY]) {
      const view = dayView(day);
      if (view.focus_ms > 0) out[day] = { focus_ms: view.focus_ms, laps: view.laps };
      else delete out[day];
    }
    return out;
  };

  // A day is kept by a lap that rang.
  const kept = () => new Set(Object.entries(days()).filter(([, day]) => day.laps > 0).map(([day]) => day));

  // Today as it ran. A lap set aside, a lap stopped at twelve minutes, and the phone and the
  // laptop running at once after lunch.
  const lap = (id: string, h: number, m: number, more: Partial<Raw> = {}): Raw => ({
    id,
    kind: 'work',
    outcome: 'rang',
    started: at(DAY, h, m),
    ended: at(DAY, h, m) + LAP,
    ran_ms: LAP,
    task: { id: 'kr', title: 'K&R 5.1 to 5.5: pointers and arrays' },
    project: project('c'),
    overlap: false,
    row: 0,
    ...more,
  });
  const rest = (id: string, h: number, m: number, long = false): Raw => ({
    id,
    kind: long ? 'long' : 'short',
    outcome: 'rang',
    started: at(DAY, h, m),
    ended: at(DAY, h, m) + (long ? 15 : 5) * MIN,
    ran_ms: (long ? 15 : 5) * MIN,
    task: null,
    project: null,
    overlap: false,
    row: 0,
  });
  const maths = { task: { id: 'maths', title: 'Discrete maths, tutorial sheet 6' }, project: project('uni') };
  const scripted = signal<Raw[]>([
    lap('a', 10, 20, maths),
    rest('b', 10, 45),
    lap('c', 10, 50, maths),
    rest('d', 11, 15),
    lap('e', 11, 20, { outcome: 'void', task: null, project: null }),
    lap('f', 11, 50),
    rest('g', 12, 15, true),
    lap('h', 14, 0, { outcome: 'stopped', ended: at(DAY, 14, 12), ran_ms: 12 * MIN, task: { id: 'react', title: 'Thinking in React, steps 1 to 3' }, project: project('react') }),
    lap('i', 15, 30, { overlap: true }),
    lap('j', 15, 40, { overlap: true, row: 1, task: { id: 'react', title: 'Thinking in React, steps 1 to 3' }, project: project('react') }),
    lap('k', 16, 10),
    rest('l', 16, 35),
  ]);
  // Any other day: its laps from nine, a short break after each.
  const plain = (day: string): Raw[] =>
    Array.from({ length: Math.floor((day === DAY ? todayMin0 : (minutes[day] ?? 0)) / 25) }, (_, i) => [
      { ...lap(`${day}-${i}`, 9, 0), started: at(day, 9, i * 30), ended: at(day, 9, i * 30) + LAP },
      { ...rest(`${day}-${i}r`, 9, 0), started: at(day, 9, i * 30 + 25), ended: at(day, 9, i * 30 + 30) },
    ]).flat();

  // All time is made up from the week: about nine weeks of the same.
  const share = (p: ProjectView | null, now: number, n: number, before: number): ProjectShare => ({ project: p, focus_ms: now * MIN, laps: n, before_ms: before * MIN, all_ms: (now * 9 + before) * MIN });
  const shares: Record<string, ProjectShare[]> = {
    usual: [share(project('c'), 375, 15, 300), share(project('react'), 275, 11, 250), share(project('uni'), 175, 7, 225), share(project('next'), 100, 4, 100)],
    long: [share({ id: 'long', name: 'Operating systems: three easy pieces, the reading group', color: 'heat-2' }, 375, 15, 300), share(project('react'), 275, 11, 0), share(null, 50, 2, 75)],
    many: [
      ...['C', 'React', 'Uni', 'Next.js', 'Rust', 'Linear algebra', 'Sinhala', 'Chess'].map((name, i) =>
        share({ id: name, name, color: (['you', 'ink', 'rest', 'ghost', 'heat-2'] as const)[i % 5]! }, 375 - i * 45, 15 - i * 2, 300 - i * 30),
      ),
      share(null, 25, 1, 0),
    ],
    none: [],
    week: [share(project('c'), 200, 8, 0), share(project('uni'), 125, 5, 0)],
  };
  const guesses: Estimates = record.estimates === false
    ? NO_GUESSES
    : record.firstGuesses
      ? {
          ratio: 1,
          weeks: NO_GUESSES.weeks.map((week, i) => ({ ...week, ratio: i === 7 ? 1 : null })),
          tasks: [
            { id: 'm2', title: 'Morning routine', estimate: 1, laps: 1, squares: [0.6], day: DAY },
            { id: 'm1', title: 'Morning routine', estimate: 1, laps: 1, squares: [1], day: '2026-11-23' },
          ],
        }
      : {
        ratio: 1.3,
        // Eight weeks, getting closer; one with no task done that had a guess.
        weeks: [1.9, 1.7, 1.8, null, 1.5, 1.6, 1.4, 1.3].map((ratio, i) => ({ monday: addDays('2026-11-23', (i - 7) * 7), ratio })),
        tasks: [
          { id: 'maths', title: 'Discrete maths, tutorial sheet 6', estimate: 2, laps: 2, squares: [1, 0.6], day: DAY },
          { id: 'e1', title: 'K&R chapter 4: functions and program structure', estimate: 4, laps: 6, squares: [1, 1, 1, 1, 1, 1], day: '2026-11-20' },
          { id: 'e2', title: 'React: the tic-tac-toe tutorial', estimate: 3, laps: 3, squares: [1, 1, 1], day: '2026-11-18' },
          { id: 'e3', title: 'Set up a C toolchain', estimate: 1, laps: 3, squares: [1, 0.3, 1], day: '2026-11-13' },
          { id: 'e4', title: 'Lecture notes, week 9', estimate: 2, laps: 1, squares: [1], day: '2026-11-03' },
        ],
      };
  const note = signal((record.note ?? '').slice(0, 280));
  // What a tap in the timeline made of a lap, on any day, over what the day was written with.
  const turned = signal(new Map<string, TimelineEntry['outcome']>());
  // The lap in progress, after the scripted day's last break, as far as it has run: no row yet, so the core says it is live.
  const open = (): Raw[] => (lapNow() > 0 ? [lap('run', 16, 40, { outcome: 'stopped', ended: at(DAY, 16, 40) + lapNow(), ran_ms: lapNow(), live: record.live ?? 'running' })] : []);
  const late = { ...lap('late', 0, 0), started: at(addDays(DAY, -1), 23, 46), ended: at(DAY, 0, 32), ran_ms: 46 * MIN };
  // The user's own day, from the screenshot they sent, and a full one from the drawing.
  const html = { task: { id: 'html', title: 'HTML refresh: a well structured page' }, project: null };
  const routine = { task: { id: 'routine', title: 'Morning routine' }, project: null };
  const ttt = { task: { id: 'ttt', title: 'Tic-tac-toe in React' }, project: project('react') };
  const notes = { task: { id: 'notes', title: 'Lecture notes, week 10' }, project: project('uni') };
  const scripts: Record<'real' | 'full' | 'long', { sessions: Raw[]; moments: Moment[] }> = {
    real: {
      sessions: [
        { ...lap('r1', 0, 0, html), started: at(addDays(DAY, -1), 23, 46), ended: at(DAY, 0, 31), ran_ms: 45 * MIN },
        rest('r2', 0, 39),
        lap('r3', 11, 3, { ...routine, outcome: 'stopped', ended: at(DAY, 11, 19), ran_ms: 16 * MIN }),
      ],
      moments: [{ kind: 'done', id: 'routine', at: at(DAY, 11, 19), title: 'Morning routine' }],
    },
    full: {
      sessions: [
        lap('f1', 8, 10, ttt), rest('f1r', 8, 35),
        lap('f2', 8, 40, ttt), rest('f2r', 9, 5),
        lap('f3', 9, 10, ttt), rest('f3r', 9, 35, true),
        lap('f4', 10, 30, ttt), rest('f4r', 10, 55),
        lap('f5', 11, 0, ttt),
        lap('f6', 12, 40, { outcome: 'void', task: null, project: null, ended: at(DAY, 12, 52), ran_ms: 12 * MIN }),
        lap('f7', 14, 0, notes), rest('f7r', 14, 25),
        lap('f8', 14, 30, { ...notes, outcome: 'stopped', ended: at(DAY, 14, 41), ran_ms: 11 * MIN }),
        lap('f9', 15, 10, notes), rest('f9r', 15, 35),
      ],
      moments: [
        { kind: 'done', id: 'ttt', at: at(DAY, 11, 26), title: 'Tic-tac-toe in React' },
        { kind: 'done', id: 'notes', at: at(DAY, 15, 36), title: 'Lecture notes, week 10' },
      ],
    },
    // Thirty laps from six, a break after each: 12h 30m, the widest split a day draws.
    long: { sessions: Array.from({ length: 30 }, (_, i) => [lap(`l${i}`, 6, i * 30, ttt), rest(`l${i}r`, 6, i * 30 + 25)]).flat(), moments: [] },
  };
  // The usual demo day finishes one task between its laps.
  const usual: Moment[] = [{ kind: 'done', id: 'maths', at: at(DAY, 11, 16), title: 'Discrete maths, tutorial sheet 6' }];
  const raw = (day: string): Raw[] =>
    [
      ...(record.midnight && day === DAY ? [late] : []),
      // A day given only its minutes is laps from nine; otherwise today is the written one.
      ...(day === DAY && record.script ? scripts[record.script].sessions : day === DAY && record.scripted !== false && record.today === undefined ? scripted.value : plain(day)),
      ...(day === DAY && record.scripted !== false ? open() : []),
      ...(record.midnight && day === addDays(DAY, -1) ? [late] : []),
    ].map((entry) => ({ ...entry, outcome: turned.value.get(entry.id) ?? entry.outcome }));
  const moments = (day: string) => (day !== DAY ? [] : record.script ? scripts[record.script].moments : record.scripted !== false ? usual : []);
  const dayView = (day: string) => dayOf(day, raw(day), moments(day));
  const timeline = (day: string) => dayView(day).items.filter((item): item is TimelineEntry => !('at' in item));
  const turn = (id: string, to: 'void' | null) => {
    const entry = timeline(DAY).find((one) => one.id === id);
    turned.value = new Map(turned.value).set(id, to ?? (entry && entry.ran_ms < LAP ? 'stopped' : 'rang'));
  };

  return {
    week: () => weekRace(days(), DAY, dayView(DAY).focus_ms, (record.ghostByNow ?? 200) * MIN),
    projects: () => (kind === 'none' || kind === 'day' ? [] : shares[record.projects ?? (kind === 'week' ? 'week' : 'usual')]!),
    today: signal(DAY),
    note: (day) => (day === DAY ? note.value : day === '2026-11-17' ? 'Arrays decay to pointers. Wrote that on my hand.' : ''),
    streak: computed(() => streakView(kept(), DAY, record.rest)),
    since: computed(() => since(days(), kept(), DAY, record.rest)),
    bests: computed(() => bests(days())),
    estimates: signal(kind === 'weeks' || kind === 'year' ? guesses : NO_GUESSES),
    day: dayView,
    setAside: (id) => turn(id, 'void'),
    countAgain: (id) => turn(id, null),
    setNote: (_day, text) => void (note.value = text.slice(0, 280)),
    wake() {},
  };
}
