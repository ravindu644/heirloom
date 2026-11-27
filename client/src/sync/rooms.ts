// What the Room screen is given. The lead wrote this interface so the ui lane and the core lane
// could build to it at the same time; the core lane fills in createRooms.
// Rules: contracts/protocol.md section 15. Rooms are not cells: the server owns them, and every
// change to one needs a connection.

import { batch, computed, effect, signal, untracked } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { mondayOf } from '../core/progress.ts';
import { midnight } from '../core/stats.ts';
import { weekday } from '../core/streak.ts';
import { view } from '../core/timer.ts';
import { createCounts } from './counts.ts';
import type { Engine, RoomMessage } from './engine.ts';
import type { Together } from './focus.ts';

export interface MemberView {
  id: string;
  name: string;
  you: boolean;
  /** The hash of their picture, for `Rooms.picture`, or null: then the initial of their name. */
  picture: string | null;
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
  /** Your own lane's also holds your lap in progress as far as it has run, as Today does. A friend's holds their rows only. */
  today_ms: number;
  today_laps: number;
  week_ms: number;
  /** Their laps of today that have ended, `[started, ended]` in server ms, oldest first: for their lane. Empty from an older server and for someone away. */
  laps: [number, number][];
  /** Their week against their last, for their report: as `RoomView.week`, today being their `week_ms` (yours with your lap in progress). Null for someone away and from an older server. */
  week: MemberWeek | null;
  /** When the lap they are on began, in server ms, so the lane fills it from there to now; null with none. Paused time is not in it. */
  runStart: number | null;
  /** Their latest lap that rang today, who cheered it, and whether you have. */
  last: {
    run: string;
    ended: number;
    cheers: string[];
    cheered: boolean;
    /** Those of `cheers` who are in the room, with their names, in the same order: for saying who cheered. */
    cheerers: { id: string; name: string }[];
  } | null;
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
  /**
   * When true the members are listed by their week, most first. Otherwise in the live order: on
   * a lap, then on a break, then the rest, each by their week, most first; joining order on a tie.
   */
  ranked: boolean;
  /**
   * The name of the member who keeps the room: only they may change its name, target and
   * ranking. Null from an older server, which names no keeper: then anyone may, as before.
   */
  keeper: string | null;
  /** You may change the room's name, target and ranking: you keep it, or the server names no keeper. */
  youKeep: boolean;
  members: MemberView[];
  /** For the Week tab. Null from a server that does not send the room's days. */
  week: RoomWeek | null;
  /**
   * The room's streak as the server said it, or null from a server that does not send it. A
   * `none` day is before the room was made or before anything was kept: no dot, its place kept.
   */
  streak: { run: number; marks: ('kept' | 'rest' | 'miss' | 'open' | 'none')[] } | null;
  /** The open call, or null. */
  call: CallView | null;
  /** The last seven days of notes, newest first. Fetched when the room says there is a newer one. */
  notes: NoteView[];
  /** Notes from others written since Notes was last open while you were not on a lap. */
  newNotes: number;
}

export interface MemberWeek {
  /** The week so far, added up day by day, Monday first: today is the `week_ms` shown, laps in progress in it; days to come are null. */
  days: (number | null)[];
  /** Last week the same way, all seven days. */
  last: number[];
  /** The week less last week's as far as the same weekday and time: "4h ahead" when positive. Null when the server did not say. */
  ahead_ms: number | null;
}

export interface RoomWeek extends MemberWeek {
  /** Your part of the room's week: your own `week_ms`. */
  you_ms: number;
}

export interface CallView {
  id: string;
  /** Who called it. */
  by: { id: string; name: string };
  /** When the lap starts, in server ms: compare with the engine's `now()`. */
  at: number;
  /** Who is in, the caller first. */
  in: { id: string; name: string }[];
  /** You are in. */
  you: boolean;
  /** You called it: taking it back is `callLap(room, null)`. */
  yours: boolean;
}

export interface NoteView {
  id: string;
  /** The writer's id, or null for someone who has left. */
  from: string | null;
  /** The writer's name, or null for someone who has left ("Someone who left"). */
  name: string | null;
  /** Their picture's hash, or null. */
  picture: string | null;
  you: boolean;
  /** Server ms. */
  at: number;
  text: string;
}

