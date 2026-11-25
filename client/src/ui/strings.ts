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
  // A whole number of hours is said as a person says it: "5h", not "5h 0m".
  return m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`;
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

/** The ghost's day as people say it: "yesterday", "Monday", "last Tuesday", "Tuesday the 3rd". Days are `2026-11-24`. */
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
  // One Stop, and it says only that: the line after says what it did.
  stop: 'Stop',
  extend: (ms: number) => `${mins(ms)} more minutes`,
  startBreak: (ms: number) => `Start ${mins(ms)} min break`,
  // One way out for someone finished for the day, after a bell and in a break: both buttons there start something.
  doneForNow: 'Done for now',
  // What it did: the timer is at rest after that lap. `lap` is 1 to 4.
  stoppedAfter: (lap: number) => `Stopped after lap ${lap}. ${lap >= 4 ? 'A new set starts with lap 1.' : `Lap ${lap + 1} is next.`}`,

  // What Stop did: which lap ended and how far it ran, then what comes next. `lap` is 1 to 4.
  stopped: (lap: number, ran: number) =>
    `Lap ${lap} stopped ${ran >= MIN ? `at ${Math.floor(ran / MIN)} min` : 'in its first minute'}. ${lap >= 4 ? 'A new set starts with lap 1.' : `Lap ${lap + 1} is next.`}`,
  undo: 'Undo',

  // The line over the digits when the lap is for a task. The lap in progress is counted.
  onTask: (lap: number, estimate: number | null) => (estimate === null ? `lap ${lap} on this task` : `lap ${lap} on this task, ${estimate} estimated`),
  // At the end of an Up next row: how far the task is.
  upNextLaps: (laps: number, estimate: number | null) => (estimate === null ? plural(laps, 'lap', 'laps') : `${laps} of ${plural(estimate, 'lap', 'laps')}`),
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
  /** The chip: a sign and a number, or the word. */
  split: (ms: number) => (ms === 0 ? 'level' : `${ms < 0 ? '−' : '+'}${total(Math.abs(ms))}`),
  at: (now: number) => `at ${wall(now)}.`,

  noGhost: 'Nothing to race yet. Today becomes the day to beat.',
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
  cheered: (who: string[]) => `${names(who)} cheered.`,
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
  // Habits and tasks with a time share it.
  remindChannel: 'Reminders',
  // A habit's reminder: its own title, and one plain line. It reminds; it does not ask why not yet.
  remindBody: 'Planned for today.',
  // A task's reminder, at its minute: its title, and when it was planned for.
  taskBody: (time: string) => `Planned for ${time}.`,
};

// A second tab of the same browser: it shares the first one's laps and must not run beside it.
// B14: where a reminder comes from in a browser, said under a task's time and a habit's reminder alike.
export const remindsWhere = 'The phone app reminds you at that minute. A browser does only while heirloom is open in a tab.';

// B2: every edit in a sheet is kept as it is made.
export const savedAsYouGo = 'Changes are saved as you make them.';

// What heirloom is, for someone who has never seen it: the phone app's first screen, and beside
// the sign-in form in a browser. Sentences, in the order a day meets them.
export const welcome = {
  title: 'Work in laps. Race the you of last week.',
  lines: [
    'A lap is one stretch of focus, 25 minutes unless you change it, and then a break. Four make a set.',
    'Plan the day in laps and tick them off. At the end you see how close your estimates were.',
    'Habits get a box to tick, and two rest days a week that break nothing.',
    'In a room, friends see who is on a lap right now and cheer each other on.',
  ],
  where: 'It is free. Everything you do is kept on a server that you or a friend runs, and nowhere else.',
  go: 'Connect to a server',
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

  lengths: 'Laps and breaks',
  lap: 'A lap',
  short: 'A short break',
  long: 'The long break, after four laps',
  minutes: (n: number) => (n === 1 ? 'minute' : 'minutes'),
  // Three lengths on one screen: each button says whose minute it is.
  less: (what: string) => `${what}, one minute less`,
  more: (what: string) => `${what}, one minute more`,

  auto: 'Starting by itself',
  autoBreak: 'Start the break when a lap reaches its bell',
  autoWork: 'Start the next lap when a break reaches its bell',
  autoNote:
    'Off, every start is yours to tap. On, laps and breaks follow each other until the long break, and a phone that slept through a bell catches up when it wakes: up to two hours of laps count, watched or not.',

  target: 'Day target',
  targetText: (laps: number) => (laps === 0 ? 'No target' : plural(laps, 'lap a day', 'laps a day')),
  targetLess: 'One lap less',
  targetMore: 'One lap more',

  bell: 'The bell',
  ringHere: (device: string) => `Ring on this ${device}`,
  ringHereNote: 'A sound and a notification when a lap or a break ends.',
  // The device will not let heirloom notify: the switch is on and nothing would ring, so it says why.
  ringBlocked: 'Notifications for heirloom are switched off on this device, so the bell cannot ring. Allow them in the device\u2019s settings.',
  // Under the three lengths.
  lengthsNote: 'A lap or a break already running keeps its length.',
  // Under the day target: the same number Today edits.
  targetNote: 'Today shows a bar of this many laps. It can be changed there too.',
  finish: 'A finished lap',
  celebrate: 'Mark a finished lap',
  celebrateNote: 'A short motion when a lap reaches its bell, and one line at the laps worth it: the first, the 25th, a best week. Off, a finished lap is its numbers and nothing more.',

  rooms: 'Rooms',
  shareTask: 'Show the room what I am on',
  shareTaskNote: 'The title of the task a lap is for, while the lap runs. Off, friends see whether you are on a lap or a break, and the time left.',
  hideRooms: 'Hide rooms',
  hideRoomsNote: 'Room leaves the screens on your devices and friends see you as away. Your laps still count toward a room\u2019s week.',

  copy: 'Your copy',
  copyNote: 'Everything this account holds, as one file that is yours to keep.',
  export: 'Save a copy',
  file: (day: string) => `heirloom-${day}.json`,
  exported: (name: string) => `Saved as ${name}.`,
  exportElsewhere: (server: string) => `To save a copy, open heirloom in a browser at ${server}. It is the same account.`,
  import: 'Bring a copy back',
  importNote: 'A copy merges with what is here: the newer edit wins, so bringing one back twice loses nothing.',
  imported: (cells: number) => (cells === 0 ? 'Everything in that copy was here already.' : `${plural(cells, 'change', 'changes')} brought in.`),
  importErrors: {
    not_json: 'That file could not be read as a copy.',
    not_heirloom: 'That file was not saved by heirloom.',
    empty: 'That copy is empty. Nothing was changed.',
  },
};

export const account = {
  signIn: 'Sign in',
  // This server, not their own: a friend's server is not theirs.
  signInIntro: (device: string) => `Your laps live on this server. Sign in and this ${device} keeps step with your other devices.`,
  join: 'Join with an invite',
  joinIntro: 'Accounts here are by invite. One link makes one account.',
  // Arrived by an invite link: the invite is already in hand, and is not a field to type.
  joinLinked: (server: string) => `This link is your invite to ${server}. Choose a username and a password.`,
  linkRefused: 'That invite is no longer good: it was used, taken back or ran out. Ask for a new link, or sign in if you have an account here.',
  invite: 'Invite',
  inviteHint: 'The last part of the link you were sent. The whole link works too.',
  noInvite: 'There is no invite in that. Paste the whole link, or its last part.',
  // A server with no account yet: the first one needs no invite and runs it.
  setup: 'Set up this server',
  setupIntro: 'There is no account here yet. The first one runs this server: it can invite people, and decides who else can.',
  // Two people on a fresh server's setup page at once: the second one is told what happened.
  setupTaken: 'Someone set this server up a moment ago. Sign in if that was you, or ask them for an invite.',
  setupGo: 'Set up',
  settingUp: 'Setting up',
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
      invite: 'That invite is not known here, or it was used, taken back or ran out. A link works once.',
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

  done: 'Focused',
  planned: 'Still planned',
  // The small line under "Still planned", when some open tasks have no estimate to count.
  plannedWith: (left: number, loose: number) => `${laps(left)}, ${plural(loose, 'task', 'tasks')} with no estimate`,
  laps,

  target: 'Day target',
  targetNone: 'No day target.',
  targetSet: 'Set a day target',
  targetAt: (done: number, target: number) => `${done} of ${laps(target)} today`,
  targetChange: 'Change',
  // Over the stepper, so it is plain what the number is.
  targetLabel: 'Laps to run each day',
  // Every tap of the stepper is already kept: this only closes the editor.
  targetKeep: 'Done',
  targetClear: 'Remove the day target',
  targetText: (n: number) => laps(n),
  targetLess: 'One lap less',
  targetMore: 'One lap more',

  add: 'Add a task',
  // The button in the field, from the first character typed. The subtask field says the same.
  addGo: 'Add',
  addHint: 'Add a task. End with ~3 for three laps.',

  // The bar of the lap in progress.
  free: 'A lap for nothing in particular',
  lapDone: (n: number) => `Lap ${n} of 4, done`,
  toFocus: 'Open Focus',

  next: 'Next',
  start: 'Start',
  later: 'Later today',
  laterCount: (tasks: number, left: number) => `${plural(tasks, 'task', 'tasks')}, ${laps(left)}`,
  // Said where the list ends, until this device has moved a row once.
  holdHint: 'Press and hold a task to move it.',
  // For a screen reader, after Alt and an arrow key moved the row that has the focus.
  nowAt: (title: string, at: number, of: number) => `${title}: now ${at} of ${of}.`,
  upcoming: 'Upcoming',
  doneToday: 'Done',

  empty: 'Nothing planned for today yet. Add the first thing to work on, and estimate its laps.',
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
  binNote: 'A deleted task keeps for 30 days, then it is gone for good. Delete for good removes it now.',
  // It cannot be taken back, so it asks twice: the button's own words become the question.
  purge: 'Delete for good',
  purgeAsk: 'Delete for good?',
  // A1: the task ticked while its lap ran. Said after "Done: <title>."
  lapStopped: (lap: number, ran: number) => `Lap ${lap} stopped ${ran >= MIN ? `at ${Math.floor(ran / MIN)} min` : 'in its first minute'}.`,
  // B13: on a row's small line.
  subtasks: (done: number, of: number) => `${done} of ${plural(of, 'subtask', 'subtasks')}`,
  // A3: a project deleted from the sheet.
  saidProjectGone: 'Deleted project',
  projectKeeps: 'Its tasks stay, with no project.',
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
  colors: { you: 'Tomato', rest: 'Green', ink: 'Ink', ghost: 'Grey', 'heat-2': 'Rose', amber: 'Amber', olive: 'Olive', teal: 'Teal', sky: 'Blue', indigo: 'Indigo', plum: 'Plum', clay: 'Brown' },
  // A project can be changed where it is chosen: the same form, filled in. Each change is kept as it is made.
  editProject: 'Edit project',
  editDone: 'Done',
  deleteProject: 'Delete project',
  // The thirteenth square, always last: it opens the app's own picker under the squares and carries what is picked.
  pick: 'Pick',
  hue: 'Colour',
  depth: 'Pale to deep',

  estimate: 'Estimate',
  estimateText: (n: number) => (n === 0 ? 'None' : laps(n)),
  less: 'One lap less',
  more: 'One lap more',
  // PRODUCT: a gentle nudge over 7. A fact, a reason, and one thing to do about it.
  nudge: (n: number) => `${n} laps is a lot to hold in one task. Break it down and each piece is easier to start.`,
  nudgeGo: 'Add a subtask',

  due: 'Due',
  // A clock time on the due day. Picking one with no day fills in today.
  time: 'At',
  noTime: 'No time',
  // Said under the field: where the reminder comes from, so nobody waits for one from a browser.
  timeNote: (app: boolean) => (app ? 'This phone reminds you at that minute, if the task is still open.' : remindsWhere),
  repeat: 'Repeats',
  once: 'No',
  everyDay: 'Every day',
  someDays: 'On chosen days',
  // Monday first, as the rule counts them.
  weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],

  subtasks: 'Subtasks',
  // The field has its own name, so a screen reader hears "New subtask" when the nudge sends the cursor there.
  subtaskNew: 'New subtask',
  subtaskHint: 'A smaller piece of it',
  subtaskTitle: 'Subtask',
  subtaskCheck: (title: string) => `Done: ${title}`,
  remove: 'Remove',
  subtaskRemoved: (title: string) => `Removed: ${title}.`,

  done: 'Mark done',
  notDone: 'Not done after all',
  delete: 'Delete',
};

const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Monday first, as a week runs.
const weekdayName = (day: string) => WEEKDAYS[new Date(day).getUTCDay()]!;
const shortDate = (day: string) => dated(day, { weekday: 'short', day: 'numeric', month: 'short' });
const lapsWord = (n: number) => (n === 1 ? 'One lap' : `${n} laps`);

export const progress = {
  weekOf: (monday: string) => `Progress, week of ${dated(monday, { day: 'numeric', month: 'long' })}`,

  // The finding the screen opens with. Behind is a fact with a way back, never a verdict.
  firstWeek: (ms: number) => (ms < MIN ? 'Your first week starts with the next lap.' : `Your first week. ${cap(length(ms))} so far.`),
  level: 'Level with last week.',
  ahead: (ms: number) => `${cap(length(ms))} ahead of last week.`,
  behind: (laps: number) => `${lapsWord(laps)} behind last week.`,
  closeNow: 'The lap you are in now draws you level.',
  closeWith: (more: number) => `This lap and ${more === 1 ? 'one more' : `${more} more`} draw you level.`,
  ghostEnded: (ms: number) => `Last week ended on ${total(ms)}.`,
  pastAll: 'That is more than all of last week.',

  week: 'This week against last week',
  weekAlone: 'This week',
  weekdays: WEEKDAYS_SHORT,
  hours: (h: number) => `${h}h`,
  byNow: (ms: number, day: string) => `Last week had ${total(ms)} by this time on ${weekdayName(day)}.`,
  noLastWeek: 'Last week has nothing to race. This week becomes the one to beat.',
  chart: (you: number, ghostNow: number, ghostTotal: number) =>
    ghostTotal > 0 ? `This week ${total(you)} so far. Last week ${total(ghostNow)} by now, ${total(ghostTotal)} in all.` : `This week ${total(you)} so far.`,
  total,

  streak: 'Streak',
  inARow: (n: number) => (n === 1 ? 'day in a row' : 'days in a row'),
  ofLast: (of: number) => `of the last ${of} days`,
  streakStart: 'A day counts with one lap run to its bell. The first two days you miss in a week are rest days: they do not break it.',
  todayOpen: 'No lap has reached its bell today yet.',
  restDay: (day: string) => `${weekdayName(day)} the ${ordinal(new Date(day).getUTCDate())} was a rest day. Two a week keep the streak going.`,
  restKeeps: 'Two rest days a week keep it going.',
  dots: (kept: number, rest: number) => `The last 14 days: ${kept} with a lap${rest ? `, ${plural(rest, 'rest day', 'rest days')}` : ''}.`,

  bests: 'Your bests',
  longestDay: 'Longest day',
  bestWeek: 'Best week',
  on: shortDate,
  from: (monday: string) => `from ${shortDate(monday)}`,

  since: 'Since your first lap',
  ofFocus: (n: number) => `of focus, ${plural(n, 'lap', 'laps')}`,
  keptOf: (kept: number, of: number) => `${kept} of ${of}`,
  daysKept: 'days with at least one lap',
  steadiest: (weekday: number) => `${WEEKDAYS[(weekday + 1) % 7]}s`,
  steadiestNote: (kept: number, of: number) => `${kept} of ${of} with a lap, your steadiest day`,
  year: 'The days since your first lap. Arrow keys choose a day.',
  rowNames: WEEKDAYS_SHORT,
  month: (month: number) => MONTHS_SHORT[month]!,
  cell: (day: string, ms: number, n: number, rest: boolean) =>
    `${dated(day, { weekday: 'long', day: 'numeric', month: 'long' })}: ${n > 0 || ms >= MIN ? `${total(ms)}, ${plural(n, 'lap', 'laps')}` : rest ? 'a rest day' : 'nothing ran'}`,
  key: ['none', '1 to 3 laps', '4 to 6', '7 or 8', '9 or more'],
  keyRest: 'rest day',
  firstSquare: 'One square so far. Every day with a lap adds the next.',
  noYear: 'The year starts with your first lap: one square a day, darker the more laps it held.',

  projects: 'Last 7 days by project',
  noProject: 'No project',
  shareLine: (n: number, now: number, before: number, all: number) => {
    const diff = mins(now) - mins(before);
    const change = before < MIN ? 'none the week before' : diff === 0 ? 'same as the week before' : `${diff > 0 ? 'up' : 'down'} ${total(Math.abs(diff) * MIN)} on the week before`;
    return `${plural(n, 'lap', 'laps')}, ${change}, ${total(all)} in all`;
  },
  before: 'the 7 days before',
  noProjects: 'No lap in these 7 days was on a task with a project. Give a task a project on Today and its time shows here.',

  estimates: 'Estimates',
  ratio: (ratio: number) => `A task takes about ${ratio.toFixed(1)} laps for each one you estimate.`,
  ratioFigure: (ratio: number) => ratio.toFixed(1),
  guessed: '1.0',
  thisWeek: 'this week',
  guesses: (weeks: { ratio: number | null }[]) => `The last ${weeks.length} weeks, oldest first: ${weeks.map((week) => (week.ratio === null ? 'nothing to go by' : week.ratio.toFixed(1))).join(', ')}.`,
  noEstimates: 'No estimate to check yet. Give a task an estimate, finish it, and this says how close it was.',

  dayTitle: (day: string, today: string) => (day === today ? 'Today, hour by hour' : `${dated(day, { weekday: 'long', day: 'numeric', month: 'long' })}, hour by hour`),
  toToday: 'Back to today',
  lap: 'Lap',
  stopped: 'Stopped lap',
  aside: 'Lap, not counted',
  shortBreak: 'Short break',
  longBreak: 'Long break',
  span: (start: number, end: number) => `${wall(start)} to ${wall(end)}`,
  ran: (ms: number) => (ms < MIN ? 'under a minute' : length(ms)),
  twoDevices: 'ran on two devices',
  setAside: "Don't count it",
  countAgain: 'Count it again',
  ranAside: (ms: number) => `${ms < MIN ? 'under a minute' : length(ms)}, not counted`,
  forLap: (words: string, start: number) => `${words}, the lap at ${wall(start)}`,
  // On the bar, with Undo: "Not counted. It adds nothing to your day, week or streak."
  asideSaid: 'Not counted',
  asideAdds: 'It adds nothing to your day, week or streak.',
  dayEmpty: (isToday: boolean) => (isToday ? 'Nothing has run today yet. The first lap starts on Focus.' : 'Nothing ran on this day.'),

  lookBack: 'Looking back on today',
  lookTotals: (ms: number, n: number) => (n === 0 && ms < MIN ? 'No lap has rung today yet.' : `${cap(length(ms))} of focus in ${plural(n, 'lap', 'laps')}.`),
  lookDone: 'Done today',
  note: 'A line or two about today',
  noteThen: 'The line you wrote that day',
  noteHint: 'what went well, or what got in the way',
  noteLeft: (n: number) => plural(n, 'character left', 'characters left'),
};

const COUNT_WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);
/** "Sachi", "Sachi and Dilan", "Sachi, Dilan and Amaya". */
const names = (list: string[]) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);

export const habits = {
  label: (day: string) => `Habits, ${dated(day, { weekday: 'long', day: 'numeric', month: 'long' })}`,
  // The finding. What is left is a number, never a reproach, and yesterday is not spoken of.
  finding: (done: number, planned: number, any: boolean) =>
    !any ? 'No habits yet.' : planned === 0 ? 'Nothing planned for today.' : `${done} of ${planned} today. ${countWord(planned - done)} left.`,
  add: 'Add a habit',
  addHint: 'Add a habit. It starts as once a day, every day.',
  empty: 'Add the first thing you want to do most days. One tap a day checks it in.',
  list: 'Habits',
  plan: (days: number) => (days === 127 ? 'Every day' : days === 31 ? 'Weekdays' : days === 96 ? 'Weekends' : WEEKDAYS_SHORT.filter((_, bit) => days & (1 << bit)).join(', ')),
  running: (n: number) => (n === 1 ? '1 day running' : `${n} days running`),
  keptOf: (kept: number, of: number) => `${kept} of the last ${of} planned days`,
  check: (title: string) => `Check in: ${title}`,
  of: (target: number) => ` of ${target}`,
  days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  weekLabel: (done: number, planned: number) => `This week: ${done} of ${planned} planned days done.`,
  saidIn: 'Checked in:',
  saidCount: (count: number, target: number) => `${count} of ${target}.`,
  saidArchived: 'Archived:',
  holdHint: 'Press and hold a habit to move it.',
  archived: (n: number) => `Archived, ${n}`,
  archivedTitle: 'Archived habits',
  archivedNote: 'An archived habit keeps its record and asks for nothing.',
  binNote: 'A deleted habit keeps for 30 days, then it is gone for good. Delete for good removes it now.',

  week: 'This week against last',
  thisWeek: 'This week',
  lastWeek: 'Last week',
  weekLine: (now: number, before: number, day: string) =>
    now === 0 && before === 0
      ? 'No check-ins yet this week.'
      : before === 0
        ? `${plural(now, 'check-in', 'check-ins')} this week. Last week had none by now.`
        : now < before
          ? `Last week had ${before} by this time on ${weekdayName(day)}. ${countWord(before - now)} more ${before - now === 1 ? 'draws' : 'draw'} you level.`
          : now === before
            ? 'Level with last week at this time.'
            : `${countWord(now - before)} ahead of last week at this time.`,

  sheet: 'Habit',
  title: 'Its name',
  daysOf: 'Days',
  weekdays: WEEKDAYS_SHORT,
  perDay: 'How often in a day',
  times: (n: number) => (n === 1 ? 'Once a day' : `${n} times a day`),
  less: 'One time less',
  more: 'One time more',
  remind: 'Reminder',
  remindNote: 'On the days it is planned, until it is checked in.',
  // B12: a habit done more than once a day, beside how often.
  countToday: (count: number, target: number) => `${count} of ${target} today.`,
  takeBack: 'Take one back',
  // B22: the last day of a habit, tapped.
  lastDay: 'A habit keeps at least one day.',
  // B2: under the sheet's foot buttons.
  footNote: 'Archive keeps its record and takes it off the list. Delete keeps it for 30 days.',
  noRemind: 'No reminder',
  record: 'Since the first check-in',
  recordLabel: (title: string, done: number, of: number) => `${title}: ${done} of ${of} days done since the first check-in.`,
  recordNote: 'A filled square is a day done. A ring is a rest day.',
  noRecord: 'The first check-in starts its record.',
  archive: 'Archive',
};

export const room = {
  label: (name: string) => `Room: ${name}`,
  noRoom: 'You are not in a room yet.',
  about: 'A room is a few friends who see each other focusing: whether they are on a lap or a break, and the time left. Task titles stay hidden unless you share yours in Settings.',
  make: 'Make a room',
  name: 'Its name',
  makeGo: 'Make the room',
  join: 'Join a room',
  code: 'The code a friend gave you',
  joinGo: 'Join',
  errors: {
    offline: 'Needs a connection. Nothing was sent.',
    code: 'No room has that code.',
    full: 'That room has its 8 people, the most there can be.',
    slow_down: 'Too many wrong codes. Joining opens again within the hour.',
    room: 'That room is no longer there.',
    bad_request: 'A room needs a name of 1 to 40 characters.',
  } as Record<string, string>,
  failed: 'That did not go through. Nothing was changed.',
  needsConnection: 'Making or joining a room needs a connection.',

  finding: (members: number, focusing: number) =>
    members === 1 ? 'Only you here so far. The code brings a friend in.' : focusing === 0 ? 'Nobody is on a lap right now.' : `${focusing} of ${members} focusing now.`,
  findingStale: (members: number, focusing: number) =>
    members === 1 ? 'Only you here.' : focusing === 0 ? 'Nobody was on a lap when the room was last heard from.' : `${focusing} of ${members} were focusing when the room was last heard from.`,
  week: 'Together this week',
  weekAt: (ms: number, target: number) => (target > 0 ? `${total(ms)} of ${total(target)} together this week.` : `${total(ms)} together this week.`),
  share: (name: string, ms: number) => `${name} ${total(ms)}`,
  you: 'You',
  members: 'Who is focusing now',
  focusing: (lap: number) => `Focusing, lap ${lap} of 4`,
  paused: (lap: number) => `Paused, lap ${lap} of 4`,
  shortBreak: 'Short break',
  longBreak: 'Long break',
  breakPaused: 'Break paused',
  idle: 'Not on a lap',
  away: 'Away',
  left: (ms: number) => `${clock(ms)} left`,
  notSharing: 'Not sharing what they are on.',
  yoursHidden: 'Your task is not shown to the room.',
  totals: (today: number, laps: number, week: number) =>
    laps === 0 && today < MIN ? `Nothing today yet, ${total(week)} this week.` : `${total(today)} today in ${plural(laps, 'lap', 'laps')}, ${total(week)} this week.`,
  cheer: 'Cheer',
  cheerLabel: (name: string, ended: number) => `Cheer ${name} for the lap that ended at ${wall(ended)}`,
  cheeredBy: (who: string[], yours: boolean) => `${names(who)} cheered ${yours ? 'your last lap' : 'this lap'}.`,

  open: 'Code and settings',
  sheet: 'This room',
  renameGo: 'Rename',
  target: 'Together in a week',
  // The unit beside the typed figure. Nought is a figure too, and says what it means.
  hours: (hours: number) => (hours === 0 ? 'hours: no target' : hours === 1 ? 'hour' : 'hours'),
  targetLess: 'One hour less',
  targetMore: 'One hour more',
  ranked: 'Order by this week',
  rankedNote: 'Most focus first, for everyone in this room. Off, people stay in the order they joined.',
  codeTitle: 'The code to share',
  codeNote: 'Whoever has it can join. Read it out, or copy it.',
  // The sheet's first line, and what a rename did.
  forAll: 'What you change here changes for everyone in the room.',
  renamed: 'Renamed for everyone.',
  // Five rooms is the most one person can be in: said in place of the room being full.
  tooMany: 'You are in 5 rooms, the most there can be. Leave one first.',
  copy: 'Copy the code',
  copied: 'Copied.',
  copyFailed: 'This browser would not copy it. The code is above.',
  leave: 'Leave the room',
  leaveNote: (last: boolean) => (last ? 'You are the last one here. Leaving ends the room.' : 'Your laps leave the room’s week with you. The code brings you back.'),
  leaveGo: 'Leave',
  stay: 'Stay',
  rooms: 'Your rooms',
  another: 'Make or join another room',
  anotherTitle: 'Another room',
  hidden: 'Rooms are hidden on your devices.',
  unhide: 'Settings brings them back',
};

/** Every lap tier has a line of its own. The numbers are a track's: one lap is 400 metres. */
const TIERS: Record<number, string> = {
  1: 'Lap 1. The bell works.',
  4: '4 laps. On a track that is a mile, give or take nine metres.',
  25: '25 laps. On a track that is the ten thousand metres.',
  100: '100 laps. Nearly a marathon: on a track, two kilometres short.',
  250: '250 laps. A hundred kilometres, seated.',
  500: '500 laps. 200 kilometres.',
  1000: '1000 laps. 400 kilometres, one bell at a time.',
  2500: '2500 laps. 1000 kilometres. No medal exists for that.',
};

/** What was just achieved, one line each: the number first, no exclamation mark. */
export const marks = {
  laps: (tier: number) => TIERS[tier] ?? `${tier} laps.`,
  estimate: (title: string, laps: number, estimate: number) =>
    `${title.length > 28 ? 'That task' : title}: done in ${plural(laps, 'lap', 'laps')}${laps === estimate ? ', as you estimated.' : `. You estimated ${estimate}.`}`,
  week: (ms: number, before: number) => `${total(ms)} this week. Your best before was ${total(before)}.`,
};

/** A mark as its one line, whichever kind it is. */
export const mark = (m: { kind: 'laps'; tier: number } | { kind: 'estimate'; title: string; estimate: number; laps: number } | { kind: 'week'; focus_ms: number; before_ms: number }) =>
  m.kind === 'laps' ? marks.laps(m.tier) : m.kind === 'estimate' ? marks.estimate(m.title, m.laps, m.estimate) : marks.week(m.focus_ms, m.before_ms);

/** The phone app's server: where it is, said as an address a person would type. */
export const server = {
  title: 'Which server?',
  intro: 'heirloom keeps your laps on a server that you or a friend runs. Say where it is.',
  field: 'Server',
  hint: 'An address, or an invite link someone sent you.',
  noServer: 'No server yet? Ask whoever showed you heirloom for an invite link.',
  example: '192.168.1.20:8787',
  go: 'Use this server',
  busy: 'Asking it',
  back: 'Back',
  // Each says what happened and what to do next, in the two lines the intro had: the field under it must not move.
  refusals: {
    invalid: 'That is not an address or an invite link. An address looks like 192.168.1.20:8787.',
    unreachable: 'Nothing answered at that address. Is this phone on the same network as the server?',
    'not-heirloom': 'Something answered there, but it is not heirloom. Check the address and its port.',
    'signed-in': 'An account is open on this phone. Sign out first, so nothing unsent is left behind.',
  },
  // Said once where the address is typed and once under the account: a fact, not an alarm.
  plain: 'This address is plain http. Anyone on the same network can read what is sent, the password too.',
  at: (host: string) => `Server: ${host}`,
  change: 'Change',
};

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Who may invite, and the links they give away. A role is named by what it does. */
export const people = {
  invites: 'Invites',
  canInvite: 'You can invite people here.',
  make: 'Make an invite link',
  fresh: 'The new link',
  linkNote: 'A link makes one account, once, and runs out in 7 days.',
  copyNew: 'Copy the link',
  copied: 'Copied.',
  copyFailed: 'This browser would not copy it. The link is above: select it.',
  none: 'No invite is open.',
  ending: (invite: string) => `\u2026${invite.slice(-6)}`,
  runsOut: (expires: number) => `runs out on ${day(expires)}`,
  copy: 'Copy the link',
  renew: 'Renew',
  renewed: (expires: number) => `Good until ${day(expires)}.`,
  takeBack: 'Take back',
  takeBackGo: 'Take it back',
  keep: 'Keep the link',
  takenBack: 'Taken back. That link no longer works.',
  // The names of the links, for a screen reader: each says which invite.
  forInvite: (words: string, invite: string) => `${words}, the invite ending ${invite.slice(-6)}`,
  notYours: 'Inviting is no longer yours on this server. Whoever runs it changed that.',

  admins: 'Admins',
  decide: 'You decide who can invite.',
  owner: 'owner',
  admin: 'admin',
  lower: 'Back to member',
  lowerLabel: (name: string) => `Back to member: ${name}`,
  lowered: (name: string) => `${name} is a member again.`,
  raise: 'Make an admin',
  username: 'Username',
  usernameHint: 'Someone who already has an account here.',

  // What can go wrong for either panel, then what is each panel's own.
  errors: {
    forbidden: 'That is no longer yours to do on this server.',
    slow_down: 'The server is busy. Try again in a moment.',
    offline: 'Needs a connection. Nothing was sent.',
  } as Record<string, string>,
  // The server signed this device out and Settings still shows the panels: the way on is under Account.
  signedOut: (device: string) => `The server signed this ${device} out. Sign in again, under Account, and then try this.`,
  inviteErrors: {
    full: 'This server has 50 invites open, the most there can be. Take one back first.',
    unknown: 'That invite was used or taken back meanwhile.',
  } as Record<string, string>,
  adminErrors: {
    bad_request: 'The owner stays the owner. Nothing was changed.',
  } as Record<string, string>,
  unknownName: 'Nobody by that name is on this server.',
  goneName: (name: string) => `${name} has no account on this server any more.`,
  failed: 'The server tripped over that. Nothing was changed.',
};
