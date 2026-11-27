// The demo's Progress: twelve believable weeks held in memory, the same ones the reference
// pictures were drawn from, run through the real rules of core/progress.ts. Only the history is
// made up; the streak, the year, the bests and the week are worked out as the app works them out.
// Not part of the build.

import { computed, signal } from '@preact/signals';
import { addDays, bests, since, streakView, weekRace } from '../core/progress.ts';
import type { Days } from '../core/progress.ts';
import type { Estimates, Progress, ProjectShare, TimelineEntry } from '../sync/progress.ts';
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
  note?: string;
  /** False: today's timeline is plain laps, not the scripted one with a break, a lap set aside, a stopped lap and a pair on two devices. */
  scripted?: boolean;
  /** How the lap in progress stands, when one runs: counting (the default) or held. */
  live?: 'running' | 'paused';
  /** Pinned rest days, as `settings.rest_days` holds them. */
  rest?: number;
  /** A lap from 23:46 the day before to 00:32 today, on both days' timelines. */
  midnight?: boolean;
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

const NO_GUESSES: Estimates = { ratio: null, tasks: [], weeks: Array.from({ length: 8 }, (_, i) => ({ monday: addDays('2026-11-23', (i - 7) * 7), ratio: null })) };
const at = (day: string, hour: number, minute: number) => new Date(`${day}T00:00:00`).getTime() + (hour * 60 + minute) * MIN;
const project = (id: string) => PROJECTS.find((p) => p.id === id)!;

export function demoProgress(record: DemoRecord, lapNow: () => number): Progress {
  const kind = record.history ?? 'weeks';
  const minutes = kind === 'weeks' ? history() : kind === 'year' ? history('2025-11-17', '2025-11-17') : kind === 'week' ? { '2026-11-23': 200 } : {};
  for (const day of record.empty ?? []) minutes[day] = 0;
  for (const day of record.fill ?? []) minutes[day] = 100;
  // A lap taken out of the count or put back moves the day's total, as the real one does: the
  // figures above the timeline change with the tap, which is what a screen has to stand still under.
  const moved = signal(0);
  const todayMin0 = record.today ?? (kind === 'none' ? 0 : 125);
  const todayMin = () => Math.max(0, todayMin0 + moved.value);
  const days = (): Days => {
    const out: Days = {};
    for (const [day, m] of Object.entries(minutes)) if (m > 0) out[day] = { focus_ms: m * MIN, laps: Math.floor(m / 25) };
    if (todayMin() > 0) out[DAY] = { focus_ms: todayMin() * MIN, laps: Math.floor(todayMin() / 25) };
    return out;
  };

  // A day is kept by a lap that rang.
  const kept = () => new Set(Object.entries(days()).filter(([, day]) => day.laps > 0).map(([day]) => day));

  // Today as it ran. A lap set aside, a lap stopped at twelve minutes, and the phone and the
  // laptop running at once after lunch.
  const lap = (id: string, h: number, m: number, more: Partial<TimelineEntry> = {}): TimelineEntry => ({
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
  const rest = (id: string, h: number, m: number, long = false): TimelineEntry => ({
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
  const scripted = signal<TimelineEntry[]>([
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
  const plain = (day: string): TimelineEntry[] =>
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
    : {
        ratio: 1.3,
        // Eight weeks, getting closer; one with no task done that had a guess.
        weeks: [1.9, 1.7, 1.8, null, 1.5, 1.6, 1.4, 1.3].map((ratio, i) => ({ monday: addDays('2026-11-23', (i - 7) * 7), ratio })),
        tasks: [
          { id: 'maths', title: 'Discrete maths, tutorial sheet 6', estimate: 2, laps: 2 },
          { id: 'e1', title: 'K&R chapter 4: functions and program structure', estimate: 4, laps: 6 },
          { id: 'e2', title: 'React: the tic-tac-toe tutorial', estimate: 3, laps: 3 },
          { id: 'e3', title: 'Set up a C toolchain', estimate: 1, laps: 3 },
          { id: 'e4', title: 'Lecture notes, week 9', estimate: 2, laps: 1 },
        ],
      };
  const note = signal((record.note ?? '').slice(0, 280));
  // What a tap in the timeline made of a lap, on any day, over what the day was written with.
  const turned = signal(new Map<string, TimelineEntry['outcome']>());
  // The lap in progress, after the scripted day's last break, as far as it has run: no row yet, so the core says it is live.
  const open = (): TimelineEntry[] => (lapNow() > 0 ? [lap('run', 16, 40, { outcome: 'stopped', ended: at(DAY, 16, 40) + lapNow(), ran_ms: lapNow(), live: record.live ?? 'running' })] : []);
  const late = { ...lap('late', 0, 0), started: at(addDays(DAY, -1), 23, 46), ended: at(DAY, 0, 32), ran_ms: 46 * MIN };
  const timeline = (day: string) =>
    [
      ...(record.midnight && day === DAY ? [late] : []),
      ...(day === DAY && record.scripted !== false ? scripted.value : plain(day)),
      ...(day === DAY && record.scripted !== false ? open() : []),
      ...(record.midnight && day === addDays(DAY, -1) ? [late] : []),
    ].map((entry) => ({ ...entry, outcome: turned.value.get(entry.id) ?? entry.outcome }));
  const turn = (id: string, to: 'void' | null) => {
    const entry = timeline(DAY).find((one) => one.id === id);
    if (entry) moved.value += (to ? -1 : 1) * Math.round(entry.ran_ms / MIN);
    turned.value = new Map(turned.value).set(id, to ?? (entry && entry.ran_ms < LAP ? 'stopped' : 'rang'));
  };

  return {
    week: () => weekRace(days(), DAY, todayMin() * MIN + lapNow(), (record.ghostByNow ?? 200) * MIN),
    projects: () => (kind === 'none' || kind === 'day' ? [] : shares[record.projects ?? (kind === 'week' ? 'week' : 'usual')]!),
    lookBack: () => ({
      day: DAY,
      focus_ms: todayMin() * MIN + lapNow(),
      laps: Math.floor(todayMin() / 25),
      done: todayMin() >= 50 ? [{ id: 'maths', title: 'Discrete maths, tutorial sheet 6', estimate: 2, laps: 2 }] : [],
      note: note.value,
    }),
    today: signal(DAY),
    note: (day) => (day === DAY ? note.value : day === '2026-11-17' ? 'Arrays decay to pointers. Wrote that on my hand.' : ''),
    streak: computed(() => streakView(kept(), DAY, record.rest)),
    since: computed(() => since(days(), kept(), DAY, record.rest)),
    bests: computed(() => bests(days())),
    estimates: signal(kind === 'weeks' || kind === 'year' ? guesses : NO_GUESSES),
    timeline,
    setAside: (id) => turn(id, 'void'),
    countAgain: (id) => turn(id, null),
    setNote: (_day, text) => void (note.value = text.slice(0, 280)),
    wake() {},
  };
}
