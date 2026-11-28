import { useEffect, useState } from 'preact/hooks';
import { addDays } from '../../core/progress.ts';
import type { Moment, Progress, TimelineEntry } from '../../sync/progress.ts';
import { Button } from '../kit/button.tsx';
import { cx } from '../kit/cx.ts';
import { LongField } from '../kit/field.tsx';
import { Fold } from '../kit/fold.tsx';
import { Panel } from '../kit/panel.tsx';
import { say } from '../kit/said.tsx';
import { Lane } from '../kit/track.tsx';
import { useTyped } from '../kit/typed.ts';
import * as s from '../strings.ts';
import css from './day.module.css';

const HOUR = 3600000;
const MIN = 60000;
const NOTE_MAX = 280;
// Under this many characters left, the count shows.
const NOTE_NEAR = 40;
// How many of a day's laps its list shows before it is asked for the rest.
const LATEST = 5;
// The hours over the slivers are named at most this many steps apart, so they fit a phone.
const STEPS = 4;

type Item = TimelineEntry | Moment;
const isMoment = (item: Item): item is Moment => 'at' in item;
const isLap = (item: Item): item is TimelineEntry => item.kind === 'work';
const counts = (lap: TimelineEntry) => lap.outcome !== 'void' || !!lap.live;

// The lap in progress is said as running or paused, whatever the core's outcome for it reads
// meanwhile; one whose bell has gone and whose row is not written yet is a lap like the others.
const kind = (lap: TimelineEntry) =>
  lap.live === 'running' ? s.progress.running : lap.live === 'paused' ? s.progress.paused : lap.outcome === 'void' ? s.progress.aside : lap.outcome === 'stopped' ? s.progress.stopped : s.progress.lap;

/**
 * One day, lap by lap: the day's focus, then one list in the order the day ran. Each lap's row
 * carries its own sliver of the day's hours, with that lap and the break after it, so read down
 * the slivers make the day's lane and it is never drawn twice. At its end the day so far, so the
 * last figure is the one at the top. Tasks done and habits checked in are quiet rows at their
 * time. Then the day's one line.
 */
