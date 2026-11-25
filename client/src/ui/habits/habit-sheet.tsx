import { useState } from 'preact/hooks';
import type { HabitView, Habits } from '../../sync/habits.ts';
import { Button } from '../kit/button.tsx';
import { cx } from '../kit/cx.ts';
import { Field } from '../kit/field.tsx';
import { Fold } from '../kit/fold.tsx';
import form from '../kit/form.module.css';
import links from '../kit/links.module.css';
import { Heat } from '../kit/heat.tsx';
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
        <Fold role="status">{lastDay && <p class={css.quiet}>{s.habits.lastDay}</p>}</Fold>
      </fieldset>

      <fieldset class={form.group}>
        <legend>{s.habits.perDay}</legend>
        <Stepper
          text={s.habits.times(habit.target)}
          less={s.habits.less}
          more={s.habits.more}
          onLess={() => edit({ target: Math.max(1, habit.target - 1) })}
          onMore={() => edit({ target: Math.min(TARGET_MAX, habit.target + 1) })}
          top={habit.target >= TARGET_MAX}
          floor={habit.target <= 1}
        />
        {/* Done more than once a day: how far today has got, and the way to take the last one back. */}
        <Fold>
          {habit.target > 1 && (
            <p class={css.sofar}>
              {s.habits.countToday(habit.today.count, habit.target)}
              {habit.today.count > 0 && (
                <Button kind="link" class={links.end} onClick={() => habits.undo(habit.id)}>
                  {s.habits.takeBack}
                </Button>
              )}
            </p>
          )}
        </Fold>
      </fieldset>

      <div class={css.remind}>
        <Field
          label={s.habits.remind}
          hint={app ? s.habits.remindNote : `${s.habits.remindNote} ${s.remindsWhere}`}
          type="time"
          value={habit.remind ?? ''}
          onInput={(event) => {
            const time = event.currentTarget.value || null;
            edit({ remind: time });
            if (time && !habit.remind) onReminderSet?.();
          }}
        />
        {habit.remind && (
          <Button kind="link" onClick={() => edit({ remind: null })}>
            {s.habits.noRemind}
          </Button>
        )}
      </div>

      <section class={cx(form.group, css.record)} aria-label={s.habits.record}>
        <h3 class={css.legend}>{s.habits.record}</h3>
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
            <p class={css.quiet}>
              {run && `${s.cap(run)}. `}
              {s.habits.recordNote}
            </p>
          </>
        )}
      </section>

      {/* There is no Save to look for, and the two ways out say what each keeps. */}
      <div class={form.group}>
        <p class={css.quiet}>{s.savedAsYouGo}</p>
        <div class={form.ends}>
          <Button onClick={leave(onArchive)}>{s.habits.archive}</Button>
          <Button kind="quiet" onClick={leave(onRemove)}>
            {s.task.delete}
          </Button>
        </div>
        <p class={css.quiet}>{s.habits.footNote}</p>
      </div>
    </Sheet>
  );
}
