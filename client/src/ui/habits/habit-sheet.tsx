import { useEffect, useRef, useState } from 'preact/hooks';
import { UNDO_MS } from '../../sync/focus.ts';
import type { HabitView, Habits } from '../../sync/habits.ts';
import { Button } from '../kit/button.tsx';
import { cx } from '../kit/cx.ts';
import { Field } from '../kit/field.tsx';
import { Fold } from '../kit/fold.tsx';
import form from '../kit/form.module.css';
import { Heat } from '../kit/heat.tsx';
import { Name, Note } from '../kit/note.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { useTyped } from '../kit/typed.ts';
import * as s from '../strings.ts';
import css from './habits.module.css';

// More than this in a day is a counter, not a habit.
const TARGET_MAX = 20;

interface Props {
  habit: HabitView;
  habits: Habits;
  /** Its run or its days kept, as the list says it. */
  run: string;
  onClose: () => void;
  onArchive: () => void;
  onRemove: () => void;
  /** A reminder time was set where there was none: the moment to ask the phone for leave to notify. */
  onReminderSet?: () => void;
  /** In the phone app, which reminds at the habit's time whether or not heirloom is open. */
  app?: boolean;
}

/** One habit, open, in the sheet a task opens in. Every edit is saved as it is made. */
export function HabitSheet({ habit, habits, run, onClose, onArchive, onRemove, onReminderSet, app }: Props) {
  // The last day of a habit was tapped: it stays, and the sheet says why.
  const [lastDay, setLastDay] = useState(false);
  const edit = habits.edit.bind(habits, habit.id);
  const title = useTyped(habit.title, (text) => text.trim() && edit({ title: text }));
  const leave = (then: () => void) => () => {
    then();
    onClose();
  };
  const done = habit.record.filter((day) => day.done).length;

  // A time for each time a day it is done, at most: the ones set and one empty field after them,
  // so twenty times a day is not twenty empty fields. What is written is the times in order with
  // the empty ones left out; a field being typed in or cleared keeps its place until the focus
  // leaves the group, and then they stand closed up, in the order they will ring.
  const [draft, setDraft] = useState<string[] | null>(null);
  const held = draft ?? habit.reminds;
  const last = held.reduce((at, time, i) => (time ? i : at), -1);
  const times = Array.from({ length: Math.min(habit.target, last + 2) }, (_, i) => held[i] ?? '');
  const remind = (at: number, time: string) => {
    const next = times.map((was, i) => (i === at ? time : was));
    setDraft(next);
    edit({ reminds: next.filter(Boolean).sort() });
    cut.current = [];
    if (time && habit.reminds.length === 0) onReminderSet?.();
  };
  // A count stepped down cuts the times past it, and stepped up again while the sheet is open
  // it has them back: one press too many on minus is not a reminder lost. A time set or cleared
  // by hand in between is the newer word, and the cut ones are let go.
  const cut = useRef<string[]>([]);
  const less = () => {
    if (habit.reminds.length > cut.current.length) cut.current = habit.reminds;
    edit({ target: Math.max(1, habit.target - 1) });
  };
  const more = () => {
    const target = Math.min(TARGET_MAX, habit.target + 1);
    const back = cut.current.slice(habit.reminds.length, target);
    edit(back.length > 0 ? { target, reminds: [...habit.reminds, ...back] } : { target });
  };
  // All of them removed in one tap can be had back for as long as any Undo lasts. Said here in
  // the sheet: the bar stands under an open sheet, where it cannot be read.
  const [removed, setRemoved] = useState<string[] | null>(null);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);
  const many = habit.target > 1;
  const note = many ? s.habits.remindsNote : s.habits.remindNote;

  return (
    <Sheet grows title={s.habits.sheet} close={s.task.close} onClose={onClose}>
      <Field label={s.habits.title} {...title} />

      <fieldset class={form.group}>
        <legend>{s.habits.daysOf}</legend>
        <div class={cx(form.choices, form.days)}>
          {s.habits.weekdays.map((name, bit) => (
            <button
              key={name}
              type="button"
              class={cx(form.choice, form.weekday)}
              aria-pressed={(habit.days & (1 << bit)) !== 0}
              // A habit with no day left would never be planned: the last one stays, and it is said.
              onClick={() => {
                const days = habit.days ^ (1 << bit);
                setLastDay(days === 0);
                if (days !== 0) edit({ days });
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <Fold role="status">{lastDay && <Note>{s.habits.lastDay}</Note>}</Fold>
      </fieldset>

      <fieldset class={form.group}>
        <legend>{s.habits.perDay}</legend>
        <Stepper
          text={s.habits.times(habit.target)}
          less={s.habits.less}
          more={s.habits.more}
          onLess={less}
          onMore={more}
          top={habit.target >= TARGET_MAX}
          floor={habit.target <= 1}
        />
        {/* Done more than once a day: how far today has got. Its times are ticked and unticked on the list. */}
        <Fold>
          {habit.target > 1 && (
            <p class={css.sofar}>
              {s.habits.countToday(habit.today.count, habit.target)}
            </p>
          )}
        </Fold>
      </fieldset>

      <div class={css.remind} role="group" aria-label={s.habits.reminds} onFocusOut={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setDraft(null)}>
        {/* Two to a line, and a line opens for every two more. */}
        <Fold gap="md">
          {times.map(
            (_, at) =>
              at % 2 === 0 && (
                <div key={at} class={cx(css.times, !many && css.one)}>
                  {times.slice(at, at + 2).map((time, i) => (
                    <Field key={i} label={many ? s.habits.remindNth(at + i + 1) : s.habits.remind} type="time" value={time} onInput={(event) => remind(at + i, event.currentTarget.value)} />
                  ))}
                </div>
              ),
          )}
        </Fold>
        <small data-job="note">{app ? note : `${note} ${s.remindsWhere}`}</small>
        <Fold>
          {habit.reminds.length > 0 && (
            <Button
              key="remove"
              kind="link"
              onClick={() => {
                setRemoved(habit.reminds);
                cut.current = [];
                setDraft(null);
                edit({ reminds: [] });
              }}
            >
              {many ? s.habits.noReminds : s.habits.noRemind}
            </Button>
          )}
          {removed && habit.reminds.length === 0 && (
            <p key="gone" class={css.gone} role="status">
              {removed.length > 1 ? s.habits.remindsGone : s.habits.remindGone}
              <Button
                kind="link"
                onClick={() => {
                  edit({ reminds: removed });
                  setRemoved(null);
                }}
              >
                {s.today.undo}
              </Button>
            </p>
          )}
        </Fold>
      </div>

      <section class={cx(form.group, css.record)} aria-label={s.habits.record}>
        <Name>{s.habits.record}</Name>
        {habit.record.length === 0 ? (
          <p class={css.quiet}>{s.habits.noRecord}</p>
        ) : (
          <>
            <Heat
              days={habit.record.map((day) => ({ day: day.day, level: day.done ? 4 : day.count > 0 ? 2 : 0, rest: day.rest }))}
              label={s.habits.recordLabel(habit.title, done, habit.record.length)}
              weekdays={s.progress.rowNames}
              month={s.progress.month}
            />
            <Note>
              {run && `${s.cap(run)}. `}
              {s.habits.recordNote}
            </Note>
          </>
        )}
      </section>

      {/* There is no Save to look for, and the two ways out say what each keeps. */}
      <div class={form.group}>
        <Note>{s.savedAsYouGo}</Note>
        <div class={form.ends}>
          <Button onClick={leave(onArchive)}>{s.habits.archive}</Button>
          <Button kind="quiet" onClick={leave(onRemove)}>
            {s.task.delete}
          </Button>
        </div>
        <Note>{s.habits.footNote}</Note>
      </div>
    </Sheet>
  );
}
