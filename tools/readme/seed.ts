// Usage: node tools/readme/seed.ts [--addr 127.0.0.1:8799]   (after `make server`; prints READY, stays up until Ctrl-C)
//
// The README's account, on a throwaway heirloomd (server/bin/heirloomd, its own port and temp data
// directory), written through the real engine as the e2e specs do: maya with five weeks of laps,
// tasks with subtasks, habits with times of day and a lap running now; five friends in her room
// "Study club", three on a lap, one on a break, one between laps, two with a picture. shoot.ts
// runs this itself; run it alone to look around.
//
// The pictures want an early evening, so a day has laps behind it whatever the hour here: the
// account lives in a whole-hour zone (Etc/GMT...) where it is about 18:45 now, and the browser is
// put in the same zone.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { localDay } from '../../client/src/core/stats.ts';
import { createRooms } from '../../client/src/sync/rooms.ts';
import { account, inStep, PASSWORD, sleep, startServer, stopAll, until } from '../../tests/sync/harness.ts';
import type { Device } from '../../tests/sync/harness.ts';

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const LAP = 25 * MIN;

/** The zone the account and the browser share: whole hours east of UTC that make now about 18:45. */
export function zone() {
  const utc = new Date();
  let east = Math.round(18.75 - (utc.getUTCHours() + utc.getUTCMinutes() / 60));
  if (east < -12) east += 24;
  if (east > 14) east -= 24;
  // Etc/GMT names have the sign the other way round: Etc/GMT-4 is four hours east.
  return { id: east === 0 ? 'Etc/UTC' : `Etc/GMT${east > 0 ? '-' : '+'}${Math.abs(east)}`, off: east * 60 };
}