/** A called lap you are in, for the phone's notification at its start (`Notifier`, android lane). */
export interface CalledLap {
  room: string;
  /** The room's name. */
  name: string;
  call: string;
  /** Server ms. */
  at: number;
  /** Who called it, by name. */
  by: string;
}

/** `error` is a code from protocol sections 10 and 15, or `offline`. With `slow_down`, `retry_after` is the seconds to wait when the server said. */
export type RoomResult = { ok: true; room?: string } | { ok: false; error: string; retry_after?: number };

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
  /** The keeper's only: anyone else is answered `forbidden`. */
  update(room: string, fields: { name?: string; target_ms?: number; ranked?: boolean }): Promise<RoomResult>;
  /** Cheers a member's latest lap. Shown at once; sent now, or kept and sent when there is a connection again. */
  cheer(room: string, member: string): void;
  /** The keeper's only: the member is out, and the room gets a new code. */
  remove(room: string, member: string): Promise<RoomResult>;
  /** Calls a lap for `at` (server ms, a whole minute 1 to 30 minutes ahead), or with null takes your own call back. */
  callLap(room: string, at: number | null): Promise<RoomResult>;
  /**
   * Says you are in a call, or takes it back, until it starts. Not for the caller, who is in and
   * takes it back with `callLap(room, null)`. Answered `call` when the call has started or ended:
   * the call is gone from the room at once, and there is nothing to say.
   */
  setIn(room: string, call: string, isIn: boolean): Promise<RoomResult>;
  /** One line for the room: 1 to 200 characters, no line break. */
  addNote(room: string, text: string): Promise<RoomResult>;
  /** Notes has been opened: what is there now is not new any more. Nothing while you are on a lap, where Notes does not show them. */
  markNotesRead(room: string): void;
  /** Every open call you are in, soonest first: for the phone's notification at its start. */
  readonly calledIn: ReadonlySignal<CalledLap[]>;
  /** Your picture: the bytes of a square 96 by 96 WebP or JPEG of at most 12000 bytes, made by the screen, or null to take it off. */
  setPicture(picture: Uint8Array | null): Promise<RoomResult>;
  /**
   * A member's picture as a URL an `img` can show, or null when it cannot be had now. Kept on
   * the device by hash (the 50 used last), so it is there at once on a cold start and offline;
   * only a hash not kept is fetched.
   */
  picture(hash: string): Promise<string | null>;
  /** The same, at once, from what the device keeps: for the first paint. Null when it is not kept yet; then `picture` fetches it. */
  pictureNow(hash: string): string | null;
  /** Turns over at each account change, when every picture URL given before is let go: drop any state holding one when it changes. */
  readonly account: ReadonlySignal<number>;
  setHidden(hidden: boolean): void;
  setShareTask(share: boolean): void;
}

export interface RoomsEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. The system's own when left out. */
  utcOffsetMin?(): number;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
  /** Starts a called lap: `createFocus(...).together`. Left out, a called lap starts nothing here. */
  together?: Together;
  /** The task a lap started now would be for, as Focus would start it. */
  task?(): string | null;
}

type RoomNow = Extract<RoomMessage, { type: 'room' }>;

// A cheer still to be sent: which lap of whom, in which room.
interface Cheer {
  room: string;
  to: string;
  run: string;
}

