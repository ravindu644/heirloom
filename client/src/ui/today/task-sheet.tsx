import type { TargetedSubmitEvent } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { UNDO_MS } from '../../sync/focus.ts';
import type { ProjectColor, SubtaskView, TaskView, Today } from '../../sync/today.ts';
import { Button } from '../kit/button.tsx';
import { Check } from '../kit/check.tsx';
import { cx } from '../kit/cx.ts';
import { Field } from '../kit/field.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { useTyped } from '../kit/typed.ts';
import * as s from '../strings.ts';
import css from './task-sheet.module.css';

const COLORS: ProjectColor[] = ['you', 'rest', 'ink', 'ghost', 'heat-2'];
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
}

/** One task, open. Every edit is saved as it is made: there is no Save, and closing loses nothing. */
export function TaskSheet({ task, today, onClose, onDone, onRemove }: Props) {
  const [making, setMaking] = useState(false);
  const [color, setColor] = useState<ProjectColor>('you');
  const [chosen, setChosen] = useState(task.repeat?.every === 'week');
  const subtask = useRef<HTMLInputElement>(null);
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
  const addSubtask = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (today.addSubtask(task.id, subtask.current!.value.trim())) subtask.current!.value = '';
  };
  const days = task.repeat?.every === 'week' ? task.repeat.days : 0;

  return (
    <Sheet title={s.task.sheet} close={s.task.close} onClose={onClose}>
      <Field label={s.task.title} {...title} />

      <fieldset class={css.group}>
        <legend>{s.task.project}</legend>
        <div class={css.choices}>
          <button type="button" class={css.choice} aria-pressed={!task.project} onClick={() => edit({ project: null })}>
            {s.task.noProject}
          </button>
          {today.projects.value.map((project) => (
            <button key={project.id} type="button" class={css.choice} aria-pressed={task.project?.id === project.id} onClick={() => edit({ project: project.id })}>
              <i style={`background:var(--${project.color})`} />
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
          <form class={css.making} onSubmit={addProject}>
            <Field label={s.task.projectName} name="project" required autocomplete="off" />
            <div class={css.squares} role="radiogroup" aria-label={s.task.projectSquare}>
              {COLORS.map((name) => (
                <button key={name} type="button" role="radio" aria-checked={color === name} aria-label={s.task.colors[name]} onClick={() => setColor(name)}>
                  <i style={`background:var(--${name})`} />
                </button>
              ))}
            </div>
            <Button type="submit">{s.task.addProject}</Button>
          </form>
        )}
      </fieldset>

      <fieldset class={css.group}>
        <legend>{s.task.estimate}</legend>
        <div class={css.line}>
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
          <p class={css.nudge}>
            {s.task.nudge(estimate)}
            <Button kind="link" onClick={() => subtask.current?.focus()}>
              {s.task.nudgeGo}
            </Button>
          </p>
        )}
      </fieldset>

      <div class={css.pair}>
        <Field label={s.task.due} type="date" value={task.due ?? ''} onInput={(event) => edit({ due: event.currentTarget.value || null })} />
        <Field label={s.task.when} placeholder={s.task.whenHint} {...when} />
      </div>

      <fieldset class={css.group}>
        <legend>{s.task.repeat}</legend>
        <div class={css.choices}>
          <button
            type="button"
            class={css.choice}
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
            class={css.choice}
            aria-pressed={task.repeat?.every === 'day'}
            onClick={() => {
              setChosen(false);
              edit({ repeat: { every: 'day' } });
            }}
          >
            {s.task.everyDay}
          </button>
          {/* Choosing days is not a rule until a day is chosen, so nothing is saved by this tap alone. */}
          <button type="button" class={css.choice} aria-pressed={chosen && task.repeat?.every !== 'day'} onClick={() => setChosen(true)}>
            {s.task.someDays}
          </button>
        </div>
        {chosen && task.repeat?.every !== 'day' && (
          <div class={cx(css.choices, css.days)}>
            {s.task.weekdays.map((name, bit) => (
              <button
                key={name}
                type="button"
                class={cx(css.choice, css.weekday)}
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
      </fieldset>

      <fieldset class={css.group}>
        <legend>{s.task.subtasks}</legend>
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
          <p class={css.removed} role="status">
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
        <form class={css.sub} onSubmit={addSubtask}>
          <input ref={subtask} aria-label={s.task.subtaskNew} placeholder={s.task.subtaskHint} autocomplete="off" enterkeyhint="done" />
          <Button type="submit">{s.task.subtaskAdd}</Button>
        </form>
      </fieldset>

      <div class={css.ends}>
        <Button onClick={leave(onDone)}>{task.done ? s.task.notDone : s.task.done}</Button>
        <Button kind="quiet" onClick={leave(onRemove)}>
          {s.task.delete}
        </Button>
      </div>
    </Sheet>
  );
}
