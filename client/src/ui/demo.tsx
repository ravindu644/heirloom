// The entry of client/demo.html, which is not part of the build: App with a made-up engine and
// timer, in the state the query string names, so every state can be seen and photographed with no
// server. /demo.html lists them. The timer math is the real core/timer.ts; only the data is made
// up, and the buttons work. Its own few words are for us, so they are not in strings.ts.

import { render } from 'preact';
import { signal } from '@preact/signals';
import { IDLE, act, view } from '../core/timer.ts';
import type { Phase, TimerState } from '../core/timer.ts';
import type { AccountResult, Engine, Row, SyncState } from '../sync/engine.ts';
import { EXTEND_MS } from '../sync/focus.ts';
import type { Focus } from '../sync/focus.ts';
import type { Today } from '../sync/today.ts';
import { App, Elsewhere } from './app.tsx';
import { DAY, PROJECTS, demoToday } from './demo-today.ts';
import type { DemoDay, DemoTask } from './demo-today.ts';
import { demoProgress } from './demo-progress.ts';
import type { DemoRecord } from './demo-progress.ts';
import type { Progress } from '../sync/progress.ts';
import type { Habits } from '../sync/habits.ts';
import type { Rooms } from '../sync/rooms.ts';
import type { Mark, Settings, SettingsView } from '../sync/settings.ts';
import { HABITS, MANY_HABITS, demoHabits, demoRooms, demoSettings } from './demo-more.ts';
import type { DemoHabit, DemoRoom } from './demo-more.ts';

const MIN = 60000;
const LENGTHS = { work_ms: 25 * MIN, short_ms: 5 * MIN, long_ms: 15 * MIN };
const LONG_TITLE =
  'K&R 5.1 to 5.5: pointers and arrays, then exercise 5-3 (strcat with pointers), then read why a[i] is the same as *(a+i) until it finally stops feeling like a trick';

interface Scene {
  about: string;
  /** The time on the wall, on Tuesday 24 November 2026. */
  at?: [hour: number, minute: number];
  /** The timer: the phase, which lap of the set (0 to 3), time left, and whether it is paused. `left` of 0 is over. */
  run?: { phase: Phase; lap: number; left: number; paused?: boolean; task?: string };
  /** Idle, with this lap next. */
  next?: number;
  /** Focus today before the run in progress, and laps that rang. */
  you?: number;
  laps?: number;
  /** Last Tuesday up to now, and its whole day. Left out: no ghost. */
  ghost?: [ms: number, total: number];
  sync?: SyncState;
  unsent?: number;
  unsaved?: boolean;
  /** The timer was last touched on an earlier day. */
  newDay?: boolean;
  /** The demo taps the buttons whose words, or names, start like these, one after the other: for what only shows after a tap. */
  tap?: string | string[];
  /** The day's tasks. Left out, there are none. */
  day?: DemoDay;
  /** Opens on Today, on Progress or on Settings, not on Focus. */
  today?: boolean;
  settings?: boolean;
  /** The record behind Progress. Given, the scene opens there. */
  record?: DemoRecord;
  /** The habits. Given, the scene opens on Habits. Left out, the mockup's are there all the same. */
  habits?: DemoHabit[];
  /** The rooms. Given, the scene opens on Room. Left out, there is the one of the mockup. */
  room?: DemoRoom;
  /** Settings other than the defaults, and marks waiting to be shown. */
  prefs?: Partial<SettingsView>;
  marks?: Mark[];
  /** Who cheered the lap just finished. */
  cheered?: string[];
  /** A second tab: no app at all. */
  elsewhere?: boolean;
  signedOut?: boolean;
}

const lap2 = { phase: 'work', lap: 1, left: 18 * MIN + 42000 } as const;
const tuesday: [number, number] = [150 * MIN, 200 * MIN];

