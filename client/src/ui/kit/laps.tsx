import css from './laps.module.css';
import { LapSquares } from './lap-squares.tsx';

interface Props {
  /** Laps that rang: the "2" of "2 of 4". */
  laps: number;
  /** One number per square, oldest first. Left out, every lap that rang is a whole square. */
  squares?: number[];
  estimate: number | null;
  /** After the number: " of 4", or nothing when there is no estimate. */
  of: string;
}

/**
 * Laps as small squares with the count they picture at their right, in `figure-sm`. The two are
 * one thing and never part: a narrow row stands the pair at the right end of its project's line,
 * and on a line of its own only where that line is full or absent. Past the estimate nothing
 * changes colour.
 */
export function Laps({ laps, squares, estimate, of }: Props) {
  return (
    <span class={css.laps}>
      <LapSquares squares={squares ?? Array.from({ length: laps }, () => 1)} estimate={estimate} />
      {/* The words in a box one square tall, so they stand centred on the squares' first line. */}
      <span class={css.count}>
        <span>
          <b>{laps}</b>
          {of}
        </span>
      </span>
    </span>
  );
}
