import type { TargetedSubmitEvent } from 'preact';
import { useState } from 'preact/hooks';
import type { ServerChoice, ServerRefusal } from '../sync/server.ts';
import { Button } from './kit/button.tsx';
import { Field } from './kit/field.tsx';
import { Shell } from './shell.tsx';
import css from './signin.module.css';
import * as s from './strings.ts';

/**
 * The phone app's first screen, and what "Change" on the sign-in screen opens: which server.
 * One field, which takes an address or an invite link, and one button. When a heirloom server
 * answers there the app starts again on it, so this screen only ever hears why not: that
 * sentence takes the intro's place, as on the sign-in screen, and nothing below it moves.
 */
export function ServerStep({ choice, onBack }: { choice: ServerChoice; onBack?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ServerRefusal | null>(null);
  const said = refusal ? s.server.refusals[refusal] : '';

  const submit = async (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = String(new FormData(event.currentTarget).get('server') ?? '').trim();
    setBusy(true);
    setRefusal(null);
    setRefusal(await choice.choose(typed));
    setBusy(false);
  };

  return (
    <Shell>
      <form class={css.form} onSubmit={submit}>
        <h1>{s.server.title}</h1>
        <p class={said ? css.error : css.intro} aria-hidden={!!said}>
          {said || s.server.intro}
        </p>
        <p class="sr" role="alert">
          {said}
        </p>
        <Field
          label={s.server.field}
          hint={s.server.hint}
          placeholder={s.server.example}
          name="server"
          defaultValue={choice.address ?? ''}
          required
          inputMode="url"
          autocomplete="url"
          autocapitalize="none"
          autoCorrect="off"
          spellcheck={false}
        />
        {/* Said where the address is typed, once, and as a fact. */}
        {choice.plain && <p>{s.server.plain}</p>}
        <div class={css.actions}>
          <Button kind="primary" type="submit" disabled={busy}>
            {busy ? s.server.busy : s.server.go}
          </Button>
          {onBack && (
            <Button kind="quiet" onClick={onBack}>
              {s.server.back}
            </Button>
          )}
        </div>
      </form>
    </Shell>
  );
}
