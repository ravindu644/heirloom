// Every word a person reads, and the way numbers are said. The voice is DESIGN.md's: a running
// partner who counts for you. Numbers before adjectives, what happened and then what is next,
// behind is a fact with a way back, and one exclamation mark in the whole app, for a set.

const MIN = 60000;
const mins = (ms: number) => Math.round(ms / MIN);
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const two = (n: number) => String(n).padStart(2, '0');

/** The timer's face: "18:42". Rounded up, so it reads 00:00 at the bell and not a second before. */
export function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}

/** A total on a lane: "2h 11m", "45m". */
export function total(ms: number): string {
  const m = mins(ms);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** A length in a sentence: "6 minutes", "1h 5m". */
const length = (ms: number) => (mins(ms) < 60 ? plural(mins(ms), 'minute', 'minutes') : total(ms));

/** The time on the wall: "16:59". */
export function wall(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ordinal = (n: number) => `${n}${n % 100 > 10 && n % 100 < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** The ghost's day as people say it: "yesterday", "Monday", "last Tuesday", "Tuesday the 3rd". Days are `2026-11-24`. */
export function pastDay(day: string, today: string): string {
  const then = new Date(day);
  const ago = Math.round((Date.parse(today) - then.getTime()) / (24 * 60 * MIN));
  const name = WEEKDAYS[then.getUTCDay()]!;
  if (ago === 1) return 'yesterday';
  if (ago < 7) return name;
  return ago === 7 ? `last ${name}` : `${name} the ${ordinal(then.getUTCDate())}`;
}

export const brand = 'heirloom';

export const nav = {
  label: 'Screens',
  focus: 'Focus',
  today: 'Today',
  progress: 'Progress',
  habits: 'Habits',
  room: 'Room',
};

// Screens that later sections build. Each says what will live there and that it does not yet.
export const later = {
  today: 'The tasks for the day, and how many laps each one gets. Not built yet. The timer runs without them.',
  progress: 'Your year of focus, and this week against last week. Not built yet. Every lap you run now is kept for it.',
  habits: 'The things you do every day, with one tap to check in. Not built yet.',
  room: 'The friends you study beside, and who is focusing now. Not built yet.',
};

export const focus = {
  title: 'Focus',

  lap: (n: number) => `Lap ${n} of 4`,
  lapNext: ', next',
  lapFocus: ', focus',
  lapPaused: ', paused',
  lapDone: ', done',
  shortBreak: 'Short break',
  longBreak: 'Long break',
  afterLap: (n: number) => `, after lap ${n} of 4`,
  afterSet: ', after the set',
  breakOver: ', over',
  longBreakAhead: (lap: number) => (lap < 4 ? 'long break after lap 4' : 'long break after this lap'),
  lapAhead: (n: number) => `lap ${n} next`,

  endsIfStarted: (end: number) => `Start now and it ends at ${wall(end)}.`,
  endsAt: (planned: number, end: number) => `of ${clock(planned)}, ends at ${wall(end)}`,
  pausedSince: (planned: number, since: number) => `of ${clock(planned)}, paused since ${wall(since)}`,

  startLap: (n: number) => `Start lap ${n}`,
  startLapNow: (n: number) => `Start lap ${n} now`,
  pause: 'Pause',
  resume: 'Resume',
  // Under a minute nothing is logged, so the button does not promise it.
  stop: (ran: number) => (ran >= MIN ? `Stop and log ${Math.floor(ran / MIN)} min` : 'Stop'),
  extend: (ms: number) => `${mins(ms)} more minutes`,
  setAside: 'Set aside',
  startBreak: (ms: number) => `Start ${mins(ms)} min break`,
  skipBreak: 'Skip break',

  stopped: (ran: number) =>
    ran >= MIN ? `Stopped. ${length(Math.floor(ran / MIN) * MIN)} kept.` : 'Stopped. Under a minute, so nothing was logged.',
  setAsideDone: 'Set aside. It stays in your timeline and counts nowhere.',
  undo: 'Undo',

  // What a screen reader hears, once a minute.
  left: (ms: number) => (ms > MIN ? `${Math.ceil(ms / MIN)} minutes left` : ms > 0 ? 'Under a minute left' : 'Time is up'),
  nextLength: (ms: number) => `${length(ms)}, not started`,
};

export const race = {
  against: (day: string) => `Against ${day}`,
  today: 'Today',
  you: 'You',
  ghost: 'Ghost',
  /** The chip: a sign and a number, or the word. */
  split: (ms: number) => (mins(ms) === 0 ? 'level' : `${ms < 0 ? '−' : '+'}${total(Math.abs(ms))}`),
  at: (now: number) => `at ${wall(now)}.`,

  noGhost: 'No ghost yet. Today sets the pace for next time.',
  level: 'Side by side.',
  // `more` laps after the one running.
  closeInLap: (more: number) =>
    more === 0
      ? 'Finish this lap and you draw level.'
      : more === 1
        ? 'This lap and one more draw you level.'
        : `This lap and ${more} more draw you level.`,
  close: (laps: number) => (laps === 1 ? 'One lap draws you level.' : `${laps} laps draw you level.`),
  ghostFinished: (day: string, ms: number) => `${cap(day)} finished on ${total(ms)}.`,
  pastAll: (day: string) => `That is more than all of ${day}.`,
};

export const result = {
  level: (day: string) => `Level with ${day}.`,
  ahead: (ms: number, day: string) => `${cap(length(ms))} ahead of ${day}.`,
  // Behind names the lap that closes the gap, never the gap as a verdict.
  behind: (laps: number, nextLap: number, day: string) =>
    laps === 1 ? `Lap ${nextLap} draws you level with ${day}.` : `${laps} laps draw you level with ${day}.`,
  noGhost: (ms: number) => `${cap(length(ms))} today.`,
  // The one exclamation mark.
  set: 'Four laps. A full set!',
  laps: (n: number) => (n <= 1 ? 'First lap of the day.' : `${n} laps today.`),
  take: (ms: number) => (mins(ms) === 5 ? 'Take five.' : `Take ${length(ms)}.`),
};

/** People are told where their laps are: "this phone", not "this device". A finger means a phone. */
export const device = (): string => (matchMedia('(pointer: coarse)').matches ? 'phone' : 'laptop');

/** `device` is "phone" or "laptop". */
export const status = {
  // One line on a phone, so it can come and go without moving the buttons above it.
  offline: (unsent: number, device: string) =>
    `No connection. ${unsent === 0 ? 'Your laps are' : plural(unsent, 'change is', 'changes are')} safe on this ${device}.`,
  // The store is refusing writes. The engine keeps trying, and keeps sending while there is a
  // connection; with neither, the laps are only in the open app.
  unsaved: (device: string, offline: boolean) =>
    offline
      ? `No connection, and this ${device} cannot save right now. Keep heirloom open until one comes back.`
      : `This ${device} cannot save right now. Your laps still reach the server.`,
  refused: (device: string) => `The server signed this ${device} out. Your laps are safe on it.`,
  signInAgain: 'Sign in again',
  signOut: 'Sign out',
  signOutUnsent: (unsent: number, device: string) =>
    `Needs a connection. ${plural(unsent, 'change is', 'changes are')} only on this ${device}, so you stay signed in until ${unsent === 1 ? 'it is' : 'they are'} sent.`,
  signOutFailed: 'That did not go through. You are still signed in.',
};

// A second tab of the same browser: it shares the first one's laps and must not run beside it.
// The notification when a phase ends, for a tab out of sight or a phone in a pocket. What
// happened in the title, what is next in the body.
export const ring = {
  lapDone: (n: number) => (n === 4 ? result.set : `Lap ${n} of 4, done.`),
  breakOver: 'Break over.',
  lapNext: (n: number) => `Lap ${n} is next.`,
};

export const elsewhere = 'heirloom is open in another tab of this browser. Close that one and this one takes over by itself.';

export const account = {
  signIn: 'Sign in',
  signInIntro: (device: string) => `Your laps live on your own server. Sign in and this ${device} keeps step with your other devices.`,
  join: 'Join with an invite',
  joinIntro: 'Accounts here are by invite. One code makes one account.',
  invite: 'Invite code',
  username: 'Username',
  usernameHint: '3 to 32 of a to z, 0 to 9 and _',
  password: 'Password',
  passwordHint: '8 characters or more',
  signingIn: 'Signing in',
  joinGo: 'Join',
  joining: 'Joining',
  haveInvite: 'I have an invite',
  haveAccount: 'I have an account',
  notNow: 'Not now',

  error: (code: string, retryAfter?: number) =>
    ({
      credentials: 'That username and password do not match.',
      invite: 'That invite is not known here, or it has been used. A code works once.',
      taken: 'That username is taken. Pick another.',
      slow_down: `Too many tries. This username can sign in again in ${plural(Math.max(1, Math.ceil((retryAfter ?? 60) / 60)), 'minute', 'minutes')}.`,
      bad_request: 'Usernames are 3 to 32 of a to z, 0 to 9 and _. Passwords are 8 characters or more.',
      offline: 'Needs a connection. Nothing was sent.',
      // Storage is refusing writes and edits are unsent: another account now would lose them.
      unsaved: 'Not yet. Your last changes could not be saved here, and signing in now would lose them. Try again in a moment.',
    })[code] ?? 'The server tripped over that. Nothing was stored. Try again.',
};
