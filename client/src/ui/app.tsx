import { useEffect, useState } from 'preact/hooks';
// Imported for what it does: it teaches Preact to redraw a component when a signal it read changes.
import '@preact/signals';
import './tokens.css';
import './base.css';
import type { Engine } from '../sync/engine.ts';
import type { Focus } from '../sync/focus.ts';
import css from './app.module.css';
import { FocusScreen } from './focus/focus.tsx';
import { Brand } from './kit/brand.tsx';
import { Button } from './kit/button.tsx';
import { SignIn } from './signin.tsx';
import * as s from './strings.ts';

const SCREENS = ['focus', 'today', 'progress', 'habits', 'room'] as const;
type Screen = (typeof SCREENS)[number];

// By hash, so the same build works from the Go server, from Vite and inside the phone app with no
// server rules. Anything unknown is Focus.
function useScreen(): Screen {
  const read = () => SCREENS.find((id) => location.hash === `#/${id}`) ?? 'focus';
  const [screen, setScreen] = useState(read);
  useEffect(() => {
    const change = () => setScreen(read());
    addEventListener('hashchange', change);
    return () => removeEventListener('hashchange', change);
  }, []);
  return screen;
}

/** What a second tab of the same browser shows while the first one has the engine. */
export function Elsewhere() {
  return (
    <main class={css.elsewhere}>
      <p>
        <Brand name={s.brand} />
      </p>
      <p>{s.elsewhere}</p>
    </main>
  );
}

export function App({ engine, focus }: { engine: Engine; focus: Focus }) {
  const screen = useScreen();
  const account = engine.account.value;
  const sync = engine.sync.value;
  const unsent = engine.unsent.value;
  // The server refused this device's token: the app still works, and signing in again is offered.
  const [again, setAgain] = useState(false);
  const [refusal, setRefusal] = useState('');

  if (!account || again) return <SignIn engine={engine} again={account?.username} onDone={() => setAgain(false)} />;

  const signOut = async () => {
    const result = await engine.signOut();
    setRefusal(result.ok ? '' : result.error === 'unsent' ? s.status.signOutUnsent(engine.unsent.value, s.device()) : s.status.signOutFailed);
  };
  // In step says nothing. Catching up says nothing either: it is over before it could be read.
  const said = engine.unsaved.value
    ? s.status.unsaved(s.device(), sync === 'offline')
    : sync === 'offline'
      ? refusal || s.status.offline(unsent, s.device())
      : sync === 'signed-out'
        ? s.status.refused(s.device())
        : '';

  return (
    <div class={css.app}>
      <a class={css.brand} href="#/focus">
        <Brand name={s.brand} />
      </a>
      <nav class={css.nav} aria-label={s.nav.label}>
        {SCREENS.map((id) => (
          <a key={id} href={`#/${id}`} aria-current={id === screen ? 'page' : undefined}>
            {id === screen ? <b>{s.nav[id]}</b> : s.nav[id]}
          </a>
        ))}
      </nav>
      <main class={css.main}>
        <div class={css.canvas}>
          {screen === 'focus' ? (
            <FocusScreen engine={engine} focus={focus} />
          ) : (
            <div class={css.later}>
              <h1>{s.nav[screen]}</h1>
              <p>{s.later[screen]}</p>
            </div>
          )}
        </div>
      </main>
      <p class={css.status} role="status">
        {said}
      </p>
      <div class={css.account}>
        <span>{account.username}</span>
        {/* The server has already signed this device out: the one thing left to offer is the way back in. */}
        {sync === 'signed-out' ? (
          <Button kind="small" onClick={() => setAgain(true)}>
            {s.status.signInAgain}
          </Button>
        ) : (
          <Button kind="small" onClick={signOut}>
            {s.status.signOut}
          </Button>
        )}
      </div>
    </div>
  );
}
