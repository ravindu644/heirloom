// Runs contracts/fixtures/ against core, the way contracts/protocol.md section 9 says to read them.
// The Go server runs the same files, so a case that passes here and there is a rule both sides share.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ZERO, acceptable, see, stamp } from './hlc.ts';
import type { Stamp } from './hlc.ts';
import { applyCell } from './merge.ts';
import type { Cell, Cells } from './merge.ts';
import { HUES, avatar } from './avatar.ts';
import { closeRun, mayWriteBell } from './session.ts';
import type { Closed, End } from './session.ts';
import { fill, race, stats } from './stats.ts';
import type { Race, Session, Stats } from './stats.ts';
import { streak } from './streak.ts';
import type { Streak } from './streak.ts';
import { IDLE, act, view } from './timer.ts';
import { dayAfter, keyBetween, nextTask, quickAdd, squares } from './today.ts';
import type { Repeat } from './today.ts';
import type { TimerAction, TimerState } from './timer.ts';

// Read from contracts/ itself: a copy here could pass while the server runs something else.
const load = (file: string) =>
  JSON.parse(readFileSync(new URL(`../../../contracts/fixtures/${file}`, import.meta.url), 'utf8'));

const merge: {
  stamps: { name: string; device: string; steps: ({ now: number; stamp: Stamp } | { see: Stamp })[] }[];
  merge: { name: string; cells: Cell[]; expect: Cell[] }[];
  drift: { name: string; server_time: number; stamp: Stamp; accept: boolean }[];
} = load('merge.json');

const timer: {
  cases: {
    name: string;
    from?: TimerState;
    steps: (({ at: number } & TimerAction) | { at: number; expect: Record<string, unknown> })[];
  }[];
} = load('timer.json');

const statsCases: {
  cases: { name: string; utc_offset_min: number; sessions: Session[]; expect: Stats }[];
  race: { name: string; utc_offset_min: number; now: number; state: TimerState; sessions: Session[]; expect: Race }[];
  fill: { name: string; sessions: Session[]; expect: number[] }[];
} = load('stats.json');

const session: {
  close: { name: string; state: TimerState; end: End; now: number; device: string; written: number; rang?: boolean; expect: Closed | null }[];
  bell: { name: string; timer_stamp: Stamp; device: string; in_step: boolean; has_row: boolean; expect: boolean }[];
} = load('session.json');

const streakCases: {
  cases: { name: string; today: string; kept: string[]; days_mask?: number; window: number; expect: Streak }[];
} = load('streak.json');

describe('merge.json stamps', () => {
  for (const c of merge.stamps) {
    it(c.name, () => {
      let clock = ZERO;
      c.steps.forEach((step, i) => {
        if ('see' in step) {
          clock = see(clock, step.see);
          return;
        }
        const made = stamp(clock, step.now, c.device);
        clock = made.clock;
        assert.equal(made.stamp, step.stamp, `step ${i}`);
      });
    });
  }
});

// Every order for six cells or fewer (720 at most), else the given order and its reverse.
function orders<T>(xs: T[]): T[][] {
  if (xs.length > 6) return [xs, xs.toReversed()];
  if (xs.length < 2) return [xs];
  return xs.flatMap((x, i) => orders(xs.toSpliced(i, 1)).map((rest) => [x, ...rest]));
}

const byField = (cells: Cell[]) =>
  cells.toSorted((a, b) => {
    const [x, y] = [`${a.dataset}/${a.row}/${a.field}`, `${b.dataset}/${b.row}/${b.field}`];
    return x < y ? -1 : x > y ? 1 : 0;
  });

describe('merge.json merge', () => {
  for (const c of merge.merge) {
    it(c.name, () => {
      for (const order of orders(c.cells)) {
        const cells: Cells = new Map();
        for (const cell of order) applyCell(cells, cell);
        const arrived = order.map((cell) => cell.stamp).join(', ');
        assert.deepEqual(byField([...cells.values()]), byField(c.expect), `arriving as ${arrived}`);
      }
    });
  }
});

describe('merge.json drift', () => {
  for (const c of merge.drift) {
    it(c.name, () => assert.equal(acceptable(c.stamp, c.server_time), c.accept));
  }
});

