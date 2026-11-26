import type { TargetedSubmitEvent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Engine } from '../sync/engine.ts';
import { inviteIn } from '../sync/server.ts';
import type { ServerChoice } from '../sync/server.ts';
import { Button } from './kit/button.tsx';
import { Field } from './kit/field.tsx';
import { first } from './kit/first.ts';
import { Fold } from './kit/fold.tsx';
import links from './kit/links.module.css';
import { ServerStep } from './server.tsx';
import { Shell } from './shell.tsx';
import css from './signin.module.css';
import * as s from './strings.ts';
import { About } from './welcome.tsx';

interface Props {
  engine: Engine;
  /** The username of someone the server signed out: they may also go back. */
  again?: string;
  /** The invite of a link the person arrived by (`#/join/<invite>`): the join form opens with it in hand. */
  invite?: string;
  /** The phone app's server. Left out in a browser, where the page's own address is the server. */
  server?: ServerChoice;
  onDone: () => void;
}

// How long the form waits to hear whether the server is fresh. Under half a second reads as the
// screen arriving, not as waiting.
const SETUP_WAIT_MS = 400;

// What the form is for. `setup` is a server with no account yet: the first one needs no invite.
type Kind = 'signin' | 'join' | 'setup';

/** Signing in, joining with an invite, or setting up a server that has no account yet. */
export function SignIn({ engine, again, invite, server, onDone }: Props) {
  // An invite in hand: from the link in the address, or from the link pasted where the server
  // was asked for. That one is held by the phone app until it has made an account or been
  // refused, not until this form is drawn: a person may leave for a password manager and come back.
  const [linked, setLinked] = useState(() => (again ? null : (invite ?? server?.heldInvite() ?? null)));
  const [kind, setKind] = useState<Kind>(linked ? 'join' : 'signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);

  // A fresh server says so, and the form becomes its setup. Not asked for someone signing in
  // again or arriving with an invite. Until it has answered, or the wait is over, the frame
  // stands empty: on a fresh server the first thing its owner sees must not be a sign-in form
  // that turns into something else. An answer that comes later still turns the form.
  const [held, setHeld] = useState(!again && !linked);
  useEffect(() => {
    if (!held) return;
    let gone = false;
    const asked = engine.needsSetup();
    void asked.then((fresh) => !gone && fresh && setKind('setup'));
    void first(asked, SETUP_WAIT_MS).then(() => !gone && setHeld(false));
    return () => void (gone = true);
  }, []);

  // The frame fills the screen whatever is in it, so nothing jumps when the form arrives.
  if (held) return <Shell page="held">{null}</Shell>;
  if (changing && server) return <ServerStep choice={server} onBack={() => setChanging(false)} />;

  const submit = async (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '');
    // The invite the join form sends: the one in hand, or the one in what was typed or pasted.
    // Only the setup form sends none: an empty invite makes the owner of a fresh server, and
    // nobody joining means that. Nothing found is said, and nothing is sent.
    const joining = kind === 'join' ? (linked ?? inviteIn(field('invite'))) : '';
    // A reset link pasted here is not an invite, and is said to be what it is.
    if (joining === null) return setError(field('invite').includes('#/reset/') ? s.reset.pasted : s.account.noInvite);
    // What was said stays while the server is asked again: taken away now and put back a moment
    // later, it would move the buttons twice under the finger.
    setBusy(true);
    const result = kind === 'signin' ? await engine.signIn(field('username').trim(), field('password')) : await engine.register(joining, field('username').trim(), field('password'));
    setBusy(false);
    // The invite the phone app held has done its work, or the server will not have it: let it go.
    if (linked && (result.ok || result.error === 'invite')) server?.forgetInvite();
    if (result.ok) return onDone();
    // The link's invite was refused: it is said, and the ordinary form takes over.
    if (linked && result.error === 'invite') {
      setLinked(null);
      return setError(s.account.linkRefused);
    }
    // Someone else set the server up a moment ago. The server says so with `invite`, or, a little
    // later, with `bad_request`, which is also what a name or password that breaks the rules
    // gets: the server is asked which it was. Either way this is now an ordinary server, and the
    // sentence is its own, not the one about an unknown invite.
    if (kind === 'setup' && (result.error === 'invite' || (result.error === 'bad_request' && !(await engine.needsSetup())))) {
      setKind('signin');
      return setError(s.account.setupTaken);
    }
    setError(s.account.error(result.error, result.retry_after));
  };

  const host = new URL(server?.address ?? engine.server, location.origin).host;
  const making = kind !== 'signin';

  return (
    <Shell page="form">
      <div class={css.page}>
      <form class={css.form} onSubmit={submit}>
        <h1>{kind === 'setup' ? s.account.setup : kind === 'join' ? s.account.join : s.account.signIn}</h1>
        <p class={css.intro}>{kind === 'setup' ? s.account.setupIntro : kind === 'join' ? (linked ? s.account.joinLinked(host) : s.account.joinIntro) : s.account.signInIntro(s.device())}</p>
        {kind === 'join' && !linked && (
          <Field label={s.account.invite} hint={s.account.inviteHint} name="invite" required autocomplete="off" autocapitalize="none" spellcheck={false} />
        )}
        <Field
          label={s.account.username}
          hint={making ? s.account.usernameHint : undefined}
          name="username"
          defaultValue={again}
          required
          autocomplete="username"
          autocapitalize="none"
          spellcheck={false}
        />
        <Field
          label={s.account.password}
          hint={making ? s.account.passwordHint : undefined}
          name="password"
          type="password"
          required
          autocomplete={making ? 'new-password' : 'current-password'}
        />
        {/* What went wrong has a line of its own, directly above the buttons it answers: it opens
            in place, and the intro, the labels and the hints stay as they were. The region is
            always there, so a screen reader hears what arrives in it. */}
        <div>
          <Fold role="alert">{error && <p class={css.error}>{error}</p>}</Fold>
        {/* DESIGN.md's one exception to "what you tapped stays": the error moves these buttons down by its own height, in time. */}
        <div class={css.actions} data-moves>
          <Button kind="primary" type="submit" disabled={busy}>
            {kind === 'setup'
              ? busy
                ? s.account.settingUp
                : s.account.setupGo
              : kind === 'join'
                ? busy
                  ? s.account.joining
                  : s.account.joinGo
                : busy
                  ? s.account.signingIn
                  : s.account.signIn}
          </Button>
          {again ? (
            <Button kind="quiet" onClick={onDone}>
              {s.account.notNow}
            </Button>
          ) : (
            // A server with no account has nobody to sign in and no invite to give.
            kind !== 'setup' && (
              <Button
                kind="quiet"
                onClick={() => {
                  setKind(kind === 'join' ? 'signin' : 'join');
                  setError('');
                }}
              >
                {kind === 'join' ? s.account.haveAccount : s.account.haveInvite}
              </Button>
            )
          )}
        </div>
        </div>
        {/* Only where a password is asked for and there is someone to have forgotten it. */}
        {kind === 'signin' && <p class={css.aside}>{server ? s.reset.forgotApp : s.reset.forgot}</p>}
        {/* The phone app is not served by its server, so it says which one it talks to, and that can be changed here. */}
        {server && (
          <div class={css.server}>
            <p>
              {/* The address is there to be copied. */}
              <span class="copies">{s.server.at(host)}</span>
              <Button kind="link" class={links.end} onClick={() => setChanging(true)}>
                {s.server.change}
              </Button>
            </p>
            {server.plain && <p>{s.server.plain}</p>}
          </div>
        )}
      </form>
      {/* In a browser, someone who was only handed a link reads what this is: beside the form
          where there is room, under it on a phone. The phone app said it on its first screen. */}
      {!server && !again && <About />}
      </div>
    </Shell>
  );
}
