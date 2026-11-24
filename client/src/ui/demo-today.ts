// The demo's Today: the lists of client/src/sync/today.ts over a made-up day held in memory, so
// the Today screen and its sheet can be used and photographed with no server. Not part of the
// build. It follows contracts/protocol.md section 12 closely enough to be believed, no further.

import { computed, signal } from '@preact/signals';
import type { ReadonlySignal } from '@preact/signals';
import type { TimerState } from '../core/timer.ts';
import type { Row } from '../sync/engine.ts';
import type { ProjectView, Repeat, TaskView, Today } from '../sync/today.ts';

const MIN = 60000;
export const DAY = '2026-11-24';

export interface DemoTask {
  id: string;
  title: string;
  project?: string;
  estimate?: number;
  /** One number per lap: 1 rang, a share stopped. */
  squares?: number[];
  due?: string;
  when?: string;
  repeat?: Repeat;
  notes?: string;
  done?: boolean;
  /** When it was deleted, in ms. */
  deleted?: number;
  parent?: string;
}

export interface DemoDay {
  tasks: DemoTask[];
  projects?: ProjectView[];
  target?: number;
  /** Focus and laps today before the lap in progress. */
  done_ms?: number;
  laps?: number;
  ghost?: { total_ms: number; laps: number };
}

export const PROJECTS: ProjectView[] = [
  { id: 'c', name: 'C', color: 'you' },
  { id: 'react', name: 'React', color: 'ink' },
  { id: 'uni', name: 'Uni', color: 'rest' },
  { id: 'next', name: 'Next.js', color: 'ghost' },
];

const shift = (day: string, days: number) => new Date(Date.parse(day) + days * 24 * 60 * MIN).toISOString().slice(0, 10);
// The first day strictly later that the rule allows. Bit 0 is Monday.
function dayAfter(day: string, repeat: NonNullable<Repeat>): string {
  for (let next = shift(day, 1); ; next = shift(next, 1)) {
    if (repeat.every === 'day' || repeat.days & (1 << ((new Date(next).getUTCDay() + 6) % 7))) return next;
  }
}

/** The lap the timer is on: how much of it has run, as a share and in ms, and whether its bell has gone. */
export type DemoLap = () => { share: number; ms: number; over: boolean };

export interface DemoToday extends Today {
  /** A lap ended and is kept: it counts on the day, and on its task if it had one. */
  credit(task: string | null, share: number, ms: number): void;
  /** The task rows as the engine would hold them, for what the screen reads from there. */
  rows: ReadonlySignal<ReadonlyMap<string, Row>>;
}

