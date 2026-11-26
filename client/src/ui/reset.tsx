import type { TargetedSubmitEvent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Resets } from '../sync/resets.ts';
import { Button } from './kit/button.tsx';
import { Field } from './kit/field.tsx';
import { Fold } from './kit/fold.tsx';
import { Shell } from './shell.tsx';
import css from './signin.module.css';
import * as s from './strings.ts';

/** The reset in the address a link opens, `#/reset/<reset>`, or null. Never an empty string. */
export const resetIn = (hash: string): string | null => /^#\/reset\/([A-Za-z0-9_-]+)\/?(?:\?\S*)?$/.exec(hash)?.[1] ?? null;

interface Props {
  resets: Resets;
  /** The reset the link carried. It is held by the app for as long as this page stands, and nowhere else. */
  reset: string;
  /** The server's name, as the sign-in screen says it. */
  host: string;
  /** Signed in: the app takes over. */
  onDone: () => void;
  /** To the sign-in screen: the link is let go. */
  onLeave: () => void;
}

/**
 * The page a reset link opens, signed out: whose password it is, one field, one button. The
 * form stands from the first frame and the name arrives in the line kept for it, so nothing
 * jumps while the server is asked. A link that no longer works says so and who to ask. The
 * password is read from its field in the one call that sends it, and kept nowhere.
 */
export function ResetPage({ resets, reset, host, onDone, onLeave }: Props) {
  const [who, setWho] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let gone = false;
    void resets.look(reset).then((answer) => {
      if (gone) return;
      if (answer.ok) setWho(answer.username);
      else if (answer.error === 'reset') setDead(true);
      else setError(s.account.error(answer.error, answer.retry_after));
    });
    return () => void (gone = true);
  }, []);

  const submit = async (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    // The rule of registering, asked here first: a refusal would cost a turn in the server's line of
    // sign-ins. The server counts UTF-16 code units, as `length` does.
    const broken = password.length < 8 ? s.reset.short : password.length > 256 ? s.reset.long : '';
    if (broken) return setError(broken);
    // What was said stays while the server is asked: see the sign-in form.
    setBusy(true);
    const result = await resets.use(reset, password);
    setBusy(false);
    if (result.ok) return onDone();
    if (result.error === 'reset') return setDead(true);
    setError(result.error === 'bad_request' ? (password.length > 256 ? s.reset.long : s.reset.short) : s.account.error(result.error, result.retry_after));
  };

  // One page whichever way the link turns out: under the heading the form, or the sentence that
  // says it no longer works, folding into each other's place, so a link found dead after a round
  // trip, or on Set, closes the field in time instead of swapping the page between two frames.
  return (
    // From 720px one column on the mark's edge, its heading on the sign-in's line, 112px down.
    <Shell page="form" bare>
      <div class={css.lone}>
      <div class={css.form}>
        <h1>{s.reset.heading}</h1>
        <Fold gap="md">
          {dead ? (
            <div key="dead" class={css.form}>
              <p role="alert">{s.reset.dead}</p>
              <div class={css.actions}>
                <Button onClick={onLeave}>{s.reset.toSignIn}</Button>
              </div>
            </div>
          ) : (
            <form key="live" class={css.form} onSubmit={submit}>
              {/* One line, kept from the first frame: the name fills it when the server has said whose link this is. */}
              <p class={css.whose}>{who && s.reset.whoseOn(who, host)}</p>
              {/* For a password manager, which files the new password under this name. Never shown, never typed. */}
              {who && <input hidden readOnly name="username" autocomplete="username" value={who} />}
              <Field label={s.reset.field} hint={s.account.passwordHint} name="password" type="password" required autocomplete="new-password" />
              <div>
                <Fold role="alert">{error && <p class={css.error}>{error}</p>}</Fold>
                <div class={css.actions} data-moves>
                  <Button kind="primary" type="submit" disabled={busy}>
                    {busy ? s.account.signingIn : s.reset.go}
                  </Button>
                  {/* The page is not a dead end: the password may come back to mind halfway. */}
                  <Button kind="quiet" onClick={onLeave}>
                    {s.reset.toSignIn}
                  </Button>
                </div>
              </div>
              <p class={css.aside}>{s.reset.others}</p>
            </form>
          )}
        </Fold>
      </div>
      </div>
    </Shell>
  );
}

/**
 * The same link opened where an account is open: no field, whose link it is when the server
 * says, and the way to where signing out is. The sentence has its two lines from the first frame.
 */
export function ResetSignedIn({ resets, reset }: { resets: Resets; reset: string }) {
  const [said, setSaid] = useState('');
  useEffect(() => {
    let gone = false;
    void resets.look(reset).then((answer) => gone || setSaid(answer.ok ? s.reset.signedInFor(answer.username) : s.reset.signedIn));
    return () => void (gone = true);
  }, [reset]);
  return (
    <div class={css.form}>
      <h1>{s.reset.heading}</h1>
      <p class={css.whose}>{said}</p>
      <div class={css.actions}>
        <Button onClick={() => void (location.hash = '#/settings')}>{s.settings.title}</Button>
      </div>
    </div>
  );
}
