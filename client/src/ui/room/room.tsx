import type { ComponentChildren, TargetedSubmitEvent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Engine } from '../../sync/engine.ts';
import type { MemberView, RoomResult, RoomView, Rooms } from '../../sync/rooms.ts';
import { Button } from '../kit/button.tsx';
import { copyText } from '../kit/copy.ts';
import { cx } from '../kit/cx.ts';
import { Field } from '../kit/field.tsx';
import form from '../kit/form.module.css';
import links from '../kit/links.module.css';
import { Panel } from '../kit/panel.tsx';
import { Person } from '../kit/person.tsx';
import { Fold, Kept } from '../kit/fold.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { Switch } from '../kit/switch.tsx';
import * as s from '../strings.ts';
import css from './room.module.css';

const HOUR = 3600000;
// A week has 168 hours and a room 8 people; more than this together is nobody's target.
const TARGET_MAX = 200;

const why = (result: RoomResult) => (result.ok ? '' : (s.room.errors[result.error] ?? s.room.failed));

// In a sheet, which is a surface already, a door is a named group and not one more panel.
function Group({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section class={form.group} aria-label={title}>
      <h3 class={css.legend}>{title}</h3>
      {children}
    </section>
  );
}

/** The two ways into a room: make one, or join one with a friend's code. Both need a connection, and say so. */
function Doors({ rooms, onIn, inSheet }: { rooms: Rooms; onIn: (room?: string) => void; inSheet?: boolean }) {
  const Door = inSheet ? Group : Panel;
  const [refused, setRefused] = useState({ make: '', join: '' });
  const go = (door: 'make' | 'join') => async (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typed = (event.currentTarget.elements.namedItem(door) as HTMLInputElement).value.trim();
    if (!typed) return;
    // A code read out over the phone comes with spaces and in small letters.
    const result = await (door === 'make' ? rooms.create(typed) : rooms.join(typed.replace(/\s/g, '').toUpperCase()));
    setRefused({ make: '', join: '', [door]: why(result) });
    if (result.ok) onIn(result.room);
  };
  return (
    <div class={css.doors}>
      <Door title={s.room.make}>
        <form class={css.door} onSubmit={go('make')}>
          <Field label={s.room.name} name="make" maxLength={40} required autocomplete="off" />
          {/* Why not opens in place under the button it answers; the region is always there. */}
          <div class={css.go}>
            <Button type="submit">{s.room.makeGo}</Button>
            <Fold role="alert">{refused.make && <p class={css.told}>{refused.make}</p>}</Fold>
          </div>
        </form>
      </Door>
      <Door title={s.room.join}>
        <form class={css.door} onSubmit={go('join')}>
          <Field label={s.room.code} name="join" required autocomplete="off" autocapitalize="characters" spellcheck={false} />
          <div class={css.go}>
            <Button type="submit">{s.room.joinGo}</Button>
            <Fold role="alert">{refused.join && <p class={css.told}>{refused.join}</p>}</Fold>
          </div>
        </form>
      </Door>
    </div>
  );
}