// The day of the Today mockup: five laps done, ten planned and left, last Tuesday at 3h 20m.
const TASKS: DemoTask[] = [
  { id: 'kr', title: 'K&R 5.1 to 5.5: pointers and arrays', project: 'c', estimate: 4, squares: [1, 1], due: DAY },
  { id: 'ex', title: 'Exercise 5-3: strcat with pointers', project: 'c', estimate: 2, due: DAY },
  { id: 'react', title: 'Thinking in React, steps 1 to 3', project: 'react', estimate: 2, squares: [1], due: DAY },
  { id: 'ttt', title: 'Tic-tac-toe tutorial: lift state up', project: 'react', estimate: 3, due: DAY },
  { id: 'nextjs', title: 'Next.js: layouts and pages', project: 'next', estimate: 2, due: DAY },
  { id: 'maths', title: 'Discrete maths, tutorial sheet 6', project: 'uni', estimate: 2, squares: [1, 1], done: true, due: DAY },
];
const day = (tasks: DemoTask[] = TASKS, more: Partial<DemoDay> = {}): DemoDay => ({ tasks, target: 8, done_ms: 125 * MIN, laps: 5, ghost: { total_ms: 200 * MIN, laps: 8 }, ...more });
const onKr = { ...lap2, task: 'kr' };
const idleAt2: Scene = { about: '', next: 1, you: 125 * MIN, laps: 5, ghost: tuesday };
const swap = (id: string, fields: Partial<DemoTask>) => TASKS.map((task) => (task.id === id ? { ...task, ...fields } : task));
const READING: DemoTask = { id: 'read', title: 'Read one chapter of OSTEP', estimate: 1, due: DAY, when: 'before bed', repeat: { every: 'day' } };

