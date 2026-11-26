// The entry of client/demo.html, which is not part of the build: App with a made-up engine and
// timer, in the state the query string names, so every state can be seen and photographed with no
// server. /demo.html lists them. The timer math is the real core/timer.ts; only the data is made
// up, and the buttons work. Its own few words are for us, so they are not in strings.ts.

import { render } from 'preact';
import { signal } from '@preact/signals';
import { GONE } from '../core/real.ts';
import { IDLE, act, view } from '../core/timer.ts';
import type { Phase, TimerState } from '../core/timer.ts';
import type { AccountResult, Engine, Role, Row, SyncState } from '../sync/engine.ts';
import { EXTEND_MS } from '../sync/focus.ts';
import type { Focus } from '../sync/focus.ts';
import type { ProjectColor, Today } from '../sync/today.ts';
import { App, Elsewhere } from './app.tsx';
import { DAY, PROJECTS, demoToday } from './demo-today.ts';
import type { DemoDay, DemoTask } from './demo-today.ts';
import { demoProgress } from './demo-progress.ts';
import type { DemoRecord } from './demo-progress.ts';
import type { Progress } from '../sync/progress.ts';
import type { Habits } from '../sync/habits.ts';
import type { Rooms } from '../sync/rooms.ts';
import type { Mark, Settings, SettingsView } from '../sync/settings.ts';
import { HABITS, MANY_HABITS, demoAdmins, demoHabits, demoInvites, demoResets, demoRooms, demoServer, demoSettings } from './demo-more.ts';
import type { DemoHabit, DemoRoom, DemoServer } from './demo-more.ts';
import type { Admins } from '../sync/admins.ts';
import type { Invites } from '../sync/invites.ts';
import type { Resets } from '../sync/resets.ts';
import type { ServerChoice } from '../sync/server.ts';
import { ServerStep } from './server.tsx';
import { FirstRun } from './welcome.tsx';
import { hueHex } from './kit/hue.ts';
import { say } from './kit/said.tsx';
import * as s from './strings.ts';

const MIN = 60000;
const LENGTHS = { work_ms: 25 * MIN, short_ms: 5 * MIN, long_ms: 15 * MIN };
const LONG_TITLE =
  'K&R 5.1 to 5.5: pointers and arrays, then exercise 5-3 (strcat with pointers), then read why a[i] is the same as *(a+i) until it finally stops feeling like a trick';

interface Scene {
  about: string;
  /** The time on the wall, on Tuesday 24 November 2026. */
  at?: [hour: number, minute: number];
  /** The timer: the phase, which lap of the set (0 to 3), time left, and whether it is paused. `left` of 0 is over. */
  run?: { phase: Phase; lap: number; left: number; paused?: boolean; task?: string; planned?: number; id?: string };
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
  /** As the phone app is: a file cannot be saved from here. */
  phoneApp?: boolean;
  /** The device will not let heirloom notify. */
  ringBlocked?: boolean;
  /** The phone app's server step, alone, as it is before there is any engine. */
  serverStep?: DemoServer;
  /** The phone app with no server yet: the welcome, then the server step. */
  welcome?: boolean;
  /** The phone app's server, for the sign-in screen and Settings: its address. Given, the app is the phone app. */
  serverAt?: string;
  /** A server with no account yet. `never`: the server does not say either way. `late`: it says so after a second. */
  fresh?: boolean | 'never' | 'late';
  /** Somebody else sets the fresh server up first: what the server then answers this one's setup with. */
  taken?: 'invite' | 'bad_request';
  /** Arrived by an invite link carrying this invite. `refused` is one the server will not take. */
  join?: string;
  /** What the signed-in account may do, the open invites (a count, or forbidden) and the admins beside the owner. */
  role?: Role;
  invites?: number | 'forbidden' | 'token';
  /** The invite the phone app holds from a pasted link. */
  held?: string;
  admins?: string[];
  /** The owner's open reset links, how many. */
  resets?: number;
  /** Arrived by a reset link carrying this reset. `dead` is one the server no longer knows. */
  reset?: string;
  /** A second tab: no app at all. */
  elsewhere?: boolean;
  signedOut?: boolean;
}

const lap2 = { phase: 'work', lap: 1, left: 18 * MIN + 42000 } as const;
const tuesday: [number, number] = [150 * MIN, 200 * MIN];

// The day of the Today mockup: five laps done, ten planned and left, last Tuesday at 3h 20m.
// A colour a person picked has no name, only its value. The demo picks a pale one with the app's
// own picker function, so no colour is written here and the hair line round a picked square has something to do.
const PICKED = hueHex(8, 12) as ProjectColor;

// Sixty characters, every word short enough to break between.
const SIXTY = 'Write up the lab report on sorting and send it to the group';

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
// The squares at a count where a line fills or breaks, with the one below it and a single lap:
// a long title and a short one, and the first row is the one with a Start button.
const squaresDay = (n: number, shortFirst = false): DemoDay => {
  const rows: DemoTask[] = [
    { id: 'sq1', title: SIXTY, project: 'c', estimate: n, squares: Array<number>(Math.ceil(n / 2)).fill(1), due: DAY },
    { id: 'sq2', title: 'Essay draft', project: 'uni', estimate: n, squares: [1, 0.5], due: DAY },
    { id: 'sq3', title: SIXTY, estimate: n - 1, due: DAY },
    { id: 'sq4', title: 'Essay draft', estimate: n - 1, squares: Array<number>(n - 1).fill(1), due: DAY },
    { id: 'sq5', title: 'Read chapter 4', estimate: 1, due: DAY },
    { id: 'sq6', title: SIXTY, estimate: n, squares: Array<number>(n).fill(1), done: true, due: DAY },
    // One lap past what four lines hold: the count alone.
    ...(n === 32 ? [{ id: 'sq7', title: 'Essay draft', estimate: n, squares: Array<number>(n + 1).fill(1), due: DAY }] : []),
  ];
  return day(shortFirst ? [rows[1]!, rows[0]!, ...rows.slice(2)] : rows);
};
const idleAt2: Scene = { about: '', next: 1, you: 125 * MIN, laps: 5, ghost: tuesday };
// A task's own lengths: an hour of reading is not 25 minutes of drills.
const OWN = { work_ms: 50 * MIN, short_ms: 10 * MIN, long_ms: 30 * MIN };
const swap = (id: string, fields: Partial<DemoTask>) => TASKS.map((task) => (task.id === id ? { ...task, ...fields } : task));
const READING: DemoTask = { id: 'read', title: 'Read one chapter of OSTEP', estimate: 1, due: DAY, repeat: { every: 'day' } };

// Few enough rows that the top of Today and Upcoming are both on a phone's screen.
const FEW = day([...TASKS.filter((task) => ['kr', 'ex', 'react'].includes(task.id)), { id: 'quiz', title: 'Discrete maths quiz 4', project: 'uni', estimate: 2, due: '2026-11-25' }]);

// One task today and one tomorrow: carried up, the tomorrow one needs a "Later today" that is not there yet.
const ONE = day([...TASKS.filter((task) => task.id === 'kr'), { id: 'quiz', title: 'Discrete maths quiz 4', project: 'uni', estimate: 2, due: '2026-11-25' }]);

