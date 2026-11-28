import { useEffect, useState } from 'preact/hooks';
import { addDays } from '../../core/progress.ts';
import type { Moment, Progress, TimelineEntry } from '../../sync/progress.ts';
import { Button } from '../kit/button.tsx';
import { cx } from '../kit/cx.ts';
import { LongField } from '../kit/field.tsx';
import { Fold } from '../kit/fold.tsx';
import { LapSquare } from '../kit/lap-squares.tsx';
import { Opens, isOpen, toggle } from '../kit/opens.tsx';
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
// How many of a day's cards show before it is asked for the rest.
const LATEST = 5;
// The hours over the slivers are named at most this many steps apart, so they fit a phone.
const STEPS = 4;

type Item = TimelineEntry | Moment;
const isMoment = (item: Item): item is Moment => 'at' in item;
const counts = (lap: TimelineEntry) => lap.outcome !== 'void' || !!lap.live;
// The lap in progress: running or held, not yet a lap of the day's count.
const unfinished = (lap: TimelineEntry) => lap.live === 'running' || lap.live === 'paused';
// To the nearest minute: the clock times this panel shows.
const round = (ms: number) => Math.round(ms / MIN) * MIN;

/** One task's day: its laps in order, the break each earned, and when it was done. */
interface Card {
  id: string;
  title: string;
  laps: TimelineEntry[];
  rests: { start: number; end: number; kind: 'rest' }[];
  done?: number;
  first: number;
}

/**
 * One day, task by task: the day's focus, then a card per task in the order of its first lap.
 * A card is a habit row: what the task was and its time today, its sliver of the day's hours
 * (read down, the slivers still make the day's lane), and one line that sums it up. It opens
 * into one line per lap, where a lap is set aside or counted again. Then the day's one line.
 */
