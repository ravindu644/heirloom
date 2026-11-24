import type { ComponentChildren } from 'preact';
import type { TaskView } from '../../sync/today.ts';
import { Check } from './check.tsx';
import { cx } from './cx.ts';
import { LapSquares } from './lap-squares.tsx';
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
  /** At the row's end, where the laps otherwise are: a button, the move controls. The laps move under the title. */
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
  const laps = (task.laps > 0 || task.estimate !== null || task.squares.length > 0) && (
    <span class={css.laps}>
      <LapSquares squares={task.squares} estimate={task.estimate} />
      <span class={css.count}>
        <b>{task.laps}</b>
        {of}
      </span>
    </span>
  );
  const words = (
    <>
      <span class={css.title}>{task.title}</span>
      {(task.project || note || (end && laps)) && (
        <span class={css.meta}>
          {task.project && (
            <span class={css.project}>
              {/* The square is never alone: the name follows it. */}
              <i style={`background:var(--${task.project.color})`} />
              {task.project.name}
            </span>
          )}
          {note && <span>{note}</span>}
          {/* A button at the row's end takes the laps' place; they move here, to the far side of the line. */}
          {end && laps}
        </span>
      )}
    </>
  );
  return (
    <div class={cx(css.row, next && css.next, arriving && css.arriving, task.done && css.done, !onDone && css.plain)}>
      {onDone && <Check checked={task.done} label={checkLabel ?? task.title} onChange={onDone} />}
      {onOpen ? (
        <button type="button" class={css.words} data-task={task.id} onClick={onOpen}>
          {words}
        </button>
      ) : (
        <div class={css.words}>{words}</div>
      )}
      <div class={css.end}>{end ?? laps}</div>
    </div>
  );
}