const TODAY: Record<string, Scene> = {
  'today-empty': { about: 'Today on a first day: nothing yet', next: 0, at: [9, 5], day: { tasks: [] } },
  today: { ...idleAt2, about: 'Today, the day of the mockup, nothing running', day: day() },
  'today-running': { about: 'Today with a lap running on a task', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'today-paused': { about: 'Today with that lap paused', run: { ...onKr, paused: true }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'today-lap-over': { about: 'Today just after the bell: the lap counts everywhere, and the break is one tap away', run: { ...onKr, left: 0 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'today-break': { about: 'Today during a short break', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000 }, you: 150 * MIN, laps: 6, ghost: tuesday, day: day(swap('kr', { squares: [1, 1, 1] }), { done_ms: 150 * MIN, laps: 6 }) },
  'today-done': { ...idleAt2, about: 'Everything on today done', day: day(TASKS.map((task) => ({ ...task, done: true })), { done_ms: 325 * MIN, laps: 13 }) },
  'today-over': { about: 'A task past its estimate: 6 of 5, and running', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { estimate: 5, squares: [1, 1, 1, 0.4, 1, 1, 1] })) },
  'today-long': {
    ...idleAt2,
    about: 'The longest title and the longest project name',
    day: day(swap('kr', { title: LONG_TITLE, project: 'long', when: 'after the lecture, if the lab is free' }), {
      projects: [...PROJECTS, { id: 'long', name: 'Operating systems: three easy pieces, the reading group', color: 'heat-2' }],
    }),
  },
  'today-carried': {
    ...idleAt2,
    about: 'A task carried over from Saturday, and one with a when',
    day: day([{ id: 'essay', title: 'Essay outline: why C has no strings', project: 'uni', estimate: 3, squares: [1], due: '2026-11-21' }, ...swap('ttt', { when: 'after dinner' })]),
  },
  'today-upcoming': {
    ...idleAt2,
    about: 'Upcoming tasks, one of them repeating',
    day: day([
      ...TASKS,
      READING,
      { id: 'quiz', title: 'Discrete maths quiz 4', project: 'uni', estimate: 2, due: '2026-11-25' },
      { id: 'app', title: 'Next.js: data fetching', project: 'next', estimate: 3, due: '2026-11-27', repeat: { every: 'week', days: 0b0010100 } },
    ]),
  },
  'today-ordering': { ...idleAt2, about: 'Changing the order', day: day(), tap: 'Change the order' },
  'today-target': { ...idleAt2, about: 'Changing the day target', day: day(), tap: 'Change' },
  'today-no-target': { ...idleAt2, about: 'No day target set', day: day(TASKS, { target: 0 }) },
  'today-added': { ...idleAt2, about: 'Just after quick add', day: day(), tap: 'demo:add' },
  'today-after-done': { ...idleAt2, about: 'Just after marking a task done: Undo', day: day(), tap: 'Done: Exercise 5-3' },
  'today-after-repeat': { ...idleAt2, about: 'A repeating task done: it says when it comes back', day: day([...TASKS, READING]), tap: 'Done: Read one chapter' },
  'today-after-delete': { ...idleAt2, about: 'Just after deleting a task: Undo', day: day(), tap: ['Exercise 5-3', 'Delete'] },
  'today-deleted': {
    ...idleAt2,
    about: 'Recently deleted, with Restore',
    day: day([...TASKS, { id: 'old1', title: 'Install a C compiler', project: 'c', estimate: 1, squares: [1], deleted: new Date(2026, 10, 22, 21).getTime() }, { id: 'old2', title: 'Watch a talk about monads', estimate: 2, deleted: new Date(2026, 9, 27, 9).getTime() }]),
    tap: 'Recently deleted',
  },
  sheet: { ...idleAt2, about: 'A task open in the sheet', day: day(), tap: 'Exercise 5-3' },
  'sheet-subtasks': {
    ...idleAt2,
    about: 'The sheet with subtasks and notes',
    day: day([
      ...swap('ex', { notes: 'The book wants strcat(s, t) to copy t to the end of s. Do it with pointers only, no indexes.' }),
      { id: 's1', title: 'Write it with array indexes first', parent: 'ex', done: true },
      { id: 's2', title: 'Rewrite with two pointers', parent: 'ex' },
      { id: 's3', title: 'Test with an empty string, a string of one letter, and two strings that are the same string', parent: 'ex' },
    ]),
    tap: 'Exercise 5-3',
  },
  'sheet-nudge': { ...idleAt2, about: 'The sheet with an estimate over 7', day: day(swap('ex', { estimate: 9 })), tap: 'Exercise 5-3' },
  'sheet-project': { ...idleAt2, about: 'The sheet making a new project', day: day(), tap: ['Exercise 5-3', 'New project'] },
  'sheet-repeat': { ...idleAt2, about: 'The sheet with a repeat on chosen days', day: day(swap('ex', { repeat: { every: 'week', days: 0b0010101 }, when: 'after dinner' })), tap: 'Exercise 5-3' },
  // An estimate of five here, so "lap 3 of 5 on this task" cannot be taken for the set of four above it.
  'focus-next': { ...idleAt2, about: 'Focus idle, naming the task the next lap is for', day: day(swap('kr', { estimate: 5 })) },
  'focus-task': { about: 'Focus with a lap running on a task', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { estimate: 5 })) },
  'focus-break-task': { about: 'Focus on a break, with tasks up next', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000 }, you: 150 * MIN, laps: 6, ghost: tuesday, day: day(swap('kr', { squares: [1, 1, 1] }), { done_ms: 150 * MIN, laps: 6 }) },
  'focus-result-task': { about: 'The result naming the task', run: { ...onKr, left: 0 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { title: 'K&R chapter 5', estimate: 5 })) },
  'focus-result-long': { about: 'The result for a task with a long title: it says "This task"', run: { ...onKr, left: 0 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
};
for (const [id, scene] of Object.entries(TODAY)) if (!id.startsWith('focus')) scene.today = true;

// Progress: twelve weeks of record, and the ways a week, a streak and a first day can stand.
const week: Scene = { ...idleAt2, about: '', day: day() };
const PROGRESS: Record<string, Scene> = {
  progress: { about: 'Progress: twelve weeks, one lap behind last week, a lap running', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(), record: {} },
  'progress-ahead': { ...week, about: 'Progress: a week ahead of the last', record: { today: 300 } },
  'progress-level': { ...week, about: 'Progress: level with last week', record: { today: 150 } },
  'progress-behind': { ...week, about: 'Progress: three laps behind, nothing running', record: { today: 75 } },
  'progress-first-day': { about: 'Progress on a first day: nothing to compare, one square', next: 1, at: [10, 50], you: 25 * MIN, laps: 1, record: { history: 'day', today: 25, scripted: false } },
  'progress-nothing': { about: 'Progress before the first lap', next: 0, at: [9, 5], record: { history: 'none', scripted: false } },
  'progress-first-week': { ...week, about: 'Progress in a first week: no last week to race', record: { history: 'week' } },
  'progress-year': { ...week, about: 'A year and a week of record: the grid opens on its newest weeks', record: { history: 'year' } },
  'progress-run': { ...week, about: 'A streak with no rest day in its last fortnight', record: { fill: ['2026-11-11', '2026-11-19'] } },
  'progress-miss': { ...week, about: 'A miss inside the last 45 days: days kept of days, not the run', record: { empty: ['2026-11-12'] } },
  'progress-day': { ...week, about: 'A day chosen in the year: its timeline, and the way back to today', record: {}, tap: 'demo:day' },
  'progress-aside': { ...week, about: 'Just after a lap is set aside in the timeline: Undo', record: {}, tap: 'Set aside' },
  'progress-note': { ...week, about: 'The look back with a note at its longest', record: { note: 'Pointers finally clicked once I drew the array as boxes and stopped reading a[i] as magic. The second lap after lunch went on two devices by mistake, the laptop was still running. Tomorrow: exercise 5-3 first, before the lecture, while the picture of the boxes is still in my head.' } },
  'progress-long-project': { ...week, about: 'A long project name, and time under no project', record: { projects: 'long' } },
  'progress-many-projects': { ...week, about: 'Nine rows by project', record: { projects: 'many' } },
  'progress-no-projects': { ...week, about: 'No projects and no estimates yet', record: { projects: 'none', estimates: false } },
};

// Habits: the empty screen first, then the mockup's five and one counted through the day.
const HABIT_SCENES: Record<string, Scene> = {
  'habits-none': { ...week, about: 'Habits before the first one', habits: [] },
  'habits-one': { ...week, about: 'One habit, never checked in', habits: [{ id: 'read', title: 'Read 10 pages of K&R', counts: {} }] },
  habits: { ...week, about: 'Habits: six, three done, one counted through the day', habits: HABITS },
  'habits-checked': { ...week, about: 'Just after a check-in on a counted habit: Undo', habits: HABITS, tap: 'Check in: A glass of water' },
  'habits-all': { ...week, about: 'Every habit of today done', habits: HABITS.map((habit) => ({ ...habit, counts: { ...habit.counts, '2026-11-24': habit.target ?? 1 } })) },
  'habits-ordering': { ...week, about: 'Changing the order of habits', habits: HABITS, tap: 'Change the order' },
  'habits-sheet': { ...week, about: 'A habit open: days, count, reminder, its record', habits: HABITS, tap: 'Push one commit' },
  'habits-sheet-new': { ...week, about: 'A habit open that has no check-in yet', habits: [{ id: 'read', title: 'Read 10 pages of K&R', counts: {} }], tap: 'Read 10 pages' },
  'habits-archived': { ...week, about: 'Archived habits, behind their link', habits: HABITS, tap: 'Archived' },
  'habits-deleted': { ...week, about: 'Recently deleted habits', habits: HABITS, tap: 'Recently deleted' },
  'habits-after-delete': { ...week, about: 'Just after deleting a habit: Undo', habits: HABITS, tap: ['Lights out', 'Delete'] },
  'habits-many': { ...week, about: 'Ten habits, one with a very long title', habits: MANY_HABITS },
};

// Room: no room first, then a room of one, the mockup's four, and eight.
const ROOM_SCENES: Record<string, Scene> = {
  'room-none': { ...week, about: 'Room: not in one yet', room: { rooms: 'none' } },
  'room-none-offline': { ...week, about: 'Not in a room, and no connection', sync: 'offline', room: { rooms: 'none', stale: true } },
  'room-alone': { ...week, about: 'A room of one', run: onKr, room: { members: 'alone' } },
  room: { ...week, about: 'Room: four friends, one cheer given, one away', run: onKr, room: {} },
  'room-cheered': { ...week, about: 'Just after a cheer', run: onKr, room: {}, tap: 'Cheer sachi' },
  'room-ranked': { ...week, about: 'A room that has switched its order on', run: onKr, room: { ranked: true } },
  'room-eight': { ...week, about: 'Eight members, a long name, a long task title', run: onKr, room: { members: 'eight', name: 'Second years, block C, the ones who stay up' } },
  'room-stale': { ...week, about: 'No connection: the room as it was last heard from', run: onKr, sync: 'offline', room: { stale: true } },
  'room-two': { ...week, about: 'In two rooms', run: onKr, room: { rooms: 'two' } },
  'room-sheet': { ...week, about: 'The room: its code, name, target, order and the way out', run: onKr, room: {}, tap: 'Code and settings' },
  'room-leaving': { ...week, about: 'Leaving, the second tap', run: onKr, room: {}, tap: ['Code and settings', 'Leave the room'] },
  'room-another': { ...week, about: 'Making or joining another room', run: onKr, room: {}, tap: 'Make or join' },
  'room-hidden': { ...week, about: 'Rooms hidden: Room leaves the navigation', room: {}, prefs: { rooms_hidden: true } },
};

// Settings in full, and the marks in their moments.
const lapOver = { phase: 'work', lap: 1, left: 0 } as const;
const MORE: Record<string, Scene> = {
  'settings-changed': { ...idleAt2, about: 'Settings with most things changed', settings: true, day: day(), prefs: { work_ms: 50 * MIN, short_ms: 10 * MIN, long_ms: 30 * MIN, auto_break: true, auto_work: true, celebrate: false, day_target: 0, share_task: true } },
  'mark-first': { about: 'The first lap ever: its mark, under the result', run: { phase: 'work', lap: 0, left: 0 }, you: 0, laps: 0, marks: [{ kind: 'laps', tier: 1 }] },
  'mark-hundred': { about: 'Lap 100, a best week, and a cheer', run: lapOver, you: 125 * MIN, laps: 5, ghost: tuesday, marks: [{ kind: 'laps', tier: 100 }, { kind: 'week', focus_ms: 1075 * MIN, before_ms: 1050 * MIN }], cheered: ['sachi', 'dilan'] },
  'mark-off': { about: 'The same lap with celebrations off', run: lapOver, you: 125 * MIN, laps: 5, ghost: tuesday, marks: [{ kind: 'laps', tier: 100 }], prefs: { celebrate: false } },
  'mark-estimate': { ...idleAt2, about: 'A task done inside its estimate: its mark on Today', today: true, day: day(), marks: [{ kind: 'estimate', task: 'react', title: 'Thinking in React, steps 1 to 3', estimate: 2, laps: 1 }], tap: 'Done: Thinking in React' },
  ...Object.fromEntries([4, 25, 250, 500, 1000, 2500].map((tier) => [`mark-${tier}`, { about: `Lap ${tier}`, run: lapOver, you: 125 * MIN, laps: 5, ghost: tuesday, marks: [{ kind: 'laps', tier }] } as Scene])),
};

const SCENES: Record<string, Scene> = {
  ...TODAY,
  ...PROGRESS,
  ...HABIT_SCENES,
  ...ROOM_SCENES,
  ...MORE,
  'signed-out': { about: 'Nobody is signed in', signedOut: true },
  idle: { about: 'The morning, before the first lap', at: [9, 5], next: 0, ghost: [5 * MIN, 200 * MIN] },
  'first-day': { about: 'No ghost yet: lap 1 of the first day', run: { phase: 'work', lap: 0, left: 21 * MIN + 7000 } },
  'running-behind': { about: 'Lap 2 running, 19 minutes behind the ghost', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday },
  'running-ahead': { about: 'Lap 2 running, 6 minutes ahead', run: lap2, you: 150 * MIN, laps: 6, ghost: tuesday },
  paused: { about: 'Lap 2, paused', run: { ...lap2, paused: true }, you: 125 * MIN, laps: 5, ghost: tuesday },
  'lap-level': { about: 'Lap 2 just over, level', run: { ...lap2, left: 0 }, you: 125 * MIN, laps: 5, ghost: tuesday },
  'lap-ahead': { about: 'Lap 2 just over, 6 minutes ahead', run: { ...lap2, left: 0 }, you: 131 * MIN, laps: 5, ghost: tuesday },
  'lap-behind': { about: 'Lap 2 just over, 19 minutes behind', run: { ...lap2, left: 0 }, you: 106 * MIN, laps: 4, ghost: tuesday },
  'lap-first-day': { about: 'Lap 1 just over, no ghost yet', run: { phase: 'work', lap: 0, left: 0 } },
  'set-done': { about: 'The fourth lap just over: a set', run: { phase: 'work', lap: 3, left: 0 }, you: 175 * MIN, laps: 7, ghost: tuesday },
  break: { about: 'A short break running', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000 }, you: 150 * MIN, laps: 6, ghost: tuesday },
  'break-over': { about: 'A short break that is over', run: { phase: 'short', lap: 1, left: 0 }, you: 150 * MIN, laps: 6, ghost: tuesday },
  'long-break': { about: 'The long break running', run: { phase: 'long', lap: 3, left: 11 * MIN + 5000 }, you: 200 * MIN, laps: 8, ghost: tuesday },
  offline: { about: 'No connection, 3 edits unsent', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, sync: 'offline', unsent: 3 },
  'next-day': { about: 'Opened the morning after a lap that rang last night', at: [9, 5], run: { ...lap2, left: 0 }, ghost: [5 * MIN, 200 * MIN], newDay: true },
  unsaved: { about: 'The store is refusing writes', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, unsaved: true },
  'unsaved-offline': { about: 'No connection and the store refusing writes: the worst case', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, unsaved: true, sync: 'offline', unsent: 3 },
  refused: { about: 'The server signed this device out', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, sync: 'signed-out' },
  'long-title': { about: 'A lap on the longest task title', run: { ...lap2, task: 'long' }, you: 125 * MIN, laps: 5, ghost: tuesday },
  'undo-stop': { about: 'Just stopped: the sentence, and Undo for ten seconds', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, tap: 'Stop' },
  'undo-aside': { about: 'Just set aside, with Undo', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, tap: 'Set aside' },
  elsewhere: { about: 'A second tab of the same browser', elsewhere: true },
  settings: { ...idleAt2, about: 'Settings: the account', settings: true, day: day() },
  'settings-refused': { ...idleAt2, about: 'Settings after the server signed this device out', settings: true, sync: 'signed-out', day: day() },
  'settings-unsent': { ...idleAt2, about: 'Settings: a sign out refused, edits unsent', settings: true, sync: 'offline', unsent: 3, day: day(), tap: 'Sign out' },
  'lap-live': { about: 'Three seconds before the bell: watch the lap-done moment', run: { ...lap2, left: 3000 }, you: 106 * MIN, laps: 4, ghost: tuesday },
  'set-live': { about: 'Three seconds before the bell of lap 4: watch the set-done moment', run: { phase: 'work', lap: 3, left: 3000 }, you: 175 * MIN, laps: 7, ghost: tuesday },
};

