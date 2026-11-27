import { useEffect, useState } from 'preact/hooks';
// Imported for what it does: it teaches Preact to redraw a component when a signal it read changes.
import '@preact/signals';
import type { ReadonlySignal } from '@preact/signals';
import './tokens.css';
import './base.css';
import type { Admins } from '../sync/admins.ts';
import type { Engine } from '../sync/engine.ts';
import type { Invites } from '../sync/invites.ts';
import type { Resets } from '../sync/resets.ts';
import { inviteIn } from '../sync/server.ts';
import type { ServerChoice } from '../sync/server.ts';
import type { Focus } from '../sync/focus.ts';
import type { Habits } from '../sync/habits.ts';
import type { Progress } from '../sync/progress.ts';
import type { Rooms } from '../sync/rooms.ts';
import type { Settings as SettingsData } from '../sync/settings.ts';
import type { Today } from '../sync/today.ts';
import css from './app.module.css';
import { Settings } from './settings.tsx';
import { DESTINATIONS, Shell } from './shell.tsx';
import type { Destination } from './shell.tsx';
import { FocusScreen } from './focus/focus.tsx';
import { HabitsScreen } from './habits/habits.tsx';
import { RoomScreen } from './room/room.tsx';
import { ProgressScreen } from './progress/progress.tsx';
import { ResetPage, ResetSignedIn, resetIn } from './reset.tsx';
import { holderOf, ownPicture, usePicture } from './picture.ts';
import { SignIn } from './signin.tsx';
import { TodayScreen } from './today/today.tsx';
import * as s from './strings.ts';

// By hash, so the same build works from the Go server, from Vite and inside the phone app with no
// server rules. Anything unknown is Focus. Settings is a screen, but not one of the five.
type Screen = Destination | 'settings';
function useScreen(): Screen {
  // The first part of the address names the screen: `#/room/<member>` is the Room, with a report open.
  const read = (): Screen => {
    const first = location.hash.slice(2).split('/')[0];
    return first === 'settings' ? 'settings' : (DESTINATIONS.find((id) => id === first && (id === 'room' || location.hash === `#/${id}`)) ?? 'focus');
  };
  const [screen, setScreen] = useState(read);
  useEffect(() => {
    const change = () => setScreen(read());
    addEventListener('hashchange', change);
    return () => removeEventListener('hashchange', change);
  }, []);
  return screen;
}

// An invite link is the address of this page: `<server>/#/join/<invite>`. The invite is followed
// as the address changes, so a link pasted into an open tab is not missed; once in, the address
// is an ordinary one again.
function useInvite(): string | undefined {
  const read = () => inviteIn(location.hash.startsWith('#/join/') ? location.hash : '') ?? undefined;
  const [invite, setInvite] = useState(read);
  useEffect(() => {
    const change = () => setInvite(read());
    addEventListener('hashchange', change);
    return () => removeEventListener('hashchange', change);
  }, []);
  return invite;
}

// A reset link is the address of this page too: `<server>/#/reset/<reset>`. It is read once and
// the address made `#/reset` at that moment: the link is a key, and must not stay in the address
// bar, the history or a bookmark. `#/reset` is no destination (it draws Focus), so any link the
// person follows, Focus and the mark included, changes the address and is heard. From then on it is held here and nowhere else,
// until it is used, found dead or let go. `shown` is false once the person has gone anywhere
// since: where an account is open, the page that says so is not in the way of the app twice.
function useReset() {
  const read = () => {
    const found = resetIn(location.hash);
    if (found) history.replaceState(null, '', '#/reset');
    return found;
  };
  const [held, setHeld] = useState(() => ({ reset: read(), shown: true }));
  useEffect(() => {
    const change = () => {
      const found = read();
      setHeld((was) => (found ? { reset: found, shown: true } : { ...was, shown: false }));
    };
    addEventListener('hashchange', change);
    return () => removeEventListener('hashchange', change);
  }, []);
  return {
    ...held,
    // Used or let go: the address is an ordinary one again, as the screen under it already is.
    drop: () => {
      if (location.hash === '#/reset') history.replaceState(null, '', '#/focus');
      setHeld({ reset: null, shown: false });
    },
  };
}

/** The whole screen when there is no app to show: the frame and one sentence. */
export function Notice({ text }: { text: string }) {
  return (
    <Shell>
      <p class={css.notice}>{text}</p>
    </Shell>
  );
}

/** What a second tab of the same browser shows while the first one has the engine. */
export function Elsewhere() {
  return <Notice text={s.elsewhere} />;
}

