import { useEffect, useState } from 'preact/hooks';
// Imported for what it does: it teaches Preact to redraw a component when a signal it read changes.
import '@preact/signals';
import './tokens.css';
import './base.css';
import type { Engine } from '../sync/engine.ts';
import type { Focus } from '../sync/focus.ts';
import type { Today } from '../sync/today.ts';
import css from './app.module.css';
import { Settings } from './settings.tsx';
import { DESTINATIONS, Shell } from './shell.tsx';
import type { Destination } from './shell.tsx';
import { FocusScreen } from './focus/focus.tsx';
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

export function App({ engine, focus, today }: { engine: Engine; focus: Focus; today: Today }) {
  const screen = useScreen();
  const account = engine.account.value;
  const sync = engine.sync.value;
  const unsent = engine.unsent.value;
  // The server refused this device's token: the app still works, and Settings offers signing in again.
  const [again, setAgain] = useState(false);

  if (!account || again) return <SignIn engine={engine} again={account?.username} onDone={() => setAgain(false)} />;

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
    <Shell person={account.username} at={screen === 'settings' ? undefined : screen} status={said} keepStatus={screen === 'focus'}>
      {screen === 'focus' ? (
        <FocusScreen engine={engine} focus={focus} today={today} />
      ) : screen === 'today' ? (
        <TodayScreen engine={engine} focus={focus} today={today} />
      ) : screen === 'settings' ? (
        <Settings engine={engine} onSignIn={() => setAgain(true)} />
      ) : (
        <div class={css.later}>
          <h1>{s.nav[screen]}</h1>
          <p>{s.later[screen]}</p>
        </div>
      )}
    </Shell>
  );
}
