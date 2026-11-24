import type { TargetedSubmitEvent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Engine } from '../sync/engine.ts';
import { Button } from './kit/button.tsx';
import { Field } from './kit/field.tsx';
import { Shell } from './shell.tsx';
import css from './signin.module.css';
import * as s from './strings.ts';

/** Signing in, or joining with an invite. `again` is the username of someone the server signed out: they may also go back. */
export function SignIn({ engine, again, onDone }: { engine: Engine; again?: string; onDone: () => void }) {
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // With the keyboard up there is half a screen. Bring the button into view, then the field being
  // typed in: both when they fit, and the field when they do not. The keyboard opening is a resize.
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const show = () => {
      if (!(document.activeElement instanceof HTMLInputElement)) return;
      actions.current?.scrollIntoView({ block: 'nearest' });
      document.activeElement.scrollIntoView({ block: 'nearest' });
    };
    addEventListener('resize', show);
    addEventListener('focusin', show);
    return () => {
      removeEventListener('resize', show);
      removeEventListener('focusin', show);
    };
  }, []);

  const submit = async (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '');
    setBusy(true);
    setError('');
    const result = joining
      ? await engine.register(field('invite').trim(), field('username').trim(), field('password'))
      : await engine.signIn(field('username').trim(), field('password'));
    setBusy(false);
    if (result.ok) onDone();
    else setError(s.account.error(result.error, result.retry_after));
  };

  return (
    <Shell>
      <form class={css.form} onSubmit={submit}>
        <h1>{joining ? s.account.join : s.account.signIn}</h1>
        {/* What went wrong takes the place of the welcome, so nothing below it moves. The second
            line is the same sentence for a screen reader, which only announces a region that was
            already there. */}
        <p class={error ? css.error : css.intro} aria-hidden={!!error}>
          {error || (joining ? s.account.joinIntro : s.account.signInIntro(s.device()))}
        </p>
        <p class="sr" role="alert">
          {error}
        </p>
        {joining && <Field label={s.account.invite} name="invite" required autocomplete="off" autocapitalize="none" spellcheck={false} />}
        <Field
          label={s.account.username}
          hint={joining ? s.account.usernameHint : undefined}
          name="username"
          defaultValue={again}
          required
          autocomplete="username"
          autocapitalize="none"
          spellcheck={false}
        />
        <Field
          label={s.account.password}
          hint={joining ? s.account.passwordHint : undefined}
          name="password"
          type="password"
          required
          autocomplete={joining ? 'new-password' : 'current-password'}
        />
        <div class={css.actions} ref={actions}>
          <Button kind="primary" type="submit" disabled={busy}>
            {joining ? (busy ? s.account.joining : s.account.joinGo) : busy ? s.account.signingIn : s.account.signIn}
          </Button>
          {again ? (
            <Button kind="quiet" onClick={onDone}>
              {s.account.notNow}
            </Button>
          ) : (
            <Button
              kind="quiet"
              onClick={() => {
                setJoining(!joining);
                setError('');
              }}
            >
              {joining ? s.account.haveAccount : s.account.haveInvite}
            </Button>
          )}
        </div>
      </form>
    </Shell>
  );
}
