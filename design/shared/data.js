// Sample data every route renders from, so the three routes show the same day and can be compared.
// All of it is invented for the mockups; minutes are whole pomodoros of 25.
(function () {
  const POMO = 25;
  const today = new Date(2026, 10, 24); // Tue 24 Nov 2026
  const fmt = m => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);
  const day = d => d.toLocaleDateString('en-GB', { weekday: 'short' });

  const projects = [
    { id: 'c', name: 'C', hue: 0 },
    { id: 'react', name: 'React', hue: 1 },
    { id: 'uni', name: 'Uni', hue: 2 },
    { id: 'next', name: 'Next.js', hue: 3 },
  ];

  const tasks = [
    { id: 1, title: 'K&R 5.1 to 5.5: pointers and arrays', project: 'c', est: 4, done: 2, running: true },
    { id: 2, title: 'Exercise 5-3: strcat with pointers', project: 'c', est: 2, done: 0 },
    { id: 4, title: 'Thinking in React, steps 1 to 3', project: 'react', est: 2, done: 1 },
    { id: 5, title: 'Tic-tac-toe tutorial: lift state up', project: 'react', est: 3, done: 0 },
    { id: 6, title: 'Next.js: layouts and pages', project: 'next', est: 2, done: 0 },
    { id: 3, title: 'Discrete maths, tutorial sheet 6', project: 'uni', est: 2, done: 2 },
  ];

  // Twelve weeks, Monday 7 Sep to Sunday 29 Nov. Fixed days are the ones the copy talks about;
  // the rest come from a seeded generator so every render is the same.
  const fixed = {
    '2026-11-10': 0, '2026-11-11': 0, '2026-11-12': 100, '2026-11-13': 150, '2026-11-14': 225, '2026-11-15': 50,
    '2026-11-16': 150, '2026-11-17': 200, '2026-11-18': 100, '2026-11-19': 0,
    '2026-11-20': 175, '2026-11-21': 250, '2026-11-22': 75,
    '2026-11-23': 200, '2026-11-24': 125,
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const days = [];
  const start = new Date(2026, 8, 7), first = new Date(2026, 8, 14);
  for (let i = 0; i < 84; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let min = null;
    if (d > today) min = null;
    else if (d < first) min = null;
    else if (key in fixed) min = fixed[key];
    else { const r = rnd(); min = r < 0.18 ? 0 : Math.round((1 + rnd() * 8 + (i / 84) * 3)) * POMO; }
    days.push({ key, date: d, min, isToday: +d === +today });
  }

  const sum = a => a.reduce((s, x) => s + (x || 0), 0);
  const thisWeek = days.slice(77, 84), lastWeek = days.slice(70, 77);
  const last7 = days.slice(72, 79);
  const split = [
    { project: 'c', min: 375 }, { project: 'react', min: 275 }, { project: 'uni', min: 175 }, { project: 'next', min: 100 },
  ];
  const doneToday = sum(tasks.map(t => t.done));
  const estToday = sum(tasks.map(t => t.est));

  // The figures the copy repeats must agree with the rows they come from.
  console.assert(sum(split.map(s => s.min)) === sum(last7.map(d => d.min)), 'project split = last 7 days');
  console.assert(doneToday * POMO === days[78].min, 'today = tasks done');
  console.assert(sum(lastWeek.slice(0, 2).map(d => d.min)) - sum(thisWeek.slice(0, 2).map(d => d.min)) === POMO, 'one pomodoro behind');

  // Streak: days with focus, where one empty day per Monday-to-Sunday week is a rest day.
  let streak = 0, rests = [];
  for (let i = 78; i >= 0; i--) {
    const d = days[i];
    if (d.min > 0) { streak++; continue; }
    const wk = Math.floor(i / 7);
    const zeros = days.slice(wk * 7, wk * 7 + 7).filter((x, j) => x.min === 0 && wk * 7 + j <= 78).length;
    if (d.min === 0 && zeros === 1) { streak++; rests.push(d); continue; }
    break;
  }

  window.D = {
    POMO, today, fmt, day, projects, tasks, days, thisWeek, lastWeek, last7, split, sum,
    doneToday, estToday, streak, rests,
    running: { taskId: 1, left: '18:42', leftSec: 18 * 60 + 42, total: 25 * 60, kind: 'Focus', inSet: 2 },
    friends: [
      { name: 'You', initial: 'Y', state: 'focus', task: 'K&R 5.1 to 5.5: pointers and arrays', left: '18:42', inSet: 2, today: 125 },
      { name: 'Sachi', initial: 'S', state: 'focus', task: 'Linked lists: insert and delete', left: '11:05', inSet: 3, today: 125 },
      { name: 'Dilan', initial: 'D', state: 'break', task: null, left: '3:20', inSet: 4, today: 75 },
      { name: 'Amaya', initial: 'A', state: 'away', task: null, since: '14:10', today: 50 },
    ],
    habits: [
      { name: 'Read 10 pages of K&R', when: 'Every day', week: [1, 1, null, null, null, null, null], doneToday: true, run: 9 },
      { name: 'Push one commit', when: 'Every day', week: [1, 0, null, null, null, null, null], doneToday: false, run: 1 },
      { name: 'Phone in the other room for the first pomodoro', when: 'Every day', week: [1, 1, null, null, null, null, null], doneToday: true, run: 4 },
      { name: 'Walk after lunch', when: 'Weekdays', week: [0, 1, null, null, null, null, null], doneToday: true, run: 1 },
      { name: 'Lights out by 00:30', when: 'Every day', week: [1, 0, null, null, null, null, null], doneToday: false, run: 0 },
    ],
  };
})();
