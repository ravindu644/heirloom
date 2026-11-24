// What the Settings screen and the reward moments are given. The lead wrote this interface so the
// ui lane and the core lane could build to it at the same time; the core lane fills it in.
// Rules: contracts/schemas/settings.schema.json for the fields, protocol.md section 16.

import type { ReadonlySignal } from '@preact/signals-core';
import type { Engine } from './engine.ts';

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

/** A mark for something that was achieved, never for showing up. */
export type Mark =
  /** The total of laps that rang has reached a tier: 1, 4, 25, 100, 250, 500, 1000, 2500. */
  | { kind: 'laps'; tier: number }
  /** A task was done with its laps at or under its estimate. */
  | { kind: 'estimate'; task: string; title: string; estimate: number; laps: number }
  /** This week has passed the best week before it. */
  | { kind: 'week'; focus_ms: number; before_ms: number };

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

export function createSettings(engine: Engine, env: SettingsEnv): Settings & { close(): void } {
  throw new Error('not built yet: createSettings, roadmap section 8');
}
