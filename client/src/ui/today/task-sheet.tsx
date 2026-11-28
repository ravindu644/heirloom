import type { TargetedSubmitEvent } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { UNDO_MS } from '../../sync/focus.ts';
import { COLORS, ESTIMATE_MAX, PROJECT_NAME_MAX } from '../../sync/today.ts';
import type { ProjectColor, SubtaskView, TaskView, Today } from '../../sync/today.ts';
import { Button } from '../kit/button.tsx';
import { cx } from '../kit/cx.ts';
import { Field } from '../kit/field.tsx';
import { Fold } from '../kit/fold.tsx';
import { hueHex, toneOf } from '../kit/hue.ts';
import { Lengths } from '../kit/lengths.tsx';
import { useLift } from '../kit/lift.ts';
import type { LengthsOf } from '../kit/lengths.tsx';
import { Picker } from '../kit/picker.tsx';
import { QuickAdd } from '../kit/quick-add.tsx';
import { Square } from '../kit/square.tsx';
import { Note } from '../kit/note.tsx';
import { Sheet } from '../kit/sheet.tsx';
import { Stepper } from '../kit/stepper.tsx';
import { useTyped } from '../kit/typed.ts';
import * as s from '../strings.ts';
import form from '../kit/form.module.css';
import links from '../kit/links.module.css';
import css from './task-sheet.module.css';

// PRODUCT: over this many laps a task wants breaking down.
const NUDGE_OVER = 7;

/** A subtask in the sheet: its words, which a tap turns into a field where they stand, and Remove. Ticking is Today's. */
function Subtask({ sub, today, onRemove }: { sub: SubtaskView; today: Today; onRemove: () => void }) {
  // An empty title is not saved: the last one that said something stays.
  const title = useTyped(sub.title, (text) => text.trim() && today.editSubtask(sub.id, { title: text }));
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (editing) field.current?.focus({ preventScroll: true });
  }, [editing]);
  return (
    <div class={css.sub} data-lift={sub.id}>
      {editing ? (
        <input
          ref={field}
          name="subtask-title"
          aria-label={s.task.subtaskTitle}
          enterkeyhint="done"
          {...title}
          onBlur={() => {
            title.onBlur();
            setEditing(false);
          }}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      ) : (
        // A press and hold carries it; a tap edits it.
        // Done on Today is struck through here as there: no box, the tick is Today's.
        <button type="button" class={sub.done ? css.struck : undefined} data-grip aria-label={s.task.subtaskEdit(sub.title, sub.done)} onClick={() => setEditing(true)}>
          {sub.title}
        </button>
      )}
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
  /** The account's lengths: what a task's own start from, and what stands in for one it does not have. */
  lengths: LengthsOf;
  /** In the phone app, which reminds at a task's time. A browser only shows the time. */
  app?: boolean;
  /** The task was given a time where it had none: the moment to ask for leave to notify. */
  onReminderSet?: () => void;
}