const DAY_MS = 86400000;
const MIN = 60000;
const PHASES = ['idle', 'work', 'short', 'long'] as const;
const keyOf = (cheer: Cheer) => `${cheer.room}/${cheer.to}/${cheer.run}`;
const text = (v: unknown, or = '') => (typeof v === 'string' ? v : or);
const amount = (v: unknown) => (typeof v === 'number' && v >= 0 ? v : 0);
const seven = (v: unknown): number[] | null => (Array.isArray(v) && v.length === 7 ? v.map(amount) : null);
const MARKS = ['kept', 'rest', 'miss', 'open', 'none'] as const;
// On a lap first, then on a break, then the rest.
const GROUP = { work: 0, short: 1, long: 1, idle: 2 } as const;
// The calls this device has started, or tried to: kept, so a lap stopped in its first minute is not started again after a restart.
const TRIED_KEPT = 20;
// Pictures kept on the device, each about 5 KB: the ones used last.
const PICTURES_KEPT = 50;
const HASH = /^[0-9a-f]{64}$/;
const toBase64 = (bytes: Uint8Array) => {
  let out = '';
  // In pieces: one call with every byte as an argument runs out of stack on a larger file.
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(out);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

interface Note {
  id: string;
  from: string | null;
  at: number;
  text: string;
}
const asNotes = (v: unknown): Note[] =>
  (Array.isArray(v) ? v : []).flatMap((n) =>
    n && typeof n.id === 'string' && typeof n.at === 'number' && typeof n.text === 'string' ? [{ id: n.id, from: typeof n.from === 'string' ? n.from : null, at: n.at, text: n.text }] : [],
  );

/**
 * `env.schedule` is how a member turns idle when their bell goes with no new message.
 * `close()` stops listening and cancels that wait.
 */
export function createRooms(engine: Engine, env: RoomsEnv): Rooms & { close(): void } {
  // The last message for each room, as it came. Kept on the device, so the screen is not empty offline.
  const rooms = signal<ReadonlyMap<string, RoomNow>>(new Map());
  // Cheers the server has not answered yet. Kept too: one made in a tunnel is sent after it, restart or not.
  const waiting = signal<readonly Cheer[]>([]);
  // Cheers this run of the app has sent and had accepted, so they stay shown until the server's message says so itself.
  const accepted = signal<ReadonlySet<string>>(new Set());
  const flying = new Set<string>();
  // The notes of each room as last fetched, and the `notes_since` each fetch was for (or is in the air for).
  const notes = signal<ReadonlyMap<string, Note[]>>(new Map());
  const fetched = new Map<string, unknown>();
  // For each room, the newest note seen with Notes open: anything later from someone else is new.
  const read = signal<Readonly<Record<string, number>>>({});
  let tried: string[] = [];
  // Pictures: the URLs made this app life, the fetches in the air, and the hashes kept on the
  // device, least recently used first. Each kept picture is its own value, `picture.<hash>`, so
  // keeping one does not write the others again. `account` turns over at each account change,
  // and a fetch begun for another account keeps nothing.
  const urls = new Map<string, string>();
  const asking = new Map<string, Promise<string | null>>();
  let order: string[] = [];
  let ordering = false;
  const account = signal(0);
  // The rooms the server has spoken of since this connection began. A called lap starts only
  // from these: a message kept from before may hold a call taken back since.
  const heard = signal<ReadonlySet<string>>(new Set());
  // getTimezoneOffset counts minutes west of UTC; the contract counts east.
  const offset = env.utcOffsetMin ?? (() => -new Date().getTimezoneOffset());
  const counts = createCounts(engine, offset);
  const connected = computed(() => engine.sync.value === 'syncing' || engine.sync.value === 'in-step');
  // How far the account has read the room's notes, by the server: 0 for never, or from an older server.
  const serverRead = (msg: RoomNow) => (typeof msg.notes_read === 'number' && Number.isFinite(msg.notes_read) ? msg.notes_read : 0);

  function remember(next: ReadonlyMap<string, RoomNow>) {
    rooms.value = next;
    engine.keep('rooms', [...next.values()]);
  }
  function queue(next: readonly Cheer[]) {
    waiting.value = next;
    engine.keep('cheers', next);
  }

  // Each account has its own rooms and its own cheers waiting: read again whenever the account changes.
  const stopAccount = effect(() => {
    void engine.account.value;
    untracked(() => {
      const held = engine.kept('rooms');
      const cheers = engine.kept('cheers');
      const seen = engine.kept('notesRead');
      const calls = engine.kept('together');
      tried = Array.isArray(calls) ? calls.filter((id): id is string => typeof id === 'string') : [];
      fetched.clear();
      // Another account's pictures are not this one's to see: its own kept ones, and the server checks each anew.
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      asking.clear();
      const kept = engine.kept('pictures');
      order = Array.isArray(kept) ? kept.filter((hash): hash is string => typeof hash === 'string' && HASH.test(hash)) : [];
      batch(() => {
        account.value += 1;
        notes.value = new Map();
        read.value = seen && typeof seen === 'object' ? (seen as Record<string, number>) : {};
        rooms.value = new Map((Array.isArray(held) ? (held as RoomNow[]) : []).filter((msg) => typeof msg?.room === 'string').map((msg) => [msg.room, msg]));
        waiting.value = Array.isArray(cheers) ? (cheers as Cheer[]).filter((c) => [c?.room, c?.to, c?.run].every((part) => typeof part === 'string')) : [];
        accepted.value = new Set();
        heard.value = new Set();
      });
    });
  });
  const stopHeard = effect(() => {
    if (!connected.value) untracked(() => (heard.value = new Set()));
  });

  // A room that is no more, and the cheers waiting for it, which have nowhere to go.
  function forget(gone: (room: string) => boolean) {
    if (waiting.peek().some((cheer) => gone(cheer.room))) queue(waiting.peek().filter((cheer) => !gone(cheer.room)));
    if ([...rooms.peek().keys()].some(gone)) remember(new Map([...rooms.peek()].filter(([id]) => !gone(id))));
  }

  const stopRooms = engine.onRoom((msg) => {
    // The whole set: a room it does not name was left, or ended, while this device was away.
    if (msg.type === 'rooms') return forget((id) => !msg.rooms.includes(id));
    if (msg.gone === true) return forget((id) => id === msg.room);
    batch(() => {
      remember(new Map(rooms.peek()).set(msg.room, msg));
      if (!heard.peek().has(msg.room)) heard.value = new Set([...heard.peek(), msg.room]);
    });
  });

  // A member's bell goes at `ends_at` whether or not the server says so in time. The list is
  // worked out again at the next one due.
  const bell = signal(0);
  let cancelBell = () => {};

  // Your lap in progress as far as it has run, for your own lane: the server's totals are of rows,
  // and it has none yet. Its minutes are cut at midnight, as Progress cuts them: what no row
  // holds is its tail, so the part of it after today's (or this week's) midnight is today's.
  // Your lane: your own laps that touch today, one from before midnight included, the open lap
  // in place of a row it has outgrown, and one past its bell with no row yet is a lap that ended.
  function yours(now: number): { today: number; week: number; laps: [number, number][]; runStart: number | null } {
    const lap = counts.open(now);
    const today = counts.today(now);
    const rows = (counts.byDay.value.get(today) ?? []).filter((row) => row.kind === 'work' && row.outcome !== 'void' && row.id !== lap?.id);
    const ended = lap?.outcome === 'rang' && counts.today(lap.ended) === today ? [lap] : [];
    const laps = [...rows, ...ended].sort((a, b) => a.started - b.started).map((row): [number, number] => [row.started, row.ended]);
    if (!lap) return { today: 0, week: 0, laps, runStart: null };
    const ran = counts.unwritten(now);
    const after = (day: string) => Math.min(ran, Math.max(0, lap.ended - midnight(day, offset())));
    return { today: after(today), week: after(mondayOf(today)), laps, runStart: lap.outcome === 'rang' ? null : lap.started };
  }

  // The room's week day by day, this week to today and last week whole, from the server's rows
  // per day. Today is the room's week as shown, so the chart ends where the figure stands.
  // The same for one member, from their own `days` (their calendar, read at this device's weekday).
  function weekOf(of: Record<string, unknown>, week_ms: number, now: number): MemberWeek | null {
    const days = seven(of.days);
    if (!days) return null;
    const today = weekday(Date.parse(counts.today(now)));
    let sum = 0;
    let before = 0;
    return {
      days: days.map((ms, i) => (i < today ? (sum += ms) : i === today ? week_ms : null)),
      last: (seven(of.last_days) ?? [0, 0, 0, 0, 0, 0, 0]).map((ms) => (before += ms)),
      // ponytail: last week "at this time" is as of the server's message; it moves on at the next one.
      ahead_ms: typeof of.last_at_ms === 'number' ? week_ms - of.last_at_ms : null,
    };
  }


  // A friend's lap in progress: how far the server said it had run at `server_time`, and on since
  // then while it is not paused, up to its bell. Nothing when the message has no `run` (an older server).
  function running(member: Record<string, unknown>, said: unknown, ends: number | null, now: number): { today: number; week: number; moving: boolean; laps: [number, number][]; runStart: number | null } {
    const run = member.run as { ms?: unknown; today?: unknown; week?: unknown } | null | undefined;
    const laps = member.away === true || !Array.isArray(member.laps) ? [] : member.laps.filter((lap): lap is [number, number] => Array.isArray(lap) && typeof lap[0] === 'number' && typeof lap[1] === 'number');
    if (member.away === true || !run || typeof run !== 'object' || typeof run.ms !== 'number' || run.ms < 0) return { today: 0, week: 0, moving: false, laps, runStart: null };
    const moving = member.paused !== true && typeof said === 'number';
    const ran = run.ms + (moving ? Math.max(0, Math.min(now, ends ?? now) - (said as number)) : 0);
    // ponytail: as far back from the message as it had run; a lap paused earlier reads as begun that much later.
    const runStart = typeof said === 'number' ? said - run.ms : null;
    return { today: run.today === true ? ran : 0, week: run.week === true ? ran : 0, moving: moving && (ends === null || ends > now), laps, runStart };
  }

  // The rooms as shown, and the figures in them that move with a lap in progress: the list is
  // looked at again when the first of those reaches a whole minute.
  const model = computed(() => {
    void bell.value;
    const now = engine.now();
    const s = engine.timer.value;
    const own = { ...yours(now), moving: s.phase === 'work' && s.paused_at === null && !view(s, now).over && counts.open(now) !== null };
    const mine = new Set([...waiting.value.map(keyOf), ...accepted.value]);
    const moving: number[] = [];
    const views = [...rooms.value.values()].map((msg): RoomView => {
      // Only what could be a member: anything else in the list is left out, not tripped over.
      const raw = (Array.isArray(msg.members) ? (msg.members as Record<string, unknown>[]) : []).filter((member) => member !== null && typeof member === 'object');
      const you = text(raw.find((member) => member?.you === true)?.id);
      const names = new Map(raw.map((member) => [text(member.id), text(member.name)]));
      const members = raw.map((member): MemberView => {
        const id = text(member.id);
        const away = member.away === true;
        const ends = typeof member.ends_at === 'number' ? member.ends_at : null;
        // Their bell has gone since the server said this: idle, as its next message will say.
        const over = ends !== null && ends <= now;
        const phase = away || over ? 'idle' : (PHASES.find((p) => p === member.phase) ?? 'idle');
        const last = away ? null : (member.last as { run?: unknown; ended?: unknown; cheers?: unknown } | null | undefined);
        const run = text(last?.run);
        const theirs = Array.isArray(last?.cheers) ? last.cheers.filter((c): c is string => typeof c === 'string') : [];
        // A cheer made here shows at once, before the server has heard of it.
        const cheers = you && mine.has(keyOf({ room: msg.room, to: id, run })) && !theirs.includes(you) ? [...theirs, you] : theirs;
        // You are counted from this device's own timer, which knows your lap exactly; `run` is for everyone else.
        const lap = member.you === true ? own : running(member, msg.server_time, ends, now);
        const [today_ms, week_ms] = [amount(member.today_ms) + lap.today, amount(member.week_ms) + lap.week];
        if (lap.moving) moving.push(today_ms, week_ms);
        return {
          id,
          name: text(member.name),
          you: member.you === true,
          picture: typeof member.picture === 'string' ? member.picture : null,
          away,
          phase,
          lap: (typeof member.set_index === 'number' ? member.set_index : 0) + 1,
          ends_at: phase === 'idle' ? null : ends,
          paused: phase !== 'idle' && member.paused === true,
          task: phase === 'work' && typeof member.task === 'string' ? member.task : null,
          today_ms,
          today_laps: amount(member.today_laps),
          week_ms,
          laps: lap.laps,
          runStart: lap.runStart,
          // Yours too: the server's rows, with your lap in progress counted here as in `week_ms`.
          week: away ? null : weekOf(member, week_ms, now),
          last: run ? { run, ended: amount(last?.ended), cheers, cheered: cheers.includes(you), cheerers: cheers.flatMap((cheerer) => (names.has(cheerer) ? [{ id: cheerer, name: names.get(cheerer)! }] : [])) } : null,
        };
      });
      const ranked = msg.ranked === true;
      const keeper = typeof msg.keeper === 'string' ? msg.keeper : null;
      const week_ms = members.reduce((sum, member) => sum + member.week_ms, 0);
      const pictureOf = new Map(members.map((member) => [member.id, member.picture]));
      const named = (who: string) => ({ id: who, name: names.get(who) ?? '' });
      const call = msg.call as { id?: unknown; by?: unknown; at?: unknown; in?: unknown } | null | undefined;
      const callIn = Array.isArray(call?.in) ? call.in.filter((who): who is string => typeof who === 'string') : [];
      const streak = msg.streak as { run?: unknown; marks?: unknown } | null | undefined;
      const roomNotes = (notes.value.get(msg.room) ?? []).map((note): NoteView => ({
        ...note,
        // Someone who has left since is someone who left, whatever the note still says.
        from: note.from !== null && names.has(note.from) ? note.from : null,
        name: note.from !== null && names.has(note.from) ? names.get(note.from)! : null,
        picture: (note.from !== null && pictureOf.get(note.from)) || null,
        you: note.from !== null && note.from === you,
      }));
      // Read here or on another device of the account, whichever reached further.
      const seenAt = Math.max(read.value[msg.room] ?? -Infinity, serverRead(msg));
      return {
        id: msg.room,
        name: text(msg.name),
        code: text(msg.code),
        target_ms: amount(msg.target_ms),
        week_ms,
        ranked,
        keeper: keeper === null ? null : (names.get(keeper) ?? null),
        youKeep: keeper === null || (you !== '' && keeper === you),
        // The sort is stable: members level on it stay in the order they joined.
        members: members.toSorted((a, b) => (ranked ? 0 : GROUP[a.phase] - GROUP[b.phase]) || b.week_ms - a.week_ms),
        week: ((series) => series && { ...series, you_ms: members.find((member) => member.you)?.week_ms ?? 0 })(weekOf(msg, week_ms, now)),
        streak:
          streak && typeof streak.run === 'number' && Array.isArray(streak.marks)
            ? { run: streak.run, marks: streak.marks.filter((mark): mark is (typeof MARKS)[number] => MARKS.includes(mark)) }
            : null,
        call:
          call && typeof call.id === 'string' && typeof call.by === 'string' && typeof call.at === 'number'
            ? { id: call.id, by: named(call.by), at: call.at, in: callIn.map(named), you: you !== '' && callIn.includes(you), yours: call.by === you }
            : null,
        notes: roomNotes,
        newNotes: roomNotes.filter((note) => !note.you && note.at > seenAt).length,
      };
    });
    return { views, moving };
  });
  const list = computed(() => model.value.views);

  const stopBell = effect(() => {
    void bell.value;
    const all = rooms.value;
    const { moving } = model.value;
    untracked(() => {
      cancelBell();
      cancelBell = () => {};
      const now = engine.now();
      const ends = [...all.values()].flatMap((msg) => (Array.isArray(msg.members) ? (msg.members as { ends_at?: unknown }[]) : []).map((member) => member?.ends_at));
      const minutes = moving.map((ms) => now + MIN - (ms % MIN));
      const next = Math.min(...ends.filter((at): at is number => typeof at === 'number' && at > now), ...minutes);
      // A day at most: a browser runs a timer set further out than 2^31 ms at once.
      if (Number.isFinite(next)) cancelBell = env.schedule(() => void bell.value++, Math.min(next - now, DAY_MS));
    });
  });

  // One request per cheer, ever: `flying` while it is in the air, gone from `waiting` once answered.
  async function send(cheer: Cheer) {
    const key = keyOf(cheer);
    if (flying.has(key)) return;
    flying.add(key);
    const answer = await engine.request('/api/rooms/cheer', cheer);
    flying.delete(key);
    // `run`: that lap is gone or was set aside. `room`: the room is, or this account is out of
    // it. Either way there is nothing left to cheer, and it is dropped quietly. Any other failure
    // keeps it for the next connection.
    if (!answer.ok && answer.error !== 'run' && answer.error !== 'room') return;
    batch(() => {
      if (answer.ok) accepted.value = new Set([...accepted.peek(), key]);
      queue(waiting.peek().filter((other) => keyOf(other) !== key));
    });
  }

  // Whatever is waiting goes out when there is a connection, and again each time one returns.
  const stopSending = effect(() => {
    if (!connected.value) return;
    const all = waiting.value;
    untracked(() => all.forEach((cheer) => void send(cheer)));
  });

  // Notes are fetched when a room says it has a newer one than those held, and again after a
  // failed fetch at the next change or connection. A room whose notes have all gone has none.
  async function load(room: string, since: unknown) {
    fetched.set(room, since);
    const answer = since === null ? { ok: true as const, data: { notes: [] } } : await engine.request('/api/rooms/notes', { room });
    if (fetched.get(room) !== since) return;
    if (!answer.ok) return void fetched.delete(room);
    notes.value = new Map(notes.peek()).set(room, asNotes(answer.data?.notes));
  }
  const stopNotes = effect(() => {
    if (!connected.value) return;
    const all = rooms.value;
    untracked(() => {
      for (const msg of all.values()) {
        const since = msg.notes_since ?? null;
        if (fetched.get(msg.room) !== since && !(since === null && !fetched.has(msg.room))) void load(msg.room, since);
      }
    });
  });

  // You are on a lap: counting or paused, its bell not yet gone. Notes do not show then.
  const onLap = () => {
    const s = engine.timer.peek();
    return s.phase === 'work' && !view(s, engine.now()).over;
  };

  // The open calls you are in, soonest first.
  const calledIn = computed(() =>
    list.value
      .flatMap((room) => (room.call?.you ? [{ room: room.id, name: room.name, call: room.call.id, at: room.call.at, by: room.call.by.name }] : []))
      .sort((a, b) => a.at - b.at),
  );

  // Start together: at a call's minute, a lap with the call's run id, begun at that minute,
  // when the timer is on nothing. Once per device: a lap stopped in its first minute is not
  // started again. A device that was not open in that minute starts nothing, and nor does one
  // offline or not yet told of the room on this connection: the call may have been taken back.
  const due = signal(0);
  let cancelDue = () => {};
  const stopTogether = effect(() => {
    void due.value;
    const live = connected.value ? heard.value : new Set<string>();
    const calls = calledIn.value.filter((call) => live.has(call.room));
    untracked(() => {
      cancelDue();
      cancelDue = () => {};
      const now = engine.now();
      let next = Infinity;
      for (const { call, at } of calls) {
        if (tried.includes(call)) continue;
        if (now < at) next = Math.min(next, at);
        else if (now < at + MIN && env.together) {
          tried = [...tried, call].slice(-TRIED_KEPT);
          engine.keep('together', tried);
          env.together(`call-${call}`, at, env.task?.() ?? null);
        }
      }
      if (Number.isFinite(next)) cancelDue = env.schedule(() => void due.value++, Math.min(next - now, DAY_MS));
    });
  });

  // Using a kept picture moves it to the end of the order. The order is written once per turn,
  // and only when something moved: this runs at every paint.
  function use(hash: string) {
    if (!order.includes(hash) || order.at(-1) === hash) return;
    order = [...order.filter((other) => other !== hash), hash];
    if (ordering) return;
    ordering = true;
    const mine = account.peek();
    queueMicrotask(() => {
      ordering = false;
      if (mine === account.peek()) engine.keep('pictures', order);
    });
  }

  // A picture as a URL made once per app life. One put out of the kept 50 keeps its URL until
  // the account changes: it may still be on screen, and taking it away would fetch it again.
  function pictureNow(hash: string): string | null {
    use(hash);
    let url = urls.get(hash);
    if (!url && order.includes(hash)) {
      const held = engine.kept(`picture.${hash}`) as { type?: unknown; data?: unknown } | undefined;
      if (typeof held?.data !== 'string') return null;
      url = URL.createObjectURL(new Blob([fromBase64(held.data)], { type: typeof held.type === 'string' ? held.type : '' }));
      urls.set(hash, url);
    }
    return url ?? null;
  }

  const setting = (name: string) => computed(() => engine.rows('settings').value.get('current')?.[name] === true);

  // Room requests need a connection and are not kept for later: only a cheer is.
  async function ask(path: string, body: object): Promise<RoomResult> {
    if (!connected.peek()) return { ok: false, error: 'offline' };
    const answer = await engine.request(path, body);
    if (!answer.ok) return answer;
    return typeof answer.data?.room === 'string' ? { ok: true, room: answer.data.room } : { ok: true };
  }

  return {
    list,
    stale: computed(() => !connected.value),
    hidden: setting('rooms_hidden'),
    shareTask: setting('share_task'),

    cheered: computed(() => {
      // Your latest lap is the same lap in every room you are in. Where two rooms disagree for a
      // moment, the later lap is the latest.
      const yours = list.value.flatMap((room) => room.members.filter((member) => member.you && member.last).map((member) => ({ room, last: member.last! })));
      const latest = yours.toSorted((a, b) => b.last.ended - a.last.ended)[0]?.last.run;
      const names = yours.filter(({ last }) => last.run === latest).flatMap(({ room, last }) => last.cheers.map((id) => room.members.find((member) => member.id === id && !member.you)?.name));
      return [...new Set(names.filter((name): name is string => !!name))];
    }),

    create: (name) => ask('/api/rooms/create', { name: name.trim() }),
    join: (code) => ask('/api/rooms/join', { code: code.trim().toUpperCase() }),
    leave: (room) => ask('/api/rooms/leave', { room }),
    update: (room, fields) => ask('/api/rooms/update', { room, ...fields }),

    cheer(room, member) {
      const whom = list.peek().find((r) => r.id === room)?.members.find((m) => m.id === member);
      const last = whom?.last;
      // Nobody cheers their own lap: the server would answer `run`, so it is not asked.
      if (!whom || whom.you || !last || last.cheered) return;
      queue([...waiting.peek(), { room, to: member, run: last.run }]);
    },

    remove: (room, member) => ask('/api/rooms/remove', { room, member }),
    callLap: (room, at) => ask('/api/rooms/call', { room, at }),
    async setIn(room, call, isIn) {
      const answer = await ask('/api/rooms/in', { room, call, in: isIn });
      const held = rooms.peek().get(room);
      // Too late: the call has begun or ended. Shown so now; the server's next message says the same.
      if (!answer.ok && answer.error === 'call' && held && (held.call as { id?: unknown } | null)?.id === call) remember(new Map(rooms.peek()).set(room, { ...held, call: null }));
      return answer;
    },
    addNote: (room, line) => ask('/api/rooms/note', { room, text: line.trim() }),

    markNotesRead(room) {
      const newest = notes.peek().get(room)?.[0]?.at;
      if (newest === undefined || onLap()) return;
      if (newest > (read.peek()[room] ?? -Infinity)) {
        read.value = { ...read.peek(), [room]: newest };
        engine.keep('notesRead', read.peek());
      }
      // The server is told for the account's other devices. Offline, or failed, it is told the
      // next time Notes is shown: the mark here is ahead of the server's until it hears.
      const mark = read.peek()[room]!;
      const held = rooms.peek().get(room);
      if (!held || mark > serverRead(held)) void ask('/api/rooms/read', { room, at: mark });
    },

    calledIn,

    setPicture: (picture) => ask('/api/me/picture', { picture: picture && toBase64(picture) }),

    picture(hash) {
      const now = pictureNow(hash);
      if (now !== null || !HASH.test(hash)) return Promise.resolve(now);
      let url = asking.get(hash);
      if (!url) {
        const mine = account.peek();
        url = (engine.picture?.(hash) ?? Promise.resolve(null))
          .then(async (blob) => {
            if (!blob || mine !== account.peek()) return null;
            const held = { type: blob.type, data: toBase64(new Uint8Array(await blob.arrayBuffer())) };
            if (mine !== account.peek()) return null;
            engine.keep(`picture.${hash}`, held);
            order = [...order.filter((other) => other !== hash), hash];
            // The one used longest ago goes; a hash never changes, so nothing kept needs fetching again.
            for (const gone of order.splice(0, Math.max(0, order.length - PICTURES_KEPT))) engine.keep(`picture.${gone}`, null);
            engine.keep('pictures', order);
            return pictureNow(hash);
          })
          // Bytes that cannot be read are a picture not had now: every caller settles, and it is asked again.
          .catch(() => null);
        asking.set(hash, url);
        // Not had now: asked again next time, not remembered as missing.
        const asked = url;
        void url.then(() => asking.get(hash) === asked && asking.delete(hash));
      }
      return url;
    },

    pictureNow,
    account,

    setHidden: (hidden) => engine.write('settings', 'current', { rooms_hidden: hidden }),
    setShareTask: (share) => engine.write('settings', 'current', { share_task: share }),

    close() {
      stopAccount();
      stopRooms();
      stopBell();
      stopSending();
      stopNotes();
      stopTogether();
      stopHeard();
      cancelBell();
      cancelDue();
    },
  };
}
