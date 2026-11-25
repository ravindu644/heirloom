import { useEffect, useRef, useState } from 'preact/hooks';
import type { Engine } from '../sync/engine.ts';
import type { Settings as SettingsData, SettingsView } from '../sync/settings.ts';
import { Button } from './kit/button.tsx';
import form from './kit/form.module.css';
import links from './kit/links.module.css';
import { Panel } from './kit/panel.tsx';
import { Person } from './kit/person.tsx';
import { Stepper } from './kit/stepper.tsx';
import { Switch } from './kit/switch.tsx';
import { useWide } from './kit/wide.ts';
import css from './settings.module.css';
import * as s from './strings.ts';

const MIN = 60000;
// The schema allows a lap of a whole day. These are where a stepper stops being the way to get there.
const LENGTH_MAX = { work_ms: 180, short_ms: 60, long_ms: 60 };
// More laps than this in a day target and its bar would be dust.
const TARGET_MAX = 24;

/**
 * Reached from the person, not from the five destinations: the account, then everything that is
 * a choice. Each change is saved as it is made, and reaches the person's other devices, except
 * "ring here", which is this device's own.
 */
export function Settings({ engine, settings, canSave = true, onSignIn }: { engine: Engine; settings: SettingsData; canSave?: boolean; onSignIn: () => void }) {
  const account = engine.account.value;
  const sync = engine.sync.value;
  const unsent = engine.unsent.value;
  const server = new URL(engine.server, location.origin).host;
  const all = settings.all.value;
  const two = useWide();
  const [refusal, setRefusal] = useState('');
  const [copy, setCopy] = useState('');
  const file = useRef<HTMLInputElement>(null);
  // Why a sign out was refused is true only until something changes: the edits go out, or the connection does.
  const sent = unsent === 0;
  useEffect(() => setRefusal(''), [sync, sent]);
  if (!account) return null;

  const signOut = async () => {
    const result = await engine.signOut();
    // Signed out, the address must not stay on Settings: the next sign in opens on Focus.
    if (result.ok) location.replace('#/focus');
    setRefusal(result.ok ? '' : result.error === 'unsent' ? s.status.signOutUnsent(engine.unsent.value, s.device()) : s.status.signOutFailed);
  };
  const refused = sync === 'signed-out';

  const length = (field: keyof typeof LENGTH_MAX, name: string) => {
    const minutes = Math.round(all[field] / MIN);
    const to = (next: number) => settings.set({ [field]: Math.min(LENGTH_MAX[field], Math.max(1, next)) * MIN } as Partial<SettingsView>);
    return (
      <fieldset class={form.group}>
        <legend>{name}</legend>
        <Stepper
          text={s.settings.minutes(minutes)}
          less={s.settings.less(name)}
          more={s.settings.more(name)}
          onLess={() => to(minutes - 1)}
          onMore={() => to(minutes + 1)}
          typed={{ value: minutes, min: 1, max: LENGTH_MAX[field], label: name, onSet: to }}
        />
      </fieldset>
    );
  };

  // A copy to keep: the browser saves it as a file named for the day.
  const save = () => {
    const name = s.settings.file(new Date().toLocaleDateString('en-CA'));
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([settings.exportAll()], { type: 'application/json' })), download: name });
    link.click();
    URL.revokeObjectURL(link.href);
    setCopy(s.settings.exported(name));
  };
  const bring = async (chosen: File | undefined) => {
    if (!chosen) return;
    const result = settings.importAll(await chosen.text());
    setCopy(result.ok ? s.settings.imported(result.cells) : s.settings.importErrors[result.error]);
    // The same file chosen again is a choice again.
    file.current!.value = '';
  };

  const accountPanel = (
    <Panel title={s.settings.account}>
      <Person name={account.username} />
      <p>{refused ? s.settings.refused(s.device(), server) : s.settings.where(s.device(), server)}</p>
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
  );

  // What tunes the timer.
  const timer = (
    <>
      <Panel title={s.settings.lengths}>
        {length('work_ms', s.settings.lap)}
        {length('short_ms', s.settings.short)}
        {length('long_ms', s.settings.long)}
      </Panel>

      <Panel title={s.settings.target}>
        <Stepper
          text={s.settings.targetText(all.day_target)}
          less={s.settings.targetLess}
          more={s.settings.targetMore}
          onLess={() => settings.set({ day_target: Math.max(0, all.day_target - 1) })}
          onMore={() => settings.set({ day_target: Math.min(TARGET_MAX, all.day_target + 1) })}
        />
      </Panel>

      <Panel title={s.settings.auto}>
        <Switch label={s.settings.autoBreak} on={all.auto_break} onChange={(auto_break) => settings.set({ auto_break })} />
        <Switch label={s.settings.autoWork} on={all.auto_work} onChange={(auto_work) => settings.set({ auto_work })} />
        <p class={css.note}>{s.settings.autoNote}</p>
      </Panel>

      <Panel title={s.settings.bell}>
        <Switch label={s.settings.ringHere(s.device())} note={s.settings.ringHereNote(s.device())} on={settings.ringHere.value} onChange={(ring) => settings.setRingHere(ring)} />
      </Panel>

      <Panel title={s.settings.finish}>
        <Switch label={s.settings.celebrate} note={s.settings.celebrateNote} on={all.celebrate} onChange={(celebrate) => settings.set({ celebrate })} />
      </Panel>
    </>
  );

  // The rooms, and the person's own copy.
  const rest = (
    <>
      <Panel title={s.settings.rooms}>
        <Switch label={s.settings.shareTask} note={s.settings.shareTaskNote} on={all.share_task} onChange={(share_task) => settings.set({ share_task })} />
        <Switch label={s.settings.hideRooms} note={s.settings.hideRoomsNote} on={all.rooms_hidden} onChange={(rooms_hidden) => settings.set({ rooms_hidden })} />
      </Panel>

      <Panel title={s.settings.copy}>
        <p class={css.note}>
          {s.settings.copyNote} {s.settings.importNote}
        </p>
        {/* Where a file cannot be saved (the phone app), the screen says where one can, and never "Saved". */}
        {!canSave && <p>{s.settings.exportElsewhere(server)}</p>}
        <div class={css.actions}>
          {canSave && <Button onClick={save}>{s.settings.export}</Button>}
          <Button kind="quiet" onClick={() => file.current!.click()}>
            {s.settings.import}
          </Button>
        </div>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(event) => bring(event.currentTarget.files?.[0])} />
        <p role="status">{copy}</p>
      </Panel>
    </>
  );

  return (
    <div class={css.settings}>
      <header>
        <h1>{s.settings.title}</h1>
        <Button kind="link" class={links.end} onClick={() => history.back()}>
          {s.settings.back}
        </Button>
      </header>
      {/* On a phone the account comes first. With two columns the timer's settings are on the left
          and the account, the rooms and the copy on the right, and the page is written in that order. */}
      {two ? (
        <div class={css.cols}>
          <div class={css.col}>{timer}</div>
          <div class={css.col}>
            {accountPanel}
            {rest}
          </div>
        </div>
      ) : (
        <>
          {accountPanel}
          {timer}
          {rest}
        </>
      )}
    </div>
  );
}