/** The room's own settings: its name, what it fills in a week, its order, the code to share, and the way out. */
function RoomSheet({ room, rooms, onClose }: { room: RoomView; rooms: Rooms; onClose: () => void }) {
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const [leaving, setLeaving] = useState(false);
  const hours = Math.round(room.target_ms / HOUR);
  const change = async (fields: Parameters<Rooms['update']>[1]) => setSaid(why(await rooms.update(room.id, fields)));
  const copy = async () => setCopied((await copyText(room.code)) ? s.room.copied : s.room.copyFailed);

  return (
    <Sheet grows title={s.room.sheet} close={s.task.close} onClose={onClose}>
      <section class={form.group} aria-label={s.room.codeTitle}>
        <h3 class={css.legend}>{s.room.codeTitle}</h3>
        {/* Two groups of four: easier to read out, and to hear. */}
        <p class={css.code}>
          {room.code.slice(0, 4)} {room.code.slice(4)}
        </p>
        <p class={css.quiet}>{s.room.codeNote}</p>
        <div>
          <div class={form.ends}>
            <Button onClick={() => copy()}>{s.room.copy}</Button>
          </div>
          <Fold role="status">{copied && <p class={cx(css.quiet, css.told)}>{copied}</p>}</Fold>
        </div>
      </section>

      <form
        class={css.rename}
        onSubmit={(event) => {
          event.preventDefault();
          const name = (event.currentTarget.elements.namedItem('name') as HTMLInputElement).value.trim();
          if (name && name !== room.name) void change({ name });
        }}
      >
        <Field label={s.room.name} name="name" maxLength={40} required autocomplete="off" defaultValue={room.name} />
        <Button type="submit">{s.room.renameGo}</Button>
      </form>

      <fieldset class={form.group}>
        <legend>{s.room.target}</legend>
        <Stepper
          text={s.room.hours(hours)}
          less={s.room.targetLess}
          more={s.room.targetMore}
          onLess={() => change({ target_ms: Math.max(0, hours - 1) * HOUR })}
          onMore={() => change({ target_ms: Math.min(TARGET_MAX, hours + 1) * HOUR })}
          typed={{ value: hours, min: 0, max: TARGET_MAX, label: s.room.target, onSet: (value) => change({ target_ms: value * HOUR }) }}
        />
      </fieldset>

      <div>
        <Switch label={s.room.ranked} note={s.room.rankedNote} on={room.ranked} onChange={(ranked) => change({ ranked })} />
        <Fold role="alert">{said && <p class={css.told}>{said}</p>}</Fold>
      </div>

      {/* Leaving cannot be undone from here, and the last one out ends the room: it takes a second tap, in the page, not in a box. */}
      <Fold>
      {leaving ? (
        <div key="leaving" class={form.group}>
          <p>{s.room.leaveNote(room.members.length === 1)}</p>
          <div class={form.ends}>
            <Button
              onClick={async () => {
                const result = await rooms.leave(room.id);
                if (result.ok) onClose();
                else setSaid(why(result));
              }}
            >
              {s.room.leaveGo}
            </Button>
            <Button kind="quiet" onClick={() => setLeaving(false)}>
              {s.room.stay}
            </Button>
          </div>
        </div>
      ) : (
        <div key="leave" class={form.ends}>
          <Button kind="quiet" onClick={() => setLeaving(true)}>
            {s.room.leave}
          </Button>
        </div>
      )}
      </Fold>
    </Sheet>
  );
}

const phase = (m: MemberView) =>
  m.away
    ? s.room.away
    : m.phase === 'idle'
      ? s.room.idle
      : m.phase === 'work'
        ? (m.paused ? s.room.paused : s.room.focusing)(m.lap)
        : m.paused
          ? s.room.breakPaused
          : m.phase === 'long'
            ? s.room.longBreak
            : s.room.shortBreak;

/**
 * Friends, side by side. Who is on a lap, the phase and the time left; what each did today and
 * this week; the week the room fills together; and one tap to cheer a lap that rang. Never a
 * ranking unless the room itself has switched one on.
 */
