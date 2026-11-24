// What the Room screen is given. The lead wrote this interface so the ui lane and the core lane
// could build to it at the same time; the core lane fills in createRooms.
// Rules: contracts/protocol.md section 15. Rooms are not cells: the server owns them, and every
// change to one needs a connection.

import type { ReadonlySignal } from '@preact/signals-core';
import type { Engine } from './engine.ts';

export interface MemberView {
  id: string;
  name: string;
  you: boolean;
  /** They have hidden rooms: no phase, no task, no last lap; their totals still count. */
  away: boolean;
  phase: 'idle' | 'work' | 'short' | 'long';
  /** 1 to 4: the lap of the set they are on or between. */
  lap: number;
  /** Server-time ms the phase ends, or null when idle or paused. Time left is this less the engine's now. */
  ends_at: number | null;
  paused: boolean;
  /** The title of the task their lap is for, only if they share it. */
  task: string | null;
  today_ms: number;
  today_laps: number;
  week_ms: number;
  /** Their latest lap that rang today, who cheered it, and whether you have. */
  last: { run: string; ended: number; cheers: string[]; cheered: boolean } | null;
}

export interface RoomView {
  id: string;
  name: string;
  /** The code a friend types to join. */
  code: string;
  /** What the room fills together in a week, in ms. 0 when none is set. */
  target_ms: number;
  /** The sum of the members' weeks. */
  week_ms: number;
  /** When true the members are listed by their week, most first; otherwise in the order they joined. */
  ranked: boolean;
  members: MemberView[];
}

/** `error` is a code from protocol sections 10 and 15, or `offline`. */
export type RoomResult = { ok: true; room?: string } | { ok: false; error: string };

export interface Rooms {
  /** The rooms this account is in, as the server last said. Kept while offline, marked by `stale`. */
  readonly list: ReadonlySignal<RoomView[]>;
  /** True while there is no connection: what is shown is the last word, not now. */
  readonly stale: ReadonlySignal<boolean>;
  /** The person has hidden rooms (settings). The Room destination goes away and others see them as away. */
  readonly hidden: ReadonlySignal<boolean>;
  /** Rooms may see the title of the task a lap is for (settings). Off unless switched on. */
  readonly shareTask: ReadonlySignal<boolean>;
  /** Who cheered your latest lap today, across rooms, each name once: for the Focus result. */
  readonly cheered: ReadonlySignal<string[]>;

  create(name: string): Promise<RoomResult>;
  join(code: string): Promise<RoomResult>;
  leave(room: string): Promise<RoomResult>;
  update(room: string, fields: { name?: string; target_ms?: number; ranked?: boolean }): Promise<RoomResult>;
  /** Cheers a member's latest lap. Shown at once; sent now, or kept and sent when there is a connection again. */
  cheer(room: string, member: string): void;
  setHidden(hidden: boolean): void;
  setShareTask(share: boolean): void;
}

export function createRooms(engine: Engine): Rooms & { close(): void } {
  throw new Error('not built yet: createRooms, roadmap section 7');
}