function stage(scene: Scene): { engine: Engine; focus: Focus; today: Today; progress: Progress; habits: Habits; rooms: Rooms; settings: Settings } {
  const [hour, minute] = scene.at ?? [16, 40];
  const opened = Date.now();
  const start = new Date(2026, 10, 24, hour, minute, 18).getTime();
  const now = () => start + Date.now() - opened;

  const run = scene.run;
  const planned = run ? LENGTHS[`${run.phase}_ms`] : 0;
  const state = signal<TimerState>(
    run
      ? {
          phase: run.phase,
          run: 'demo-0',
          task: run.task ?? null,
          // "Over" opened five seconds after the bell, so it is a result found, not one watched.
          started: start - (planned - run.left) - (run.left === 0 ? 5000 : 0) - (run.paused ? 2 * MIN : 0),
          paused_at: run.paused ? start - 2 * MIN : null,
          paused_ms: 0,
          planned_ms: planned,
          set_index: run.lap,
        }
      : { ...IDLE, set_index: scene.next ?? 0 },
  );
  let you = scene.you ?? 0;
  let laps = scene.laps ?? 0;
  let runs = 0;

  const ran = () => {
    const s = state.value;
    return s.started === null ? 0 : Math.min(s.planned_ms, (s.paused_at ?? now()) - s.started - s.paused_ms);
  };
  const over = () => view(state.value, now()).over;
  const lapOpen = () => state.value.phase === 'work';
  // What the real one does when a run ends: a lap that rang counts, a stop keeps a minute or more.
  const close = (keep: boolean) => {
    if (!lapOpen() || !keep) return;
    const task = state.value.task;
    if (over()) laps++;
    if (over() || ran() >= MIN) {
      you += ran();
      today.credit(task, ran() / state.value.planned_ms, ran());
    }
  };
  const begin = (phase: Phase, task: string | null = null) => {
    state.value = act(state.value, { do: 'start', phase, run: `demo-${++runs}`, task: phase === 'work' ? task : null, planned_ms: LENGTHS[`${phase}_ms`] }, now());
  };
  const today = demoToday(scene.day ?? { tasks: [] }, state, () => ({ share: ran() / (state.value.planned_ms || 1), ms: ran(), over: over() }), now);

  // Ten seconds to take a stop or a set aside back, as the real one gives.
  const undoable = signal(false);
  let before: { state: TimerState; you: number; laps: number } | null = null;
  const end = (keep: boolean) => {
    before = { state: state.value, you, laps };
    close(keep);
    state.value = act(state.value, { do: 'stop' }, now());
    undoable.value = true;
    setTimeout(() => (undoable.value = false), 10000);
  };

  const focus: Focus = {
    state,
    lengths: signal(LENGTHS),
    view() {
      const v = view(state.value, now());
      // What the real one does on a new day: the next thing is lap one, whatever came before.
      return scene.newDay && state.value.run === 'demo-0' ? { ...v, next: { phase: 'work', set_index: 0 } } : v;
    },
    ran,
    race() {
      // Yesterday's lap is not today's focus.
      const you_ms = you + (lapOpen() && !(scene.newDay && state.value.run === 'demo-0') ? ran() : 0);
      const ghost = scene.ghost ? { day: '2026-11-17', ms: scene.ghost[0], total_ms: scene.ghost[1] } : null;
      return { you_ms, ghost, split_ms: ghost ? you_ms - ghost.ms : null };
    },
    lapsToday: () => laps + (lapOpen() && over() ? 1 : 0),
    start(task) {
      const next = view(state.value, now()).next.phase;
      close(true);
      begin(next, task);
    },
    skipBreak(task) {
      close(true);
      begin('work', task);
    },
    pause: () => void (state.value = act(state.value, { do: 'pause' }, now())),
    resume: () => void (state.value = act(state.value, { do: 'resume' }, now())),
    extend: () => void (state.value = act(state.value, { do: 'extend', ms: EXTEND_MS }, now())),
    stop: () => end(true),
    setAside: () => end(false),
    undoable,
    undo() {
      if (!before) return;
      ({ you, laps } = before);
      state.value = before.state;
      undoable.value = false;
    },
  };

  const account = signal(scene.signedOut ? null : { account: 'demo', username: 'ravi' });
  const sync = signal<SyncState>(scene.sync ?? (scene.signedOut ? 'signed-out' : 'in-step'));
  const unsent = signal(scene.unsent ?? 0);
  const long = signal<ReadonlyMap<string, Row>>(new Map([['long', { id: 'long', title: LONG_TITLE }]]));
  const none = signal<ReadonlyMap<string, Row>>(new Map());
  // The demo's server. A password that is an error's code gets that error, so each sentence can
  // be read: taken, invite, credentials, slow_down, bad_request, offline, server.
  const answer = async (username: string, password: string): Promise<AccountResult> => {
    await new Promise((done) => setTimeout(done, 400));
    if (/^[a-z_]+$/.test(password)) return { ok: false, error: password, retry_after: 720 };
    account.value = { account: 'demo', username };
    sync.value = 'in-step';
    return { ok: true };
  };
  const engine: Engine = {
    server: location.origin,
    sync,
    account,
    unsent,
    unsaved: signal(scene.unsaved ?? false),
    timer: state,
    device: 'demo',
    now,
    // The old long-title scene has a task with no day around it; every other scene's rows come from its day.
    rows: (dataset) => (dataset !== 'task' ? none : scene.day ? today.rows : long),
    write() {},
    stamp: () => undefined,
    act() {},
    register: (_invite, username, password) => answer(username, password),
    signIn: answer,
    async signOut() {
      if (sync.value === 'offline' && unsent.value > 0) return { ok: false, error: 'unsent' };
      account.value = null;
      return { ok: true };
    },
    wake() {},
    onRoom: () => () => {},
    request: async () => ({ ok: false, error: 'offline' }),
    kept: () => undefined,
    keep() {},
    merge: () => 0,
    saved: async () => {},
    cells: () => [],
    stop: async () => {},
  };
  const progress = demoProgress(scene.record ?? {}, () => (lapOpen() ? ran() : 0));
  const settings = demoSettings(scene.prefs ?? {}, scene.marks ?? []);
  const habits = demoHabits(scene.habits ?? HABITS, { now: 7, before: 8 });
  const rooms = demoRooms({ ...scene.room, cheered: scene.cheered }, now, settings);
  return { engine, focus, today, progress, habits, rooms, settings };
}

