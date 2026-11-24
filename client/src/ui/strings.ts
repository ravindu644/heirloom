// Every word a person reads, and the way numbers are said. The voice is DESIGN.md's: a running
// partner who counts for you. Numbers before adjectives, what happened and then what is next,
// behind is a fact with a way back, and one exclamation mark in the whole app, for a set.

const MIN = 60000;
// Whole minutes, never rounded up: a figure must not claim more than was run, and the same
// seconds must read the same on every screen.
const mins = (ms: number) => Math.floor(ms / MIN);
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
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
/** A day to come, as people say it: "tomorrow", "on Thursday", "on Thursday the 3rd". */
function comingDay(day: string, today: string): string {
  const then = new Date(day);
  const ahead = Math.round((then.getTime() - Date.parse(today)) / (24 * 60 * MIN));
  const name = WEEKDAYS[then.getUTCDay()]!;
  if (ahead === 1) return 'tomorrow';
  return ahead < 7 ? `on ${name}` : `on ${name} the ${ordinal(then.getUTCDate())}`;
}

// Days are `2026-11-24`, which a Date reads as UTC midnight: said in UTC, the day never slips.
const dated = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Date(day).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' }).replace(',', '');

export function pastDay(day: string, today: string): string {
  const then = new Date(day);
  const ago = Math.round((Date.parse(today) - then.getTime()) / (24 * 60 * MIN));
  const name = WEEKDAYS[then.getUTCDay()]!;
  if (ago === 1) return 'yesterday';
  if (ago < 7) return name;
  // The two words of "last Tuesday" never part at the end of a line.
  return ago === 7 ? `last\u00a0${name}` : `${name} the ${ordinal(then.getUTCDate())}`;
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

  // The line over the digits when the lap is for a task. The lap in progress is counted.
  onTask: (lap: number, estimate: number | null) => (estimate === null ? `lap ${lap} on this task` : `lap ${lap} of ${estimate} on this task`),
  // Starting must not need planning: the quiet way past the task that is next.
  startFree: 'Start without a task',
  // A lap for no task, said in the two lines a task would have, so nothing moves.
  freeLabel: 'This lap is for',
  freeTitle: 'Nothing in particular',
  upNext: 'Up next',

  // What a screen reader hears, once a minute.
  left: (ms: number) => (ms > MIN ? `${Math.ceil(ms / MIN)} minutes left` : ms > 0 ? 'Under a minute left' : 'Time is up'),
  nextLength: (ms: number) => `${length(ms)}, not started`,
};

export const race = {
  against: (day: string) => `Against ${day}`,
  today: 'Today so far',
  you: 'You',
  ghost: 'Ghost',
  /** The chip: a sign and a number, or the word. */
  split: (ms: number) => (ms === 0 ? 'level' : `${ms < 0 ? '−' : '+'}${total(Math.abs(ms))}`),
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
  // A short title is named; a long one would bury the count.
  task: (title: string, run: number, estimate: number | null) =>
    `${title.length > 28 ? 'This task' : title} is at ${estimate === null ? plural(run, 'lap', 'laps') : `${run} of ${estimate}`}.`,
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
      ? `No connection, and this ${device} cannot save right now. Keep heirloom open until the connection comes back.`
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
  // Beside the countdown in the phone's notification shade, while a phase runs.
  lapRunning: (n: number) => focus.lap(n),
  breakRunning: (long: boolean) => (long ? focus.longBreak : focus.shortBreak),
  // The two kinds of notification, as the phone's settings list them.
  bellChannel: 'Bell',
  countdownChannel: 'Time left',
};

export const elsewhere = 'heirloom is open in another tab of this browser. Close that one and this one takes over by itself.';

export const settings = {
  /** The person in the header, for a screen reader: where a press on them leads. */
  open: (name: string) => `Settings, signed in as ${name}`,
  title: 'Settings',
  back: 'Back',
  account: 'Account',
  where: (device: string, server: string) => `This ${device} keeps step with the server at ${server}.`,
  refused: (device: string, server: string) => `The server at ${server} signed this ${device} out. Your laps are safe on it.`,
};

export const account = {
  signIn: 'Sign in',
  signInIntro: (device: string) => `Your laps live on your own server. Sign in and this ${device} keeps step with your other devices.`,
  join: 'Join with an invite',
  joinIntro: 'Accounts here are by invite. One code makes one account.',
  invite: 'Invite code',
  username: 'Username',
  usernameHint: '3 to 32 characters: a to z, 0 to 9 and _',
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
      // The same code means two things: a username locked after five wrong tries (minutes), or a
      // server with a line of sign-ins ahead of this one (a second or two).
      slow_down:
        (retryAfter ?? 60) < 30
          ? 'The server is busy with other sign-ins. Try again in a few seconds.'
          : `Too many tries. This username can sign in again in ${plural(Math.ceil((retryAfter ?? 60) / 60), 'minute', 'minutes')}.`,
      bad_request: 'Usernames are 3 to 32 characters: a to z, 0 to 9 and _. Passwords are 8 characters or more.',
      offline: 'Needs a connection. Nothing was sent.',
      // Storage is refusing writes and edits are unsent: another account now would lose them.
      unsaved: 'Not yet. Your last changes could not be saved here, and signing in now would lose them. Try again in a moment.',
    })[code] ?? 'The server tripped over that. Nothing was stored. Try again.',
};

