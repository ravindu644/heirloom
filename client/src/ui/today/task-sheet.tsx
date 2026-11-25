import type { TargetedSubmitEvent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { UNDO_MS } from '../../sync/focus.ts';
import { COLORS } from '../../sync/today.ts';
import type { ProjectColor, SubtaskView, TaskView, Today } from '../../sync/today.ts';
import { Button } from '../kit/button.tsx';
import { Check } from '../kit/check.tsx';
import { cx } from '../kit/cx.ts';
import { Field } from '../kit/field.tsx';
import { Fold } from '../kit/fold.tsx';
import { hexOf } from '../kit/hex.ts';
import { QuickAdd } from '../kit/quick-add.tsx';
import { Square } from '../kit/square.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { useTyped } from '../kit/typed.ts';
import * as s from '../strings.ts';
import form from '../kit/form.module.css';
import links from '../kit/links.module.css';
import css from './task-sheet.module.css';

// PRODUCT: over this many laps a task wants breaking down.
const NUDGE_OVER = 7;
const ESTIMATE_MAX = 99;

function Subtask({ sub, today, onRemove }: { sub: SubtaskView; today: Today; onRemove: () => void }) {
  // An empty title is not saved: the last one that said something stays.
  const title = useTyped(sub.title, (text) => text.trim() && today.editSubtask(sub.id, { title: text }));
  return (
    <div class={css.sub}>
      <Check checked={sub.done} label={s.task.subtaskCheck(sub.title)} onChange={(done) => today.editSubtask(sub.id, { done })} />
      <input aria-label={s.task.subtaskTitle} {...title} />
      <Button kind="link" onClick={onRemove}>
        {s.task.remove}
      </Button>
    </div>
  );
}

interface Props {
  task: TaskView;
  today: Today;
  onClose: () => void;
  /** Done or not done, said and undone by the list behind. */
  onDone: () => void;
  onRemove: () => void;
  /** In the phone app, which reminds at a task's time. A browser only shows the time. */
  app?: boolean;
  /** The task was given a time where it had none: the moment to ask for leave to notify. */
  onReminderSet?: () => void;
}

/** One task, open. Every edit is saved as it is made: there is no Save, and closing loses nothing. */
export function TaskSheet({ task, today, onClose, onDone, onRemove, app = false, onReminderSet }: Props) {
  const [making, setMaking] = useState(false);
  const [color, setColor] = useState<ProjectColor>('you');
  const [chosen, setChosen] = useState(task.repeat?.every === 'week');
  const estimate = task.estimate ?? 0;
  const edit = today.edit.bind(today, task.id);
  const title = useTyped(task.title, (text) => text.trim() && edit({ title: text }));
  const when = useTyped(task.when ?? '', (text) => edit({ when: text.trim() ? text : null }));
  const leave = (then: () => void) => () => {
    then();
    onClose();
  };

  // A subtask removed can be had back for as long as any Undo lasts.
  const [removed, setRemoved] = useState<SubtaskView | null>(null);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const addProject = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = event.currentTarget.elements.namedItem('project') as HTMLInputElement;
    const id = today.addProject(name.value.trim(), color);
    if (!id) return;
    edit({ project: id });
    setMaking(false);
  };
  const days = task.repeat?.every === 'week' ? task.repeat.days : 0;
  const picked = color.startsWith('#');
  // The device's picker opens on the colour chosen so far. Left to itself it opens on black, and
  // black confirmed there is no change, so no event: black could not be picked on the first try.
  const named = picked || !making ? undefined : hexOf(color);

  return (
    <Sheet grows title={s.task.sheet} close={s.task.close} onClose={onClose}>
      <Field label={s.task.title} {...title} />

      <fieldset class={form.group}>
        <legend>{s.task.project}</legend>
        <Fold gap="sm">
          <div key="choices" class={form.choices}>
            <button type="button" class={form.choice} aria-pressed={!task.project} onClick={() => edit({ project: null })}>
              {s.task.noProject}
            </button>
            {today.projects.value.map((project) => (
              <button key={project.id} type="button" class={form.choice} aria-pressed={task.project?.id === project.id} onClick={() => edit({ project: project.id })}>
                <Square color={project.color} />
                {project.name}
              </button>
            ))}
            {!making && (
              <Button kind="link" onClick={() => setMaking(true)}>
                {s.task.newProject}
              </Button>
            )}
          </div>
          {making && (
            <form key="making" class={css.making} onSubmit={addProject}>
              <Field label={s.task.projectName} name="project" required autocomplete="off" />
              {/* Twelve squares with names, and a thirteenth that opens the device's own picker. */}
              <div class={css.squares} role="radiogroup" aria-label={s.task.projectSquare}>
                {COLORS.map((name) => (
                  <button key={name} type="button" role="radio" aria-checked={color === name} aria-label={s.task.colors[name]} onClick={() => setColor(name)}>
                    <Square color={name} />
                  </button>
                ))}
                <label class={cx(css.other, picked && css.on)}>
                  <input type="color" name="color" aria-label={picked ? s.task.colorPicked : s.task.colorOther} value={picked ? color : named} onInput={(event) => setColor(event.currentTarget.value as ProjectColor)} />
                  {picked && <Square color={color} />}
                  {s.task.colorOther}
                </label>
              </div>
              <Button type="submit">{s.task.addProject}</Button>
            </form>
          )}
        </Fold>
      </fieldset>

      <fieldset class={form.group}>
        <legend>{s.task.estimate}</legend>
        <Fold gap="sm">
          <div key="line" class={form.line}>
            <Stepper
              text={s.task.estimateText(estimate)}
              less={s.task.less}
              more={s.task.more}
              onLess={() => edit({ estimate: estimate > 1 ? estimate - 1 : null })}
              onMore={() => edit({ estimate: Math.min(ESTIMATE_MAX, estimate + 1) })}
            />
            <span>{s.task.count(task.laps, task.estimate)}</span>
          </div>
          {estimate > NUDGE_OVER && (
            <p key="nudge" class={css.nudge}>
              {s.task.nudge(estimate)}
              {/* This tap asks to be taken to the field: it is a move, and the page may scroll for it. */}
              <Button kind="link" data-moves onClick={(event) => event.currentTarget.closest('dialog')?.querySelector<HTMLInputElement>('[name="subtask"]')?.focus()}>
                {s.task.nudgeGo}
              </Button>
            </p>
          )}
        </Fold>
      </fieldset>

      {/* Due is a day and a time. The time is typed or picked; "No time" takes it away again. */}
      <div class={css.due}>
        <div class={css.pair}>
          <Field label={s.task.due} type="date" value={task.due ?? ''} onInput={(event) => edit({ due: event.currentTarget.value || null })} />
          <Field
            label={s.task.time}
            type="time"
            value={task.time ?? ''}
            onInput={(event) => {
              const time = event.currentTarget.value || null;
              edit({ time });
              if (time && !task.time) onReminderSet?.();
            }}
          />
        </div>
        <p class={css.timed}>
          <span>{s.task.timeNote(app)}</span>
          {task.time && (
            <Button kind="link" class={links.end} onClick={() => edit({ time: null })}>
              {s.task.noTime}
            </Button>
          )}
        </p>
      </div>
      <Field label={s.task.when} placeholder={s.task.whenHint} {...when} />

      <fieldset class={form.group}>
        <legend>{s.task.repeat}</legend>
        <Fold gap="sm">
        <div key="choices" class={form.choices}>
          <button
            type="button"
            class={form.choice}
            aria-pressed={!task.repeat && !chosen}
            onClick={() => {
              setChosen(false);
              edit({ repeat: null });
            }}
          >
            {s.task.once}
          </button>
          <button
            type="button"
            class={form.choice}
            aria-pressed={task.repeat?.every === 'day'}
            onClick={() => {
              setChosen(false);
              edit({ repeat: { every: 'day' } });
            }}
          >
            {s.task.everyDay}
          </button>
          {/* Choosing days is not a rule until a day is chosen, so nothing is saved by this tap alone. */}
          <button type="button" class={form.choice} aria-pressed={chosen && task.repeat?.every !== 'day'} onClick={() => setChosen(true)}>
            {s.task.someDays}
          </button>
        </div>
        {chosen && task.repeat?.every !== 'day' && (
          <div key="days" class={cx(form.choices, form.days)}>
            {s.task.weekdays.map((name, bit) => (
              <button
                key={name}
                type="button"
                class={cx(form.choice, form.weekday)}
                aria-pressed={(days & (1 << bit)) !== 0}
                onClick={() => {
                  const mask = days ^ (1 << bit);
                  edit({ repeat: mask ? { every: 'week', days: mask } : null });
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        </Fold>
      </fieldset>

      <fieldset class={form.group}>
        <legend>{s.task.subtasks}</legend>
        <Fold gap="sm">
        {task.subtasks.map((sub) => (
          <Subtask
            key={sub.id}
            sub={sub}
            today={today}
            onRemove={() => {
              today.remove(sub.id);
              setRemoved(sub);
            }}
          />
        ))}
        {removed && (
          <p key="removed" class={css.removed} role="status">
            {s.task.subtaskRemoved(removed.title)}
            <Button
              kind="link"
              onClick={() => {
                today.restore(removed.id);
                setRemoved(null);
              }}
            >
              {s.today.undo}
            </Button>
          </p>
        )}
        <QuickAdd key="add" name="subtask" label={s.task.subtaskNew} hint={s.task.subtaskHint} go={s.today.addGo} onAdd={(text) => today.addSubtask(task.id, text.trim()) !== null} />
        </Fold>
      </fieldset>

      <div class={form.ends}>
        <Button onClick={leave(onDone)}>{task.done ? s.task.notDone : s.task.done}</Button>
        <Button kind="quiet" onClick={leave(onRemove)}>
          {s.task.delete}
        </Button>
      </div>
    </Sheet>
  );
}
