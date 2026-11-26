import { Fragment } from 'preact';
import type { ComponentChildren, TargetedSubmitEvent } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { addDays, mondayOf } from '../../core/progress.ts';
import { localDay } from '../../core/stats.ts';
import { view } from '../../core/timer.ts';
import type { WeekRace } from '../../sync/progress.ts';
import type { Engine } from '../../sync/engine.ts';
import type { MemberView, RoomResult, RoomView, Rooms } from '../../sync/rooms.ts';
import { Button } from '../kit/button.tsx';
import { copyText } from '../kit/copy.ts';
import { cx } from '../kit/cx.ts';
import { Field } from '../kit/field.tsx';
import form from '../kit/form.module.css';
import links from '../kit/links.module.css';
import { Panel } from '../kit/panel.tsx';
import { Face, Person } from '../kit/person.tsx';
import { useUnderSaid } from '../kit/said.tsx';
import add from '../kit/quick-add.module.css';
import { Tabs, tabPanel } from '../kit/tabs.tsx';
import { Hours, Lane, Mark } from '../kit/track.tsx';
import type { Window } from '../kit/track.tsx';
import { WeekChart } from '../kit/week.tsx';
import { useSidebar } from '../kit/wide.ts';
import { Fold, Kept } from '../kit/fold.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { Switch } from '../kit/switch.tsx';
import { Twice } from '../kit/twice.tsx';
import * as s from '../strings.ts';
import css from './room.module.css';

