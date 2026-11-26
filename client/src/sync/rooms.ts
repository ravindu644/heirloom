// What the Room screen is given. The lead wrote this interface so the ui lane and the core lane
// could build to it at the same time; the core lane fills in createRooms.
// Rules: contracts/protocol.md section 15. Rooms are not cells: the server owns them, and every
// change to one needs a connection.

import { batch, computed, effect, signal, untracked } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
import { mondayOf } from '../core/progress.ts';
import { view } from '../core/timer.ts';
import { createCounts } from './counts.ts';
import type { Engine, RoomMessage } from './engine.ts';

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
  /** Your own lane's also holds your lap in progress as far as it has run, as Today does. A friend's holds their rows only. */
  today_ms: number;
  today_laps: number;
  week_ms: number;
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
  /** When true the members are listed by their week, most first; otherwise in the order they joined. */
  ranked: boolean;
  /**
   * The name of the member who keeps the room: only they may change its name, target and
   * ranking. Null from an older server, which names no keeper: then anyone may, as before.
   */
  keeper: string | null;
  /** You may change the room's name, target and ranking: you keep it, or the server names no keeper. */
  youKeep: boolean;
  members: MemberView[];
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
  setHidden(hidden: boolean): void;
  setShareTask(share: boolean): void;
}

export interface RoomsEnv {
  /** The device's offset from UTC in minutes, east positive: 330 in Sri Lanka. The system's own when left out. */
  utcOffsetMin?(): number;
  /** Runs `run` once after `ms`. Returns a function that cancels it. */
  schedule(run: () => void, ms: number): () => void;
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
  // getTimezoneOffset counts minutes west of UTC; the contract counts east.
  const counts = createCounts(engine, env.utcOffsetMin ?? (() => -new Date().getTimezoneOffset()));
  const connected = computed(() => engine.sync.value === 'syncing' || engine.sync.value === 'in-step');

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
      batch(() => {
        rooms.value = new Map((Array.isArray(held) ? (held as RoomNow[]) : []).filter((msg) => typeof msg?.room === 'string').map((msg) => [msg.room, msg]));
        waiting.value = Array.isArray(cheers) ? (cheers as Cheer[]).filter((c) => [c?.room, c?.to, c?.run].every((part) => typeof part === 'string')) : [];
        accepted.value = new Set();
      });
    });
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
    remember(new Map(rooms.peek()).set(msg.room, msg));
  });

  // A member's bell goes at `ends_at` whether or not the server says so in time. The list is
  // worked out again at the next one due.
  const bell = signal(0);
  let cancelBell = () => {};

  // Your lap in progress as far as it has run, for your own lane: the server's totals are of rows,
  // and it has none yet. Counted on the day and in the week it began, as Progress counts it.
  function yours(now: number): { today: number; week: number } {
    const lap = counts.open(now);
    if (!lap) return { today: 0, week: 0 };
    const [began, today] = [counts.today(lap.started), counts.today(now)];
    const ran = counts.unwritten(now);
    return { today: began === today ? ran : 0, week: mondayOf(began) === mondayOf(today) ? ran : 0 };
  }

  // A friend's lap in progress: how far the server said it had run at `server_time`, and on since
  // then while it is not paused, up to its bell. Nothing when the message has no `run` (an older server).
  function running(member: Record<string, unknown>, said: unknown, ends: number | null, now: number): { today: number; week: number; moving: boolean } {
    const run = member.run as { ms?: unknown; today?: unknown; week?: unknown } | null | undefined;
    if (member.away === true || !run || typeof run !== 'object' || typeof run.ms !== 'number' || run.ms < 0) return { today: 0, week: 0, moving: false };
    const moving = member.paused !== true && typeof said === 'number';
    const ran = run.ms + (moving ? Math.max(0, Math.min(now, ends ?? now) - (said as number)) : 0);
    return { today: run.today === true ? ran : 0, week: run.week === true ? ran : 0, moving: moving && (ends === null || ends > now) };
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
          away,
          phase,
          lap: (typeof member.set_index === 'number' ? member.set_index : 0) + 1,
          ends_at: phase === 'idle' ? null : ends,
          paused: phase !== 'idle' && member.paused === true,
          task: phase === 'work' && typeof member.task === 'string' ? member.task : null,
          today_ms,
          today_laps: amount(member.today_laps),
          week_ms,
          last: run ? { run, ended: amount(last?.ended), cheers, cheered: cheers.includes(you), cheerers: cheers.flatMap((cheerer) => (names.has(cheerer) ? [{ id: cheerer, name: names.get(cheerer)! }] : [])) } : null,
        };
      });
      const ranked = msg.ranked === true;
      const keeper = typeof msg.keeper === 'string' ? msg.keeper : null;
      return {
        id: msg.room,
        name: text(msg.name),
        code: text(msg.code),
        target_ms: amount(msg.target_ms),
        week_ms: members.reduce((sum, member) => sum + member.week_ms, 0),
        ranked,
        keeper: keeper === null ? null : (names.get(keeper) ?? null),
        youKeep: keeper === null || (you !== '' && keeper === you),
        // The sort is stable: members level on the week stay in the order they joined.
        members: ranked ? members.toSorted((a, b) => b.week_ms - a.week_ms) : members,
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

    setHidden: (hidden) => engine.write('settings', 'current', { rooms_hidden: hidden }),
    setShareTask: (share) => engine.write('settings', 'current', { share_task: share }),

    close() {
      stopAccount();
      stopRooms();
      stopBell();
      stopSending();
      cancelBell();
    },
  };
}
