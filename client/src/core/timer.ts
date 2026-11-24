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
  | { do: 'start'; phase: Phase; run: string; task: string | null; planned_ms: number }
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

/** The state after an action at `now` (server time). An action with nothing to act on returns the state it got. */
export function act(state: TimerState, action: TimerAction, now: number): TimerState {
  throw new Error('not built yet: act, roadmap section 1');
}

export function view(state: TimerState, now: number): TimerView {
  throw new Error('not built yet: view, roadmap section 1');
}