export function RoomScreen({ engine, rooms }: { engine: Engine; rooms: Rooms }) {
  const list = rooms.list.value;
  const stale = rooms.stale.value;
  const [at, setAt] = useState<string | undefined>();
  const [sheet, setSheet] = useState<'room' | 'another' | null>(null);
  const room = list.find((one) => one.id === at) ?? list[0];

  // Time left moves by itself, once a second, while anybody's clock runs.
  // ponytail: not lined up with the second; a figure may turn up to a second late.
  const [, tick] = useState(0);
  const running = room?.members.some((m) => m.ends_at !== null) ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  if (rooms.hidden.value)
    return (
      <div class={css.room}>
        <header class={css.head}>
          <p>{s.nav.room}</p>
          <h1>{s.room.hidden}</h1>
        </header>
        <a class={css.link} href="#/settings">
          {s.room.unhide}
        </a>
      </div>
    );

  if (!room)
    return (
      <div class={css.room}>
        <header class={css.head}>
          <p>{s.nav.room}</p>
          <h1>{s.room.noRoom}</h1>
        </header>
        <p class={css.quiet}>{s.room.about}</p>
        {stale && (
          <p class={css.quiet} role="status">
            {s.room.needsConnection}
          </p>
        )}
        <Doors rooms={rooms} onIn={setAt} />
      </div>
    );

  const now = engine.now();
  const me = room.members.find((m) => m.you)?.id;
  const scale = Math.max(room.target_ms, room.week_ms, 1);

  return (
    <div class={css.room}>
      <header class={css.head}>
        {/* The room's own settings: a link at the end of the line that names it. */}
        <p>
          <span>{s.room.label(room.name)}</span>
          <Button kind="link" class={links.end} onClick={() => setSheet('room')}>
            {s.room.open}
          </Button>
        </p>
        {/* Old news is never said in the present. */}
        <h1>{(stale ? s.room.findingStale : s.room.finding)(room.members.length, room.members.filter((m) => m.phase === 'work' && !m.paused).length)}</h1>
      </header>
      {/* More than one room: they are chosen between here, not in the navigation. */}
      {list.length > 1 && (
        <div class={form.choices} role="group" aria-label={s.room.rooms}>
          {list.map((one) => (
            <button key={one.id} type="button" class={cx(form.choice, css.pick)} aria-pressed={one.id === room.id} onClick={() => setAt(one.id)}>
              {one.name}
            </button>
          ))}
        </div>
      )}

      <section class={css.week} aria-label={s.room.week}>
        {/* One lane, everyone's week end to end in the order of the room: yours in you, the others in ink. */}
        <div class={css.bar} role="img" aria-label={room.members.map((m) => s.room.share(m.you ? s.room.you : m.name, m.week_ms)).join(', ')}>
          {room.members
            .filter((m) => m.week_ms > 0)
            .map((m) => (
              <i key={m.id} class={m.you ? css.mine : undefined} style={`width:${(m.week_ms / scale) * 100}%`} />
            ))}
        </div>
        <p>{s.room.weekAt(room.week_ms, room.target_ms)}</p>
      </section>

      {/* A lane comes and goes with its member, and inside a lane a line or the button does, in time. */}
      <Fold class={css.members} gap="sm" role="region" aria-label={s.room.members}>
        {room.members.map((m) => {
          const who = m.last?.cheerers.map((cheerer) => (cheerer.id === me ? s.room.you : cheerer.name)) ?? [];
          return (
            <article key={m.id} class={cx(css.member, m.you && css.you)}>
              <Fold class={css.lane} gap="xs">
              <div key="who" class={css.who}>
                <Person name={m.name} label={m.you ? s.room.you : undefined} />
                {/* With no connection nothing counts down for anyone but you: your own clock is on this device. */}
                {m.ends_at !== null && (m.you || !stale) && (
                  <b class={m.phase === 'work' ? undefined : css.rest} aria-label={s.room.left(m.ends_at - now)}>
                    {s.clock(Math.max(0, m.ends_at - now))}
                  </b>
                )}
              </div>
              <p key="phase" class={css.phase}>
                {phase(m)}
              </p>
              {/* From outside, not sharing and no task look the same. Your own lane knows which it is. */}
              {m.phase === 'work' && (m.task || !m.you || !rooms.shareTask.value) && (
                <p key="task" class={m.task ? css.task : css.quiet}>
                  {m.task ?? (m.you ? s.room.yoursHidden : s.room.notSharing)}
                </p>
              )}
              <p key="totals" class={css.totals}>
                {s.room.totals(m.today_ms, m.today_laps, m.week_ms)}
              </p>
              {who.length > 0 && (
                <p key="cheered" class={css.totals}>
                  {s.room.cheeredBy(who, m.you)}
                </p>
              )}
              {/* A lap that rang today can be cheered, once, and never one's own. Once cheered the
                  button goes: the sentence above says who did. */}
              {m.last && !m.you && !m.last.cheered && (
                <div key="cheer" class={css.foot}>
                  <Button aria-label={s.room.cheerLabel(m.name, m.last.ended)} onClick={() => rooms.cheer(room.id, m.id)}>
                    {s.room.cheer}
                  </Button>
                </div>
              )}
              </Fold>
            </article>
          );
        })}
      </Fold>

      <Button kind="link" class={css.link} onClick={() => setSheet('another')}>
        {s.room.another}
      </Button>

      <Kept>
      {sheet === 'room' && <RoomSheet room={room} rooms={rooms} onClose={() => setSheet(null)} />}
      {sheet === 'another' && (
        <Sheet key="another" title={s.room.anotherTitle} close={s.task.close} onClose={() => setSheet(null)}>
          <Doors
            inSheet
            rooms={rooms}
            onIn={(id) => {
              setAt(id);
              setSheet(null);
            }}
          />
        </Sheet>
      )}
      </Kept>
    </div>
  );
}
