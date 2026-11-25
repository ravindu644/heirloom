import { useEffect, useState } from 'preact/hooks';
// Imported for what it does: it teaches Preact to redraw a component when a signal it read changes.
import '@preact/signals';
import type { ReadonlySignal } from '@preact/signals';
import './tokens.css';
import './base.css';
import type { Admins } from '../sync/admins.ts';
import type { Engine } from '../sync/engine.ts';
import type { Invites } from '../sync/invites.ts';
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
import { SignIn } from './signin.tsx';
import { TodayScreen } from './today/today.tsx';
import * as s from './strings.ts';

// By hash, so the same build works from the Go server, from Vite and inside the phone app with no
// server rules. Anything unknown is Focus. Settings is a screen, but not one of the five.
type Screen = Destination | 'settings';
function useScreen(): Screen {
  const read = (): Screen => (location.hash === '#/settings' ? 'settings' : (DESTINATIONS.find((id) => location.hash === `#/${id}`) ?? 'focus'));
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
  /** The phone app's server. Left out in a browser, where the page's own address is the server. */
  server?: ServerChoice;
  /** True while the device will not let heirloom notify: Settings says so under the bell. */
  ringBlocked?: ReadonlySignal<boolean>;
}

export function App({ engine, focus, today, progress, habits, rooms, settings, invites, admins, server, onReminderSet, canSave, ringBlocked }: Props) {
  const screen = useScreen();
  const invite = useInvite();
  const account = engine.account.value;
  const sync = engine.sync.value;
  const unsent = engine.unsent.value;
  // The server refused this device's token: the app still works, and Settings offers signing in again.
  const [again, setAgain] = useState(false);

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

  return (
    // The status line keeps its space only where buttons sit at the bottom of a phone screen: Focus.
    <Shell
      person={account.username}
      at={screen === 'settings' ? undefined : screen}
      without={rooms.hidden.value ? 'room' : undefined}
      status={said}
      keepStatus={screen === 'focus'}
    >
      {screen === 'focus' ? (
        <FocusScreen engine={engine} focus={focus} today={today} rooms={rooms} settings={settings} />
      ) : screen === 'today' ? (
        <TodayScreen engine={engine} focus={focus} today={today} settings={settings} app={canSave === false} onReminderSet={onReminderSet} />
      ) : screen === 'progress' ? (
        <ProgressScreen focus={focus} progress={progress} />
      ) : screen === 'habits' ? (
        <HabitsScreen focus={focus} habits={habits} onReminderSet={onReminderSet} app={canSave === false} />
      ) : screen === 'room' ? (
        <RoomScreen engine={engine} rooms={rooms} />
      ) : (
        // Settings is not one of the five: its name makes it a screen of its own for the frame.
        <Settings engine={engine} settings={settings} invites={invites} admins={admins} server={server} canSave={canSave} ringBlocked={ringBlocked} onSignIn={() => setAgain(true)} />
      )}
    </Shell>
  );
}
