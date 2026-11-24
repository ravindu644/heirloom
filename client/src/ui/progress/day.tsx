import { useEffect, useState } from 'preact/hooks';
import { UNDO_MS } from '../../sync/focus.ts';
import type { Progress, TimelineEntry } from '../../sync/progress.ts';
import { Button } from '../kit/button.tsx';
import { cx } from '../kit/cx.ts';
import { LongField } from '../kit/field.tsx';
import { Laps } from '../kit/laps.tsx';
import { Panel } from '../kit/panel.tsx';
import { useTyped } from '../kit/typed.ts';
import * as s from '../strings.ts';
import css from './day.module.css';

const HOUR = 3600000;
const NOTE_MAX = 280;
// Under this many characters left, the count shows.
const NOTE_NEAR = 40;

const kind = (entry: TimelineEntry) =>
  entry.kind === 'short' ? s.progress.shortBreak : entry.kind === 'long' ? s.progress.longBreak : entry.outcome === 'void' ? s.progress.aside : entry.outcome === 'stopped' ? s.progress.stopped : s.progress.lap;

/**
 * One day, hour by hour: every session as a block on the day's own stretch of hours, then the
 * same sessions as a list, because a block is a picture and too small to press. A pair that ran
 * on two devices at once is drawn on two rows and said in words. For today the day's look back
 * closes the panel: it is for the end of a day, so it sits at the end and asks for nothing.
 */
export function Day({ progress, day, today, onToday }: { progress: Progress; day: string; today: string; onToday: () => void }) {
  const entries = progress.timeline(day);
  const isToday = day === today;

  // A lap set aside here can be counted again for as long as any Undo lasts.
  const [aside, setAside] = useState<string | null>(null);
  useEffect(() => {
    if (!aside) return;
    const timer = setTimeout(() => setAside(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [aside]);
  useEffect(() => setAside(null), [day]);

  // The day's stretch: whole hours around what ran, never fewer than four.
  // Whole hours on the wall, which are not whole hours of UTC everywhere: Sri Lanka is half an hour off.
  const first = entries[0];
  const zone = first ? new Date(first.started).getTimezoneOffset() * 60000 : 0;
  const from = first ? Math.floor((first.started - zone) / HOUR) * HOUR + zone : 0;
  const until = Math.max(from + 4 * HOUR, ...entries.map((entry) => Math.ceil((entry.ended - zone) / HOUR) * HOUR + zone));
  const hours = (until - from) / HOUR;
  const every = [1, 2, 3, 4, 6].find((n) => hours / n <= 6) ?? 6;
  const x = (ms: number) => ((ms - from) / (until - from)) * 100;
  // The second of a pair that overlaps the one before it goes on the row below.
  let busyUntil = 0;
  const rows = entries.map((entry) => {
    const below = entry.overlap && entry.started < busyUntil;
    if (!below) busyUntil = entry.ended;
    return below ? 1 : 0;
  });
  const two = rows.includes(1);

  const said = entries.find((entry) => entry.id === aside && entry.outcome === 'void');
  const act = (entry: TimelineEntry) => (entry.outcome !== 'void' ? s.progress.setAside : entry === said ? s.today.undo : s.progress.countAgain);

  const look = isToday ? progress.lookBack() : null;
  // One line: a new line typed or pasted is a space.
  const note = useTyped(look?.note ?? '', (text) => progress.setNote(today, text.replace(/\s*\n\s*/g, ' ')));

  return (
    <Panel title={s.progress.dayTitle(day, today)}>
      {!isToday && (
        <Button kind="link" class={css.back} onClick={onToday}>
          {s.progress.toToday}
        </Button>
      )}
      {entries.length === 0 ? (
        <p class={css.quiet}>{s.progress.dayEmpty(isToday)}</p>
      ) : (
        <>
          <div class={css.axis} aria-hidden="true">
            <div class={cx(css.track, two && css.two)}>
              {entries.map((entry, i) => (
                <i
                  key={entry.id}
                  class={cx(entry.kind !== 'work' ? css.rest : entry.outcome === 'void' ? css.void : css.lap, rows[i] === 1 && css.below)}
                  style={`left:${x(entry.started)}%;width:${x(entry.ended) - x(entry.started)}%`}
                />
              ))}
            </div>
            <div class={css.hours}>
              {Array.from({ length: Math.floor(hours / every) + 1 }, (_, k) => (
                <span key={k} style={`left:${((k * every) / hours) * 100}%`}>
                  {s.wall(from + k * every * HOUR)}
                </span>
              ))}
            </div>
          </div>
          <ul class={css.list}>
            {entries.map((entry) => (
              <li key={entry.id}>
                <span class={css.when}>{s.progress.span(entry.started, entry.ended)}</span>
                <span class={css.what}>
                  <b>{kind(entry)}</b>
                  {entry.task && <span>{entry.task.title}</span>}
                  {entry.overlap && <em>{s.progress.twoDevices}</em>}
                </span>
                <span class={css.length}>{entry.outcome === 'void' ? s.progress.ranAside(entry.ran_ms) : s.progress.ran(entry.ran_ms)}</span>
                {/* The way back is where the finger already is: for as long as an Undo lasts the link says Undo, then Count again. */}
                {entry.kind === 'work' && (
                  <Button
                    kind="link"
                    aria-label={s.progress.forLap(act(entry), entry.started)}
                    onClick={() => {
                      if (entry.outcome === 'void') progress.countAgain(entry.id);
                      else progress.setAside(entry.id);
                      setAside(entry.outcome === 'void' ? null : entry.id);
                    }}
                  >
                    {act(entry)}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p class="sr" role="status">
        {said && s.progress.asideDone(said.started)}
      </p>
      {look && (
        <section class={css.look} aria-label={s.progress.lookBack}>
          <h3>{s.progress.lookBack}</h3>
          {/* An empty day has said so once already, a few lines up. */}
          {entries.length > 0 && <p>{s.progress.lookTotals(look.focus_ms, look.laps)}</p>}
          {look.done.length > 0 && (
            <ul class={css.done} aria-label={s.progress.lookDone}>
              {look.done.map((task) => (
                <li key={task.id}>
                  <span>{task.title}</span>
                  <Laps laps={task.laps} estimate={task.estimate} of={s.today.of(task.estimate)} />
                </li>
              ))}
            </ul>
          )}
          <LongField
            label={s.progress.note}
            placeholder={s.progress.noteHint}
            maxLength={NOTE_MAX}
            onKeyDown={(event: KeyboardEvent) => event.key === 'Enter' && event.preventDefault()}
            hint={NOTE_MAX - note.value.length <= NOTE_NEAR ? s.progress.noteLeft(NOTE_MAX - note.value.length) : undefined}
            {...note}
          />
        </section>
      )}
    </Panel>
  );
}