const MIN = 60000;
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
    // "Full" has two causes and each gets its own sentence: this person's five rooms, or that room's eight people.
    setRefused({ make: '', join: '', [door]: !result.ok && result.error === 'full' && rooms.list.value.length >= 5 ? s.room.tooMany : why(result) });
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
function RoomSheet({ room, rooms, pictures, onClose }: { room: RoomView; rooms: Rooms; pictures: Record<string, string>; onClose: () => void }) {
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [renamed, setRenamed] = useState(false);
  const hours = Math.round(room.target_ms / HOUR);
  const change = async (fields: Parameters<Rooms['update']>[1]) => setSaid(why(await rooms.update(room.id, fields)));
  const copy = async () => setCopied((await copyText(room.code)) ? s.room.copied : s.room.copyFailed);
  // The name, the target and the order are the keeper's to change; `youKeep` is also true where
  // an older server names no keeper, and everyone has the controls, as before.
  const keeps = room.youKeep;

  return (
    <Sheet grows title={s.room.sheet} close={s.task.close} onClose={onClose}>
      {/* Nothing here is this person's alone. */}
      {keeps && <p class={css.quiet}>{s.room.forAll}</p>}
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

      {keeps ? (
        <>
      <form
        class={css.rename}
        onSubmit={(event) => {
          event.preventDefault();
          const name = (event.currentTarget.elements.namedItem('name') as HTMLInputElement).value.trim();
          // A rename is said: it changed the room's name for everyone in it.
          if (name && name !== room.name) void rooms.update(room.id, { name }).then((result) => (result.ok ? (setSaid(''), setRenamed(true)) : (setRenamed(false), setSaid(why(result)))));
        }}
      >
        <Field label={s.room.name} name="name" maxLength={40} required autocomplete="off" defaultValue={room.name} />
        <div class={css.go}>
          <Button type="submit">{s.room.renameGo}</Button>
          <Fold role="status">{renamed && <p class={cx(css.quiet, css.told)}>{s.room.renamed}</p>}</Fold>
        </div>
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
        </>
      ) : (
        // To anyone but the keeper the same three, as words, and who can change them.
        <div class={form.group}>
          <dl class={css.values}>
            <div>
              <dt>{s.room.name}</dt>
              <dd>{room.name}</dd>
            </div>
            <div>
              <dt>{s.room.target}</dt>
              <dd>{s.room.targetSaid(hours)}</dd>
            </div>
            <div>
              <dt>{s.room.ranked}</dt>
              <dd>{s.room.rankedSaid(room.ranked)}</dd>
            </div>
          </dl>
          <p class={css.quiet}>{s.room.onlyKeeper(room.keeper)}</p>
          <Fold role="alert">{said && <p class={css.told}>{said}</p>}</Fold>
        </div>
      )}

      {/* The keeper's way to take someone out: a member at a time, asked twice, as anything that cannot be taken back. */}
      {room.youKeep && room.keeper && room.members.length > 1 && (
        <section class={form.group} aria-label={s.room.whoIsIn}>
          <h3 class={css.legend}>{s.room.whoIsIn}</h3>
          <p class={css.quiet}>{s.room.removeNote}</p>
          <ul class={css.out}>
            {room.members
              .filter((m) => !m.you)
              .map((m) => (
                <li key={m.id}>
                  <Person name={m.name} picture={pictures[m.picture ?? '']} />
                  <Twice words={s.room.remove} ask={s.room.removeAsk(m.name)} onDo={async () => setSaid(why(await rooms.remove(room.id, m.id)))} />
                </li>
              ))}
          </ul>
        </section>
      )}

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
        ? m.paused
          ? s.room.paused
          : s.room.focusing
        : m.paused
          ? s.room.breakPaused
          : m.phase === 'long'
            ? s.room.longBreak
            : s.room.shortBreak;

// The stretch of the day the lanes show: a phone's four hours with now five eighths across, a
// laptop's 08:00 to 20:00 (a phone's stretch outside those hours).
function stretch(now: number, wide: boolean): Window {
  if (wide) {
    const day = new Date(now);
    const from = day.setHours(8, 0, 0, 0);
    const to = day.setHours(20, 0, 0, 0);
    if (now > from && now < to) return { from, to };
  }
  return { from: now - 2.5 * HOUR, to: now + 1.5 * HOUR };
}

// A member's laps today, start to end in server ms, and the one in progress as far as now.
// ponytail: a paused lap is drawn to now as well; the moment it paused is not in the room message.
const lapsOf = (m: MemberView, now: number) => [...m.laps.map(([start, end]) => ({ start, end })), ...(m.runStart !== null ? [{ start: m.runStart, end: now }] : [])];

/** Each picture of the room as a URL an `img` shows, by hash, once the core has it. */
function usePictures(rooms: Rooms, hashes: (string | null)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const wanted = [...new Set(hashes.filter((hash): hash is string => !!hash))].sort().join(' ');
  useEffect(() => {
    let gone = false;
    for (const hash of wanted ? wanted.split(' ') : []) void rooms.picture(hash).then((url) => !gone && url && setUrls((was) => (was[hash] === url ? was : { ...was, [hash]: url })));
    return () => void (gone = true);
  }, [wanted]);
  return urls;
}

// A lap is called for a whole minute, 1 to 30 minutes ahead (protocol section 15). The first
// choice is the first whole minute at least a minute away, the next ones a minute apart each,
// so the 29th is still inside thirty minutes: `minutes` is how far off it is, at least.
const callAt = (now: number, minutes: number) => Math.ceil((now + MIN) / MIN) * MIN + (minutes - 1) * MIN;
const CALL_MAX = 29;

/** Calling a lap: how many minutes from now, with the time it starts, and the call. Small, in place, closed by Not now. */
function Caller({ rooms, room, now, onDone }: { rooms: Rooms; room: string; now: () => number; onDone: () => void }) {
  const [minutes, setMinutes] = useState(5);
  const [refused, setRefused] = useState('');
  return (
    <div class={form.group}>
      <span class={css.legend}>{s.room.callWhen}</span>
      <Stepper
        text={s.room.callIn(minutes, callAt(now(), minutes))}
        less={s.room.callLess}
        more={s.room.callMore}
        onLess={() => setMinutes(Math.max(1, minutes - 1))}
        onMore={() => setMinutes(Math.min(CALL_MAX, minutes + 1))}
        floor={minutes <= 1}
        top={minutes >= CALL_MAX}
      />
      <div class={form.ends}>
        <Button
          onClick={async () => {
            // The minute as it is at the tap, not as the screen last drew it.
            const result = await rooms.callLap(room, callAt(now(), minutes));
            setRefused(result.ok ? '' : (s.room.callErrors[result.error] ?? why(result)));
            if (result.ok) onDone();
          }}
        >
          {s.room.callGo}
        </Button>
        <Button kind="quiet" onClick={onDone}>
          {s.room.notNow}
        </Button>
      </div>
      <Fold role="alert">{refused && <p class={css.told}>{refused}</p>}</Fold>
    </div>
  );
}

/** The call's band: on a phone it is docked at the foot of the screen, and the bar that says what a tap did rises over it. */
function Docked({ class: extra, children }: { class?: string; children: ComponentChildren }) {
  const band = useRef<HTMLElement>(null);
  useUnderSaid(band);
  return (
    <section ref={band} class={extra}>
      {children}
    </section>
  );
}

/**
 * Friends, side by side: the line that names the room, the finding, a call to start together,
 * and three tabs: People on a track of the day's hours, Notes read on a break, and the Week the
 * room fills together. Never a ranking unless the room itself has switched one on.
 */
export function RoomScreen({ engine, rooms }: { engine: Engine; rooms: Rooms }) {
  const list = rooms.list.value;
  const stale = rooms.stale.value;
  const [at, setAt] = useState<string | undefined>();
  const [sheet, setSheet] = useState<'room' | 'another' | null>(null);
  const [tab, setTab] = useState<'people' | 'notes' | 'week'>('people');
  const [calling, setCalling] = useState(false);
  const wide = useSidebar();
  const base = useId();
  const room = list.find((one) => one.id === at) ?? list[0];
  const pictures = usePictures(rooms, [...(room?.members.map((m) => m.picture) ?? []), ...(room?.notes.map((note) => note.picture) ?? [])]);

  // Time left, a call's count down and the hours move by themselves, once a second while
  // anybody's clock runs or a call is open, and once a minute otherwise.
  // ponytail: not lined up with the second; a figure may turn up to a second late.
  const [, tick] = useState(0);
  const running = (room?.members.some((m) => m.ends_at !== null) ?? false) || !!room?.call;
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), running ? 1000 : MIN);
    return () => clearInterval(timer);
  }, [running]);

  // On a lap of your own, notes fold away; open on a break, what was waiting is read.
  const now = engine.now();
  const timer = engine.timer.value;
  const lap = timer.phase === 'work' ? view(timer, now) : null;
  const onLap = !!lap && !lap.over;
  const reading = !!room && tab === 'notes' && !onLap;
  // The notes that were new when Notes was opened stay marked as new while it is open.
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    if (!reading || !room) return;
    setFresh(room.newNotes);
    rooms.markNotesRead(room.id);
    // Again for a note that arrives while Notes is open: it is read as it is shown.
  }, [reading, room?.id, room?.notes[0]?.id]);

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

  const me = room.members.find((m) => m.you);
  const w = stretch(now, wide);
  const call = room.call;
  const together = timer.run?.startsWith('call-') && onLap && timer.started !== null ? timer.started : null;
  const face = (name: string, picture: string | null, size?: 'sm' | 'lg') => <Face name={name} picture={pictures[picture ?? '']} size={size} />;

  const callStrip = call && call.at > now && (
    <Docked class={css.call}>
      <h2 class="sr">{s.room.calledLap}</h2>
      <div class={css.callWords}>
        <p>
          <b>{s.room.hour(call.at)}</b> <span>{s.room.calls(call.by.name, call.yours)}</span>
        </p>
        <p class={css.callIn}>
          <span class={css.faces}>{call.in.map((one) => <Fragment key={one.id}>{face(one.name, room.members.find((m) => m.id === one.id)?.picture ?? null, 'sm')}</Fragment>)}</span>
          <span>{s.room.startsIn(call.at - now, call.in.map((one) => ({ name: one.name, you: one.id === me?.id })))}</span>
        </p>
      </div>
      {call.yours ? (
        <Button kind="quiet" onClick={() => void rooms.callLap(room.id, null)}>
          {s.room.callOff}
        </Button>
      ) : call.you ? (
        <Button kind="quiet" onClick={() => void rooms.setIn(room.id, call.id, false)}>
          {s.room.imOut}
        </Button>
      ) : (
        <Button kind="primary" onClick={() => void rooms.setIn(room.id, call.id, true)}>
          {s.room.imIn}
        </Button>
      )}
    </Docked>
  );

  // People: the hours, then a lane each, in the order the room gives.
  const callFaces = (m: MemberView) =>
    call && call.at > now && call.in.some((one) => one.id === m.id) && (
      <Mark window={w} at={call.at}>
        {face(m.name, m.picture, 'sm')}
      </Mark>
    );
  const cheer = (m: MemberView) =>
    m.last &&
    !m.you &&
    !m.last.cheered && (
      <Button aria-label={s.room.cheerLabel(m.name, m.last.ended)} onClick={() => rooms.cheer(room.id, m.id)}>
        {s.room.cheer}
      </Button>
    );
  const left = (m: MemberView) =>
    m.ends_at !== null &&
    (m.you || !stale) && (
      <b class={cx(css.left, m.phase !== 'work' && css.rest)} aria-label={s.room.left(m.ends_at - now)}>
        {s.clock(Math.max(0, m.ends_at - now))}
      </b>
    );
  const task = (m: MemberView) =>
    m.phase === 'work' && (m.task || !m.you || !rooms.shareTask.value) ? <p class={m.task ? css.task : css.quiet}>{m.task ?? (m.you ? s.room.yoursHidden : s.room.notSharing)}</p> : null;
  const cheered = (m: MemberView) => {
    const who = m.last?.cheerers.map((one) => (one.id === me?.id ? s.room.you : one.name)) ?? [];
    return who.length > 0 && <p class={css.small}>{s.room.cheeredBy(who, m.you)}</p>;
  };
  const named = (m: MemberView) => (
    <p class={css.name}>
      <b>{m.you ? s.room.you : m.name}</b> <span>{phase(m)}</span>
    </p>
  );

  const people = (
    <section class={css.track} aria-label={s.room.members}>
      {wide ? (
        <div class={css.wideRow}>
          <span />
          <span />
          <Hours window={w} now={now} step={2} hour={s.room.hour} nowWord={s.room.now} />
          <span />
        </div>
      ) : (
        <Hours window={w} now={now} hour={s.room.hour} nowWord={s.room.now} />
      )}
      <Fold list gap="xs" class={css.rows}>
        {room.members.map((m) =>
          wide ? (
            <article key={m.id} class={css.wideRow}>
              <div class={css.who}>
                {face(m.name, m.picture)}
                <div>
                  {named(m)}
                  {task(m)}
                  {cheered(m)}
                </div>
              </div>
              <span>{left(m)}</span>
              <Lane window={w} laps={lapsOf(m, now)} mine={m.you}>
                {callFaces(m)}
              </Lane>
              <div class={css.totals}>
                <p>{s.room.todayOnly(m.today_ms)}</p>
                <p>{s.room.weekOnly(m.week_ms)}</p>
                {cheer(m)}
              </div>
            </article>
          ) : (
            <article key={m.id} class={css.row}>
              <div class={css.head2}>
                {face(m.name, m.picture, 'lg')}
                <div>
                  {named(m)}
                  <p class={css.small}>{s.room.todayWeek(m.today_ms, m.week_ms)}</p>
                </div>
                {left(m)}
              </div>
              <Lane window={w} laps={lapsOf(m, now)} mine={m.you}>
                {callFaces(m)}
              </Lane>
              {(task(m) || cheered(m) || cheer(m)) && (
                <div class={css.foot}>
                  <div>
                    {task(m)}
                    {cheered(m)}
                  </div>
                  {cheer(m)}
                </div>
              )}
            </article>
          ),
        )}
      </Fold>
    </section>
  );

  const notes = onLap ? (
    <section class={css.panel}>
      <p>{s.room.notesFolded(room.newNotes, lap?.ends_at ?? null)}</p>
    </section>
  ) : (
    <section class={css.panel}>
      <NoteField rooms={rooms} room={room.id} />
      <p class={css.small}>{s.room.notesNote}</p>
      {room.notes.length === 0 ? (
        <p class={css.quiet}>{s.room.notesNone}</p>
      ) : (
        <Fold list gap="md" class={css.notes}>
          {room.notes.map((note, i) => (
            <div key={note.id} class={css.note}>
              {face(note.name ?? s.room.noteLeft, note.picture, 'sm')}
              <div>
                <p class={css.small}>
                  <b>{note.you ? s.room.you : (note.name ?? s.room.noteLeft)}</b> {s.room.noteWhen(note.at, now)}
                  {i < fresh && !note.you && `, ${s.room.noteNew}`}
                </p>
                <p>{note.text}</p>
              </div>
            </div>
          ))}
        </Fold>
      )}
    </section>
  );

  const week = <WeekTab room={room} me={me} now={now} />;

  return (
    <div class={css.room}>
      <header class={css.head}>
        {/* The room's own settings: a link at the end of the line that names it. */}
        <p>
          <span>{s.room.keptBy(room.name, room.keeper, room.youKeep)}</span>
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
      {/* A band under the finding with a sidebar; on a phone it stands over the bottom bar. */}
      {callStrip}

      <Tabs
        base={base}
        label={room.name}
        at={tab}
        onChoose={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'people', label: s.room.people },
          { id: 'notes', label: s.room.notes, count: room.newNotes, said: s.room.notesSaid(room.newNotes) },
          { id: 'week', label: s.room.weekTab },
        ]}
      />
      <div {...tabPanel(base, tab)} class={css.tab}>
        {tab === 'people' && (
          <>
            {!call && (
              <Fold>
                {calling ? (
                  <Caller key="caller" rooms={rooms} room={room.id} now={() => engine.now()} onDone={() => setCalling(false)} />
                ) : (
                  <p key="together" class={css.together}>
                    <span>{together !== null && s.room.startedTogether(together)}</span>
                    <Button kind="link" onClick={() => setCalling(true)}>
                      {s.room.callTogether}
                    </Button>
                  </p>
                )}
              </Fold>
            )}
            {people}
          </>
        )}
        {tab === 'notes' && notes}
        {tab === 'week' && week}
      </div>

      <Button kind="link" class={css.link} onClick={() => setSheet('another')}>
        {s.room.another}
      </Button>

      <Kept>
      {sheet === 'room' && <RoomSheet room={room} rooms={rooms} pictures={pictures} onClose={() => setSheet(null)} />}
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

