import type { ComponentChildren } from 'preact';
import type { TaskView } from '../../sync/today.ts';
import { Check } from './check.tsx';
import { cx } from './cx.ts';
import { Laps } from './laps.tsx';
import css from './task-row.module.css';

interface Props {
  task: TaskView;
  /** After the laps run: " of 4", or nothing when there is no estimate. */
  of: string;
  /** A few words after the squares: a date, "after dinner". */
  note?: string;
  /** The one to start next: outlined in you. */
  next?: boolean;
  /** It was added while the screen was open: it comes in with the `fill` motion, once. */
  arriving?: boolean;
  /** At the row's end: a button, the move controls. The squares and the count sit to its left. */
  end?: ComponentChildren;
  /** What the box marks, for a screen reader. Left out with `onDone`, there is no box. */
  checkLabel?: string;
  onDone?: (done: boolean) => void;
  onOpen?: () => void;
}

/** A task as a row: the box, the title, its project and laps, and the count. The words open it. */
export function TaskRow({ task, of, note, next, arriving, end, checkLabel, onDone, onOpen }: Props) {
  // The laps as squares, with the count they picture. They sit at the row's right, apart from the
  // project's square: side by side the two would read as one more lap.
  const laps = (task.laps > 0 || task.estimate !== null || task.squares.length > 0) && <Laps laps={task.laps} squares={task.squares} estimate={task.estimate} of={of} />;
  const words = (
    <>
      <span class={css.title}>{task.title}</span>
      {(task.project || note) && (
        <span class={css.meta}>
          {task.project && (
            <span class={css.project}>
              {/* The square is never alone: the name follows it. */}
              <i style={`background:var(--${task.project.color})`} />
              {task.project.name}
            </span>
          )}
          {note && <span>{note}</span>}
        </span>
      )}
    </>
  );
  return (
    <div class={cx(css.row, next && css.next, arriving && css.arriving, task.done && css.done, !onDone && css.plain, !!end && css.trailed)}>
      {onDone && <Check checked={task.done} label={checkLabel ?? task.title} onChange={onDone} />}
      {onOpen ? (
        <button type="button" class={css.words} data-task={task.id} onClick={onOpen}>
          {words}
        </button>
      ) : (
        <div class={css.words}>{words}</div>
      )}
      {/* A control at the row's end has the squares and the count to its left, centred on it. */}
      <div class={css.end}>
        {laps}
        {end}
      </div>
    </div>
  );
}