const name = new URLSearchParams(location.search).get('state');
const scene = name ? SCENES[name] : undefined;
if (scene && !location.hash) location.hash = scene.today ? '#/today' : scene.settings ? '#/settings' : scene.record ? '#/progress' : scene.habits ? '#/habits' : scene.room ? '#/room' : '';
render(
  scene?.elsewhere ? (
    <Elsewhere />
  ) : scene ? (
    <App {...stage(scene)} onReminderSet={() => console.info('demo: a reminder was set')} />
  ) : (
    <main style="padding: var(--layout-gutter); display: grid; gap: var(--space-sm)">
      <h1>heirloom, every state</h1>
      {Object.entries(SCENES).map(([id, { about }]) => (
        <a key={id} href={`?state=${id}`} style="text-decoration: underline">
          {id}: {about}
        </a>
      ))}
    </main>
  ),
  document.getElementById('app')!,
);
// After the first paint, as a person would: the screen has settled before anyone can tap.
[scene?.tap ?? []].flat().forEach((words, i) =>
  setTimeout(() => {
    if (words === 'demo:add') {
      // Typed and entered, as a person would.
      const field = document.querySelector<HTMLInputElement>('input[name=task]')!;
      field.value = 'pointers chapter 3 ~4';
      field.form!.requestSubmit();
    } else if (words === 'demo:day') {
      // A week back in the year, by the keyboard.
      document.querySelector('[role=slider]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    } else [...document.querySelectorAll('button')].find((button) => (button.textContent || button.ariaLabel)?.startsWith(words))?.click();
  }, 100 * (i + 1)),
);