const TODAY: Record<string, Scene> = {
  'today-empty': { about: 'Today on a first day: nothing yet', next: 0, at: [9, 5], day: { tasks: [] } },
  today: { ...idleAt2, about: 'Today, the day of the mockup, nothing running', day: day() },
  'today-running': { about: 'Today with a lap running on its first task: the task is in the strip and in no list', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'today-running-later': { about: 'A lap running on a task further down: Later closes over its place', run: { ...lap2, task: 'react' }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'today-running-carry': { about: 'A lap running, a Later row carried over the Next card: it is Next before the release', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(), tap: 'demo:carry:Thinking in React' },
  'today-running-deleted': { about: 'The task of a running lap deleted: the strip still names it, and its title opens Recently deleted', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { deleted: new Date(2026, 10, 24, 16, 39).getTime() })) },
  'today-running-gone': { about: 'The task of a running lap deleted for good: the strip says the lap, without the name it had', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { deleted: GONE })) },
  'focus-running-gone': { about: 'The task of a running lap deleted for good: Focus says so, and not its old title', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { deleted: GONE })) },
  'focus-running-deleted': { about: 'The task of a running lap deleted: the lap goes on, named with its project, while it is in Recently deleted', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { deleted: new Date(2026, 10, 24, 16, 39).getTime() })) },
  'today-paused': { about: 'Today with that lap paused', run: { ...onKr, paused: true }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'today-lap-over': { about: 'Today just after the bell: the lap counts everywhere, and the break is one tap away', run: { ...onKr, left: 0 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'today-break': { about: 'Today during a short break', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000 }, you: 150 * MIN, laps: 6, ghost: tuesday, day: day(swap('kr', { squares: [1, 1, 1] }), { done_ms: 150 * MIN, laps: 6 }) },
  'today-done': { ...idleAt2, about: 'Everything on today done', day: day(TASKS.map((task) => ({ ...task, done: true })), { done_ms: 325 * MIN, laps: 13 }) },
  'today-over': { about: 'A task past its estimate: 6 of 5, and running', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { estimate: 5, squares: [1, 1, 1, 0.4, 1, 1, 1] })) },
  'today-long': {
    ...idleAt2,
    about: 'The longest title and the longest project name',
    day: day(swap('kr', { title: LONG_TITLE, project: 'long' }), {
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
  // Held, not let go: the list as it answers a carried row before the release.
  'today-carry-top': { ...idleAt2, about: 'A Later row carried over the Next card: it wears the outline and Start, and what was Next is the first of Later', day: day(), tap: 'demo:carry:Thinking in React' },
  'today-few-upcoming': { ...idleAt2, about: 'Three tasks today and one tomorrow, all in sight on a phone', day: FEW },
  'today-one-upcoming': { ...idleAt2, about: 'One task today and one tomorrow: no Later today yet', day: ONE },
  'today-carry-over-one': { ...idleAt2, about: 'The task of tomorrow carried over the only task of today: Later today comes in over the task it pushes down, while it is held', day: ONE, tap: 'demo:carry:Discrete maths quiz 4' },
  'today-carry-up': { ...idleAt2, about: 'The task of tomorrow carried to the top: it is Next before the release, and Upcoming is gone', day: FEW, tap: 'demo:carry:Discrete maths quiz 4' },
  'today-target': { ...idleAt2, about: 'Changing the day target', day: day(), tap: 'Change' },
  'today-untargeted': { ...idleAt2, about: 'The target removed on another device while its editor is open here: the way to set one is back', day: day(), tap: ['Change', 'demo:untarget'] },
  'today-top': {
    ...idleAt2,
    about: 'Every row with its top in it: an estimate of 32, a task far past its estimate, a 60 character title, a target of 24',
    day: day(
      [
        { id: 'top1', title: SIXTY, project: 'c', estimate: 32, squares: Array<number>(32).fill(1), due: DAY, time: '17:55' },
        { id: 'top2', title: 'Q/A session', project: 'react', estimate: 8, squares: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1], due: DAY, time: '09:00' },
        { id: 'top3', title: SIXTY, project: 'uni', estimate: 32, due: DAY },
        { id: 'top4', title: SIXTY, project: 'next', estimate: 32, squares: Array<number>(32).fill(1), done: true, due: DAY },
        { id: 'top5', title: SIXTY, project: 'c', estimate: 32, due: '2026-11-25', time: '23:59' },
      ],
      { target: 24, laps: 24, done_ms: 600 * MIN },
    ),
  },
  'sheet-top': { ...idleAt2, about: 'The sheet of a task at the top of its estimate: the plus is off', day: day(swap('ex', { estimate: 8, title: SIXTY })), tap: SIXTY },
  'today-stopped': { ...idleAt2, about: 'A day with a stopped lap: the target bar draws it as full as it ran', day: day(TASKS, { fills: [1, 1, 0.5, 1, 0.2] }) },
  'today-laps-9': { ...idleAt2, about: 'Squares where a second line begins: 9 laps, 8 and 1, long title and short', day: squaresDay(9) },
  'today-laps-17': { ...idleAt2, about: 'Squares where a third line begins: 17 laps, 16 and 1, the short title first', day: squaresDay(17, true) },
  'today-laps-32': { ...idleAt2, about: 'The most squares a row draws: 32 laps, 31 and 1', day: squaresDay(32) },
  'today-one': { ...idleAt2, about: 'One open task and nothing else: it has nowhere to go, does not lift, and no hint says it could', day: { tasks: [{ id: 'only', title: 'Exercise 5-3: strcat with pointers', project: 'c', estimate: 2, due: DAY }], target: 8, laps: 5, done_ms: 125 * MIN } },
  'today-ahead': { ...idleAt2, about: 'Upcoming of three days under today, in the same column: one list to the hand', day: day([...TASKS, { id: 'up1', title: 'Hand in the lab report', project: 'uni', estimate: 3, due: '2026-11-25', time: '17:00' }, { id: 'up2', title: 'Read chapter 6', project: 'c', estimate: 2, due: '2026-11-27' }, { id: 'up3', title: 'Book the exam slot', due: '2026-12-01' }]) },
  'today-one-ahead': { ...idleAt2, about: 'One task today and one ahead: the row of today stays, the one ahead can be brought up', day: { tasks: [{ id: 'only', title: 'Exercise 5-3: strcat with pointers', project: 'c', estimate: 2, due: DAY }, { id: 'up1', title: 'Hand in the lab report', project: 'uni', estimate: 3, due: '2026-11-25' }], target: 8, laps: 5, done_ms: 125 * MIN } },
  'today-zoom': { about: 'The smallest row there is: one task with a project and an estimate, for a phone at twice its type size (206 wide)', next: 0, at: [9, 5], day: { tasks: [{ id: 'draft', title: 'chapter 2 draft', project: 'thesis', estimate: 4, due: DAY }], projects: [{ id: 'thesis', name: 'Thesis', color: 'plum' }] } },
  'today-no-target': { ...idleAt2, about: 'No day target set', day: day(TASKS, { target: 0 }) },
  'today-adding': { ...idleAt2, about: 'The quick add in use: the shorthand as an example, under the field', day: day(), tap: 'focus:task' },
  'sheet-own': { ...idleAt2, about: 'A task given its own lengths: three steppers that start from those of the account', day: day(), tap: ['Exercise 5-3', 'Its own'] },
  'sheet-own-set': { ...idleAt2, about: 'A task whose own lengths are 50, 10 and 30 minutes', day: day(swap('ex', OWN)), tap: 'Exercise 5-3' },
  'today-added': { ...idleAt2, about: 'Just after quick add', day: day(), tap: 'demo:add' },
  'today-after-done': { ...idleAt2, about: 'Just after marking a task done: Undo', day: day(), tap: 'Done: Exercise 5-3' },
  'today-after-repeat': { ...idleAt2, about: 'A repeating task done: it says when it comes back', day: day([...TASKS, READING]), tap: 'Done: Read one chapter' },
  'today-after-delete': { ...idleAt2, about: 'Just after deleting a task: Undo', day: day(), tap: ['Exercise 5-3', 'Delete'] },
  'today-purging': {
    ...idleAt2,
    about: 'Recently deleted: Delete for good, asked once more before it is done',
    day: day([...TASKS, { id: 'old1', title: 'Install a C compiler', project: 'c', estimate: 1, squares: [1], deleted: new Date(2026, 10, 22, 21).getTime() }]),
    tap: ['Recently deleted', 'Delete for good'],
  },
  'sheet-project-gone': { ...idleAt2, about: 'A project deleted on another device while it was being edited here: the form closes', day: day(), tap: ['Exercise 5-3', 'Edit project', 'demo:unproject'] },
  'sheet-project-edit': { ...idleAt2, about: 'A project being edited where it is chosen: its name and colour, Done, and Delete project', day: day(), tap: ['Exercise 5-3', 'Edit project'] },
  'today-subtasks': {
    ...idleAt2,
    about: 'A task with subtasks says so on its row',
    day: day([...TASKS, { id: 'sub1', title: 'Write it with array indexes first', parent: 'ex', done: true }, { id: 'sub2', title: 'Rewrite with two pointers', parent: 'ex' }, { id: 'sub3', title: 'Test with an empty string', parent: 'ex' }]),
  },
  'today-360': { about: 'Today with a six hour lap on its strip: hours on the strip too', run: { ...onKr, planned: 360 * MIN, left: 360 * MIN - 1000 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'today-99': { about: 'Today with a lap of 99 minutes on its strip: the widest the clock is without hours', run: { ...onKr, planned: 99 * MIN, left: 99 * MIN }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
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
  'sheet-nudge': { ...idleAt2, about: 'The sheet with an estimate over 7', day: day(swap('ex', { estimate: 8 })), tap: 'Exercise 5-3' },
  'sheet-project': { ...idleAt2, about: 'The sheet making a new project', day: day(), tap: ['Exercise 5-3', 'New project'] },
  'today-timed': { ...idleAt2, about: 'Tasks with a time: today at 16:40, and one tomorrow', day: day([...swap('ex', { time: '16:40' }), { id: 'viva', title: 'Viva practice with Sachi', project: 'uni', estimate: 1, due: '2026-11-25', time: '09:30' }]) },
  'sheet-time': { ...idleAt2, about: 'The sheet of a task with a time: the day, the time, and No time', day: day(swap('ex', { time: '16:40' })), tap: 'Exercise 5-3' },
  'sheet-time-app': { ...idleAt2, about: 'The same in the phone app, which reminds at that minute', phoneApp: true, day: day(swap('ex', { time: '16:40' })), tap: 'Exercise 5-3' },
  'today-picked': { ...idleAt2, about: 'A project in a colour the person picked: its square inside a hair line', day: day(TASKS, { projects: PROJECTS.map((project) => (project.id === 'c' ? { ...project, color: PICKED } : project)) }) },
  'sheet-picked': { ...idleAt2, about: 'A new project in a picked colour: Pick, the thirteenth square, carries it, and the two sliders stand under the squares', day: day(), tap: ['Exercise 5-3', 'New project', 'Pick', 'fill:hue=210'] },
  'sheet-repeat': { ...idleAt2, about: 'The sheet with a repeat on chosen days', day: day(swap('ex', { repeat: { every: 'week', days: 0b0010101 } })), tap: 'Exercise 5-3' },
  // An estimate of five here, so the bar cannot be taken for the set of four.
  'focus-next': { ...idleAt2, about: 'Focus idle, naming the task the next lap is for: five segments, two of them full', day: day(swap('kr', { estimate: 5 })) },
  'focus-task': { about: 'Focus with a lap running on a task: its bar, the running lap growing in the third segment', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { estimate: 5 })) },
  'focus-task-paused': { about: 'That lap paused: said once, under the digits; the line over the bar is empty', run: { ...onKr, paused: true }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { estimate: 5 })) },
  'focus-past-estimate': { about: 'A lap running on a task past its estimate of 2: a segment for each lap, four in all', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { estimate: 2, squares: [1, 1, 0.5] })) },
  'focus-no-estimate': { ...idleAt2, about: 'The next task has no estimate: no bar, and the digits where they always are', day: day(swap('kr', { estimate: undefined })) },
  'focus-no-estimate-running': { about: 'A lap running on a task with no estimate: no bar, no count beside the project', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { estimate: undefined })) },
  'focus-all-in': { about: "The task's last estimated lap just rang: its bar stands tall", run: { ...onKr, left: 0 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', { estimate: 3 })) },
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
  'progress-one-lap': { ...week, about: 'Progress with one lap counted today: taking it out changes the heading, the week and the streak above the timeline', record: { today: 25 } },
  'progress-first-day': { about: 'Progress on a first day: nothing to compare, one square', next: 1, at: [10, 50], you: 25 * MIN, laps: 1, record: { history: 'day', today: 25, scripted: false } },
  'progress-nothing': { about: 'Progress before the first lap', next: 0, at: [9, 5], record: { history: 'none', scripted: false } },
  'progress-first-week': { ...week, about: 'Progress in a first week: no last week to race', record: { history: 'week' } },
  'progress-year': { ...week, about: 'A year and a week of record: the grid opens on its newest weeks', record: { history: 'year' } },
  'progress-run': { ...week, about: 'A streak with no rest day in its last fortnight', record: { fill: ['2026-11-11', '2026-11-19'] } },
  'progress-miss': { ...week, about: 'A miss inside the last 45 days: days kept of days, not the run', record: { empty: ['2026-11-12'] } },
  'progress-running': { about: 'Progress with a lap running: the day list ends on it, running and growing, with nothing to set aside', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(), record: {} },
  'progress-paused': { about: 'Progress with the lap paused: the day list ends on it, said as paused, up to the pause', run: { ...onKr, paused: true }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(), record: { live: 'paused' } },
  'progress-to-today': { ...week, about: 'Progress scrolled to its foot, then Today from the bar: Today opens at its top', record: {}, tap: ['demo:end', 'css:nav a[href="#/today"]'] },
  'progress-day': { ...week, about: 'A day chosen in the year: its timeline, and the way back to today', record: {}, tap: 'demo:day' },
  'progress-earlier': { about: 'The twelve sessions of today and the lap in progress, opened from the five latest', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(), record: {}, tap: '8 earlier today' },
  'progress-aside': { ...week, about: 'Just after a lap is set aside in the timeline: Undo', record: {}, tap: "Don't count it" },
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
  'habits-part-past': { ...week, about: 'A habit done twice a day, once yesterday and once so far today: both days half filled', habits: [{ id: 'drink', title: 'Drink water', target: 2, counts: { '2026-11-23': 1, '2026-11-24': 1 } }, ...HABITS] },
  'habits-checked': { ...week, about: 'Just after a check-in on a counted habit: Undo', habits: HABITS, tap: 'Check in: A glass of water' },
  'habits-all': { ...week, about: 'Every habit of today done', habits: HABITS.map((habit) => ({ ...habit, counts: { ...habit.counts, '2026-11-24': habit.target ?? 1 } })) },
  'habits-sheet': { ...week, about: 'A habit open: days, count, reminder, its record', habits: HABITS, tap: 'Push one commit' },
  'habits-sheet-twice': { ...week, about: 'A habit done twice a day: a reminder for each time', habits: [{ id: 'teeth', title: 'Brush teeth', target: 2, reminds: ['06:00', '22:00'], counts: { '2026-11-24': 1, '2026-11-23': 2 } }, ...HABITS], tap: 'Brush teeth' },
  'habits-adding': { ...week, about: 'The habit quick add in use: what a new habit starts as, under the field', habits: HABITS, tap: 'focus:habit' },
  'habits-added': { ...week, about: 'Just after adding a habit: the bar says so', habits: HABITS, tap: ['fill:habit=Stretch for two minutes', 'submit:habit'] },
  'habits-reminders-removed': { ...week, about: 'Every reminder of a habit removed in one tap: said in the sheet, with Undo', habits: [{ id: 'teeth', title: 'Brush teeth', target: 2, reminds: ['06:00', '22:00'], counts: { '2026-11-24': 1 } }, ...HABITS], tap: ['Brush teeth', 'Remove the reminders'] },
  'habits-sheet-thrice': { ...week, about: 'Three times a day with one reminder set: the others stay empty', habits: [{ id: 'teeth', title: 'A glass of water', target: 3, reminds: ['13:00'], counts: {} }], tap: 'A glass of water' },
  'habits-sheet-20': { ...week, about: 'Twenty times a day with two reminders set: those two fields and one empty one', habits: [{ id: 'teeth', title: SIXTY, target: 20, reminds: ['06:00', '22:00'], counts: { '2026-11-24': 3 } }], tap: 'Write up' },
  'habits-sheet-20-set': { ...week, about: 'The most reminders there are: twenty times a day, a time for each', habits: [{ id: 'teeth', title: SIXTY, target: 20, reminds: Array.from({ length: 20 }, (_, i) => `${String(i + 4).padStart(2, '0')}:30`), counts: { '2026-11-24': 3 } }], tap: 'Write up' },
  'habits-sheet-new': { ...week, about: 'A habit open that has no check-in yet', habits: [{ id: 'read', title: 'Read 10 pages of K&R', counts: {} }], tap: 'Read 10 pages' },
  'habits-archived': { ...week, about: 'Archived habits, behind their link', habits: HABITS, tap: 'Archived' },
  'habits-deleted': { ...week, about: 'Recently deleted habits', habits: HABITS, tap: 'Recently deleted' },
  'habits-after-delete': { ...week, about: 'Just after deleting a habit: Undo', habits: HABITS, tap: ['Lights out', 'Delete'] },
  'habits-top': { ...week, about: 'A habit at the top of its count, with a 60 character title', habits: [{ ...HABITS[0]!, title: SIXTY, target: 20, counts: { '2026-11-24': 20, '2026-11-23': 20 } }, ...HABITS.slice(1)] },
  'habits-many': { ...week, about: 'Ten habits, one with a very long title', habits: MANY_HABITS },
};

// Room: no room first, then a room of one, the mockup's four, and eight.
const shortBreak = { phase: 'short', lap: 1, left: 2 * MIN + 58000 } as const;
const ROOM_SCENES: Record<string, Scene> = {
  'room-none': { ...week, about: 'Room: not in one yet', room: { rooms: 'none' } },
  'room-none-offline': { ...week, about: 'Not in a room, and no connection', sync: 'offline', room: { rooms: 'none', stale: true } },
  'room-alone': { ...week, about: 'A room of one', run: onKr, room: { members: 'alone' } },
  room: { ...week, about: 'Room: four friends, one cheer given, one away', run: onKr, room: {} },
  'room-cheered': { ...week, about: 'Just after a cheer: the round button turns to the tinted circle, and the line says who cheered', run: onKr, room: {}, tap: 'css:[aria-label^="Cheer"]' },
  'room-ranked': { ...week, about: 'A room that has switched its order on', run: onKr, room: { ranked: true } },
  'room-eight': { ...week, about: 'Eight members, a long name, a long task title', run: onKr, room: { members: 'eight', name: 'Second years, block C, the ones who stay up' } },
  'room-stale': { ...week, about: 'No connection: the room as it was last heard from', run: onKr, sync: 'offline', room: { stale: true } },
  'room-two': { ...week, about: 'In two rooms', run: onKr, room: { rooms: 'two' } },
  'room-sheet': { ...week, about: 'The room as its keeper sees it: its code, name, target, order and the way out', run: onKr, room: {}, tap: 'Code and settings' },
  'room-sheet-member': { ...week, about: 'The room as a member sees it: the code to copy, the rest as words and who can change them, and the way out', run: onKr, room: { keeper: 'sachi', ranked: true }, tap: 'Code and settings' },
  'room-sheet-member-no-target': { ...week, about: 'A member of a room with no weekly target, in the order people joined', run: onKr, room: { keeper: 'sachi', target: 0 }, tap: 'Code and settings' },
  'room-leaving': { ...week, about: 'Leaving, the second tap', run: onKr, room: {}, tap: ['Code and settings', 'Leave the room'] },
  'room-another': { ...week, about: 'Making or joining another room', run: onKr, room: {}, tap: 'Make or join' },
  'room-hidden': { ...week, about: 'Rooms hidden: Room leaves the navigation', room: {}, prefs: { rooms_hidden: true } },
  // Section 22, the room as chosen: on a break with a lap called, on a lap started together, and each tab.
  'room-call': { ...week, about: 'On a break, sachi has called a lap: the call over the bottom bar, I am in, a note waiting', run: shortBreak, room: { onBreak: true, keeper: 'sachi', call: 'theirs', newNotes: 1, pictures: true } },
  'room-call-in': { ...week, about: 'A called lap you are in: I am out, and your circle at its start in your lane', run: shortBreak, room: { onBreak: true, keeper: 'sachi', call: 'in', pictures: true } },
  'room-call-said': { ...week, about: 'A lap called, and the bar that says what a tap did: it rises over the call', run: shortBreak, room: { onBreak: true, keeper: 'sachi', call: 'theirs', pictures: true }, tap: 'demo:say' },
  'room-call-mine': { ...week, about: 'A lap you called: you can call it off', run: shortBreak, room: { onBreak: true, call: 'mine', pictures: true } },
  'room-together': { ...week, about: 'On a lap started together: the line that says so, and two notes waiting', run: { ...onKr, id: 'call-c1' }, room: { keeper: 'sachi', newNotes: 2, pictures: true } },
  'room-no-call': { ...week, about: 'On a break, no lap called: the way to call one', run: shortBreak, room: { onBreak: true, keeper: 'sachi', pictures: true } },
  'room-calling': { ...week, about: 'Calling a lap: how many minutes from now', run: shortBreak, room: { onBreak: true, keeper: 'sachi', pictures: true }, tap: 'Call a lap together' },
  'room-notes': { ...week, about: 'Notes on a break: open, so the count is gone; the new one says so', run: shortBreak, room: { onBreak: true, keeper: 'sachi', call: 'theirs', newNotes: 1, pictures: true }, tap: 'Notes' },
  'room-notes-lap': { ...week, about: 'Notes on a lap: folded, two waiting', run: onKr, room: { keeper: 'sachi', newNotes: 2, pictures: true }, tap: 'Notes' },
  'room-notes-empty': { ...week, about: 'Notes with none this week', run: shortBreak, room: { onBreak: true, keeper: 'sachi', noNotes: true, pictures: true }, tap: 'Notes' },
  'room-week': { ...week, about: 'Week on a break: ahead of last week, the chart with its target, the streak and your part', run: shortBreak, room: { onBreak: true, keeper: 'sachi', call: 'theirs', newNotes: 1, pictures: true, target: 30 }, tap: 'Week' },
  'room-week-lap': { ...week, about: 'Week on a lap', run: onKr, room: { keeper: 'sachi', newNotes: 2, pictures: true, target: 30 }, tap: 'Week' },
  'room-report': { ...week, about: 'A person\'s report: their day on the lane from their first lap, and their week against their own last', run: shortBreak, room: { onBreak: true, keeper: 'sachi', call: 'theirs', pictures: true }, tap: 'css:button[aria-label^="sachi:"]' },
  'room-report-you': { ...week, about: 'Your own report: the split chip and what your next lap would do', run: shortBreak, room: { onBreak: true, keeper: 'sachi' }, tap: 'css:button[aria-label^="You:"]' },
  'room-report-away': { ...week, about: 'The report of someone away: no laps yet today, and the week as a figure only', run: shortBreak, room: { onBreak: true, keeper: 'sachi' }, tap: 'css:button[aria-label^="amaya:"]' },
  'room-letters': { ...week, about: 'No pictures: everyone in their colour and letters, a two-part name in two', run: onKr, room: { members: 'eight', name: 'Second years, block C, the ones who stay up' } },
  'room-sixteen': { ...week, about: 'The most a room holds, sixteen: laps, breaks, away, pictures and cheers, the hours over sixteen panels', run: onKr, room: { members: 'sixteen', pictures: true, target: 300, keeper: 'sachi' } },
  'room-sixteen-week': { ...week, about: 'Sixteen people: the room\'s week', run: onKr, room: { members: 'sixteen', pictures: true, target: 300, keeper: 'sachi' }, tap: 'Week' },
  'room-sixteen-sheet': { ...week, about: 'Sixteen people: the keeper\'s sheet, who is in, each with Remove', run: onKr, room: { members: 'sixteen', pictures: true, target: 300 }, tap: 'Code and settings' },
  'room-pictures-unfetched': { ...week, about: 'Pictures the server answers nothing for (offline, gone): each circle shows its letters', run: onKr, room: { pictures: 'unfetched' } },
  'room-pictures-broken': { ...week, about: 'Pictures that fail to load: each circle falls back to its initial', run: onKr, room: { pictures: 'broken' } },
  'room-sheet-remove': { ...week, about: 'The keeper\'s sheet: who is in, each with Remove, asked twice', run: onKr, room: { pictures: true }, tap: ['Code and settings', 'Remove'] },
};

// Settings in full, and the marks in their moments.
const lapOver = { phase: 'work', lap: 1, left: 0 } as const;
const MORE: Record<string, Scene> = {
  'settings-ring-blocked': { ...idleAt2, about: 'Settings on a device that will not let heirloom notify: the bell says why it cannot ring', settings: true, day: day(), ringBlocked: true },
  'settings-over': { ...idleAt2, about: 'A lap length kept by an earlier build, over the top there is now: shown and stepped from 360', settings: true, day: day(), prefs: { work_ms: 400 * MIN } },
  'settings-top': { ...idleAt2, about: 'Settings with every number at its top: each plus is off', settings: true, day: day(), prefs: { work_ms: 360 * MIN, short_ms: 60 * MIN, long_ms: 60 * MIN, day_target: 24 } },
  'settings-changed': { ...idleAt2, about: 'Settings with most things changed', settings: true, day: day(), prefs: { work_ms: 50 * MIN, short_ms: 10 * MIN, long_ms: 30 * MIN, auto_break: true, auto_work: true, celebrate: false, day_target: 0, share_task: true } },
  'settings-phone-app': { ...idleAt2, about: 'Settings in the phone app, where a copy cannot be saved to a file', settings: true, day: day(), phoneApp: true },
  'mark-first': { about: 'The first lap ever: its mark, under the result', run: { phase: 'work', lap: 0, left: 0 }, you: 0, laps: 0, marks: [{ key: 'laps-1', kind: 'laps', tier: 1 }] },
  'mark-hundred': { about: 'Lap 100, a best week, and a cheer', run: lapOver, you: 125 * MIN, laps: 5, ghost: tuesday, marks: [{ key: 'laps-100', kind: 'laps', tier: 100 }, { key: 'week-2026-11-23', kind: 'week', focus_ms: 1075 * MIN, before_ms: 1050 * MIN }], cheered: ['sachi', 'dilan'] },
  'mark-off': { about: 'The same lap with celebrations off', run: lapOver, you: 125 * MIN, laps: 5, ghost: tuesday, marks: [{ key: 'laps-100', kind: 'laps', tier: 100 }], prefs: { celebrate: false } },
  'mark-estimate': { ...idleAt2, about: 'A task done inside its estimate: its mark on Today', today: true, day: day(), marks: [{ key: 'estimate-react', kind: 'estimate', task: 'react', title: 'Thinking in React, steps 1 to 3', estimate: 2, laps: 1 }], tap: 'Done: Thinking in React' },
  ...Object.fromEntries([4, 25, 250, 500, 1000, 2500].map((tier) => [`mark-${tier}`, { about: `Lap ${tier}`, run: lapOver, you: 125 * MIN, laps: 5, ghost: tuesday, marks: [{ key: `laps-${tier}`, kind: 'laps', tier }] } as Scene])),
};

// Section 10: which server, a fresh server, an invite link, and who may invite.
const LAN = 'http://192.168.1.20:8787';
const asked = (typed: string) => [`fill:server=${typed}`, 'submit:server'];
const owner: Scene = { ...idleAt2, about: '', settings: true, day: day(), role: 'owner' };
const SERVER: Record<string, Scene> = {
  welcome: { about: 'The phone app, first opened: seven weeks drawn, why it asks for a server, and the way to one', welcome: true },
  'welcome-server': { about: 'From the welcome to the server step, which has the way back', welcome: true, tap: 'Connect to a server' },
  'signin-wrong': { about: 'A wrong password: the error on its own line above the buttons, the intro untouched', signedOut: true, tap: ['fill:username=sachi', 'fill:password=credentials', 'submit:username'] },
  'join-wrong': { about: 'Joining with an invite the server does not know: the error above the buttons, every hint still there', signedOut: true, tap: ['I have an invite', 'fill:invite=k3J9xQ7mPa2f8Lw0', 'fill:username=sachi', 'fill:password=invite', 'submit:username'] },
  server: { about: 'The phone app asks for its server', serverStep: {} },
  'server-invalid': { about: 'What was typed is not an address', serverStep: { refusal: 'invalid' }, tap: asked('my server') },
  'server-unreachable': { about: 'Nothing answers at the address', serverStep: { refusal: 'unreachable' }, tap: asked('192.168.1.20:8787') },
  'server-other': { about: 'Something answers, but it is not heirloom', serverStep: { refusal: 'not-heirloom' }, tap: asked('192.168.1.1') },
  'server-signed-in': { about: 'Changing the server with an account open', serverStep: { address: 'https://heirloom.example', refusal: 'signed-in' }, tap: 'submit:server' },
  'server-busy': { about: 'The server is being asked', serverStep: { busy: true }, tap: asked('heirloom.example') },
  'server-plain': { about: 'Changing from a plain http address', serverStep: { address: LAN } },
  setup: { about: 'A server with no account yet: its first account', signedOut: true, fresh: true },
  'setup-taken': { about: 'Two on a fresh server at once: the second is told, and signs in', signedOut: true, fresh: true, taken: 'bad_request', tap: ['fill:username=sachi', 'fill:password=long enough', 'submit:username'] },
  'setup-unanswered': { about: 'The server does not say whether it is fresh: the frame alone, then sign in at 400 ms', signedOut: true, fresh: 'never' },
  'setup-late': { about: 'A fresh server that answers after a second: sign in, then it turns into setup', signedOut: true, fresh: 'late' },
  'join-link': { about: 'Arrived by an invite link', signedOut: true, join: 'k3J9xQ7mPa2f8Lw0' },
  'join-link-refused': { about: 'An invite link the server will not take: the ordinary form', signedOut: true, join: 'refused', tap: ['fill:username=sachi', 'fill:password=long enough', 'submit:username'] },
  'signin-phone': { about: 'Sign in, in the phone app: the server named, with Change', signedOut: true, serverAt: 'https://heirloom.example' },
  'signin-phone-plain': { about: 'Sign in, in the phone app, on a plain http server', signedOut: true, serverAt: LAN },
  'settings-owner': { ...owner, about: 'Settings as the owner: no invite open, two admins', admins: ['dilan', 'sachi'] },
  'settings-owner-invites': { ...owner, about: 'The owner with three invites, one just made and shown whole', invites: 2, admins: ['dilan', 'sachi'], tap: 'Make an invite link' },
  'settings-owner-unknown': { ...owner, about: 'Making an admin of a name nobody has here', admins: ['sachi'], tap: ['fill:admin=nobody_here', 'submit:admin'] },
  'settings-owner-lowered': { ...owner, about: 'Just after an admin was made a member again: Undo', admins: ['dilan', 'sachi'], tap: 'Back to member' },
  'settings-admin': { ...owner, about: 'Settings as an admin: invites, and no say over admins', role: 'admin', invites: 3 },
  'settings-admin-taking': { ...owner, about: 'Taking an invite back: the second tap', role: 'admin', invites: 3, tap: 'Take back' },
  'settings-demoted': { ...owner, about: 'An admin the owner has made a member again, before the server said so here', role: 'admin', invites: 'forbidden' },
  'settings-signed-out': { ...owner, about: 'An admin whose device the server signed out asks for a link', role: 'admin', sync: 'signed-out', invites: 'token', tap: 'Make an invite link' },
  'signin-phone-invite': { about: 'The phone app, started from a pasted invite link: the invite is in hand', signedOut: true, serverAt: 'https://heirloom.example', held: 'k3J9xQ7mPa2f8Lw0' },
  'settings-owner-reset': { ...owner, about: 'A reset link just made: shown whole, once, with whose it is', admins: ['sachi'], resets: 2, tap: ['fill:reset=dilan', 'submit:reset'] },
  'settings-owner-resets': { ...owner, about: 'Two reset links open, each with when it runs out', admins: ['sachi'], resets: 2 },
  'settings-owner-resets-taking': { ...owner, about: 'Taking a reset link back: the second tap', admins: ['sachi'], resets: 2, tap: 'Take back' },
  'settings-owner-reset-unknown': { ...owner, about: 'A reset link for a name nobody has here', admins: ['sachi'], tap: ['fill:reset=nobody_here', 'submit:reset'] },
  'settings-owner-reset-own': { ...owner, about: 'A reset link for the owner: the way is the server\'s own command', admins: ['sachi'], tap: ['fill:reset=ravi', 'submit:reset'] },
  reset: { about: 'A reset link opened, signed out: whose password, one field, one button', signedOut: true, reset: 'q7XkVb3n0Pz8Lw2mRt5YcH1aJe9sKd4fUg6oNi0QxBy' },
  'reset-short': { about: 'A new password that is too short', signedOut: true, reset: 'q7XkVb3n0Pz8Lw2mRt5YcH1aJe9sKd4fUg6oNi0QxBy', tap: ['fill:password=short', 'submit:password'] },
  'reset-dead': { about: 'A reset link that no longer works', signedOut: true, reset: 'dead' },
  'reset-signed-in': { ...idleAt2, about: 'A reset link opened where an account is open: sign out first', day: day(), reset: 'q7XkVb3n0Pz8Lw2mRt5YcH1aJe9sKd4fUg6oNi0QxBy' },
  'signin-phone-reset-pasted': { about: 'A reset link pasted where the phone app asks for an invite: it is for a browser', signedOut: true, serverAt: 'https://heirloom.example', tap: ['I have an invite', 'fill:invite=https://heirloom.example/#/reset/q7XkVb3n0Pz8Lw2mRt5YcH1aJe9sKd4fUg6oNi0QxBy', 'fill:username=sachi', 'fill:password=long enough', 'submit:username'] },
  'settings-picture': { ...idleAt2, about: 'Settings with your picture set: shown in the account and the header, with the way to change it or take it off', settings: true, day: day(), room: { pictures: true } },
  'settings-about': { ...idleAt2, about: 'Settings scrolled to its foot: About, with the version, the build and the source', settings: true, day: day(), tap: 'demo:end' },
  'settings-plain': { ...owner, about: 'Settings in the phone app on a plain http server', role: 'member', serverAt: LAN },
};

const SCENES: Record<string, Scene> = {
  ...TODAY,
  ...SERVER,
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
  stopped: { about: 'Lap 2 just stopped at 6 minutes: one Stop, the line that says what it did, and its segment as full as it ran', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, tap: 'Stop' },
  'lap-one-done': { about: 'Lap 1 just over: one segment full, and no second one begun', run: { phase: 'work', lap: 0, left: 0 }, you: 25 * MIN, laps: 1, ghost: tuesday },
  'lap-ahead': { about: 'Lap 2 just over, 6 minutes ahead', run: { ...lap2, left: 0 }, you: 131 * MIN, laps: 5, ghost: tuesday },
  'lap-behind': { about: 'Lap 2 just over, 19 minutes behind', run: { ...lap2, left: 0 }, you: 106 * MIN, laps: 4, ghost: tuesday },
  'lap-first-day': { about: 'Lap 1 just over, no ghost yet', run: { phase: 'work', lap: 0, left: 0 } },
  'set-done': { about: 'The fourth lap in a row just over: its moment, and the long break', run: { phase: 'work', lap: 3, left: 0 }, you: 175 * MIN, laps: 7, ghost: tuesday },
  'done-for-now': { about: 'After a bell, Done for now: the timer at rest, and the line that says so', run: { ...lap2, left: 0 }, you: 131 * MIN, laps: 5, ghost: tuesday, tap: 'Done for now' },
  'break-done-for-now': { about: 'In a break, Done for now', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000 }, you: 150 * MIN, laps: 6, ghost: tuesday, tap: 'Done for now' },
  'focus-360-top': { about: 'The longest lap there is, running: no more minutes on offer', run: { ...onKr, planned: 360 * MIN, left: 200 * MIN }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'focus-99': { about: 'A lap of 99 minutes: four wide digits, the widest the clock is without hours', run: { ...lap2, planned: 99 * MIN, left: 99 * MIN }, you: 125 * MIN, laps: 5, ghost: tuesday },
  break: { about: 'A short break running', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000 }, you: 150 * MIN, laps: 6, ghost: tuesday },
  'focus-task': { ...idleAt2, about: 'Before a start, with tasks: the two lines over the digits are the way to choose, and there is one Start', day: day() },
  'focus-choose': { ...idleAt2, about: 'Choosing what the lap is for: the open tasks of today in order, then nothing in particular', day: day(), tap: 'css:[aria-haspopup=dialog]' },
  'focus-chosen': { ...idleAt2, about: 'A task chosen that was not the next one', day: day(), tap: ['css:[aria-haspopup=dialog]', 'Exercise 5-3'] },
  'focus-nothing': { ...idleAt2, about: 'Nothing in particular chosen: the same two lines say so', day: day(), tap: ['css:[aria-haspopup=dialog]', 'Nothing in particular'] },
  'focus-top': { ...idleAt2, about: 'Before a start with rows at their top: a 60 character title over the digits and in Up next, 32 laps', day: squaresDay(32) },
  'focus-choose-top': { ...idleAt2, about: 'Choosing among rows at their top: 32 laps and 60 character titles', day: squaresDay(32), tap: 'css:[aria-haspopup=dialog]' },
  'focus-own': { ...idleAt2, about: 'The next task has its own lengths: the digits, the end and the line that says so', day: day(swap('kr', OWN)) },
  'lap-done-own': { about: 'A lap over on a task with its own lengths: the break offered is the one that task has', run: { ...onKr, planned: 50 * MIN, left: 0 }, you: 131 * MIN, laps: 5, ghost: tuesday, day: day(swap('kr', OWN)) },
  'long-break-paused': { about: 'The long break held: its name over the bar, and paused said under the digits', run: { phase: 'long', lap: 3, left: 11 * MIN + 5000, paused: true }, you: 200 * MIN, laps: 8, ghost: tuesday },
  'focus-360': { ...idleAt2, about: 'A lap of 360 minutes, the longest there is, before its start: the timer reads hours', day: day(swap('kr', { work_ms: 360 * MIN })) },
  'focus-360-running': { about: 'That lap a second in: seven characters, 5:59:59', run: { ...onKr, planned: 360 * MIN, left: 360 * MIN - 1000 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'focus-100-running': { about: 'A long lap with 100 minutes left: the last moment it reads hours, 1:40:00', run: { ...onKr, planned: 360 * MIN, left: 100 * MIN }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'focus-99-running': { about: 'The same lap just under 100 minutes: minutes and seconds again', run: { ...onKr, planned: 360 * MIN, left: 100 * MIN - 1000 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'focus-yesterday': { about: 'A long lap begun before midnight and still running: it counts on the day it began', at: [0, 20], run: { ...onKr, planned: 360 * MIN, left: 280 * MIN }, you: 0, laps: 0, ghost: tuesday, day: day(TASKS, { laps: 0, done_ms: 0 }) },
  'focus-choose-started': { ...idleAt2, about: 'A lap started on another device while the chooser was open: the chooser closes and Focus is on that lap', day: day(), tap: ['css:[aria-haspopup=dialog]', 'demo:start'] },
  'focus-yesterday-done': { about: 'A lap begun before midnight whose bell has gone: it is said as yesterday\'s, and the day\'s count is not said beside it', at: [0, 10], run: { ...onKr, left: 0 }, you: 0, laps: 0, ghost: tuesday, day: day(TASKS, { laps: 0, done_ms: 0 }) },
  'focus-yesterday-stopped': { about: 'That long lap stopped: the line names it as yesterday\'s and says how far it ran as the clock would', at: [0, 20], run: { ...onKr, planned: 360 * MIN, left: 280 * MIN }, you: 0, laps: 0, ghost: tuesday, day: day(TASKS, { laps: 0, done_ms: 0 }), tap: 'Stop' },
  'focus-taken-back': { about: 'A lap stopped twenty seconds in: a start taken back, said as that and never numbered', run: { ...onKr, left: 25 * MIN - 20000 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(), tap: 'Stop' },
  'today-taken-back': { about: 'The task marked done twenty seconds into its lap, from its sheet opened by the strip: the bar says it is done and that the lap was not counted', run: { ...onKr, left: 25 * MIN - 20000 }, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(), today: true, tap: ['K&R 5.1', 'Mark done'] },
  'stopped-elsewhere': { about: 'A lap stopped from the notification: Focus says so and offers Undo, as after its own Stop', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day(), tap: 'demo:stop' },
  'running-task': { about: 'A lap running on a task: the two lines are words', run: onKr, you: 125 * MIN, laps: 5, ghost: tuesday, day: day() },
  'break-task': { about: 'A short break with tasks: the lines name the task the next lap is for', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000 }, you: 150 * MIN, laps: 6, ghost: tuesday, day: day() },
  'break-paused': { about: 'A short break held: the right end names the set', run: { phase: 'short', lap: 1, left: 3 * MIN + 20000, paused: true }, you: 150 * MIN, laps: 6, ghost: tuesday },
  'break-over': { about: 'A short break that is over', run: { phase: 'short', lap: 1, left: 0 }, you: 150 * MIN, laps: 6, ghost: tuesday },
  'long-break': { about: 'The long break running', run: { phase: 'long', lap: 3, left: 11 * MIN + 5000 }, you: 200 * MIN, laps: 8, ghost: tuesday },
  offline: { about: 'No connection, 3 edits unsent', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, sync: 'offline', unsent: 3 },
  'next-day': { about: 'Opened the morning after a lap that rang last night', at: [9, 5], run: { ...lap2, left: 0 }, ghost: [5 * MIN, 200 * MIN], newDay: true },
  unsaved: { about: 'The store is refusing writes', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, unsaved: true },
  'unsaved-offline': { about: 'No connection and the store refusing writes: the worst case', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, unsaved: true, sync: 'offline', unsent: 3 },
  refused: { about: 'The server signed this device out', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, sync: 'signed-out' },
  'long-title': { about: 'A lap on the longest task title', run: { ...lap2, task: 'long' }, you: 125 * MIN, laps: 5, ghost: tuesday },
  'undo-stop': { about: 'Just stopped: the sentence, and Undo for ten seconds', run: lap2, you: 125 * MIN, laps: 5, ghost: tuesday, tap: 'Stop' },
  elsewhere: { about: 'A second tab of the same browser', elsewhere: true },
  settings: { ...idleAt2, about: 'Settings: the account', settings: true, day: day() },
  'settings-refused': { ...idleAt2, about: 'Settings after the server signed this device out', settings: true, sync: 'signed-out', day: day() },
  'settings-unsent': { ...idleAt2, about: 'Settings: a sign out refused, edits unsent', settings: true, sync: 'offline', unsent: 3, day: day(), tap: 'Sign out' },
  'lap-live': { about: 'Three seconds before the bell: watch the lap-done moment', run: { ...lap2, left: 3000 }, you: 106 * MIN, laps: 4, ghost: tuesday },
  'set-live-past': { about: 'The same bell on a day past its target of five: the last four segments drawn light, not ones the bar does not have', run: { phase: 'work', lap: 3, left: 3000 }, you: 175 * MIN, laps: 7, ghost: tuesday, day: day(TASKS, { target: 5, laps: 7 }) },
  'set-live': { about: 'Three seconds before the bell of lap 4: watch the set-done moment', run: { phase: 'work', lap: 3, left: 3000 }, you: 175 * MIN, laps: 7, ghost: tuesday },
};

function stage(scene: Scene): { engine: Engine; focus: Focus; today: Today; progress: Progress; habits: Habits; rooms: Rooms; settings: Settings; invites: Invites; admins: Admins; resets: Resets; server?: ServerChoice } {
  const [hour, minute] = scene.at ?? [16, 40];
  const opened = Date.now();
  const start = new Date(2026, 10, 24, hour, minute, 18).getTime();
  const now = () => start + Date.now() - opened;

  const run = scene.run;
  const planned = run ? (run.planned ?? LENGTHS[`${run.phase}_ms`]) : 0;
  const state = signal<TimerState>(
    run
      ? {
          phase: run.phase,
          run: run.id ?? 'demo-0',
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
  // A lap begun before midnight is yesterday's: none of today's focus and none of today's laps, as the real count has it.
  const mine = () => lapOpen() && new Date(state.value.started ?? 0).getDate() === new Date(now()).getDate();
  // How full each lap of this set that was stopped is, by its place in the set. One that rang is whole.
  const part = new Map<number, number>();
  // What the real one does when a run ends: a lap that rang counts, and a stopped one keeps its
  // minutes and its place in the set, as full as it ran.
  const close = () => {
    if (!lapOpen()) return;
    const task = state.value.task;
    // One begun before midnight is yesterday's: the task has its square, and today nothing.
    // And one stopped in its first minute is a start taken back: it leaves nothing anywhere.
    if (!over() && ran() < MIN) return;
    const here = mine();
    if (here && over()) laps++;
    else if (here) part.set(state.value.set_index, ran() / state.value.planned_ms);
    if (here) you += ran();
    today.credit(task, over() ? 1 : ran() / state.value.planned_ms, here ? ran() : null);
  };
  // What a run begun now for that task would get: the task's own lengths where it has them.
  const lengthsFor = (task: string | null) => {
    const own = (task ? today.list.value.find((one) => one.id === task) : undefined)?.lengths;
    return { work_ms: own?.work_ms ?? LENGTHS.work_ms, short_ms: own?.short_ms ?? LENGTHS.short_ms, long_ms: own?.long_ms ?? LENGTHS.long_ms };
  };
  const begin = (phase: Phase, task: string | null = null) => {
    // A break takes the lengths of the task whose lap it follows.
    const planned = lengthsFor(phase === 'work' ? task : state.value.task)[`${phase}_ms`];
    state.value = act(state.value, { do: 'start', phase, run: `demo-${++runs}`, task: phase === 'work' ? task : null, planned_ms: planned }, now());
    // A new set starts with nothing in it.
    if (phase === 'work' && state.value.set_index === 0) part.clear();
  };
  // A scene with no list still has a day: its laps, against the usual target.
  const today = demoToday(scene.day ?? { tasks: [], laps: scene.laps, target: 8 }, state, () => ({ share: ran() / (state.value.planned_ms || 1), ms: ran(), over: over() }), now);

  // Ten seconds to take a stop back, as the real one gives.
  const undoable = signal(false);
  let before: { state: TimerState; you: number; laps: number } | null = null;
  // The record of that stop, for as long: what Focus and Today read to say what it did.
  const lastStop = signal<Focus['lastStop']['value']>(null);
  const forget = () => {
    undoable.value = false;
    lastStop.value = null;
  };
  const end = () => {
    const was = state.value;
    if (was.phase === 'idle') return;
    before = { state: was, you, laps };
    lastStop.value = { phase: was.phase, task: was.task, started: was.started ?? now(), ran_ms: ran(), counted: lapOpen() && (over() || ran() >= MIN) };
    close();
    state.value = act(was, { do: 'stop' }, now());
    undoable.value = true;
    setTimeout(forget, 10000);
  };

  // Ticking the task a lap runs on ends that lap, and unticking it puts the lap back: the real
  // facade does both in `setDone`.
  const setDone = today.setDone.bind(today);
  today.setDone = (id, done) => {
    if (done && lapOpen() && !over() && state.value.task === id) end();
    else if (!done && undoable.value && before?.state.task === id) focus.undo();
    setDone(id, done);
  };

  const focus: Focus = {
    state,
    lengths: signal(LENGTHS),
    lengthsFor,
    view() {
      const v = view(state.value, now());
      // What the real one does on a new day: the next thing is lap one, whatever came before.
      return scene.newDay && state.value.run === 'demo-0' ? { ...v, next: { phase: 'work', set_index: 0 } } : v;
    },
    ran,
    race() {
      // Yesterday's lap is not today's focus.
      const you_ms = you + (mine() && !(scene.newDay && state.value.run === 'demo-0') ? ran() : 0);
      const ghost = scene.ghost ? { day: '2026-11-17', ms: scene.ghost[0], total_ms: scene.ghost[1] } : null;
      return { you_ms, ghost, split_ms: ghost ? you_ms - ghost.ms : null };
    },
    lapsToday: () => laps + (mine() && over() ? 1 : 0),
    start(task) {
      const next = view(state.value, now()).next.phase;
      close();
      begin(next, task);
    },
    skipBreak(task) {
      close();
      begin('work', task);
    },
    pause: () => void (state.value = act(state.value, { do: 'pause' }, now())),
    resume: () => void (state.value = act(state.value, { do: 'resume' }, now())),
    extend: () => void (state.value = act(state.value, { do: 'extend', ms: EXTEND_MS }, now())),
    stop: () => end(),
    undoable,
    lastStop,
    undo() {
      if (!before) return;
      ({ you, laps } = before);
      state.value = before.state;
      part.delete(before.state.set_index);
      forget();
    },
  };

  const account = signal(scene.signedOut ? null : { account: 'demo', username: new URLSearchParams(location.search).get('name') ?? 'ravi' });
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
  let setUp = false;
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
    // An invite called `refused` is one the server will not take.
    register: async (invite, username, password) => {
      // Said aloud, so a check can see what was sent, and that nothing was.
      console.info(`demo: register with the invite "${invite}"`);
      if (invite === 'refused') return { ok: false, error: 'invite' };
      // Somebody else got there first: from now on the server is not fresh.
      if (scene.taken && invite === '') return (setUp = true), { ok: false, error: scene.taken };
      return answer(username, password);
    },
    needsSetup: () => new Promise((answer) => (scene.fresh === 'never' ? undefined : setTimeout(() => answer(!!scene.fresh && !setUp), scene.fresh === 'late' ? 1000 : 50))),
    role: signal<Role>(scene.role ?? 'member'),
    roleSaid: signal(0),
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
    // A reset link: `dead` is one the server no longer knows, and a password that is an error's code gets that error.
    resetLook: async (reset) => (reset === 'dead' ? { ok: false, error: 'reset' } : { ok: true, username: 'sachi' }),
    resetUse: (reset, password) => (reset === 'dead' ? Promise.resolve({ ok: false, error: 'reset' }) : answer('sachi', password)),
  };
  const progress = demoProgress(scene.record ?? {}, () => (lapOpen() ? ran() : 0));
  const settings = demoSettings(scene.prefs ?? {}, scene.marks ?? []);
  const habits = demoHabits(scene.habits ?? HABITS);
  const rooms = demoRooms({ ...scene.room, cheered: scene.cheered }, now, settings);
  const invites = demoInvites(scene.invites ?? 0, now);
  const admins = demoAdmins(scene.admins ?? []);
  const resets = demoResets(scene.resets ?? 0, { look: engine.resetLook, use: engine.resetUse });
  const server = scene.serverAt ? demoServer({ address: scene.serverAt, held: scene.held }) : undefined;
  return { engine, focus, today, progress, habits, rooms, settings, invites, admins, resets, server };
}

const name = new URLSearchParams(location.search).get('state');
const scene = name ? SCENES[name] : undefined;
if (scene && !location.hash) location.hash = scene.join ? `#/join/${scene.join}` : scene.reset ? `#/reset/${scene.reset}` : scene.today ? '#/today' : scene.settings ? '#/settings' : scene.record ? '#/progress' : scene.habits ? '#/habits' : scene.room ? '#/room' : '';
// Staged once, so a tap word can change what another device would have changed.
const staged = scene && !scene.elsewhere && !scene.welcome && !scene.serverStep ? stage(scene) : undefined;
render(
  scene?.elsewhere ? (
    <Elsewhere />
  ) : scene?.welcome ? (
    <FirstRun choice={demoServer({})} />
  ) : scene?.serverStep ? (
    <ServerStep choice={demoServer(scene.serverStep)} />
  ) : scene ? (
    <App {...staged!} ringBlocked={signal(!!scene.ringBlocked)} canSave={!scene.phoneApp && !scene.serverAt} onReminderSet={() => console.info('demo: a reminder was set')} />
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
// What a tap word names, or a loud failure that says which state and which word: a demo state
// whose screen has changed under it is found at once, not as a null somewhere later.
const find = <T extends Element>(selector: string, words: string): T => {
  const one = document.querySelector<T>(selector);
  if (!one) throw new Error(`demo state "${name}": nothing matches "${selector}" for the tap "${words}"`);
  return one;
};
// After the first paint, as a person would: the screen has settled before anyone can tap.
[scene?.tap ?? []].flat().forEach((words, i) =>
  setTimeout(() => {
    if (words === 'demo:add') {
      // Typed and entered, as a person would.
      const field = document.querySelector<HTMLInputElement>('input[name=task]')!;
      field.value = 'pointers chapter 3 ~4';
      field.form!.requestSubmit();
    } else if (words.startsWith('fill:')) {
      // Typed, as a person would: `fill:<field's name>=<what is typed>`.
      const [, name, typed] = words.match(/^fill:([^=]+)=(.*)$/)!;
      const field = find<HTMLInputElement>(`input[name="${name}"]`, words);
      field.value = typed!;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (words.startsWith('focus:')) {
      // The field taken up, nothing typed yet.
      find<HTMLInputElement>(`input[name="${words.slice(6)}"]`, words).focus();
    } else if (words.startsWith('css:')) {
      // A press on what has no words of its own to find it by.
      find<HTMLElement>(words.slice(4), words).click();
    } else if (words.startsWith('submit:')) {
      find<HTMLInputElement>(`input[name="${words.slice(7)}"]`, words).form!.requestSubmit();
    } else if (words === 'demo:say') {
      // The bar, said over whatever is docked at the foot of the screen.
      say({ lead: s.today.saidDone, title: 'Linked lists: insert and delete', undo: () => say(null) });
    } else if (words === 'demo:end') {
      // Scrolled to the foot of the screen, as a thumb would.
      const main = find<HTMLElement>('main', words);
      main.scrollTop = main.scrollHeight;
    } else if (words === 'demo:start') {
      // A lap started where this screen was not looking: Today's row on another device.
      staged!.focus.start('ex');
    } else if (words === 'demo:stop') {
      // Stop pressed where this screen was not looking: the phone's notification.
      staged!.focus.stop();
    } else if (words === 'demo:unproject') {
      // The chosen project deleted on another device, while its form is open here.
      staged!.today.removeProject('c');
    } else if (words === 'demo:untarget') {
      // The day target taken away on another device, while this one has its editor open.
      staged!.today.setTarget(0);
    } else if (words.startsWith('demo:carry:')) {
      // Pressed on a row, held, and carried over the Next card, and not let go.
      const row = [...document.querySelectorAll<HTMLElement>('[data-lift]')].find((one) => one.textContent?.includes(words.slice(11)))!;
      const box = row.getBoundingClientRect();
      const next = document.querySelector('[data-lift]')!.getBoundingClientRect();
      const at = (y: number) => ({ bubbles: true, pointerId: 1, isPrimary: true, clientX: box.left + box.width / 2, clientY: y });
      row.dispatchEvent(new PointerEvent('pointerdown', at(box.top + box.height / 2)));
      setTimeout(() => dispatchEvent(new PointerEvent('pointermove', at(next.top + next.height / 2))), 500);
    } else if (words === 'demo:day') {
      // A week back in the year, by the keyboard.
      document.querySelector('[role=slider]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    } else {
      const button = [...document.querySelectorAll('button')].find((one) => (one.textContent || one.ariaLabel)?.startsWith(words));
      if (!button) throw new Error(`demo state "${name}": no button starts with "${words}"`);
      button.click();
    }
  }, 100 * (i + 1)),
);