const laps = (n: number) => plural(n, 'lap', 'laps');

export const today = {
  title: 'Today',
  /** "Tuesday 24 November". */
  date: (day: string) => dated(day, { weekday: 'long', day: 'numeric', month: 'long' }),

  done: 'Done',
  planned: 'Planned, left',
  laps,

  target: 'Day target',
  targetNone: 'No target for today.',
  targetSet: 'Set a target',
  targetAt: (done: number, target: number) => `${done} of ${laps(target)} today`,
  targetChange: 'Change',
  targetKeep: 'Keep it',
  targetClear: 'No target',
  targetText: (n: number) => laps(n),
  targetLess: 'One lap less',
  targetMore: 'One lap more',

  add: 'Add a task',
  addHint: 'Add a task. End with ~3 for three laps.',

  // The bar of the lap in progress.
  free: 'A lap for nothing in particular',
  lapDone: (n: number) => `Lap ${n} of 4, done`,
  toFocus: 'Open Focus',

  next: 'Next',
  start: 'Start',
  later: 'Later today',
  laterCount: (tasks: number, left: number) => `${plural(tasks, 'task', 'tasks')}, ${laps(left)}`,
  order: 'Change the order',
  ordering: 'Today, in order',
  orderKeep: 'Keep this order',
  up: 'Up',
  down: 'Down',
  upLabel: (title: string) => `Move up: ${title}`,
  downLabel: (title: string) => `Move down: ${title}`,
  upcoming: 'Upcoming',
  doneToday: 'Done',

  empty: 'Nothing planned for today yet. Add the first thing to work on, and guess its laps.',
  allDone: 'Everything planned for today is done.',

  of: (estimate: number | null) => (estimate === null ? '' : ` of ${estimate}`),
  check: (title: string) => `Done: ${title}`,
  /** A date beside a task: "yesterday", "tomorrow", "Mon 23 Nov". A past one is the plain date and no more. */
  due: (day: string, today: string) => {
    const days = Math.round((Date.parse(day) - Date.parse(today)) / (24 * 60 * MIN));
    return days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : dated(day, { weekday: 'short', day: 'numeric', month: 'short' });
  },

  // What the last tap did, in three parts so a long title can be cut short and the rest still read:
  // "Done: {title}. It comes back tomorrow."
  saidDone: 'Done:',
  saidAdded: 'Added:',
  saidRemoved: 'Deleted:',
  comesBack: (day: string, today: string) => `It comes back ${comingDay(day, today)}.`,
  keeps: 'It keeps for 30 days.',
  addedLaps: (estimate: number) => `${laps(estimate)}.`,
  undo: 'Undo',
  /** The strip's short name for the ghost's day: "Last Tue", "Yesterday", "Mon", "Tue 3 Nov". */
  ghostDay: (day: string, today: string) => {
    const ago = Math.round((Date.parse(today) - Date.parse(day)) / (24 * 60 * MIN));
    const name = dated(day, { weekday: 'short' });
    return ago === 1 ? 'Yesterday' : ago < 7 ? name : ago === 7 ? `Last\u00a0${name}` : dated(day, { weekday: 'short', day: 'numeric', month: 'short' });
  },
  /** On a deleted task: the day it goes for good. `at` is when it was deleted. */
  gone: (at: number) => `gone on ${new Date(at + 30 * 24 * 60 * MIN).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,

  bin: (n: number) => `Recently deleted, ${n}`,
  binTitle: 'Recently deleted',
  binNote: 'A deleted task keeps for 30 days, then it is gone for good.',
  restore: 'Restore',
};

export const task = {
  sheet: 'Task',
  close: 'Close',
  title: 'Title',
  count: (run: number, estimate: number | null) => (estimate === null ? `${laps(run)} run` : `${run} of ${laps(estimate)} run`),

  project: 'Project',
  noProject: 'None',
  newProject: 'New project',
  projectName: 'Its name',
  projectSquare: 'Its square',
  addProject: 'Add project',
  // The five squares, named for a screen reader.
  colors: { you: 'Tomato', rest: 'Green', ink: 'Ink', ghost: 'Grey', 'heat-2': 'Rose' },

  estimate: 'Estimate',
  estimateText: (n: number) => (n === 0 ? 'None' : laps(n)),
  less: 'One lap less',
  more: 'One lap more',
  // PRODUCT: a gentle nudge over 7. A fact, a reason, and one thing to do about it.
  nudge: (n: number) => `${n} laps is a lot to hold in one task. Break it down and each piece is easier to start.`,
  nudgeGo: 'Add a subtask',

  due: 'Due',
  repeat: 'Repeats',
  once: 'No',
  everyDay: 'Every day',
  someDays: 'On chosen days',
  // Monday first, as the rule counts them.
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  when: 'When in the day',
  whenHint: 'after dinner',

  subtasks: 'Subtasks',
  // The field has its own name, so a screen reader hears "New subtask" when the nudge sends the cursor there.
  subtaskNew: 'New subtask',
  subtaskAdd: 'Add',
  subtaskHint: 'A smaller piece of it',
  subtaskTitle: 'Subtask',
  subtaskCheck: (title: string) => `Done: ${title}`,
  remove: 'Remove',
  subtaskRemoved: (title: string) => `Removed: ${title}.`,

  done: 'Mark done',
  notDone: 'Not done after all',
  delete: 'Delete',
};