/** One task, open. Every edit is saved as it is made: there is no Save, and closing loses nothing. */
export function TaskSheet({ task, today, onClose, onDone, onRemove, lengths, app = false, onReminderSet }: Props) {
  // The project form: for a new one, or filled in with the chosen one, where each change is kept as it is made.
  const [making, setMaking] = useState<'new' | 'edit' | false>(false);
  const editing = making === 'edit' ? task.project : null;
  // The form is open for a new project, or for the chosen one while there is one: a project
  // deleted or archived elsewhere answers the form from outside, and it closes.
  const formOpen = making === 'new' || !!editing;
  useEffect(() => {
    if (making === 'edit' && !task.project) close();
  }, [making, task.project]);
  const projectName = useTyped(task.project?.name ?? '', (text) => task.project && text.trim() && today.editProject(task.project.id, { name: text }));
  // A colour is kept at once when the project is being edited; a new one keeps it for its Add.
  const paint = (next: ProjectColor, keep = true) => {
    setColor(next);
    if (editing && keep) today.editProject(editing.id, { color: next });
  };
  // A project deleted here can be had back for as long as any Undo lasts. Said in the sheet:
  // the bar stands under an open sheet, where it cannot be read.
  const [gone, setGone] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!gone) return;
    const timer = setTimeout(() => setGone(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [gone]);
  const [color, setColor] = useState<ProjectColor>('you');
  // The app's own picker, open under the squares, and where its two sliders stand.
  const [picking, setPicking] = useState(false);
  const [tone, setTone] = useState({ hue: 210, depth: 50 });
  // What opened closes when it is answered: the form goes when a project is chosen some other
  // way, and the picker goes with it.
  const close = () => {
    setMaking(false);
    setPicking(false);
  };
  const [chosen, setChosen] = useState(task.repeat?.every === 'week');
  const estimate = task.estimate ?? 0;
  const own = Object.values(task.lengths).some((length) => length !== null);
  // What a lap on this task gets: its own length where it has one, the account's where it has not.
  const ownLengths = { work_ms: task.lengths.work_ms ?? lengths.work_ms, short_ms: task.lengths.short_ms ?? lengths.short_ms, long_ms: task.lengths.long_ms ?? lengths.long_ms };
  // "My usual lengths" tapped to compare, or by mistake: while the sheet is open, "Its own" gives back what was set.
  const keptOwn = useRef<LengthsOf | null>(null);
  const edit = today.edit.bind(today, task.id);
  const title = useTyped(task.title, (text) => text.trim() && edit({ title: text }));
  const leave = (then: () => void) => () => {
    then();
    onClose();
  };

  // A subtask removed can be had back for as long as any Undo lasts. Said where it stood: a bar
  // would be under the sheet.
  const [removed, setRemoved] = useState<{ sub: SubtaskView; at: number } | null>(null);
  // Subtasks are put in order by pressing and holding, among their own.
  const subList = useRef<HTMLFieldSetElement>(null);
  const [placed, setPlaced] = useState('');
  useLift(subList, (id, before, at, of) => {
    today.move(id, before);
    setPlaced(s.today.nowAt(task.subtasks.find((sub) => sub.id === id)?.title ?? '', at, of));
  });
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const addProject = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Enter in the form of a project being edited only closes it: everything is kept already.
    if (editing) return close();
    const name = event.currentTarget.elements.namedItem('project') as HTMLInputElement;
    const id = today.addProject(name.value.trim(), color);
    if (!id) return;
    edit({ project: id });
    close();
  };
  const days = task.repeat?.every === 'week' ? task.repeat.days : 0;
  const picked = color.startsWith('#');

  return (
    <Sheet grows title={s.task.sheet} close={s.task.close} onClose={onClose}>
      <Field label={s.task.title} {...title} />

      <fieldset class={form.group}>
        <legend>{s.task.project}</legend>
        <Fold gap="sm">
          <div key="choices" class={form.choices}>
            <button type="button" class={form.choice} aria-pressed={!task.project} onClick={() => (edit({ project: null }), close())}>
              {s.task.noProject}
            </button>
            {today.projects.value.map((project) => (
              <button key={project.id} type="button" class={form.choice} aria-pressed={task.project?.id === project.id} onClick={() => (edit({ project: project.id }), close())}>
                <Square color={project.color} />
                {project.name}
              </button>
            ))}
            {!formOpen && (
              <Button kind="link" onClick={() => setMaking('new')}>
                {s.task.newProject}
              </Button>
            )}
            {!formOpen && task.project && (
              <Button
                kind="link"
                onClick={() => {
                  setColor(task.project!.color);
                  setMaking('edit');
                }}
              >
                {s.task.editProject}
              </Button>
            )}
          </div>
          {gone && (
            <p key="gone" class={css.removed} role="status">
              {s.today.saidProjectGone} {gone.name}. {s.today.projectKeeps}
              <Button
                kind="link"
                onClick={() => {
                  today.restoreProject(gone.id);
                  setGone(null);
                }}
              >
                {s.today.undo}
              </Button>
            </p>
          )}
          {formOpen && (
            <form key="making" class={css.making} onSubmit={addProject}>
              <Fold gap="md">
                {editing ? (
                  <Field key="name" label={s.task.projectName} maxLength={PROJECT_NAME_MAX} autocomplete="off" {...projectName} />
                ) : (
                  <Field key="name" label={s.task.projectName} name="project" required maxLength={PROJECT_NAME_MAX} autocomplete="off" />
                )}
                {/* Twelve squares with names and a thirteenth, "Pick", always last and never moving: it
                    opens the app's own picker under the squares and then carries the picked colour itself. */}
                <div key="squares" class={css.squares} role="radiogroup" aria-label={s.task.projectSquare}>
                  {COLORS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={color === name}
                      aria-label={s.task.colors[name]}
                      onClick={() => {
                        // A named colour answers what the picker was asking: it closes.
                        paint(name);
                        setPicking(false);
                      }}
                    >
                      <Square color={name} />
                    </button>
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    aria-expanded={picking}
                    class={css.pick}
                    onClick={() => {
                      // Opening only opens. A colour already picked puts the sliders where it
                      // is; nothing is chosen or written until a slider moves.
                      if (picked) setTone(toneOf(color));
                      setPicking(true);
                    }}
                  >
                    {picked && <Square color={color} />}
                    {s.task.pick}
                  </button>
                </div>
                {picking && (
                  <Picker
                    key="picker"
                    hue={tone.hue}
                    depth={tone.depth}
                    hueLabel={s.task.hue}
                    depthLabel={s.task.depth}
                    onPick={(hue, depth) => {
                      // Shown as the finger moves, and written when it lifts.
                      setTone({ hue, depth });
                      paint(hueHex(hue, depth) as ProjectColor, false);
                    }}
                    onDone={(hue, depth) => paint(hueHex(hue, depth) as ProjectColor)}
                  />
                )}
                {editing ? (
                  <div key="ends" class={css.edits}>
                    {/* Every change is already kept: this only closes. */}
                    <Button onClick={close}>{s.task.editDone}</Button>
                    <Button
                      kind="link"
                      class={links.end}
                      onClick={() => {
                        today.removeProject(editing.id);
                        setGone({ id: editing.id, name: editing.name });
                        close();
                      }}
                    >
                      {s.task.deleteProject}
                    </Button>
                  </div>
                ) : (
                  <Button key="add" type="submit">
                    {s.task.addProject}
                  </Button>
                )}
              </Fold>
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
              top={estimate >= ESTIMATE_MAX}
              floor={estimate === 0}
            />
            <span>{s.task.count(task.laps, task.estimate)}</span>
          </div>
          {estimate > NUDGE_OVER && (
            <Note key="nudge" class={css.nudge}>
              {s.task.nudge(estimate)}
              {/* This tap asks to be taken to the field: it is a move, and the page may scroll for it. */}
              <Button kind="link" data-moves onClick={(event) => event.currentTarget.closest('dialog')?.querySelector<HTMLInputElement>('[name="subtask"]')?.focus()}>
                {s.task.nudgeGo}
              </Button>
            </Note>
          )}
        </Fold>
      </fieldset>

      {/* One choice, and with "Its own" the three steppers Settings has, starting from the
          account's. They are kept at once, as everything here is: what is shown is what a lap
          on this task will get. */}
      <fieldset class={form.group}>
        <legend>{s.settings.lengths}</legend>
        <Fold gap="md">
          <div key="choices" class={form.choices}>
            <button type="button" class={form.choice} aria-pressed={!own}
              onClick={() => {
                if (own) keptOwn.current = ownLengths;
                edit({ work_ms: null, short_ms: null, long_ms: null });
              }}
            >
              {s.task.usual}
            </button>
            <button type="button" class={form.choice} aria-pressed={own} onClick={() => own || edit(keptOwn.current ?? lengths)}>
              {s.task.own}
            </button>
          </div>
          {own && <Lengths key="own" of={ownLengths} onSet={edit} />}
          {own && (
            <Note key="note">
              {s.task.ownNote}
            </Note>
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
          {/* Chosen days with no day would be no rule at all, so this tap picks today's weekday at once: see its handler. */}
          <button type="button" class={form.choice} aria-pressed={chosen && task.repeat?.every !== 'day'}
            onClick={() => {
              // Chosen days with no day chosen is no rule at all: today's weekday is picked at once.
              setChosen(true);
              if (task.repeat?.every !== 'week') edit({ repeat: { every: 'week', days: 1 << ((new Date(`${today.day.value}T00:00:00Z`).getUTCDay() + 6) % 7) } });
            }}
          >
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

      <fieldset class={form.group} ref={subList}>
        <legend>{s.task.subtasks}</legend>
        <p class="sr" role="status">
          {placed}
        </p>
        <Fold gap="sm">
        {(() => {
          const rows = task.subtasks.map((sub, at) => (
            <Subtask
              key={sub.id}
              sub={sub}
              today={today}
              onRemove={() => {
                today.remove(sub.id);
                setRemoved({ sub, at });
              }}
            />
          ));
          if (removed)
            rows.splice(
              Math.min(removed.at, rows.length),
              0,
              <p key="removed" class={cx(css.removed, css.stood)} role="status">
                {s.task.subtaskRemoved(removed.sub.title)}
                <Button
                  kind="link"
                  onClick={() => {
                    today.restore(removed.sub.id);
                    setRemoved(null);
                  }}
                >
                  {s.today.undo}
                </Button>
              </p>,
            );
          return rows;
        })()}
        <QuickAdd key="add" name="subtask" label={s.task.subtaskNew} hint={s.task.subtaskHint} go={s.today.addGo} onAdd={(text) => today.addSubtask(task.id, text.trim()) !== null} />
        </Fold>
      </fieldset>

      {/* There is no Save to look for. */}
      <div class={form.group}>
        <Note>{s.savedAsYouGo}</Note>
        <div class={form.ends}>
          <Button onClick={leave(onDone)}>{task.done ? s.task.notDone : s.task.done}</Button>
          <Button kind="quiet" onClick={leave(onRemove)}>
            {s.task.delete}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
