import { useEffect, useState } from 'preact/hooks';
import { addDays } from '../../core/progress.ts';
import { say } from '../kit/said.tsx';
import type { Progress, TimelineEntry } from '../../sync/progress.ts';
import { Button } from '../kit/button.tsx';
import { cx } from '../kit/cx.ts';
import { LongField } from '../kit/field.tsx';
import { Fold } from '../kit/fold.tsx';
import { Laps } from '../kit/laps.tsx';
import { Panel } from '../kit/panel.tsx';
import { useTyped } from '../kit/typed.ts';
import * as s from '../strings.ts';
import css from './day.module.css';

const HOUR = 3600000;
const NOTE_MAX = 280;
// Under this many characters left, the count shows.
const NOTE_NEAR = 40;
// How many of a day's sessions its list shows before it is asked for the rest.
const LATEST = 5;

// The lap in progress is said as running or paused, whatever the core's outcome for it reads
// meanwhile; one whose bell has gone and whose row is not written yet is a lap like the others.
const kind = (entry: TimelineEntry) =>
  entry.kind === 'short' ? s.progress.shortBreak : entry.kind === 'long' ? s.progress.longBreak : entry.live === 'running' ? s.progress.running : entry.live === 'paused' ? s.progress.paused : entry.outcome === 'void' ? s.progress.aside : entry.outcome === 'stopped' ? s.progress.stopped : s.progress.lap;

/**
 * One day, hour by hour: every session as a block on the day's own stretch of hours, then the
 * same sessions as a list, because a block is a picture and too small to press. A pair that ran
 * on two devices at once is drawn on two rows and said in words. For today the day's look back
 * closes the panel: it is for the end of a day, so it sits at the end and asks for nothing.
 */
export function Day({ progress, day, today, onToday }: { progress: Progress; day: string; today: string; onToday: () => void }) {
  const entries = progress.timeline(day);
  const isToday = day === today;
  // The earlier sessions are open for the day they were asked for, and folded again on another.
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [day]);

  // The day's stretch: whole hours around what ran, never fewer than four, and never past the
  // day's own midnights: a lap from 23:46 to 00:32 is drawn on each day only as far as it ran in it.
  // Counted from the day's midnight, the hours are whole on the wall, which they are not in UTC
  // everywhere: Sri Lanka is half an hour off.
  const start = new Date(`${day}T00:00:00`).getTime();
  const end = new Date(`${addDays(day, 1)}T00:00:00`).getTime();
  const within = (ms: number) => Math.min(end, Math.max(start, ms));
  const hour = (ms: number, round: (n: number) => number) => start + round((within(ms) - start) / HOUR) * HOUR;
  const first = hour(entries[0]?.started ?? start, Math.floor);
  const until = Math.min(end, Math.max(first + 4 * HOUR, ...entries.map((entry) => hour(entry.ended, Math.ceil))));
  // Late in the day the four hours reach back from midnight instead.
  const from = Math.max(start, Math.min(first, until - 4 * HOUR));
  const hours = (until - from) / HOUR;
  const every = [1, 2, 3, 4, 6].find((n) => hours / n <= 6) ?? 6;
  const x = (ms: number) => ((within(ms) - from) / (until - from)) * 100;
  const two = entries.some((entry) => entry.row === 1);

  const act = (entry: TimelineEntry) => (entry.outcome === 'void' ? s.progress.countAgain : s.progress.setAside);

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
              {entries.map((entry) => (
                <i
                  key={entry.id}
                  class={cx(entry.kind !== 'work' ? css.rest : entry.outcome === 'void' ? css.void : css.lap, entry.row === 1 && css.below)}
                  style={`left:${x(entry.started)}%;width:${x(entry.ended) - x(entry.started)}%`}
                />
              ))}
            </div>
            <div class={css.hours}>
              {/* Each hour's name is centred on its hour; only one at either end of the lane is pulled in. */}
              {Array.from({ length: Math.floor(hours / every) + 1 }, (_, k) => (
                <span key={k} class={k === 0 ? css.start : k * every === hours ? css.end : undefined} style={`left:${((k * every) / hours) * 100}%`}>
                  {s.wall(from + k * every * HOUR)}
                </span>
              ))}
            </div>
          </div>
          {/* A day of many short tries was a wall of rows before the first figure: the five latest
              stand, in the order of the day, and one link over them opens the earlier ones in place. */}
          <div class={cx(css.sessions, entries.length > LATEST && css.folded)}>
          {entries.length > LATEST && (
            <Button kind="link" class={css.back} aria-expanded={all} onClick={() => setAll(!all)}>
              {all ? s.progress.latest(LATEST) : s.progress.earlier(entries.length - LATEST, isToday)}
            </Button>
          )}
          <Fold list class={css.list}>
            {(all ? entries : entries.slice(-LATEST)).map((entry) => (
              <div key={entry.id} class={css.entry}>
                <span class={css.when}>{entry.live === 'running' ? s.progress.spanNow(entry.started) : s.progress.span(entry.started, entry.ended)}</span>
                <span class={css.what}>
                  <b>{kind(entry)}</b>
                  {entry.task && <span>{entry.task.title}</span>}
                  {entry.overlap && <em>{s.progress.twoDevices}</em>}
                </span>
                <span class={css.length}>{entry.outcome === 'void' ? s.progress.ranAside(entry.ran_ms) : s.progress.ran(entry.ran_ms)}</span>
                {/* The way back is where the finger already is, under the one name it has on every row: Count again. */}
                {/* The lap in progress has no row yet: nothing to set aside until it ends. Keyed by its
                    run, it becomes its saved row in place when it does, never two. */}
                {entry.kind === 'work' && !entry.live && (
                  <Button
                    kind="link"
                    aria-label={s.progress.forLap(act(entry), entry.started)}
                    onClick={() => {
                      if (entry.outcome === 'void') {
                        progress.countAgain(entry.id);
                        return say(null);
                      }
                      // Said on the bar, where eyes can read it, with the way to take it back.
                      progress.setAside(entry.id);
                      say({ lead: '', title: s.progress.asideSaid, tail: s.progress.asideAdds, undo: () => progress.countAgain(entry.id) });
                    }}
                  >
                    {act(entry)}
                  </Button>
                )}
              </div>
            ))}
          </Fold>
          </div>
        </>
      )}
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
                  <Laps laps={task.laps} squares={task.squares} estimate={task.estimate} of={s.today.of(task.estimate)} />
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
      {!isToday && progress.note(day) && (
        <section class={css.look} aria-label={s.progress.noteThen}>
          <h3>{s.progress.noteThen}</h3>
          <p>{progress.note(day)}</p>
        </section>
      )}
    </Panel>
  );
}
