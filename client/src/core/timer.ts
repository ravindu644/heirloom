// Timer math: contracts/protocol.md section 6.
// The cell is written only when the user acts. Everything on screen comes from view(state, now),
// so a phone that slept through the bell shows the right thing the moment it wakes.

export type Phase = 'work' | 'short' | 'long';

/** The value of the timer's `state` cell: contracts/schemas/timer.schema.json. */
export interface TimerState {
  phase: 'idle' | Phase;
  run: string | null;
  task: string | null;
  started: number | null;
  paused_at: number | null;
  paused_ms: number;
  planned_ms: number;
  set_index: number;
}

/** What a fresh account has before any timer cell exists. */
export const IDLE: Readonly<TimerState> = Object.freeze({
  phase: 'idle',
  run: null,
  task: null,
  started: null,
  paused_at: null,
  paused_ms: 0,
  planned_ms: 0,
  set_index: 0,
});

export type TimerAction =
  // new_set: this lap is lap one whatever came before. Asked for on the first lap of a new day.
  | { do: 'start'; phase: Phase; run: string; task: string | null; planned_ms: number; new_set?: boolean }
  | { do: 'pause' }
  | { do: 'resume' }
  | { do: 'extend'; ms: number }
  | { do: 'stop' };

/** What a screen shows, worked out and never stored. Names are the protocol's. */
export interface TimerView {
  left_ms: number;
  ends_at: number | null;
  over: boolean;
  paused: boolean;
  /** What a tap on start begins. */
  next: { phase: Phase; set_index: number };
}

// The index of the lap a tap on start begins: the one rule start, stop and next share.
const nextLap = (state: TimerState, over: boolean): number => {
  if (state.phase === 'idle') return state.set_index;
  if (state.phase === 'long') return 0;
  return state.phase === 'short' || over ? (state.set_index + 1) % 4 : state.set_index;
};

/** The state after an action at `now` (server time). An action with nothing to act on returns the state it got. */
export function act(state: TimerState, action: TimerAction, now: number): TimerState {
  const { over, paused } = view(state, now);
  switch (action.do) {
    case 'start':
      return {
        phase: action.phase,
        run: action.run,
        task: action.task,
        started: now,
        paused_at: null,
        paused_ms: 0,
        planned_ms: action.planned_ms,
        set_index: action.phase !== 'work' ? state.set_index : action.new_set ? 0 : nextLap(state, over),
      };
    case 'pause':
      return state.phase === 'idle' || paused || over ? state : { ...state, paused_at: now };
    case 'resume':
      return state.paused_at === null
        ? state
        : { ...state, paused_ms: state.paused_ms + now - state.paused_at, paused_at: null };
    case 'extend': {
      if (state.phase === 'idle') return state;
      const longer = { ...state, planned_ms: state.planned_ms + action.ms };
      // After the bell it must reopen the lap. An end that is still behind now would only add minutes nobody worked.
      return over && view(longer, now).over ? state : longer;
    }
    case 'stop':
      return state.phase === 'idle' ? state : { ...IDLE, set_index: nextLap(state, over) };
  }
}

export function view(state: TimerState, now: number): TimerView {
  if (state.phase === 'idle' || state.started === null) {
    return { left_ms: 0, ends_at: null, over: false, paused: false, next: { phase: 'work', set_index: state.set_index } };
  }
  const paused = state.paused_at !== null;
  const ends_at = paused ? null : state.started + state.paused_ms + state.planned_ms;
  const ran = (state.paused_at ?? now) - state.started - state.paused_ms;
  const next: TimerView['next'] =
    state.phase === 'work'
      ? { phase: state.set_index === 3 ? 'long' : 'short', set_index: state.set_index }
      : { phase: 'work', set_index: nextLap(state, false) };
  return { left_ms: Math.max(0, state.planned_ms - ran), ends_at, over: ends_at !== null && now >= ends_at, paused, next };
}
