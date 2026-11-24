import { useEffect, useState } from 'preact/hooks';
import type { Engine } from '../sync/engine.ts';
import { Button } from './kit/button.tsx';
import { Panel } from './kit/panel.tsx';
import { Person } from './kit/person.tsx';
import css from './settings.module.css';
import * as s from './strings.ts';

// The phone app is built knowing its server; in a browser the server is the page's own.
const server = () => new URL(import.meta.env.VITE_SERVER_URL || location.origin).host;

/**
 * Reached from the person, not from the five destinations. For now it holds the account; each
 * later part (lengths, sounds, celebrations, what rooms see) is one more panel under it.
 */
export function Settings({ engine, onSignIn }: { engine: Engine; onSignIn: () => void }) {
  const account = engine.account.value;
  const sync = engine.sync.value;
  const unsent = engine.unsent.value;
  const [refusal, setRefusal] = useState('');
  // Why a sign out was refused is true only until something changes: the edits go out, or the connection does.
  const sent = unsent === 0;
  useEffect(() => setRefusal(''), [sync, sent]);
  if (!account) return null;

  const signOut = async () => {
    const result = await engine.signOut();
    setRefusal(result.ok ? '' : result.error === 'unsent' ? s.status.signOutUnsent(engine.unsent.value, s.device()) : s.status.signOutFailed);
  };
  const refused = sync === 'signed-out';

  return (
    <div class={css.settings}>
      <header>
        <h1>{s.settings.title}</h1>
        <Button kind="link" onClick={() => history.back()}>
          {s.settings.back}
        </Button>
      </header>
      <Panel title={s.settings.account}>
        <Person name={account.username} />
        <p>{refused ? s.settings.refused(s.device(), server()) : s.settings.where(s.device(), server())}</p>
        <div class={css.actions}>
          {/* The server has already signed this device out: the way back in comes first. */}
          {refused && (
            <Button kind="primary" onClick={onSignIn}>
              {s.status.signInAgain}
            </Button>
          )}
          <Button onClick={signOut}>{s.status.signOut}</Button>
        </div>
        {refusal && <p role="alert">{refusal}</p>}
      </Panel>
    </div>
  );
}
