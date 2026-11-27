// What the Settings screen and the reward moments are given. The lead wrote this interface so the
// ui lane and the core lane could build to it at the same time; the core lane fills it in.
// Rules: contracts/schemas/settings.schema.json for the fields, protocol.md section 16.

import { computed, effect, signal, untracked } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { stampDevice } from '../core/hlc.ts';
import { keysKept, lapMarks, taskMarks } from '../core/marks.ts';
import type { Mark } from '../core/marks.ts';
import { localDay, stats } from '../core/stats.ts';
import { pinnedDays } from '../core/streak.ts';
import { asTask } from '../core/today.ts';
import { LAP_MAX_MS, createCounts, lapLengths } from './counts.ts';
import type { Engine } from './engine.ts';

export type { Mark } from '../core/marks.ts';

/** The bells, as the schema names them. The first is the default, and what any other value reads as. */
export const SOUNDS = ['school', 'struck', 'chime'] as const;
export type Sound = (typeof SOUNDS)[number];

/** The synced settings, each with its default when nobody has written it. Lengths in ms. */
export interface SettingsView {
  work_ms: number;
  short_ms: number;
  long_ms: number;
  /** Start the break when a lap rings, and the next lap when a break rings. Both off unless switched on. */
  auto_break: boolean;
  auto_work: boolean;
  /** The bell. */
  sound: Sound;
  /** Show the completion moments and marks. On unless switched off. */
  celebrate: boolean;
  /** The day target in laps, 0 for none. */
  day_target: number;
  /** Rooms may see the title of the task a lap is for. */
  share_task: boolean;
  rooms_hidden: boolean;
  /** Weekdays pinned as rest for the focus streak, bit 0 Monday to bit 6 Sunday; at most two read back, 0 for none. */
  rest_days: number;
}

export interface Settings {
  readonly all: ReadonlySignal<SettingsView>;
  /** Writes the fields given; values outside the schema are refused whole, nothing written. True when written. */
  set(fields: Partial<SettingsView>): boolean;
  /** "Ring here": this device rings at the bell. Per device, kept locally, never synced. On unless switched off. */
  readonly ringHere: ReadonlySignal<boolean>;
  setRingHere(ring: boolean): void;
  /** The phone keeps step while the app is closed (its background connection). Per device like `ringHere`: on unless switched off. */
  readonly keepInStep: ReadonlySignal<boolean>;
  setKeepInStep(on: boolean): void;
  /** The phone buzzes with the bell. Per device like `ringHere`: on unless switched off. */
  readonly vibrate: ReadonlySignal<boolean>;
  setVibrate(on: boolean): void;
  /** The phone plays the bell as an alarm, through Mute. Per device like `ringHere`: on unless switched off. */
  readonly ringOnSilent: ReadonlySignal<boolean>;
  setRingOnSilent(on: boolean): void;
  /**
   * The marks earned by the latest thing that happened on this device, oldest first, for the
   * moment that follows it; empty when celebrations are off. Each mark is given once: `seen()`
   * clears them, and a mark another device already showed is not shown again here.
   */
  readonly marks: ReadonlySignal<Mark[]>;
  seen(): void;
  /** Everything this account holds, as one JSON text a person can keep. */
  exportAll(): string;
  /** Reads such a text back. Cells merge by their stamps, so importing twice, or into a device that has moved on, loses nothing. */
  importAll(text: string): { ok: true; cells: number } | { ok: false; error: 'not_json' | 'not_heirloom' | 'empty' };
}

export interface SettingsEnv {
  /** The device's offset from UTC in minutes, east positive. */
  utcOffsetMin(): number;
}

const DAY_MS = 86400000;
const FLAGS = ['auto_break', 'auto_work', 'celebrate', 'share_task', 'rooms_hidden'] as const;
const LENGTHS = ['work_ms', 'short_ms', 'long_ms'] as const;
const whole = (v: unknown, least: number, most = Infinity) => typeof v === 'number' && Number.isInteger(v) && v >= least && v <= most;

export { LAP_MAX_MS };

// Whether a value may be written to a field: the schema's types and ranges.
const fits: Record<keyof SettingsView, (v: unknown) => boolean> = {
  work_ms: (v) => whole(v, 1000, LAP_MAX_MS),
  short_ms: (v) => whole(v, 1000, DAY_MS),
  long_ms: (v) => whole(v, 1000, DAY_MS),
  auto_break: (v) => typeof v === 'boolean',
  auto_work: (v) => typeof v === 'boolean',
  sound: (v) => (SOUNDS as readonly unknown[]).includes(v),
  celebrate: (v) => typeof v === 'boolean',
  day_target: (v) => whole(v, 0),
  share_task: (v) => typeof v === 'boolean',
  rooms_hidden: (v) => typeof v === 'boolean',
  rest_days: (v) => whole(v, 0, 127),
};