export function Day({ progress, day, today, onToday }: { progress: Progress; day: string; today: string; onToday: () => void }) {
  const view = progress.day(day);
  const items = view.items;
  const isToday = day === today;
  // The earlier cards are open for the day they were asked for, and folded again on another.
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
  const marks = [...sessions.flatMap((entry) => [entry.started, entry.ended]), ...items.filter(isMoment).map((moment) => moment.at)];
  const first = hour(Math.min(...marks), Math.floor);
  const last = Math.max(first + 4 * HOUR, ...marks.map((at) => hour(at, Math.ceil)));
  const every = [1, 2, 3, 4, 6].find((n) => (last - first) / HOUR / n <= STEPS) ?? 6;
  const span = Math.ceil((last - first) / HOUR / every) * every * HOUR;
  // Late in the day the stretch reaches back from midnight instead.
  const from = Math.max(start, Math.min(first, end - span));
  const w = { from, to: Math.min(end, from + span) };
  const steps = Math.round((w.to - w.from) / HOUR / every);

  // The cards: one per task, its laps and the break each earned, in the order of its first lap.
  // Laps for no task share one card; a task done today with no lap is a card of its own. The
  // sessions are taken in the order they began (the core lists the lap in progress last).
  const byId = new Map<string, Card>();
  const ordered = [...sessions].sort((a, b) => a.started - b.started);
  for (const item of ordered) {
    if (item.kind !== 'work') continue;
    const id = item.task?.id ?? '';
    const card = byId.get(id) ?? { id, title: item.task?.title ?? s.progress.noTask, laps: [], rests: [], first: item.started };
    card.laps.push(item);
    byId.set(id, card);
  }
  // A break was earned by the lap that ended last before it began, whichever device ran it.
  for (const rest of ordered.filter((item) => item.kind !== 'work')) {
    const lap = ordered.filter((item) => item.kind === 'work' && item.ended <= rest.started).reduce<TimelineEntry | null>((late, item) => (!late || item.ended >= late.ended ? item : late), null);
    if (lap) byId.get(lap.task?.id ?? '')!.rests.push({ start: rest.started, end: rest.ended, kind: 'rest' });
  }
  // A task ticked more than once shows the tick that stands: the last.
  for (const moment of items.filter(isMoment)) {
    const card = byId.get(moment.id) ?? { id: moment.id, title: moment.title, laps: [], rests: [], first: moment.at };
    card.done = moment.at;
    byId.set(moment.id, card);
  }
  // The card of a lap in progress stands last, so the fold never hides it.
  const running = (card: Card) => card.laps.some(unfinished);
  const cards = [...byId.values()].sort((a, b) => Number(running(a)) - Number(running(b)) || a.first - b.first);

  // The five latest cards stand; the earlier ones, the day's start, open in place over them.
  const cut = cards.length > LATEST && !all ? cards.length - LATEST : 0;
  const hidden = cards.slice(0, cut);
  const hiddenLaps = hidden.flatMap((card) => card.laps);

  const act = (lap: TimelineEntry) => (lap.outcome === 'void' ? s.progress.countAgain : s.progress.setAside);
  // One line: a new line typed or pasted is a space.
  const note = useTyped(isToday ? progress.note(today) : '', (text) => progress.setNote(today, text.replace(/\s*\n\s*/g, ' ')));
  const figure = s.total(view.focus_ms);
  const live = sessions.find((entry) => entry.live)?.live;

  // A lap's own minutes inside this day: from the end of its pause (counted out at its start, as
  // the core counts it) to its end, cut at the day's midnights.
  const inDay = (lap: TimelineEntry) => Math.max(0, Math.min(lap.ended, end) - Math.max(lap.started + (lap.ended - lap.started - lap.ran_ms), start));

  // A lap's line: a square as full as it ran, its facts, and the way to set it aside or count it again.
  const line = (lap: TimelineEntry) => {
    const counted = counts(lap);
    // Its clock times to the nearest minute, its minutes their difference less its pause. What it
    // gave the day across midnight, and what another lap had already covered, come from the
    // core's counts, never from the row's own rounding: a lap that ran alone shares no minute.
    const at = round(lap.started);
    const to = round(lap.ended);
    const paused = round(lap.ended - lap.started - lap.ran_ms) / MIN;
    const mins = Math.max(0, (to - at) / MIN - paused);
    const gave = Math.round(inDay(lap) / MIN);
    const part = counted && (lap.began || lap.ends) && gave > 0 ? gave : undefined;
    const already = counted && !lap.began && !lap.ends ? Math.round((lap.ran_ms - lap.day_ms) / MIN) : 0;
    // The two-device mark stands on both of a pair while both count.
    const two = counted && lap.overlap && sessions.some((o) => o !== lap && o.kind === 'work' && o.overlap && counts(o) && o.started < lap.ended && o.ended > lap.started);
    // The other day a lap across midnight gives minutes to: where it began, or where it ended.
    const other = lap.began ?? lap.ends ?? undefined;
    return (
      <div key={lap.id} class={css.lap}>
        <span class={css.box}>
          <LapSquare share={lap.fill} hollow={!counted} />
        </span>
        <span class={css.facts}>
          {s.progress.facts({
            from: at,
            to: lap.live === 'running' ? null : to,
            held: lap.live === 'paused',
            fromDay: lap.began?.day,
            toDay: lap.ends?.day,
            stopped: lap.outcome === 'stopped' && !lap.live,
            mins,
            part,
            here: !lap.began || !isToday,
            paused: !lap.live && paused >= 1 ? paused : undefined,
            already: already >= 1 ? already : undefined,
            two,
            aside: !counted,
          })}
        </span>
        {/* The lap in progress has no row yet: nothing to set aside until it ends. */}
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
      </div>
    );
  };

  const card = (card: Card) => {
    const id = `day:${day}:${card.id}`;
    const laps = card.laps;
    const began = laps.find((lap) => lap.began);
    // The task's time today: each counted lap's own minutes in this day, the minutes its line
    // says, said once. Beside another lap it keeps its own minutes; the figure at the top counts
    // two at once only once.
    const ms = laps.reduce((sum, lap) => sum + (counts(lap) ? inDay(lap) : 0), 0);
    // With no lap counted it has no time, as a lap not counted has none.
    const counted = laps.some(counts);
    return (
      <div key={card.id} class={css.card}>
        {/* The arrow is the control a keyboard reaches; the rest of the card's head opens it to a
            finger too. A card with no lap has nothing to open: no arrow, its box column empty. */}
        {laps.length > 0 && <Opens id={id} label={counted ? `${card.title}, ${s.total(ms)}` : card.title} />}
        <div class={cx(css.words, laps.length > 0 && css.opens)} onClick={laps.length ? () => toggle(id) : undefined}>
          <span class={css.head}>
            <span class={css.title}>{card.title}</span>
            {counted && <span class={css.time}>{s.total(ms)}</span>}
          </span>
          <span class={css.sliver}>
            <Lane
              window={w}
              laps={[
                ...laps.map((lap) => ({ start: lap.started, end: lap.ended, kind: counts(lap) ? undefined : ('aside' as const) })),
                ...card.rests,
                ...(card.done === undefined ? [] : [{ start: card.done, end: card.done, kind: 'tick' as const }]),
              ]}
              mine
              sliver
            />
          </span>
          <span class={css.sum}>
            {s.progress.taskSum({
              laps: laps.filter((lap) => !unfinished(lap)).length,
              stopped: laps.filter((lap) => lap.outcome === 'stopped' && !lap.live && counts(lap)).length,
              aside: laps.filter((lap) => !counts(lap)).length,
              live: laps.find(unfinished)?.live,
              isToday,
              from: began?.began ? { at: round(began.started), day: began.began.day } : undefined,
              done: card.done === undefined ? undefined : round(card.done),
            })}
          </span>
        </div>
        <Fold class={css.lines}>{isOpen(id) && laps.length > 0 && <div key="laps">{laps.map(line)}</div>}</Fold>
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
      {sessions.length === 0 && <p class={css.empty}>{s.progress.dayEmpty(isToday)}</p>}
      {sessions.length > 0 && (
        <p class={css.big}>
          {/* Its ink on the panel's edge: pulled back by the bearing of the digit that leads. */}
          <b style={`--bearing:var(--layout-figure-bearing-${figure.charAt(0)})`}>{figure}</b>
          <span>{s.progress.focused(view.laps, isToday, live === 'running' || live === 'paused' ? live : undefined)}</span>
        </p>
      )}
      {cards.length > 0 && (
        <div class={css.log}>
          <div class={css.hours} aria-hidden="true">
            <span>
              {Array.from({ length: steps + 1 }, (_, k) => (
                <span key={k} class={k === 0 ? css.start : k === steps ? css.end : undefined} style={`left:${(k / steps) * 100}%`}>
                  {w.from + k * every * HOUR === end ? s.progress.dayEnd : s.wall(w.from + k * every * HOUR)}
                </span>
              ))}
            </span>
          </div>
          {cards.length > LATEST && (
            <Button kind="link" class={css.fold} aria-expanded={all} onClick={() => setAll(!all)}>
              {all
                ? s.progress.latest(LATEST)
                : s.progress.earlier(
                    cut,
                    hiddenLaps.filter((lap) => !unfinished(lap)).length,
                    hiddenLaps.filter((lap) => !counts(lap)).length,
                    // What the folded cards show, added: each card's own time as it says it.
                    hidden.reduce((sum, card) => sum + round(card.laps.reduce((ms, lap) => ms + (counts(lap) ? inDay(lap) : 0), 0)), 0),
                  )}
            </Button>
          )}
          <Fold list gap="sm" class={css.cards}>
            {cards.slice(cut).map(card)}
          </Fold>
        </div>
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