export function Day({ progress, day, today, onToday }: { progress: Progress; day: string; today: string; onToday: () => void }) {
  const view = progress.day(day);
  const items = view.items;
  const isToday = day === today;
  // The earlier laps are open for the day they were asked for, and folded again on another.
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [day]);

  // The day's stretch: whole hours around what ran, at least four, and never past the day's own
  // midnights: a lap from 23:46 to 00:31 is drawn on each day only as far as it ran in it. At
  // most four steps between named hours, and the stretch a whole number of them, so the last
  // name stands at its end. Counted from the day's midnight, the hours are whole on the wall,
  // which they are not in UTC everywhere: Sri Lanka is half an hour off.
  const start = new Date(`${day}T00:00:00`).getTime();
  const end = new Date(`${addDays(day, 1)}T00:00:00`).getTime();
  const within = (ms: number) => Math.min(end, Math.max(start, ms));
  const hour = (ms: number, round: (n: number) => number) => start + round((within(ms) - start) / HOUR) * HOUR;
  const sessions = items.filter((item): item is TimelineEntry => !isMoment(item));
  // The earliest start of them all: the lap in progress is listed last, whenever it began.
  const first = hour(Math.min(...sessions.map((entry) => entry.started)), Math.floor);
  const last = Math.max(first + 4 * HOUR, ...sessions.map((entry) => hour(entry.ended, Math.ceil)));
  const every = [1, 2, 3, 4, 6].find((n) => (last - first) / HOUR / n <= STEPS) ?? 6;
  const span = Math.ceil((last - first) / HOUR / every) * every * HOUR;
  // Late in the day the stretch reaches back from midnight instead.
  const from = Math.max(start, Math.min(first, end - span));
  const w = { from, to: Math.min(end, from + span) };
  const steps = Math.round((w.to - w.from) / HOUR / every);

  // Each lap's sliver: the lap, and the break that followed it until the next lap.
  const sliver = (i: number) => {
    const lap = items[i] as TimelineEntry;
    const blocks: { start: number; end: number; kind?: 'rest' | 'aside' }[] = [{ start: lap.started, end: lap.ended, kind: counts(lap) ? undefined : 'aside' }];
    for (const next of items.slice(i + 1)) {
      if (next.kind === 'work') break;
      if (next.kind === 'short' || next.kind === 'long') blocks.push({ start: next.started, end: next.ended, kind: 'rest' });
    }
    return blocks;
  };

  // The five latest laps stand; the earlier ones, and what happened among them, open in place.
  const laps = items.map((item, i) => (isLap(item) ? i : -1)).filter((i) => i >= 0);
  const cut = laps.length > LATEST && !all ? laps[laps.length - LATEST]! : 0;
  const hidden = laps.filter((i) => i < cut).map((i) => items[i] as TimelineEntry);
  const aside = hidden.filter((lap) => !counts(lap)).length;
  const earlierMs = hidden.reduce((sum, lap) => sum + lap.day_ms, 0);

  const act = (lap: TimelineEntry) => (lap.outcome === 'void' ? s.progress.countAgain : s.progress.setAside);
  // One line: a new line typed or pasted is a space.
  const note = useTyped(isToday ? progress.note(today) : '', (text) => progress.setNote(today, text.replace(/\s*\n\s*/g, ' ')));
  const figure = s.total(view.focus_ms);
  const live = (items.at(-1) as TimelineEntry | undefined)?.live;

  const row = (item: Item, i: number) => {
    if (isMoment(item))
      return (
        <div key={`${item.kind}-${item.id}`} class={css.quiet}>
          <span>{s.wall(item.at)}</span>
          <span>
            <b>{s.progress.doneAt}</b> {item.title}
          </span>
        </div>
      );
    const lap = item;
    const counted = counts(lap);
    // The other day a lap across midnight gives minutes to: where it began, or where it ended.
    const other = lap.began ?? lap.ends ?? undefined;
    // The two-device mark stands on both of a pair while both count.
    const pair = counted && lap.overlap && items.some((o) => o !== lap && isLap(o) && o.overlap && counts(o) && o.started < lap.ended && o.ended > lap.started);
    // What it gave this day: its own length, unless midnight cut it or a lap beside it had already counted some.
    const cutAtMidnight = counted && (lap.started < start || lap.ended > end);
    const already = counted && !cutAtMidnight ? lap.ran_ms - lap.day_ms : 0;
    return (
      <div key={lap.id} class={css.lap}>
        <span class={css.top}>
          <span>{lap.live === 'running' ? s.progress.spanNow(lap.started) : s.progress.span(lap.started, lap.ended)}</span>
          <span>{cutAtMidnight ? s.progress.gave(lap.day_ms, isToday) : already >= MIN ? s.progress.shared(lap.ran_ms, already) : s.progress.ran(lap.ran_ms)}</span>
          {pair && <span>{s.progress.twoDevices}</span>}
        </span>
        <span class={css.what}>
          <b>{kind(lap)}</b>
          {lap.task && <span>{lap.task.title}</span>}
        </span>
        <span class={css.sliver}>
          <Lane window={w} laps={sliver(i)} mine sliver />
        </span>
        {lap.began && <span class={css.aside}>{s.progress.began(lap.began.day, counted ? lap.began.ms : 0)}</span>}
        {counted && !lap.live && lap.ends && <span class={css.aside}>{s.progress.ends(lap.ends.day)}</span>}
        {/* The lap in progress has no row yet: nothing to set aside until it ends. Keyed by its
            run, it becomes its saved row in place when it does, never two. */}
        {!lap.live && (
          <Button
            kind="link"
            class={css.act}
            aria-label={s.progress.forLap(act(lap), lap.started)}
            onClick={() => {
              if (lap.outcome === 'void') {
                progress.countAgain(lap.id);
                return say(null);
              }
              // Said on the bar, with the way to take it back: what left this day, and the other one a
              // lap across midnight also leaves. Minutes another lap shares stay counted.
              progress.setAside(lap.id);
              say({ lead: '', title: s.progress.off(lap.off_ms, day, today, other), undo: () => progress.countAgain(lap.id) });
            }}
          >
            {act(lap)}
          </Button>
        )}
        <span class={css.split}>{lap.split_ms !== null && s.total(lap.split_ms)}</span>
      </div>
    );
  };

  return (
    <Panel title={s.progress.dayTitle(day, today)}>
      {!isToday && (
        <Button
          kind="link"
          class={css.back}
          onClick={(event) => {
            // The button goes with the press: the keyboard lands on the panel's heading, not the page.
            event.currentTarget.closest('section')!.querySelector('h2')!.focus();
            onToday();
          }}
        >
          {s.progress.toToday}
        </Button>
      )}
      {/* No session, no figure or hours: a task done or a check-in alone stays a quiet row under the sentence. */}
      {sessions.length === 0 ? (
        <>
          <p class={css.empty}>{s.progress.dayEmpty(isToday)}</p>
          {items.length > 0 && <Fold list class={css.list}>{items.map((item, i) => row(item, i))}</Fold>}
        </>
      ) : (
        <>
          <p class={css.big}>
            {/* Its ink on the panel's edge: pulled back by the bearing of the digit that leads. */}
            <b style={`--bearing:var(--layout-figure-bearing-${figure.charAt(0)})`}>{figure}</b>
            <span>{s.progress.focused(view.laps, isToday, live === 'running' || live === 'paused' ? live : undefined)}</span>
          </p>
          <div class={css.log}>
            <div class={css.head}>
              {laps.length > LATEST && (
                <Button kind="link" class={css.fold} aria-expanded={all} onClick={() => setAll(!all)}>
                  {all ? s.progress.latest(LATEST) : s.progress.earlier(hidden.length, aside, earlierMs)}
                </Button>
              )}
              <span class={css.hours} aria-hidden="true">
                {Array.from({ length: steps + 1 }, (_, k) => (
                  <span key={k} class={k === 0 ? css.start : k === steps ? css.end : undefined} style={`left:${(k / steps) * 100}%`}>
                    {w.from + k * every * HOUR === end ? s.progress.dayEnd : s.wall(w.from + k * every * HOUR)}
                  </span>
                ))}
              </span>
              <span class={css.total}>{s.progress.soFar(isToday)}</span>
            </div>
            <Fold list class={css.list}>
              {items.map((item, i) => (i < cut || (!isMoment(item) && !isLap(item)) ? null : row(item, i)))}
            </Fold>
          </div>
        </>
      )}
      {isToday ? (
        <LongField
          label={s.progress.note}
          placeholder={s.progress.noteHint}
          maxLength={NOTE_MAX}
          onKeyDown={(event: KeyboardEvent) => event.key === 'Enter' && event.preventDefault()}
          hint={NOTE_MAX - note.value.length <= NOTE_NEAR ? s.progress.noteLeft(NOTE_MAX - note.value.length) : undefined}
          {...note}
        />
      ) : (
        progress.note(day) && (
          <div class={css.then}>
            <h3>{s.progress.noteThen}</h3>
            <p>{progress.note(day)}</p>
          </div>
        )
      )}
    </Panel>
  );
}