/** One line for the room: kept in the field until the server has it, so nothing typed is lost to a dropped connection. */
function NoteField({ rooms, room }: { rooms: Rooms; room: string }) {
  const [refused, setRefused] = useState('');
  const [typed, setTyped] = useState(false);
  return (
    <div>
      <form
        class={add.add}
        onSubmit={async (event) => {
          event.preventDefault();
          const field = event.currentTarget.elements.namedItem('note') as HTMLInputElement;
          const text = field.value.trim();
          if (!text) return;
          const result = await rooms.addNote(room, text);
          setRefused(result.ok ? '' : (s.room.noteErrors[result.error] ?? why(result)));
          if (!result.ok) return;
          field.value = '';
          setTyped(false);
        }}
      >
        <input name="note" aria-label={s.room.noteField} placeholder={s.room.noteField} maxLength={200} autocomplete="off" enterkeyhint="send" onInput={(event) => setTyped(event.currentTarget.value.trim() !== '')} />
        <Button type="submit" disabled={!typed} onMouseDown={(event) => event.preventDefault()}>
          {s.room.noteGo}
        </Button>
      </form>
      <Fold role="alert">{refused && <p class={css.told}>{refused}</p>}</Fold>
    </div>
  );
}

/** The room against its own last week, its week drawn as Progress draws yours, its streak, and your part in it. */
function WeekTab({ room, me, now }: { room: RoomView; me: MemberView | undefined; now: number }) {
  const today = localDay(now, -new Date(now).getTimezoneOffset());
  const monday = mondayOf(today);
  const w = room.week;
  // Who counts for today's streak: a lap that rang today.
  const ran = room.members.filter((m) => m.last !== null).length;
  const marks = room.streak?.marks ?? [];
  // The last rest day of the streak, by its place counted back from today, the last mark.
  const restBack = marks.length - 1 - marks.lastIndexOf('rest');
  const race: WeekRace | null = w && {
    monday,
    days: w.days.map((ms, i) => ({ day: addDays(monday, i), you_ms: ms, ghost_ms: w.last[i] ?? 0 })),
    you_ms: room.week_ms,
    ghost_now_ms: room.week_ms - (w.ahead_ms ?? 0),
    ghost_total_ms: w.last[6] ?? 0,
    split_ms: w.ahead_ms,
  };
  return (
    <div class={css.week}>
      {w?.ahead_ms != null && <h2 class={css.ahead}>{s.room.ahead(w.ahead_ms)}</h2>}
      <div class={css.weekCols}>
        <section class={css.panel}>
          <h3 class="sr">{s.room.week}</h3>
          <p class={css.figure}>
            <b>{s.total(room.week_ms)}</b> <span>{s.room.togetherOf(room.target_ms)}</span>
          </p>
          {race && (
            <>
              <WeekChart week={race} today={today} target={room.target_ms} label={s.room.chartSaid(room.week_ms, race.ghost_now_ms, race.ghost_total_ms, room.target_ms)} />
              <p class={css.small}>{s.room.chartKey(room.target_ms)}</p>
            </>
          )}
        </section>
        <div class={css.side}>
          {room.streak && (
            <section class={css.panel}>
              <h3 class="sr">{s.room.streakSaid(room.streak.run)}</h3>
              <p class={css.figure} aria-hidden="true">
                <b>{room.streak.run}</b> <span>{s.room.streakDays(room.streak.run)}</span>
              </p>
              <span class={css.dots} aria-hidden="true">
                {marks.map((mark, i) => (
                  <i key={i} class={css[mark]} />
                ))}
              </span>
              <p class={css.small}>
                {restBack < marks.length && restBack > 0 ? `${s.room.restWas(Date.parse(addDays(today, -restBack)))} ` : ''}
                {s.room.todayNeeds(ran, room.members.length)}
              </p>
            </section>
          )}
          {me && (
            <section class={css.panel}>
              <h3 class={css.partTitle}>{s.room.yourPart}</h3>
              <p class={css.part}>
                <b>{s.total(me.week_ms)}</b> <span>{s.room.partOf(room.week_ms)}</span>
              </p>
              <span class={css.share} aria-hidden="true">
                <i style={`width:${room.week_ms > 0 ? (me.week_ms / room.week_ms) * 100 : 0}%`} />
              </span>
              <p class={css.small}>{s.room.partToday(me.last !== null)}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
