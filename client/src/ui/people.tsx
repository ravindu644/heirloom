import type { TargetedSubmitEvent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Admins } from '../sync/admins.ts';
import { UNDO_MS } from '../sync/focus.ts';
import type { InviteView, Invites } from '../sync/invites.ts';
import { Button } from './kit/button.tsx';
import { copyText } from './kit/copy.ts';
import { cx } from './kit/cx.ts';
import { Field } from './kit/field.tsx';
import { Fold } from './kit/fold.tsx';
import links from './kit/links.module.css';
import { Panel } from './kit/panel.tsx';
import { Person } from './kit/person.tsx';
import css from './people.module.css';
import * as s from './strings.ts';

// Each panel has its own words for the codes that mean something else in the other; `token` is a
// device the server signed out, which Settings' Account also says, with the way to sign in again.
const why = (error: string, own: Record<string, string>) => (error === 'token' ? s.people.signedOut(s.device()) : (own[error] ?? s.people.errors[error] ?? s.people.failed));

/**
 * The invite links an admin or the owner gives away. A new link is shown whole, to copy; the
 * open ones are rows: the end of the link, the day it runs out, and what can be done with it.
 * Taking one back cannot be undone, so it takes a second tap in the row itself.
 */
export function InvitesPanel({ invites }: { invites: Invites }) {
  const open = invites.open.value;
  const [fresh, setFresh] = useState<InviteView | null>(null);
  const [said, setSaid] = useState('');
  const [taking, setTaking] = useState<string | null>(null);
  // Asked again each time the panel comes on screen: links are used and run out elsewhere.
  useEffect(() => void invites.refresh(), []);

  const copy = async (link: string) => setSaid((await copyText(link)) ? s.people.copied : s.people.copyFailed);
  const make = async () => {
    const result = await invites.make();
    setSaid(result.ok ? '' : why(result.error, s.people.inviteErrors));
    if (result.ok && result.invite) setFresh(result.invite);
  };
  const renew = async (invite: InviteView) => {
    const result = await invites.renew(invite.invite);
    setSaid(result.ok ? s.people.renewed(result.invite?.expires ?? invite.expires) : why(result.error, s.people.inviteErrors));
    // One that had run out comes back under a new link: that one is shown, to give away again.
    if (result.ok && result.invite && result.invite.invite !== invite.invite) setFresh(result.invite);
  };
  const takeBack = async (invite: InviteView) => {
    setTaking(null);
    const result = await invites.takeBack(invite.invite);
    setSaid(result.ok ? s.people.takenBack : why(result.error, s.people.inviteErrors));
    if (result.ok && fresh?.invite === invite.invite) setFresh(null);
  };

  // The server has said this account may not ask any more: one sentence, and nothing to press.
  if (open === 'forbidden')
    return (
      <Panel title={s.people.invites}>
        <p>{s.people.notYours}</p>
      </Panel>
    );

  const links3 = (invite: InviteView) => (
    <>
      <Button kind="link" aria-label={s.people.forInvite(s.people.copy, invite.invite)} onClick={() => copy(invite.link)}>
        {s.people.copy}
      </Button>
      <Button kind="link" aria-label={s.people.forInvite(s.people.renew, invite.invite)} onClick={() => renew(invite)}>
        {s.people.renew}
      </Button>
      <Button kind="link" aria-label={s.people.forInvite(s.people.takeBack, invite.invite)} onClick={() => setTaking(invite.invite)}>
        {s.people.takeBack}
      </Button>
    </>
  );
  const links2 = (invite: InviteView) => (
    <>
      <Button kind="link" aria-label={s.people.forInvite(s.people.takeBackGo, invite.invite)} onClick={() => takeBack(invite)}>
        {s.people.takeBackGo}
      </Button>
      <Button kind="link" aria-label={s.people.forInvite(s.people.keep, invite.invite)} onClick={() => setTaking(null)}>
        {s.people.keep}
      </Button>
    </>
  );

  // The panel is a column of parts: the link just made, the line that says what a tap did, and
  // each row come and go in time.
  return (
    <Panel title={s.people.invites}>
      <p key="note" class={css.note}>
        {s.people.canInvite} {s.people.linkNote}
      </p>
      <div key="make" class={css.actions}>
        <Button onClick={make}>{s.people.make}</Button>
      </div>
      {fresh && (
        <section key="fresh" class={css.fresh} aria-label={s.people.fresh}>
          <h3>{s.people.fresh}</h3>
          {/* It may break after `/join/` first, so the invite stays in one piece where there is room for it. */}
          <p class={css.link}>
            {fresh.link.slice(0, fresh.link.indexOf('/join/') + 6)}
            <wbr />
            {fresh.link.slice(fresh.link.indexOf('/join/') + 6)}
          </p>
          <div class={css.actions}>
            <Button onClick={() => copy(fresh.link)}>{s.people.copyNew}</Button>
          </div>
        </section>
      )}
      {open && open.length === 0 && !fresh && (
        <p key="none" class={css.note}>
          {s.people.none}
        </p>
      )}
      {open && open.length > 0 && (
        <Fold key="rows" list class={css.rows}>
          {open.map((invite) => (
            <div key={invite.invite} class={css.row}>
              <span class={css.what}>
                <b>{s.people.ending(invite.invite)}</b>
                <span>{s.people.runsOut(invite.expires)}</span>
              </span>
              {/* Two sets of links for one place. Both are always drawn there, one of them unseen,
                  so the place is as large as the larger and nothing beside it moves at the tap. */}
              <span class={css.slot}>
                <span class={cx(links.links, taking === invite.invite && css.off)}>{links3(invite)}</span>
                <span class={cx(links.links, taking !== invite.invite && css.off)}>{links2(invite)}</span>
              </span>
            </div>
          ))}
        </Fold>
      )}
      {/* What a tap did is said under the rows, so no row moves under the finger that tapped it.
          The region is always there, so a screen reader hears what arrives in it. */}
      <Fold key="said" role="status">
        {said && <p class={css.note}>{said}</p>}
      </Fold>
    </Panel>
  );
}