export function demoToday(seed: DemoDay, timer: ReadonlySignal<TimerState>, lap: DemoLap, now: () => number): DemoToday {
  const tasks = signal<DemoTask[]>(seed.tasks);
  const projects = signal<ProjectView[]>(seed.projects ?? PROJECTS);
  const target = signal(seed.target ?? 0);
  // The day's count: one source for the strip, the target and the squares, so a lap that has rung
  // counts everywhere at once, as the real one's does.
  const day = { ms: seed.done_ms ?? 0, laps: seed.laps ?? 0 };
  let ids = 0;

  const change = (id: string, fields: Partial<DemoTask>) => void (tasks.value = tasks.value.map((task) => (task.id === id ? { ...task, ...fields } : task)));
  const view = (task: DemoTask): TaskView => {
    const onIt = timer.value.phase === 'work' && timer.value.task === task.id;
    // Running until the bell. After it, the lap is a whole square at once, row or no row.
    const running = onIt && !lap().over;
    const squares = onIt && !running ? [...(task.squares ?? []), 1] : (task.squares ?? []);
    return {
      id: task.id,
      title: task.title,
      notes: task.notes ?? '',
      project: projects.value.find((project) => project.id === task.project) ?? null,
      estimate: task.estimate ?? null,
      laps: squares.filter((square) => square === 1).length,
      squares: running ? [...squares, lap().share] : squares,
      running,
      due: task.due ?? null,
      when: task.when ?? null,
      repeat: task.repeat ?? null,
      deleted: task.deleted ?? null,
      done: !!task.done,
      subtasks: tasks.value.filter((sub) => sub.parent === task.id && !sub.deleted).map((sub) => ({ id: sub.id, title: sub.title, done: !!sub.done })),
    };
  };
  const top = computed(() => tasks.value.filter((task) => !task.parent && !task.deleted));
  const open = computed(() => top.value.filter((task) => !task.done && (!task.due || task.due <= DAY)).map(view));
  const next = computed(() => open.value.find((task) => !task.running) ?? null);

  return {
    day: signal(DAY),
    next,
    running: computed(() => open.value.find((task) => task.running) ?? null),
    later: computed(() => open.value.filter((task) => task !== next.value)),
    list: open,
    upcoming: computed(() => top.value.filter((task) => !task.done && task.due && task.due > DAY).sort((a, b) => a.due!.localeCompare(b.due!)).map(view)),
    done: computed(() => top.value.filter((task) => task.done).map(view)),
    deleted: computed(() => tasks.value.filter((task) => task.deleted && !task.parent).map(view)),
    projects,
    figures() {
      const inLap = timer.value.phase === 'work' ? lap() : null;
      const left_laps = open.value.reduce((sum, task) => sum + Math.max(0, (task.estimate ?? 0) - task.laps), 0);
      return {
        done_ms: day.ms + (inLap?.ms ?? 0),
        laps: day.laps + (inLap?.over ? 1 : 0),
        left_laps,
        left_ms: left_laps * 25 * MIN,
        target: target.value,
        ghost: seed.ghost ? { day: shift(DAY, -7), ...seed.ghost } : null,
      };
    },

    wake() {},

    add(text) {
      const [, title, estimate] = /^(.*?)(?:\s~(\d{1,2}))?$/.exec(text.trim()) ?? [];
      if (!title?.trim() || estimate === '0') return null;
      const id = `new-${++ids}`;
      tasks.value = [...tasks.value, { id, title: title.trim(), due: DAY, estimate: estimate ? Number(estimate) : undefined }];
      return id;
    },
    // Trimmed as the real one trims, or the demo would hide what typing a space does.
    edit: (id, fields) =>
      change(id, {
        ...fields,
        ...(fields.title !== undefined && { title: fields.title.trim() }),
        ...(fields.when !== undefined && { when: fields.when?.trim() || undefined }),
        project: fields.project === null ? undefined : (fields.project ?? tasks.value.find((task) => task.id === id)?.project),
      } as Partial<DemoTask>),
    setDone(id, done) {
      const task = tasks.value.find((one) => one.id === id);
      if (!task) return;
      change(id, { done });
      if (!task.repeat) return;
      const series = id.replace(/-\d{8}$/, '');
      const due = dayAfter(task.due && task.due > DAY ? task.due : DAY, task.repeat);
      const again = `${series}-${due.replaceAll('-', '')}`;
      if (tasks.value.some((one) => one.id === again)) change(again, { deleted: done ? undefined : now() });
      else if (done) tasks.value = [...tasks.value, { ...task, id: again, due, done: false, squares: [] }];
    },
    remove: (id) => change(id, { deleted: now() }),
    restore: (id) => change(id, { deleted: undefined }),
    move(id, before) {
      const moved = tasks.value.find((task) => task.id === id);
      if (!moved) return;
      const rest = tasks.value.filter((task) => task.id !== id);
      const at = before === null ? rest.length : rest.findIndex((task) => task.id === before);
      tasks.value = [...rest.slice(0, at), moved, ...rest.slice(at)];
    },
    addSubtask(parent, title) {
      if (!title) return null;
      const id = `sub-${++ids}`;
      tasks.value = [...tasks.value, { id, title, parent }];
      return id;
    },
    editSubtask: (id, fields) => change(id, { ...fields, ...(fields.title !== undefined && { title: fields.title.trim() }) }),
    addProject(name, color) {
      if (!name) return null;
      const id = `project-${++ids}`;
      projects.value = [...projects.value, { id, name, color }];
      return id;
    },
    editProject: (id, fields) => void (projects.value = projects.value.map((project) => (project.id === id ? { ...project, ...fields } : project))),
    setTarget: (laps) => void (target.value = laps),

    credit(id, part, ms) {
      day.ms += ms;
      if (part === 1) day.laps++;
      if (id) change(id, { squares: [...(tasks.value.find((task) => task.id === id)?.squares ?? []), part] });
    },
    rows: computed(() => new Map(tasks.value.map((task) => [task.id, { id: task.id, title: task.title, deleted: task.deleted ?? null }]))),
  };
}
