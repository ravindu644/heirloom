import type { ComponentChildren } from 'preact';
import type { TaskView } from '../../sync/today.ts';
import { Check } from './check.tsx';
import { cx } from './cx.ts';
import { Laps } from './laps.tsx';
import { Square } from './square.tsx';
import css from './task-row.module.css';

interface Props {
  /** A task, or as much of one as a row shows. */
  task: Pick<TaskView, 'id' | 'title' | 'project' | 'estimate' | 'laps' | 'squares' | 'done'>;
  /** After the laps run: " of 4", or nothing when there is no estimate. */
  of: string;
  /** A few words after the squares: a date, "after dinner". */
  note?: string;
  /** The one to start next: outlined in you. */
  next?: boolean;
  /** At the row's end: a button. The squares and their count sit to its left, or under it where a title leaves them no room. */
  end?: ComponentChildren;
  /** What the box marks, for a screen reader. Left out with `onDone`, there is no box. */
  checkLabel?: string;
  onDone?: (done: boolean) => void;
  onOpen?: () => void;
  /** Two links or more for the row ("Restore", "Delete for good"): under the words where the row is narrow, at its end where there is room, so the title keeps the width. */
  links?: ComponentChildren;
  /** It can be put in order by pressing and holding (kit/lift.ts): the row is marked for it. */
  lift?: boolean;
}

/** A task as a row: the box, the title, its project and laps, and the count. The words open it. */
export function TaskRow({ task, of, note, next, end, links, checkLabel, onDone, onOpen, lift }: Props) {
  // The laps as squares, with the count they picture. They sit at the row's right, apart from the
  // project's square: side by side the two would read as one more lap.
  // They are drawn in two places, and the row's width says which shows: beside the title in a wide
  // row, and in a narrow one at the right end of the last line of the words.
  const laps = (task.laps > 0 || task.estimate !== null || task.squares.length > 0) && (() => <Laps laps={task.laps} squares={task.squares} estimate={task.estimate} of={of} />);
  const meta = !!(task.project || note);
  const words = (
    <>
      <span class={css.title}>{task.title}</span>
      {meta && (
        <span class={css.meta}>
          {task.project && (
            <span class={css.project}>
              {/* The square is never alone: the name follows it. */}
              <Square color={task.project.color} />
              {task.project.name}
            </span>
          )}
          {note && <span>{note}</span>}
        </span>
      )}
      {laps && <span class={css.under}>{laps()}</span>}
    </>
  );
  return (
    // The box round the row is what is measured, so the row itself can be laid out by its width: it wraps where it is very narrow.
    <div class={css.measure}>
    <div class={cx(css.row, next && css.next, task.done && css.done, !onDone && css.plain, !!end && css.trailed, !!links && css.linked, meta && css.lined)} data-lift={lift ? task.id : undefined}>
      {/* The box and the words are one piece: a row that breaks never parts them. */}
      <div class={css.lead}>
        {onDone && <Check checked={task.done} label={checkLabel ?? task.title} onChange={onDone} />}
        {onOpen ? (
          <button type="button" class={css.words} data-task={task.id} onClick={onOpen}>
            {words}
          </button>
        ) : (
          <div class={css.words}>{words}</div>
        )}
      </div>
      {(laps || end) && (
        <div class={cx(css.end, !end && css.solo)}>
          {laps && <span class={css.beside}>{laps()}</span>}
          {end}
        </div>
      )}
      {links && <div class={css.links}>{links}</div>}
      </div>
    </div>
  );
}