/**
 * Who can invite, decided by the owner. The owner first, then each admin with the way back to
 * member; that can be taken back for as long as any Undo lasts, so it is done at once. Then the
 * one field that makes an admin of someone who has an account here.
 */
export function AdminsPanel({ admins }: { admins: Admins }) {
  const list = admins.list.value;
  const [said, setSaid] = useState('');
  const [lowered, setLowered] = useState<string | null>(null);
  useEffect(() => void admins.refresh(), []);
  useEffect(() => {
    if (!lowered) return;
    const timer = setTimeout(() => setLowered(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [lowered]);

  const lower = async (username: string) => {
    const result = await admins.lower(username);
    setSaid(result.ok ? '' : result.error === 'unknown' ? s.people.goneName(username) : why(result.error, s.people.adminErrors));
    setLowered(result.ok ? username : null);
  };
  const raise = async (username: string) => {
    const result = await admins.raise(username);
    setSaid(result.ok ? '' : result.error === 'unknown' ? s.people.unknownName : why(result.error, s.people.adminErrors));
    return result.ok;
  };
  const submit = async (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem('admin') as HTMLInputElement;
    const username = field.value.trim();
    if (username && (await raise(username))) field.value = '';
  };

  return (
    <Panel title={s.people.admins}>
      <p key="note" class={css.note}>
        {s.people.decide}
      </p>
      {list && (
        <Fold key="rows" list class={css.rows}>
          {list.map((one) => (
            <div key={one.username} class={css.row}>
              <span class={css.who}>
                <Person name={one.username} />
                <span>{one.role === 'owner' ? s.people.owner : s.people.admin}</span>
              </span>
              {one.role === 'admin' && (
                <Button kind="link" aria-label={s.people.lowerLabel(one.username)} onClick={() => lower(one.username)}>
                  {s.people.lower}
                </Button>
              )}
            </div>
          ))}
        </Fold>
      )}
      {lowered && (
        <p key="undo" class={css.undo} role="status">
          {s.people.lowered(lowered)}
          <Button
            kind="link"
            onClick={() => {
              void raise(lowered);
              setLowered(null);
            }}
          >
            {s.today.undo}
          </Button>
        </p>
      )}
      <form key="raise" class={css.raise} onSubmit={submit}>
        <Field label={s.people.username} hint={s.people.usernameHint} name="admin" required autocomplete="off" autocapitalize="none" spellcheck={false} />
        <Button type="submit">{s.people.raise}</Button>
      </form>
      <Fold key="said" role="alert">
        {said && <p>{said}</p>}
      </Fold>
    </Panel>
  );
}