export async function seed(addr = '127.0.0.1:8799') {
  const { id: tz, off: OFF } = zone();
  const dayOf = (ms: number) => localDay(ms, OFF);
  const midnight = (day: string) => Date.parse(`${day}T00:00:00Z`) - OFF * MIN;
  const today = dayOf(Date.now());
  const back = (n: number) => dayOf(midnight(today) + 12 * HOUR - n * DAY);
  const at = (day: string, hhmm: string) => midnight(day) + Number(hhmm.slice(0, 2)) * HOUR + Number(hhmm.slice(3)) * MIN;
  const weekday = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 Monday

  // mulberry32, so a run makes the same history every time.
  let state = 20261126;
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;

  const sent = (d: Device, what: string) => until(() => inStep(d.engine), 20000, `${what} was not sent`);
  let ids = 0;
  function lap(d: Device, started: number, task: string | null, kind: 'work' | 'short' = 'work', ran?: number) {
    const planned = kind === 'work' ? LAP : 5 * MIN;
    const ms = ran ?? planned;
    d.engine.write('session', `seed-${++ids}`, { kind, task, started, ended: started + ms, planned_ms: planned, paused_ms: 0, outcome: ran === undefined ? 'rang' : 'stopped', device: d.engine.device });
  }
  // A run of laps from a start time, each followed by its break when `withBreaks`, as a set is lived.
  function block(d: Device, day: string, from: string, tasks: (string | null)[], withBreaks = false) {
    let t = at(day, from);
    tasks.forEach((task, i) => {
      lap(d, t, task);
      t += LAP;
      if (withBreaks && i < tasks.length - 1) lap(d, t, null, 'short');
      t += 5 * MIN + (withBreaks ? 0 : Math.floor(rand() * 4) * MIN);
    });
  }
  const timer = (d: Device, phase: 'work' | 'short', task: string | null, startedAgo: number, planned: number, set_index: number) =>
    d.engine.write('timer', 'current', { state: { phase, run: `now-${d.engine.device}`, task, started: Date.now() - startedAgo, paused_at: null, paused_ms: 0, planned_ms: planned, set_index } });

  const server = await startServer(addr);
  const deviceOpts = { utcOffsetMin: OFF };
  const maya = await account(server, 'maya', deviceOpts);
  const m = maya.engine;
  m.write('settings', 'current', { day_target: 6, share_task: true });
  m.write('project', 'study', { name: 'Study', color: 'teal', order: 'V' });
  m.write('project', 'music', { name: 'Music', color: 'amber', order: 'W' });
  m.write('project', 'home', { name: 'Home', color: 'sky', order: 'X' });

  // Today's list, two of them with subtasks.
  m.write('task', 'read4', { title: 'Read chapter 4', project: 'study', estimate: 3, order: 'A' });
  m.write('task', 'maths', { title: 'Revise for the maths test', project: 'study', estimate: 4, order: 'B' });
  m.write('task', 'guitar', { title: 'Practice guitar', project: 'music', estimate: 3, order: 'C' });
  m.write('task', 'books', { title: 'Return the library books', project: 'home', estimate: 1, due: back(-2), order: 'D' });
  m.write('task', 'essay', { title: 'Write the essay intro', project: 'study', estimate: 2, done: at(today, '10:20'), order: 'E' });
  m.write('task', 'desk', { title: 'Tidy the desk', project: 'home', estimate: 1, done: at(today, '12:00'), order: 'F' });
  const subs: [string, string, string, boolean][] = [
    ['r1', 'read4', 'Sections 4.1 and 4.2', true],
    ['r2', 'read4', 'Section 4.3', false],
    ['r3', 'read4', 'Write a short summary', false],
    ['m1', 'maths', 'Fractions', true],
    ['m2', 'maths', 'Simple equations', false],
    ['m3', 'maths', 'Past paper, question 3', false],
  ];
  subs.forEach(([id, parent, title, done], i) => m.write('task', id, { title, parent, order: `${parent[0]}${i}`, ...(done ? { done: at(today, '15:20') } : {}) }));
  // Done in weeks gone by, so the history's laps have somewhere to belong.
  const past = [
    { id: 'read2', title: 'Read chapter 2', project: 'study', done: 30 },
    { id: 'read3', title: 'Read chapter 3', project: 'study', done: 16 },
    { id: 'sheet', title: 'Maths worksheet 6', project: 'study', done: 9 },
    { id: 'notes', title: 'Notes for the history class', project: 'study', done: 3 },
    { id: 'sheet7', title: 'Maths worksheet 7', project: 'study', done: 1 },
    { id: 'scales', title: 'Practice scales', project: 'music', done: 3 },
    { id: 'shelf', title: 'Sort the bookshelf', project: 'home', done: 12 },
  ];
  past.forEach((t, i) => m.write('task', t.id, { title: t.title, project: t.project, estimate: 3, done: at(back(t.done), '17:00'), order: `P${i}` }));
  const studyBefore = (n: number) => past.filter((t) => t.project === 'study' && t.done >= n).sort((a, b) => a.done - b.done)[0]?.id ?? 'read2';
  const musicBefore = (n: number) => (n > 3 ? 'scales' : 'guitar');
  const homeBefore = (n: number) => (n > 12 ? 'shelf' : null);

  // Five weeks back, yesterday included. Weekdays are full, weekends light; days back with no lap
  // at all: most Sundays, a Tuesday, and one week of three that broke the streak 4 weeks ago.
  const restDays = new Set([4, 9, 11, 18, 25, 26, 27, 29, 32]);
  for (let n = 35; n >= 1; n--) {
    const day = back(n);
    if (restDays.has(n) || n === 7) continue;
    const wd = weekday(day);
    const study = studyBefore(n);
    const morning = wd < 5 ? 2 + Math.floor(rand() * 3) : Math.floor(rand() * 2) + 1;
    const afternoon = wd < 5 ? 1 + Math.floor(rand() * 3) : Math.floor(rand() * 2);
    block(maya, day, pick(['08:40', '09:05', '09:30', '10:00']), Array.from({ length: morning }, () => (rand() < 0.85 ? study : null)));
    if (afternoon) block(maya, day, pick(['14:00', '14:30', '15:10', '16:00']), Array.from({ length: afternoon }, () => (rand() < 0.6 ? study : homeBefore(n))));
    if (rand() < 0.55) block(maya, day, pick(['19:00', '19:30', '20:15']), [musicBefore(n)]);
  }
  // A week ago today is the ghost: six laps by this time of day, eight by night.
  block(maya, back(7), '09:30', ['notes', 'notes', 'notes']);
  block(maya, back(7), '15:00', ['notes', 'notes']);
  block(maya, back(7), '17:00', ['guitar']);
  block(maya, back(7), '19:40', ['guitar', 'notes']);

  // Today: the essay (a lap that rang, its break, one stopped at 18 minutes), the desk, Read
  // chapter 4 and the maths, then the second lap of Read chapter 4 running for 11 minutes.
  lap(maya, at(today, '09:20'), 'essay');
  lap(maya, at(today, '09:45'), null, 'short');
  lap(maya, at(today, '09:50'), 'essay', 'work', 18 * MIN);
  lap(maya, at(today, '11:30'), 'desk');
  block(maya, today, '14:35', ['read4', 'maths'], true);
  timer(maya, 'work', 'read4', 11 * MIN + 24000, LAP, 0);

  // Habits. Drink water has four times a day; today 08:00 went by and 12:00 and 16:00 are ticked.
  // Stretch is for weekdays, so on a weekend it asks nothing today.
  m.write('habit', 'water', { title: 'Drink water', days: 127, target: 4, reminds: ['08:00', '12:00', '16:00', '20:00'], order: 'A' });
  m.write('habit', 'read', { title: 'Read 20 pages', days: 127, target: 1, order: 'B' });
  m.write('habit', 'stretch', { title: 'Stretch', days: 31, target: 1, order: 'C' });
  let c = 0;
  const checkin = (habit: string, day: string, hhmm: string, round?: number) => m.write('checkin', `c${++c}`, { habit, day, at: at(day, hhmm), ...(round ? { round } : {}) });
  for (let n = 35; n >= 1; n--) {
    const day = back(n);
    for (const hhmm of ['08:10', '12:05', '16:15', '20:20']) if (rand() < 0.93) checkin('water', day, hhmm);
    if (rand() < 0.75) checkin('read', day, '21:30');
    if (weekday(day) < 5 && rand() < 0.7) checkin('stretch', day, '08:00');
  }
  checkin('water', today, '12:05', 2);
  checkin('water', today, '16:10', 3);
  checkin('read', today, '08:40');

  // The months before, so the year grid has a year in it: from late April, school weeks with a
  // dip in August and a run up to October's exams. Its own random sequence, and laps written
  // straight, so every number in the five weeks above stays as it was. Lighter than those weeks,
  // so the bests stay theirs.
  let oldState = 20260501;
  const old = () => {
    oldState = (oldState + 0x6d2b79f5) | 0;
    let t = Math.imul(oldState ^ (oldState >>> 15), 1 | oldState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const earlier = [
    { id: 'bio1', title: 'Biology: cells and tissues', project: 'study', done: 170 },
    { id: 'summer', title: 'Summer reading list', project: 'study', done: 110 },
    { id: 'chem', title: 'Chemistry revision', project: 'study', done: 75 },
    { id: 'mock', title: 'Mock exam papers', project: 'study', done: 40 },
  ];
  earlier.forEach((t, i) => m.write('task', t.id, { title: t.title, project: t.project, estimate: 3, done: at(back(t.done), '17:00'), order: `Q${i}` }));
  // A lap belongs to the task finished soonest after its day.
  const oldTask = (n: number) => earlier.filter((t) => t.done < n).sort((x, y) => y.done - x.done)[0]?.id ?? 'read2';
  for (let n = 215; n >= 36; n--) {
    const day = back(n);
    const wd = weekday(day);
    const holiday = n > 95 && n < 125; // August
    const exams = n > 45 && n < 70;
    const off = wd === 6 ? 0.7 : holiday ? 0.55 : wd === 5 ? 0.35 : 0.1;
    if (old() < off) continue;
    const most = holiday ? 2 : exams ? 6 : wd < 5 ? 5 : 3;
    const laps = 1 + Math.floor(old() * most);
    let t = at(day, ['08:50', '09:30', '14:00', '16:30'][Math.floor(old() * 4)]!);
    for (let k = 0; k < laps; k++) {
      lap(maya, t, old() < 0.85 ? oldTask(n) : null);
      t += LAP + 5 * MIN + Math.floor(old() * 20) * MIN;
    }
  }
  await sent(maya, "maya's history");

  // The friends, each with a week of laps and a day of them at their own hours, and what they are doing now.
  type Friend = { name: string; task: string; share: boolean; today: [string, number][]; picture?: string };
  const friends: Friend[] = [
    { name: 'sam', task: 'Biology notes', share: true, today: [['10:10', 2], ['15:00', 2]], picture: 'sunflower.webp' },
    { name: 'lina', task: 'French vocabulary', share: false, today: [['11:00', 3], ['16:45', 2]] },
    { name: 'noor', task: 'History essay plan', share: true, today: [['08:30', 2], ['13:10', 1], ['17:20', 1]], picture: 'dusk.webp' },
    { name: 'kai', task: 'Physics past paper', share: true, today: [['09:40', 3], ['14:20', 2]] },
    { name: 'ellie', task: 'Chemistry problems', share: false, today: [['12:00', 2], ['16:30', 2]] },
  ];
  const devices: Device[] = [];
  for (const f of friends) {
    const d = await account(server, f.name, deviceOpts);
    d.engine.write('settings', 'current', { share_task: f.share });
    d.engine.write('task', 't', { title: f.task, estimate: 4, order: 'A' });
    for (let n = 6; n >= 1; n--) if (rand() < 0.8) block(d, back(n), pick(['09:30', '10:00', '14:00']), Array(2 + Math.floor(rand() * 3)).fill('t'));
    for (const [from, k] of f.today) block(d, today, from, Array(k).fill('t'), true);
    devices.push(d);
  }
  const [sam, lina, noor, , ellie] = devices as [Device, Device, Device, Device, Device];
  timer(sam, 'work', 't', 7 * MIN, LAP, 0);
  timer(lina, 'short', null, 1 * MIN + 50000, 5 * MIN, 1);
  timer(noor, 'work', 't', 16 * MIN, LAP, 1);
  timer(ellie, 'work', 't', 3 * MIN + 20000, LAP, 2);
  // kai: between laps, so no timer.
  for (const d of devices) await sent(d, 'a friend');

  const schedule = (run: () => void, ms: number) => {
    const t = setTimeout(run, ms);
    return () => clearTimeout(t);
  };
  const rooms = [maya, ...devices].map((d) => createRooms(d.engine, { schedule, utcOffsetMin: () => OFF }));
  const [mayaRooms, samRooms, linaRooms, , kaiRooms] = rooms;
  const made = await mayaRooms!.create('Study club');
  if (!made.ok) throw new Error(`room: ${made.error}`);
  await until(() => !!mayaRooms!.list.value[0]?.code, 5000, 'no room code');
  const room = mayaRooms!.list.value[0]!;
  for (const r of rooms.slice(1)) {
    const res = await r.join(room.code);
    if (!res.ok) throw new Error(`join: ${res.error}`);
  }
  await until(() => mayaRooms!.list.value[0]?.members.length === 6, 5000, 'not all six in the room');
  for (const [i, f] of friends.entries()) {
    if (!f.picture) continue;
    const res = await rooms[i + 1]!.setPicture(new Uint8Array(readFileSync(join(import.meta.dirname, f.picture))));
    if (!res.ok) throw new Error(`picture: ${res.error}`);
  }
  // Cheers for laps that rang today: maya for sam's, lina and kai for maya's.
  const idOf = (d: Device) => d.engine.account.value!.account;
  const cheer = async (from: (typeof rooms)[number] | undefined, to: Device) => {
    await until(() => !!from!.list.value[0]?.members.find((x) => x.id === idOf(to))?.last, 5000, 'no lap to cheer');
    from!.cheer(room.id, idOf(to));
  };
  await cheer(mayaRooms, sam);
  await cheer(linaRooms, maya);
  await cheer(kaiRooms, maya);
  for (const [r, text] of [[samRooms, 'Library closes at 8, I am here till then.'], [linaRooms, 'Back in five. French until dinner.']] as const) {
    const res = await r!.addNote(room.id, text);
    if (!res.ok) throw new Error(`note: ${res.error}`);
  }
  // lina calls the next lap for the room, and kai is in.
  const called = await linaRooms!.callLap(room.id, Math.ceil((Date.now() + 6 * MIN) / MIN) * MIN);
  if (!called.ok) throw new Error(`call: ${called.error}`);
  await until(() => !!kaiRooms!.list.value[0]?.call, 5000, 'kai never heard the call');
  const inCall = await kaiRooms!.setIn(room.id, kaiRooms!.list.value[0]!.call!.id, true);
  if (!inCall.ok) throw new Error(`in: ${inCall.error}`);
  await sleep(1500);

  return {
    url: server.url,
    tz,
    password: PASSWORD,
    async stop() {
      rooms.forEach((r) => r.close());
      await stopAll();
      await server.stop();
    },
  };
}

if (process.argv[1] === import.meta.filename) {
  const s = await seed(parseArgs({ options: { addr: { type: 'string', default: '127.0.0.1:8799' } } }).values.addr);
  console.log(`READY ${s.url} maya ${s.password} (browser time zone ${s.tz})`);
  const stop = () => void s.stop().then(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