describe('timer.json', () => {
  for (const c of timer.cases) {
    it(c.name, () => {
      let state: TimerState = c.from ?? IDLE;
      c.steps.forEach((step, i) => {
        if ('do' in step) {
          const { at, ...action } = step;
          state = act(state, action, at);
          return;
        }
        // An expect may name a field of the state, a worked-out value, or the whole state.
        const got: Record<string, unknown> = { ...state, ...view(state, step.at), state };
        for (const [key, want] of Object.entries(step.expect)) {
          assert.deepEqual(got[key], want, `step ${i}: ${key} at ${step.at}`);
        }
      });
    });
  }
});

describe('stats.json cases', () => {
  for (const c of statsCases.cases) {
    it(c.name, () => assert.deepEqual(stats(c.sessions, c.utc_offset_min), c.expect));
  }
});

describe('stats.json race', () => {
  for (const c of statsCases.race) {
    it(c.name, () => assert.deepEqual(race(c.sessions, c.state, c.now, c.utc_offset_min), c.expect));
  }
});

describe('stats.json fill', () => {
  for (const c of statsCases.fill) {
    it(c.name, () => assert.deepEqual(c.sessions.map(fill), c.expect));
  }
});

describe('session.json close', () => {
  for (const c of session.close) {
    it(c.name, () => assert.deepEqual(closeRun(c.state, c.end, c), c.expect));
  }
});

describe('session.json bell', () => {
  for (const c of session.bell) {
    it(c.name, () => assert.equal(mayWriteBell(c.timer_stamp, c.device, c.in_step, c.has_row), c.expect));
  }
});

const today: {
  quick_add: { text: string; expect: { title: string; estimate: number | null } | null }[];
  repeat: { name: string; repeat: Repeat; after: string; expect: string }[];
  next: { name: string; id: string; due: string | null; today: string; repeat: Repeat; expect: { id: string; due: string } }[];
  order: { between: [string | null, string | null][]; inserts: { name: string; at: (number | 'end')[] }[] };
  squares: { name: string; task: string; now: number; state: TimerState; sessions: Session[]; expect: { laps: number; squares: number[] } }[];
} = load('today.json');

describe('today.json quick_add', () => {
  for (const c of today.quick_add) {
    it(JSON.stringify(c.text), () => assert.deepEqual(quickAdd(c.text), c.expect));
  }
});

describe('today.json repeat', () => {
  for (const c of today.repeat) {
    it(c.name, () => assert.equal(dayAfter(c.repeat, c.after), c.expect));
  }
});

describe('today.json next', () => {
  for (const c of today.next) {
    it(c.name, () => assert.deepEqual(nextTask(c.id, c.due, c.today, c.repeat), c.expect));
  }
});

// What the fixture's `about` asks of any key: the alphabet, the length, and no 0 at the end.
const isKey = (key: string) => /^[0-9A-Za-z]{1,64}$/.test(key) && !key.endsWith('0');

describe('today.json order', () => {
  for (const [a, b] of today.order.between) {
    it(`a key between ${a} and ${b}`, () => {
      const key = keyBetween(a, b);
      assert.ok(isKey(key), `${key} is not a key`);
      assert.ok(a === null || key > a, `${key} does not sort after ${a}`);
      assert.ok(b === null || key < b, `${key} does not sort before ${b}`);
    });
  }
  for (const c of today.order.inserts) {
    it(c.name, () => {
      const list: string[] = [];
      c.at.forEach((at, n) => {
        const i = at === 'end' ? list.length : at;
        list.splice(i, 0, keyBetween(list[i - 1] ?? null, list[i] ?? null));
        assert.ok(list.every(isKey), `insert ${n}: ${list[i]} is not a key`);
        assert.ok(list.every((key, j) => j === 0 || list[j - 1]! < key), `insert ${n}: ${list[i]} is out of order`);
      });
    });
  }
});

describe('today.json squares', () => {
  for (const c of today.squares) {
    it(c.name, () => assert.deepEqual(squares(c.sessions, c.state, c.now, c.task), c.expect));
  }
});

describe('streak.json', () => {
  for (const c of streakCases.cases) {
    it(c.name, () => {
      const got = streak({ today: c.today, kept: c.kept, window: c.window, daysMask: c.days_mask });
      assert.deepEqual(got, c.expect);
    });
  }
});

describe('avatar.json', () => {
  const fixture: { hues: string[]; cases: { username: string; hue: string; letters: string }[] } = load('avatar.json');
  it('the hues in the order the fixture names them', () => assert.deepEqual([...HUES], fixture.hues));
  for (const { username, hue, letters } of fixture.cases) {
    it(username, () => assert.deepEqual(avatar(username), { hue, letters }));
  }
});