/** `close()` stops watching for marks. */
export function createSettings(engine: Engine, env: SettingsEnv): Settings & { close(): void } {
  const me = engine.device;
  const row = computed(() => engine.rows('settings').value.get('current'));

  const all = computed((): SettingsView => {
    const held = row.value;
    const flag = (name: (typeof FLAGS)[number], otherwise: boolean) => (typeof held?.[name] === 'boolean' ? (held[name] as boolean) : otherwise);
    return {
      ...lapLengths(held),
      auto_break: flag('auto_break', false),
      auto_work: flag('auto_work', false),
      sound: fits.sound(held?.sound) ? (held!.sound as Sound) : SOUNDS[0],
      celebrate: flag('celebrate', true),
      day_target: fits.day_target(held?.day_target) ? (held!.day_target as number) : 0,
      share_task: flag('share_task', false),
      rooms_hidden: flag('rooms_hidden', false),
      rest_days: pinnedDays(held?.rest_days),
    };
  });

  // These are this device's, whoever is signed in: they live in the install's own store, not in any cell. Each is on unless switched off.
  const local = (name: string) => {
    const on = signal(engine.kept(name, 'device') !== false);
    const set = (value: boolean) => {
      on.value = value;
      engine.keep(name, value, 'device');
    };
    return [on, set] as const;
  };
  const [ringHere, setRingHere] = local('ring_here');
  const [keepInStep, setKeepInStep] = local('keep_in_step');
  const [vibrate, setVibrate] = local('vibrate');
  const [ringOnSilent, setRingOnSilent] = local('ring_on_silent');

  // What has been achieved, from the sessions and from the tasks. Each is worked out again only
  // when its own rows change, and not at all while celebrations are off: nothing reads them then.
  const counts = createCounts(engine, env.utcOffsetMin);
  const fromLaps = computed(() => {
    const sessions = counts.sessions.value;
    return lapMarks(sessions, stats(sessions, env.utcOffsetMin()).days, localDay(engine.now(), env.utcOffsetMin()), env.utcOffsetMin());
  });
  const taskLaps = computed(() => {
    // A task's laps as the task shows them, rang or stopped, and how many of them rang.
    const laps = new Map<string, { laps: number; rang: number }>();
    for (const s of counts.sessions.value) {
      if (s.task === null || s.kind !== 'work' || s.outcome === 'void') continue;
      const held = laps.get(s.task) ?? { laps: 0, rang: 0 };
      laps.set(s.task, { laps: held.laps + 1, rang: held.rang + (s.outcome === 'rang' ? 1 : 0) });
    }
    return laps;
  });
  const fromTasks = computed(() => {
    const tasks = [...engine.rows('task').value].flatMap(([id, task]) => asTask(id, task) ?? []);
    return taskMarks(tasks, (id) => taskLaps.value.get(id) ?? { laps: 0, rang: 0 });
  });

  const marks = signal<Mark[]>([]);
  const stopMarks = effect(() => {
    // With celebrations off nothing is shown and nothing is written.
    if (!all.value.celebrate) return;
    // An imported copy, or a newer build, may have put anything there: only an object is a set of keys.
    const held = row.value?.marks;
    const shown = (held !== null && typeof held === 'object' && !Array.isArray(held) ? held : {}) as Record<string, unknown>;
    const earned = [...fromLaps.value, ...fromTasks.value];
    untracked(() => {
      const now = engine.now();
      // A mark is for what just happened here: achieved within the day, by a cell this device
      // wrote, and not shown before on any device. So nothing is replayed when celebrations are
      // switched on, and nothing appears for merely opening the app and catching up.
      const fresh = earned
        .filter((e) => now - e.at < DAY_MS && !(e.key in shown) && stampDevice(engine.stamp(...e.cell) ?? '') === me)
        .sort((a, b) => a.at - b.at);
      if (!fresh.length) return;
      marks.value = [...marks.peek(), ...fresh.map((e) => e.mark)];
      const next = { ...shown, ...Object.fromEntries(fresh.map((e) => [e.key, now])) };
      engine.write('settings', 'current', { marks: Object.fromEntries(keysKept(next, localDay(now, env.utcOffsetMin()))) });
    });
  });

  return {
    all,

    set(fields) {
      const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
      // All or nothing: one value the schema would not take, or a field it does not have, and nothing is written.
      if (!entries.length || !entries.every(([name, value]) => (fits as Record<string, ((v: unknown) => boolean) | undefined>)[name]?.(value))) return false;
      engine.write('settings', 'current', Object.fromEntries(entries));
      return true;
    },

    ringHere,
    setRingHere,
    keepInStep,
    setKeepInStep,
    vibrate,
    setVibrate,
    ringOnSilent,
    setRingOnSilent,

    marks,
    seen() {
      marks.value = [];
    },

    exportAll: () => JSON.stringify({ heirloom: 1, exported: engine.now(), account: engine.account.peek()?.username ?? '', cells: engine.cells() }),

    importAll(text) {
      let copy: { heirloom?: unknown; cells?: unknown };
      try {
        copy = JSON.parse(text);
      } catch {
        return { ok: false, error: 'not_json' };
      }
      if (copy === null || typeof copy !== 'object' || copy.heirloom !== 1 || !Array.isArray(copy.cells)) return { ok: false, error: 'not_heirloom' };
      if (!copy.cells.length) return { ok: false, error: 'empty' };
      // Through the ordinary merge, each cell with its own stamp: the newer one wins, as everywhere.
      return { ok: true, cells: engine.merge(copy.cells) };
    },

    close: stopMarks,
  };
}
