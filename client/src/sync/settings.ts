// What the Settings screen and the reward moments are given. The lead wrote this interface so the
// ui lane and the core lane could build to it at the same time; the core lane fills it in.
// Rules: contracts/schemas/settings.schema.json for the fields, protocol.md section 16.

import { computed, effect, signal, untracked } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { stampDevice } from '../core/hlc.ts';
import { lapMarks, taskMarks } from '../core/marks.ts';
import type { Mark } from '../core/marks.ts';
import { localDay, stats } from '../core/stats.ts';
import { asTask } from '../core/today.ts';
import { createCounts, lapLengths } from './counts.ts';
import type { Engine } from './engine.ts';

export type { Mark } from '../core/marks.ts';

/** The synced settings, each with its default when nobody has written it. Lengths in ms. */
export interface SettingsView {
  work_ms: number;
  short_ms: number;
  long_ms: number;
  /** Start the break when a lap rings, and the next lap when a break rings. Both off unless switched on. */
  auto_break: boolean;
  auto_work: boolean;
  /** The id of the bell. */
  sound: string;
  /** Show the completion moments and marks. On unless switched off. */
  celebrate: boolean;
  /** The day target in laps, 0 for none. */
  day_target: number;
  /** Rooms may see the title of the task a lap is for. */
  share_task: boolean;
  rooms_hidden: boolean;
}

export interface Settings {
  readonly all: ReadonlySignal<SettingsView>;
  /** Writes the fields given; values outside the schema are refused whole, nothing written. True when written. */
  set(fields: Partial<SettingsView>): boolean;
  /** "Ring here": this device rings at the bell. Per device, kept locally, never synced. On unless switched off. */
  readonly ringHere: ReadonlySignal<boolean>;
  setRingHere(ring: boolean): void;
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
// How long a shown mark's key is kept in `settings.marks`. A mark older than a day is never
// shown, so a key older than this guards nothing, and the one cell must not grow for ever.
const KEYS_KEPT_MS = 2 * DAY_MS;
const FLAGS = ['auto_break', 'auto_work', 'celebrate', 'share_task', 'rooms_hidden'] as const;
const LENGTHS = ['work_ms', 'short_ms', 'long_ms'] as const;
const whole = (v: unknown, least: number, most = Infinity) => typeof v === 'number' && Number.isInteger(v) && v >= least && v <= most;

// Whether a value may be written to a field: the schema's types and ranges.
const fits: Record<keyof SettingsView, (v: unknown) => boolean> = {
  work_ms: (v) => whole(v, 1000, DAY_MS),
  short_ms: (v) => whole(v, 1000, DAY_MS),
  long_ms: (v) => whole(v, 1000, DAY_MS),
  auto_break: (v) => typeof v === 'boolean',
  auto_work: (v) => typeof v === 'boolean',
  sound: (v) => typeof v === 'string' && v.length > 0 && v.length <= 64,
  celebrate: (v) => typeof v === 'boolean',
  day_target: (v) => whole(v, 0),
  share_task: (v) => typeof v === 'boolean',
  rooms_hidden: (v) => typeof v === 'boolean',
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
      sound: fits.sound(held?.sound) ? (held!.sound as string) : 'bell',
      celebrate: flag('celebrate', true),
      day_target: fits.day_target(held?.day_target) ? (held!.day_target as number) : 0,
      share_task: flag('share_task', false),
      rooms_hidden: flag('rooms_hidden', false),
    };
  });

  // "Ring here" is this device's, whoever is signed in: it lives in the install's own store, not in any cell.
  const ringHere = signal(engine.kept('ring_here', 'device') !== false);

  // What has been achieved, from the sessions and from the tasks. Each is worked out again only
  // when its own rows change, and not at all while celebrations are off: nothing reads them then.
  const counts = createCounts(engine, env.utcOffsetMin);
  const fromLaps = computed(() => {
    const sessions = counts.sessions.value;
    return lapMarks(sessions, stats(sessions, env.utcOffsetMin()).days, localDay(engine.now(), env.utcOffsetMin()), env.utcOffsetMin());
  });
  const taskLaps = computed(() => {
    const laps = new Map<string, number>();
    for (const s of counts.sessions.value) if (s.task !== null && s.kind === 'work' && s.outcome === 'rang') laps.set(s.task, (laps.get(s.task) ?? 0) + 1);
    return laps;
  });
  const fromTasks = computed(() => {
    const tasks = [...engine.rows('task').value].flatMap(([id, task]) => asTask(id, task) ?? []);
    return taskMarks(tasks, (id) => taskLaps.value.get(id) ?? 0);
  });

  const marks = signal<Mark[]>([]);
  const stopMarks = effect(() => {
    // With celebrations off nothing is shown and nothing is written.
    if (!all.value.celebrate) return;
    const shown = (row.value?.marks ?? {}) as Record<string, unknown>;
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
      const kept = Object.entries(shown).filter(([, at]) => typeof at === 'number' && now - at < KEYS_KEPT_MS);
      engine.write('settings', 'current', { marks: Object.fromEntries([...kept, ...fresh.map((e) => [e.key, now])]) });
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
    setRingHere(ring) {
      ringHere.value = ring;
      engine.keep('ring_here', ring, 'device');
    },

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