/** Everything `startApp` returns, and the one moment the screens hand back. */
interface Props {
  engine: Engine;
  focus: Focus;
  today: Today;
  progress: Progress;
  habits: Habits;
  rooms: Rooms;
  settings: SettingsData;
  /** A habit or a task was given a time where it had none: the moment to ask for leave to notify. */
  onReminderSet?: () => void;
  /** False where the browser cannot save a file (the phone app): Settings then says where a copy can be saved. */
  canSave?: boolean;
  invites: Invites;
  admins: Admins;
  resets: Resets;
  /** The phone app's server. Left out in a browser, where the page's own address is the server. */
  server?: ServerChoice;
  /** True while the device will not let heirloom notify: Settings says so under the bell. */
  ringBlocked?: ReadonlySignal<boolean>;
  /** The phone app: true while Android may stop heirloom in the background; Settings offers the way out. */
  mayStop?: ReadonlySignal<boolean>;
  letRun?: () => void;
}

export function App({ engine, focus, today, progress, habits, rooms, settings, invites, admins, resets, server, onReminderSet, canSave, ringBlocked, mayStop, letRun }: Props) {
  const screen = useScreen();
  const invite = useInvite();
  const link = useReset();
  const pictureHash = ownPicture(rooms);
  const picture = usePicture(rooms, pictureHash, holderOf(engine, rooms));
  const account = engine.account.value;
  const sync = engine.sync.value;
  const unsent = engine.unsent.value;
  // The server refused this device's token: the app still works, and Settings offers signing in again.
  const [again, setAgain] = useState(false);

  // A reset link in hand and nobody signed in: its page. Signed in, the link waits (see below) and is
  // offered again the moment the account is closed, so it need not be opened a second time.
  if (!account && link.reset) {
    const host = new URL(server?.address ?? engine.server, location.origin).host;
    return <ResetPage key={link.reset} resets={resets} reset={link.reset} host={host} onDone={link.drop} onLeave={link.drop} />;
  }

  if (!account || again) {
    const done = () => {
      setAgain(false);
      if (invite) location.replace('#/focus');
    };
    // Keyed by the invite: a link pasted into a tab that already shows this page, or a second
    // link after one was refused, starts the form again with that invite in hand.
    return <SignIn key={invite ?? ''} engine={engine} again={account?.username} invite={invite} server={server} onDone={done} />;
  }

  // In step says nothing. Catching up says nothing either: it is over before it could be read.
  const said = engine.unsaved.value
    ? s.status.unsaved(s.device(), sync === 'offline')
    : sync === 'offline'
      ? s.status.offline(unsent, s.device())
      : sync === 'signed-out'
        ? s.status.refused(s.device())
        : '';

  // A reset link opened where an account is open: it is not used over that account. Said once, until the person goes anywhere.
  const reset = link.reset !== null && link.shown;

  return (
    // The status line keeps its space only where buttons sit at the bottom of a phone screen: Focus.
    <Shell
      person={account.username}
      picture={picture ?? undefined}
      pending={picture === undefined}
      at={screen === 'settings' || reset ? undefined : screen}
      page={reset ? 'reset' : undefined}
      without={rooms.hidden.value ? 'room' : undefined}
      status={said}
      keepStatus={screen === 'focus'}
    >
      {reset ? (
        <ResetSignedIn resets={resets} reset={link.reset!} />
      ) : screen === 'focus' ? (
        <FocusScreen engine={engine} focus={focus} today={today} rooms={rooms} settings={settings} />
      ) : screen === 'today' ? (
        <TodayScreen engine={engine} focus={focus} today={today} settings={settings} app={canSave === false} onReminderSet={onReminderSet} />
      ) : screen === 'progress' ? (
        <ProgressScreen focus={focus} progress={progress} />
      ) : screen === 'habits' ? (
        <HabitsScreen focus={focus} habits={habits} onReminderSet={onReminderSet} app={canSave === false} />
      ) : screen === 'room' ? (
        <RoomScreen engine={engine} rooms={rooms} lapMs={settings.all.value.work_ms} />
      ) : (
        // Settings is not one of the five: its name makes it a screen of its own for the frame.
        <Settings engine={engine} settings={settings} invites={invites} admins={admins} resets={resets} rooms={rooms} server={server} canSave={canSave} ringBlocked={ringBlocked} mayStop={mayStop} letRun={letRun} onSignIn={() => setAgain(true)} />
      )}
    </Shell>
  );
}
